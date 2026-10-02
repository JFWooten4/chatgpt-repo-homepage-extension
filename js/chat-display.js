(() => {
  "use strict";
  const context = globalThis.__ghrcExtensionContext;
  if (!context?.active()) return;
  const MODEL_MARKER = "data-ghrc-model-control";
  const CONTROL_QUERY = 'button[aria-haspopup], [role="combobox"], [data-codex-intelligence-trigger]';
  let scheduled = false;

  function scan() {
    if (!context.active()) return;
    scheduled = false;
    for (const control of document.querySelectorAll(CONTROL_QUERY)) {
      const label = [control.getAttribute("aria-label"), control.getAttribute("title"), control.textContent]
        .filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const modelControl = control.hasAttribute("data-codex-intelligence-trigger")
        || /^Select ChatGPT model\b/i.test(label)
        || (Boolean(control.closest('form, [data-type="unified-composer"]'))
          && /\b(thinking (?:effort|time)|reasoning (?:effort|strength))\b/i.test(label));
      if (control.hasAttribute(MODEL_MARKER) !== modelControl) control.toggleAttribute(MODEL_MARKER, modelControl);
    }
  }

  function scheduleScan() {
    if (!context.active()) return;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(scan);
  }

  function apply(settings) {
    document.documentElement?.toggleAttribute("data-ghrc-show-home-suggestions", !settings.hideHomeSuggestions);
    document.documentElement?.toggleAttribute("data-ghrc-show-model-controls", !settings.hideModelControls);
    scheduleScan();
  }

  let settings = { hideHomeSuggestions: true, hideModelControls: true };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const key of Object.keys(settings)) {
      if (changes[key]) settings[key] = changes[key].newValue !== false;
    }
    apply(settings);
  });
  const observer = new MutationObserver(scheduleScan);
  context.onStop(() => observer.disconnect());
  observer.observe(document, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ["aria-label", "title", "data-codex-intelligence-trigger"],
  });
  void context.run(async () => {
    const stored = await chrome.storage.local.get(settings);
    if (!context.active()) return;
    settings = { hideHomeSuggestions: stored.hideHomeSuggestions !== false, hideModelControls: stored.hideModelControls !== false };
    apply(settings);
  });
  scheduleScan();
})();
