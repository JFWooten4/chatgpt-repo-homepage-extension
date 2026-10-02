(() => {
  const context = globalThis.__ghrcExtensionContext;
  if (!context?.active()) return;
  const SETTING_KEY = "hoverRevealSidebar";
  const CLOSE_LABELS = new Set(["close sidebar", "collapse sidebar", "hide sidebar"]);
  const OPEN_LABELS = new Set(["open sidebar", "expand sidebar", "show sidebar"]);
  const EDGE_HOTSPOT_WIDTH = 64;
  const FALLBACK_SIDEBAR_WIDTH = 320;
  const COLLAPSE_DELAY_MS = 90;
  const REVEAL_RETRY_MS = 750;
  let initialCollapseFinished = false;
  let hoverRevealEnabled = false;
  let collapseTimer = null;
  let revealFrame = null;
  let revealDeadline = 0;
  let pointer = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY, inside: false };

  function sidebarToggleState() {
    const buttons = document.querySelectorAll("button[aria-label]");

    for (const button of buttons) {
      const label = button.getAttribute("aria-label")?.trim().toLowerCase();
      if (!CLOSE_LABELS.has(label) && !OPEN_LABELS.has(label)) continue;
      const style = getComputedStyle(button);
      if (!button.getClientRects().length || style.visibility === "hidden"
        || style.visibility === "collapse" || button.closest('[inert], [aria-hidden="true"]')) continue;
      if (CLOSE_LABELS.has(label)) return { state: "expanded", button };
      if (OPEN_LABELS.has(label)) return { state: "collapsed", button };
    }

    return null;
  }

  function finishInitialCollapse(observer) {
    if (initialCollapseFinished) return;
    initialCollapseFinished = true;
    observer?.disconnect();
  }

  function collapseOnLoad(observer) {
    if (!context.active()) return;
    if (initialCollapseFinished) return;

    const toggle = sidebarToggleState();
    if (!toggle) return;

    if (toggle.state === "expanded") {
      toggle.button.click();
      return;
    }

    finishInitialCollapse(observer);
  }

  function clearCollapseTimer() {
    if (collapseTimer === null) return;
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  function clearRevealRetry() {
    if (revealFrame !== null) {
      window.cancelAnimationFrame(revealFrame);
      revealFrame = null;
    }
    revealDeadline = 0;
  }

  function scheduleReveal() {
    if (revealFrame !== null) return;
    revealDeadline = Date.now() + REVEAL_RETRY_MS;

    const attemptReveal = () => {
      revealFrame = null;

      if (!context.active() || !hoverRevealEnabled || !pointer.inside || pointer.x > EDGE_HOTSPOT_WIDTH) {
        revealDeadline = 0;
        return;
      }

      const toggle = sidebarToggleState();
      const disabled = toggle?.button.disabled
        || toggle?.button.getAttribute("aria-disabled") === "true";

      if (toggle?.state === "collapsed" && !disabled) {
        revealDeadline = 0;
        toggle.button.click();
        return;
      }

      if (toggle?.state === "expanded" || Date.now() >= revealDeadline) {
        revealDeadline = 0;
        return;
      }

      revealFrame = window.requestAnimationFrame(attemptReveal);
    };

    revealFrame = window.requestAnimationFrame(attemptReveal);
  }

  function sidebarLike(element) {
    if (!(element instanceof Element)) return false;
    const bounds = element.getBoundingClientRect();
    const maxWidth = Math.min(480, window.innerWidth * 0.65);
    return bounds.left <= 8
      && bounds.width >= 180
      && bounds.width <= maxWidth
      && bounds.height >= window.innerHeight * 0.6;
  }

  function sidebarFor(toggleButton) {
    const semanticSidebar = toggleButton.closest(
      'aside, nav, [data-testid*="sidebar"], [data-testid*="navigation"]',
    );
    if (sidebarLike(semanticSidebar)) return semanticSidebar;

    let candidate = toggleButton.parentElement;
    let match = null;
    for (let depth = 0; candidate && depth < 10; depth += 1) {
      if (sidebarLike(candidate)) match = candidate;
      candidate = candidate.parentElement;
    }
    return match;
  }

  function pointerOverSidebar(toggle) {
    if (!pointer.inside) return false;

    const sidebar = sidebarFor(toggle.button);
    if (!sidebar) return pointer.x <= FALLBACK_SIDEBAR_WIDTH;

    const bounds = sidebar.getBoundingClientRect();
    return pointer.x >= bounds.left
      && pointer.x <= bounds.right
      && pointer.y >= bounds.top
      && pointer.y <= bounds.bottom;
  }

  function scheduleCollapse() {
    if (collapseTimer !== null) return;
    collapseTimer = window.setTimeout(() => {
      collapseTimer = null;
      if (!context.active() || !hoverRevealEnabled) return;

      const toggle = sidebarToggleState();
      if (!toggle || toggle.state !== "expanded" || pointerOverSidebar(toggle)) return;
      toggle.button.click();
    }, COLLAPSE_DELAY_MS);
  }

  function reconcileHoverState() {
    if (!context.active() || !hoverRevealEnabled) return;

    const overEdge = pointer.inside && pointer.x <= EDGE_HOTSPOT_WIDTH;
    const toggle = sidebarToggleState();

    if (!toggle) {
      if (overEdge) scheduleReveal();
      else clearRevealRetry();
      return;
    }

    if (toggle.state === "collapsed") {
      clearCollapseTimer();
      if (overEdge) scheduleReveal();
      else clearRevealRetry();
      return;
    }

    clearRevealRetry();
    if (pointerOverSidebar(toggle)) clearCollapseTimer();
    else scheduleCollapse();
  }

  function setHoverRevealEnabled(nextEnabled) {
    hoverRevealEnabled = Boolean(nextEnabled);
    clearCollapseTimer();
    clearRevealRetry();

    if (!hoverRevealEnabled || !initialCollapseFinished) return;
    const toggle = sidebarToggleState();
    if (toggle?.state === "expanded") toggle.button.click();
  }

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    pointer = { x: event.clientX, y: event.clientY, inside: true };
    reconcileHoverState();
  }, true);

  window.addEventListener("pointerout", (event) => {
    if (event.relatedTarget !== null) return;
    pointer.inside = false;
    reconcileHoverState();
  }, true);

  window.addEventListener("blur", () => {
    pointer.inside = false;
    reconcileHoverState();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;
    setHoverRevealEnabled(changes[SETTING_KEY].newValue);
  });

  const observer = new MutationObserver(() => collapseOnLoad(observer));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label"],
  });

  collapseOnLoad(observer);
  const initialCollapseTimer = window.setTimeout(() => finishInitialCollapse(observer), 10000);
  context.onStop(() => {
    observer.disconnect();
    clearTimeout(initialCollapseTimer);
    clearCollapseTimer();
    clearRevealRetry();
  });

  void context.run(async () => {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: false });
    if (context.active()) setHoverRevealEnabled(settings[SETTING_KEY]);
  });
})();
