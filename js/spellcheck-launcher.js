(() => {
  const LAUNCHER_ID = "ghrc-spellcheck-gpt-launcher";
  const HOST_ATTR = "data-ghrc-spellcheck-launcher-host";
  const ENABLED_KEY = "showSpellcheckGptLauncher";
  const LEGACY_ICON_KEY = "spellcheckGptCanonicalIcon";
  const GPT_NAME = "Spellcheck Only";
  const GPT_PATH = "/g/g-dyK63miav-spellcheck-only";
  const ICON_PATH = "artwork/spellcheck-only.png";
  const CLIPBOARD_HANDOFF_KEY = "ghrcSpellcheckClipboardHandoffV1";
  const CLIPBOARD_HANDOFF_MAX_AGE_MS = 30_000;
  const SUBMIT_RETRY_MS = 100;
  const SUBMIT_TIMEOUT_MS = 5_000;

  let enabled = false;
  let mountScheduled = false;
  let handoffScheduled = false;
  let handoffStarted = false;
  let pendingClipboardText = null;

  function isHomePage() {
    return location.pathname === "/";
  }

  function isSpellcheckPage() {
    return location.pathname === GPT_PATH || location.pathname.startsWith(`${GPT_PATH}/`);
  }

  function findComposerInput() {
    return document.querySelector("#prompt-textarea");
  }

  function findComposer() {
    const prompt = findComposerInput();
    if (!prompt) return null;
    return prompt.closest("form") || prompt.closest('[data-type="unified-composer"]');
  }

  function storeClipboardHandoff(text) {
    if (!text) {
      sessionStorage.removeItem(CLIPBOARD_HANDOFF_KEY);
      return;
    }

    sessionStorage.setItem(CLIPBOARD_HANDOFF_KEY, JSON.stringify({
      text,
      capturedAt: Date.now(),
    }));
  }

  function takeClipboardHandoff() {
    if (!isSpellcheckPage()) return null;

    const rawPayload = sessionStorage.getItem(CLIPBOARD_HANDOFF_KEY);
    if (!rawPayload) return null;
    sessionStorage.removeItem(CLIPBOARD_HANDOFF_KEY);

    try {
      const payload = JSON.parse(rawPayload);
      if (
        typeof payload?.text !== "string"
        || !payload.text
        || !Number.isFinite(payload.capturedAt)
        || Date.now() - payload.capturedAt > CLIPBOARD_HANDOFF_MAX_AGE_MS
      ) return null;
      return payload.text;
    } catch {
      return null;
    }
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
    return composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? composer.value
      : (composer.innerText || composer.textContent || "");
  }

  function matchesClipboard(composer, text) {
    // Contenteditable paragraphs may add a final line break to innerText.
    const normalize = (value) => value.replace(/\r\n/g, "\n").replace(/\n+$/, "");
    return normalize(composerText(composer)) === normalize(text);
  }

  function pasteIntoComposer(composer, text) {
    // Never replace or automatically submit a restored destination draft.
    if (composerText(composer).trim() || !text.trim()) return false;
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

    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      composer.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
      if (matchesClipboard(composer, text)) return true;
      // A partial paste must not be retried over existing content.
      if (composerText(composer).trim()) return false;
    } catch {
      // Fall through when synthetic clipboard data is unsupported.
    }

    document.execCommand("insertText", false, text);
    return matchesClipboard(composer, text);
  }

  function findSendButton(composer) {
    const form = composer.closest("form") || composer.closest('[data-type="unified-composer"]');
    return form?.querySelector([
      'button[data-testid="send-button"]',
      'button[aria-label^="Send" i]',
      'button[type="submit"]',
    ].join(", ")) || null;
  }

  function submitWhenReady(composer, text, deadline) {
    if (
      Date.now() >= deadline
      || !isSpellcheckPage()
      || !composer.isConnected
      || findComposerInput() !== composer
      || !matchesClipboard(composer, text)
    ) return;

    const sendButton = findSendButton(composer);
    if (sendButton && !sendButton.disabled && sendButton.getAttribute("aria-disabled") !== "true") {
      // Use one explicit send action; canceled Enter events do not prove submission.
      sendButton.click();
      return;
    }
    window.setTimeout(() => submitWhenReady(composer, text, deadline), SUBMIT_RETRY_MS);
  }

  function runClipboardHandoff() {
    handoffScheduled = false;
    if (!pendingClipboardText || handoffStarted || !isSpellcheckPage()) return;

    const composer = findComposerInput();
    if (!composer) return;
    const text = pendingClipboardText;
    handoffStarted = true;
    pendingClipboardText = null;
    if (!pasteIntoComposer(composer, text)) return;

    const deadline = Date.now() + SUBMIT_TIMEOUT_MS;
    window.setTimeout(() => submitWhenReady(composer, text, deadline), SUBMIT_RETRY_MS);
  }

  function scheduleClipboardHandoff() {
    if (handoffScheduled || handoffStarted || !pendingClipboardText) return;
    handoffScheduled = true;
    requestAnimationFrame(runClipboardHandoff);
  }

  function removeLauncher() {
    document.getElementById(LAUNCHER_ID)?.remove();
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((host) => {
      host.removeAttribute(HOST_ATTR);
    });
  }

  function createLauncher() {
    const button = document.createElement("button");
    button.id = LAUNCHER_ID;
    button.type = "button";
    button.title = `Open ${GPT_NAME}`;
    button.setAttribute("aria-label", `Open ${GPT_NAME} GPT`);

    const image = document.createElement("img");
    image.src = chrome.runtime.getURL(ICON_PATH);
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.append(image);

    button.addEventListener("click", async () => {
      sessionStorage.removeItem(CLIPBOARD_HANDOFF_KEY);
      try {
        storeClipboardHandoff(await navigator.clipboard.readText());
      } catch (error) {
        console.warn("Spellcheck Only could not read the system clipboard:", error);
      }
      location.assign(GPT_PATH);
    });

    return button;
  }

  function mountLauncher() {
    scheduleClipboardHandoff();

    if (!enabled || !isHomePage()) {
      removeLauncher();
      return;
    }

    const composer = findComposer();
    if (!composer) return;

    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher || launcher.parentElement !== composer) {
      launcher?.remove();
      launcher = createLauncher();
      composer.append(launcher);
    }
    composer.setAttribute(HOST_ATTR, "true");
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      mountLauncher();
    });
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get({ [ENABLED_KEY]: false });
    enabled = Boolean(settings[ENABLED_KEY]);
    await chrome.storage.local.remove(LEGACY_ICON_KEY);
    scheduleMount();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_KEY]) return;
    enabled = Boolean(changes[ENABLED_KEY].newValue);
    scheduleMount();
  });

  pendingClipboardText = takeClipboardHandoff();
  void loadSettings();
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
