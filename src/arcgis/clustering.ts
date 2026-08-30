import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";
import type Point from "@arcgis/core/geometry/Point.js";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView.js";

const FIRST_UPDATE_TIMEOUT_MS = 500;

/**
 * Configure clustering at the given screen-pixel radius and return the
 * resulting cluster centroids, waiting for the layer view to fully settle
 * first. Querying while `updating === true` returns partial or stale
 * clusters, so this must be awaited on every call
 * (IMPLEMENTATION_PLAN.md section 3.5).
 */
export async function queryClusterCentroids(layerView: FeatureLayerView, radiusPx: number): Promise<Point[]> {
  layerView.layer.featureReduction = { type: "cluster", clusterRadius: `${radiusPx}px` };

  // Guard against a synchronous redraw where `updating` never flips to
  // true in the first place.
  await Promise.race([
    reactiveUtils.whenOnce(() => layerView.updating),
    new Promise<void>((resolve) => setTimeout(resolve, FIRST_UPDATE_TIMEOUT_MS)),
  ]);
  await reactiveUtils.whenOnce(() => !layerView.updating);

  const { features } = await layerView.queryAggregates();
  return features.map((f) => f.geometry as Point);
}

export function clearClustering(layerView: FeatureLayerView): void {
  layerView.layer.featureReduction = null;
}
