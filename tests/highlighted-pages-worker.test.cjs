const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../js/highlighted-pages-worker.js"),
  "utf8",
);

function api() {
  const helpers = {};
  const context = { __GHRC_HIGHLIGHTED_PAGES_TEST__: helpers, URL, Set };
  vm.createContext(context);
  vm.runInContext(source, context);
  return helpers;
}

test("extracts Open Graph preview metadata regardless of attribute order", () => {
  const helpers = api();
  const html = '<meta content="Example title" property="og:title"><meta name="description" content="A short description">';
  assert.equal(helpers.documentTitle(html), "Example title");
  assert.equal(helpers.metaContent(html, ["description"]), "A short description");
});

test("falls back to the document title and favicon", () => {
  const helpers = api();
  const html = '<title>Fallback &amp; title</title><link href="/brand.ico" rel="shortcut icon">';
  assert.equal(helpers.documentTitle(html), "Fallback & title");
  assert.equal(helpers.iconHref(html), "/brand.ico");
});

test("resolves relative preview URLs", () => {
  const helpers = api();
  assert.equal(
    helpers.absoluteUrl("../preview.png", "https://example.com/docs/page"),
    "https://example.com/preview.png",
  );
});
