(() => {
  const SETTING_KEY = "disableWorkMode";
  const ROOT_ATTR = "data-ghrc-disable-work-mode";
  const CONTROL_ATTR = "data-ghrc-work-mode-control";
  const CONTROL_SELECTOR = [
    "button",
    "a[href]",
    "label",
    '[role="button"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[role="radio"]',
    '[role="tab"]',
  ].join(", ");
  const WORK_LABEL = /^(?:chatgpt\s+)?work(?:\s+mode)?$/i;
  const CHAT_LABEL = /^(?:chatgpt\s+)?chat(?:\s+mode)?$/i;
  let enabled = false;
  let scanScheduled = false;
  let handledControls = new WeakSet();

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

  function isWorkControl(control) {
    return control instanceof Element
      && control.matches(CONTROL_SELECTOR)
      && WORK_LABEL.test(controlLabel(control));
  }

  function findChatControl(workControl) {
    const explicitGroup = workControl.closest('[role="tablist"], [role="radiogroup"], [role="group"]');
    const containers = explicitGroup ? [explicitGroup] : [];
    let ancestor = workControl.parentElement;
    for (let depth = 0; ancestor && depth < 3; depth += 1) {
      containers.push(ancestor);
      ancestor = ancestor.parentElement;
    }

    for (const container of containers) {
      const chatControl = [...container.querySelectorAll(CONTROL_SELECTOR)]
        .find((control) => control !== workControl && CHAT_LABEL.test(controlLabel(control)));
      if (chatControl) return chatControl;
    }
    return null;
  }

  function disableControl(control) {
    if (!handledControls.has(control)) {
      handledControls.add(control);
      findChatControl(control)?.click();
    }
    control.setAttribute(CONTROL_ATTR, "true");
  }

  function scanControls() {
    scanScheduled = false;
    if (!enabled || !document.documentElement) return;
    document.documentElement.setAttribute(ROOT_ATTR, "true");
    document.querySelectorAll(CONTROL_SELECTOR).forEach((control) => {
      if (isWorkControl(control)) disableControl(control);
    });
  }

  function scheduleScan() {
    if (!enabled || scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(scanControls);
  }

  function setEnabled(nextEnabled) {
    enabled = nextEnabled;
    if (!document.documentElement) {
      requestAnimationFrame(() => setEnabled(nextEnabled));
      return;
    }

    document.documentElement.toggleAttribute(ROOT_ATTR, enabled);
    if (enabled) {
      scheduleScan();
      return;
    }

    document.querySelectorAll(`[${CONTROL_ATTR}]`).forEach((control) => {
      control.removeAttribute(CONTROL_ATTR);
    });
    handledControls = new WeakSet();
  }

  function blockWorkSelection(event) {
    if (!enabled || !(event.target instanceof Element)) return;
    const control = event.target.closest(CONTROL_SELECTOR);
    const group = control?.closest('[role="tablist"], [role="radiogroup"], [role="group"]');
    const navigatesModeGroup = event.type === "keydown"
      && ["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home"].includes(event.key)
      && group?.querySelector(`[${CONTROL_ATTR}]`);
    if (!isWorkControl(control) && !navigatesModeGroup) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  for (const eventName of ["pointerdown", "mousedown", "click", "keydown"]) {
    document.addEventListener(eventName, blockWorkSelection, true);
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
    attributeFilter: ["aria-label", "aria-labelledby", "role", "title"],
  });
  void chrome.storage.local.get({ [SETTING_KEY]: false }).then((settings) => {
    setEnabled(Boolean(settings[SETTING_KEY]));
  });
})();
