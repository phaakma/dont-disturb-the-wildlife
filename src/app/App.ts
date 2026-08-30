import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-loader";

import type MapView from "@arcgis/core/views/MapView.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type Extent from "@arcgis/core/geometry/Extent.js";

import { AppStore, type AppState, type ChosenLayer } from "./state.ts";
import { DIFFICULTY_SIZE, type Difficulty } from "../game/types.ts";
import { createBoard } from "../game/board.ts";
import { renderLandingPage } from "../components/LandingPage.ts";
import { LayerPickerDialog, type LayerPickerResult } from "../components/LayerPickerDialog.ts";
import { FramingPanel } from "../components/FramingPanel.ts";
import { GameBoard } from "../components/GameBoard.ts";
import { StatusBar } from "../components/StatusBar.ts";
import { ResultDialog } from "../components/ResultDialog.ts";
import { TryNowDialog } from "../components/TryNowDialog.ts";
import { loadGameLayer } from "../arcgis/layerDiscovery.ts";
import { loadPortalItemById } from "../arcgis/portalSearch.ts";
import { type SavedMapExample } from "./savedMapExamples.ts";
import {
  type ArcgisMapElement,
  type ArcgisBasemapGalleryElement,
  whenViewReady,
  addHiddenLayer,
  removeLayer,
  hideLayer,
  freezeView,
  unfreezeView,
  configureBasemapGallery,
  setMapWidgetsVisible,
  DEFAULT_BASEMAP_ID,
} from "../arcgis/mapSetup.ts";
import { autoTuneMineDensity } from "../arcgis/mineDerivation.ts";
import { computeScreenRect } from "../arcgis/gridGeometry.ts";
import { listSavedConfigs, deleteConfig, renameConfig, type SavedConfig } from "./savedConfigs.ts";
import { buildShareUrl, parseShareParams, type ShareParams } from "./shareUrl.ts";
import { EMPTY_FILTER, buildWhereClause } from "./filterExpression.ts";
import { getCurrentTheme, setCurrentTheme } from "./themeStore.ts";
import { getTheme } from "../game/themes.ts";

interface Destroyable {
  destroy(): void;
}

function difficultyForGridSize(size: number): Difficulty {
  const preset = (Object.entries(DIFFICULTY_SIZE) as [Difficulty, number][]).find(([, s]) => s === size);
  return preset?.[0] ?? "custom";
}

type PreparingState = Extract<AppState, { screen: "preparing" }>;
type PlayingState = Extract<AppState, { screen: "playing" }>;

export interface AppElements {
  panelContent: HTMLElement;
  mapEl: ArcgisMapElement;
  boardOverlay: HTMLElement;
  landingContent: HTMLElement;
  sidePanel: HTMLElement;
  mapStage: HTMLElement;
  menuToggle: HTMLElement;
  zoomWidget: HTMLElement;
  basemapGallery: ArcgisBasemapGalleryElement;
}

export class App {
  #store: AppStore;
  #panelContent: HTMLElement;
  #mapEl: ArcgisMapElement;
  #boardOverlay: HTMLElement;
  #landingContent: HTMLElement;
  #sidePanel: HTMLElement;
  #mapStage: HTMLElement;
  #menuToggle: HTMLElement;
  #zoomWidget: HTMLElement;
  #basemapGallery: ArcgisBasemapGalleryElement;
  #view: MapView | null = null;
  #layerPicker: LayerPickerDialog;
  #activePanel: Destroyable | null = null;
  #layerOnMap: FeatureLayer | null = null;
  #pendingGoTo: Extent | { center: [number, number]; zoom: number } | null = null;
  #themeId: string;

  constructor(elements: AppElements) {
    this.#panelContent = elements.panelContent;
    this.#mapEl = elements.mapEl;
    this.#boardOverlay = elements.boardOverlay;
    this.#landingContent = elements.landingContent;
    this.#sidePanel = elements.sidePanel;
    this.#mapStage = elements.mapStage;
    this.#menuToggle = elements.menuToggle;
    this.#zoomWidget = elements.zoomWidget;
    this.#basemapGallery = elements.basemapGallery;
    this.#themeId = getCurrentTheme();
    this.#store = new AppStore({ screen: "intro" });

    configureBasemapGallery(this.#basemapGallery);

    this.#layerPicker = new LayerPickerDialog({
      onPicked: (result) => void this.#onLayerPicked(result),
      onCancel: () => {
        if (this.#store.state.screen === "picking-layer") {
          this.#store.setState({ screen: "intro" });
        }
      },
    });

    this.#store.subscribe((state) => this.#renderScreen(state));
    this.#renderScreen(this.#store.state);

    const sharedParams = parseShareParams(location.search);
    if (sharedParams) void this.#loadAndFrame(sharedParams);
  }

  async #onLayerPicked(result: LayerPickerResult): Promise<void> {
    try {
      const layer = await loadGameLayer(result.item, result.layerId);
      const chosen: ChosenLayer = {
        layer,
        itemTitle: result.item.title ?? "Untitled item",
        layerName: result.layerName,
        geometryType: layer.geometryType as ChosenLayer["geometryType"],
        filter: EMPTY_FILTER,
      };
      if (layer.fullExtent) this.#pendingGoTo = layer.fullExtent;
      this.#store.setState({ screen: "framing", chosen });
    } catch (err) {
      console.error("Failed to load the selected layer", err);
      this.#store.setState({ screen: "intro" });
    }
  }

  async #playSavedMapExample(example: SavedMapExample): Promise<void> {
    try {
      const item = await loadPortalItemById(example.itemId);
      const layer = await loadGameLayer(item, example.layerId);
      const chosen: ChosenLayer = {
        layer,
        itemTitle: item.title ?? example.title,
        layerName: example.title,
        geometryType: layer.geometryType as ChosenLayer["geometryType"],
        filter: example.filter ?? EMPTY_FILTER,
      };
      // Fixed to a hand-picked region rather than the layer's full extent -
      // see the comment on SAVED_MAP_EXAMPLES.
      this.#pendingGoTo = { center: example.center, zoom: example.zoom };
      this.#setTheme(example.themeId);
      this.#store.setState({ screen: "framing", chosen });
    } catch (err) {
      console.error("Failed to load the saved map example", err);
      this.#store.setState({ screen: "intro" });
    }
  }

  /** Restore a shared URL or a saved config: load the layer, then frame it at the given pan/zoom. */
  async #loadAndFrame(params: ShareParams): Promise<void> {
    try {
      const item = await loadPortalItemById(params.itemId);
      const layer = await loadGameLayer(item, params.layerId);
      const geometryType = layer.geometryType as ChosenLayer["geometryType"];
      const chosen: ChosenLayer = {
        layer,
        itemTitle: item.title ?? "Untitled item",
        layerName: layer.title ?? "Layer",
        geometryType,
        filter: params.filter,
      };
      this.#setTheme(params.themeId);
      this.#pendingGoTo = { center: params.center, zoom: params.zoom };
      this.#store.setState({ screen: "framing", chosen });
    } catch (err) {
      console.error("Failed to restore the shared or saved location", err);
      this.#store.setState({ screen: "intro" });
    }
  }

  #setTheme(themeId: string): void {
    this.#themeId = themeId;
    setCurrentTheme(themeId);
  }

  #renderScreen(state: AppState): void {
    this.#activePanel?.destroy();
    this.#activePanel = null;

    switch (state.screen) {
      case "intro":
        this.#teardownLayer();
        this.#setGameChromeVisible(false);
        this.#renderLanding();
        break;
      case "picking-layer":
        // The dialog is a standalone overlay opened by the landing page;
        // the page behind it is left as-is.
        break;
      case "framing":
        this.#setGameChromeVisible(true);
        void this.#enterFraming(state.chosen, state.startError ?? null, state.gridSize);
        break;
      case "preparing":
        this.#setGameChromeVisible(true);
        void this.#enterPreparing(state);
        break;
      case "playing":
        this.#setGameChromeVisible(true);
        this.#enterPlaying(state);
        break;
      default:
        break;
    }
  }

  /** Switches between the marketing-style landing page and the game view (map + side panel). */
  #setGameChromeVisible(visible: boolean): void {
    this.#landingContent.classList.toggle("chrome-hidden", visible);
    this.#sidePanel.classList.toggle("chrome-hidden", !visible);
    this.#mapStage.classList.toggle("chrome-hidden", !visible);
    this.#menuToggle.classList.toggle("chrome-hidden", !visible);
  }

  #renderLanding(): void {
    renderLandingPage(this.#landingContent, {
      savedConfigs: listSavedConfigs(),
      selectedThemeId: this.#themeId,
      onSelectTheme: (themeId: string) => {
        this.#setTheme(themeId);
        this.#renderLanding();
      },
      onChooseLayer: () => {
        this.#store.setState({ screen: "picking-layer" });
        this.#layerPicker.open();
      },
      onTryExample: (example: SavedMapExample) => {
        new TryNowDialog({
          title: example.title,
          snippet: example.snippet,
          onPlayNow: () => void this.#playSavedMapExample(example),
        }).open();
      },
      onLoadSaved: (config: SavedConfig) => void this.#loadAndFrame(config),
      onDeleteSaved: (id: string) => {
        deleteConfig(id);
        this.#renderLanding();
      },
      onRenameSaved: (id: string, name: string) => {
        renameConfig(id, name);
        this.#renderLanding();
      },
      onCopyUrl: (config: SavedConfig) => navigator.clipboard.writeText(buildShareUrl(config)),
    });
  }

  async #enterFraming(chosen: ChosenLayer, startError: string | null, gridSize?: number): Promise<void> {
    this.#view ??= await whenViewReady(this.#mapEl);

    if (this.#layerOnMap !== chosen.layer) {
      this.#teardownLayer();
      // Set before the layer ever joins the map/view: a layer view created
      // for an already-filtered layer bakes the filter into its very first
      // load, whereas changing definitionExpression on a layer view that's
      // already live races its cluster-aggregation refresh (the first
      // queryAggregates() after the change can return stale/incomplete
      // results - see clustering.ts).
      chosen.layer.definitionExpression = buildWhereClause(chosen.filter);
      addHiddenLayer(this.#mapEl, chosen.layer);
      this.#layerOnMap = chosen.layer;
    }
    // Always force hidden here: a previous game with this same layer object
    // may have left it visible via the framing preview toggle or the
    // game-over reveal button.
    hideLayer(chosen.layer);
    unfreezeView(this.#view);
    setMapWidgetsVisible([this.#zoomWidget, this.#basemapGallery], true);

    if (this.#pendingGoTo) {
      const goTo = this.#pendingGoTo;
      this.#pendingGoTo = null;
      await this.#view.goTo(goTo);
    }

    // A state change may have happened while we were awaiting view
    // readiness (e.g. the user picked a different layer, or cancelled).
    if (this.#store.state.screen !== "framing" || this.#store.state.chosen !== chosen) return;

    const initialGridSize = gridSize ?? DIFFICULTY_SIZE.intermediate;
    this.#activePanel = new FramingPanel(this.#panelContent, {
      view: this.#view,
      layer: chosen.layer,
      layerName: chosen.layerName,
      itemTitle: chosen.itemTitle,
      geometryType: chosen.geometryType,
      initialDifficulty: difficultyForGridSize(initialGridSize),
      initialGridSize,
      initialError: startError,
      initialFilter: chosen.filter,
      themeId: this.#themeId,
      onStart: (gridSize, gridExtent, featureCount) => {
        this.#store.setState({ screen: "preparing", chosen, gridSize, gridExtent, featureCount });
      },
      onChangeLayer: () => this.#store.setState({ screen: "intro" }),
      onFilterChange: (filter) => {
        chosen.filter = filter;
      },
    });
  }

  async #enterPreparing(state: PreparingState): Promise<void> {
    this.#panelContent.innerHTML = `
      <calcite-panel heading="Preparing your board">
        <div style="padding:0 1rem 1rem; display:flex; flex-direction:column; gap:0.75rem; align-items:center;">
          <calcite-loader label="Finding mines" scale="l"></calcite-loader>
          <p style="margin:0; text-align:center;">Clustering nearby points into mines...</p>
        </div>
      </calcite-panel>
    `;

    const view = this.#view;
    if (!view) return;

    hideLayer(state.chosen.layer);
    freezeView(view);
    setMapWidgetsVisible([this.#zoomWidget, this.#basemapGallery], false);

    try {
      const layerView = await view.whenLayerView(state.chosen.layer);
      const result = await autoTuneMineDensity(layerView, state.gridExtent, state.gridSize, state.gridSize);

      // A state change may have happened while auto-tune was running
      // (e.g. the player backed out); don't act on a stale result.
      if (this.#store.state !== state) return;

      if (!result.ok) {
        unfreezeView(view);
        this.#store.setState({ screen: "framing", chosen: state.chosen, startError: result.message, gridSize: state.gridSize });
        return;
      }

      const board = createBoard(state.gridSize, state.gridSize, result.mineCells);
      this.#store.setState({
        screen: "playing",
        chosen: state.chosen,
        gridSize: state.gridSize,
        gridExtent: state.gridExtent,
        board,
        radiusPx: result.radiusPx,
        featureCount: state.featureCount,
      });
    } catch (err) {
      console.error("Auto-tune failed", err);
      if (this.#store.state !== state) return;
      unfreezeView(view);
      this.#store.setState({
        screen: "framing",
        chosen: state.chosen,
        startError: "Something went wrong while preparing the board. Try again.",
        gridSize: state.gridSize,
      });
    }
  }

  #enterPlaying(state: PlayingState): void {
    const view = this.#view;
    if (!view) return;

    // View is frozen for the duration of play, so center/zoom here still
    // match what the player actually framed.
    const shareParams = this.#buildShareParams(state.chosen, view);
    const theme = getTheme(this.#themeId);
    const basemapId = this.#mapEl.map.basemap?.id ?? DEFAULT_BASEMAP_ID;

    const statusBar = new StatusBar(this.#panelContent, {
      board: state.board,
      onRestart: () => this.#store.setState({ screen: "framing", chosen: state.chosen, gridSize: state.gridSize }),
      onStartOver: () => this.#store.setState({ screen: "intro" }),
    });

    const gameBoard = new GameBoard(this.#boardOverlay, {
      board: state.board,
      theme,
      basemapId,
      onChange: (status, isFirstInteraction) => {
        if (isFirstInteraction) statusBar.startTimer();
        statusBar.refresh();

        if (status !== "playing") {
          const elapsedMs = statusBar.stopTimer();
          new ResultDialog({
            status,
            elapsedMs,
            mineCount: state.board.mineCount,
            gridSize: state.gridSize,
            layerName: state.chosen.layerName,
            featureCount: state.featureCount,
            layer: state.chosen.layer,
            theme,
            shareParams,
            onPlayAgain: () => this.#store.setState({ screen: "framing", chosen: state.chosen, gridSize: state.gridSize }),
            onChangeLayer: () => this.#store.setState({ screen: "intro" }),
          });
        }
      },
    });

    const rect = computeScreenRect(view, state.gridExtent);
    if (rect) gameBoard.setRect(rect);

    const onResize = () => {
      const r = computeScreenRect(view, state.gridExtent);
      if (r) gameBoard.setRect(r);
    };
    window.addEventListener("resize", onResize);

    this.#activePanel = {
      destroy: () => {
        window.removeEventListener("resize", onResize);
        statusBar.destroy();
        gameBoard.destroy();
      },
    };
  }

  /** Null when the layer/view lack what's needed to reconstruct a shareable location (e.g. no portal item). */
  #buildShareParams(chosen: ChosenLayer, view: MapView): ShareParams | null {
    const itemId = chosen.layer.portalItem?.id;
    const layerId = chosen.layer.layerId;
    const center = view.center;
    if (!itemId || layerId == null || center.longitude == null || center.latitude == null) return null;
    return {
      itemId,
      layerId,
      center: [center.longitude, center.latitude],
      zoom: view.zoom,
      filter: chosen.filter,
      themeId: this.#themeId,
    };
  }

  #teardownLayer(): void {
    if (this.#layerOnMap) {
      removeLayer(this.#mapEl, this.#layerOnMap);
      this.#layerOnMap = null;
    }
  }
}
