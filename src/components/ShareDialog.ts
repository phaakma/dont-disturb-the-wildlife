import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-input";

export interface ShareDialogOptions {
  url: string;
}

export class ShareDialog {
  #dialog: HTMLElement;

  constructor(options: ShareDialogOptions) {
    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", "Sharing");
    this.#dialog.setAttribute("modal", "");

    this.#dialog.innerHTML = `
      <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
        <p style="margin:0;">Send this to a friend or share on social media.</p>
        <calcite-input id="share-url-input" value="${escapeHtml(options.url)}" read-only></calcite-input>
        <calcite-button id="copy-url-btn" width="full" icon-start="link">Copy URL</calcite-button>
      </div>
    `;

    document.body.appendChild(this.#dialog);

    const copyBtn = this.#dialog.querySelector("#copy-url-btn");
    copyBtn?.addEventListener("click", () => {
      void navigator.clipboard.writeText(options.url);
      copyBtn.setAttribute("icon-start", "check");
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.setAttribute("icon-start", "link");
        copyBtn.textContent = "Copy URL";
      }, 1500);
    });

    this.#dialog.addEventListener("calciteDialogClose", () => this.#dialog.remove());

    requestAnimationFrame(() => {
      (this.#dialog as HTMLElement & { open: boolean }).open = true;
    });
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
