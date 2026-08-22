const DEFAULT_OWNER_ORDER = [];
const form = document.getElementById("settings-form");
const tokenList = document.getElementById("github-tokens");
const tokenRowTemplate = document.getElementById("token-row-template");
const addTokenButton = document.getElementById("add-token");
const ownerOrderInput = document.getElementById("owner-order");
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

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    githubToken: "",
    githubTokens: [],
    ownerOrder: DEFAULT_OWNER_ORDER,
    hideDictationButton: false,
    compactNewChatHeader: false,
    skipExternalSiteWarning: false,
  });
  const storedOwnerOrder = Array.isArray(settings.ownerOrder)
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  const configuredTokens = Array.isArray(settings.githubTokens)
    ? settings.githubTokens
      .filter((entry) => entry && typeof entry.token === "string" && entry.token.trim())
      .map((entry) => ({
        label: typeof entry.label === "string"
          ? entry.label
          : typeof entry.owner === "string" ? entry.owner : "",
        token: entry.token,
      }))
    : [];

  if (!configuredTokens.length && settings.githubToken.trim()) {
    configuredTokens.push({ label: "GitHub account", token: settings.githubToken.trim() });
  }

  renderTokenRows(configuredTokens);
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

  await chrome.storage.local.set({
    githubTokens,
    ownerOrder: enteredOwnerOrder,
    hideDictationButton: hideDictationButtonInput.checked,
    compactNewChatHeader: compactNewChatHeaderInput.checked,
    skipExternalSiteWarning: skipExternalSiteWarningInput.checked,
  });
  await chrome.storage.local.remove("githubToken");
  ownerOrderInput.value = enteredOwnerOrder.join("\n");
  showStatus("Settings saved. The ChatGPT dashboard will refresh automatically.", "success");
});

clearTokensButton.addEventListener("click", async () => {
  renderTokenRows([]);
  await chrome.storage.local.remove(["githubToken", "githubTokens"]);
  showStatus("Tokens cleared. Only public repositories will be loaded.", "success");
});

void loadSettings();
