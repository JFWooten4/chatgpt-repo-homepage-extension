(() => {
  const BOOT_ATTR = "data-ghrc-homepage-booting";
  const WIDGET_ID = "github-repositories-for-chatgpt";
  const LOADING_TEXT = "Loading repositories…";
  const FAIL_OPEN_MILLISECONDS = 4000;

  if (location.pathname !== "/") return;

  const root = document.documentElement;
  if (!root) return;

  root.setAttribute(BOOT_ATTR, "true");

  let revealed = false;
  let observer = null;
  let failOpenTimer = null;

  function reveal() {
    if (revealed) return;
    revealed = true;
    observer?.disconnect();
    if (failOpenTimer !== null) clearTimeout(failOpenTimer);

    requestAnimationFrame(() => {
      root.removeAttribute(BOOT_ATTR);
    });
  }

  function revealWhenReady() {
    if (location.pathname !== "/") {
      reveal();
      return;
    }

    const widget = document.getElementById(WIDGET_ID);
    if (!widget) return;

    const isLoading = [...widget.querySelectorAll(".ghrc-state")]
      .some((element) => element.textContent.trim() === LOADING_TEXT);

    if (!isLoading) reveal();
  }

  observer = new MutationObserver(revealWhenReady);
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  failOpenTimer = window.setTimeout(reveal, FAIL_OPEN_MILLISECONDS);
  window.navigation?.addEventListener("navigate", (event) => {
    if (new URL(event.destination.url).pathname !== "/") reveal();
  });
  window.addEventListener("popstate", revealWhenReady);
  window.addEventListener("pageshow", revealWhenReady, { once: true });
  revealWhenReady();
})();
