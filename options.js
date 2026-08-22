const DEFAULT_OWNER_ORDER = [];
const form = document.getElementById("settings-form");
const tokenList = document.getElementById("github-tokens");
const tokenRowTemplate = document.getElementById("token-row-template");
const addTokenButton = document.getElementById("add-token");
const ownerOrderInput = document.getElementById("owner-order");
const pinnedRepositoryList = document.getElementById("pinned-repositories");
const pinnedRepositoryTemplate = document.getElementById("pinned-repository-template");
const hideDictationButtonInput = document.getElementById("hide-dictation-button");
const compactNewChatHeaderInput = document.getElementById("compact-new-chat-header");
const skipExternalSiteWarningInput = document.getElementById("skip-external-site-warning");
const clearTokensButton = document.getElementById("clear-tokens");
const status = document.getElementById("status");

function ownerOrderFromInput() {
  const seen = new Set();
  return ownerOrderInput.value
    .split("\n")
    .map((owner) => owner.trim())
    .filter((owner) => {
      const key = owner.toLowerCase();
      if (!owner || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function showStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function createTokenRow({ label = "", owner = "", token = "" } = {}) {
  const row = tokenRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".token-label").value = label || owner;
  row.querySelector(".token-value").value = token;
  row.querySelector(".remove-token").addEventListener("click", () => row.remove());
  return row;
}

function renderTokenRows(configuredTokens) {
  const tokenRows = configuredTokens.length ? configuredTokens : [{}];
  tokenList.replaceChildren(...tokenRows.map((token) => createTokenRow(token)));
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

  if (direction < 0) {
    pinnedRepositoryList.insertBefore(row, sibling);
  } else {
    pinnedRepositoryList.insertBefore(sibling, row);
  }
  updatePinControls();
  row.querySelector(direction < 0 ? ".move-pin-up" : ".move-pin-down").focus();
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
});

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    ownerOrder: DEFAULT_OWNER_ORDER,
    pinnedRepositories: [],
    hideDictationButton: false,
    compactNewChatHeader: false,
    skipExternalSiteWarning: false,
  });
  const storedOwnerOrder = Array.isArray(settings.ownerOrder)
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  let configuredTokens = [];

  try {
    configuredTokens = await TokenVault.loadTokens();
  } catch (error) {
    showStatus(error.message, "error");
  }

  renderTokenRows(configuredTokens);
  renderPinnedRepositories(settings.pinnedRepositories);
  ownerOrderInput.value = storedOwnerOrder.join("\n");
  hideDictationButtonInput.checked = Boolean(settings.hideDictationButton);
  compactNewChatHeaderInput.checked = Boolean(settings.compactNewChatHeader);
  skipExternalSiteWarningInput.checked = Boolean(settings.skipExternalSiteWarning);
}

addTokenButton.addEventListener("click", () => {
  const row = createTokenRow();
  tokenList.append(row);
  row.querySelector(".token-label").focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredOwnerOrder = ownerOrderFromInput();
  const githubTokens = tokensFromInput();

  if (!githubTokens) {
    showStatus("Remove the duplicate token before saving.", "error");
    return;
  }

  try {
    await TokenVault.saveTokens(githubTokens);
    await chrome.storage.local.set({
      ownerOrder: enteredOwnerOrder,
      pinnedRepositories: pinnedRepositoriesFromList(),
      hideDictationButton: hideDictationButtonInput.checked,
      compactNewChatHeader: compactNewChatHeaderInput.checked,
      skipExternalSiteWarning: skipExternalSiteWarningInput.checked,
    });
    ownerOrderInput.value = enteredOwnerOrder.join("\n");
    showStatus("Settings saved. GitHub tokens are encrypted in the browser vault.", "success");
  } catch (error) {
    showStatus(`Settings could not be saved: ${error.message}`, "error");
  }
});

clearTokensButton.addEventListener("click", async () => {
  try {
    renderTokenRows([]);
    await TokenVault.clearTokens();
    showStatus("Tokens cleared. Only public repositories will be loaded.", "success");
  } catch (error) {
    showStatus(`Tokens could not be cleared: ${error.message}`, "error");
  }
});

void loadSettings();
