import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  // Served from https://phaakma.github.io/dont-disturb-the-wildlife/ (a
  // GitHub Pages project site, not a custom domain), so asset URLs must be
  // rooted under the repo name rather than "/".
  base: "/dont-disturb-the-wildlife/",
  plugins: [],
  server: {
    open: true,
  },
  build: {
    outDir: "dist",
  },
});
