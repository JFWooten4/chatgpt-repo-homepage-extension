(() => {
  const ENABLED_KEY = "showClipboardSendButton";
  const BUTTON_ID = "ghrc-clipboard-send-button";
  const SUBMIT_RETRY_MS = 100;
  const SUBMIT_TIMEOUT_MS = 5_000;

  let enabled = false;
  let mountScheduled = false;
  let actionRunning = false;

  function findComposerInput() {
    return document.querySelector("#prompt-textarea");
  }

  function isVisible(element) {
    return Boolean(element?.isConnected && element.getClientRects().length);
  }

  function findSendButton(composer = findComposerInput()) {
    if (!composer) return null;
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label^="Send" i]',
      'button#composer-submit-button:not([data-testid="stop-button"]):not([aria-label*="Stop" i]):not([aria-label*="voice" i])',
    ];

    for (let container = composer.parentElement; container; container = container.parentElement) {
      for (const selector of selectors) {
        const button = [...container.querySelectorAll(selector)].find(isVisible);
        if (button) return button;
      }
      if (container.matches("main, body")) break;
    }

    const form = composer.closest("form");
    return [...(form?.querySelectorAll('button[type="submit"]') || [])]
      .find((button) => isVisible(button) && button.getAttribute("data-testid") !== "stop-button") || null;
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
      inputType: "insertText",
      data: text,
    }));
    return control.value === text;
  }

  function composerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return composer.value;
    }

    const paragraphs = [...(composer.children || [])];
    if (paragraphs.length && paragraphs.every((node) => node.tagName === "P")) {
      const readNode = (node) => {
        if (node.nodeType === 3) return node.nodeValue || "";
        if (node.nodeName === "BR") {
          return node.classList.contains("ProseMirror-trailingBreak") ? "" : "\n";
        }
        return [...node.childNodes].map(readNode).join("");
      };
      return paragraphs.map(readNode).join("\n");
    }

    return composer.innerText || composer.textContent || "";
  }

  function matchesClipboard(composer, text) {
    const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\n+$/, "");
    return normalize(composerText(composer)) === normalize(text);
  }

  async function waitForClipboard(composer, text) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (!composer.isConnected || findComposerInput() !== composer) return false;
      if (matchesClipboard(composer, text)) return true;
    }
    return false;
  }

  async function pasteIntoComposer(composer, text) {
    if (!text.trim()) return false;
    if (matchesClipboard(composer, text)) return true;

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
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      const unhandled = composer.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
      if (!unhandled) return waitForClipboard(composer, text);
      await new Promise((resolve) => window.setTimeout(resolve, 50));
      if (matchesClipboard(composer, text)) return true;
      if (composerText(composer).trim()) return false;
    } catch {
      // Fall back to insertText when synthetic clipboard data is unsupported.
    }

    document.execCommand("insertText", false, text);
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    return matchesClipboard(composer, text);
  }

  function submitWhenReady(composer, text, deadline) {
    if (
      Date.now() >= deadline
      || !composer.isConnected
      || findComposerInput() !== composer
      || !matchesClipboard(composer, text)
    ) {
      actionRunning = false;
      scheduleMount();
      return;
    }

    const sendButton = findSendButton(composer);
    if (sendButton && !sendButton.disabled && sendButton.getAttribute("aria-disabled") !== "true") {
      sendButton.click();
      actionRunning = false;
      scheduleMount();
      return;
    }

    window.setTimeout(() => submitWhenReady(composer, text, deadline), SUBMIT_RETRY_MS);
  }

  function setButtonBusy(button, busy) {
    button.disabled = busy;
    button.toggleAttribute("aria-busy", busy);
  }

  async function sendClipboardPrompt(button) {
    if (actionRunning) return;
    actionRunning = true;
    setButtonBusy(button, true);

    try {
      const text = await navigator.clipboard.readText();
      const composer = findComposerInput();
      if (!composer || !text.trim() || !await pasteIntoComposer(composer, text)) {
        actionRunning = false;
        setButtonBusy(button, false);
        return;
      }

      const deadline = Date.now() + SUBMIT_TIMEOUT_MS;
      window.setTimeout(() => submitWhenReady(composer, text, deadline), SUBMIT_RETRY_MS);
    } catch (error) {
      console.warn("Clipboard prompt button could not read the system clipboard:", error);
      actionRunning = false;
      setButtonBusy(button, false);
    }
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Send clipboard as prompt";
    button.setAttribute("aria-label", "Send clipboard as prompt");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3M9 3h6v4H9V3Zm1 10h7m0 0-3-3m3 3-3 3" />
      </svg>
    `;
    button.addEventListener("click", () => void sendClipboardPrompt(button));
    return button;
  }

  function removeButton() {
    document.getElementById(BUTTON_ID)?.remove();
  }

  function mountButton() {
    mountScheduled = false;
    if (!enabled) {
      removeButton();
      return;
    }

    const composer = findComposerInput();
    const sendButton = findSendButton(composer);
    if (!composer || !sendButton?.parentElement) {
      removeButton();
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    if (!button) button = createButton();
    if (button.parentElement !== sendButton.parentElement || button.nextElementSibling !== sendButton) {
      sendButton.before(button);
    }
    setButtonBusy(button, actionRunning);
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(mountButton);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (!enabled) removeButton();
    else scheduleMount();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_KEY]) return;
    setEnabled(Boolean(changes[ENABLED_KEY].newValue));
  });

  void chrome.storage.local.get({ [ENABLED_KEY]: false }).then((settings) => {
    setEnabled(Boolean(settings[ENABLED_KEY]));
  });

  new MutationObserver(scheduleMount).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
