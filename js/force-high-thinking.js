(() => {
  const SETTING_KEY = "forceHighThinking";
  const CACHE_KEY = "forceHighThinkingConfirmedTargets";
  const SELECTOR_ATTR = "data-ghrc-high-thinking-selector";
  const STYLE_ID = "ghrc-force-high-thinking-style";
  const SELECTOR_QUERY = 'button[aria-haspopup="menu"], button[aria-haspopup="listbox"], [role="button"][aria-haspopup], [role="combobox"]';
  const OPTION_QUERY = '[role="menuitem"], [role="menuitemradio"], [role="option"], [role="radio"]';
  const LEVELS = { instant: 0, lite: 1, light: 1, low: 1, standard: 2, medium: 2, high: 3, extended: 3, heavy: 4, "extra high": 4, max: 5, maximum: 5 };
  const LEVEL_PATTERN = /\b(extra high|maximum|max|extended|standard|instant|medium|heavy|high|light|lite|low)\b/i;
  const MAX_SELECTION_ATTEMPTS = 5;
  let enabled = false;
  let scanScheduled = false;
  let pending = null;
  let states = new WeakMap();
  let confirmedTargets = {};

  function normalizedText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function controlLabel(control) {
    const labelledBy = normalizedText(control.getAttribute("aria-labelledby"))
      .split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" ");
    return normalizedText(control.getAttribute("aria-label"))
      || normalizedText(labelledBy)
      || normalizedText(control.getAttribute("title"))
      || normalizedText(control.textContent);
  }

  function controlCacheKey(control) {
    const labelledBy = normalizedText(control.getAttribute("aria-labelledby"))
      .split(" ").map((id) => document.getElementById(id)?.textContent || "").join(" ");
    const semanticLabel = [
      normalizedText(control.getAttribute("aria-label")),
      normalizedText(labelledBy),
      normalizedText(control.getAttribute("title")),
    ].find((value) => /\b(thinking|reasoning|effort)\b/i.test(value));
    if (!semanticLabel) return "";
    return normalizedText(semanticLabel.replace(LEVEL_PATTERN, " ")).toLowerCase();
  }

  function cachedTarget(control, level) {
    const cacheKey = controlCacheKey(control);
    return cacheKey && confirmedTargets[cacheKey] === level ? level : "";
  }

  function rememberConfirmed(control, level) {
    if (!Object.hasOwn(LEVELS, level)) return;
    const cacheKey = controlCacheKey(control);
    if (!cacheKey || confirmedTargets[cacheKey] === level) return;
    confirmedTargets = { ...confirmedTargets, [cacheKey]: level };
    void chrome.storage.local.set({ [CACHE_KEY]: confirmedTargets });
  }

  function effortLevel(control) {
    const visible = normalizedText(control.textContent);
    const label = controlLabel(control);
    const combined = `${label} ${visible}`;
    if (!/\b(thinking|reasoning|effort)\b/i.test(combined)
      && !Object.hasOwn(LEVELS, visible.toLowerCase())
      && !Object.hasOwn(LEVELS, label.toLowerCase())) return "";
    return (visible.match(LEVEL_PATTERN) || label.match(LEVEL_PATTERN))?.[1].toLowerCase()
      || (/^thinking(?: time| effort)?$/i.test(visible) ? "thinking" : "");
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  function ensureStyle() {
    if (!document.documentElement) return;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.append(style);
    }
    const rule = `[${SELECTOR_ATTR}] { display: none !important; }`;
    if (style.textContent !== rule) style.textContent = rule;
  }

  function findMenu(selector) {
    const controlled = document.getElementById(selector.getAttribute("aria-controls"));
    if (controlled && isVisible(controlled)) return controlled;
    const menus = [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(isVisible);
    return menus.length === 1 ? menus[0] : null;
  }

  function key(control, value) {
    control.dispatchEvent(new KeyboardEvent("keydown", { key: value, code: value, bubbles: true, cancelable: true }));
    control.dispatchEvent(new KeyboardEvent("keyup", { key: value, code: value, bubbles: true }));
  }

  function finishSelection(target, closeMenu) {
    const { selector, state } = pending;
    state.target = target;
    pending = null;
    if (closeMenu) {
      key(selector, "Escape");
      if (selector.getAttribute("aria-expanded") === "true") selector.click();
    }
    window.setTimeout(scheduleScan, 50);
  }

  function selectMaximum() {
    if (!pending) return false;
    const { selector, state, initialLevel } = pending;
    const menu = findMenu(selector);
    if (!menu) return false;
    const slider = menu.querySelector('[role="slider"][aria-valuemax][aria-valuenow]');
    if (slider) {
      const maximum = Number(slider.getAttribute("aria-valuemax"));
      const current = Number(slider.getAttribute("aria-valuenow"));
      if (!Number.isFinite(maximum) || !Number.isFinite(current)) return false;
      if (current === maximum) {
        const label = menu.querySelector('[aria-label="Select model"]');
        finishSelection((label && effortLevel(label)) || initialLevel, true);
      } else if (state.adjustments++ < 8) {
        key(slider.closest('[role="menuitem"]') || slider, "ArrowRight");
        window.setTimeout(scheduleScan, 50);
      }
      return true;
    }
    const options = [...menu.querySelectorAll(OPTION_QUERY)]
      .filter((option) => isVisible(option) && !option.disabled
        && option.getAttribute("aria-disabled") !== "true" && !option.hasAttribute("data-disabled"))
      .map((option) => ({ option, level: effortLevel(option) }))
      .filter(({ level }) => Object.hasOwn(LEVELS, level))
      .sort((a, b) => LEVELS[b.level] - LEVELS[a.level]);
    if (!options.length) return false;
    const { option, level } = options[0];
    const selected = option.getAttribute("aria-checked") === "true" || option.getAttribute("aria-selected") === "true";
    if (!selected) option.click();
    finishSelection(level, selected);
    return true;
  }

  function scanControls() {
    scanScheduled = false;
    if (!enabled) return;
    ensureStyle();
    if (pending && !pending.selector.isConnected) pending = null;
    if (selectMaximum() || pending) return;
    for (const selector of document.querySelectorAll(SELECTOR_QUERY)) {
      const level = effortLevel(selector);
      if (!level) continue;
      let state = states.get(selector);
      if (!state) {
        state = { attempts: 0, adjustments: 0, target: "" };
        states.set(selector, state);
      }
      const remembered = cachedTarget(selector, level);
      if (remembered) state.target = remembered;
      if (state.target === level) {
        selector.setAttribute(SELECTOR_ATTR, "");
        rememberConfirmed(selector, level);
        continue;
      }
      selector.removeAttribute(SELECTOR_ATTR);
      if (!isVisible(selector) || state.attempts >= MAX_SELECTION_ATTEMPTS) continue;
      state.attempts += 1;
      state.adjustments = 0;
      pending = { selector, state, initialLevel: level };
      // Both effort and thinking-time menus support the keyboard open action.
      // The effort trigger does not consistently respond to synthetic clicks.
      key(selector, "ArrowDown");
      window.setTimeout(scheduleScan, 50);
      const attempt = pending;
      window.setTimeout(() => {
        if (pending === attempt) pending = null;
        scheduleScan();
      }, 1000);
      return;
    }
  }

  function scheduleScan() {
    if (!enabled || scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scanControls);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    pending = null;
    states = new WeakMap();
    if (!enabled) {
      document.querySelectorAll(`[${SELECTOR_ATTR}]`).forEach((selector) => selector.removeAttribute(SELECTOR_ATTR));
      return;
    }
    ensureStyle();
    scheduleScan();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[CACHE_KEY]) {
      const value = changes[CACHE_KEY].newValue;
      confirmedTargets = value && typeof value === "object" && !Array.isArray(value) ? value : {};
      scheduleScan();
    }
    if (changes[SETTING_KEY]) setEnabled(Boolean(changes[SETTING_KEY].newValue));
  });
  new MutationObserver(scheduleScan).observe(document, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["aria-label", "aria-selected", "aria-checked", "aria-valuenow", "data-state", "title"],
  });
  void chrome.storage.local.get({ [SETTING_KEY]: false, [CACHE_KEY]: {} }).then((settings) => {
    const value = settings[CACHE_KEY];
    confirmedTargets = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    setEnabled(Boolean(settings[SETTING_KEY]));
  });
})();
