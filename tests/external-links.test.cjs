const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/external-links.js'), 'utf8');

class Element {
  closest() { return null; }
}
class HTMLAnchorElement extends Element {
  constructor(href, closest = null) {
    super();
    this.href = href;
    this.closestResult = closest;
  }
  closest() { return this.closestResult; }
}

function fixture({ enabled = true } = {}) {
  const navigations = [];
  const context = {
    Element,
    HTMLAnchorElement,
    URL,
    WeakSet,
    window: {
      location: {
        href: 'https://chatgpt.com/c/example',
        origin: 'https://chatgpt.com',
        assign: (href) => navigations.push(href),
      },
    },
  };
  vm.createContext(context);
  const boundary = source.indexOf('  function preserveNativeScroll');
  const prefix = source.slice(0, boundary);
  vm.runInContext(prefix + `
    externalWarningEnabled = ${enabled ? 'true' : 'false'};
    globalThis.api = { isPlainPrimaryActivation, openExternalLinkInCurrentTab };
  })();`, context);

  const event = {
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    prevented: false,
    stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
  };
  return { api: context.api, event, navigations };
}

test('plain external clicks reuse the current ChatGPT tab', () => {
  const f = fixture();
  const link = new HTMLAnchorElement('https://www.sec.gov/comments/example.pdf');
  assert.equal(f.api.openExternalLinkInCurrentTab(f.event, link), true);
  assert.deepEqual(f.navigations, ['https://www.sec.gov/comments/example.pdf']);
  assert.equal(f.event.prevented, true);
  assert.equal(f.event.stopped, true);
});

test('modifier clicks keep native new-tab behavior', () => {
  const f = fixture();
  f.event.metaKey = true;
  const link = new HTMLAnchorElement('https://www.sec.gov/comments/example.pdf');
  assert.equal(f.api.openExternalLinkInCurrentTab(f.event, link), false);
  assert.deepEqual(f.navigations, []);
});

test('internal ChatGPT links are not intercepted', () => {
  const f = fixture();
  const link = new HTMLAnchorElement('https://chatgpt.com/c/another-chat');
  assert.equal(f.api.openExternalLinkInCurrentTab(f.event, link), false);
  assert.deepEqual(f.navigations, []);
});

test('extension dashboard links keep their existing behavior', () => {
  const f = fixture();
  const link = new HTMLAnchorElement('https://github.com/JFWooten4', {});
  assert.equal(f.api.openExternalLinkInCurrentTab(f.event, link), false);
  assert.deepEqual(f.navigations, []);
});

test('disabling external-warning bypass leaves link handling untouched', () => {
  const f = fixture({ enabled: false });
  const link = new HTMLAnchorElement('https://www.sec.gov/comments/example.pdf');
  assert.equal(f.api.openExternalLinkInCurrentTab(f.event, link), false);
  assert.deepEqual(f.navigations, []);
});
