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

function clipboardFixture(settingValue) {
  const writes = [];
  class Clipboard {
    writeText(text) {
      writes.push(text);
      return Promise.resolve();
    }
  }
  const clipboard = new Clipboard();
  vm.runInNewContext(source, {
    Clipboard,
    navigator: { clipboard },
    document: {
      documentElement: {
        getAttribute: () => settingValue,
      },
    },
    URL,
  });
  return { clipboard, writes };
}

test('intercepts ChatGPT clipboard writes when the preference is enabled', async () => {
  const fixture = clipboardFixture('true');
  await fixture.clipboard.writeText('https://example.com/?utm_source=chatgpt.com&id=7');
  assert.deepEqual(fixture.writes, ['https://example.com/?id=7']);
});

test('leaves ChatGPT clipboard writes untouched when the preference is disabled', async () => {
  const fixture = clipboardFixture('false');
  const input = 'https://example.com/?utm_source=chatgpt.com&id=7';
  await fixture.clipboard.writeText(input);
  assert.deepEqual(fixture.writes, [input]);
});
