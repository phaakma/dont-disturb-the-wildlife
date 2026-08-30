import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-input";
import "@esri/calcite-components/components/calcite-notice";

import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import { showLayer, hideLayer } from "../arcgis/mapSetup.ts";
import { buildShareUrl, type ShareParams } from "../app/shareUrl.ts";
import { saveConfig } from "../app/savedConfigs.ts";
import type { WildlifeTheme } from "../game/themes.ts";
import { ShareDialog } from "./ShareDialog.ts";

export interface ResultDialogOptions {
  status: "won" | "lost";
  elapsedMs: number;
  mineCount: number;
  gridSize: number;
  layerName: string;
  featureCount: number;
  layer: FeatureLayer;
  theme: WildlifeTheme;
  shareParams: ShareParams | null;
  onPlayAgain: () => void;
  onChangeLayer: () => void;
}

export class ResultDialog {
  #dialog: HTMLElement;
  #layer: FeatureLayer;

  constructor(options: ResultDialogOptions) {
    this.#layer = options.layer;
    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", options.status === "won" ? "You win!" : "Game over");
    this.#dialog.setAttribute("modal", "");

    const seconds = (options.elapsedMs / 1000).toFixed(1);
    const theme = options.theme;
    const message = options.status === "won" ? theme.winMessage : theme.loseMessage;
    const pluralLabelCap = theme.pluralLabel.charAt(0).toUpperCase() + theme.pluralLabel.slice(1);
    this.#dialog.innerHTML = `
      <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.5rem;">
        <img src="${theme.icon}" alt="${escapeHtml(theme.label)}" style="width:96px; height:96px; margin:0 auto; display:block;" />
        <p style="margin:0; text-align:center;">${escapeHtml(message)}</p>
        <p style="margin:0;">Time: ${seconds}s</p>
        <p style="margin:0;">Grid: ${options.gridSize}×${options.gridSize}</p>
        <p style="margin:0;">${pluralLabelCap} found: ${options.mineCount}</p>
        <p style="margin:0;">Layer: ${escapeHtml(options.layerName)}</p>
        <p style="margin:0;">Total features in area: ${options.featureCount}</p>
        <calcite-button id="reveal-btn" appearance="outline" width="full">Show map</calcite-button>

        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <p style="margin:0; font-weight:600;">Save this map</p>
          <div style="display:flex; gap:0.5rem;">
            <calcite-input id="save-name-input" placeholder="Save map configuration" style="flex:1;"></calcite-input>
            <calcite-button id="save-btn">Save</calcite-button>
          </div>
          <div id="save-feedback"></div>
        </div>

        <calcite-button id="share-btn" appearance="outline" width="full" icon-start="share">Share</calcite-button>
        <calcite-button id="play-again-btn" width="full">Try again</calcite-button>
        <calcite-button id="change-layer-btn" appearance="outline" width="full">Start Over</calcite-button>
      </div>
    `;

    document.body.appendChild(this.#dialog);
    this.#dialog.querySelector("#reveal-btn")?.addEventListener("click", () => {
      // Close the dialog itself (rather than just disabling the button) -
      // otherwise the modal backdrop hides the very map it just claimed to
      // reveal. Skip hideLayer/destroy(): the layer should stay visible
      // until whatever screen comes next forces it hidden again.
      showLayer(this.#layer);
      this.#dialog.remove();
    });
    this.#dialog.querySelector("#play-again-btn")?.addEventListener("click", () => {
      options.onPlayAgain();
      this.destroy();
    });
    this.#dialog.querySelector("#change-layer-btn")?.addEventListener("click", () => {
      options.onChangeLayer();
      this.destroy();
    });

    const save = () => {
      const input = this.#dialog.querySelector<HTMLInputElement & { value: string }>("#save-name-input");
      const name = input?.value.trim();
      if (!name) return;
      if (!options.shareParams) {
        console.error("Cannot save: missing shareable location.");
        return;
      }
      const saved = saveConfig({ name, ...options.shareParams });
      const feedback = this.#dialog.querySelector("#save-feedback");
      if (feedback) {
        feedback.innerHTML = `<calcite-notice open kind="success"><div slot="message">Saved as "${escapeHtml(saved.name)}".</div></calcite-notice>`;
      }
    };
    this.#dialog.querySelector("#save-btn")?.addEventListener("click", save);
    this.#dialog.querySelector("#save-name-input")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") save();
    });

    this.#dialog.querySelector("#share-btn")?.addEventListener("click", () => {
      if (!options.shareParams) return;
      new ShareDialog({ url: buildShareUrl(options.shareParams) });
    });

    requestAnimationFrame(() => {
      (this.#dialog as HTMLElement & { open: boolean }).open = true;
    });
  }

  destroy(): void {
    // Belt-and-braces: whatever the reveal toggle did, never leak visibility
    // into the next screen (this is the fix for the reported restart bug).
    hideLayer(this.#layer);
    this.#dialog.remove();
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
