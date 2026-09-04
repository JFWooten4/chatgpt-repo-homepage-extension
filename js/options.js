const DEFAULT_OWNER_ORDER = [];
const DEFAULT_OWNER_GROUPS_PER_PAGE = 6;
const form = document.getElementById("settings-form");
const tokenSettings = document.getElementById("token-settings");
const tokenSummary = document.getElementById("token-summary");
const tokenList = document.getElementById("github-tokens");
const tokenRowTemplate = document.getElementById("token-row-template");
const addTokenButton = document.getElementById("add-token");
const ownerOrderInput = document.getElementById("owner-order");
const ownerGroupsPerPageInput = document.getElementById("owner-groups-per-page");
const showRepositorySearchInput = document.getElementById("show-repository-search");
const showRepositoryTotalInput = document.getElementById("show-repository-total");
const pinnedRepositoryList = document.getElementById("pinned-repositories");
const pinnedRepositoryTemplate = document.getElementById("pinned-repository-template");
const hideDictationButtonInput = document.getElementById("hide-dictation-button");
const compactNewChatHeaderInput = document.getElementById("compact-new-chat-header");
const disableWorkModeInput = document.getElementById("disable-work-mode");
const showSpellcheckGptLauncherInput = document.getElementById("show-spellcheck-gpt-launcher");
const stripUtmTrackingInput = document.getElementById("strip-utm-tracking");
const skipExternalSiteWarningInput = document.getElementById("skip-external-site-warning");
const dismissHistoryRateLimitModalInput = document.getElementById("dismiss-history-rate-limit-modal");
const clearTokensButton = document.getElementById("clear-tokens");
const status = document.getElementById("status");
let saveQueue = Promise.resolve();
let tokenStateLoaded = false;
let tokenInputsDirty = false;

function normalizedOwnerOrder(owners) {
  const seen = new Set();
  return (Array.isArray(owners) ? owners : [])
    .map((owner) => typeof owner === "string" ? owner.trim() : "")
    .filter((owner) => {
      const key = owner.toLowerCase();
      if (!owner || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function ownerOrderFromInput() {
  return normalizedOwnerOrder(ownerOrderInput.value.split("\n"));
}

function normalizedOwnerGroupsPerPage(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_OWNER_GROUPS_PER_PAGE;
  return Math.min(24, Math.max(1, parsed));
}

function showStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function updateTokenSummary() {
  const count = [...tokenList.querySelectorAll(".token-value")]
    .filter((input) => input.value.trim()).length;
  tokenSummary.textContent = count === 0
    ? "Not configured"
    : count === 1 ? "1 configured" : `${count} configured`;
}

function createTokenRow({ label = "", owner = "", token = "" } = {}) {
  const row = tokenRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".token-label").value = label || owner;
  row.querySelector(".token-value").value = token;
  row.querySelector(".remove-token").addEventListener("click", () => {
    row.remove();
    if (!tokenList.querySelector(".token-row")) {
      tokenList.append(createTokenRow());
    }
    tokenInputsDirty = true;
    updateTokenSummary();
    void queueSettingsSave();
  });
  return row;
}

function renderTokenRows(configuredTokens) {
  const tokenRows = configuredTokens.length ? configuredTokens : [{}];
  tokenList.replaceChildren(...tokenRows.map((token) => createTokenRow(token)));
  updateTokenSummary();
}

function tokensFromInput() {
  const tokens = [];
  const seenTokens = new Set();
  for (const row of tokenList.querySelectorAll(".token-row")) {
    const label = row.querySelector(".token-label").value.trim();
    const token = row.querySelector(".token-value").value.trim();
    if (!token) continue;
    if (seenTokens.has(token)) return null;
    seenTokens.add(token);
    tokens.push({ label: label || `Token ${tokens.length + 1}`, token });
  }
  return tokens;
}

function normalizedPins(pinnedRepositories) {
  const seen = new Set();
  return (Array.isArray(pinnedRepositories) ? pinnedRepositories : [])
    .filter((fullName) => typeof fullName === "string" && fullName.includes("/"))
    .map((fullName) => fullName.trim())
    .filter((fullName) => {
      const key = fullName.toLowerCase();
      if (!fullName || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function pinnedRepositoriesFromList() {
  return [...pinnedRepositoryList.querySelectorAll(".pinned-repository")]
    .map((row) => row.dataset.repository);
}

function updatePinControls() {
  const rows = [...pinnedRepositoryList.querySelectorAll(".pinned-repository")];
  rows.forEach((row, index) => {
    row.querySelector(".move-pin-up").disabled = index === 0;
    row.querySelector(".move-pin-down").disabled = index === rows.length - 1;
  });
}

function movePin(row, direction) {
  const sibling = direction < 0 ? row.previousElementSibling : row.nextElementSibling;
  if (!sibling?.classList.contains("pinned-repository")) return;
  if (direction < 0) pinnedRepositoryList.insertBefore(row, sibling);
  else pinnedRepositoryList.insertBefore(sibling, row);
  updatePinControls();
  row.querySelector(direction < 0 ? ".move-pin-up" : ".move-pin-down").focus();
  void queueSettingsSave();
}

function createPinnedRepositoryRow(fullName) {
  const row = pinnedRepositoryTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.repository = fullName;
  row.querySelector("code").textContent = fullName;
  row.querySelector(".move-pin-up").addEventListener("click", () => movePin(row, -1));
  row.querySelector(".move-pin-down").addEventListener("click", () => movePin(row, 1));
  row.querySelector(".remove-pin").addEventListener("click", () => {
    row.remove();
    if (!pinnedRepositoriesFromList().length) renderPinnedRepositories([]);
    updatePinControls();
    void queueSettingsSave();
  });
  return row;
}

function renderPinnedRepositories(pinnedRepositories) {
  const pins = normalizedPins(pinnedRepositories);
  if (!pins.length) {
    const empty = document.createElement("p");
    empty.className = "pinned-repositories-empty";
    empty.textContent = "No repositories pinned yet.";
    pinnedRepositoryList.replaceChildren(empty);
    return;
  }
  pinnedRepositoryList.replaceChildren(...pins.map(createPinnedRepositoryRow));
  updatePinControls();
}

let draggedPin = null;
pinnedRepositoryList.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".pinned-repository");
  if (!row) return;
  draggedPin = row;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", row.dataset.repository);
});
pinnedRepositoryList.addEventListener("dragover", (event) => {
  const target = event.target.closest(".pinned-repository");
  if (!draggedPin || !target || target === draggedPin) return;
  event.preventDefault();
  const bounds = target.getBoundingClientRect();
  const insertAfter = event.clientY > bounds.top + (bounds.height / 2);
  pinnedRepositoryList.insertBefore(draggedPin, insertAfter ? target.nextSibling : target);
});
pinnedRepositoryList.addEventListener("drop", (event) => {
  event.preventDefault();
  updatePinControls();
});
pinnedRepositoryList.addEventListener("dragend", () => {
  draggedPin?.classList.remove("dragging");
  draggedPin = null;
  updatePinControls();
  void queueSettingsSave();
});

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    ownerOrder: DEFAULT_OWNER_ORDER,
    ownerGroupsPerPage: DEFAULT_OWNER_GROUPS_PER_PAGE,
    showRepositorySearch: true,
    showRepositoryTotal: true,
    pinnedRepositories: [],
    hideDictationButton: false,
    compactNewChatHeader: false,
    disableWorkMode: false,
    showSpellcheckGptLauncher: false,
    stripUtmTracking: true,
    skipExternalSiteWarning: true,
    dismissHistoryRateLimitModal: true,
  });
  const storedOwnerOrder = normalizedOwnerOrder(settings.ownerOrder);
  let configuredTokens = [];

  try {
    configuredTokens = await TokenVault.loadTokens();
    tokenStateLoaded = true;
  } catch (error) {
    showStatus(error.message, "error");
  }

  renderTokenRows(configuredTokens);
  tokenInputsDirty = false;
  tokenSettings.open = configuredTokens.length === 0;
  renderPinnedRepositories(settings.pinnedRepositories);
  ownerOrderInput.value = storedOwnerOrder.join("\n");
  ownerGroupsPerPageInput.value = normalizedOwnerGroupsPerPage(settings.ownerGroupsPerPage);
  showRepositorySearchInput.checked = Boolean(settings.showRepositorySearch);
  showRepositoryTotalInput.checked = Boolean(settings.showRepositoryTotal);
  hideDictationButtonInput.checked = Boolean(settings.hideDictationButton);
  compactNewChatHeaderInput.checked = Boolean(settings.compactNewChatHeader);
  disableWorkModeInput.checked = Boolean(settings.disableWorkMode);
  showSpellcheckGptLauncherInput.checked = Boolean(settings.showSpellcheckGptLauncher);
  stripUtmTrackingInput.checked = Boolean(settings.stripUtmTracking);
  skipExternalSiteWarningInput.checked = Boolean(settings.skipExternalSiteWarning);
  dismissHistoryRateLimitModalInput.checked = Boolean(settings.dismissHistoryRateLimitModal);

  const initialOwnerOrderValue = ownerOrderInput.value;
  try {
    const payload = await chrome.runtime.sendMessage({ type: "load-repositories" });
    if (
      payload?.ok
      && Array.isArray(payload.ownerOrder)
      && ownerOrderInput.value === initialOwnerOrderValue
    ) {
      ownerOrderInput.value = normalizedOwnerOrder(payload.ownerOrder).join("\n");
    }
  } catch {
    // Keep the already-rendered settings if repository discovery is unavailable.
  }
}

addTokenButton.addEventListener("click", () => {
  tokenSettings.open = true;
  const row = createTokenRow();
  tokenList.append(row);
  updateTokenSummary();
  row.querySelector(".token-label").focus();
});

tokenList.addEventListener("input", () => {
  tokenInputsDirty = true;
  updateTokenSummary();
});

async function saveSettings() {
  const enteredOwnerOrder = ownerOrderFromInput();
  const ownerGroupsPerPage = normalizedOwnerGroupsPerPage(ownerGroupsPerPageInput.value);
  let githubTokens = null;
  let shouldSaveTokens = false;

  if (tokenInputsDirty) {
    githubTokens = tokensFromInput();
    if (!githubTokens) {
      tokenSettings.open = true;
      showStatus("Remove the duplicate token before saving.", "error");
      return;
    }

    // A failed vault load renders an empty token row. Do not let an unrelated
    // settings change write that empty state over token data that may still be
    // recoverable. A non-empty token entry or Clear tokens remains explicit.
    shouldSaveTokens = tokenStateLoaded || githubTokens.length > 0;
  }

  try {
    if (shouldSaveTokens) {
      await TokenVault.saveTokens(githubTokens);
      tokenStateLoaded = true;
      tokenInputsDirty = false;
    }
    await chrome.storage.local.set({
      ownerOrder: enteredOwnerOrder,
      ownerGroupsPerPage,
      showRepositorySearch: showRepositorySearchInput.checked,
      showRepositoryTotal: showRepositoryTotalInput.checked,
      pinnedRepositories: pinnedRepositoriesFromList(),
      hideDictationButton: hideDictationButtonInput.checked,
      compactNewChatHeader: compactNewChatHeaderInput.checked,
      disableWorkMode: disableWorkModeInput.checked,
      showSpellcheckGptLauncher: showSpellcheckGptLauncherInput.checked,
      stripUtmTracking: stripUtmTrackingInput.checked,
      skipExternalSiteWarning: skipExternalSiteWarningInput.checked,
      dismissHistoryRateLimitModal: dismissHistoryRateLimitModalInput.checked,
    });
    ownerOrderInput.value = enteredOwnerOrder.join("\n");
    ownerGroupsPerPageInput.value = ownerGroupsPerPage;
    updateTokenSummary();
    showStatus(
      tokenStateLoaded
        ? "Settings saved automatically."
        : "Settings saved. Existing tokens were left untouched because the token vault could not be loaded.",
      tokenStateLoaded ? "success" : "error",
    );
  } catch (error) {
    showStatus(`Settings could not be saved: ${error.message}`, "error");
  }
}

function queueSettingsSave() {
  saveQueue = saveQueue.catch(() => {}).then(saveSettings);
  return saveQueue;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void queueSettingsSave();
});

form.addEventListener("change", (event) => {
  if (event.target.closest(".token-row")) tokenInputsDirty = true;
  void queueSettingsSave();
});

clearTokensButton.addEventListener("click", async () => {
  try {
    renderTokenRows([]);
    tokenSettings.open = true;
    await TokenVault.clearTokens();
    tokenStateLoaded = true;
    tokenInputsDirty = false;
    showStatus("Tokens cleared. Only public repositories will be loaded.", "success");
  } catch (error) {
    showStatus(`Tokens could not be cleared: ${error.message}`, "error");
  }
});

void loadSettings();
