(() => {
  const STRIP_UTM_TRACKING_ATTR = "data-ghrc-strip-utm-tracking";
  const URL_PATTERN = /https?:\/\/[^\s<>"'`\])}]+/gi;

  function stripTrackingFromUrlValue(value) {
    const htmlAmpersands = /&amp;/i.test(value);
    const parseValue = htmlAmpersands ? value.replace(/&amp;/gi, "&") : value;
    let url;
    try {
      url = new URL(parseValue);
    } catch {
      return value;
    }
    if (!["http:", "https:"].includes(url.protocol)) return value;

    const trackingParameters = [...url.searchParams.keys()]
      .filter((name) => name.toLowerCase().startsWith("utm_"));
    if (!trackingParameters.length) return value;

    trackingParameters.forEach((name) => url.searchParams.delete(name));
    const result = url.href;
    return htmlAmpersands ? result.replace(/&/g, "&amp;") : result;
  }

  function stripTrackingFromText(value) {
    if (typeof value !== "string" || !value) return value;
    return value.replace(URL_PATTERN, stripTrackingFromUrlValue);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { stripTrackingFromUrlValue, stripTrackingFromText };
    return;
  }

  function trackingRemovalEnabled() {
    return document.documentElement?.getAttribute(STRIP_UTM_TRACKING_ATTR) !== "false";
  }

  function patchClipboardMethod(prototype, name, createReplacement) {
    const original = prototype?.[name];
    if (typeof original !== "function") return;
    try {
      Object.defineProperty(prototype, name, {
        configurable: true,
        writable: true,
        value: createReplacement(original),
      });
    } catch {
      // Leave ChatGPT's native clipboard behavior untouched if the API cannot be patched.
    }
  }

  const clipboard = navigator.clipboard;
  const clipboardPrototype = typeof Clipboard !== "undefined"
    ? Clipboard.prototype
    : (clipboard && Object.getPrototypeOf(clipboard));
  if (!clipboardPrototype) return;

  patchClipboardMethod(clipboardPrototype, "writeText", (original) => function writeText(text) {
    const value = trackingRemovalEnabled() ? stripTrackingFromText(String(text)) : text;
    return original.call(this, value);
  });

  if (typeof ClipboardItem !== "undefined" && typeof Blob !== "undefined") {
    patchClipboardMethod(clipboardPrototype, "write", (original) => function write(items) {
      if (!trackingRemovalEnabled()) return original.call(this, items);
      try {
        const sanitizedItems = Array.from(items, (item) => {
          const data = {};
          for (const type of item.types) {
            const blob = item.getType(type);
            data[type] = type === "text/plain" || type === "text/html"
              ? blob.then(async (value) => new Blob(
                [stripTrackingFromText(await value.text())],
                { type: value.type || type },
              ))
              : blob;
          }
          const options = item.presentationStyle
            ? { presentationStyle: item.presentationStyle }
            : undefined;
          return new ClipboardItem(data, options);
        });
        return original.call(this, sanitizedItems);
      } catch {
        return original.call(this, items);
      }
    });
  }
})();
