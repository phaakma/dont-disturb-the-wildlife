export type CellState = "hidden" | "revealed" | "flagged";

export interface Cell {
  row: number;
  col: number;
  isMine: boolean;
  adjacent: number; // 0-8, meaningless when isMine is true
  state: CellState;
}

export type GameStatus = "playing" | "won" | "lost";

export interface Board {
  rows: number;
  cols: number;
  mineCount: number;
  cells: Cell[]; // row-major, length rows * cols
  status: GameStatus;
}

export type Difficulty = "beginner" | "intermediate" | "expert" | "custom";

export const DIFFICULTY_SIZE: Record<Exclude<Difficulty, "custom">, number> = {
  beginner: 9,
  intermediate: 16,
  expert: 22,
};
