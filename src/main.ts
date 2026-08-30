import "./style.css";

// No OAuth is configured: this app only ever touches public, anonymous
// ArcGIS Online content (see IMPLEMENTATION_PLAN.md D1).

// Individual imports for each Map component
import "@arcgis/map-components/components/arcgis-map";
import "@arcgis/map-components/components/arcgis-zoom";
import "@arcgis/map-components/components/arcgis-basemap-gallery";
import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-navigation-logo";
import "@esri/calcite-components/components/calcite-action";

import { App } from "./app/App.ts";
import { setupResponsivePanel } from "./app/responsivePanel.ts";
import { AboutDialog } from "./components/AboutDialog.ts";
import type { ArcgisMapElement, ArcgisBasemapGalleryElement } from "./arcgis/mapSetup.ts";

const panelContent = document.getElementById("panel-content");
if (!panelContent) throw new Error("#panel-content not found in index.html");

const mapEl = document.getElementById("game-map") as ArcgisMapElement | null;
if (!mapEl) throw new Error("#game-map not found in index.html");

const boardOverlay = document.getElementById("board-overlay");
if (!boardOverlay) throw new Error("#board-overlay not found in index.html");

const landingContent = document.getElementById("landing-page");
if (!landingContent) throw new Error("#landing-page not found in index.html");

const sidePanel = document.getElementById("side-panel");
if (!sidePanel) throw new Error("#side-panel not found in index.html");

const mapStage = document.getElementById("map-stage");
if (!mapStage) throw new Error("#map-stage not found in index.html");

const menuToggle = document.getElementById("menu-toggle");
if (!menuToggle) throw new Error("#menu-toggle not found in index.html");

const aboutToggle = document.getElementById("about-toggle");
if (!aboutToggle) throw new Error("#about-toggle not found in index.html");

const zoomWidget = document.getElementById("map-zoom-widget");
if (!zoomWidget) throw new Error("#map-zoom-widget not found in index.html");

const basemapGallery = document.getElementById("map-basemap-gallery") as ArcgisBasemapGalleryElement | null;
if (!basemapGallery) throw new Error("#map-basemap-gallery not found in index.html");

setupResponsivePanel(sidePanel, menuToggle);

aboutToggle.addEventListener("click", () => new AboutDialog().open());

new App({ panelContent, mapEl, boardOverlay, landingContent, sidePanel, mapStage, menuToggle, zoomWidget, basemapGallery });
