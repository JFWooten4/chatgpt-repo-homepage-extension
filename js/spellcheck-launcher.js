(() => {
  const LAUNCHER_ID = "ghrc-spellcheck-gpt-launcher";
  const HOST_ATTR = "data-ghrc-spellcheck-launcher-host";
  const ENABLED_KEY = "showSpellcheckGptLauncher";
  const ICON_KEY = "spellcheckGptCanonicalIcon";
  const GPT_NAME = "Spellcheck Only";
  const GPT_PATH = "/g/g-dyK63miav-spellcheck-only";

  let enabled = false;
  let canonicalIcon = "";
  let mountScheduled = false;
  let iconRequest = null;

  function isHomePage() {
    return location.pathname === "/";
  }

  function isSpellcheckPage() {
    return location.pathname === GPT_PATH;
  }

  function findComposer() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt) return null;
    return prompt.closest("form") || prompt.closest('[data-type="unified-composer"]');
  }

  function absoluteImageUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(value, location.origin);
      return /^https?:$/.test(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function canonicalImageFromDocument(doc) {
    const metadataCandidates = [
      doc.querySelector('meta[property="og:image"]')?.content,
      doc.querySelector('meta[property="og:image:url"]')?.content,
      doc.querySelector('meta[name="twitter:image"]')?.content,
      doc.querySelector('link[rel="image_src"]')?.href,
    ];

    for (const candidate of metadataCandidates) {
      const url = absoluteImageUrl(candidate);
      if (url) return url;
    }

    const namedImage = [...doc.querySelectorAll("img")].find((image) => {
      const label = [image.alt, image.title, image.getAttribute("aria-label")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return label.includes(GPT_NAME.toLowerCase());
    });

    return absoluteImageUrl(namedImage?.currentSrc || namedImage?.src);
  }

  async function rememberCanonicalIcon(url) {
    if (!url || url === canonicalIcon) return;
    canonicalIcon = url;
    await chrome.storage.local.set({ [ICON_KEY]: url });
  }

  function captureIconFromSpellcheckPage() {
    if (!isSpellcheckPage()) return;
    const url = canonicalImageFromDocument(document);
    if (url) void rememberCanonicalIcon(url);
  }

  async function fetchCanonicalIcon() {
    if (canonicalIcon) return canonicalIcon;
    if (iconRequest) return iconRequest;

    iconRequest = fetch(GPT_PATH, { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`GPT page returned ${response.status}`);
        return response.text();
      })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return canonicalImageFromDocument(doc);
      })
      .then(async (url) => {
        if (url) await rememberCanonicalIcon(url);
        return url;
      })
      .catch(() => "")
      .finally(() => {
        iconRequest = null;
      });

    return iconRequest;
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
    button.hidden = true;
    button.title = `Open ${GPT_NAME}`;
    button.setAttribute("aria-label", `Open ${GPT_NAME} GPT`);

    const image = document.createElement("img");
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.append(image);

    button.addEventListener("click", () => {
      location.assign(GPT_PATH);
    });

    return button;
  }

  async function mountLauncher() {
    captureIconFromSpellcheckPage();

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

    const icon = canonicalIcon || await fetchCanonicalIcon();
    if (!launcher.isConnected || !enabled || !isHomePage()) return;
    if (!icon) {
      launcher.remove();
      composer.removeAttribute(HOST_ATTR);
      return;
    }

    launcher.querySelector("img").src = icon;
    launcher.hidden = false;
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      void mountLauncher();
    });
  }

  async function loadSettings() {
    const settings = await chrome.storage.local.get({
      [ENABLED_KEY]: false,
      [ICON_KEY]: "",
    });
    enabled = Boolean(settings[ENABLED_KEY]);
    canonicalIcon = typeof settings[ICON_KEY] === "string" ? settings[ICON_KEY] : "";
    scheduleMount();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    if (changes[ENABLED_KEY]) {
      enabled = Boolean(changes[ENABLED_KEY].newValue);
      scheduleMount();
    }
    if (changes[ICON_KEY]) {
      canonicalIcon = typeof changes[ICON_KEY].newValue === "string"
        ? changes[ICON_KEY].newValue
        : "";
      scheduleMount();
    }
  });

  void loadSettings();
  captureIconFromSpellcheckPage();
  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
