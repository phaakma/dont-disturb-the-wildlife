import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-button";

export class AboutDialog {
  #dialog: HTMLElement;

  constructor() {
    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", "About");
    this.#dialog.setAttribute("modal", "");

    this.#dialog.innerHTML = `
      <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
        <p style="margin:0;">
          <strong>Don't Disturb the Wildlife!</strong> is built using Esri's
          ArcGIS Maps SDK for JavaScript, with real-world location data from
          public ArcGIS Online feature layers.
        </p>
        <p style="margin:0;">
          This is an independent fan-made game, not an official Esri product.
        </p>
        <calcite-button id="about-close-btn" width="full">Close</calcite-button>
      </div>
    `;

    document.body.appendChild(this.#dialog);
    this.#dialog.querySelector("#about-close-btn")?.addEventListener("click", () => this.close());
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
