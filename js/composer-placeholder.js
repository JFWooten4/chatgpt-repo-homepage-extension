(() => {
  "use strict";
  const context = globalThis.__ghrcExtensionContext;
  if (!context?.active()) return;
  const SETTING_KEY = "composerPlaceholder";
  const originals = new Map();
  let customText = "";
  let scheduled = false;

  function restore(element, attributes) {
    for (const [attribute, original] of attributes) {
      if (original === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, original);
    }
  }

  function applyPlaceholder() {
    scheduled = false;
    if (!context.active()) return;
    const composers = [...document.querySelectorAll('#prompt-textarea, [data-composer-markdown][contenteditable="true"]')];
    for (const [element, attributes] of originals) {
      if (!customText || !composers.some(composer => composer === element || composer.contains(element))) {
        restore(element, attributes);
        originals.delete(element);
      }
    }
    if (!customText) return;
    for (const composer of composers) {
      const elements = [composer, ...composer.querySelectorAll("[data-placeholder]")];
      for (const element of elements) {
        const attribute = element.tagName === "TEXTAREA" ? "placeholder" : "data-ghrc-placeholder-text";
        if (attribute === "data-ghrc-placeholder-text" && !element.hasAttribute("data-placeholder")) continue;
        const attributes = originals.get(element) || new Map();
        if (!attributes.has(attribute)) attributes.set(attribute, element.getAttribute(attribute));
        originals.set(element, attributes);
        if (element.getAttribute(attribute) !== customText) element.setAttribute(attribute, customText);
      }
    }
  }

  function schedule() {
    if (!context.active() || scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyPlaceholder);
  }

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== "attributes") continue;
      const attributes = originals.get(mutation.target);
      const current = mutation.target.getAttribute(mutation.attributeName);
      if (attributes?.has(mutation.attributeName) && current !== customText) {
        attributes.set(mutation.attributeName, current);
      }
    }
    schedule();
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["placeholder", "data-placeholder"],
  });
  context.onStop(() => {
    observer.disconnect();
    for (const [element, attributes] of originals) restore(element, attributes);
    originals.clear();
  });

  function update(value) {
    customText = typeof value === "string" ? value.trim() : "";
    schedule();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[SETTING_KEY]) update(changes[SETTING_KEY].newValue);
  });
  void context.run(async () => {
    const stored = await chrome.storage.local.get({ [SETTING_KEY]: "" });
    if (context.active()) update(stored[SETTING_KEY]);
  });
})();
