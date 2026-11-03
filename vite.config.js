import { defineConfig } from 'vite';

// Static game: Vite bundles three.js from node_modules and copies public/ (the OSM map data) as-is.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1500, sourcemap: false },
});
