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
  const SUBMIT_DELAY_MS = 80;

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

  function pasteIntoComposer(composer, text) {
    composer.focus({ preventScroll: true });

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return replaceTextControlValue(composer, text);
    }
    if (!composer.isContentEditable) return false;

    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      composer.dispatchEvent(new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }));
      if ((composer.innerText || composer.textContent || "").trim()) return true;
    } catch {
      // Fall through to an editable-range insertion for browsers that block synthetic clipboard data.
    }

    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection.removeAllRanges();
    selection.addRange(range);

    if (document.execCommand("insertText", false, text)) return true;

    composer.textContent = text;
    composer.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: text,
    }));
    return Boolean((composer.innerText || composer.textContent || "").trim());
  }

  function findSendButton(composer) {
    const form = composer.closest("form");
    return form?.querySelector([
      'button[data-testid="send-button"]',
      'button[aria-label^="Send" i]',
      'button[type="submit"]',
    ].join(", ")) || null;
  }

  function submitWithEnter(composer) {
    const enterEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    });
    const enterHandled = !composer.dispatchEvent(enterEvent);
    composer.dispatchEvent(new KeyboardEvent("keyup", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
    }));

    if (enterHandled) return;
    const sendButton = findSendButton(composer);
    if (sendButton && !sendButton.disabled) sendButton.click();
  }

  function runClipboardHandoff() {
    handoffScheduled = false;
    if (!pendingClipboardText || handoffStarted || !isSpellcheckPage()) return;

    const composer = findComposerInput();
    if (!composer) return;
    if (!pasteIntoComposer(composer, pendingClipboardText)) return;

    handoffStarted = true;
    pendingClipboardText = null;
    window.setTimeout(() => submitWithEnter(composer), SUBMIT_DELAY_MS);
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
