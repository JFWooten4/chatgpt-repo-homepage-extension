(() => {
  const ORIGIN = 'https://connector-openai-deep-research.web-sandbox.oaiusercontent.com';
  const inFlight = new Set();
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
        let result;
        try { result = await chrome.runtime.sendNativeMessage('org.research.publisher', payload); }
        catch { throw new Error('Connection unavailable. Use Link repository in extension settings to install or update the bridge.'); }
        if (!result?.ok) throw new Error(result?.error || 'Publishing failed. Check the repository connection and try again.');
        return result;
      } finally { if (key) inFlight.delete(key); }
    })().then(respond, (error) => respond({ ok: false, error: error.message }));
    return true;
  });
})();
