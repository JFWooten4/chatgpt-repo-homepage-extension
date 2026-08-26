(() => {
  const SETTING_KEY = "ownerGroupsPerRow";
  const DEFAULT_GROUPS_PER_ROW = 3;

  function normalizedGroupsPerRow(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_GROUPS_PER_ROW;
    return Math.min(8, Math.max(1, parsed));
  }

  function applyGroupsPerRow(value) {
    document.documentElement.style.setProperty(
      "--ghrc-owner-groups-per-row",
      String(normalizedGroupsPerRow(value)),
    );
  }

  async function loadSetting() {
    const settings = await chrome.storage.local.get({
      [SETTING_KEY]: DEFAULT_GROUPS_PER_ROW,
    });
    applyGroupsPerRow(settings[SETTING_KEY]);
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[SETTING_KEY]) return;
    applyGroupsPerRow(changes[SETTING_KEY].newValue);
  });

  void loadSetting();
})();
