(() => {
  const context = globalThis.__ghrcExtensionContext;
  if (!context?.active()) return;
  const ENABLED_KEY = "showClipboardSendButton";
  const BUTTON_ID = "ghrc-clipboard-send-button";

  let enabled = false;
  let mountScheduled = false;
  let actionRunning = false;

  function findComposerInput() {
    return document.querySelector('#prompt-textarea, [data-composer-markdown][contenteditable="true"]');
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
      if (!context.active()) return;
      const queued = await globalThis.__ghrcMessageQueue?.enqueueText(text);
      button.title = queued ? "Queue clipboard as prompt" : "Clipboard message could not be queued; try again";
    } catch (error) {
      if (["NotAllowedError", "SecurityError", "NotFoundError"].includes(error?.name)) {
        button.title = "Clipboard access unavailable; paste into the composer to queue your message";
      } else {
        context.handleError(error);
        button.title = "Clipboard message could not be queued; try again";
      }
    } finally {
      actionRunning = false;
      setButtonBusy(button, false);
      scheduleMount();
    }
  }

  function createButton() {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "Queue clipboard as prompt";
    button.setAttribute("aria-label", "Queue clipboard as prompt");
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
    if (!context.active()) return;
    mountScheduled = false;
    if (!enabled) {
      removeButton();
      return;
    }

    const composer = findComposerInput();
    const sendButton = globalThis.__ghrcMessageQueue?.findActionButton(composer);
    if (!composer || !sendButton?.parentElement) {
      removeButton();
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    if (!button) button = createButton();
    // Keep a stable order with the queue controls; competing "before Send"
    // observers otherwise move these buttons back and forth indefinitely.
    const queueButton = document.getElementById("ghrc-message-queue-button");
    const anchor = queueButton?.parentElement === sendButton.parentElement ? queueButton : sendButton;
    if (button.parentElement !== anchor.parentElement || button.nextElementSibling !== anchor) {
      anchor.before(button);
    }
    setButtonBusy(button, actionRunning);
  }

  function scheduleMount() {
    if (!context.active()) return;
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

  void context.run(async () => {
    const settings = await chrome.storage.local.get({ [ENABLED_KEY]: false });
    if (!context.active()) return;
    setEnabled(Boolean(settings[ENABLED_KEY]));
  });

  const observer = new MutationObserver(scheduleMount);
  context.onStop(() => { observer.disconnect(); removeButton(); });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
