const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourcePath = path.join(__dirname, '../js/clipboard-utm-sanitizer.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const {
  stripTrackingFromUrlValue,
  stripTrackingFromText,
} = require(sourcePath);

test('removes ChatGPT UTM tracking from copied Markdown links', () => {
  const input = '[SEC](https://www.sec.gov/rules/example?utm_source=chatgpt.com)';
  assert.equal(stripTrackingFromText(input), '[SEC](https://www.sec.gov/rules/example)');
});

test('preserves non-UTM parameters and fragments', () => {
  const input = 'https://example.com/report?id=42&utm_source=chatgpt.com&utm_medium=copy#part-2';
  assert.equal(stripTrackingFromUrlValue(input), 'https://example.com/report?id=42#part-2');
});

test('sanitizes multiple URLs and case-insensitive UTM names', () => {
  const input = 'A https://a.example/?UTM_Source=chatgpt.com&x=1 B https://b.example/?q=2&utm_campaign=test';
  assert.equal(
    stripTrackingFromText(input),
    'A https://a.example/?x=1 B https://b.example/?q=2',
  );
});

test('keeps HTML-encoded query separators valid while stripping tracking', () => {
  const input = '<a href="https://example.com/?a=1&amp;utm_source=chatgpt.com&amp;b=2">Example</a>';
  assert.equal(
    stripTrackingFromText(input),
    '<a href="https://example.com/?a=1&amp;b=2">Example</a>',
  );
});

test('leaves non-tracking URLs and surrounding copy unchanged', () => {
  const input = 'See [source](https://example.com/?id=7) and mailto:test@example.com.';
  assert.equal(stripTrackingFromText(input), input);
});

function runtimeFixture(settingValue, { clipboardAvailable = true } = {}) {
  const writes = [];
  const opened = [];
  class Clipboard {
    writeText(text) {
      writes.push(text);
      return Promise.resolve();
    }
  }
  const clipboard = clipboardAvailable ? new Clipboard() : undefined;
  const window = {
    open(url, ...args) {
      opened.push([url, ...args]);
      return { closed: false };
    },
  };
  const context = {
    navigator: { clipboard },
    document: {
      documentElement: {
        getAttribute: () => settingValue,
      },
    },
    URL,
    window,
  };
  if (clipboardAvailable) context.Clipboard = Clipboard;
  vm.runInNewContext(source, context);
  return { clipboard, writes, opened, window };
}

test('intercepts ChatGPT clipboard writes when the preference is enabled', async () => {
  const fixture = runtimeFixture('true');
  await fixture.clipboard.writeText('https://example.com/?utm_source=chatgpt.com&id=7');
  assert.deepEqual(fixture.writes, ['https://example.com/?id=7']);
});

test('leaves ChatGPT clipboard writes untouched when the preference is disabled', async () => {
  const fixture = runtimeFixture('false');
  const input = 'https://example.com/?utm_source=chatgpt.com&id=7';
  await fixture.clipboard.writeText(input);
  assert.deepEqual(fixture.writes, [input]);
});

test('sanitizes popup URLs even when the Clipboard API is unavailable', () => {
  const fixture = runtimeFixture('true', { clipboardAvailable: false });
  const popup = fixture.window.open(
    'https://example.com/report?id=7&utm_source=chatgpt.com&utm_medium=referral#part',
    '_blank',
    'popup',
  );
  assert.equal(popup.closed, false);
  assert.deepEqual(fixture.opened, [[
    'https://example.com/report?id=7#part',
    '_blank',
    'popup',
  ]]);
});

test('leaves popup URLs untouched when tracking removal is disabled', () => {
  const fixture = runtimeFixture('false', { clipboardAvailable: false });
  const input = 'https://example.com/?utm_source=chatgpt.com&id=7';
  fixture.window.open(input, '_blank');
  assert.deepEqual(fixture.opened, [[input, '_blank']]);
});
