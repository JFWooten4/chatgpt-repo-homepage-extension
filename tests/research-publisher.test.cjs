const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function background(enabled, nativeResult = { ok: true }) {
  let listener;
  const calls = [];
  const chrome = {
    storage: { local: { get: async (defaults) => ({ ...defaults, ...(enabled === undefined ? {} : { researchPublisherEnabled: enabled }) }) } },
    runtime: {
      id: 'test-extension',
      onMessage: { addListener: (fn) => { listener = fn; } },
      sendNativeMessage: async (...args) => {
        calls.push(args);
        if (nativeResult instanceof Error) throw nativeResult;
        return nativeResult;
      },
    },
  };
  vm.runInNewContext(fs.readFileSync('js/research-publisher-background.js', 'utf8'), { chrome, URL, TextEncoder });
  return {
    calls,
    listener,
    send: (sender = { id: 'test-extension', url: 'https://connector-openai-deep-research.web-sandbox.oaiusercontent.com/', tab: { id: 1, url: 'https://chatgpt.com/c/example' } }) => new Promise((resolve) => {
      assert.equal(listener({ type: 'publish-research-report', title: 'Report', markdown: '# Report\nFull text', app: '/ignored.app' }, sender, resolve), true);
    }),
  };
}

test('unset and disabled preferences never contact the native host', async () => {
  for (const enabled of [undefined, false]) {
    const app = background(enabled);
    assert.equal((await app.send()).ok, false);
    assert.equal(app.calls.length, 0);
  }
});

test('enabled launch sends a fixed action without caller-supplied paths', async () => {
  const app = background(true);
  assert.equal((await app.send()).ok, true);
  assert.equal(JSON.stringify(app.calls), JSON.stringify([['org.research.publisher', { action: 'publish', title: 'Report', markdown: '# Report\nFull text', source: 'https://chatgpt.com/c/example' }]]));
});

test('foreign sender cannot launch the app', async () => {
  const app = background(true);
  assert.equal((await app.send({ id: 'other-extension' })).ok, false);
  assert.equal(app.calls.length, 0);
});

test('missing bridge and launch failures point to linking instructions', async () => {
  for (const result of [new Error('Host missing'), { ok: false }, undefined]) {
    const app = background(true, result === undefined ? null : result);
    assert.match((await app.send()).error, /Link repository|Publishing failed/);
  }
});

test('unrelated messages are left for existing handlers', () => {
  assert.equal(background(false).listener({ type: 'load-repositories' }, {}, () => assert.fail()), false);
});

test('settings default off, persist toggles, and only launch on click', async () => {
  const elements = new Map();
  for (const id of ['research-publisher-enabled', 'research-publisher-controls', 'check-research-publisher', 'research-publisher-status']) {
    elements.set(id, { listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } });
  }
  const checkbox = elements.get('research-publisher-enabled');
  const controls = elements.get('research-publisher-controls');
  const launch = elements.get('check-research-publisher');
  const status = elements.get('research-publisher-status');
  const saved = {};
  let sends = 0;
  let onChange;
  const chrome = {
    storage: {
      local: { get: async (defaults) => defaults, set: async (values) => Object.assign(saved, values) },
      onChanged: { addListener(fn) { onChange = fn; } },
    },
    runtime: { sendMessage: async () => { sends++; return { ok: true }; } },
  };
  vm.runInNewContext(fs.readFileSync('js/research-publisher-options.js', 'utf8'), {
    chrome, document: { getElementById: (id) => elements.get(id) },
  });
  await new Promise(setImmediate);
  assert.equal(checkbox.checked, false);
  assert.equal(controls.hidden, true);
  assert.equal(sends, 0);
  checkbox.checked = true;
  await checkbox.listeners.change();
  assert.equal(saved.researchPublisherEnabled, true);
  assert.equal(controls.hidden, false);
  assert.equal(sends, 0);
  await launch.listeners.click();
  assert.equal(sends, 1);
  assert.match(status.textContent, /Use Add to repo/);
  onChange({ researchPublisherEnabled: { newValue: false } }, 'local');
  assert.equal(checkbox.checked, false);
  assert.equal(controls.hidden, true);
  assert.equal(launch.disabled, true);
});
