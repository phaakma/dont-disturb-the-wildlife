# Working in this repo

## Environment

- Windows 11. The Bash tool here is Git Bash (POSIX sh), not WSL. Node.js
  itself is a **native Windows binary**, so anything you `node -e` or run as
  a script must use Windows-style paths (`C:\...`) or plain relative paths -
  a Git Bash absolute path like `/c/projects/arcgis-minesweeper/foo.png`
  passed to Node gets misinterpreted (resolved relative to the cwd's drive)
  and silently writes to `C:\c\projects\arcgis-minesweeper\foo.png` instead.
  No error is thrown, so check `ls` on the path you expect, not just for a
  clean exit code.
- `npm` scripts: `npm run dev` (Vite dev server), `npm run build` (`tsc &&
  vite build`), `npm run test` (`node --test src/game/**/*.test.ts` - only
  covers the pure game engine in `src/game/`).

## Verifying UI changes in a browser

There is no project-specific `run` skill yet and `chromium-cli` is **not**
installed in this environment. What does work:

- **Playwright is already available** - `playwright@1.62.1` is physically
  present in `node_modules/` (shows as `extraneous` in `npm ls` since it
  isn't in `package.json`/`package-lock.json`) with a Chromium binary
  already downloaded (`chromium.executablePath()` resolves and the file
  exists). No install step needed - just `import { chromium } from
  "playwright"` and drive it directly (same approach as the `run` skill's
  Electron fallback, minus the Electron-specific bits).
- **Write/run the driver script from inside the project directory**, not
  `/tmp` or the scratchpad - a bare `import "playwright"` only resolves via
  `node_modules`, so a script outside the repo throws `ERR_MODULE_NOT_FOUND`.
  A scratch subfolder inside the repo (removed again afterwards) works fine.
- **Dev server ports 5173/5174 are often already in use** (other sessions'
  servers). Start with `npm run dev -- --port 5173 --strictPort`, poll with
  `curl -sf` in a loop rather than sleeping. **`lsof` is not installed in
  this Git Bash environment** - `lsof -ti:5173 | xargs kill` silently does
  nothing (no error, port stays bound). Find and kill the real PID instead:
  `netstat -ano | grep ":5173.*LISTENING"` (last column is the PID), then
  `taskkill //F //PID <pid>` (double slashes so Git Bash doesn't mangle the
  flags into a path).
- **A long-running `npm run dev` background job can silently keep the port
  held even after you think you killed it** - if a later `vite preview` (or
  a fresh `dev`) fails with `Port 5173 is already in use`, or you get
  repeated `504 (Outdated Optimize Dep)` console errors that don't go away
  across restarts, suspect a stale server still bound to the port (check
  with `netstat` above) rather than a real app bug.
- Multiple `calcite-dialog` elements can exist in the DOM at once (e.g. the
  layer-picker dialog is created eagerly on app construction, before any
  other dialog is opened). Don't assume `document.querySelector("calcite-dialog")`
  is the one you just opened - filter by `heading` attribute or check the
  `open` attribute instead.
