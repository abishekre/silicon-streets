import { defineConfig } from 'vite';

// Static game: Vite bundles three.js from node_modules and copies public/ (the OSM map data) as-is.
// three.js gets its own chunk, so after a game update returning players only download the (small) game code again.
// Physics (Rapier, about 2 MB with its wasm inlined) is already its own chunk, loaded after the game starts.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 2200,
    rollupOptions: { output: { manualChunks: (id) => (/node_modules[\/]three[\/]/.test(id) ? 'three' : undefined) } },
  },
  // the map worker (src/world-worker.js) is an ES module that loads its pieces with import()
  worker: { format: 'es' },
});
