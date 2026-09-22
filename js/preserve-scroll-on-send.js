(() => {
  "use strict";

  const SETTING_KEY = "preserveScrollPositionOnSend";
  const SEND_BUTTON_SELECTOR = [
    'button[data-testid="send-button"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="submit" i]',
  ].join(",");
  const COMPOSER_SELECTOR = '#prompt-textarea, [contenteditable="true"]';
  const USER_SCROLL_KEYS = new Set([
    "ArrowUp",
    "ArrowDown",
    "PageUp",
    "PageDown",
    "Home",
    "End",
    " ",
  ]);

  let enabled = false;
  let guard = null;
  let restoreScheduled = false;

  function isScrollableElement(element) {
    if (!element || element.scrollHeight <= element.clientHeight + 1) return false;
    try {
      const overflowY = getComputedStyle(element).overflowY;
      return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
    } catch {
      return false;
    }
  }

  function scrollableAncestor(node) {
    let element = node instanceof Element ? node : node?.parentElement;
    while (element) {
      if (isScrollableElement(element)) return element;
      element = element.parentElement;
    }
    return null;
  }

  function findConversationScrollContainer() {
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    const lastTurn = turns[turns.length - 1];
    const turnScroller = scrollableAncestor(lastTurn);
    if (turnScroller) return turnScroller;

    const mainScroller = scrollableAncestor(document.querySelector("main, [role='main']"));
    if (mainScroller) return mainScroller;

    const candidates = [...document.querySelectorAll(
      'main, [role="main"], [class*="overflow-y-auto"], [class*="overflow-auto"]',
    )].filter(isScrollableElement);

    if (candidates.length) {
      return candidates.reduce((best, candidate) => {
        const bestRange = best.scrollHeight - best.clientHeight;
        const candidateRange = candidate.scrollHeight - candidate.clientHeight;
        return candidateRange > bestRange ? candidate : best;
      });
    }

    return document.scrollingElement || document.documentElement;
  }

  function isSendButtonTarget(target) {
    return Boolean(target?.closest?.(SEND_BUTTON_SELECTOR));
  }

  function isComposerTarget(target) {
    const composer = target?.closest?.(COMPOSER_SELECTOR);
    if (!composer) return false;
    if (composer.id === "prompt-textarea") return true;
    return Boolean(composer.closest?.("form"));
  }

  function shouldBeginForKeydown(event) {
    return (
      event.key === "Enter"
      && !event.shiftKey
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.isComposing
      && isComposerTarget(event.target)
    );
  }

  function isUserScrollKey(event) {
    return USER_SCROLL_KEYS.has(event.key);
  }

  const api = {
    isSendButtonTarget,
    isComposerTarget,
    shouldBeginForKeydown,
    isUserScrollKey,
  };

  if (globalThis.__GHRC_TEST__) {
    Object.assign(globalThis.__GHRC_TEST__, api);
    return;
  }

  function currentGuardContainer() {
    if (!guard) return null;
    if (guard.container?.isConnected) return guard.container;

    const replacement = findConversationScrollContainer();
    if (!replacement) return null;
    guard.container = replacement;
    return replacement;
  }

  function restorePosition() {
    restoreScheduled = false;
    if (!enabled || !guard) return;

    const container = currentGuardContainer();
    if (!container) return;

    if (Math.abs(container.scrollTop - guard.scrollTop) > 0.5) {
      container.scrollTop = guard.scrollTop;
    }
    if (Math.abs(container.scrollLeft - guard.scrollLeft) > 0.5) {
      container.scrollLeft = guard.scrollLeft;
    }
  }

  function scheduleRestore() {
    if (!enabled || !guard || restoreScheduled) return;
    restoreScheduled = true;
    requestAnimationFrame(restorePosition);
  }

  function stopGuard() {
    guard = null;
    restoreScheduled = false;
  }

  function beginGuard() {
    if (!enabled) return;

    const container = findConversationScrollContainer();
    if (!container) return;

    guard = {
      container,
      scrollTop: container.scrollTop,
      scrollLeft: container.scrollLeft,
    };

    queueMicrotask(scheduleRestore);
    requestAnimationFrame(scheduleRestore);
    window.setTimeout(scheduleRestore, 50);
    window.setTimeout(scheduleRestore, 150);
    window.setTimeout(scheduleRestore, 350);
  }

  async function loadPreference() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: false });
    enabled = Boolean(settings[SETTING_KEY]);
    if (!enabled) stopGuard();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;
    enabled = Boolean(changes[SETTING_KEY].newValue);
    if (!enabled) stopGuard();
  });

  document.addEventListener("click", (event) => {
    if (enabled && isSendButtonTarget(event.target)) beginGuard();
  }, true);

  document.addEventListener("submit", (event) => {
    if (!enabled) return;
    if (event.target?.querySelector?.("#prompt-textarea")) beginGuard();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (guard && isUserScrollKey(event)) {
      stopGuard();
      return;
    }
    if (enabled && shouldBeginForKeydown(event)) beginGuard();
  }, true);

  document.addEventListener("scroll", (event) => {
    if (!guard) return;
    const target = event.target === document ? document.scrollingElement : event.target;
    const container = currentGuardContainer();
    if (target === container) scheduleRestore();
  }, true);

  document.addEventListener("wheel", stopGuard, { capture: true, passive: true });
  document.addEventListener("touchmove", stopGuard, { capture: true, passive: true });
  document.addEventListener("pointerdown", () => {
    if (guard) stopGuard();
  }, true);

  void loadPreference();
})();
