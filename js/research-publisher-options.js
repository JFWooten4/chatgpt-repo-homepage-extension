(() => {
  const checkbox = document.getElementById("research-publisher-enabled");
  const controls = document.getElementById("research-publisher-controls");
  const launch = document.getElementById("check-research-publisher");
  const status = document.getElementById("research-publisher-status");
  let busy = false;
  const render = (enabled) => {
    checkbox.checked = enabled;
    controls.hidden = !enabled;
    launch.disabled = !enabled || busy;
  };
  checkbox.disabled = true;
  chrome.storage.local.get({ researchPublisherEnabled: false }).then((settings) => {
    render(Boolean(settings.researchPublisherEnabled));
    checkbox.disabled = false;
  }).catch(() => { status.textContent = "Could not load publisher settings. Reopen settings to retry."; });
  checkbox.addEventListener("change", async () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    try {
      await chrome.storage.local.set({ researchPublisherEnabled: enabled });
      render(enabled);
      status.textContent = "";
    } catch {
      render(!enabled);
      status.textContent = "Could not save publisher settings. Try again.";
    } finally { checkbox.disabled = false; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.researchPublisherEnabled) render(Boolean(changes.researchPublisherEnabled.newValue));
  });
  launch.addEventListener("click", async () => {
    busy = true;
    launch.disabled = true;
    status.textContent = "Checking repository connection…";
    try {
      const result = await chrome.runtime.sendMessage({ type: "research-publisher-status" });
      status.textContent = result?.ok
        ? `Linked to ${result.repository} (${result.branch}). Use Add to repo beside the final report’s download button.`
        : result?.error || "Could not connect to the repository.";
    } catch { status.textContent = "Connection unavailable. Reload the extension and try again."; }
    finally { busy = false; launch.disabled = !checkbox.checked; }
  });
})();
