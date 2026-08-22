(() => {
  const CLOSE_LABELS = new Set(["close sidebar", "collapse sidebar"]);
  const OPEN_LABELS = new Set(["open sidebar", "expand sidebar"]);
  let finished = false;

  function sidebarToggleState() {
    const buttons = document.querySelectorAll("button[aria-label]");

    for (const button of buttons) {
      const label = button.getAttribute("aria-label")?.trim().toLowerCase();
      if (CLOSE_LABELS.has(label)) return { state: "expanded", button };
      if (OPEN_LABELS.has(label)) return { state: "collapsed", button };
    }

    return null;
  }

  function finish(observer) {
    if (finished) return;
    finished = true;
    observer?.disconnect();
  }

  function collapseIfExpanded(observer) {
    if (finished) return;

    const toggle = sidebarToggleState();
    if (!toggle) return;

    if (toggle.state === "expanded") {
      toggle.button.click();
    }

    finish(observer);
  }

  const observer = new MutationObserver(() => collapseIfExpanded(observer));
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label"],
  });

  collapseIfExpanded(observer);
  window.setTimeout(() => finish(observer), 10000);
})();
