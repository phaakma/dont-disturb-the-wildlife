import { decodeFilterParam, encodeFilterParam, type FilterSpec } from "./filterExpression.ts";
import { DEFAULT_THEME_ID, isValidThemeId } from "../game/themes.ts";

export interface ShareParams {
  itemId: string;
  layerId: number;
  center: [number, number];
  zoom: number;
  filter: FilterSpec;
  themeId: string;
}

export function buildShareUrl(params: ShareParams): string {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("itemId", params.itemId);
  url.searchParams.set("layerId", String(params.layerId));
  url.searchParams.set("lon", String(params.center[0]));
  url.searchParams.set("lat", String(params.center[1]));
  url.searchParams.set("zoom", String(params.zoom));
  url.searchParams.set("theme", params.themeId);
  const encodedFilter = encodeFilterParam(params.filter);
  if (encodedFilter) url.searchParams.set("filter", encodedFilter);
  return url.toString();
}

export function parseShareParams(search: string): ShareParams | null {
  const params = new URLSearchParams(search);
  const itemId = params.get("itemId");
  const layerId = Number(params.get("layerId"));
  const lon = Number(params.get("lon"));
  const lat = Number(params.get("lat"));
  const zoom = Number(params.get("zoom"));

  if (!itemId) return null;
  if (!Number.isFinite(layerId)) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(zoom)) return null;

  const theme = params.get("theme");
  return {
    itemId,
    layerId,
    center: [lon, lat],
    zoom,
    filter: decodeFilterParam(params.get("filter")),
    themeId: isValidThemeId(theme) ? theme! : DEFAULT_THEME_ID,
  };
}
