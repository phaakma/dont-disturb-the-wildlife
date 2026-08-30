import Basemap from "@arcgis/core/Basemap.js";
import LocalBasemapsSource from "@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource.js";
import type MapView from "@arcgis/core/views/MapView.js";
import type Map from "@arcgis/core/Map.js";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

export interface ArcgisMapElement extends HTMLElement {
  view: MapView;
  map: Map;
  ready: boolean;
}

export interface ArcgisBasemapGalleryElement extends HTMLElement {
  source: LocalBasemapsSource;
}

/** The basemap styles offered in the game's basemap picker; see #configureBasemapGallery. */
export const BASEMAP_IDS = ["dark-gray-vector", "satellite", "streets-navigation-vector"] as const;
export const DEFAULT_BASEMAP_ID: (typeof BASEMAP_IDS)[number] = "dark-gray-vector";

/** Restricts the basemap gallery widget to just the game's four supported styles. */
export function configureBasemapGallery(galleryEl: ArcgisBasemapGalleryElement): void {
  galleryEl.source = new LocalBasemapsSource({
    basemaps: BASEMAP_IDS.map((id) => Basemap.fromId(id)).filter((b): b is Basemap => b != null),
  });
}

export function isValidBasemapId(id: string | null | undefined): id is (typeof BASEMAP_IDS)[number] {
  return (BASEMAP_IDS as readonly string[]).includes(id ?? "");
}

/** Apply a saved/shared basemap choice to the map, ignoring unknown ids. */
export function setMapBasemap(mapEl: ArcgisMapElement, basemapId: string): void {
  if (!isValidBasemapId(basemapId)) return;
  const basemap = Basemap.fromId(basemapId);
  if (basemap) mapEl.map.basemap = basemap;
}

/** Hide the zoom and basemap-gallery widgets while the game is frozen (preparing/playing) - a visible but inert control is worse than no control. */
export function setMapWidgetsVisible(widgets: HTMLElement[], visible: boolean): void {
  for (const widget of widgets) widget.classList.toggle("chrome-hidden", !visible);
}

export async function whenViewReady(mapEl: ArcgisMapElement): Promise<MapView> {
  if (mapEl.ready) return mapEl.view;
  await new Promise<void>((resolve) => {
    mapEl.addEventListener("arcgisViewReadyChange", () => resolve(), { once: true });
  });
  return mapEl.view;
}

/**
 * Add the chosen point layer to the map fully hidden. `opacity: 0` is used
 * instead of `visible: false` — the latter tears down the layer view, and
 * both queryFeatureCount() (M2) and queryAggregates() (M3) need it alive
 * (see IMPLEMENTATION_PLAN.md section 5).
 */
export function addHiddenLayer(mapEl: ArcgisMapElement, layer: FeatureLayer): void {
  layer.opacity = 0;
  mapEl.map.add(layer);
}

export function removeLayer(mapEl: ArcgisMapElement, layer: FeatureLayer): void {
  mapEl.map.remove(layer);
}

/** Show the real data points (framing preview toggle, or post-game reveal). */
export function showLayer(layer: FeatureLayer): void {
  layer.opacity = 1;
}

/** Hide the real data points. Always called on entry to framing/preparing so a
 * previous screen's preview toggle can never leak into the next one. */
export function hideLayer(layer: FeatureLayer): void {
  layer.opacity = 0;
}

/**
 * Lock the view in place for the rest of the game. Cluster radius is in
 * screen pixels, so any pan, zoom, or rotation after this point would
 * silently invalidate the mine positions (IMPLEMENTATION_PLAN.md 3.4).
 * Omit any zoom-control UI once this has run - a visible but inert control
 * is worse than no control.
 */
export function freezeView(view: MapView): void {
  view.constraints.minScale = view.scale;
  view.constraints.maxScale = view.scale;
  view.constraints.rotationEnabled = false;
  view.navigation.actionMap.dragPrimary = "none";
  view.navigation.actionMap.mouseWheel = "none";
  view.navigation.browserTouchPanEnabled = false;
}

/** Restore normal navigation, e.g. after an auto-tune failure sends the player back to framing. */
export function unfreezeView(view: MapView): void {
  view.constraints.minScale = 0;
  view.constraints.maxScale = 0;
  view.constraints.rotationEnabled = true;
  view.navigation.actionMap.dragPrimary = "pan";
  view.navigation.actionMap.mouseWheel = "zoom";
  view.navigation.browserTouchPanEnabled = true;
}
