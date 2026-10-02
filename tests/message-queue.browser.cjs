// Run with Playwright available: node --test tests/message-queue.browser.cjs
// Uses an isolated browser and a local ChatGPT fixture; never sends real messages.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '../js/message-queue.js'), 'utf8');
const queueCss = fs.readFileSync(path.join(__dirname, '../css/message-queue.css'), 'utf8');
const hatCss = fs.readFileSync(path.join(__dirname, '../css/top-hat-send-button.css'), 'utf8');
let browser;
before(async () => {
  browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: true,
  });
});
after(async () => { await browser?.close(); });

async function fixture({ active = false, voice = false, editable = true, stored = {}, route = '/c/test' } = {}) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://queue.test/**', r => r.fulfill({ contentType: 'text/html', body: `
    <style>body {font-family: sans-serif; margin: 30px} form {display:flex;gap:8px} [contenteditable],textarea {width:400px;min-height:50px} button {min-width:32px;min-height:32px}</style>
    <main id="turns"></main><div><form>
    ${editable ? '<div data-composer-markdown contenteditable="true" role="textbox"><p><br class="ProseMirror-trailingBreak"></p></div>' : '<textarea id="prompt-textarea"></textarea>'}
    <button id="composer-submit-button" type="button"><svg viewBox="0 0 24 24"><rect width="10" height="10"/></svg></button>
    </form></div>` }));
  await page.goto(`https://queue.test${route}`);
  await page.evaluate(({ active, voice, stored }) => {
    window.sent = [];
    window.rejectSend = false;
    window.storage = structuredClone(stored);
    window.chrome = { storage: { local: {
      async get(defaults) { return { ...defaults, ...structuredClone(window.storage) }; },
      async set(values) {
        const changes = {};
        for (const [key, value] of Object.entries(values)) {
          if (JSON.stringify(window.storage[key]) !== JSON.stringify(value))
            changes[key] = { oldValue: window.storage[key], newValue: structuredClone(value) };
          window.storage[key] = structuredClone(value);
        }
        for (const listener of window.storageListeners) listener(changes, 'local');
      },
    }, onChanged: { addListener(fn) { window.storageListeners.push(fn); } } } };
    window.storageListeners = [];
    window.editor = document.querySelector('[contenteditable],textarea');
    window.button = document.getElementById('composer-submit-button');
    window.read = () => {
      if (editor.tagName === 'TEXTAREA') return editor.value;
      const paragraphs = [...editor.children];
      return paragraphs.length && paragraphs.every(e => e.tagName === 'P')
        ? paragraphs.map(e => e.textContent).join('\n') : editor.innerText;
    };
    window.clear = () => {
      if (editor.tagName === 'TEXTAREA') editor.value = '';
      else editor.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>';
    };
    window.addTurn = (role, complete = false) => {
      const article = document.createElement('article');
      article.dataset.testid = `conversation-turn-${document.querySelectorAll('article').length}`;
      article.innerHTML = `<div data-message-author-role="${role}"></div>`;
      if (complete) article.innerHTML += '<button data-testid="copy-turn-action-button">Copy</button>';
      document.getElementById('turns').append(article);
    };
    window.active = active;
    window.voice = voice;
    window.update = () => {
      button.dataset.testid = window.active ? 'stop-button' : (window.voice && !read().trim() ? 'voice-button' : 'send-button');
      button.setAttribute('aria-label', window.active ? 'Stop generating' : (window.voice && !read().trim() ? 'Start Voice' : 'Send prompt'));
      button.disabled = !window.active && !window.voice && !read().trim();
    };
    window.finish = () => {
      const assistants = document.querySelectorAll('[data-message-author-role="assistant"]');
      assistants[assistants.length - 1]?.parentElement.insertAdjacentHTML('beforeend', '<button data-testid="copy-turn-action-button">Copy</button>');
      window.active = false;
      update();
    };
    editor.addEventListener('input', update);
    button.addEventListener('click', () => {
      if (window.active) { window.finish(); return; }
      if (window.rejectSend || !read().trim()) return;
      sent.push(read().trim());
      addTurn('user'); addTurn('assistant');
      clear(); window.active = true; update();
    });
    if (active) { addTurn('user'); addTurn('assistant'); }
    update();
  }, { active, voice, stored });
  await page.addStyleTag({ content: queueCss + hatCss });
  await page.addScriptTag({ content: source });
  await page.locator('#ghrc-message-queue-button').waitFor();
  page.errors = errors;
  return page;
}
async function enqueue(page, text, enter = false) {
  const count = await page.locator('.ghrc-message-queue-editor').count();
  const editor = page.locator('[data-composer-markdown],#prompt-textarea');
  await editor.fill(text);
  if (enter) await editor.press('Enter');
  else await page.locator('#ghrc-message-queue-button').click();
  await page.waitForFunction(n => document.querySelectorAll('.ghrc-message-queue-editor').length === n + 1, count);
}
async function sentCount(page, count) {
  await page.waitForFunction(n => sent.length === n, count, { timeout: 10000 });
}

test('empty disabled send button does not deadlock; FIFO waits for complete responses', async () => {
  const p = await fixture({ active: true });
  await enqueue(p, 'First\nsecond line', true);
  await enqueue(p, 'Second', true);
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), []);
  // Thinking-to-answer gap: stop disappears before completion actions arrive.
  await p.evaluate(() => { window.active = false; update(); });
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), []);
  await p.evaluate(() => finish());
  await sentCount(p, 1);
  assert.deepEqual(await p.evaluate(() => sent), ['First\nsecond line']);
  await p.waitForTimeout(1800);
  assert.equal(await p.locator('.ghrc-message-queue-editor').count(), 1);
  await p.evaluate(() => finish());
  await sentCount(p, 2);
  await p.waitForFunction(() => !document.getElementById('ghrc-message-queue'));
  assert.deepEqual(p.errors, []);
  await p.close();
});

test('Stop queue preserves messages across reload; Resume sends them', async () => {
  const p = await fixture({ active: true });
  await enqueue(p, 'Saved');
  await p.getByRole('button', { name: 'Stop queue', exact: true }).click();
  await p.evaluate(() => finish());
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), []);
  const stored = await p.evaluate(() => window.storage);
  const restored = await fixture({ stored });
  await restored.getByRole('button', { name: 'Resume queue', exact: true }).waitFor();
  await restored.waitForTimeout(1800);
  assert.deepEqual(await restored.evaluate(() => sent), []);
  await restored.getByRole('button', { name: 'Resume queue', exact: true }).click();
  await sentCount(restored, 1);
  assert.deepEqual(await restored.evaluate(() => sent), ['Saved']);
  await p.close(); await restored.close();
});

test('edit, reorder, remove, and send-click enqueue preserve FIFO', async () => {
  const p = await fixture({ active: true });
  await enqueue(p, 'First'); await enqueue(p, 'Second'); await enqueue(p, 'Remove');
  await p.locator('.ghrc-message-queue-editor').nth(1).fill('Edited');
  await p.getByRole('button', { name: 'Move queued message earlier', exact: true }).nth(1).click();
  await p.getByRole('button', { name: 'Remove queued message', exact: true }).nth(2).click();
  await p.evaluate(() => finish());
  await p.locator('[data-composer-markdown]').fill('Third');
  await p.locator('#composer-submit-button').click();
  await p.waitForFunction(() => document.querySelectorAll('.ghrc-message-queue-editor').length === 3);
  assert.deepEqual(await p.locator('.ghrc-message-queue-editor').evaluateAll(es => es.map(e => e.value)), ['Edited', 'First', 'Third']);
  await sentCount(p, 1);
  assert.deepEqual(await p.evaluate(() => sent), ['Edited']);
  await p.close();
});

test('drafts block automatic sending; modified Enter keeps a newline', async () => {
  const p = await fixture({ active: true });
  await enqueue(p, 'Queued');
  const editor = p.locator('[data-composer-markdown]');
  await editor.fill('Draft'); await editor.press('Shift+Enter');
  assert.equal(await p.locator('.ghrc-message-queue-editor').count(), 1);
  await p.evaluate(() => finish());
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), []);
  assert.match(await p.evaluate(() => read()), /Draft/);
  await editor.fill(''); await sentCount(p, 1);
  await p.close();
});

test('voice-only empty composer mounts queue; hat tilts without hiding native stop', async () => {
  const p = await fixture({ voice: true });
  await enqueue(p, 'Voice layout');
  await sentCount(p, 1);
  assert.equal(await p.locator('[data-testid="stop-button"] svg').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await p.locator('[data-testid="stop-button"]').evaluate(el => getComputedStyle(el, '::before').content), 'none');
  await p.evaluate(() => { finish(); editor.textContent = 'Draft'; update(); });
  const transform = await p.locator('#composer-submit-button').evaluate(el => getComputedStyle(el, '::before').transform);
  assert.match(transform, /0\.984808/); // cos(10 degrees)
  assert.deepEqual(p.errors, []);
  await p.waitForFunction(() => !document.getElementById('ghrc-message-queue'));
  await p.screenshot({ path: '/tmp/flawless-queue-hat.png' });
  await p.close();
});

test('failed submission pauses and keeps the message for retry', async () => {
  const p = await fixture({ editable: false });
  await p.evaluate(() => { window.rejectSend = true; });
  await enqueue(p, 'Retry me');
  await p.getByRole('button', { name: 'Resume queue', exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await p.locator('.ghrc-message-queue-editor').inputValue(), 'Retry me');
  assert.equal(await p.evaluate(() => read()), '');
  await p.evaluate(() => { window.rejectSend = false; });
  await p.getByRole('button', { name: 'Resume queue', exact: true }).click();
  await sentCount(p, 1);
  assert.deepEqual(await p.evaluate(() => sent), ['Retry me']);
  await p.close();
});

test('conversation navigation isolates queues and migrates a new-chat queue', async () => {
  const p = await fixture({ active: true, route: '/' });
  await enqueue(p, 'New chat queue');
  await p.getByRole('button', { name: 'Stop queue', exact: true }).click();
  await p.evaluate(() => { history.pushState({}, '', '/g/g-example/c/created'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await p.waitForFunction(() => storage.queuedChatMessages?.['conversation:created']?.length === 1);
  assert.equal(await p.evaluate(() => storage.queuedChatMessagesPaused['conversation:created']), true);
  await p.evaluate(() => { history.pushState({}, '', '/c/other'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await p.waitForFunction(() => !document.getElementById('ghrc-message-queue'));
  await p.evaluate(() => { history.pushState({}, '', '/g/g-example/c/created'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await p.getByRole('button', { name: 'Resume queue', exact: true }).waitFor();
  assert.equal(await p.locator('.ghrc-message-queue-editor').inputValue(), 'New chat queue');
  await p.close();
});

test('queue UI observer settles instead of rewriting its own DOM every frame', async () => {
  const p = await fixture({ active: true });
  await enqueue(p, 'Waiting');
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    window.queueMutations = 0;
    new MutationObserver(records => { window.queueMutations += records.length; })
      .observe(document.body, { subtree: true, childList: true });
  });
  await p.waitForTimeout(1000);
  assert.equal(await p.evaluate(() => window.queueMutations), 0);
  await p.close();
});

test('first queued send can create a conversation without resending its migrated item', async () => {
  const p = await fixture({ route: '/' });
  await p.evaluate(() => {
    button.addEventListener('click', () => {
      if (sent.length === 1 && location.pathname === '/') {
        history.pushState({}, '', '/c/created-by-send');
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    });
  });
  await enqueue(p, 'Create conversation');
  await sentCount(p, 1);
  await p.waitForFunction(() => !document.getElementById('ghrc-message-queue'));
  await p.evaluate(() => finish());
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), ['Create conversation']);
  assert.equal(await p.evaluate(() => storage.queuedChatMessages['conversation:created-by-send']), undefined);
  await p.close();
});


test('stopping during the completion settle period prevents the next send on a narrow screen', async () => {
  const p = await fixture({ active: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await enqueue(p, 'Stay queued');
  await p.evaluate(() => finish());
  await p.waitForTimeout(500);
  const stop = p.getByRole('button', { name: 'Stop queue', exact: true });
  const box = await stop.boundingBox();
  assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  await stop.click();
  await p.waitForTimeout(1800);
  assert.deepEqual(await p.evaluate(() => sent), []);
  assert.equal(await p.locator('.ghrc-message-queue-editor').inputValue(), 'Stay queued');
  await p.screenshot({ path: '/tmp/flawless-queue-stopped-mobile.png' });
  await p.close();
});
