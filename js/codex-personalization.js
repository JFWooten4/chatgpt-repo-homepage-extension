(() => {
  const HOST = "org.research.publisher";
  const INSTRUCTIONS_KEY = "codexCustomInstructions";
  const COAUTHOR_KEY = "codexWebCoauthor";
  const instructions = document.getElementById("codex-custom-instructions");
  const coauthor = document.getElementById("codex-web-coauthor");
  const pgp = document.getElementById("codex-pgp-secret-key");
  const importFromChatGPT = document.getElementById("sync-chatgpt-personalization");
  const syncToCodex = document.getElementById("sync-codex-personalization");
  const importPgp = document.getElementById("import-codex-pgp-key");
  const status = document.getElementById("codex-personalization-status");
  let busy = false;

  function showStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  async function native(payload) {
    try {
      const result = await chrome.runtime.sendNativeMessage(HOST, payload);
      if (!result?.ok) throw new Error(result?.error || "The local Codex bridge did not complete the request.");
      return result;
    } catch (error) {
      throw new Error(
        `${error?.message || "Local bridge unavailable."} Use Set up local bridge to install or refresh it.`,
      );
    }
  }

  async function saveBrowserCopy() {
    await chrome.storage.local.set({
      [INSTRUCTIONS_KEY]: instructions.value.trim(),
      [COAUTHOR_KEY]: coauthor.checked,
    });
  }

  async function sync({ pgpSecretKey = "" } = {}) {
    if (busy) return;
    busy = true;
    syncToCodex.disabled = true;
    importPgp.disabled = true;
    try {
      await saveBrowserCopy();
      const result = await native({
        action: "sync-codex-settings",
        instructions: instructions.value.trim(),
        webCodexCoauthor: coauthor.checked,
        pgpSecretKey,
      });
      if (pgpSecretKey) pgp.value = "";
      showStatus(
        result.signingKey
          ? `Synced to ${result.agentsPath}. Signing key ${result.signingKey} is configured.`
          : `Synced to ${result.agentsPath}.`,
        "success",
      );
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      busy = false;
      syncToCodex.disabled = false;
      importPgp.disabled = false;
    }
  }

  async function load() {
    const stored = await chrome.storage.local.get([INSTRUCTIONS_KEY, COAUTHOR_KEY]);
    let bridge = null;
    try {
      bridge = await native({ action: "codex-settings-status" });
    } catch (error) {
      showStatus(error.message, "error");
    }

    if (typeof stored[INSTRUCTIONS_KEY] === "string") {
      instructions.value = stored[INSTRUCTIONS_KEY];
    } else if (typeof bridge?.instructions === "string") {
      instructions.value = bridge.instructions;
    }

    if (typeof stored[COAUTHOR_KEY] === "boolean") {
      coauthor.checked = stored[COAUTHOR_KEY];
    } else if (typeof bridge?.webCodexCoauthor === "boolean") {
      coauthor.checked = bridge.webCodexCoauthor;
    } else {
      coauthor.checked = true;
    }

    if (bridge?.ok) {
      showStatus(`Local bridge connected. Codex personalization: ${bridge.agentsPath}.`, "success");
    }
  }

  importFromChatGPT.addEventListener("click", async () => {
    try {
      const value = (await navigator.clipboard.readText()).trim();
      if (!value) throw new Error("Clipboard is empty.");
      instructions.value = value;
      await sync();
    } catch (error) {
      showStatus(`Could not read ChatGPT custom instructions: ${error.message}`, "error");
    }
  });

  syncToCodex.addEventListener("click", () => void sync());
  coauthor.addEventListener("change", () => void sync());
  instructions.addEventListener("change", () => void sync());
  importPgp.addEventListener("click", () => {
    const secret = pgp.value.trim();
    if (!secret) {
      showStatus("Paste an ASCII-armored PGP secret key first.", "error");
      return;
    }
    void sync({ pgpSecretKey: secret });
  });

  void load();
})();
