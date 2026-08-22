(() => {
  const LAUNCHER_ID = "ghrc-spellcheck-gpt-launcher";
  const HOST_ATTR = "data-ghrc-spellcheck-launcher-host";
  const ENABLED_KEY = "showSpellcheckGptLauncher";
  const LEGACY_ICON_KEY = "spellcheckGptCanonicalIcon";
  const GPT_NAME = "Spellcheck Only";
  const GPT_PATH = "/g/g-dyK63miav-spellcheck-only";
  const ICON_PATH = "artwork/spellcheck-only.png";

  let enabled = false;
  let mountScheduled = false;

  function isHomePage() {
    return location.pathname === "/";
  }

  function findComposer() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt) return null;
    return prompt.closest("form") || prompt.closest('[data-type="unified-composer"]');
  }

  function removeLauncher() {
    document.getElementById(LAUNCHER_ID)?.remove();
    document.querySelectorAll(`[${HOST_ATTR}]`).forEach((host) => {
      host.removeAttribute(HOST_ATTR);
    });
  }

  function createLauncher() {
    const button = document.createElement("button");
    button.id = LAUNCHER_ID;
    button.type = "button";
    button.title = `Open ${GPT_NAME}`;
    button.setAttribute("aria-label", `Open ${GPT_NAME} GPT`);

    const image = document.createElement("img");
    image.src = chrome.runtime.getURL(ICON_PATH);
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.append(image);

    button.addEventListener("click", () => {
      location.assign(GPT_PATH);
    });

    return button;
  }

  function mountLauncher() {
    if (!enabled || !isHomePage()) {
      removeLauncher();
      return;
    }

    const composer = findComposer();
    if (!composer) return;

    let launcher = document.getElementById(LAUNCHER_ID);
    if (!launcher || launcher.parentElement !== composer) {
      launcher?.remove();
      launcher = createLauncher();
      composer.append(launcher);
    }
    composer.setAttribute(HOST_ATTR, "true");
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      mountLauncher();
    });
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get({ [ENABLED_KEY]: false });
    enabled = Boolean(settings[ENABLED_KEY]);
    await chrome.storage.local.remove(LEGACY_ICON_KEY);
    scheduleMount();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[ENABLED_KEY]) return;
    enabled = Boolean(changes[ENABLED_KEY].newValue);
    scheduleMount();
  });

  void loadSettings();
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
