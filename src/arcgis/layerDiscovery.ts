import esriRequest from "@arcgis/core/request.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import Layer from "@arcgis/core/layers/Layer.js";
import GroupLayer from "@arcgis/core/layers/GroupLayer.js";
import type PortalItem from "@arcgis/core/portal/PortalItem.js";
import { withTimeout } from "./requestTimeout.ts";

const REQUEST_TIMEOUT_MS = 15_000;

export type GameGeometryType = "point" | "polyline" | "polygon";

export interface GameSublayer {
  id: number;
  name: string;
  geometryType: GameGeometryType;
}

interface RawSublayer {
  id: number;
  name: string;
  geometryType?: string;
}

const REST_GEOMETRY_TYPES: Record<string, GameGeometryType> = {
  esriGeometryPoint: "point",
  esriGeometryPolyline: "polyline",
  esriGeometryPolygon: "polygon",
};

const JS_API_GEOMETRY_TYPES: Record<string, GameGeometryType> = {
  point: "point",
  polyline: "polyline",
  polygon: "polygon",
};

/**
 * Enumerate the point/line/polygon sublayers of a hosted feature service -
 * clustering (and therefore mine derivation) works against any of the
 * three, so callers only need to exclude other geometry types (multipoint,
 * mesh) before letting the user pick one.
 */
export async function discoverGameLayers(item: PortalItem, signal?: AbortSignal): Promise<GameSublayer[]> {
  try {
    return await discoverViaLayersEndpoint(item, signal);
  } catch (err) {
    if (signal?.aborted) throw err; // caller moved on - don't waste a second round-trip
    return discoverViaGroupLayer(item, signal);
  }
}

async function discoverViaLayersEndpoint(item: PortalItem, signal?: AbortSignal): Promise<GameSublayer[]> {
  if (!item.url) throw new Error("Item has no service url");
  const response = await esriRequest<{ layers?: RawSublayer[] }>(`${item.url}/layers`, {
    query: { f: "json" },
    responseType: "json",
    signal: withTimeout(signal, REQUEST_TIMEOUT_MS),
  });
  const layers = response.data.layers ?? [];
  return layers
    .filter((l) => l.geometryType && l.geometryType in REST_GEOMETRY_TYPES)
    .map((l) => ({ id: l.id, name: l.name, geometryType: REST_GEOMETRY_TYPES[l.geometryType!] }));
}

async function discoverViaGroupLayer(item: PortalItem, signal?: AbortSignal): Promise<GameSublayer[]> {
  const layer = await Layer.fromPortalItem({ portalItem: item });
  await layer.load({ signal: withTimeout(signal, REQUEST_TIMEOUT_MS) });

  const candidates = layer instanceof GroupLayer ? layer.layers.toArray() : [layer];
  const sublayers: GameSublayer[] = [];
  candidates.forEach((candidate, i) => {
    if (candidate instanceof FeatureLayer && candidate.geometryType && candidate.geometryType in JS_API_GEOMETRY_TYPES) {
      sublayers.push({
        id: candidate.layerId ?? i,
        name: candidate.title ?? `Layer ${i}`,
        geometryType: JS_API_GEOMETRY_TYPES[candidate.geometryType],
      });
    }
  });
  return sublayers;
}

/**
 * Construct and load the layer the player picked. Throws if the layer fails
 * to load, has no spatial reference, or turns out not to be a point/line/
 * polygon layer, so callers can surface the error and return to the search
 * list rather than crash.
 */
export async function loadGameLayer(item: PortalItem, layerId: number): Promise<FeatureLayer> {
  const layer = new FeatureLayer({ portalItem: item, layerId });
  await layer.load({ signal: withTimeout(undefined, REQUEST_TIMEOUT_MS) });
  if (!layer.spatialReference) {
    throw new Error("Selected layer has no spatial reference.");
  }
  if (!layer.geometryType || !(layer.geometryType in JS_API_GEOMETRY_TYPES)) {
    throw new Error("Selected layer must be a point, line, or polygon layer.");
  }
  return layer;
}
