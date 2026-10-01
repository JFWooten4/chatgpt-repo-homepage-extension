(() => {
  const browser = document.getElementById("codex-bridge-browser");
  function render() {
    document.getElementById("codex-bridge-install-command").textContent =
      `python3 native/install.py --extension-id ${chrome.runtime.id} --browser ${browser.value} --settings-only`;
  }
  browser.addEventListener("change", render);
  render();
})();
