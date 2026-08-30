import { DEFAULT_THEME_ID, isValidThemeId } from "../game/themes.ts";

const STORAGE_KEY = "wildlife-game:theme";

export function getCurrentTheme(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isValidThemeId(stored) ? stored! : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function setCurrentTheme(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage unavailable (e.g. private browsing) - selection just won't persist.
  }
}
