import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import type Extent from "@arcgis/core/geometry/Extent.js";
import type { Board } from "../game/types.ts";
import type { GameGeometryType } from "../arcgis/layerDiscovery.ts";
import type { FilterSpec } from "./filterExpression.ts";

export interface ChosenLayer {
  layer: FeatureLayer;
  itemTitle: string;
  layerName: string;
  geometryType: GameGeometryType;
  /**
   * Mutated in place by FramingPanel whenever the filter changes (see
   * App.#enterFraming's onFilterChange), so it survives "play again"/
   * restart cycles that carry the same `chosen` object forward unchanged.
   */
  filter: FilterSpec;
}

export type AppState =
  | { screen: "intro" }
  | { screen: "picking-layer" }
  // FramingPanel owns its own transient UI state (difficulty, live extent,
  // feature count) the same way LayerPickerDialog owns its search state -
  // nothing else in the app needs it, so it isn't lifted into AppState.
  // `startError` carries an auto-tune failure message back from a failed
  // "preparing" attempt so FramingPanel can surface it on re-entry.
  // `gridSize` likewise carries forward the size that just failed, so the
  // freshly-constructed FramingPanel re-selects it instead of resetting to
  // Intermediate (see App.#enterPreparing's failure branches).
  | { screen: "framing"; chosen: ChosenLayer; startError?: string | null; gridSize?: number }
  | {
      screen: "preparing";
      chosen: ChosenLayer;
      gridSize: number;
      gridExtent: Extent;
      featureCount: number;
    }
  // Win/lose is not a separate screen: GameBoard tracks board.status
  // internally and App shows ResultDialog as a standalone overlay on top
  // of "playing" once the status changes, the same way LayerPickerDialog
  // overlays "picking-layer" - see App.#enterPlaying.
  | {
      screen: "playing";
      chosen: ChosenLayer;
      gridSize: number;
      gridExtent: Extent;
      board: Board;
      radiusPx: number;
      featureCount: number;
    };

export type Listener = (state: AppState) => void;

export class AppStore {
  #state: AppState;
  #listeners = new Set<Listener>();

  constructor(initial: AppState) {
    this.#state = initial;
  }

  get state(): AppState {
    return this.#state;
  }

  setState(next: AppState): void {
    this.#state = next;
    for (const listener of this.#listeners) listener(this.#state);
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
