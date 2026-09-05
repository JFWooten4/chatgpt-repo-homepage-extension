(() => {
  const WIDGET_ID = "github-repositories-for-chatgpt";
  const AREA_CLASS = "ghrc-reference-search-area";
  const INPUT_CLASS = "ghrc-reference-search-input";

  function linkIcon() {
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "ghrc-reference-search-icon");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M10.59 13.41a2 2 0 0 1 0-2.82l3.88-3.88a2 2 0 1 1 2.83 2.83l-1.77 1.76 1.42 1.42 1.76-1.77a4 4 0 0 0-5.65-5.65l-3.89 3.88a4 4 0 0 0 0 5.65l.71.71 1.42-1.42-.71-.71Zm2.82-2.82-1.42 1.42.71.71a2 2 0 0 1 0 2.82l-3.88 3.88a2 2 0 1 1-2.83-2.83l1.77-1.76-1.42-1.42-1.76 1.77a4 4 0 0 0 5.65 5.65l3.89-3.88a4 4 0 0 0 0-5.65l-.71-.71Z",
    );
    icon.append(path);
    return icon;
  }

  function searchReferences(query) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const url = new URL("https://wooten.link/search/");
    url.searchParams.set("q", trimmedQuery);
    window.location.assign(url.toString());
  }

  function createSearchArea() {
    const area = document.createElement("div");
    area.className = AREA_CLASS;

    const form = document.createElement("form");
    form.className = "ghrc-search ghrc-reference-search";
    form.setAttribute("role", "search");
    form.setAttribute("aria-label", "Search wooten.link references");
    form.append(linkIcon());

    const input = document.createElement("input");
    input.className = INPUT_CLASS;
    input.type = "search";
    input.placeholder = "Search wooten.link references…";
    input.setAttribute("aria-label", "Search wooten.link references");
    input.autocomplete = "off";
    input.spellcheck = false;
    form.append(input);

    const shortcut = document.createElement("kbd");
    shortcut.textContent = "Alt W";
    form.append(shortcut);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      searchReferences(input.value);
    });

    area.append(form);
    return area;
  }

  function mountReferenceSearch() {
    const widget = document.getElementById(WIDGET_ID);
    if (!widget || widget.querySelector(`.${AREA_CLASS}`)) return;

    const columns = widget.querySelector(".ghrc-columns");
    if (!columns) return;
    columns.insertAdjacentElement("beforebegin", createSearchArea());
  }

  document.addEventListener("keydown", (event) => {
    if (!event.altKey || event.key.toLowerCase() !== "w") return;

    const input = document.querySelector(`#${WIDGET_ID} .${INPUT_CLASS}`);
    if (!input) return;
    event.preventDefault();
    input.focus();
  });

  mountReferenceSearch();
  new MutationObserver(mountReferenceSearch).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
