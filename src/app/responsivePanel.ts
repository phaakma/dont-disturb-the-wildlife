interface CollapsibleShellPanel extends HTMLElement {
  displayMode: "dock" | "overlay" | "float" | "float-content" | "float-all";
  collapsed: boolean;
}

const MOBILE_BREAKPOINT = "(max-width: 700px)";

/**
 * Below the breakpoint, the side panel floats over the map (rather than
 * squeezing it) and starts collapsed so the map dominates the screen; the
 * hamburger toggles it open/closed. Above the breakpoint it's back to a
 * normal always-visible docked panel.
 */
export function setupResponsivePanel(sidePanel: HTMLElement, menuToggle: HTMLElement): void {
  const panel = sidePanel as CollapsibleShellPanel;
  const mq = window.matchMedia(MOBILE_BREAKPOINT);

  const apply = () => {
    const mobile = mq.matches;
    panel.displayMode = mobile ? "overlay" : "dock";
    panel.collapsed = mobile;
  };

  apply();
  mq.addEventListener("change", apply);
  menuToggle.addEventListener("click", () => {
    panel.collapsed = !panel.collapsed;
  });
}
