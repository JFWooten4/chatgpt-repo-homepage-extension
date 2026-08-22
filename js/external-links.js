(() => {
  const EXTERNAL_WARNING_SETTING_KEY = "skipExternalSiteWarning";
  const HISTORY_MODAL_SETTING_KEY = "dismissHistoryRateLimitModal";
  const MODAL_ID = "modal-conversation-history-rate-limit";
  const DIALOG_SELECTOR = '[role="dialog"], [role="alertdialog"]';
  const EXTERNAL_DIALOG_TITLE = "External site";
  const OPEN_LINK_LABEL = "Open link";
  const handledExternalDialogs = new WeakSet();
  let externalWarningEnabled = false;
  let historyModalEnabled = false;
  let modalWasSuppressed = false;

  function normalizedText(element) {
    return (element.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findExactControl(dialog, label) {
    return [...dialog.querySelectorAll('button, a[href], [role="button"]')]
      .find((control) => normalizedText(control) === label);
  }

  function approveExternalSiteDialog(dialog) {
    if (!externalWarningEnabled || handledExternalDialogs.has(dialog)) return;

    const title = [...dialog.querySelectorAll('h1, h2, h3, h4, [role="heading"]')]
      .find((heading) => normalizedText(heading) === EXTERNAL_DIALOG_TITLE);
    const openLink = findExactControl(dialog, OPEN_LINK_LABEL);
    if (!title || !openLink) return;

    handledExternalDialogs.add(dialog);
    openLink.click();
  }

  function inspectDialogs(node) {
    if (!externalWarningEnabled || !(node instanceof Element)) return;
    const dialogs = new Set();
    if (node.matches(DIALOG_SELECTOR)) dialogs.add(node);
    const containingDialog = node.closest(DIALOG_SELECTOR);
    if (containingDialog) dialogs.add(containingDialog);
    for (const dialog of node.querySelectorAll(DIALOG_SELECTOR)) dialogs.add(dialog);
    for (const dialog of dialogs) approveExternalSiteDialog(dialog);
  }

  function suppressHistoryRateLimitModal() {
    if (!historyModalEnabled) return;
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modalWasSuppressed = true;
    modal.style.setProperty("display", "none", "important");
    for (const element of [document.documentElement, document.body]) {
      if (!element) continue;
      element.style.setProperty("overflow", "auto", "important");
      element.style.setProperty("pointer-events", "auto", "important");
      element.style.setProperty("touch-action", "auto", "important");
    }
    if (document.body) {
      document.body.removeAttribute("data-scroll-locked");
      document.body.removeAttribute("data-scroll-lock");
      document.body.removeAttribute("inert");
    }
    for (const element of document.querySelectorAll("body > div")) {
      if (element === modal) continue;
      if (getComputedStyle(element).pointerEvents === "none") {
        element.style.setProperty("pointer-events", "auto", "important");
      }
    }
  }

  function preserveNativeScroll(event) {
    if (!historyModalEnabled || !modalWasSuppressed) return;
    const modal = document.getElementById(MODAL_ID);
    if (!modal || getComputedStyle(modal).display !== "none") return;
    event.stopImmediatePropagation();
  }

  window.addEventListener("wheel", preserveNativeScroll, { capture: true, passive: true });
  window.addEventListener("touchmove", preserveNativeScroll, { capture: true, passive: true });

  function inspectMutationNode(node) {
    if (!(node instanceof Element)) return;
    inspectDialogs(node);
    suppressHistoryRateLimitModal();
  }

  function watchChatGPTInterruptions() {
    if (!document.documentElement) {
      requestAnimationFrame(watchChatGPTInterruptions);
      return;
    }
    inspectDialogs(document.documentElement);
    suppressHistoryRateLimitModal();
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        inspectMutationNode(mutation.target);
        for (const node of mutation.addedNodes) inspectMutationNode(node);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get({
      [EXTERNAL_WARNING_SETTING_KEY]: true,
      [HISTORY_MODAL_SETTING_KEY]: true,
    });
    externalWarningEnabled = Boolean(settings[EXTERNAL_WARNING_SETTING_KEY]);
    historyModalEnabled = Boolean(settings[HISTORY_MODAL_SETTING_KEY]);
    if (document.documentElement) {
      inspectDialogs(document.documentElement);
      suppressHistoryRateLimitModal();
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes[EXTERNAL_WARNING_SETTING_KEY]) {
      externalWarningEnabled = Boolean(changes[EXTERNAL_WARNING_SETTING_KEY].newValue);
      if (externalWarningEnabled && document.documentElement) inspectDialogs(document.documentElement);
    }
    if (changes[HISTORY_MODAL_SETTING_KEY]) {
      historyModalEnabled = Boolean(changes[HISTORY_MODAL_SETTING_KEY].newValue);
      if (historyModalEnabled) suppressHistoryRateLimitModal();
    }
  });

  watchChatGPTInterruptions();
  setInterval(suppressHistoryRateLimitModal, 100);
  void loadSettings();
})();
