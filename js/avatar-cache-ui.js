(() => {
  const WIDGET_ID = "github-repositories-for-chatgpt";
  const OWNER_AVATAR_CACHE_KEY = "ownerAvatarCacheV1";
  const OWNER_AVATAR_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const avatarRequests = new Map();
  let avatarCacheRequest = null;
  let avatarCache = {};

  function isAvatarCacheEntry(value) {
    return Boolean(
      value
      && typeof value.dataUrl === "string"
      && value.dataUrl.startsWith("data:image/")
      && Number.isFinite(value.cachedAt),
    );
  }

  async function loadAvatarCache() {
    avatarCacheRequest ||= chrome.storage.local.get({ [OWNER_AVATAR_CACHE_KEY]: {} })
      .then((stored) => {
        const cache = stored[OWNER_AVATAR_CACHE_KEY];
        avatarCache = cache && typeof cache === "object" && !Array.isArray(cache) ? cache : {};
        return avatarCache;
      });
    return avatarCacheRequest;
  }

  function updateMatchingAvatars(sourceUrl, dataUrl) {
    document.querySelectorAll(`#${WIDGET_ID} img.ghrc-owner-avatar`)
      .forEach((avatar) => {
        if (avatar.dataset.ghrcAvatarSource === sourceUrl) avatar.src = dataUrl;
      });
  }

  async function refreshAvatar(sourceUrl) {
    if (avatarRequests.has(sourceUrl)) return avatarRequests.get(sourceUrl);

    const request = chrome.runtime.sendMessage({
      type: "cache-owner-avatar",
      url: sourceUrl,
    }).then((response) => {
      if (!response?.ok || !isAvatarCacheEntry(response)) return;
      avatarCache[sourceUrl] = {
        dataUrl: response.dataUrl,
        cachedAt: response.cachedAt,
      };
      updateMatchingAvatars(sourceUrl, response.dataUrl);
    }).catch(() => {
      // The remote GitHub avatar already assigned by the main renderer remains as fallback.
    }).finally(() => {
      avatarRequests.delete(sourceUrl);
    });

    avatarRequests.set(sourceUrl, request);
    return request;
  }

  async function applyCachedAvatar(avatar) {
    if (!avatar?.isConnected) return;

    const currentSource = avatar.getAttribute("src") || "";
    const sourceUrl = avatar.dataset.ghrcAvatarSource || currentSource;
    if (!sourceUrl.startsWith("https://avatars.githubusercontent.com/")) return;
    avatar.dataset.ghrcAvatarSource = sourceUrl;

    const cache = await loadAvatarCache();
    const entry = cache[sourceUrl];
    if (isAvatarCacheEntry(entry)) {
      avatar.src = entry.dataUrl;
      const age = Math.max(0, Date.now() - entry.cachedAt);
      if (age <= OWNER_AVATAR_CACHE_TTL_MS) return;
    }

    void refreshAvatar(sourceUrl);
  }

  function scanAvatars(root = document) {
    root.querySelectorAll?.(`#${WIDGET_ID} img.ghrc-owner-avatar`).forEach((avatar) => {
      void applyCachedAvatar(avatar);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(`#${WIDGET_ID} img.ghrc-owner-avatar`)) void applyCachedAvatar(node);
        scanAvatars(node);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  scanAvatars();
})();
