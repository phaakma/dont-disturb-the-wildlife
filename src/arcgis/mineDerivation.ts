import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView.js";
import type Extent from "@arcgis/core/geometry/Extent.js";
import { queryClusterCentroids, clearClustering } from "./clustering.ts";
import { centroidsToMineCells } from "./gridGeometry.ts";

export const MIN_RADIUS_PX = 20;
export const MAX_RADIUS_PX = 240;
const TARGET_DENSITY = 0.15;
const BAND_MIN = 0.05;
const BAND_MAX = 0.5;
const MAX_ITERATIONS = 8;

export interface AutoTuneIteration {
  radiusPx: number;
  clusterCount: number;
  mineCount: number;
  density: number;
}

export interface AutoTuneSuccess {
  ok: true;
  radiusPx: number;
  mineCells: Set<number>;
  mineCount: number;
  clusterCount: number;
  iterations: AutoTuneIteration[];
}

export interface AutoTuneFailure {
  ok: false;
  reason: "too-few" | "too-many";
  message: string;
  iterations: AutoTuneIteration[];
}

export type AutoTuneResult = AutoTuneSuccess | AutoTuneFailure;

interface ProbeResult {
  iteration: AutoTuneIteration;
  mineCells: Set<number>;
}

function distanceToBand(density: number): number {
  if (density < BAND_MIN) return BAND_MIN - density;
  if (density > BAND_MAX) return density - BAND_MAX;
  return 0;
}

function isCloser(a: ProbeResult, b: ProbeResult): boolean {
  const da = distanceToBand(a.iteration.density);
  const db = distanceToBand(b.iteration.density);
  if (da !== db) return da < db;
  return Math.abs(a.iteration.density - TARGET_DENSITY) < Math.abs(b.iteration.density - TARGET_DENSITY);
}

/**
 * Binary-search `clusterRadius` (in screen px) for a radius that lands the
 * mine density inside the accepted band. Mine density is measured in
 * distinct grid cells hit, not raw cluster count - several cluster
 * centroids can land in the same cell (IMPLEMENTATION_PLAN.md section 3.5).
 *
 * Only fails when the endpoints of the radius range prove the band is
 * unreachable (too little or too much data); otherwise always returns the
 * best-seen result even if no probed radius landed exactly inside the band -
 * cluster-count-vs-radius is not guaranteed strictly monotonic near cell
 * boundaries, so binary search alone cannot be trusted to find an exact hit.
 */
/**
 * Wraps runAutoTune() to guarantee the layer's featureReduction (mutated by
 * every queryClusterCentroids() probe) never leaks past this call - without
 * this, the last-probed cluster visualization stays live on the map straight
 * into gameplay (visible now that hidden board cells are transparent).
 */
export async function autoTuneMineDensity(
  layerView: FeatureLayerView,
  gridExtent: Extent,
  rows: number,
  cols: number,
): Promise<AutoTuneResult> {
  try {
    return await runAutoTune(layerView, gridExtent, rows, cols);
  } finally {
    clearClustering(layerView);
  }
}

async function runAutoTune(
  layerView: FeatureLayerView,
  gridExtent: Extent,
  rows: number,
  cols: number,
): Promise<AutoTuneResult> {
  const totalCells = rows * cols;
  const iterations: AutoTuneIteration[] = [];

  const probe = async (radiusPx: number): Promise<ProbeResult> => {
    const centroids = await queryClusterCentroids(layerView, radiusPx);
    const mineCells = await centroidsToMineCells(centroids, gridExtent, rows, cols);
    const iteration: AutoTuneIteration = {
      radiusPx,
      clusterCount: centroids.length,
      mineCount: mineCells.size,
      density: mineCells.size / totalCells,
    };
    iterations.push(iteration);
    console.log(
      `[auto-tune] radius=${radiusPx}px clusters=${iteration.clusterCount} mines=${iteration.mineCount} density=${(iteration.density * 100).toFixed(1)}%`,
    );
    return { iteration, mineCells };
  };

  const succeed = (result: ProbeResult): AutoTuneSuccess => ({
    ok: true,
    radiusPx: result.iteration.radiusPx,
    mineCells: result.mineCells,
    mineCount: result.iteration.mineCount,
    clusterCount: result.iteration.clusterCount,
    iterations,
  });

  // Probe the endpoints first: if even the smallest radius (most clusters)
  // can't reach the band's floor, or the largest radius (fewest clusters)
  // is still above its ceiling, no radius in between can help either.
  const lowEnd = await probe(MIN_RADIUS_PX);
  if (lowEnd.iteration.density < BAND_MIN) {
    return {
      ok: false,
      reason: "too-few",
      message: `Not enough data here for a ${rows}x${cols} board. Zoom out, move to a denser area, choose a smaller grid, or loosen your filter.`,
      iterations,
    };
  }
  if (distanceToBand(lowEnd.iteration.density) === 0) return succeed(lowEnd);

  const highEnd = await probe(MAX_RADIUS_PX);
  if (highEnd.iteration.density > BAND_MAX) {
    return {
      ok: false,
      reason: "too-many",
      message: `Too much data here. Zoom in or choose a larger grid.`,
      iterations,
    };
  }
  if (distanceToBand(highEnd.iteration.density) === 0) return succeed(highEnd);

  let best = isCloser(lowEnd, highEnd) ? lowEnd : highEnd;
  let lo = MIN_RADIUS_PX;
  let hi = MAX_RADIUS_PX;

  for (let i = 0; i < MAX_ITERATIONS - 2 && hi - lo > 1; i++) {
    const mid = Math.round((lo + hi) / 2);
    const result = await probe(mid);
    if (isCloser(result, best)) best = result;
    if (distanceToBand(result.iteration.density) === 0) return succeed(result);

    // Larger radius -> fewer, larger clusters -> generally fewer distinct
    // mine cells. If we're still too dense, we need a bigger radius.
    if (result.iteration.density > BAND_MAX) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return succeed(best);
}
