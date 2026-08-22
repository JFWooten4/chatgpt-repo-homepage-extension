(() => {
  const SETTING_KEY = "showSpellcheckGptLauncher";
  const input = document.getElementById("show-spellcheck-gpt-launcher");
  const form = document.getElementById("settings-form");
  if (!input || !form) return;

  async function loadPreference() {
    const settings = await chrome.storage.local.get({ [SETTING_KEY]: false });
    input.checked = Boolean(settings[SETTING_KEY]);
  }

  form.addEventListener("submit", () => {
    void chrome.storage.local.set({ [SETTING_KEY]: input.checked });
  });

  void loadPreference();
})();
