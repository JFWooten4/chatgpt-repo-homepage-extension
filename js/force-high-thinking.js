(() => {
  const SETTING_KEY = "forceHighThinking";
  const SELECTOR_ATTR = "data-ghrc-high-thinking-selector";
  const STYLE_ID = "ghrc-force-high-thinking-style";
  const SELECTOR_QUERY = [
    'button[aria-haspopup="menu"]',
    'button[aria-haspopup="listbox"]',
    '[role="button"][aria-haspopup]',
    '[role="combobox"]',
  ].join(", ");
  const OPTION_QUERY = [
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="radio"]',
    "button",
  ].join(", ");
  const MAX_SELECTION_ATTEMPTS = 5;
  let enabled = false;
  let scanScheduled = false;
  let pendingSelector = null;
  let selectionAttempts = 0;

  function normalizedText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function labelledByText(control) {
    const ids = normalizedText(control.getAttribute("aria-labelledby")).split(" ");
    if (!ids[0]) return "";
    return normalizedText(ids.map((id) => document.getElementById(id)?.textContent || "").join(" "));
  }

  function controlLabel(control) {
    return normalizedText(control.getAttribute("aria-label"))
      || labelledByText(control)
      || normalizedText(control.getAttribute("title"))
      || normalizedText(control.textContent);
  }

  function effortLevel(control) {
    const label = controlLabel(control);
    const visibleText = normalizedText(control.textContent);
    const combinedText = normalizedText(`${label} ${visibleText}`);
    if (!combinedText) return "";

    const explicitlyEffort = /\b(?:thinking|reasoning)\b|\beffort\b/i.test(combinedText);
    const plainLevel = /^(?:instant|low|medium|high|extra high)$/i.test(label)
      || /^(?:instant|low|medium|high|extra high)$/i.test(visibleText);
    if (!explicitlyEffort && !plainLevel) return "";

    const match = visibleText.match(/\b(extra high|high|medium|low|instant)\b/i)
      || label.match(/\b(extra high|high|medium|low|instant)\b/i)
      || combinedText.match(/\b(extra high|high|medium|low|instant)\b/i);
    return match ? match[1].toLowerCase() : "";
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function isHighOption(control) {
    const label = controlLabel(control);
    return /^high(?:\b|\s)/i.test(label) && !/^extra high\b/i.test(label) && isVisible(control);
  }

  function ensureStyle() {
    if (!document.documentElement || document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `[${SELECTOR_ATTR}="true"] { display: none !important; }`;
    document.documentElement.append(style);
  }

  function clearHiddenSelectors() {
    document.querySelectorAll(`[${SELECTOR_ATTR}]`).forEach((selector) => {
      selector.removeAttribute(SELECTOR_ATTR);
    });
  }

  function findEffortSelectors() {
    return [...document.querySelectorAll(SELECTOR_QUERY)]
      .filter((control) => Boolean(effortLevel(control)));
  }

  function selectHighFromOpenMenu() {
    if (!pendingSelector) return false;
    const highOption = [...document.querySelectorAll(OPTION_QUERY)].find(isHighOption);
    if (!highOption) return false;
    highOption.click();
    pendingSelector = null;
    window.setTimeout(scheduleScan, 50);
    return true;
  }

  function scanControls() {
    scanScheduled = false;
    if (!enabled) return;
    ensureStyle();

    if (selectHighFromOpenMenu()) return;

    const selectors = findEffortSelectors();
    let foundHigh = false;
    for (const selector of selectors) {
      const level = effortLevel(selector);
      const isHigh = level === "high";
      selector.toggleAttribute(SELECTOR_ATTR, isHigh);
      if (isHigh) {
        foundHigh = true;
        pendingSelector = null;
        selectionAttempts = 0;
      }
    }

    if (foundHigh || pendingSelector || selectionAttempts >= MAX_SELECTION_ATTEMPTS) return;
    const selector = selectors.find((control) => effortLevel(control) !== "high" && isVisible(control));
    if (!selector) return;
    selectionAttempts += 1;
    pendingSelector = selector;
    selector.click();
    window.setTimeout(scheduleScan, 50);
    window.setTimeout(() => {
      if (pendingSelector === selector) pendingSelector = null;
      scheduleScan();
    }, 250);
  }

  function scheduleScan() {
    if (!enabled || scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scanControls);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    pendingSelector = null;
    selectionAttempts = 0;
    if (!enabled) {
      clearHiddenSelectors();
      return;
    }
    ensureStyle();
    scheduleScan();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;
    setEnabled(Boolean(changes[SETTING_KEY].newValue));
  });

  new MutationObserver(scheduleScan).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "aria-selected", "aria-checked", "data-state", "title"],
  });

  void chrome.storage.local.get({ [SETTING_KEY]: false }).then((settings) => {
    setEnabled(Boolean(settings[SETTING_KEY]));
  });
})();
