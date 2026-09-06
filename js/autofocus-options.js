(() => {
  const AUTO_FOCUS_SETTING_KEY = "autoFocusComposer";
  const FORCE_HIGH_SETTING_KEY = "forceHighThinking";
  const autoFocusInput = document.getElementById("auto-focus-composer");

  if (autoFocusInput) {
    void chrome.storage.local.get({ [AUTO_FOCUS_SETTING_KEY]: true }).then((settings) => {
      autoFocusInput.checked = Boolean(settings[AUTO_FOCUS_SETTING_KEY]);
    });

    autoFocusInput.addEventListener("change", () => {
      void chrome.storage.local.set({ [AUTO_FOCUS_SETTING_KEY]: autoFocusInput.checked });
    });
  }

  const existingHighInput = document.getElementById("force-high-thinking");
  if (existingHighInput) return;

  const preference = document.createElement("label");
  preference.className = "preference";
  preference.innerHTML = `
    <input id="force-high-thinking" type="checkbox" />
    <span>
      <strong>Force High thinking</strong>
      <small>Sets ChatGPT's thinking effort to High and hides the effort selector after High is selected.</small>
    </span>
  `;

  const highInput = preference.querySelector("input");
  const disableWorkPreference = document.getElementById("disable-work-mode")?.closest("label.preference");
  const chatDisplayFieldset = document.getElementById("auto-focus-composer")?.closest("fieldset");
  if (disableWorkPreference) disableWorkPreference.insertAdjacentElement("afterend", preference);
  else chatDisplayFieldset?.append(preference);
  if (!preference.isConnected || !highInput) return;

  void chrome.storage.local.get({ [FORCE_HIGH_SETTING_KEY]: false }).then((settings) => {
    highInput.checked = Boolean(settings[FORCE_HIGH_SETTING_KEY]);
  });

  highInput.addEventListener("change", () => {
    void chrome.storage.local.set({ [FORCE_HIGH_SETTING_KEY]: highInput.checked });
  });
})();
