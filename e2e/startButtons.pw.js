// The start screen, clicked the way a person clicks it. The world-start suite (worldStart.pw.js) calls
// game.generateNewWorld() directly, so it could not notice buttons that do nothing; these tests only use real clicks.
// They run before every push and every Cloudflare deploy (scripts/preflight.mjs).
//
//   1. Every start button answers: it opens its window, or starts its world.
//   2. Generate New World -> Create World builds a playable world, at a short laptop-sized window too
//      (the Create button sits below the fold there and must still be reachable).
//   3. A browser without WebGL gets a message on the start screen, never silently dead buttons.
import { test, expect } from '@playwright/test';

const SMALL_SCREEN = { width: 1266, height: 545 };

/** Open the game and wait until the start screen's buttons are live. */
async function openGame(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  return errors;
}

/** Close whatever window is open, so the next button starts from the plain start screen. */
async function backToStartScreen(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.game-modal').forEach((m) => m.classList.add('hidden'));
    document.getElementById('start-overlay').style.display = 'flex';
  });
}

test.describe('with WebGL', () => {

  test('every start button answers a click', async ({ page }) => {
    test.setTimeout(300000);
    const errors = await openGame(page);
    for (const [button, window] of [
      ['#btn-start-new-world', '#world-biome-modal'],
      ['#btn-start-designed-world', '#designed-worlds-modal'],
      ['#btn-start-load-world', '#map-modal'],
      ['#btn-start-inspector', '#inspector-picker-modal'],
      ['#btn-start-packs', '#packs-skins-modal'],
    ]) {
      await page.click(button);
      await expect(page.locator(window), `${button} opens ${window}`).toBeVisible({ timeout: 20000 });
      await backToStartScreen(page);
    }
    await expect(page.locator('#start-movies')).toHaveAttribute('href', /movies\.html$/);
    expect(errors, 'no uncaught errors on the start screen').toEqual([]);
  });

  test('Host World & Share builds a world, then shows its sharing window', async ({ page }) => {
    test.setTimeout(300000);
    const errors = await openGame(page);
    await page.click('#btn-start-host-world');
    // With no share server (local runs) the window still opens, showing why sharing could not start.
    await expect(page.locator('#host-world-modal')).toBeVisible({ timeout: 180000 });
    expect(await page.evaluate(() => window.game.worldGenerated), 'a world was built to share').toBe(true);
    expect(errors).toEqual([]);
  });

  test('Building Studio opens from its button', async ({ page }) => {
    test.setTimeout(300000);
    const errors = await openGame(page);
    await page.click('#btn-start-building-studio');
    await page.waitForFunction(() => window.game.worldReady, null, { timeout: 120000 });
    await expect(page.locator('#start-overlay')).toBeHidden();
    expect(errors).toEqual([]);
  });

  for (const [name, viewport] of [['a desktop window', { width: 1280, height: 800 }], ['a short laptop window', SMALL_SCREEN]]) {
    test(`Generate New World, then Create World, builds a world in ${name}`, async ({ page }) => {
      test.setTimeout(300000);
      await page.setViewportSize(viewport);
      const errors = await openGame(page);
      await page.click('#btn-start-new-world');
      await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
      // A real click: Playwright fails it if the button is covered or cannot be scrolled into view.
      await page.click('#btn-create-world-confirm');
      await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
      await expect(page.locator('#start-overlay')).toBeHidden();
      expect(await page.evaluate(() => window.game.world.chunks.size), 'the world has chunks').toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('without WebGL', () => {

  test('the start screen says why the game cannot start', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const notice = page.locator('#startup-error');
    await expect(notice).toBeVisible({ timeout: 60000 });
    await expect(notice).toContainText('WebGL');
    await expect(page.locator('#btn-start-new-world')).toBeDisabled();
  });
});
