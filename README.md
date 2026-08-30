# Don't Disturb the Wildlife!

Minesweeper, but the "mines" are wildlife hiding in real-world data. Pick any
public point layer, frame an area on the map, and the app clusters nearby
points into hiding spots using the map SDK's clustering renderer — each
cluster becomes a spot where wildlife is hiding, tucked under the grid.

Pick your favourite animal theme (kiwi is the default) before you start —
it's what's hiding under the grid, and it's what you'll wake up if you're not
careful.

## How it works

1. **Choose your theme** — pick which animal is hiding under the grid: kiwi
   (the default), bear, snake, crocodile, panther, lion, giraffe, turtle,
   elephant, or owl.
2. **Choose a point layer** — search public hosted feature services
   (anonymously, no sign-in) and pick a point layer. A service can contain
   line/polygon layers too, so if there's more than one point layer you'll be
   asked which one to use.
3. **Frame your board** — pan and zoom to the area you want to play. The
   data stays completely hidden while you frame; only a live feature count
   is shown. Pick a difficulty (Beginner 9×9, Intermediate 16×16, Expert
   22×22, or a custom size).
4. **Start game** — the app auto-tunes the clustering radius until the
   number of hiding spots lands in a playable range for your grid size, then
   locks the view in place (hiding spots are pixel-positioned, so the map
   can't move again once the board is set).
5. **Play** — left click to check a cell, right click (or long-press on
   touch) to mark a cell you suspect hides wildlife. Checked cells become
   transparent so the basemap shows through underneath.
6. **Win or lose** — the real clustered points are revealed on the map, and
   a themed summary shows your time, how much wildlife you found, grid size,
   and the layer you played.

There is no first-click safety: wildlife is exactly where the data puts it,
so the very first click can end the game.

## Run it

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check and build for production
npm run test      # run the game-engine unit tests (node --test)
```

## Architecture

```
src/
  main.ts           entry point
  style.css         layout (fixed square map, HTML overlay grid)
  app/              AppState machine + App orchestrator
  arcgis/           all map SDK integration (map setup, portal search,
                     layer discovery, clustering, grid/screen geometry,
                     wildlife-location auto-tuning)
  game/             pure game engine (board, reveal, flood fill, flags,
                     win/lose) plus the theme/message registry - no map SDK
                     imports, unit-testable in isolation
  components/       UI panels and dialogs
public/
  animals/          per-theme SVG icons shown for a found cell and in the
                     theme picker - replace any file here to swap the art
```

The map element is a fixed CSS square so the grid maps 1:1 onto the view
extent. Clustering is computed with `FeatureLayerView.queryAggregates()`
against a layer kept on the map at `opacity: 0` (not `visible: false`,
which would tear down the layer view). See `IMPLEMENTATION_PLAN.md` for the
full design rationale and constraints.

## Attribution

This game is built using Esri's ArcGIS Maps SDK for JavaScript, with
real-world location data from public ArcGIS Online feature layers. It's an
independent fan-made game, not an official Esri product - see the **About**
button in the app header for the same note in-app.

## Scope

Anonymous public content only — no API keys, no OAuth, no `.env`.
Multiplayer, saved games, leaderboards, 3D/SceneView, non-point layers, and
private/secured content are all out of scope.
