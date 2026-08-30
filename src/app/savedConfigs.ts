import { EMPTY_FILTER, isFilterSpec, type FilterSpec } from "./filterExpression.ts";
import { DEFAULT_THEME_ID, isValidThemeId } from "../game/themes.ts";
import { DEFAULT_BASEMAP_ID, isValidBasemapId } from "../arcgis/mapSetup.ts";

export interface SavedConfig {
  id: string;
  name: string;
  itemId: string;
  layerId: number;
  center: [number, number];
  zoom: number;
  filter: FilterSpec;
  themeId: string;
  basemapId: string;
  savedAt: string;
}

const STORAGE_KEY = "wildlife-game:saved-configs";

export function listSavedConfigs(): SavedConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Configs saved before the filter/theme/basemap features existed are
    // missing those fields entirely - backfill here rather than at every
    // read site.
    return (parsed as SavedConfig[]).map((c) => ({
      ...c,
      filter: isFilterSpec(c.filter) ? c.filter : EMPTY_FILTER,
      themeId: isValidThemeId(c.themeId) ? c.themeId : DEFAULT_THEME_ID,
      basemapId: isValidBasemapId(c.basemapId) ? c.basemapId : DEFAULT_BASEMAP_ID,
    }));
  } catch {
    return [];
  }
}

function uniqueName(base: string, existing: SavedConfig[], excludeId?: string): string {
  const taken = new Set(existing.filter((c) => c.id !== excludeId).map((c) => c.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} (${n})`.toLowerCase())) n++;
  return `${base} (${n})`;
}

export function saveConfig(entry: Omit<SavedConfig, "id" | "savedAt">): SavedConfig {
  const all = listSavedConfigs();
  const config: SavedConfig = {
    ...entry,
    name: uniqueName(entry.name, all),
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
  };
  try {
    all.push(config);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // localStorage unavailable (e.g. private browsing) - the save silently
    // doesn't persist, but the caller still gets the config back for display.
  }
  return config;
}

export function deleteConfig(id: string): void {
  try {
    const all = listSavedConfigs().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function renameConfig(id: string, name: string): SavedConfig | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const all = listSavedConfigs();
  const target = all.find((c) => c.id === id);
  if (!target) return null;
  target.name = uniqueName(trimmed, all, id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
  return target;
}
