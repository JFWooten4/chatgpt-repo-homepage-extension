(() => {
  const SETTING_KEY = "autoFocusComposer";
  let enabled = false;
  let pendingFocus = true;
  let lastUrl = location.href;
  let focusScheduled = false;

  function findComposerInput() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt || !prompt.isConnected) return null;
    if (prompt.matches(":disabled") || prompt.getAttribute("aria-disabled") === "true") {
      return null;
    }
    if (prompt.getClientRects().length === 0) return null;
    return prompt;
  }

  function anotherEditableHasFocus(composer) {
    const active = document.activeElement;
    if (!active || active === document.body || active === document.documentElement) return false;
    if (active === composer || composer.contains(active)) return false;
    return active.matches?.('input, textarea, select, [contenteditable="true"]') ?? false;
  }

  function hasBlockingDialog() {
    return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
  }

  function focusComposer() {
    if (!enabled || !pendingFocus || document.visibilityState === "hidden") return;
    if (hasBlockingDialog()) return;

    const composer = findComposerInput();
    if (!composer) return;

    if (anotherEditableHasFocus(composer)) {
      pendingFocus = false;
      return;
    }

    composer.focus({ preventScroll: true });
    if (document.activeElement === composer || composer.contains(document.activeElement)) {
      pendingFocus = false;
    }
  }

  function checkForNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      pendingFocus = true;
    }
  }

  function scheduleFocus() {
    if (focusScheduled) return;
    focusScheduled = true;

    requestAnimationFrame(() => {
      focusScheduled = false;
      checkForNavigation();
      focusComposer();
    });
  }

  async function loadPreference() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: true });
    enabled = Boolean(settings[SETTING_KEY]);
    pendingFocus = enabled;
    if (enabled) scheduleFocus();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;

    enabled = Boolean(changes[SETTING_KEY].newValue);
    pendingFocus = enabled;
    if (enabled) scheduleFocus();
  });

  window.addEventListener("pageshow", () => {
    pendingFocus = enabled;
    scheduleFocus();
  });

  window.addEventListener("popstate", () => {
    lastUrl = location.href;
    pendingFocus = enabled;
    scheduleFocus();
  });

  window.addEventListener("hashchange", () => {
    lastUrl = location.href;
    pendingFocus = enabled;
    scheduleFocus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingFocus) scheduleFocus();
  });

  const observer = new MutationObserver(scheduleFocus);
  observer.observe(document, { childList: true, subtree: true });

  void loadPreference();
})();
