import "@esri/calcite-components/components/calcite-dialog";
import "@esri/calcite-components/components/calcite-input-text";
import "@esri/calcite-components/components/calcite-list";
import "@esri/calcite-components/components/calcite-list-item";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-loader";

import type PortalItem from "@arcgis/core/portal/PortalItem.js";
import { searchFeatureServices } from "../arcgis/portalSearch.ts";
import { discoverGameLayers, type GameSublayer, type GameGeometryType } from "../arcgis/layerDiscovery.ts";

const GEOMETRY_TYPE_LABEL: Record<GameGeometryType, string> = {
  point: "Point layer",
  polyline: "Line layer",
  polygon: "Polygon layer",
};

export interface LayerPickerResult {
  item: PortalItem;
  layerId: number;
  layerName: string;
}

export interface LayerPickerDialogOptions {
  onPicked: (result: LayerPickerResult) => void;
  onCancel: () => void;
}

const DEBOUNCE_MS = 1000;
const MIN_QUERY_LENGTH = 4;
// Fixed so the dialog doesn't visibly resize as it goes from the empty
// search box to a populated results list, or between the search/sublayer
// steps.
const DIALOG_BODY_HEIGHT = "60vh";

export class LayerPickerDialog {
  #dialog: HTMLElement;
  #body: HTMLElement;
  #footer: HTMLElement;
  #options: LayerPickerDialogOptions;

  #searchAbort: AbortController | null = null;
  #discoverAbort: AbortController | null = null;
  #debounceHandle: ReturnType<typeof setTimeout> | null = null;

  #query = "";
  #items: PortalItem[] = [];
  #nextStart: number | null = null;
  #searching = false;
  #searchError: string | null = null;

  #selectedItem: PortalItem | null = null;
  #sublayers: GameSublayer[] = [];
  #discovering = false;
  #discoverError: string | null = null;
  #selectedSublayerId: number | null = null;
  #picked = false;

  constructor(options: LayerPickerDialogOptions) {
    this.#options = options;

    this.#dialog = document.createElement("calcite-dialog");
    this.#dialog.setAttribute("heading", "Choose a layer");
    this.#dialog.setAttribute("modal", "");
    this.#dialog.setAttribute("width-scale", "l");
    this.#body = document.createElement("div");
    this.#dialog.appendChild(this.#body);
    this.#footer = document.createElement("div");
    this.#footer.setAttribute("slot", "footer");
    this.#dialog.appendChild(this.#footer);
    document.body.appendChild(this.#dialog);

    // calciteDialogClose fires for every close, including the one this
    // component triggers itself after a successful pick (see #confirm) -
    // only treat it as a user cancel when no pick was made.
    this.#dialog.addEventListener("calciteDialogClose", () => {
      this.#searchAbort?.abort();
      this.#discoverAbort?.abort();
      if (!this.#picked) this.#options.onCancel();
    });

    this.#render();
  }

  open(): void {
    this.#picked = false;
    this.#query = "";
    this.#items = [];
    this.#nextStart = null;
    this.#searchError = null;
    this.#selectedItem = null;
    this.#sublayers = [];
    this.#discoverError = null;
    this.#selectedSublayerId = null;
    // Force a full rebuild rather than reusing the previous open's search
    // input node (see the #search-results-area check in #renderSearchStep) -
    // otherwise a stale query would still be visible in the input.
    this.#body.innerHTML = "";
    this.#render();
    (this.#dialog as HTMLElement & { open: boolean }).open = true;
  }

  close(): void {
    (this.#dialog as HTMLElement & { open: boolean }).open = false;
  }

  #onQueryInput(value: string): void {
    this.#query = value;
    if (this.#debounceHandle) clearTimeout(this.#debounceHandle);

    if (this.#query.trim().length < MIN_QUERY_LENGTH) {
      this.#searchAbort?.abort();
      this.#items = [];
      this.#nextStart = null;
      this.#searchError = null;
      this.#searching = false;
      this.#render();
      return;
    }

    this.#debounceHandle = setTimeout(() => void this.#runSearch(1), DEBOUNCE_MS);
  }

  async #runSearch(start: number): Promise<void> {
    this.#searchAbort?.abort();
    const controller = new AbortController();
    this.#searchAbort = controller;

    if (this.#query.trim().length < MIN_QUERY_LENGTH) {
      this.#items = [];
      this.#nextStart = null;
      this.#searchError = null;
      this.#render();
      return;
    }

    this.#searching = true;
    this.#searchError = null;
    this.#render();
    try {
      const page = await searchFeatureServices(this.#query, start, controller.signal);
      if (controller.signal.aborted) return;
      this.#items = start === 1 ? page.items : [...this.#items, ...page.items];
      this.#nextStart = page.nextStart;
      this.#searching = false;
      this.#render();
    } catch (err) {
      if (controller.signal.aborted) return;
      this.#searching = false;
      this.#searchError = err instanceof Error ? err.message : "Search failed. Check your connection and try again.";
      this.#render();
    }
  }

  async #selectItem(item: PortalItem): Promise<void> {
    this.#selectedItem = item;
    this.#sublayers = [];
    this.#discoverError = null;
    this.#selectedSublayerId = null;
    this.#discovering = true;
    this.#render();

    this.#discoverAbort?.abort();
    const controller = new AbortController();
    this.#discoverAbort = controller;

    try {
      const sublayers = await discoverGameLayers(item, controller.signal);
      if (controller.signal.aborted) return;
      this.#sublayers = sublayers;
      if (sublayers.length === 1) this.#selectedSublayerId = sublayers[0].id;
      this.#discovering = false;
      this.#render();
    } catch (err) {
      if (controller.signal.aborted) return;
      this.#discovering = false;
      this.#discoverError =
        err instanceof Error ? err.message : "Could not read this service's layers. Try another item.";
      this.#render();
    }
  }

  #confirm(): void {
    if (!this.#selectedItem || this.#selectedSublayerId == null) return;
    const sublayer = this.#sublayers.find((s) => s.id === this.#selectedSublayerId);
    this.#picked = true;
    this.#options.onPicked({
      item: this.#selectedItem,
      layerId: this.#selectedSublayerId,
      layerName: sublayer?.name ?? `Layer ${this.#selectedSublayerId}`,
    });
    this.close();
  }

  #backToSearch(): void {
    this.#discoverAbort?.abort();
    this.#selectedItem = null;
    this.#sublayers = [];
    this.#discoverError = null;
    this.#selectedSublayerId = null;
    this.#render();
  }

  #render(): void {
    if (this.#selectedItem) {
      this.#renderSublayerStep();
    } else {
      this.#renderSearchStep();
    }
  }

  #renderSearchStep(): void {
    this.#footer.innerHTML = "";

    const rows = this.#items
      .map((item) => {
        const detailsUrl = item.itemPageUrl;
        return `
        <calcite-list-item
          data-item-id="${item.id ?? ""}"
          label="${escapeHtml(item.title ?? "Untitled item")}"
          description="${escapeHtml(item.snippet ?? item.owner ?? "")}"
        >
          ${detailsUrl ? `<calcite-action slot="actions-end" data-item-url="${escapeHtml(detailsUrl)}" icon="launch" text="View item details on ArcGIS Online" title="View item details on ArcGIS Online"></calcite-action>` : ""}
        </calcite-list-item>`;
      })
      .join("");

    const trimmedQuery = this.#query.trim();
    const queryTooShort = trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH;

    // The search input is built once and never recreated while this step
    // stays mounted - replacing it on every keystroke (as a full innerHTML
    // re-render would) drops keyboard focus, forcing the user to keep
    // clicking back in to keep typing. Only #resultsArea below is
    // re-rendered on every keystroke/search update.
    let resultsArea = this.#body.querySelector<HTMLElement>("#search-results-area");
    if (!resultsArea) {
      this.#body.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:0.75rem; height: ${DIALOG_BODY_HEIGHT}; overflow-y:auto;">
          <p style="margin:0; color: var(--calcite-color-text-2);">Search public, anonymous ArcGIS Online feature layers — point, line, or polygon data anyone can access without signing in.</p>
          <calcite-input-text id="search-input" placeholder="Search public feature layers, e.g. parks" value="${escapeHtml(this.#query)}"></calcite-input-text>
          <div id="search-results-area" style="display:flex; flex-direction:column; gap:0.75rem;"></div>
        </div>
      `;

      const input = this.#body.querySelector<HTMLElement>("#search-input");
      input?.addEventListener("calciteInputTextInput", (e) => {
        const value = (e.target as HTMLElement & { value: string }).value;
        this.#onQueryInput(value);
      });

      resultsArea = this.#body.querySelector<HTMLElement>("#search-results-area")!;
    }

    resultsArea.innerHTML = `
      ${queryTooShort ? `<calcite-notice open kind="info"><div slot="message">Keep typing — enter at least ${MIN_QUERY_LENGTH} characters to search.</div></calcite-notice>` : ""}
      ${this.#searchError ? `<calcite-notice open kind="danger"><div slot="message">${escapeHtml(this.#searchError)}</div></calcite-notice>` : ""}
      ${this.#searching ? `<calcite-loader label="Searching" inline></calcite-loader>` : ""}
      ${
        !this.#searching && !queryTooShort && trimmedQuery && this.#items.length === 0 && !this.#searchError
          ? `<calcite-notice open kind="info"><div slot="message">No public feature services matched "${escapeHtml(this.#query)}".</div></calcite-notice>`
          : ""
      }
      <calcite-list id="results-list">${rows}</calcite-list>
      ${this.#nextStart != null ? `<calcite-button id="load-more-btn" appearance="outline" width="full">Load more</calcite-button>` : ""}
    `;

    resultsArea.querySelectorAll<HTMLElement>("calcite-list-item[data-item-id]").forEach((el) => {
      el.addEventListener("calciteListItemSelect", () => {
        const id = el.getAttribute("data-item-id");
        const item = this.#items.find((i) => i.id === id);
        if (item) void this.#selectItem(item);
      });
    });

    resultsArea.querySelectorAll<HTMLElement>("calcite-action[data-item-url]").forEach((el) => {
      el.addEventListener("click", () => {
        const url = el.getAttribute("data-item-url");
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      });
    });

    resultsArea.querySelector("#load-more-btn")?.addEventListener("click", () => {
      if (this.#nextStart != null) void this.#runSearch(this.#nextStart);
    });
  }

  #renderSublayerStep(): void {
    const item = this.#selectedItem!;
    const sublayerRows = this.#sublayers
      .map(
        (s) => `
        <calcite-list-item
          data-layer-id="${s.id}"
          label="${escapeHtml(s.name)}"
          description="${GEOMETRY_TYPE_LABEL[s.geometryType]}"
          ${this.#selectedSublayerId === s.id ? "selected" : ""}
        ></calcite-list-item>`,
      )
      .join("");

    this.#body.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:0.75rem; height: ${DIALOG_BODY_HEIGHT}; overflow-y:auto;">
        <calcite-button id="back-btn" appearance="transparent" icon-start="chevron-left" width="auto">Back to search</calcite-button>
        <p style="margin:0;"><strong>${escapeHtml(item.title ?? "Untitled item")}</strong></p>
        ${this.#discovering ? `<calcite-loader label="Reading layers" inline></calcite-loader>` : ""}
        ${this.#discoverError ? `<calcite-notice open kind="danger"><div slot="message">${escapeHtml(this.#discoverError)}</div></calcite-notice>` : ""}
        ${
          !this.#discovering && !this.#discoverError && this.#sublayers.length === 0
            ? `<calcite-notice open kind="warning"><div slot="message">This service has no point, line, or polygon layers.</div></calcite-notice>`
            : ""
        }
        ${
          !this.#discovering && this.#sublayers.length === 1
            ? `<calcite-notice open kind="success"><div slot="message">Using its only eligible layer: ${escapeHtml(this.#sublayers[0].name)}</div></calcite-notice>`
            : ""
        }
        ${
          !this.#discovering && this.#sublayers.length > 1
            ? `<p style="margin:0;">This service has multiple layers — pick one:</p><calcite-list id="sublayer-list" selection-mode="single-persist" selection-appearance="icon">${sublayerRows}</calcite-list>`
            : ""
        }
      </div>
    `;

    this.#footer.innerHTML = `
      <calcite-button id="confirm-btn" width="full" ${this.#selectedSublayerId == null ? "disabled" : ""}>Use this layer</calcite-button>
    `;

    this.#body.querySelector("#back-btn")?.addEventListener("click", () => this.#backToSearch());
    this.#footer.querySelector("#confirm-btn")?.addEventListener("click", () => this.#confirm());
    this.#body.querySelectorAll<HTMLElement>("calcite-list-item[data-layer-id]").forEach((el) => {
      el.addEventListener("calciteListItemSelect", () => {
        const id = Number(el.getAttribute("data-layer-id"));
        this.#selectedSublayerId = id;
        this.#render();
      });
    });
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
