import type { Board, Cell, GameStatus } from "./types.ts";

function index(row: number, col: number, cols: number): number {
  return row * cols + col;
}

function inBounds(row: number, col: number, rows: number, cols: number): boolean {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function* neighbors(row: number, col: number, rows: number, cols: number): Generator<[number, number]> {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (inBounds(nr, nc, rows, cols)) yield [nr, nc];
    }
  }
}

export function createBoard(rows: number, cols: number, mineCellIndices: Set<number>): Board {
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        row,
        col,
        isMine: mineCellIndices.has(index(row, col, cols)),
        adjacent: 0,
        state: "hidden",
      });
    }
  }

  for (const cell of cells) {
    if (cell.isMine) continue;
    let count = 0;
    for (const [nr, nc] of neighbors(cell.row, cell.col, rows, cols)) {
      if (cells[index(nr, nc, cols)].isMine) count++;
    }
    cell.adjacent = count;
  }

  return { rows, cols, mineCount: mineCellIndices.size, cells, status: "playing" };
}

function checkWin(board: Board): boolean {
  return board.cells.every((cell) => cell.isMine || cell.state === "revealed");
}

export function reveal(board: Board, row: number, col: number): GameStatus {
  if (board.status !== "playing") return board.status;

  const start = board.cells[index(row, col, board.cols)];
  if (start.state !== "hidden") return board.status;

  if (start.isMine) {
    start.state = "revealed";
    for (const cell of board.cells) {
      if (cell.isMine) cell.state = "revealed";
    }
    board.status = "lost";
    return board.status;
  }

  // Iterative flood fill from the clicked cell, expanding through
  // zero-adjacent cells. An explicit stack avoids recursion depth issues
  // on large boards.
  const stack: [number, number][] = [[row, col]];
  while (stack.length > 0) {
    const [r, c] = stack.pop()!;
    const cell = board.cells[index(r, c, board.cols)];
    if (cell.state !== "hidden" || cell.isMine) continue;

    cell.state = "revealed";
    if (cell.adjacent === 0) {
      for (const [nr, nc] of neighbors(r, c, board.rows, board.cols)) {
        const neighbor = board.cells[index(nr, nc, board.cols)];
        if (neighbor.state === "hidden" && !neighbor.isMine) stack.push([nr, nc]);
      }
    }
  }

  if (checkWin(board)) board.status = "won";
  return board.status;
}

export function toggleFlag(board: Board, row: number, col: number): void {
  if (board.status !== "playing") return;

  const cell = board.cells[index(row, col, board.cols)];
  if (cell.state === "revealed") return;

  if (cell.state === "flagged") {
    cell.state = "hidden";
    return;
  }

  const flagCount = board.cells.reduce((n, c) => n + (c.state === "flagged" ? 1 : 0), 0);
  if (flagCount >= board.mineCount) return;
  cell.state = "flagged";
}
