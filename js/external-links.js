(() => {
  const SETTING_KEY = "skipExternalSiteWarning";
  const handledDialogs = new WeakSet();
  let enabled = false;

  function normalizedText(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findOpenLinkButton(dialog) {
    return [...dialog.querySelectorAll('button, [role="button"]')]
      .find((element) => normalizedText(element) === "Open link");
  }

  function isExternalSiteDialog(dialog) {
    const text = normalizedText(dialog);
    return text.includes("External site") && text.includes("Verify this link");
  }

  function skipExternalSiteWarning() {
    if (!enabled) return;

    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (handledDialogs.has(dialog) || !isExternalSiteDialog(dialog)) continue;

      const openLinkButton = findOpenLinkButton(dialog);
      if (!openLinkButton) continue;

      handledDialogs.add(dialog);
      openLinkButton.click();
    }
  }

  async function loadSetting() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: false });
    enabled = Boolean(settings[SETTING_KEY]);
    skipExternalSiteWarning();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;

    enabled = Boolean(changes[SETTING_KEY].newValue);
    skipExternalSiteWarning();
  });

  const observer = new MutationObserver(skipExternalSiteWarning);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  void loadSetting();
})();
