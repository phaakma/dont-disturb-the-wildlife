import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-segmented-control";
import "@esri/calcite-components/components/calcite-segmented-control-item";
import "@esri/calcite-components/components/calcite-slider";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-switch";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-input";

import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type Extent from "@arcgis/core/geometry/Extent.js";

import { computeSquareSubExtent, filterPointsInExtent } from "../arcgis/gridGeometry.ts";
import { queryClusterCentroids } from "../arcgis/clustering.ts";
import { autoTuneMineDensity } from "../arcgis/mineDerivation.ts";
import { withTimeout } from "../arcgis/requestTimeout.ts";
import { showLayer, hideLayer } from "../arcgis/mapSetup.ts";
import type { GameGeometryType } from "../arcgis/layerDiscovery.ts";
import { saveConfig } from "../app/savedConfigs.ts";
import { buildShareUrl, type ShareParams } from "../app/shareUrl.ts";
import { buildWhereClause, type FilterFieldType, type FilterSpec } from "../app/filterExpression.ts";
import { FilterDialog, type FilterFieldInfo } from "./FilterDialog.ts";
import { ShareDialog } from "./ShareDialog.ts";
import { DIFFICULTY_SIZE, type Difficulty } from "../game/types.ts";

const COUNT_TIMEOUT_MS = 15_000;
// Fixed preview radius, distinct from the game's auto-tuned radius (which
// isn't known until the board starts) - just enough to visualise "these
// points will become clusters/mines" during framing.
const PREVIEW_CLUSTER_RADIUS_PX = 50;

// Polygon/line clusters have no auto-generated renderer (unlike points), so
// the preview needs an explicit marker symbol to actually show bubbles.
const NON_POINT_CLUSTER_SYMBOL = {
  type: "simple-marker",
  style: "circle",
  color: [227, 26, 28, 0.85],
  size: 12,
  outline: { color: "white", width: 1 },
} as const;

const FIELD_TYPE_MAP: Record<string, FilterFieldType> = {
  "small-integer": "number",
  integer: "number",
  single: "number",
  double: "number",
  long: "number",
  "big-integer": "number",
  date: "date",
  "date-only": "date",
  "timestamp-offset": "date",
  string: "string",
  guid: "string",
  "global-id": "string",
};

function filterableFields(layer: FeatureLayer): FilterFieldInfo[] {
  return (layer.fields ?? [])
    .filter((f) => f.type in FIELD_TYPE_MAP)
    .map((f) => ({ name: f.name, alias: f.alias ?? f.name, fieldType: FIELD_TYPE_MAP[f.type] }));
}

export interface FramingPanelOptions {
  view: MapView;
  layer: FeatureLayer;
  layerName: string;
  itemTitle: string;
  geometryType: GameGeometryType;
  initialDifficulty: Difficulty;
  initialGridSize: number;
  initialError?: string | null;
  initialFilter: FilterSpec;
  themeId: string;
  onStart: (gridSize: number, gridExtent: Extent, featureCount: number) => void;
  onChangeLayer: () => void;
  onFilterChange: (filter: FilterSpec) => void;
}

const COUNT_DEBOUNCE_MS = 300;
const CUSTOM_MIN = 8;
const CUSTOM_MAX = 30;

const OUTLINE_SYMBOL = {
  type: "simple-fill",
  color: [0, 0, 0, 0],
  outline: { color: [255, 255, 255, 0.9], width: 2 },
} as const;

export class FramingPanel {
  #container: HTMLElement;
  #options: FramingPanelOptions;
  #outlineLayer: GraphicsLayer;
  #watchHandle: ReturnType<typeof reactiveUtils.watch>;
  #countAbort: AbortController | null = null;
  #countDebounce: ReturnType<typeof setTimeout> | null = null;
  #clusterCountAbort: AbortController | null = null;
  #clusterCountDebounce: ReturnType<typeof setTimeout> | null = null;
  #densityCheckDebounce: ReturnType<typeof setTimeout> | null = null;
  #densityCheckToken = 0;
  #layerViewPromise: Promise<FeatureLayerView> | null = null;

  #difficulty: Difficulty;
  #gridSize: number;
  #gridExtent: Extent | null = null;
  #featureCount: number | null = null;
  #countStatus: "idle" | "loading" | "ready" | "error" = "idle";
  #countError: string | null = null;
  #clusterCount: number | null = null;
  #clusterCountStatus: "idle" | "loading" | "ready" | "error" = "idle";

  #startError: string | null;
  #previewVisible = false;
  #saveMessage: string | null = null;
  #saveMessageTimer: ReturnType<typeof setTimeout> | null = null;
  #filter: FilterSpec;
  #filterDialog: FilterDialog;

  constructor(container: HTMLElement, options: FramingPanelOptions) {
    this.#container = container;
    this.#options = options;
    this.#difficulty = options.initialDifficulty;
    this.#gridSize = options.initialGridSize;
    this.#startError = options.initialError ?? null;
    this.#filter = options.initialFilter;
    // Skip the assignment if it's already correct: App#enterFraming sets this
    // before the layer joins the map/view so the layer's very first
    // FeatureLayerView bakes in the filter. Re-assigning the identical string
    // here would still count as a live definitionExpression change on an
    // already-added layer, racing the initial cluster-aggregation query in
    // #onExtentChange below (see clustering.ts).
    const initialWhereClause = buildWhereClause(this.#filter);
    if (options.layer.definitionExpression !== initialWhereClause) {
      options.layer.definitionExpression = initialWhereClause;
    }

    this.#outlineLayer = new GraphicsLayer({ listMode: "hide" });
    // view.map is guaranteed set here: FramingPanel is only constructed
    // after whenViewReady() resolves (see App.#enterFraming).
    options.view.map!.add(this.#outlineLayer);

    this.#filterDialog = new FilterDialog({
      onApply: (spec) => {
        this.#filter = spec;
        this.#options.layer.definitionExpression = buildWhereClause(spec);
        this.#options.onFilterChange(spec);
        this.#scheduleCount();
        this.#scheduleClusterCount();
        if (this.#startError) this.#scheduleDensityCheck();
        this.#render();
      },
    });

    this.#watchHandle = reactiveUtils.watch(
      () => options.view.extent,
      () => this.#onExtentChange(),
      { initial: true },
    );

    this.#render();
  }

  destroy(): void {
    this.#watchHandle.remove();
    this.#countAbort?.abort();
    this.#clusterCountAbort?.abort();
    if (this.#countDebounce) clearTimeout(this.#countDebounce);
    if (this.#clusterCountDebounce) clearTimeout(this.#clusterCountDebounce);
    if (this.#densityCheckDebounce) clearTimeout(this.#densityCheckDebounce);
    this.#densityCheckToken++; // discard any in-flight density check result
    if (this.#saveMessageTimer) clearTimeout(this.#saveMessageTimer);
    // Regardless of the preview toggle's state when the player navigates
    // away, never leave the real data visible or clustered - a leftover
    // featureReduction would otherwise show up as clusters on the post-game
    // "Show real locations" reveal, which must show raw points.
    this.#options.layer.featureReduction = null;
    hideLayer(this.#options.layer);
    this.#options.view.map!.remove(this.#outlineLayer);
    this.#outlineLayer.destroy();
    this.#filterDialog.destroy();
  }

  #togglePreview(visible: boolean): void {
    this.#previewVisible = visible;
    if (visible) showLayer(this.#options.layer);
    else hideLayer(this.#options.layer);
    this.#applyFeatureReduction();
  }

  /**
   * Cluster-count and density-check queries mutate `layer.featureReduction`
   * as a side effect (it's how `queryClusterCentroids` selects a radius) -
   * this puts it back to whatever the preview toggle currently calls for,
   * so a background check never leaves the preview showing the wrong
   * radius (or a missing renderer, for polygon/line layers).
   */
  #applyFeatureReduction(): void {
    const layer = this.#options.layer;
    layer.featureReduction = this.#previewVisible
      ? this.#options.geometryType === "point"
        ? { type: "cluster", clusterRadius: `${PREVIEW_CLUSTER_RADIUS_PX}px` }
        : {
            type: "cluster",
            clusterRadius: `${PREVIEW_CLUSTER_RADIUS_PX}px`,
            renderer: { type: "simple", symbol: NON_POINT_CLUSTER_SYMBOL },
          }
      : null;
  }

  #getLayerView(): Promise<FeatureLayerView> {
    this.#layerViewPromise ??= this.#options.view.whenLayerView(this.#options.layer);
    return this.#layerViewPromise;
  }

  /** Null when the layer/view lack what's needed to reconstruct a shareable location (e.g. no portal item). */
  #shareParams(): ShareParams | null {
    const layer = this.#options.layer;
    const itemId = layer.portalItem?.id;
    const layerId = layer.layerId;
    const center = this.#options.view.center;
    if (!itemId || layerId == null || center.longitude == null || center.latitude == null) return null;
    return {
      itemId,
      layerId,
      center: [center.longitude, center.latitude],
      zoom: this.#options.view.zoom,
      filter: this.#filter,
      themeId: this.#options.themeId,
    };
  }

  #save(): void {
    const input = this.#container.querySelector<HTMLInputElement & { value: string }>("#save-name-input");
    const name = input?.value.trim();
    if (!name) return;

    const params = this.#shareParams();
    if (!params) {
      console.error("Cannot save: layer/view missing portal item id, layer id, or coordinates.");
      return;
    }
    const saved = saveConfig({ name, ...params });

    if (this.#saveMessageTimer) clearTimeout(this.#saveMessageTimer);
    this.#saveMessage = `Saved as "${saved.name}".`;
    this.#render();
    this.#saveMessageTimer = setTimeout(() => {
      this.#saveMessage = null;
      this.#render();
    }, 2500);
  }

  #onExtentChange(): void {
    const extent = this.#options.view.extent;
    if (!extent) return;
    this.#gridExtent = computeSquareSubExtent(extent);
    this.#drawOutline(this.#gridExtent);
    this.#scheduleCount();
    this.#scheduleClusterCount();
    if (this.#startError) this.#scheduleDensityCheck();
  }

  #drawOutline(extent: Extent): void {
    this.#outlineLayer.removeAll();
    this.#outlineLayer.add(
      new Graphic({
        geometry: {
          type: "polygon",
          rings: [
            [
              [extent.xmin, extent.ymin],
              [extent.xmax, extent.ymin],
              [extent.xmax, extent.ymax],
              [extent.xmin, extent.ymax],
              [extent.xmin, extent.ymin],
            ],
          ],
          spatialReference: extent.spatialReference,
        },
        symbol: OUTLINE_SYMBOL,
      }),
    );
  }

  #scheduleCount(): void {
    if (this.#countDebounce) clearTimeout(this.#countDebounce);
    this.#countDebounce = setTimeout(() => void this.#runCount(), COUNT_DEBOUNCE_MS);
  }

  async #runCount(): Promise<void> {
    if (!this.#gridExtent) return;
    this.#countAbort?.abort();
    const controller = new AbortController();
    this.#countAbort = controller;

    this.#countStatus = "loading";
    this.#countError = null;
    this.#render();

    try {
      const count = await this.#options.layer.queryFeatureCount(
        { geometry: this.#gridExtent, spatialRelationship: "intersects" },
        { signal: withTimeout(controller.signal, COUNT_TIMEOUT_MS) },
      );
      if (controller.signal.aborted) return;
      this.#featureCount = count;
      this.#countStatus = "ready";
      this.#render();
    } catch (err) {
      if (controller.signal.aborted) return;
      this.#countStatus = "error";
      this.#countError = err instanceof Error ? err.message : "Could not count features in this area.";
      this.#render();
    }
  }

  #scheduleClusterCount(): void {
    if (this.#clusterCountDebounce) clearTimeout(this.#clusterCountDebounce);
    this.#clusterCountDebounce = setTimeout(() => void this.#runClusterCount(), COUNT_DEBOUNCE_MS);
  }

  /**
   * Displayed count is of cluster points, not raw features - that's what
   * actually becomes a mine, and `queryAggregates` can't be constrained to
   * `gridExtent` directly (see queryClusterCentroids), so centroids are
   * queried over the whole view and filtered down client-side.
   */
  async #runClusterCount(): Promise<void> {
    if (!this.#gridExtent) return;
    this.#clusterCountAbort?.abort();
    const controller = new AbortController();
    this.#clusterCountAbort = controller;
    const gridExtent = this.#gridExtent;

    this.#clusterCountStatus = "loading";
    this.#render();

    try {
      const layerView = await this.#getLayerView();
      const centroids = await queryClusterCentroids(layerView, PREVIEW_CLUSTER_RADIUS_PX);
      this.#applyFeatureReduction();
      if (controller.signal.aborted) return;

      const inExtent = await filterPointsInExtent(centroids, gridExtent);
      if (controller.signal.aborted) return;
      this.#clusterCount = inExtent.length;
      this.#clusterCountStatus = "ready";
      this.#render();
    } catch (err) {
      this.#applyFeatureReduction();
      if (controller.signal.aborted) return;
      console.error("Cluster count failed", err);
      this.#clusterCountStatus = "error";
      this.#render();
    }
  }

  #scheduleDensityCheck(): void {
    // The message names the extent/grid/filter combination that just
    // failed - it no longer applies once any of those has changed, so
    // clear it immediately rather than leaving a stale warning up for the
    // whole debounce + query round trip.
    this.#startError = null;
    this.#render();
    if (this.#densityCheckDebounce) clearTimeout(this.#densityCheckDebounce);
    this.#densityCheckDebounce = setTimeout(() => void this.#runDensityCheck(), COUNT_DEBOUNCE_MS);
  }

  async #runDensityCheck(): Promise<void> {
    if (!this.#gridExtent) return;
    const token = ++this.#densityCheckToken;
    const gridExtent = this.#gridExtent;
    const gridSize = this.#gridSize;

    try {
      const layerView = await this.#getLayerView();
      const result = await autoTuneMineDensity(layerView, gridExtent, gridSize, gridSize);
      if (token === this.#densityCheckToken) {
        this.#startError = result.ok ? null : result.message;
        this.#render();
      }
    } catch (err) {
      console.error("Live density check failed", err);
    } finally {
      // autoTuneMineDensity leaves layer.featureReduction set to whatever
      // radius it last probed - always restore it, even for a stale/aborted
      // check, since it mutated the shared layer regardless.
      this.#applyFeatureReduction();
    }
  }

  #setDifficulty(difficulty: Difficulty, customSize?: number): void {
    this.#difficulty = difficulty;
    if (difficulty === "custom") {
      this.#gridSize = customSize ?? this.#gridSize;
    } else {
      this.#gridSize = DIFFICULTY_SIZE[difficulty];
    }
    if (this.#startError) this.#scheduleDensityCheck();
    this.#render();
  }

  #canStart(): boolean {
    return this.#countStatus === "ready" && (this.#featureCount ?? 0) > 0;
  }

  #render(): void {
    const countLine =
      // A feature-count failure is why Start stays disabled (#canStart), so
      // it takes priority over the cluster line, which is purely informational.
      this.#countStatus === "error"
        ? `<calcite-notice open kind="danger"><div slot="message">${escapeHtml(this.#countError ?? "Count failed.")}</div></calcite-notice>`
        : this.#clusterCountStatus === "loading"
          ? `<calcite-loader label="Counting clusters" inline></calcite-loader>`
          : this.#clusterCountStatus === "error"
            ? `<calcite-notice open kind="danger"><div slot="message">Could not count clusters in this area.</div></calcite-notice>`
            : this.#clusterCountStatus === "ready"
              ? `<p style="margin:0;">${this.#clusterCount} cluster${this.#clusterCount === 1 ? "" : "s"} in the framed area.</p>`
              : `<p style="margin:0;">Pan and zoom to frame your board.</p>`;

    this.#container.innerHTML = `
      <calcite-panel heading="Frame your board">
        <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem;">
          <p style="margin:0;">Layer: <strong>${escapeHtml(this.#options.layerName)}</strong></p>
          <p style="margin:0; color: var(--calcite-color-text-3);">From: ${escapeHtml(this.#options.itemTitle)}</p>

          ${
            this.#startError
              ? `<calcite-notice open kind="warning" closable><div slot="message">${escapeHtml(this.#startError)}</div></calcite-notice>`
              : ""
          }

          <calcite-segmented-control id="difficulty-control" width="full" scale="s">
            <calcite-segmented-control-item value="beginner" ${this.#difficulty === "beginner" ? "checked" : ""}>Beginner 9×9</calcite-segmented-control-item>
            <calcite-segmented-control-item value="intermediate" ${this.#difficulty === "intermediate" ? "checked" : ""}>Intermediate 16×16</calcite-segmented-control-item>
            <calcite-segmented-control-item value="expert" ${this.#difficulty === "expert" ? "checked" : ""}>Expert 22×22</calcite-segmented-control-item>
            <calcite-segmented-control-item value="custom" ${this.#difficulty === "custom" ? "checked" : ""}>Custom</calcite-segmented-control-item>
          </calcite-segmented-control>

          ${
            this.#difficulty === "custom"
              ? `<calcite-slider id="custom-size-slider" min="${CUSTOM_MIN}" max="${CUSTOM_MAX}" value="${this.#gridSize}" label-handles ticks="2"></calcite-slider>`
              : ""
          }

          ${countLine}

          <calcite-label layout="inline" style="margin:0;">
            <calcite-switch id="preview-toggle" ${this.#previewVisible ? "checked" : ""}></calcite-switch>
            ${this.#options.geometryType === "point" ? "Show point clusters" : "Show feature clusters"}
          </calcite-label>

          <calcite-button id="start-btn" width="full" ${this.#canStart() ? "" : "disabled"}>Start game</calcite-button>

          <calcite-button id="filter-btn" appearance="outline" width="full" icon-start="filter">
            ${this.#filter.clauses.length > 0 ? `Filter (${this.#filter.clauses.length})` : "Filter features"}
          </calcite-button>

          <div style="display:flex; gap:0.5rem;">
            <calcite-input id="save-name-input" placeholder="Save map configuration" style="flex:1;"></calcite-input>
            <calcite-button id="save-btn">Save</calcite-button>
          </div>
          ${
            this.#saveMessage
              ? `<calcite-notice open kind="success"><div slot="message">${escapeHtml(this.#saveMessage)}</div></calcite-notice>`
              : ""
          }

          <calcite-button id="share-btn" appearance="outline" width="full" icon-start="share">Share</calcite-button>

          <calcite-button id="change-layer-btn" appearance="transparent" width="full">Start Over</calcite-button>
        </div>
      </calcite-panel>
    `;

    this.#container.querySelector("#difficulty-control")?.addEventListener("calciteSegmentedControlChange", (e) => {
      const value = (e.target as HTMLElement & { value: string }).value as Difficulty;
      this.#setDifficulty(value);
    });

    this.#container.querySelector("#custom-size-slider")?.addEventListener("calciteSliderChange", (e) => {
      const value = (e.target as HTMLElement & { value: number }).value;
      this.#setDifficulty("custom", value);
    });

    this.#container.querySelector("#start-btn")?.addEventListener("click", () => {
      if (!this.#canStart() || !this.#gridExtent) return;
      this.#startError = null;
      this.#options.onStart(this.#gridSize, this.#gridExtent, this.#featureCount ?? 0);
    });

    this.#container.querySelector("#change-layer-btn")?.addEventListener("click", () => {
      this.#options.onChangeLayer();
    });

    this.#container.querySelector("#filter-btn")?.addEventListener("click", () => {
      this.#filterDialog.open(filterableFields(this.#options.layer), this.#filter);
    });

    this.#container.querySelector("#preview-toggle")?.addEventListener("calciteSwitchChange", (e) => {
      const checked = (e.target as HTMLElement & { checked: boolean }).checked;
      this.#togglePreview(checked);
    });

    this.#container.querySelector("#save-btn")?.addEventListener("click", () => this.#save());
    this.#container.querySelector("#save-name-input")?.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") this.#save();
    });

    this.#container.querySelector("#share-btn")?.addEventListener("click", () => {
      const params = this.#shareParams();
      if (!params) return;
      new ShareDialog({ url: buildShareUrl(params) });
    });

    this.#container.querySelector("calcite-notice[kind='warning']")?.addEventListener("calciteNoticeClose", () => {
      this.#startError = null;
    });
  }
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
