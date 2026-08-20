const DEFAULT_OWNER_ORDER = ["JFWooten4", "blocktransfer", "WhyDRS", "stellar"];
const form = document.getElementById("settings-form");
const tokenInput = document.getElementById("github-token");
const ownerOrderInput = document.getElementById("owner-order");
const clearTokenButton = document.getElementById("clear-token");
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

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    githubToken: "",
    ownerOrder: DEFAULT_OWNER_ORDER,
  });
  const ownerOrder = Array.isArray(settings.ownerOrder)
    ? settings.ownerOrder
    : DEFAULT_OWNER_ORDER;
  tokenInput.value = settings.githubToken;
  ownerOrderInput.value = ownerOrder.join("\n");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const ownerOrder = ownerOrderFromInput();

  if (!ownerOrder.length) {
    showStatus("Add at least one priority owner.", "error");
    return;
  }

  await chrome.storage.local.set({
    githubToken: tokenInput.value.trim(),
    ownerOrder,
  });
  showStatus("Settings saved. The ChatGPT dashboard will refresh automatically.", "success");
});

clearTokenButton.addEventListener("click", async () => {
  tokenInput.value = "";
  await chrome.storage.local.remove("githubToken");
  showStatus("Token cleared. Only public repositories will be loaded.", "success");
});

void loadSettings();
