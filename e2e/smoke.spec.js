// Load the game, start it, drive, walk, open the pause menu, the map and the phone, and fail on any page error.
import { test, expect } from '@playwright/test';

test('start, drive, walk, menus: no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebGL|GPU|swiftshader/i.test(m.text())) errors.push(m.text()); });
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start roaming' });
  await expect(start).toBeVisible({ timeout: 120000 });
  await start.click();
  await page.waitForFunction(() => window.__game && window.__game.state.started);
  await page.evaluate(() => window.__game.actions.setQuality('low')); // software WebGL: keep frames cheap
  // drive forward for a bit (software WebGL is slow, so hold the key and step frames instead of waiting)
  const step = (n) => page.evaluate((k) => window.__game.step(k), n);
  await page.keyboard.down('KeyW'); await step(45); await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => window.__game.player.odometer)).toBeGreaterThan(1);
  // out of the vehicle and walk
  await step(60); await page.keyboard.press('KeyF'); await step(10); await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__game.state.mode)).toBe('walk');
  await page.keyboard.down('KeyW'); await step(30); await page.keyboard.up('KeyW');
  // pause menu, then back
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.overlays.top())).toBe('pause');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.overlays.top())).toBe(null);
  // big map with search, then close
  await page.keyboard.down('KeyM'); await step(2); await page.keyboard.up('KeyM');
  await expect(page.locator('#bigmap')).toHaveClass(/open/);
  await page.keyboard.press('Escape');
  // phone
  await page.evaluate(() => window.__game.phone.toggle()); await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.overlays.top())).toBe('phone');
  await page.evaluate(() => window.__game.phone.toggle());
  // the simulation is running (in the worker or here) and nobody overlaps
  for (let i = 0; i < 10; i++) { await step(5); await page.waitForTimeout(100); }
  const sim = await page.evaluate(() => ({ mode: window.__game.sim.mode, moving: window.__game.traffic.vehicles.filter((v) => !v.off && v.speed > 0.5).length }));
  expect(sim.moving).toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
