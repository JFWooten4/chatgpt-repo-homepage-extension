(() => {
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type !== "launch-research-publisher") return false;
    (async () => {
      if (sender.id !== chrome.runtime.id) throw new Error("Unknown extension.");
      const settings = await chrome.storage.local.get({ researchPublisherEnabled: false });
      if (!settings.researchPublisherEnabled) throw new Error("Enable Deep research publisher in settings first.");
      try {
        const result = await chrome.runtime.sendNativeMessage("org.research.publisher", { action: "launch" });
        if (!result?.ok) throw new Error(result?.error || "The publisher could not be opened.");
        return { ok: true };
      } catch {
        throw new Error("Could not open the publisher. Use Link publisher in extension settings to install or repair the connection.");
      }
    })().then(respond, (error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
