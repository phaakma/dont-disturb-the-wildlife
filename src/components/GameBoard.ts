import type { Board, GameStatus } from "../game/types.ts";
import type { ScreenRect } from "../arcgis/gridGeometry.ts";
import type { WildlifeTheme } from "../game/themes.ts";
import { reveal, toggleFlag } from "../game/board.ts";

// Classic Minesweeper number palette.
const NUMBER_COLORS: Record<number, string> = {
  1: "#1a56e8",
  2: "#00873c",
  3: "#e0202e",
  4: "#0d1a66",
  5: "#7a0010",
  6: "#00838f",
  7: "#111111",
  8: "#6b6b6b",
};

const LONG_PRESS_MS = 500;

export interface GameBoardOptions {
  board: Board;
  theme: WildlifeTheme;
  /** Current map basemap id, used to pick a grid-line style that stands out against it (see style.css). */
  basemapId: string;
  onChange: (status: GameStatus, isFirstInteraction: boolean) => void;
}

export class GameBoard {
  #overlay: HTMLElement;
  #board: Board;
  #theme: WildlifeTheme;
  #onChange: GameBoardOptions["onChange"];
  #hasInteracted = false;
  #focusedIndex = 0;
  #longPressTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(overlay: HTMLElement, options: GameBoardOptions) {
    this.#overlay = overlay;
    this.#board = options.board;
    this.#theme = options.theme;
    this.#onChange = options.onChange;

    this.#overlay.classList.add("active");
    this.#overlay.dataset.basemap = options.basemapId;
    this.#overlay.style.gridTemplateColumns = `repeat(${this.#board.cols}, 1fr)`;
    this.#overlay.style.gridTemplateRows = `repeat(${this.#board.rows}, 1fr)`;
    this.#overlay.setAttribute("role", "grid");
    this.#overlay.setAttribute("aria-label", `Don't Disturb the Wildlife board, ${this.#board.rows} by ${this.#board.cols}`);
    this.#overlay.setAttribute("aria-rowcount", String(this.#board.rows));
    this.#overlay.setAttribute("aria-colcount", String(this.#board.cols));
    this.#overlay.addEventListener("contextmenu", GameBoard.#preventDefault);

    this.render();
  }

  setRect(rect: ScreenRect): void {
    this.#overlay.style.left = `${rect.left}px`;
    this.#overlay.style.top = `${rect.top}px`;
    this.#overlay.style.width = `${rect.width}px`;
    this.#overlay.style.height = `${rect.height}px`;
  }

  destroy(): void {
    if (this.#longPressTimer) clearTimeout(this.#longPressTimer);
    this.#overlay.removeEventListener("contextmenu", GameBoard.#preventDefault);
    this.#overlay.classList.remove("active");
    this.#overlay.innerHTML = "";
    this.#overlay.removeAttribute("style");
    delete this.#overlay.dataset.basemap;
    for (const attr of ["role", "aria-label", "aria-rowcount", "aria-colcount"]) {
      this.#overlay.removeAttribute(attr);
    }
  }

  static #preventDefault(e: Event): void {
    e.preventDefault();
  }

  #handleReveal(row: number, col: number): void {
    if (this.#board.status !== "playing") return;
    const cell = this.#board.cells[row * this.#board.cols + col];
    if (cell.state !== "hidden") return;

    const isFirstInteraction = !this.#hasInteracted;
    this.#hasInteracted = true;
    this.#focusedIndex = row * this.#board.cols + col;
    const status = reveal(this.#board, row, col);
    this.render();
    this.#onChange(status, isFirstInteraction);
  }

  #handleFlag(row: number, col: number): void {
    if (this.#board.status !== "playing") return;
    this.#focusedIndex = row * this.#board.cols + col;
    toggleFlag(this.#board, row, col);
    this.render();
    this.#onChange(this.#board.status, false);
  }

  #onKeyDown(e: KeyboardEvent, row: number, col: number): void {
    const { rows, cols } = this.#board;
    let target: [number, number] | null = null;

    switch (e.key) {
      case "ArrowUp":
        target = [row - 1, col];
        break;
      case "ArrowDown":
        target = [row + 1, col];
        break;
      case "ArrowLeft":
        target = [row, col - 1];
        break;
      case "ArrowRight":
        target = [row, col + 1];
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        this.#handleReveal(row, col);
        return;
      case "f":
      case "F":
        e.preventDefault();
        this.#handleFlag(row, col);
        return;
      default:
        return;
    }

    if (target[0] < 0 || target[0] >= rows || target[1] < 0 || target[1] >= cols) return;
    e.preventDefault();
    this.#focusedIndex = target[0] * cols + target[1];
    (this.#overlay.children[this.#focusedIndex] as HTMLElement | undefined)?.focus();
  }

  render(): void {
    const hadFocus = this.#overlay.contains(document.activeElement);
    this.#overlay.innerHTML = "";

    for (const cell of this.#board.cells) {
      const el = document.createElement("div");
      el.className = `cell ${cell.state}`;
      el.setAttribute("role", "gridcell");
      el.setAttribute("aria-rowindex", String(cell.row + 1));
      el.setAttribute("aria-colindex", String(cell.col + 1));
      el.tabIndex = 0;
      el.dataset.row = String(cell.row);
      el.dataset.col = String(cell.col);
      // Staggers the firefly-glow animation (see style.css) so cells don't all pulse in lockstep.
      el.style.setProperty("--cell-index", String((cell.row * 7 + cell.col * 13) % 23));

      if (cell.state === "revealed") {
        if (cell.isMine) {
          el.classList.add("wildlife");
          const img = document.createElement("img");
          img.className = "cell-icon";
          img.src = this.#theme.icon;
          img.alt = this.#theme.label;
          el.appendChild(img);
          el.setAttribute("aria-label", `Row ${cell.row + 1}, column ${cell.col + 1}, ${this.#theme.label} found here`);
        } else if (cell.adjacent > 0) {
          const badge = document.createElement("span");
          badge.className = "cell-number";
          badge.textContent = String(cell.adjacent);
          badge.style.color = NUMBER_COLORS[cell.adjacent] ?? "black";
          el.appendChild(badge);
          el.setAttribute(
            "aria-label",
            `Row ${cell.row + 1}, column ${cell.col + 1}, ${cell.adjacent} nearby ${this.#theme.pluralLabel}`,
          );
        } else {
          el.setAttribute("aria-label", `Row ${cell.row + 1}, column ${cell.col + 1}, no wildlife nearby`);
        }
      } else if (cell.state === "flagged") {
        el.textContent = "\u{1F6A9}"; // 🚩
        el.setAttribute(
          "aria-label",
          `Row ${cell.row + 1}, column ${cell.col + 1}, marked as a possible ${this.#theme.label} location`,
        );
      } else {
        el.setAttribute("aria-label", `Row ${cell.row + 1}, column ${cell.col + 1}, unexplored`);
      }

      el.addEventListener("click", () => this.#handleReveal(cell.row, cell.col));
      el.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.#handleFlag(cell.row, cell.col);
      });
      el.addEventListener("keydown", (e) => this.#onKeyDown(e, cell.row, cell.col));
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return;
        this.#longPressTimer = setTimeout(() => this.#handleFlag(cell.row, cell.col), LONG_PRESS_MS);
      });
      el.addEventListener("pointerup", () => {
        if (this.#longPressTimer) clearTimeout(this.#longPressTimer);
      });
      el.addEventListener("pointerleave", () => {
        if (this.#longPressTimer) clearTimeout(this.#longPressTimer);
      });

      this.#overlay.appendChild(el);
    }

    if (hadFocus) {
      (this.#overlay.children[this.#focusedIndex] as HTMLElement | undefined)?.focus();
    }
  }
}
