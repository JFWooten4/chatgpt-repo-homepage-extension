const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/force-high-thinking.js'), 'utf8');

class Element {
  constructor(text = '', attrs = {}) { this.textContent = text; this.attrs = attrs; this.isConnected = true; this.clicks = 0; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  hasAttribute(name) { return name in this.attrs; }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  getClientRects() { return [{}]; }
  click() { this.clicks++; }
  dispatchEvent() { return true; }
  closest() { return this; }
}
function fixture() {
  const elements = new Map();
  const storageWrites = [];
  let controls = [];
  const context = {
    HTMLElement: Element,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    KeyboardEvent: class { constructor(type, args) { this.type = type; Object.assign(this, args); } },
    window: { setTimeout() {} }, requestAnimationFrame() {},
    chrome: { storage: { local: { set(value) { storageWrites.push(value); return Promise.resolve(); } } } },
    document: {
      getElementById: (id) => elements.get(id),
      createElement: () => new Element(),
      documentElement: { append: (element) => elements.set(element.id, element) },
      querySelectorAll: () => controls,
    },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(0, source.indexOf('  chrome.storage.onChanged')) + `
    globalThis.api = { effortLevel, ensureStyle, selectMaximum, controlCacheKey, scanControls,
      begin(selector, state, initialLevel) { pending = { selector, state, initialLevel }; },
      clearPending() { pending = null; },
      seedState(selector, target) { states.set(selector, { attempts: 0, adjustments: 0, target }); },
      setEnabledForTest(value) { enabled = value; },
      setConfirmedTargets(value) { confirmedTargets = value; },
    };
  })();`, context);
  const selector = new Element('Standard', { 'aria-controls': 'menu' });
  const state = { adjustments: 0, target: '' };
  const menu = new Element();
  menu.querySelector = () => null;
  menu.querySelectorAll = () => [];
  elements.set('menu', menu);
  context.api.begin(selector, state, 'standard');
  return {
    api: context.api, elements, selector, state, menu, storageWrites,
    setControls(value) { controls = value; },
  };
}

test('visible level is recognized when accessibility label omits it', () => {
  const f = fixture();
  assert.equal(f.api.effortLevel(new Element('High', { 'aria-label': 'Thinking effort' })), 'high');
  assert.equal(f.api.effortLevel(new Element('Extended')), 'extended');
  assert.equal(f.api.effortLevel(new Element('Thinking')), 'thinking');
  assert.equal(f.api.effortLevel(new Element('Maximum')), 'maximum');
  assert.equal(f.api.effortLevel(new Element('High priority issue')), '');
});
test('hiding CSS matches the empty marker attribute', () => {
  const f = fixture();
  f.api.ensureStyle();
  assert.equal(f.elements.get('ghrc-force-high-thinking-style').textContent, '[data-ghrc-high-thinking-selector] { display: none !important; }');
});

test('confirmed visible level is cached when the control is hidden', () => {
  const f = fixture();
  const selector = new Element('High', { 'aria-label': 'Thinking effort' });
  f.api.clearPending();
  f.api.setEnabledForTest(true);
  f.api.setConfirmedTargets({});
  f.api.seedState(selector, 'high');
  f.setControls([selector]);
  f.api.scanControls();
  assert.equal(selector.hasAttribute('data-ghrc-high-thinking-selector'), true);
  assert.equal(JSON.stringify(f.storageWrites), JSON.stringify([{ forceHighThinkingConfirmedTargets: { 'thinking effort': 'high' } }]));
});
test('cached confirmed level skips reopening the selector in a new page', () => {
  const f = fixture();
  const selector = new Element('High', { 'aria-label': 'Thinking effort' });
  const keys = [];
  selector.dispatchEvent = (event) => { keys.push(event.key); return true; };
  f.api.clearPending();
  f.api.setEnabledForTest(true);
  f.api.setConfirmedTargets({ 'thinking effort': 'high' });
  f.setControls([selector]);
  f.api.scanControls();
  assert.equal(selector.hasAttribute('data-ghrc-high-thinking-selector'), true);
  assert.deepEqual(keys, []);
  assert.deepEqual(f.storageWrites, []);
});
test('cached level mismatch still rechecks the selector', () => {
  const f = fixture();
  const selector = new Element('Standard', { 'aria-label': 'Thinking effort' });
  const keys = [];
  selector.dispatchEvent = (event) => { keys.push(event.key); return true; };
  f.api.clearPending();
  f.api.setEnabledForTest(true);
  f.api.setConfirmedTargets({ 'thinking effort': 'high' });
  f.setControls([selector]);
  f.api.scanControls();
  assert.equal(selector.hasAttribute('data-ghrc-high-thinking-selector'), false);
  assert.ok(keys.includes('ArrowDown'));
});
for (const [levels, maximum] of [
  [['Standard', 'Extended'], 'Extended'],
  [['Light', 'Standard', 'Extended', 'Heavy'], 'Heavy'],
  [['Low', 'Medium', 'High', 'Extra high'], 'Extra high'],
]) {
  test(`selects ${maximum} from available menu levels`, () => {
    const f = fixture();
    const options = levels.map((level) => new Element(level));
    f.menu.querySelectorAll = () => options;
    assert.equal(f.api.selectMaximum(), true);
    assert.equal(f.state.target, maximum.toLowerCase());
    assert.equal(options.find((o) => o.textContent === maximum).clicks, 1);
    assert.equal(options.filter((o) => o.textContent !== maximum).reduce((sum, o) => sum + o.clicks, 0), 0);
  });
}
test('unavailable Heavy option does not prevent selecting Extended', () => {
  const f = fixture();
  const extended = new Element('Extended');
  f.menu.querySelectorAll = () => [extended, new Element('Heavy', { 'aria-disabled': 'true' })];
  f.api.selectMaximum();
  assert.equal(extended.clicks, 1);
});
test('power slider is raised to its reported maximum before confirmation', () => {
  const f = fixture();
  const slider = new Element('', { 'aria-valuenow': '1', 'aria-valuemax': '2' });
  slider.dispatchEvent = (event) => {
    if (event.type === 'keydown' && event.key === 'ArrowRight') slider.attrs['aria-valuenow'] = '2';
  };
  f.menu.querySelector = (selector) => selector.includes('slider') ? slider : new Element('High');
  f.api.selectMaximum();
  assert.equal(f.state.target, '');
  assert.equal(slider.getAttribute('aria-valuenow'), '2');
  f.api.selectMaximum();
  assert.equal(f.state.target, 'high');
});
