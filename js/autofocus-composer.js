(() => {
  const SETTING_KEY = "autoFocusComposer";
  const HOMEPAGE_BOOT_ATTR = "data-ghrc-homepage-booting";
  const COMPOSER_READY_ATTR = "data-ghrc-composer-ready";
  const CONFIRM_DELAY_MS = 160;
  const RETRY_DELAYS_MS = [0, 320, 900];
  let enabled = false;
  let pendingFocus = true;
  let lastUrl = location.href;
  let focusScheduled = false;
  let focusGeneration = 0;
  let confirmationTimer = null;
  const retryTimers = new Set();

  function findComposerInput() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt || !prompt.isConnected) return null;
    if (prompt.matches(":disabled") || prompt.getAttribute("aria-disabled") === "true") {
      return null;
    }
    if (prompt.getClientRects().length === 0) return null;
    return prompt;
  }

  function composerHasFocus(composer) {
    return document.activeElement === composer || composer.contains(document.activeElement);
  }

  function hasBlockingDialog() {
    return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
  }

  function focusComposer() {
    if (!enabled || !pendingFocus || document.visibilityState === "hidden") return;
    if (document.documentElement.hasAttribute(HOMEPAGE_BOOT_ATTR)) return;
    if (hasBlockingDialog()) return;

    const composer = findComposerInput();
    if (!composer) return;

    if (!composerHasFocus(composer)) composer.focus({ preventScroll: true });
    if (!composerHasFocus(composer) || confirmationTimer !== null) return;

    const generation = focusGeneration;
    confirmationTimer = window.setTimeout(() => {
      confirmationTimer = null;
      if (generation !== focusGeneration || !pendingFocus) return;

      const currentComposer = findComposerInput();
      if (!currentComposer || !composerHasFocus(currentComposer)) {
        scheduleFocus();
        return;
      }

      pendingFocus = false;
      document.documentElement.setAttribute(COMPOSER_READY_ATTR, "true");
    }, CONFIRM_DELAY_MS);
  }

  function checkForNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      beginFocusCycle();
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

  function clearFocusTimers() {
    if (confirmationTimer !== null) {
      clearTimeout(confirmationTimer);
      confirmationTimer = null;
    }
    retryTimers.forEach(clearTimeout);
    retryTimers.clear();
  }

  function beginFocusCycle() {
    focusGeneration += 1;
    clearFocusTimers();
    document.documentElement.removeAttribute(COMPOSER_READY_ATTR);
    pendingFocus = enabled;
    if (!enabled) {
      document.documentElement.setAttribute(COMPOSER_READY_ATTR, "true");
      return;
    }

    RETRY_DELAYS_MS.forEach((delay) => {
      const timer = window.setTimeout(() => {
        retryTimers.delete(timer);
        scheduleFocus();
      }, delay);
      retryTimers.add(timer);
    });
  }

  function cancelFocusCycleForUserInput(event) {
    if (!pendingFocus || !event.isTrusted) return;

    const composer = findComposerInput();
    if (composer && (event.target === composer || composer.contains(event.target))) return;

    pendingFocus = false;
    focusGeneration += 1;
    clearFocusTimers();
    document.documentElement.setAttribute(COMPOSER_READY_ATTR, "true");
  }

  async function loadPreference() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: true });
    enabled = Boolean(settings[SETTING_KEY]);
    beginFocusCycle();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;

    enabled = Boolean(changes[SETTING_KEY].newValue);
    beginFocusCycle();
  });

  window.addEventListener("pageshow", () => {
    beginFocusCycle();
  });

  window.addEventListener("popstate", () => {
    lastUrl = location.href;
    beginFocusCycle();
  });

  window.addEventListener("hashchange", () => {
    lastUrl = location.href;
    beginFocusCycle();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && pendingFocus) scheduleFocus();
  });

  document.addEventListener("pointerdown", cancelFocusCycleForUserInput, true);
  document.addEventListener("keydown", cancelFocusCycleForUserInput, true);

  const observer = new MutationObserver(scheduleFocus);
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [HOMEPAGE_BOOT_ATTR],
  });

  void loadPreference();
})();
