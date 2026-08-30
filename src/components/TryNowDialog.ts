import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-button";

export interface TryNowDialogOptions {
  title: string;
  snippet: string;
  onPlayNow: () => void;
}

export class TryNowDialog {
  #dialog: HTMLElement;
  #options: TryNowDialogOptions;

  constructor(options: TryNowDialogOptions) {
    this.#options = options;
    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", options.title);
    this.#dialog.setAttribute("modal", "");

    this.#dialog.innerHTML = `
      <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
        <p style="margin:0; white-space:pre-line;">${escapeHtml(options.snippet)}</p>
        <calcite-button id="try-now-play-btn" width="full">Play now</calcite-button>
        <calcite-button id="try-now-back-btn" appearance="outline" width="full">Back to start</calcite-button>
      </div>
    `;

    document.body.appendChild(this.#dialog);
    this.#dialog.querySelector("#try-now-play-btn")?.addEventListener("click", () => {
      this.#options.onPlayNow();
      this.close();
    });
    this.#dialog.querySelector("#try-now-back-btn")?.addEventListener("click", () => this.close());
    this.#dialog.addEventListener("calciteDialogClose", () => this.#dialog.remove());
  }

  open(): void {
    requestAnimationFrame(() => {
      (this.#dialog as HTMLElement & { open: boolean }).open = true;
    });
  }

  close(): void {
    (this.#dialog as HTMLElement & { open: boolean }).open = false;
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
