const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual launcher functions with controlled editor events and time.
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/spellcheck-launcher.js'), 'utf8');
function fixture({ draft = '', paste = 'accept', disabled = false } = {}) {
  let now = 0;
  const timers = [];
  const button = { disabled, clicks: 0, getAttribute() { return null; }, click() { this.clicks++; } };
  const composer = {
    innerText: draft, isContentEditable: true, isConnected: true,
    focus() {}, closest() { return { querySelector: () => button }; },
    dispatchEvent(event) {
      if (event.type === 'paste' && paste === 'accept') this.innerText = event.clipboardData.text;
      if (event.type === 'paste' && paste === 'partial') this.innerText = 'partial';
      return true;
    },
  };
  const context = {
    Date: { now: () => now },
    location: { pathname: '/g/g-dyK63miav-spellcheck-only' },
    HTMLTextAreaElement: class {}, HTMLInputElement: class {},
    DataTransfer: class { setData(type, text) { this.text = text; } },
    ClipboardEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    window: {
      getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
      setTimeout: (fn, delay) => timers.push({ fn, time: now + delay }),
    },
    document: {
      querySelector: () => composer,
      createRange: () => ({ selectNodeContents() {} }),
      execCommand(command, ui, text) { composer.innerText = text; return true; },
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('  chrome.storage.onChanged')) + `
    globalThis.api = { pasteIntoComposer, submitWhenReady,
      handoff(text) { pendingClipboardText = text; runClipboardHandoff(); } };
  })();`, context);
  return { context, composer, button, timers, api: context.api,
    tick() { const timer = timers.shift(); assert.ok(timer); now = timer.time; timer.fn(); } };
}

test('existing draft is preserved and never submitted', () => {
  const f = fixture({ draft: 'unrelated draft', paste: 'ignore' });
  f.api.handoff('clipboard');
  assert.equal(f.composer.innerText, 'unrelated draft');
  assert.equal(f.timers.length, 0);
  assert.equal(f.button.clicks, 0);
});
test('accepted clipboard text is submitted exactly once', () => {
  const f = fixture();
  f.api.handoff('clipboard\nsecond line');
  f.tick();
  assert.equal(f.composer.innerText, 'clipboard\nsecond line');
  assert.equal(f.button.clicks, 1);
  assert.equal(f.timers.length, 0);
});
test('ignored paste uses insertion fallback', () => {
  const f = fixture({ paste: 'ignore' });
  assert.equal(f.api.pasteIntoComposer(f.composer, 'clipboard'), true);
  assert.equal(f.composer.innerText, 'clipboard');
});
test('partial paste does not submit or repeat insertion', () => {
  const f = fixture({ paste: 'partial' });
  f.api.handoff('clipboard');
  assert.equal(f.composer.innerText, 'partial');
  assert.equal(f.timers.length, 0);
});
test('disabled Send is retried until ready, then clicked once', () => {
  const f = fixture({ disabled: true });
  f.api.handoff('clipboard');
  f.tick(); f.tick();
  assert.equal(f.button.clicks, 0);
  f.button.disabled = false;
  f.tick();
  assert.equal(f.button.clicks, 1);
  assert.equal(f.timers.length, 0);
});
test('permanently disabled Send times out', () => {
  const f = fixture({ disabled: true });
  f.api.handoff('clipboard');
  let attempts = 0;
  while (f.timers.length && attempts++ < 60) f.tick();
  assert.equal(f.timers.length, 0);
  assert.equal(f.button.clicks, 0);
});
for (const scenario of ['navigation', 'edit', 'unmount', 'replacement']) {
  test(`pending submission cancels on ${scenario}`, () => {
    const f = fixture();
    f.api.handoff('clipboard');
    if (scenario === 'navigation') f.context.location.pathname = '/';
    if (scenario === 'edit') f.composer.innerText = 'user edit';
    if (scenario === 'unmount') f.composer.isConnected = false;
    if (scenario === 'replacement') f.context.document.querySelector = () => ({});
    f.tick();
    assert.equal(f.button.clicks, 0);
    assert.equal(f.timers.length, 0);
  });
}
test('blank clipboard never submits', () => {
  const f = fixture();
  f.api.handoff('  \n');
  assert.equal(f.timers.length, 0);
});
