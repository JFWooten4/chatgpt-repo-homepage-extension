(() => {
  "use strict";

  const WIDGET_ID = "github-repositories-for-chatgpt";
  const SECTION_ID = "ghrc-highlighted-pages";
  const STORAGE_KEY = "highlightedPages";
  let mountScheduled = false;

  function normalizedPages(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).filter((page) => {
      if (!page || typeof page.url !== "string") return false;
      const key = page.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createFallback(page) {
    const fallback = document.createElement("div");
    fallback.className = "ghrc-highlighted-page-fallback";
    if (page.faviconDataUrl) {
      const icon = document.createElement("img");
      icon.src = page.faviconDataUrl;
      icon.alt = "";
      fallback.append(icon);
    } else {
      fallback.textContent = (page.hostname || "?").slice(0, 1).toUpperCase();
    }
    return fallback;
  }

  function createCard(page) {
    const card = document.createElement("a");
    card.className = "ghrc-highlighted-page";
    if (page.documentType === "pdf") card.classList.add("ghrc-highlighted-page-pdf");
    card.href = page.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.title = page.url;

    if (page.imageDataUrl) {
      const image = document.createElement("img");
      image.className = "ghrc-highlighted-page-image";
      image.src = page.imageDataUrl;
      image.alt = "";
      card.append(image);
    } else {
      card.append(createFallback(page));
    }

    const copy = document.createElement("span");
    copy.className = "ghrc-highlighted-page-copy";
    const title = document.createElement("strong");
    title.textContent = page.title || page.url;
    const host = document.createElement("small");
    host.textContent = page.siteName || page.hostname || new URL(page.url).hostname;
    copy.append(title, host);

    if (page.description) {
      const description = document.createElement("span");
      description.className = "ghrc-highlighted-page-description";
      description.textContent = page.description;
      copy.append(description);
    }

    card.append(copy);
    return card;
  }

  async function mount() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;

    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    if (!widget.isConnected) return;
    const pages = normalizedPages(stored[STORAGE_KEY]);
    widget.querySelector(`#${SECTION_ID}`)?.remove();
    if (!pages.length) return;

    const section = document.createElement("section");
    section.id = SECTION_ID;
    section.className = "ghrc-highlighted-pages";
    section.setAttribute("aria-label", "Highlighted webpages");

    const heading = document.createElement("h2");
    heading.textContent = "Highlighted webpages";
    const row = document.createElement("div");
    row.className = "ghrc-highlighted-pages-row";
    row.append(...pages.map(createCard));
    section.append(heading, row);

    const footer = widget.querySelector(".ghrc-dashboard-footer");
    if (footer) widget.insertBefore(section, footer);
    else widget.append(section);
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    requestAnimationFrame(() => {
      mountScheduled = false;
      void mount();
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes[STORAGE_KEY]) scheduleMount();
  });

  const observer = new MutationObserver((mutations) => {
    if (document.getElementById(SECTION_ID)) return;
    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;
    const widgetChanged = mutations.some((mutation) => (
      mutation.target === widget
      || [...mutation.addedNodes, ...mutation.removedNodes].some((node) => (
        node instanceof Element
        && (node.id === WIDGET_ID || Boolean(node.querySelector?.(`#${WIDGET_ID}`)))
      ))
    ));
    if (widgetChanged) scheduleMount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleMount();
})();
