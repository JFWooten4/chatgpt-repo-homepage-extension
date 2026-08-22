(() => {
  const artwork = document.getElementById("standalone-artwork");
  const animatedPath = artwork?.dataset.animatedSrc;
  if (!artwork || !animatedPath) return;

  artwork.title = "Artwork by Squeaky_Belle";

  const animatedUrl = chrome.runtime.getURL(animatedPath);
  fetch(animatedUrl)
    .then((response) => {
      if (response.ok) artwork.src = animatedUrl;
    })
    .catch(() => {
      // Keep the bundled WebP fallback until the optional GIF is added.
    });
})();
