// Mining Simulator in two real browsers: the host opens it from the designed worlds, mines a coal ore with the wooden
// pickaxe, opens the inventory and sees the coin count, sells the coal at the Trader; a friend joins with the room
// code, gets a plot of its own, buys the Superstick and hits the host for 2.5 -- while a fall does the host no harm.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 300000 });
  await page.evaluate(() => { try { localStorage.removeItem('blockyland-mining-simulator-v1'); } catch { /* none */ } });
  return { page, context };
}

async function lockPointer(page) {
  await page.bringToFront();
  if (await page.locator('#pause-menu').isVisible()) await page.click('#btn-resume');
  if (!await page.evaluate(() => Boolean(document.pointerLockElement))) await page.locator('#canvas-container canvas').click();
  await page.waitForFunction(() => Boolean(document.pointerLockElement), null, { timeout: 15000 });
}

test('Mining Simulator: mine, sell, see the coins, and only the Superstick hurts', async ({ browser }) => {
  test.setTimeout(900000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    await host.click('#btn-start-designed-world');
    await host.waitForFunction(() => /Mining Simulator/.test(document.getElementById('map-designed-list')?.textContent ?? ''), null, { timeout: 60000 });
    await host.locator('#map-designed-list > *', { hasText: 'Mining Simulator' }).first().getByRole('button').first().click();
    await host.waitForFunction(() => /room [0-9]{4}/.test(document.getElementById('mining-sim-code')?.textContent ?? ''), null, { timeout: 120000 });
    const start = await host.evaluate(() => {
      const g = window.game, ms = g.miningSim, me = ms.myRecord();
      return {
        peaceful: g.difficulty, mobSpawning: g.gamerules.doMobSpawning, gamemode: g.player.gamemode, pickaxe: g.inventory.hotbar[0]?.id,
        coins: me.coins, trader: g.mobs.mobs.some((m) => m.miningTrader),
      };
    });
    expect(start).toEqual({ peaceful: 'peaceful', mobSpawning: false, gamemode: 'survival', pickaxe: 'wooden_pickaxe', coins: 0, trader: true });

    // A fall from 20 blocks does nothing.
    await host.evaluate(() => { const p = window.game.player; p.position.y += 20; p.velocity.set(0, 0, 0); });
    await host.waitForFunction(() => window.game.player.onGround, null, { timeout: 15000 });
    expect(await host.evaluate(() => window.game.player.health)).toBe(20);

    // Mine a coal ore at the top of the Wood Mine with the wooden pickaxe: stand on it, look down, hold the button.
    await lockPointer(host);
    const mineOne = async (blockId) => {
      await host.evaluate((blockId) => {
        const g = window.game, p = g.player, mine = g.miningSim && { x: -18, z: 0 };
        let found = null;
        for (let x = mine.x - 5; x <= mine.x + 5 && !found; x++) for (let z = mine.z - 5; z <= mine.z + 5 && !found; z++) {
          if (g.world.getVoxel(x, 40, z) === blockId && g.world.getVoxel(x, 41, z) === 0) found = [x, z];
        }
        if (!found) throw new Error(`no block ${blockId} at the top of the Wood Mine`);
        g.inventory.activeSlot = g.inventory.hotbar.findIndex((s) => s?.id === 'wooden_pickaxe');
        g.ui.updateHotbar();
        p.position.set(found[0] + 0.5, 41, found[1] + 0.5);
        p.velocity.set(0, 0, 0);
        p.yaw = 0; p.pitch = -Math.PI / 2 + 0.01;
        window.__mined = found;
      }, blockId);
      await host.waitForFunction((blockId) => window.game.targetBlock?.blockId === blockId, blockId, { timeout: 10000 });
      await host.mouse.down();
      try {
        await host.waitForFunction(() => window.game.world.getVoxel(window.__mined[0], 40, window.__mined[1]) === 0, null, { timeout: 15000 });
      } finally { await host.mouse.up(); }
      return host.evaluate(() => window.__mined);
    };
    const carried = (id) => host.evaluate((id) => [...window.game.inventory.hotbar, ...window.game.inventory.storage].filter((s) => s?.id === id).reduce((n, s) => n + s.count, 0), id);
    // Stone first: it drops nothing.
    await mineOne(3);
    await host.waitForTimeout(2500);
    expect(await carried('cobblestone')).toBe(0);
    expect(await host.evaluate(() => (window.game.entities?.droppedItems ?? []).filter((d) => d.itemType === 4).length)).toBe(0);
    const coal = await mineOne(14);
    await host.waitForFunction(() => [...window.game.inventory.hotbar, ...window.game.inventory.storage].some((s) => s?.id === 'coal'), null, { timeout: 15000 });
    const minedAt = Date.now();

    // A block in hand cannot be placed: a right-click on the ground leaves it there.
    await host.evaluate(() => {
      const g = window.game, p = g.player;
      g.inventory.hotbar[8] = { id: 4, isBlock: true, count: 5 };
      g.inventory.activeSlot = 8;
      g.ui.updateHotbar();
      p.position.set(0.5, 41, -11.5 + 2);
      p.velocity.set(0, 0, 0);
      p.yaw = 0; p.pitch = -Math.PI / 2 + 0.3;
    });
    await host.waitForFunction(() => Boolean(window.game.targetBlock?.normal), null, { timeout: 10000 });
    const aim = await host.evaluate(() => { const t = window.game.targetBlock; return [t.x + t.normal.x, t.y + t.normal.y, t.z + t.normal.z]; });
    await host.mouse.click(550, 340, { button: 'right' });
    await host.waitForTimeout(500);
    expect(await host.evaluate(([x, y, z]) => window.game.world.getVoxel(x, y, z), aim)).toBe(0);
    expect(await host.evaluate(() => window.game.inventory.hotbar[8]?.count)).toBe(5);
    await host.evaluate(() => { const g = window.game; g.inventory.hotbar[8] = null; g.inventory.activeSlot = 0; g.ui.updateHotbar(); });

    // The inventory shows the coins.
    await host.keyboard.press('KeyE');
    await host.waitForFunction(() => /Coins: 0/.test(document.getElementById('mining-sim-coins')?.textContent ?? ''), null, { timeout: 10000 });
    await host.keyboard.press('KeyE');

    // Sell at the Trader.
    await host.evaluate(() => {
      const g = window.game;
      g.player.position.set(0.5, 41, -15.5);
      g.modRuntime.interact({ mob: g.mobs.mobs.find((m) => m.miningTrader) });
    });
    await host.click('#mining-sim-sell');
    await host.waitForFunction(() => window.game.miningSim.myRecord()?.coins === 20, null, { timeout: 10000 });
    await host.click('#mining-sim-shop .ms-close button');

    // A friend joins with the room code: a plot of its own and a pickaxe.
    const code = (await host.textContent('#mining-sim-code')).match(/[0-9]{4}/)[0];
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady && window.game.miningSim?.myRecord?.(), null, { timeout: 240000 });
    const plots = {
      host: await host.evaluate(() => window.game.miningSim.myRecord().plot),
      guest: await guest.evaluate(() => window.game.miningSim.myRecord().plot),
    };
    expect(plots.guest).not.toBe(plots.host);
    // The guest has a house and a chest of its own, in its own world.
    const guestChest = await guest.evaluate(async () => {
      const ms = window.game.miningSim, me = ms.myRecord();
      const { plotLayout } = await import('/src/mods/mining-simulator/world.js');
      const [c] = plotLayout(me.plot, me.house).chests;
      return { block: window.game.world.getVoxel(c.x, c.y, c.z), chest: Boolean(window.game.chestManager.getChest(c.x, c.y, c.z)) };
    });
    expect(guestChest).toEqual({ block: 161, chest: true });
    await guest.waitForFunction(() => window.game.inventory.hotbar.some((s) => s?.id === 'wooden_pickaxe'), null, { timeout: 15000 });

    // The guest buys the Superstick (the host grants the coins), and both stand on the plaza.
    await host.evaluate(() => {
      const ms = window.game.miningSim, hostName = ms.names.get('host');
      for (const record of ms.ledger.players.values()) if (record.name !== hostName) record.coins = 300;
      ms.publish();
    });
    await guest.evaluate(() => { const g = window.game; g.player.position.set(0.5, 41, -15.5); g.modRuntime.interact({ mob: g.mobs.mobs.find((m) => m.miningTrader) }); });
    await guest.waitForFunction(() => !document.getElementById('mining-sim-buy-superstick')?.disabled, null, { timeout: 10000 });
    await guest.click('#mining-sim-buy-superstick');
    await guest.waitForFunction(() => window.game.inventory.hotbar.some((s) => s?.miningSim === 'superstick'), null, { timeout: 10000 });
    await guest.click('#mining-sim-shop .ms-close button');
    await host.evaluate(() => {
      const g = window.game, p = g.player, takeDamage = p.takeDamage;
      p.position.set(0.5, 41, -16.5);
      p.health = 20;
      g.miningSim.protection.clear();
      g.miningSim.protectedUntil = 0;
      p.takeDamage = function (...args) {
        const before = p.health;
        const result = takeDamage.apply(this, args);
        if (p.health < before) window.__lost = before - p.health;
        return result;
      };
    });
    await guest.evaluate(() => { const g = window.game; g.player.position.set(1.5, 41, -16.5); });
    await host.waitForTimeout(800);

    // A pickaxe swing does nothing; a Superstick swing takes 2.5.
    await guest.evaluate(() => { const g = window.game; g.inventory.activeSlot = g.inventory.hotbar.findIndex((s) => s?.id === 'wooden_pickaxe'); g.worldSync.attackRemotePlayer('host', 4, {}); });
    await host.waitForTimeout(800);
    expect(await host.evaluate(() => window.game.player.health)).toBe(20);
    await guest.evaluate(() => { const g = window.game; g.inventory.activeSlot = g.inventory.hotbar.findIndex((s) => s?.miningSim === 'superstick'); g.worldSync.attackRemotePlayer('host', 1, {}); });
    // Peaceful regenerates health at once, so what the hit took is measured as it lands.
    await host.waitForFunction(() => window.__lost !== undefined, null, { timeout: 10000 });
    expect(await host.evaluate(() => window.__lost)).toBe(2.5);

    // The coal mined at the start grows back a minute after it was mined.
    const wait = Math.max(0, 60000 - (Date.now() - minedAt));
    await host.waitForTimeout(Math.max(0, wait - 5000));
    await host.waitForFunction(([x, z]) => window.game.world.getVoxel(x, 40, z) === 14, coal, { timeout: 20000 });
    expect(await guest.evaluate(([x, z]) => window.game.world.getVoxel(x, 40, z), coal)).toBe(14);

    await host.screenshot({ path: 'test-results/mining-simulator-host.png' });
    expect(errors).toEqual([]);
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
