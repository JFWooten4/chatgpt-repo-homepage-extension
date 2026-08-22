(() => {
  const NEW_CHAT_ATTR = "data-ghrc-new-chat";
  const COMPACT_HEADER_ATTR = "data-ghrc-compact-header";
  const COMPOSER_STACK_CLASS = "ghrc-compact-composer-stack";
  const WELCOME_REGION_CLASS = "ghrc-compact-welcome-region";
  const SETTLE_DELAY_MS = 120;
  let settleTimer = null;
  let activeStack = null;
  let activeWelcomeRegion = null;

  function findComposer() {
    const prompt = document.querySelector("#prompt-textarea");
    if (!prompt) return null;

    return prompt.closest("form") || prompt.closest('[data-type="unified-composer"]');
  }

  function compactModeEnabled() {
    const root = document.documentElement;
    return root.hasAttribute(NEW_CHAT_ATTR)
      && root.hasAttribute(COMPACT_HEADER_ATTR);
  }

  function clearCompactLayout() {
    document.querySelectorAll(`.${COMPOSER_STACK_CLASS}`).forEach((element) => {
      element.classList.remove(COMPOSER_STACK_CLASS);
    });
    document.querySelectorAll(`.${WELCOME_REGION_CLASS}`).forEach((element) => {
      element.classList.remove(WELCOME_REGION_CLASS);
    });
    activeStack = null;
    activeWelcomeRegion = null;
  }

  function welcomeRegionFor(hiddenHeading, stack, composer) {
    let welcomeRegion = hiddenHeading;
    while (
      welcomeRegion.parentElement
      && welcomeRegion.parentElement !== stack
      && !welcomeRegion.parentElement.contains(composer)
    ) {
      welcomeRegion = welcomeRegion.parentElement;
    }

    return welcomeRegion === hiddenHeading ? null : welcomeRegion;
  }

  function setActiveStack(nextStack) {
    if (activeStack === nextStack) return;
    activeStack?.classList.remove(COMPOSER_STACK_CLASS);
    activeStack = nextStack;
    activeStack?.classList.add(COMPOSER_STACK_CLASS);
  }

  function setActiveWelcomeRegion(nextWelcomeRegion) {
    if (activeWelcomeRegion === nextWelcomeRegion) return;
    activeWelcomeRegion?.classList.remove(WELCOME_REGION_CLASS);
    activeWelcomeRegion = nextWelcomeRegion;
    activeWelcomeRegion?.classList.add(WELCOME_REGION_CLASS);
  }

  function applyCompactLayout() {
    if (!compactModeEnabled()) {
      clearCompactLayout();
      return;
    }

    const composer = findComposer();
    if (!composer) return;

    const stackStillValid = activeStack?.isConnected && activeStack.contains(composer);
    if (!stackStillValid) {
      setActiveStack(composer.parentElement);
    }

    const hiddenHeading = document.querySelector(".ghrc-hidden-welcome");
    if (!hiddenHeading) return;

    const welcomeStillValid = activeWelcomeRegion?.isConnected
      && activeWelcomeRegion.contains(hiddenHeading)
      && !activeWelcomeRegion.contains(composer);
    if (!welcomeStillValid) {
      setActiveWelcomeRegion(welcomeRegionFor(hiddenHeading, activeStack, composer));
    }
  }

  function scheduleCompactLayout(delay = SETTLE_DELAY_MS) {
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      requestAnimationFrame(applyCompactLayout);
    }, delay);
  }

  const pageObserver = new MutationObserver(() => {
    if (!compactModeEnabled()) return;

    const composer = findComposer();
    const targetsStillValid = composer
      && activeStack?.isConnected
      && activeStack.contains(composer)
      && activeWelcomeRegion?.isConnected;

    if (!targetsStillValid) scheduleCompactLayout();
  });
  pageObserver.observe(document.documentElement, { childList: true, subtree: true });

  const preferenceObserver = new MutationObserver(() => {
    if (!compactModeEnabled()) {
      if (settleTimer !== null) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      clearCompactLayout();
      return;
    }

    scheduleCompactLayout(0);
  });
  preferenceObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: [NEW_CHAT_ATTR, COMPACT_HEADER_ATTR],
  });

  scheduleCompactLayout();
})();
