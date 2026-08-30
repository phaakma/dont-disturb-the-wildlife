import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-list";
import "@esri/calcite-components/components/calcite-list-item";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-input";

import type { SavedConfig } from "../app/savedConfigs.ts";
import { THEMES } from "../game/themes.ts";
import { SAVED_MAP_EXAMPLES, type SavedMapExample } from "../app/savedMapExamples.ts";

export interface LandingPageOptions {
  savedConfigs: SavedConfig[];
  selectedThemeId: string;
  onSelectTheme: (themeId: string) => void;
  onChooseLayer: () => void;
  onTryExample: (example: SavedMapExample) => void;
  onLoadSaved: (config: SavedConfig) => void;
  onDeleteSaved: (id: string) => void;
  onRenameSaved: (id: string, name: string) => void;
  onCopyUrl: (config: SavedConfig) => void;
}

// Which saved row (if any) is showing its inline rename input. Module-level
// because renderLandingPage is a plain function re-invoked fresh on every
// landing-page render, not a persistent component instance.
let editingConfigId: string | null = null;

export function renderLandingPage(container: HTMLElement, options: LandingPageOptions): void {
  container.innerHTML = `
    <div class="landing">
      <section class="landing-hero">
        <h1>Don't Disturb the Wildlife!</h1>
        <p class="tagline">Clear the game board, but avoid disturbing the wildlife.</p>
        <p class="pitch">
          Like the classic minesweeper game, but here you're avoiding disturbing
          the wildlife. The wildlife locations come directly from any public
          ArcGIS Online data layer of <strong>your choice</strong> - a city's tree
          inventory, a country's protected areas, any public layer. 
          </p>
          <p class="pitch">
          Set up and share a link to your own custom game board. If your 
          organisation hosts a public layer, you can use this game to gain
          exposure and interest.
          If the data changes, the game board changes the next time you load it.
        </p>
      </section>

      <section class="landing-section">
        <h2>How to play</h2>
        <p class="section-intro">
          Search and pick a public layer from ArcGIS Online and zoom to an area on the map. 
          Features are clustered together and each cluster becomes a spot where 
          wildlife is hiding, not to be disturbed. For polygons and polylines the centroid
          of each feature is used.
        </p>
        <ul class="howto-list">
          <li>Left click a game square to uncover it.</li>
          <li>Right click (or long-press) to mark a game square that you suspect hides wildlife.</li>
          <li>Clear every safe game square to win - don't disturb the wildlife!</li>
        </ul>
      </section>

      <section class="landing-section">
        <h2>Try these example maps now</h2>
        <p class="section-intro">No setup needed - jump straight into a ready-made board.</p>
        <div class="example-grid">${renderExampleCards()}</div>
      </section>

      <section class="landing-section">
        <h2>Create your own game</h2>
        <p class="section-intro">
          Choose a wildlife theme, then search and select any public feature
          layer from ArcGIS Online to build your own board.
        </p>
        <div id="theme-grid" class="theme-grid">${renderThemeChoices(options.selectedThemeId)}</div>
        <calcite-button id="choose-layer-btn" width="full">Choose a layer</calcite-button>
      </section>

      <section class="landing-section">
        <h2>Load a saved map</h2>
        <p class="section-intro">Boards you've saved from a previous visit, kept on this device.</p>
        ${
          options.savedConfigs.length
            ? `<calcite-list id="saved-list">${options.savedConfigs.map((c) => (c.id === editingConfigId ? renderEditingRow(c) : renderRow(c))).join("")}</calcite-list>`
            : `<p class="empty-state">You haven't saved any maps yet - use "Save" once you've framed a board to keep it here.</p>`
        }
      </section>
    </div>
  `;

  container.querySelector("#choose-layer-btn")?.addEventListener("click", options.onChooseLayer);

  container.querySelectorAll<HTMLElement>(".theme-choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      const themeId = btn.getAttribute("data-theme-id");
      if (themeId) options.onSelectTheme(themeId);
    });
  });

  container.querySelectorAll<HTMLElement>("[data-example-id]").forEach((card) => {
    const example = SAVED_MAP_EXAMPLES.find((e) => e.id === card.getAttribute("data-example-id"));
    if (!example) return;
    card.querySelector("[data-action='try-now']")?.addEventListener("click", () => options.onTryExample(example));
  });

  const rerender = () => renderLandingPage(container, options);

  options.savedConfigs.forEach((config) => {
    const row = container.querySelector<HTMLElement>(`[data-config-id="${config.id}"]`);
    if (!row) return;

    if (config.id === editingConfigId) {
      const input = row.querySelector<HTMLInputElement & { value: string }>("calcite-input");
      const confirmRename = () => {
        const value = input?.value.trim();
        editingConfigId = null;
        if (value) options.onRenameSaved(config.id, value);
        else rerender();
      };
      row.querySelector("[data-action='confirm-rename']")?.addEventListener("click", (e) => {
        e.stopPropagation();
        confirmRename();
      });
      input?.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") confirmRename();
      });
      row.querySelector("[data-action='cancel-rename']")?.addEventListener("click", (e) => {
        e.stopPropagation();
        editingConfigId = null;
        rerender();
      });
      return;
    }

    row.addEventListener("calciteListItemSelect", () => options.onLoadSaved(config));

    row.querySelector("[data-action='rename']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      editingConfigId = config.id;
      rerender();
    });

    row.querySelector("[data-action='copy']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      options.onCopyUrl(config);
      const action = e.currentTarget as HTMLElement;
      action.setAttribute("icon", "check");
      action.setAttribute("text", "Copied!");
      action.setAttribute("title", "Copied!");
      setTimeout(() => {
        action.setAttribute("icon", "link");
        action.setAttribute("text", "Copy URL");
        action.setAttribute("title", "Copy URL");
      }, 1500);
    });

    row.querySelector("[data-action='delete']")?.addEventListener("click", (e) => {
      e.stopPropagation();
      options.onDeleteSaved(config.id);
    });
  });
}

function renderExampleCards(): string {
  return SAVED_MAP_EXAMPLES.map(
    (example) => `
      <div class="example-card" data-example-id="${example.id}">
        <h3>${escapeHtml(example.title)}</h3>
        <p>${escapeHtml(example.teaser)}</p>
        <calcite-button data-action="try-now" width="full">Try now</calcite-button>
      </div>`,
  ).join("");
}

function renderThemeChoices(selectedThemeId: string): string {
  return THEMES.map(
    (theme) => `
      <button
        type="button"
        class="theme-choice ${theme.id === selectedThemeId ? "selected" : ""}"
        data-theme-id="${theme.id}"
        title="${escapeHtml(theme.label)}"
      >
        <img src="${theme.icon}" alt="" />
        <span>${escapeHtml(theme.label)}</span>
      </button>`,
  ).join("");
}

function renderRow(config: SavedConfig): string {
  return `
    <calcite-list-item
      data-config-id="${config.id}"
      label="${escapeHtml(config.name)}"
      description="Saved ${new Date(config.savedAt).toLocaleDateString()}"
    >
      <calcite-action slot="actions-end" data-action="rename" icon="pencil" text="Rename" title="Rename"></calcite-action>
      <calcite-action slot="actions-end" data-action="copy" icon="link" text="Copy URL" title="Copy URL"></calcite-action>
      <calcite-action slot="actions-end" data-action="delete" icon="trash" text="Delete" title="Delete"></calcite-action>
    </calcite-list-item>`;
}

function renderEditingRow(config: SavedConfig): string {
  return `
    <calcite-list-item data-config-id="${config.id}">
      <div slot="content" style="display:flex; align-items:center; width:100%; padding:0.25rem 0;">
        <calcite-input value="${escapeHtml(config.name)}" style="width:100%;"></calcite-input>
      </div>
      <calcite-action slot="actions-end" data-action="confirm-rename" icon="check" text="Confirm" title="Confirm"></calcite-action>
      <calcite-action slot="actions-end" data-action="cancel-rename" icon="x" text="Cancel" title="Cancel"></calcite-action>
    </calcite-list-item>`;
}

function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
