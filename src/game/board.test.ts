import { test } from "node:test";
import assert from "node:assert/strict";
import { createBoard, reveal, toggleFlag } from "./board.ts";

// 5x5 board with a solid mine wall down column 2, isolating the left
// half (cols 0-1) from the right half (cols 3-4) for flood-fill purposes,
// since adjacency only reaches one cell away.
//   . . M . .
//   . . M . .
//   . . M . .
//   . . M . .
//   . . M . .
function fixtureBoard() {
  const mines = new Set([2, 7, 12, 17, 22]); // col 2 of every row, row*5+2
  return createBoard(5, 5, mines);
}

test("createBoard computes adjacency counts around a mine wall", () => {
  const board = fixtureBoard();
  const at = (row: number, col: number) => board.cells[row * 5 + col];

  for (let row = 0; row < 5; row++) {
    assert.equal(at(row, 2).isMine, true);
    assert.equal(at(row, 0).adjacent, 0, `col0 row${row} should be zero-adjacent`);
  }
  // col1 touches 2 or 3 wall cells depending on whether it's an edge row
  assert.equal(at(0, 1).adjacent, 2);
  assert.equal(at(2, 1).adjacent, 3);
  assert.equal(at(4, 1).adjacent, 2);
});

test("reveal flood-fills one isolated region and leaves the other hidden", () => {
  const board = fixtureBoard();
  const status = reveal(board, 2, 0);
  assert.equal(status, "playing");

  const at = (row: number, col: number) => board.cells[row * 5 + col];
  for (let row = 0; row < 5; row++) {
    assert.equal(at(row, 0).state, "revealed");
    assert.equal(at(row, 1).state, "revealed");
    assert.equal(at(row, 2).state, "hidden"); // mines untouched
    assert.equal(at(row, 3).state, "hidden"); // other side untouched
    assert.equal(at(row, 4).state, "hidden");
  }
});

test("revealing a mine ends the game and reveals all mines", () => {
  const board = fixtureBoard();
  const status = reveal(board, 0, 2);
  assert.equal(status, "lost");
  assert.equal(board.status, "lost");
  for (const idx of [2, 7, 12, 17, 22]) {
    assert.equal(board.cells[idx].state, "revealed");
  }
});

test("revealing every non-mine cell wins the game", () => {
  const board = fixtureBoard();
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (board.cells[row * 5 + col].isMine) continue;
      reveal(board, row, col);
    }
  }
  assert.equal(board.status, "won");
});

test("toggleFlag flags and unflags hidden cells, capped at mine count", () => {
  const board = fixtureBoard(); // mineCount = 5
  for (const idx of [2, 7, 12, 17, 22]) {
    toggleFlag(board, Math.floor(idx / 5), idx % 5);
  }
  for (const idx of [2, 7, 12, 17, 22]) {
    assert.equal(board.cells[idx].state, "flagged");
  }

  // cap reached: a 6th flag should be rejected
  toggleFlag(board, 0, 0);
  assert.equal(board.cells[0].state, "hidden");

  // unflagging frees up a slot
  toggleFlag(board, 0, 2);
  assert.equal(board.cells[2].state, "hidden");
  toggleFlag(board, 0, 0);
  assert.equal(board.cells[0].state, "flagged");
});

test("reveal and toggleFlag are no-ops once the game is over", () => {
  const board = fixtureBoard();
  reveal(board, 0, 2); // lose immediately
  assert.equal(board.status, "lost");

  const status = reveal(board, 2, 0);
  assert.equal(status, "lost");
  assert.equal(board.cells[2 * 5 + 0].state, "hidden");

  toggleFlag(board, 1, 0);
  assert.equal(board.cells[1 * 5 + 0].state, "hidden");
});
