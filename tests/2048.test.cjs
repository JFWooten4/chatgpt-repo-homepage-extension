const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  collapseLine,
  moveBoard,
  canMove,
  cloneBoard,
} = require('../js/2048.js');

test('merges each pair only once per move', () => {
  assert.deepEqual(collapseLine([2, 2, 2, 2]), {
    line: [4, 4, 0, 0],
    score: 8,
  });
  assert.deepEqual(collapseLine([4, 4, 8, 8]), {
    line: [8, 16, 0, 0],
    score: 24,
  });
});

test('supports movement in all four directions', () => {
  const board = [
    [2, 0, 2, 0],
    [0, 0, 0, 0],
    [4, 0, 4, 0],
    [0, 0, 0, 0],
  ];
  assert.deepEqual(moveBoard(board, 'left').board, [
    [4, 0, 0, 0],
    [0, 0, 0, 0],
    [8, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  assert.deepEqual(moveBoard(board, 'right').board, [
    [0, 0, 0, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 8],
    [0, 0, 0, 0],
  ]);
  assert.equal(moveBoard(board, 'up').moved, true);
  assert.equal(moveBoard(board, 'down').moved, true);
});

test('2048 is not treated as a terminal state', () => {
  const board = [
    [2048, 0, 0, 0],
    [2, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  assert.equal(canMove(board), true);
  assert.equal(moveBoard(board, 'right').moved, true);
});

test('only a genuinely blocked board is game over', () => {
  assert.equal(canMove([
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ]), false);
  assert.equal(canMove([
    [2, 4, 2, 4],
    [4, 4, 8, 2],
    [2, 8, 2, 4],
    [4, 2, 4, 2],
  ]), true);
});

test('snapshots remain independent for unlimited undo history', () => {
  const original = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  const history = [];
  for (let index = 0; index < 200; index += 1) history.push(cloneBoard(original));
  original[0][0] = 4;
  assert.equal(history.length, 200);
  assert.equal(history[0][0][0], 2);
  assert.equal(history[199][0][0], 2);
});
