(() => {
  const NEW_CHAT_ATTR = "data-ghrc-new-chat";
  const COMPACT_HEADER_ATTR = "data-ghrc-compact-header";
  const COMPOSER_STACK_CLASS = "ghrc-compact-composer-stack";
  const WELCOME_REGION_CLASS = "ghrc-compact-welcome-region";
  let scheduled = false;

  function findComposer() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt) return null;

    return prompt.closest("form") || prompt.closest('[data-type="unified-composer"]');
  }

  function clearCompactLayout() {
    document.querySelectorAll(`.${COMPOSER_STACK_CLASS}`).forEach((element) => {
      element.classList.remove(COMPOSER_STACK_CLASS);
    });
    document.querySelectorAll(`.${WELCOME_REGION_CLASS}`).forEach((element) => {
      element.classList.remove(WELCOME_REGION_CLASS);
    });
  }

  function applyCompactLayout() {
    clearCompactLayout();

    const root = document.documentElement;
    if (
      !root.hasAttribute(NEW_CHAT_ATTR)
      || !root.hasAttribute(COMPACT_HEADER_ATTR)
    ) {
      return;
    }

    const composer = findComposer();
    if (!composer) return;

    const stack = composer.parentElement;
    if (stack) stack.classList.add(COMPOSER_STACK_CLASS);

    const hiddenHeading = document.querySelector(".ghrc-hidden-welcome");
    if (!hiddenHeading) return;

    let welcomeRegion = hiddenHeading;
    while (
      welcomeRegion.parentElement
      && welcomeRegion.parentElement !== stack
      && !welcomeRegion.parentElement.contains(composer)
    ) {
      welcomeRegion = welcomeRegion.parentElement;
    }

    if (welcomeRegion !== hiddenHeading) {
      welcomeRegion.classList.add(WELCOME_REGION_CLASS);
    }
  }

  function scheduleCompactLayout() {
    if (scheduled) return;
    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      applyCompactLayout();
    });
  }

  const pageObserver = new MutationObserver(scheduleCompactLayout);
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  const preferenceObserver = new MutationObserver(scheduleCompactLayout);
  preferenceObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [NEW_CHAT_ATTR, COMPACT_HEADER_ATTR],
  });

  scheduleCompactLayout();
})();
