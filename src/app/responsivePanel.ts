import { MOBILE_BREAKPOINT } from "./responsive.ts";

interface CollapsibleShellPanel extends HTMLElement {
  displayMode: "dock" | "overlay" | "float" | "float-content" | "float-all";
  collapsed: boolean;
}

/**
 * Below the breakpoint, the side panel docks above the map (`panel-top`)
 * instead of beside it (`panel-start`) - calcite-shell renders panel-top /
 * default / panel-bottom as a single flex column, so this is what makes the
 * controls always visible above the map on mobile instead of hidden behind
 * a hamburger-triggered overlay. Above the breakpoint it's back to a normal
 * always-visible docked side panel.
 */
export function setupResponsivePanel(sidePanel: HTMLElement): void {
  const panel = sidePanel as CollapsibleShellPanel;
  const mq = window.matchMedia(MOBILE_BREAKPOINT);

  const apply = () => {
    panel.slot = mq.matches ? "panel-top" : "panel-start";
    panel.displayMode = "dock";
    panel.collapsed = false;
  };

  apply();
  mq.addEventListener("change", apply);
}
