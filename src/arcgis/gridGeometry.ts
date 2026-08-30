import Extent from "@arcgis/core/geometry/Extent.js";
import Point from "@arcgis/core/geometry/Point.js";
import type SpatialReference from "@arcgis/core/geometry/SpatialReference.js";
import type MapView from "@arcgis/core/views/MapView.js";
import * as projectOperator from "@arcgis/core/geometry/operators/projectOperator.js";

/**
 * Largest centred square inside `extent`. With the map element forced to a
 * fixed CSS square (D2), `extent` should already be square; this is a
 * defensive fallback for residual aspect-ratio drift.
 */
export function computeSquareSubExtent(extent: Extent): Extent {
  const side = Math.min(extent.width, extent.height);
  const cx = (extent.xmin + extent.xmax) / 2;
  const cy = (extent.ymin + extent.ymax) / 2;
  return new Extent({
    xmin: cx - side / 2,
    xmax: cx + side / 2,
    ymin: cy - side / 2,
    ymax: cy + side / 2,
    spatialReference: extent.spatialReference,
  });
}

export interface Cell {
  row: number;
  col: number;
}

/** Row 0 is the top row, matching screen order. Returns null if outside the grid. */
export function pointToCell(point: Point, gridExtent: Extent, rows: number, cols: number): Cell | null {
  const cw = gridExtent.width / cols;
  const ch = gridExtent.height / rows;
  const col = Math.floor((point.x - gridExtent.xmin) / cw);
  const row = Math.floor((gridExtent.ymax - point.y) / ch);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col };
}

/** Projects `points` into `targetSR` if any aren't already in it. */
async function projectToSR(points: Point[], targetSR: SpatialReference): Promise<Point[]> {
  const needsProjection = points.some((p) => !p.spatialReference.equals(targetSR));
  if (!needsProjection) return points;
  await projectOperator.load();
  return points
    .map((p) => projectOperator.execute(p, targetSR))
    .filter((p): p is Point => p != null && p.type === "point");
}

/**
 * Project cluster centroids into the grid's spatial reference if needed,
 * then map each to a grid cell and return the set of distinct cell indices
 * (row * cols + col) that contain at least one centroid. Several cluster
 * centroids can share one cell, so mine count is the number of distinct
 * cells hit, not the number of clusters.
 */
export async function centroidsToMineCells(
  centroids: Point[],
  gridExtent: Extent,
  rows: number,
  cols: number,
): Promise<Set<number>> {
  const points = await projectToSR(centroids, gridExtent.spatialReference);

  const mineCells = new Set<number>();
  for (const point of points) {
    const cell = pointToCell(point, gridExtent, rows, cols);
    if (cell) mineCells.add(cell.row * cols + cell.col);
  }
  return mineCells;
}

/**
 * Cluster centroids (queried unconstrained, since `queryAggregates` does not
 * support a geometry filter) that fall within `extent`, after projecting
 * into its spatial reference if needed.
 */
export async function filterPointsInExtent(centroids: Point[], extent: Extent): Promise<Point[]> {
  const points = await projectToSR(centroids, extent.spatialReference);
  return points.filter(
    (p) => p.x >= extent.xmin && p.x <= extent.xmax && p.y >= extent.ymin && p.y <= extent.ymax,
  );
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Pixel rectangle of `gridExtent` within the view's container, for sizing the HTML overlay grid. */
export function computeScreenRect(view: MapView, gridExtent: Extent): ScreenRect | null {
  const topLeft = view.toScreen(
    new Point({ x: gridExtent.xmin, y: gridExtent.ymax, spatialReference: gridExtent.spatialReference }),
  );
  const bottomRight = view.toScreen(
    new Point({ x: gridExtent.xmax, y: gridExtent.ymin, spatialReference: gridExtent.spatialReference }),
  );
  if (!topLeft || !bottomRight) return null;

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}
