(() => {
  const WIDGET_ID = "github-repositories-for-chatgpt";
  const NEW_CHAT_ATTR = "data-ghrc-new-chat";
  const COMPACT_HEADER_ATTR = "data-ghrc-compact-header";
  const COMPACT_LAYOUT_READY_ATTR = "data-ghrc-compact-layout-ready";
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
    document.documentElement.removeAttribute(COMPACT_LAYOUT_READY_ATTR);
    activeStack = null;
    activeWelcomeRegion = null;
  }

  function findWelcomeHeading(composer) {
    const existing = document.querySelector(".ghrc-hidden-welcome");
    if (existing) return existing;

    const main = composer.closest("main") || document.querySelector("main");
    if (!main) return null;

    const composerBounds = composer.getBoundingClientRect();
    const candidates = [...main.querySelectorAll('h1, h2, [role="heading"]')]
      .filter((heading) => {
        if (!heading.textContent.trim() || heading.closest(`#${WIDGET_ID}`)) return false;

        const bounds = heading.getBoundingClientRect();
        const headingCenter = bounds.left + (bounds.width / 2);
        const composerCenter = composerBounds.left + (composerBounds.width / 2);
        const isAboveComposer = bounds.bottom <= composerBounds.top + 8
          && composerBounds.top - bounds.bottom < 320;
        const isHorizontallyAligned = Math.abs(headingCenter - composerCenter)
          < Math.max(160, composerBounds.width / 2);
        return isAboveComposer && isHorizontallyAligned;
      })
      .sort((first, second) => (
        second.getBoundingClientRect().bottom - first.getBoundingClientRect().bottom
      ));

    if (candidates[0]) return candidates[0];

    const thread = composer.closest("#thread");
    if (!thread) return null;

    let composerRegion = composer;
    while (composerRegion.parentElement && composerRegion.parentElement !== thread) {
      composerRegion = composerRegion.parentElement;
    }

    return composerRegion.parentElement === thread
      ? composerRegion.previousElementSibling
      : null;
  }

  function welcomeRegionFor(heading, stack, composer) {
    let welcomeRegion = heading;
    while (
      welcomeRegion.parentElement
      && welcomeRegion.parentElement !== stack
      && !welcomeRegion.parentElement.contains(composer)
    ) {
      welcomeRegion = welcomeRegion.parentElement;
    }

    return welcomeRegion === heading ? null : welcomeRegion;
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

  function updateReadyState() {
    document.documentElement.toggleAttribute(
      COMPACT_LAYOUT_READY_ATTR,
      Boolean(activeStack?.isConnected && activeWelcomeRegion?.isConnected),
    );
  }

  function applyCompactLayout() {
    if (!compactModeEnabled()) {
      clearCompactLayout();
      return;
    }

    const composer = findComposer();
    if (!composer) {
      document.documentElement.removeAttribute(COMPACT_LAYOUT_READY_ATTR);
      return;
    }

    const stackStillValid = activeStack?.isConnected && activeStack.contains(composer);
    if (!stackStillValid) {
      setActiveStack(composer.closest("#thread") || composer.parentElement);
    }

    const welcomeHeading = findWelcomeHeading(composer);
    if (!welcomeHeading) {
      setActiveWelcomeRegion(null);
      updateReadyState();
      return;
    }

    const welcomeStillValid = activeWelcomeRegion?.isConnected
      && activeWelcomeRegion.contains(welcomeHeading)
      && !activeWelcomeRegion.contains(composer);
    if (!welcomeStillValid) {
      setActiveWelcomeRegion(welcomeRegionFor(welcomeHeading, activeStack, composer));
    }

    updateReadyState();
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
