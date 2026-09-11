(() => {
  const BUTTON = 'ghrc-add-research-report';
  const PAGE = '[class*="_reportPage_"]';
  const CONNECTION_KEY = 'researchPublisherConnection';
  const MAX_BYTES = 4 * 1024 * 1024;
  const documents = new WeakSet();
  let enabled = false;
  let connected = false;
  let scheduled = false;
  let frameTimer;
  let connectionGeneration = 0;

  function publisherAvailable() {
    return enabled && connected;
  }

  function reportScope(download) {
    // The export control and paginated report share a card ancestor.
    for (let node = download.parentElement; node && node !== download.ownerDocument.body; node = node.parentElement) {
      if (node.querySelector(PAGE)) return node;
    }
    return null;
  }

  function reportPayload(scope) {
    const pages = [...scope.querySelectorAll(PAGE)];
    const title = pages[0]?.querySelector('h1')?.textContent.trim();
    if (!title || !pages.length) throw new Error('The complete report is not ready yet. Try again after it finishes.');
    const root = scope.ownerDocument.createElement('div');
    pages.forEach((page) => root.append(page.cloneNode(true)));
    root.querySelectorAll('script, style, button, [aria-hidden="true"]').forEach((node) => node.remove());
    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
    converter.use(turndownPluginGfm.gfm);
    const links = new Set();
    converter.addRule('report-links', {
      filter: 'a',
      replacement(content, node) {
        const raw = node.getAttribute('href');
        if (!raw) return content;
        let url;
        try { url = new URL(raw, scope.ownerDocument.URL); } catch { return content; }
        if (!['https:', 'http:'].includes(url.protocol)) return content;
        if (links.has(url.href)) return content === url.href ? '' : content;
        links.add(url.href);
        if (url.hostname === 'github.com') return url.href;
        return `[${content || url.hostname}](${url.href.replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
      },
    });
    const markdown = converter.turndown(root).trim() + '\n';
    if (new TextEncoder().encode(markdown).length > MAX_BYTES) throw new Error('This report is too large to publish through the extension.');
    return { title, markdown };
  }

  function mount(doc) {
    if (!documents.has(doc)) {
      documents.add(doc);
      const style = doc.createElement('style');
      style.textContent = `.${BUTTON}{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:32px;height:32px;padding:6px;border:0;border-radius:6px;background:transparent;color:inherit;cursor:pointer}.${BUTTON}:hover{background:color-mix(in srgb,currentColor 10%,transparent)}.${BUTTON}:focus-visible{outline:2px solid currentColor;outline-offset:2px}.${BUTTON}:disabled{opacity:.55;cursor:default}.ghrc-report-status{font-size:12px;line-height:1.4;padding:6px 12px;overflow-wrap:anywhere}.ghrc-report-status:empty{display:none}`;
      (doc.head || doc.documentElement).append(style);
      new MutationObserver(schedule).observe(doc, { childList: true, subtree: true });
      doc.addEventListener('load', schedule, true);
    }
    if (!publisherAvailable()) {
      doc.querySelectorAll(`.${BUTTON}, .ghrc-report-status`).forEach((node) => node.remove());
    } else {
      for (const download of doc.querySelectorAll('button[aria-label="Export"], button[aria-label="Download"]')) {
        const scope = reportScope(download);
        if (!scope) continue;
        // Export is inside a popover wrapper; insert before that wrapper in its flex row.
        const anchor = !download.parentElement.querySelector('button[aria-label="Expand"], button[aria-label="Collapse"]') ? download.parentElement : download;
        const row = anchor.parentElement;
        if (row.querySelector(`.${BUTTON}`)) continue;
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = BUTTON;
        button.title = 'Add report to linked repository';
        button.setAttribute('aria-label', 'Add to repo');
        button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h9M7 3v18M10 7h3M18 9v10M13 14h10"/></svg>';
        const status = doc.createElement('div');
        status.className = 'ghrc-report-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        scope.append(status);
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!event.isTrusted || !publisherAvailable() || button.disabled) return;
          button.disabled = true;
          button.setAttribute('aria-busy', 'true');
          status.textContent = 'Adding report to repository…';
          try {
            const report = reportPayload(scope);
            const result = await chrome.runtime.sendMessage({ type: 'publish-research-report', ...report });
            if (!result?.ok) throw new Error(result?.error || 'Publishing failed. Try again.');
            button.title = `${result.unchanged ? 'Already in' : 'Added to'} ${result.repository} (${result.branch})`;
            button.setAttribute('aria-label', 'Report added to repo');
            status.textContent = `${result.unchanged ? 'Already up to date' : 'Added'}: ${result.repository} / ${result.path} (${result.branch}).`;
          } catch (error) {
            status.textContent = error.message || 'Connection unavailable. Reload this page and try again.';
            button.disabled = false;
          } finally { button.removeAttribute('aria-busy'); }
        });
        row.insertBefore(button, anchor);
      }
    }
    for (const frame of doc.querySelectorAll('iframe')) {
      try { if (frame.contentDocument?.documentElement) mount(frame.contentDocument); } catch { /* Cross-origin frames have their own content script. */ }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; mount(document); });
  }

  async function checkConnection() {
    const generation = ++connectionGeneration;
    connected = false;
    schedule();
    try {
      const result = await chrome.runtime.sendMessage({ type: 'research-publisher-status' });
      if (generation !== connectionGeneration || !enabled) return;
      connected = Boolean(result?.ok);
    } catch {
      if (generation !== connectionGeneration || !enabled) return;
      connected = false;
    }
    schedule();
  }

  function updateEnabled(value) {
    enabled = Boolean(value);
    connectionGeneration += 1;
    connected = false;
    clearInterval(frameTimer);
    // The sandbox can document.open() an existing inner frame, replacing its observers.
    // Revisit it while enabled so document replacement and delayed report loads recover.
    if (enabled) {
      frameTimer = setInterval(schedule, 1000);
      void checkConnection();
    }
    schedule();
  }

  chrome.storage.local.get({ researchPublisherEnabled: false }).then((settings) => {
    updateEnabled(settings.researchPublisherEnabled);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.researchPublisherEnabled) {
      updateEnabled(changes.researchPublisherEnabled.newValue);
      return;
    }
    if (changes[CONNECTION_KEY] && enabled) {
      connected = Boolean(changes[CONNECTION_KEY].newValue?.ok);
      schedule();
    }
  });
})();
