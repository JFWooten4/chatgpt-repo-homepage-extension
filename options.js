const DEFAULT_OWNER_ORDER = [
  "JFWooten4",
  "blocktransfer",
  "WhyDRS",
  "stellar",
  "windsorUwU",
  "am-only",
];
const DEFAULT_TOKEN_OWNERS = [
  "JFWooten4",
  "blocktransfer",
  "WhyDRS",
  "windsorUwU",
  "am-only",
];
const REQUIRED_TRAILING_OWNERS = ["windsorUwU", "am-only"];
const form = document.getElementById("settings-form");
const tokenList = document.getElementById("github-tokens");
const tokenRowTemplate = document.getElementById("token-row-template");
const addTokenButton = document.getElementById("add-token");
const ownerOrderInput = document.getElementById("owner-order");
const clearTokensButton = document.getElementById("clear-tokens");
const status = document.getElementById("status");

function ownerOrderWithRequiredOwners(ownerOrder) {
  const requiredKeys = new Set(
    REQUIRED_TRAILING_OWNERS.map((owner) => owner.toLowerCase()),
  );
  const result = ownerOrder.filter((owner) => !requiredKeys.has(owner.toLowerCase()));
  const stellarIndex = result.findIndex((owner) => owner.toLowerCase() === "stellar");
  result.splice(
    stellarIndex >= 0 ? stellarIndex + 1 : result.length,
    0,
    ...REQUIRED_TRAILING_OWNERS,
  );
  return result;
}

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

function createTokenRow({ owner = "", token = "" } = {}) {
  const row = tokenRowTemplate.content.firstElementChild.cloneNode(true);
  row.querySelector(".token-owner").value = owner;
  row.querySelector(".token-value").value = token;
  row.querySelector(".remove-token").addEventListener("click", () => row.remove());
  return row;
}

function renderTokenRows(configuredTokens) {
  const tokensByOwner = new Map(
    configuredTokens.map(({ owner, token }) => [owner.toLowerCase(), { owner, token }]),
  );
  const tokenRows = DEFAULT_TOKEN_OWNERS.map((owner) => (
    tokensByOwner.get(owner.toLowerCase()) || { owner, token: "" }
  ));
  const defaultOwnerKeys = new Set(
    DEFAULT_TOKEN_OWNERS.map((owner) => owner.toLowerCase()),
  );
  tokenRows.push(
    ...configuredTokens.filter(({ owner }) => !defaultOwnerKeys.has(owner.toLowerCase())),
  );

  tokenList.replaceChildren(...tokenRows.map((token) => createTokenRow(token)));
}

function tokensFromInput() {
  const tokens = [];
  const seenOwners = new Set();

  for (const row of tokenList.querySelectorAll(".token-row")) {
    const owner = row.querySelector(".token-owner").value.trim();
    const token = row.querySelector(".token-value").value.trim();

    if (!token) continue;
    if (!owner) return null;

    const ownerKey = owner.toLowerCase();
    if (seenOwners.has(ownerKey)) return null;
    seenOwners.add(ownerKey);
    tokens.push({ owner, token });
  }

  return tokens;
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    githubToken: "",
    githubTokens: [],
    ownerOrder: DEFAULT_OWNER_ORDER,
  });
  const storedOwnerOrder = Array.isArray(settings.ownerOrder)
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  const ownerOrder = ownerOrderWithRequiredOwners(storedOwnerOrder);
  const configuredTokens = Array.isArray(settings.githubTokens)
    ? settings.githubTokens.filter((entry) => (
      entry
      && typeof entry.owner === "string"
      && typeof entry.token === "string"
      && entry.owner.trim()
      && entry.token.trim()
    ))
    : [];

  if (!configuredTokens.length && settings.githubToken.trim()) {
    configuredTokens.push({ owner: "JFWooten4", token: settings.githubToken.trim() });
  }

  renderTokenRows(configuredTokens);
  ownerOrderInput.value = ownerOrder.join("\n");
}

addTokenButton.addEventListener("click", () => {
  const row = createTokenRow();
  tokenList.append(row);
  row.querySelector(".token-owner").focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enteredOwnerOrder = ownerOrderFromInput();
  const githubTokens = tokensFromInput();

  if (!enteredOwnerOrder.length) {
    showStatus("Add at least one priority owner.", "error");
    return;
  }

  if (!githubTokens) {
    showStatus("Give every token a unique owner, or remove its incomplete row.", "error");
    return;
  }

  const ownerOrder = ownerOrderWithRequiredOwners(enteredOwnerOrder);
  await chrome.storage.local.set({ githubTokens, ownerOrder });
  await chrome.storage.local.remove("githubToken");
  ownerOrderInput.value = ownerOrder.join("\n");
  showStatus("Settings saved. The ChatGPT dashboard will refresh automatically.", "success");
});

clearTokensButton.addEventListener("click", async () => {
  renderTokenRows([]);
  await chrome.storage.local.remove(["githubToken", "githubTokens"]);
  showStatus("Tokens cleared. Only public repositories will be loaded.", "success");
});

void loadSettings();
