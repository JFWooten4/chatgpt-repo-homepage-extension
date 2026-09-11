(() => {
  const ORIGIN = 'https://connector-openai-deep-research.web-sandbox.oaiusercontent.com';
  const HOST = 'org.research.publisher';
  const CONNECTION_KEY = 'researchPublisherConnection';
  const inFlight = new Set();

  function connectionState(result) {
    if (!result?.ok) return { ok: false, checkedAt: Date.now() };
    return {
      ok: true,
      repository: typeof result.repository === 'string' ? result.repository : '',
      branch: typeof result.branch === 'string' ? result.branch : '',
      checkedAt: Date.now(),
    };
  }

  async function recordConnection(result) {
    try {
      await chrome.storage.local.set({ [CONNECTION_KEY]: connectionState(result) });
    } catch {
      // Connection state is only UI synchronization; the native response remains authoritative.
    }
  }

  function connectionError(error) {
    const detail = typeof error?.message === 'string' ? error.message.trim() : '';
    return new Error(
      `${detail ? `Connection unavailable: ${detail}.` : 'Connection unavailable.'} `
      + 'Use Link repository in extension settings to install or update the bridge.',
    );
  }

  async function sendToNative(payload, publishing) {
    let result;
    try {
      result = await chrome.runtime.sendNativeMessage(HOST, payload);
    } catch (error) {
      await recordConnection({ ok: false });
      throw connectionError(error);
    }

    if (!result?.ok) {
      if (!publishing) await recordConnection({ ok: false });
      throw new Error(result?.error || (publishing
        ? 'Publishing failed. Check the repository connection and try again.'
        : 'The native publisher did not confirm the linked repository.'));
    }

    await recordConnection(result);
    return result;
  }

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!['publish-research-report', 'research-publisher-status'].includes(message?.type)) return false;
    (async () => {
      if (sender.id !== chrome.runtime.id) throw new Error('Unknown extension.');
      const settings = await chrome.storage.local.get({ researchPublisherEnabled: false });
      if (!settings.researchPublisherEnabled) throw new Error('Enable Deep research publisher in settings first.');
      const publishing = message.type === 'publish-research-report';
      let payload = { action: 'status' };
      let key;
      if (publishing) {
        if (new URL(sender.url).origin !== ORIGIN || new URL(sender.tab?.url).origin !== 'https://chatgpt.com') {
          throw new Error('Publish from a completed ChatGPT research report.');
        }
        if (typeof message.title !== 'string' || !message.title.trim() || message.title.length > 500
          || typeof message.markdown !== 'string' || !message.markdown.trim()
          || new TextEncoder().encode(message.markdown).length > 4 * 1024 * 1024) throw new Error('Invalid or oversized report.');
        const source = new URL(sender.tab.url);
        payload = { action: 'publish', title: message.title, markdown: message.markdown, source: source.origin + source.pathname };
        key = `${sender.tab.id}:${message.title}`;
        if (inFlight.has(key)) throw new Error('This report is already being added.');
        inFlight.add(key);
      }
      try {
        return await sendToNative(payload, publishing);
      } finally { if (key) inFlight.delete(key); }
    })().then(respond, (error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
