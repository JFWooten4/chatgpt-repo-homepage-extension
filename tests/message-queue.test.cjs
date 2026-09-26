const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../js/message-queue.js"),
  "utf8",
);

function api() {
  const testApi = {};
  const context = {
    __GHRC_TEST__: testApi,
    crypto: { randomUUID: () => "test-session" },
    Date,
    Math,
    location: { pathname: "/", href: "https://chatgpt.com/" },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return testApi;
}

test("extracts stable conversation ids from ChatGPT routes", () => {
  const helpers = api();
  assert.equal(helpers.conversationIdFromPath("/c/abc-123"), "abc-123");
  assert.equal(helpers.conversationIdFromPath("/"), "");
});

test("normalizes persisted queue items and drops empty entries", () => {
  const helpers = api();
  const items = helpers.normalizeQueueItems([
    { id: "one", text: "First", createdAt: 10 },
    { id: "empty", text: "   ", createdAt: 20 },
    null,
  ]);

  assert.equal(
    JSON.stringify(items.map(({ id, text, createdAt }) => ({ id, text, createdAt }))),
    JSON.stringify([{ id: "one", text: "First", createdAt: 10 }]),
  );
});

test("queues Enter only while a response or earlier queued message is pending", () => {
  const helpers = api();
  const enter = {
    key: "Enter",
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
  };

  assert.equal(helpers.shouldQueueComposerEnter(enter, true, 0), true);
  assert.equal(helpers.shouldQueueComposerEnter(enter, false, 1), true);
  assert.equal(helpers.shouldQueueComposerEnter(enter, false, 0), false);
  assert.equal(helpers.shouldQueueComposerEnter({ ...enter, shiftKey: true }, true, 0), false);
});

test("never advances while ChatGPT is still generating", () => {
  const helpers = api();
  assert.equal(
    helpers.queueCanAdvance({
      responseActive: true,
      sendReady: false,
      userTurns: 2,
      assistantTurns: 1,
      latestAssistantComplete: false,
      roleStateKnown: true,
    }, helpers.COMPLETE_SETTLE_MS * 2),
    false,
  );
});

test("does not treat the thinking-to-answer gap as response completion", () => {
  const helpers = api();
  assert.equal(
    helpers.queueCanAdvance({
      responseActive: false,
      sendReady: true,
      userTurns: 2,
      assistantTurns: 2,
      latestAssistantComplete: false,
      roleStateKnown: true,
    }, helpers.COMPLETE_SETTLE_MS * 2),
    false,
  );
});

test("requires the response-complete state to remain settled", () => {
  const helpers = api();
  const complete = {
    responseActive: false,
    sendReady: true,
    userTurns: 2,
    assistantTurns: 2,
    latestAssistantComplete: true,
    roleStateKnown: true,
  };

  assert.equal(
    helpers.queueCanAdvance(complete, helpers.COMPLETE_SETTLE_MS - 1),
    false,
  );
  assert.equal(
    helpers.queueCanAdvance(complete, helpers.COMPLETE_SETTLE_MS),
    true,
  );
});

test("can start a queued message in an otherwise empty new chat", () => {
  const helpers = api();
  assert.equal(
    helpers.queueCanAdvance({
      responseActive: false,
      sendReady: true,
      userTurns: 0,
      assistantTurns: 0,
      latestAssistantComplete: false,
      roleStateKnown: true,
    }, helpers.COMPLETE_SETTLE_MS),
    true,
  );
});
