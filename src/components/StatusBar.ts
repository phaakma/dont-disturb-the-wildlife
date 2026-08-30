import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-button";

import type { Board } from "../game/types.ts";

export interface StatusBarOptions {
  board: Board;
  onRestart: () => void;
  onStartOver: () => void;
}

const TICK_MS = 250;

export class StatusBar {
  #container: HTMLElement;
  #board: Board;
  #onRestart: () => void;
  #onStartOver: () => void;
  #startedAt: number | null = null;
  #elapsedMs = 0;
  #intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(container: HTMLElement, options: StatusBarOptions) {
    this.#container = container;
    this.#board = options.board;
    this.#onRestart = options.onRestart;
    this.#onStartOver = options.onStartOver;
    this.render();
  }

  startTimer(): void {
    if (this.#startedAt != null) return;
    this.#startedAt = Date.now();
    this.#intervalId = setInterval(() => {
      this.#elapsedMs = Date.now() - this.#startedAt!;
      this.render();
    }, TICK_MS);
  }

  stopTimer(): number {
    if (this.#intervalId) clearInterval(this.#intervalId);
    this.#intervalId = null;
    if (this.#startedAt != null) this.#elapsedMs = Date.now() - this.#startedAt;
    return this.#elapsedMs;
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    if (this.#intervalId) clearInterval(this.#intervalId);
  }

  render(): void {
    const flags = this.#board.cells.reduce((n, c) => n + (c.state === "flagged" ? 1 : 0), 0);
    const remaining = this.#board.mineCount - flags;
    const seconds = Math.floor(this.#elapsedMs / 1000);

    this.#container.innerHTML = `
      <calcite-panel heading="Playing">
        <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
          <div style="display:flex; justify-content:space-between; font-size:1.1rem;">
            <span>\u{1F6A9} ${remaining}</span>
            <span>⏱ ${seconds}s</span>
          </div>
          ${
            this.#board.status === "playing"
              ? `<calcite-button id="restart-btn" appearance="outline" width="full">Give up / reframe</calcite-button>`
              : `<calcite-button id="restart-btn" width="full">Try again</calcite-button>
                 <calcite-button id="start-over-btn" appearance="outline" width="full">Start Over</calcite-button>`
          }
        </div>
      </calcite-panel>
    `;

    this.#container.querySelector("#restart-btn")?.addEventListener("click", () => this.#onRestart());
    this.#container.querySelector("#start-over-btn")?.addEventListener("click", () => this.#onStartOver());
  }
}
