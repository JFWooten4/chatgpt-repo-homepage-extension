(() => {
  const artwork = document.getElementById("standalone-artwork");
  const animatedPath = artwork?.dataset.animatedSrc;

  if (artwork && animatedPath) {
    artwork.title = "Artwork by Squeaky_Belle";

    const animatedUrl = chrome.runtime.getURL(animatedPath);
    fetch(animatedUrl)
      .then((response) => {
        if (response.ok) artwork.src = animatedUrl;
      })
      .catch(() => {
        // Keep the bundled WebP fallback until the optional GIF is added.
      });
  }

  const authScript = document.createElement("script");
  authScript.src = chrome.runtime.getURL("js/github-app-auth.js");
  authScript.addEventListener("load", () => {
    void globalThis.GitHubAppAuth?.mountSettingsUi({ popup: false });
  });
  document.head.append(authScript);
})();
