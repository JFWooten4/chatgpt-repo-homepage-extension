(() => {
  const SETTING_KEY = "ownerGroupsPerRow";
  const DEFAULT_GROUPS_PER_ROW = 3;
  const form = document.getElementById("settings-form");
  const input = document.getElementById("owner-groups-per-row");

  function normalizedGroupsPerRow(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_GROUPS_PER_ROW;
    return Math.min(8, Math.max(1, parsed));
  }

  async function loadSetting() {
    const settings = await chrome.storage.local.get({
      [SETTING_KEY]: DEFAULT_GROUPS_PER_ROW,
    });
    input.value = normalizedGroupsPerRow(settings[SETTING_KEY]);
  }

  form.addEventListener("submit", async () => {
    const ownerGroupsPerRow = normalizedGroupsPerRow(input.value);
    input.value = ownerGroupsPerRow;
    await chrome.storage.local.set({ [SETTING_KEY]: ownerGroupsPerRow });
  });

  void loadSetting();
})();
