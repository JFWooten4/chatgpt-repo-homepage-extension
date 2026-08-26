(() => {
  const SETTING_KEY = "autoFocusComposer";
  const input = document.getElementById("auto-focus-composer");
  if (!input) return;

  async function loadPreference() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: true });
    input.checked = Boolean(settings[SETTING_KEY]);
  }

  input.addEventListener("change", () => {
    void chrome.storage.local.set({ [SETTING_KEY]: input.checked });
  });

  void loadPreference();
})();
