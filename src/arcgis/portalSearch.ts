import Portal from "@arcgis/core/portal/Portal.js";
import PortalQueryParams from "@arcgis/core/portal/PortalQueryParams.js";
import PortalItem from "@arcgis/core/portal/PortalItem.js";
import { withTimeout } from "./requestTimeout.ts";

const SEARCH_TIMEOUT_MS = 15_000;

let portalPromise: Promise<Portal> | null = null;

function getPortal(): Promise<Portal> {
  portalPromise ??= (async () => {
    const portal = new Portal({ authMode: "anonymous" });
    await portal.load();
    return portal;
  })();
  return portalPromise;
}

export interface SearchPage {
  items: PortalItem[];
  total: number;
  nextStart: number | null;
}

export const SEARCH_PAGE_SIZE = 20;

/**
 * Anonymous search of public hosted feature services on ArcGIS Online.
 * `start` is 1-based per the REST API convention.
 */
export async function searchFeatureServices(
  query: string,
  start = 1,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], total: 0, nextStart: null };

  const portal = await getPortal();
  const params = new PortalQueryParams({
    query: `(${trimmed}) AND type:"Feature Service" AND access:public`,
    sortField: "num-views",
    sortOrder: "desc",
    num: SEARCH_PAGE_SIZE,
    start,
  });

  const result = await portal.queryItems(params, { signal: withTimeout(signal, SEARCH_TIMEOUT_MS) });
  const next = result.nextQueryParams?.start;
  return {
    items: result.results,
    total: result.total,
    nextStart: next && next > 0 ? next : null,
  };
}

/**
 * Reconstruct a PortalItem from just its id - used to restore a shared URL or
 * saved config, where only the id (not the full search-result item) is stored.
 */
export async function loadPortalItemById(itemId: string, signal?: AbortSignal): Promise<PortalItem> {
  const item = new PortalItem({ id: itemId });
  await item.load({ signal: withTimeout(signal, SEARCH_TIMEOUT_MS) });
  return item;
}
