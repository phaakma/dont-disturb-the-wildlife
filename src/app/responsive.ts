export const MOBILE_BREAKPOINT = "(max-width: 700px)";

export function isMobile(): boolean {
  return window.matchMedia(MOBILE_BREAKPOINT).matches;
}
