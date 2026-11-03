// Browser smoke test (e2e/): the built game in headless Chromium. `npm run build` first; CI does both.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 300000, // software WebGL on CI runners is slow: a run takes 2-3 minutes
  use: { baseURL: 'http://localhost:4173', viewport: { width: 640, height: 400 }, launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 60000 },
});
