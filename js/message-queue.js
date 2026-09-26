(() => {
  "use strict";

  const STORAGE_KEY = "queuedChatMessages";
  const PANEL_ID = "ghrc-message-queue";
  const QUEUE_BUTTON_ID = "ghrc-message-queue-button";
  const COMPLETE_SETTLE_MS = 1_500;
  const PUMP_INTERVAL_MS = 250;
  const SUBMIT_TIMEOUT_MS = 5_000;
  const SAVE_DEBOUNCE_MS = 180;

  const pageSessionId = globalThis.crypto?.randomUUID?.()
    || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let activeKey = conversationKey();
  let queue = [];
  let storageState = {};
  let routeSyncRunning = false;
  let lastHref = location.href;
  let mountScheduled = false;
  let pumpScheduled = false;
  let completionCandidateSince = null;
  let sendingItemId = null;
  let saveTimer = null;
  let autoSubmitting = false;

  function conversationIdFromPath(pathname = location.pathname) {
    return String(pathname || "").match(/^\/c\/([^/?#]+)/i)?.[1] || "";
  }

  function conversationKey(pathname = location.pathname) {
    const conversationId = conversationIdFromPath(pathname);
    return conversationId ? `conversation:${conversationId}` : `new:${pageSessionId}`;
  }

  function normalizedText(value) {
    return typeof value === "string" ? value.replace(/\r\n/g, "\n") : "";
  }

  function normalizeQueueItems(items) {
    if (!Array.isArray(items)) return [];

    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const text = normalizedText(item.text);
      if (!text.trim()) return [];
      return [{
        id: typeof item.id === "string" && item.id
          ? item.id
          : `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      }];
    });
  }

  function queueCanAdvance(snapshot, settledMs) {
    if (!snapshot?.roleStateKnown) return false;
    if (snapshot.responseActive || !snapshot.sendReady) return false;
    if (snapshot.userTurns > snapshot.assistantTurns) return false;
    if (snapshot.userTurns > 0 && !snapshot.latestAssistantComplete) return false;
    return settledMs >= COMPLETE_SETTLE_MS;
  }

  function shouldQueueComposerEnter(event, responseActive, queuedCount) {
    return Boolean(
      event
      && event.key === "Enter"
      && !event.shiftKey
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.isComposing
      && (responseActive || queuedCount > 0)
    );
  }

  const testApi = {
    COMPLETE_SETTLE_MS,
    conversationIdFromPath,
    normalizeQueueItems,
    queueCanAdvance,
    shouldQueueComposerEnter,
  };

  if (globalThis.__GHRC_TEST__) {
    Object.assign(globalThis.__GHRC_TEST__, testApi);
    return;
  }

  function isVisible(element) {
    return Boolean(element?.isConnected && element.getClientRects().length);
  }

  function findComposerInput() {
    return document.querySelector("#prompt-textarea");
  }

  function findComposerForm(composer = findComposerInput()) {
    return composer?.closest("form")
      || composer?.closest('[data-type="unified-composer"]')
      || null;
  }

  function findActionButton(composer = findComposerInput()) {
    const form = findComposerForm(composer);
    if (!composer || !form) return null;

    const selectors = [
      'button[data-testid="stop-button"]',
      'button[data-testid="send-button"]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label^="Send" i]',
      'button#composer-submit-button',
      'button[type="submit"]',
    ];

    for (const selector of selectors) {
      const button = [...form.querySelectorAll(selector)].find(isVisible);
      if (button) return button;
    }
    return null;
  }

  function findSendButton(composer = findComposerInput()) {
    const form = findComposerForm(composer);
    if (!composer || !form) return null;

    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label^="Send" i]',
      'button#composer-submit-button:not([data-testid="stop-button"]):not([aria-label*="Stop" i]):not([aria-label*="voice" i])',
    ];

    for (const selector of selectors) {
      const button = [...form.querySelectorAll(selector)].find(isVisible);
      if (button) return button;
    }

    return [...form.querySelectorAll('button[type="submit"]')]
      .find((button) => (
        isVisible(button)
        && button.getAttribute("data-testid") !== "stop-button"
        && !/stop/i.test(button.getAttribute("aria-label") || "")
      )) || null;
  }

  function responseIsActive(composer = findComposerInput()) {
    const form = findComposerForm(composer);
    const selectors = [
      'button[data-testid="stop-button"]',
      'button[data-testid*="stop" i]',
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="Stop response" i]',
      'button[aria-label="Stop" i]',
    ];

    const root = form || document;
    return selectors.some((selector) =>
      [...root.querySelectorAll(selector)].some(isVisible)
    );
  }

  function composerText(composer = findComposerInput()) {
    if (!composer) return "";
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return composer.value;
    }

    const paragraphs = [...(composer.children || [])];
    if (paragraphs.length && paragraphs.every((node) => node.tagName === "P")) {
      const readNode = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || "";
        if (node.nodeName === "BR") {
          return node.classList.contains("ProseMirror-trailingBreak") ? "" : "\n";
        }
        return [...node.childNodes].map(readNode).join("");
      };
      return paragraphs.map(readNode).join("\n");
    }

    return composer.innerText || composer.textContent || "";
  }

  function textMatchesComposer(composer, text) {
    const normalize = (value) => normalizedText(value).replace(/\n+$/, "");
    return normalize(composerText(composer)) === normalize(text);
  }

  function replaceTextControlValue(control, text) {
    const prototype = control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!setter) return false;

    setter.call(control, text);
    control.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: text ? "insertText" : "deleteContentBackward",
      data: text || null,
    }));
    return control.value === text;
  }

  async function replaceComposerText(composer, text) {
    if (!composer) return false;
    if (textMatchesComposer(composer, text)) return true;

    composer.focus({ preventScroll: true });

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return replaceTextControlValue(composer, text);
    }

    if (!composer.isContentEditable) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);

    if (!text) {
      document.execCommand("delete");
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "deleteContentBackward",
        data: null,
      }));
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      return !composerText(composer).trim();
    }

    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      const unhandled = composer.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
      if (!unhandled) {
        await new Promise((resolve) => window.setTimeout(resolve, 60));
        if (textMatchesComposer(composer, text)) return true;
      }
    } catch {
      // Fall through to insertText for browsers that reject synthetic clipboard data.
    }

    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return textMatchesComposer(composer, text);
  }

  function roleTurns(role) {
    const roleNodes = [...document.querySelectorAll(
      `[data-message-author-role="${role}"]`
    )];
    const turns = [];
    const seen = new Set();

    for (const node of roleNodes) {
      const turn = node.closest('[data-testid^="conversation-turn-"]')
        || node.closest("article")
        || node;
      if (!seen.has(turn)) {
        seen.add(turn);
        turns.push(turn);
      }
    }
    return turns;
  }

  function latestAssistantIsComplete(assistantTurns) {
    const latest = assistantTurns[assistantTurns.length - 1];
    if (!latest) return false;

    const completionSelectors = [
      '[data-message-status="finished"]',
      '[data-state="complete"]',
      'button[data-testid="copy-turn-action-button"]',
      'button[data-testid*="copy" i]',
      'button[aria-label^="Copy" i]',
      'button[aria-label*="Good response" i]',
      'button[aria-label*="Bad response" i]',
      'button[aria-label*="Regenerate" i]',
    ];

    return completionSelectors.some((selector) =>
      Boolean(latest.matches?.(selector) || latest.querySelector?.(selector))
    );
  }

  function lifecycleSnapshot() {
    const composer = findComposerInput();
    const sendButton = findSendButton(composer);
    const userTurns = roleTurns("user");
    const assistantTurns = roleTurns("assistant");
    const turnCount = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
    const roleStateKnown = turnCount === 0 || userTurns.length + assistantTurns.length > 0;

    return {
      responseActive: responseIsActive(composer),
      sendReady: Boolean(
        sendButton
        && !sendButton.disabled
        && sendButton.getAttribute("aria-disabled") !== "true"
      ),
      userTurns: userTurns.length,
      assistantTurns: assistantTurns.length,
      latestAssistantComplete: latestAssistantIsComplete(assistantTurns),
      roleStateKnown,
    };
  }

  function itemId() {
    return globalThis.crypto?.randomUUID?.()
      || `queued-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function storageCopy() {
    return queue.map(({ id, text, createdAt }) => ({ id, text, createdAt }));
  }

  async function persistQueue() {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }

    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
    const next = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
      ? { ...stored[STORAGE_KEY] }
      : {};

    if (queue.length) next[activeKey] = storageCopy();
    else delete next[activeKey];

    storageState = next;
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
  }

  function schedulePersist() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveTimer = null;
      void persistQueue();
    }, SAVE_DEBOUNCE_MS);
  }

  async function loadQueueState() {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
    storageState = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
      ? stored[STORAGE_KEY]
      : {};
    queue = normalizeQueueItems(storageState[activeKey]);
    renderQueue();
    scheduleMount();
    schedulePump();
  }

  async function syncConversationKey() {
    if (routeSyncRunning) return;
    const nextKey = conversationKey();
    if (nextKey === activeKey) return;

    routeSyncRunning = true;
    try {
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
        await persistQueue();
      }

      const previousKey = activeKey;
      const stored = await chrome.storage.local.get({ [STORAGE_KEY]: {} });
      const nextState = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
        ? { ...stored[STORAGE_KEY] }
        : {};
      const previousItems = normalizeQueueItems(nextState[previousKey]);
      const nextItems = normalizeQueueItems(nextState[nextKey]);

      if (
        previousKey.startsWith("new:")
        && nextKey.startsWith("conversation:")
        && previousItems.length
      ) {
        nextState[nextKey] = [...previousItems, ...nextItems];
        delete nextState[previousKey];
        await chrome.storage.local.set({ [STORAGE_KEY]: nextState });
      }

      activeKey = nextKey;
      storageState = nextState;
      queue = normalizeQueueItems(nextState[nextKey]);
      completionCandidateSince = null;
      renderQueue();
      scheduleMount();
      schedulePump();
    } finally {
      routeSyncRunning = false;
    }
  }

  function autosizeTextarea(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(180, Math.max(44, textarea.scrollHeight))}px`;
  }

  function moveItem(id, direction) {
    const index = queue.findIndex((item) => item.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= queue.length) return;
    [queue[index], queue[target]] = [queue[target], queue[index]];
    void persistQueue();
    renderQueue();
    schedulePump();
  }

  function removeItem(id) {
    queue = queue.filter((item) => item.id !== id);
    void persistQueue();
    renderQueue();
    schedulePump();
  }

  function createItemRow(item, index) {
    const row = document.createElement("article");
    row.className = "ghrc-message-queue-item";
    row.dataset.queueId = item.id;
    if (item.id === sendingItemId) row.dataset.sending = "true";

    const ordinal = document.createElement("span");
    ordinal.className = "ghrc-message-queue-index";
    ordinal.textContent = index === 0 ? "Next" : String(index + 1);

    const textarea = document.createElement("textarea");
    textarea.className = "ghrc-message-queue-editor";
    textarea.value = item.text;
    textarea.rows = 1;
    textarea.spellcheck = true;
    textarea.disabled = item.id === sendingItemId;
    textarea.setAttribute("aria-label", `Queued message ${index + 1}`);
    textarea.addEventListener("input", () => {
      const target = queue.find((candidate) => candidate.id === item.id);
      if (!target) return;
      target.text = textarea.value;
      autosizeTextarea(textarea);
      schedulePersist();
    });
    requestAnimationFrame(() => autosizeTextarea(textarea));

    const controls = document.createElement("div");
    controls.className = "ghrc-message-queue-controls";

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.title = "Move earlier";
    up.setAttribute("aria-label", "Move queued message earlier");
    up.disabled = index === 0 || item.id === sendingItemId;
    up.addEventListener("click", () => moveItem(item.id, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.title = "Move later";
    down.setAttribute("aria-label", "Move queued message later");
    down.disabled = index === queue.length - 1 || item.id === sendingItemId;
    down.addEventListener("click", () => moveItem(item.id, 1));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "Remove queued message";
    remove.setAttribute("aria-label", "Remove queued message");
    remove.disabled = item.id === sendingItemId;
    remove.addEventListener("click", () => removeItem(item.id));

    controls.append(up, down, remove);
    row.append(ordinal, textarea, controls);
    return row;
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.setAttribute("aria-label", "Queued messages");

    const header = document.createElement("header");
    header.className = "ghrc-message-queue-header";

    const title = document.createElement("strong");
    title.className = "ghrc-message-queue-title";

    const status = document.createElement("span");
    status.className = "ghrc-message-queue-status";
    status.textContent = "Sends after the current response fully completes";

    header.append(title, status);

    const list = document.createElement("div");
    list.className = "ghrc-message-queue-list";
    panel.append(header, list);
    return panel;
  }

  function renderQueue() {
    let panel = document.getElementById(PANEL_ID);
    if (!queue.length) {
      panel?.remove();
      return;
    }

    if (!panel) panel = createPanel();
    const title = panel.querySelector(".ghrc-message-queue-title");
    const list = panel.querySelector(".ghrc-message-queue-list");
    title.textContent = `Queued · ${queue.length}`;
    list.replaceChildren(...queue.map(createItemRow));

    const form = findComposerForm();
    if (form?.parentElement && panel.parentElement !== form.parentElement) {
      form.parentElement.insertBefore(panel, form);
    } else if (form && panel.nextElementSibling !== form) {
      form.before(panel);
    }

  }

  function createQueueButton() {
    const button = document.createElement("button");
    button.id = QUEUE_BUTTON_ID;
    button.type = "button";
    button.title = "Queue current message";
    button.setAttribute("aria-label", "Queue current message");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 6h10M7 11h10M7 16h6M18 14v6m-3-3h6" />
      </svg>
      <span class="ghrc-message-queue-badge" aria-hidden="true"></span>
    `;
    button.addEventListener("click", () => {
      void enqueueComposerMessage();
    });
    return button;
  }

  function mountQueueUi() {
    mountScheduled = false;
    const composer = findComposerInput();
    const actionButton = findActionButton(composer);
    if (!composer || !actionButton?.parentElement) {
      document.getElementById(QUEUE_BUTTON_ID)?.remove();
      return;
    }

    let button = document.getElementById(QUEUE_BUTTON_ID);
    if (!button) button = createQueueButton();

    const badge = button.querySelector(".ghrc-message-queue-badge");
    badge.textContent = queue.length ? String(queue.length) : "";
    badge.hidden = queue.length === 0;
    button.title = queue.length
      ? `Queue current message (${queue.length} waiting)`
      : "Queue current message";

    if (button.parentElement !== actionButton.parentElement || button.nextElementSibling !== actionButton) {
      actionButton.before(button);
    }

    if (queue.length) {
      const panel = document.getElementById(PANEL_ID);
      const form = findComposerForm(composer);
      if (!panel) {
        renderQueue();
      } else if (form?.parentElement && panel.parentElement !== form.parentElement) {
        form.parentElement.insertBefore(panel, form);
      } else if (form && panel.nextElementSibling !== form) {
        form.before(panel);
      }
    }
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(mountQueueUi);
  }

  async function enqueueComposerMessage() {
    const composer = findComposerInput();
    const text = normalizedText(composerText(composer));
    if (!composer || !text.trim()) return false;

    if (!await replaceComposerText(composer, "")) return false;

    queue.push({
      id: itemId(),
      text,
      createdAt: Date.now(),
    });
    completionCandidateSince = null;
    await persistQueue();
    renderQueue();
    schedulePump();
    composer.focus({ preventScroll: true });
    return true;
  }

  async function waitForSubmission(composer, originalText, beforeUserTurns) {
    const deadline = Date.now() + SUBMIT_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
      const userTurns = roleTurns("user").length;
      if (userTurns > beforeUserTurns) return true;
      if (!textMatchesComposer(composer, originalText) && responseIsActive()) return true;
    }
    return false;
  }

  async function sendQueueHead() {
    if (sendingItemId || !queue.length) return;

    const item = queue[0];
    if (!item.text.trim()) {
      queue.shift();
      await persistQueue();
      renderQueue();
      schedulePump();
      return;
    }

    const composer = findComposerInput();
    if (!composer || composerText(composer).trim()) return;

    sendingItemId = item.id;
    renderQueue();

    try {
      const beforeUserTurns = roleTurns("user").length;
      if (!await replaceComposerText(composer, item.text)) return;

      const deadline = Date.now() + SUBMIT_TIMEOUT_MS;
      let sendButton = findSendButton(composer);
      while (
        Date.now() < deadline
        && (
          !sendButton
          || sendButton.disabled
          || sendButton.getAttribute("aria-disabled") === "true"
        )
      ) {
        await new Promise((resolve) => window.setTimeout(resolve, 80));
        sendButton = findSendButton(composer);
      }

      if (
        !sendButton
        || sendButton.disabled
        || sendButton.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      autoSubmitting = true;
      sendButton.click();
      autoSubmitting = false;

      if (!await waitForSubmission(composer, item.text, beforeUserTurns)) return;

      if (queue[0]?.id === item.id) queue.shift();
      else queue = queue.filter((candidate) => candidate.id !== item.id);
      completionCandidateSince = null;
      await persistQueue();
    } finally {
      autoSubmitting = false;
      sendingItemId = null;
      renderQueue();
      scheduleMount();
      schedulePump();
    }
  }

  function evaluatePump() {
    pumpScheduled = false;
    if (!queue.length || sendingItemId) {
      completionCandidateSince = null;
      return;
    }

    const composer = findComposerInput();
    if (!composer || composerText(composer).trim()) {
      completionCandidateSince = null;
      return;
    }

    const snapshot = lifecycleSnapshot();
    const structurallyReady = queueCanAdvance(snapshot, COMPLETE_SETTLE_MS);
    if (!structurallyReady) {
      completionCandidateSince = null;
      return;
    }

    if (completionCandidateSince === null) {
      completionCandidateSince = Date.now();
      return;
    }

    const settledMs = Date.now() - completionCandidateSince;
    if (!queueCanAdvance(snapshot, settledMs)) return;
    void sendQueueHead();
  }

  function schedulePump() {
    if (pumpScheduled) return;
    pumpScheduled = true;
    requestAnimationFrame(evaluatePump);
  }

  document.addEventListener("keydown", (event) => {
    const composer = event.target?.closest?.("#prompt-textarea");
    if (!composer || composer !== findComposerInput()) return;
    if (!shouldQueueComposerEnter(event, responseIsActive(composer), queue.length)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void enqueueComposerMessage();
  }, true);

  document.addEventListener("click", (event) => {
    if (autoSubmitting || !queue.length) return;
    const sendButton = event.target?.closest?.(
      'button[data-testid="send-button"], button[aria-label^="Send" i]'
    );
    if (!sendButton || sendButton !== findSendButton()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void enqueueComposerMessage();
  }, true);

  document.addEventListener("input", (event) => {
    if (event.target?.closest?.("#prompt-textarea")) scheduleMount();
  }, true);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[STORAGE_KEY]) return;

    const nextState = changes[STORAGE_KEY].newValue;
    if (!nextState || typeof nextState !== "object") return;
    const nextQueue = normalizeQueueItems(nextState[activeKey]);
    if (JSON.stringify(nextQueue) === JSON.stringify(storageCopy())) return;

    storageState = nextState;
    queue = nextQueue;
    completionCandidateSince = null;
    renderQueue();
    schedulePump();
  });

  const observer = new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      void syncConversationKey();
    }
    scheduleMount();
    schedulePump();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-disabled", "data-testid", "data-message-status", "data-state"],
  });

  window.setInterval(schedulePump, PUMP_INTERVAL_MS);
  window.addEventListener("popstate", () => void syncConversationKey());
  window.addEventListener("pageshow", () => {
    void syncConversationKey();
    scheduleMount();
    schedulePump();
  });

  void loadQueueState();
})();
