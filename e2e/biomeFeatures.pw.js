// In a real browser, through the start buttons: a Nether world's portal to a random Overworld biome, an End world's
// small portal home, the recipe book in Survival, and the Biome Inspector opened from the Inspector picker.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function newWorld(page, biome) {
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 300000 });
  await page.click('#btn-start-new-world');
  await expect(page.locator('#world-biome-modal')).toBeVisible({ timeout: 20000 });
  await page.selectOption('#world-biome-select', biome);
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 300000 });
}

test('a Nether world starts beside a lit portal that leads to a random Overworld biome', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newWorld(page, 'crimson_forest');
  const start = await page.evaluate(async () => {
    const g = window.game, B = (await import('/src/blocks.js')).BLOCKS, p = g.player.position;
    let portal = 0;
    for (let x = -6; x <= 6; x++) for (let y = -3; y <= 6; y++) for (let z = -6; z <= 6; z++) if (g.world.getVoxel(Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z) === B.NETHER_PORTAL) portal++;
    return { dimension: g.world.dimension, portal, link: g.world.spawnPortals };
  });
  expect(start.dimension).toBe('nether');
  expect(start.portal).toBe(6);
  await page.evaluate(() => { const g = window.game, s = g.world.spawnPortals.nether; g.player.position.set(s.x, s.y, s.z); g.player.velocity.set(0, 0, 0); });
  await page.waitForFunction(() => window.game.world.dimension === 'overworld', null, { timeout: 30000 });
  const there = await page.evaluate(() => { const g = window.game, p = g.player.position; return { biome: g.world.getBiome(p.x, p.z), dx: Math.abs(p.x - g.world.spawnPortals.overworld.x), dz: Math.abs(p.z - g.world.spawnPortals.overworld.z) }; });
  expect(there.biome).toBe(start.link.overworld.biome);
  expect(there.dx + there.dz).toBeLessThan(40);
  await expect.poll(() => page.evaluate(() => document.getElementById('chat-messages')?.textContent ?? '')).toMatch(/Teleported to The Overworld \(/);
  expect(errors).toEqual([]);
});

test('an End City world starts beside an End city, off the main island, with a small portal home', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newWorld(page, 'end_city');
  const start = await page.evaluate(async () => {
    const g = window.game, B = (await import('/src/blocks.js')).BLOCKS, p = g.player.position;
    let portal = null, purpur = 0;
    for (let x = -40; x <= 40; x++) for (let y = -8; y <= 40; y++) for (let z = -40; z <= 40; z++) {
      const id = g.world.getVoxel(Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z);
      if (id === B.PURPUR_BLOCK || id === B.PURPUR_PILLAR) purpur++;
      if (id === B.END_PORTAL && Math.abs(x) <= 8 && Math.abs(z) <= 8) portal = [Math.floor(p.x) + x, Math.floor(p.y) + y, Math.floor(p.z) + z];
    }
    return { dimension: g.world.dimension, distance: Math.hypot(p.x, p.z), purpur, portal };
  });
  expect(start.dimension).toBe('the_end');
  expect(start.distance).toBeGreaterThan(1024);
  expect(start.purpur).toBeGreaterThan(50);
  expect(start.portal).not.toBeNull();
  await page.evaluate(([x, y, z]) => { const g = window.game; g.player.position.set(x + 0.5, y + 0.2, z + 0.5); g.player.velocity.set(0, 0, 0); }, start.portal);
  await page.waitForFunction(() => window.game.world.dimension === 'overworld', null, { timeout: 30000 });
  expect(errors).toEqual([]);
});

test('the recipe book in Survival: logs unlock planks, clicking fills the grid, the grid makes them', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newWorld(page, 'plains');
  await page.evaluate(async () => { const g = window.game, B = (await import('/src/blocks.js')).BLOCKS; g.player.gamemode = 'survival'; g.inventory.addItem(B.OAK_LOG, true, 4); g.ui.updateHotbar(); });
  await page.keyboard.press('e');
  await expect(page.locator('#recipe-book-inventory')).toBeVisible();
  await page.click('#recipe-book-inventory .rb-recipe[data-recipe="minecraft:oak_planks"]', { modifiers: ['Shift'] });
  const grid = await page.evaluate(() => ({ cells: window.game.inventory.craft2x2.filter(Boolean).map((s) => s.count), result: window.game.inventory.craft2x2Result }));
  expect(grid.cells).toEqual([4]);
  expect(grid.result?.count).toBe(4);
  // The book button hides and shows it.
  await page.click('#btn-recipe-book-inventory');
  await expect(page.locator('#recipe-book-inventory')).toBeHidden();
  await page.click('#btn-recipe-book-inventory');
  await expect(page.locator('#recipe-book-inventory')).toBeVisible();
  // The crafting table's own book, with the search box and Craftable toggle.
  await page.evaluate(() => { const g = window.game; g.ui.closeAllModals(); g.inventory.addItem('stick', false, 2); g.ui.updateHotbar(); g.ui.openCraftingTable(); });
  await page.fill('#recipe-book-crafting .rb-search', 'wooden pickaxe');
  await expect(page.locator('#recipe-book-crafting .rb-recipe[data-recipe="minecraft:wooden_pickaxe"]')).toHaveClass(/rb-missing/);
  await page.click('#recipe-book-crafting .rb-toggle');
  await expect(page.locator('#recipe-book-crafting .rb-recipe[data-recipe="minecraft:wooden_pickaxe"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the Biome Inspector opens from the Inspector picker and its checks pass', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 300000 });
  await page.click('#btn-start-inspector');
  await page.click('#btn-pick-inspector-biome');
  await page.waitForURL(/biome-inspector\.html/, { waitUntil: 'commit', timeout: 120000 });
  for (const biome of ['sunflower_plains', 'soul_sand_valley', 'small_end_islands', 'chorus_forest']) {
    if (biome !== 'sunflower_plains') await page.selectOption('#biome', biome);
    await page.waitForFunction((b) => window.__biomeInspector?.biome === b, biome, { timeout: 180000 });
    const checks = await page.evaluate(() => window.__biomeInspector.checks);
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.length).toBeGreaterThan(1);
  }
  await page.selectOption('#biome', 'the_end');
  await page.waitForFunction(() => window.__biomeInspector?.biome === 'the_end', null, { timeout: 180000 });
  await page.click('#dragon');
  await expect(page.locator('#status')).toContainText('Gateways open');
  expect(errors).toEqual([]);
});

test('walking into a Nether portal holds the player, shows a progress bar, and arrives in the Nether without a long freeze', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await newWorld(page, 'plains');
  await page.waitForTimeout(2000);
  const result = await page.evaluate(async () => {
    const g = window.game, p = g.player.position, { generateDestinationPortal } = await import('/src/netherPortal.js');
    g.player.gamemode = 'survival';
    const x = Math.floor(p.x), z = Math.floor(p.z) - 4, y = g.world.getHighestSolidY(x, z);
    for (const { cx, cz } of generateDestinationPortal(g.world, x, y, z, 'x', { platform: true }).affectedChunks) g.rebuildChunkMesh(g.world.getChunk(cx, cz));
    const frames = []; let last = performance.now(), stop = false, sawBar = false;
    const loop = (t) => { frames.push(t - last); last = t; const o = document.getElementById('world-progress-overlay'); if (o && getComputedStyle(o).display !== 'none' && !o.classList.contains('hidden')) sawBar = true; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    p.set(x + 1, y + 1, z + 0.5);
    await new Promise((r) => setTimeout(r, 500));
    p.z += 3; // walk on through
    await new Promise((r) => setTimeout(r, 100));
    const held = Math.abs(p.z - (z + 0.5)) < 0.01;
    const t0 = performance.now();
    while ((g.world.dimension !== 'nether' || g.portalManager.travelling) && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 100));
    stop = true;
    return { held, sawBar, dimension: g.world.dimension, worstFrame: Math.max(...frames), phase: g.lifecycle.phase,
      swirl: g.textures.portalFrame !== undefined, particles: g.weather.ambientParticles.particles.length,
      // Arrived in the Nether in front of the portal, not inside it.
      inPortal: [0, 1].some((dy) => g.world.getVoxel(Math.floor(p.x), Math.floor(p.y) + dy, Math.floor(p.z)) === 180) };
  });
  expect(result.held).toBe(true);
  expect(result.sawBar).toBe(true);
  expect(result.dimension).toBe('nether');
  expect(result.phase).toBe('ready');
  expect(result.inPortal).toBe(false);
  expect(result.swirl).toBe(true);
  expect(result.worstFrame).toBeLessThan(1000);
  expect(errors).toEqual([]);
});

test('the Structure Inspector\'s Nether portal: walk through it and into it, and arrive in the Nether', async ({ page }) => {
  test.setTimeout(600000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 300000 });
  await page.click('#btn-start-inspector');
  await page.click('#btn-pick-inspector-structure');
  await page.waitForURL(/structure-inspector\.html/, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.__walk && document.querySelectorAll('#structure option').length > 5, null, { timeout: 120000 });
  await page.selectOption('#structure', 'nether_portal');
  await page.click('#btn-walk');
  await page.waitForFunction(() => window.__walk.active, null, { timeout: 180000 });
  // The walk-through's world is the Nether portal's once it has been built (180: the portal block).
  await page.waitForFunction(() => { const w = window.__portalTravel.game.world; if (!w) return false; for (let y = 1; y < 80; y++) if (w.getVoxel(0, y, 0) === 180 || w.getVoxel(1, y, 0) === 180) return true; return false; }, null, { timeout: 180000 });
  const trip = await page.evaluate(async () => {
    const pt = window.__portalTravel, w = pt.game.world, B = (await import('/src/blocks.js')).BLOCKS;
    let y = 1; while (w.getVoxel(0, y, 0) !== B.NETHER_PORTAL && y < 80) y++;
    window.__walk.teleport(0.5, y, 0.5, 0, 0);
    const t0 = performance.now(); let sawBar = false;
    while ((w.dimension === 'overworld' || pt.busy) && performance.now() - t0 < 30000) {
      await new Promise((r) => requestAnimationFrame(r));
      if (!document.getElementById('travel-progress').hidden) sawBar = true;
    }
    const wk = window.__walk.walker;
    return { dimension: w.dimension, sawBar, inPortal: w.getVoxel(Math.floor(wk.x), Math.floor(wk.y), Math.floor(wk.z)) === B.NETHER_PORTAL };
  });
  expect(trip).toEqual({ dimension: 'nether', sawBar: true, inPortal: false });
  expect(errors).toEqual([]);
});
