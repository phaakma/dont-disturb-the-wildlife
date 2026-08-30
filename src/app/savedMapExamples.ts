/**
 * Hard-coded example layers so a first-time player can start playing
 * immediately from the landing page without having to search ArcGIS Online
 * for a layer themselves. Each entry's center/zoom is hand-picked rather than
 * the layer's full extent, which is often either too broad (e.g. covering an
 * entire country, flooding the board with clusters everywhere) or too narrow.
 */
import type { FilterSpec } from "./filterExpression.ts";

export interface SavedMapExample {
  id: string;
  itemId: string;
  layerId: number;
  title: string;
  teaser: string;
  snippet: string;
  center: [number, number];
  zoom: number;
  /** Applied as the layer's definitionExpression when the example is played. Defaults to no filter. */
  filter?: FilterSpec;
  /** Wildlife theme applied when this example is played (see src/game/themes.ts). */
  themeId: string;
}

export const SAVED_MAP_EXAMPLES: SavedMapExample[] = [
  {
    id: "qeii-waikato",
    // Verified via the public REST API to be a single-layer polygon feature
    // service (layerId 0).
    itemId: "96b41926084c445d9d8190c976df3aaf",
    layerId: 0,
    title: "QEII National Trust",
    teaser: "Avoid the wildlife hidden across private conservation covenants in New Zealand's Waikato region.",
    snippet:
      "QEII National Trust Protected Areas is a current inventory of registered and formalised QEII covenants within Aotearoa New Zealand. These covenants protect more than 180,000 ha of private land and play a hugely critical role as a refuge for some of New Zealand’s rarest and most endangered biodiversity and ecosystems.\n\nIn general, QEII National Trust protected areas are over private land with no public access.",
    center: [175.45, -37.85],
    zoom: 9,
    themeId: "kiwi",
  },
  {
    id: "critical-habitat-hawaii",
    // USFWS Critical Habitat for Threatened and Endangered Species - layer 0
    // ("Final Critical Habitat Features", polygon) confirmed via the public
    // REST API.
    itemId: "9d0965dae6a64f38b1af80c2f7ea2efe",
    layerId: 0,
    title: "Critical Habitat - Hawai'i",
    teaser: "Avoid disturbing the critical habitat of threatened and endangered species across Hawai'i's Big Island.",
    snippet:
      "Critical Habitat for Threatened and Endangered Species is a U.S. Fish and Wildlife Service (FWS) feature layer displaying proposed and designated critical habitat under the U.S. Endangered Species Act.\n\nThis board is framed over the Big Island of Hawai'i.",
    center: [-155.5, 19.6],
    zoom: 9,
    themeId: "turtle",
  },
  {
    id: "burrowing-owl-utah",
    // Utah Species of Greatest Conservation Need - single polygon layer
    // (layerId 0). Field confirmed via the public REST API: SCOMNAME holds
    // the common name, and "Burrowing Owl" is an exact match present in the
    // data (verified with a live query).
    itemId: "2d3b77d2b46e42509605c05b81fd3a00",
    layerId: 0,
    title: "Burrowing Owl - Utah",
    teaser: "Avoid disturbing Burrowing Owl habitat sightings recorded across Utah.",
    snippet:
      "Utah's federally and state listed threatened, endangered, and sensitive animal and plant species occurrences, as compiled by the Utah Natural Heritage Program (UNHP) of the Utah Division of Wildlife Resources.\n\nThis board is filtered to Burrowing Owl occurrences and framed around Utah.",
    // Centered on southwest Utah's desert basins, where most Burrowing Owl
    // occurrences are recorded (verified via a live feature-count query and
    // by tuning against the in-game cluster count) - the state's geographic
    // centroid itself has none nearby.
    center: [-113, 38.25],
    zoom: 9,
    filter: {
      combinator: "AND",
      clauses: [{ field: "SCOMNAME", fieldType: "string", operator: "eq", value: "Burrowing Owl" }],
    },
    themeId: "owl",
  },
];
