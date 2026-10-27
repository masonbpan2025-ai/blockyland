// Bed Wars in two real browsers: the host opens it from the designed worlds and shares the code, a friend joins with it,
// the host starts, both appear at their own bases with the starting kit, the forge's iron is picked up, the guest breaks
// the host's bed (gone for both, announced), and the guest, knocked into the void, respawns at its base five seconds later
// while its killer is given what it carried.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 300000 });
  return { page, context };
}

test('Bed Wars: two players, two bases, a bed broken, a void death and a respawn', async ({ browser }) => {
  test.setTimeout(900000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    await host.click('#btn-start-designed-world');
    await host.waitForFunction(() => /Bed Wars/.test(document.getElementById('map-designed-list')?.textContent ?? ''), null, { timeout: 60000 });
    await host.locator('#map-designed-list > *', { hasText: 'Bed Wars' }).first().getByRole('button').first().click();
    await host.waitForFunction(() => /^[0-9]{4}$/.test(document.getElementById('bedwars-code')?.textContent ?? ''), null, { timeout: 120000 });
    const code = await host.textContent('#bedwars-code');
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady && window.game.bedwars?.state, null, { timeout: 240000 });
    await host.waitForFunction(() => !document.getElementById('bedwars-start').disabled, null, { timeout: 30000 });
    await host.click('#bedwars-start');
    for (const page of [host, guest]) await page.waitForFunction(() => window.game.bedwars.phase === 'playing', null, { timeout: 30000 });

    // Each at its own base, in survival, with a wooden sword and leather armour.
    for (const page of [host, guest]) {
      const at = await page.evaluate(() => {
        const g = window.game, spawn = g.bedwars.myBase().spawn;
        return { d: g.player.position.distanceTo({ x: spawn.x, y: spawn.y, z: spawn.z }), gm: g.player.gamemode, sword: g.inventory.hotbar.some((s) => s?.id === 'wooden_sword'), chest: g.inventory.armor.chest?.id };
      });
      expect(at.d).toBeLessThan(0.5);
      expect(at).toMatchObject({ gm: 'survival', sword: true, chest: 'leather_chestplate' });
    }

    // The forge's iron, picked up by standing on it.
    await host.evaluate(() => { const g = window.game, f = g.bedwars.myBase().forge; g.player.position.set(f.x, f.y, f.z); g.player.velocity.set(0, 0, 0); });
    await expect.poll(() => host.evaluate(() => window.game.inventory.hotbar.concat(window.game.inventory.storage).filter((s) => s?.id === 'iron_ingot').reduce((n, s) => n + s.count, 0)), { timeout: 15000 }).toBeGreaterThan(0);

    // The guest breaks the host's bed.
    const bed = await host.evaluate(() => window.game.bedwars.myBase().bed);
    await guest.evaluate((bed) => {
      const g = window.game;
      g.player.position.set(bed.foot[0] + 0.5, bed.foot[1], bed.foot[2] + 1.5);
      g.targetBlock = { x: bed.foot[0], y: bed.foot[1], z: bed.foot[2], blockId: g.world.getVoxel(...bed.foot), normal: { x: 0, y: 1, z: 0 } };
      g.breakTargetBlock();
    }, bed);
    await host.waitForFunction(() => window.game.bedwars.myTeam()?.bed === false, null, { timeout: 15000 });
    for (const page of [host, guest]) expect(await page.evaluate((bed) => [window.game.world.getVoxel(...bed.foot), window.game.world.getVoxel(...bed.head)], bed)).toEqual([0, 0]);
    await expect.poll(() => host.evaluate(() => document.getElementById('chat-messages')?.textContent ?? ''), { timeout: 10000 }).toMatch(/BED DESTRUCTION > Red Bed was destroyed by/);

    // The host hits the guest, who falls into the void carrying iron: back at its base five seconds later, the iron the host's.
    const ironOf = (page) => page.evaluate(() => window.game.inventory.hotbar.concat(window.game.inventory.storage).filter((s) => s?.id === 'iron_ingot').reduce((n, s) => n + s.count, 0));
    const hostIron = await ironOf(host);
    await guest.evaluate(() => { const g = window.game; g.inventory.addItem('iron_ingot', false, 9); g.ui.updateHotbar(); });
    const guestId = await guest.evaluate(() => window.game.bedwars.myId);
    await host.evaluate((id) => window.game.bedwars.match.hit('host', id), guestId);
    await guest.evaluate(() => { window.game.player.position.y = -10; });
    await guest.waitForFunction(() => window.game.bedwars.me()?.dead === true, null, { timeout: 10000 });
    expect(await guest.evaluate(() => window.game.player.gamemode)).toBe('spectator');
    await expect.poll(() => ironOf(host), { timeout: 10000 }).toBe(hostIron + 9);
    await guest.waitForFunction(() => window.game.bedwars.me()?.dead === false && window.game.player.gamemode === 'survival', null, { timeout: 15000 });
    expect(await guest.evaluate(() => { const g = window.game, s = g.bedwars.myBase().spawn; return g.player.position.distanceTo({ x: s.x, y: s.y, z: s.z }); })).toBeLessThan(0.5);
    await expect.poll(() => host.evaluate(() => document.getElementById('chat-messages')?.textContent ?? ''), { timeout: 10000 }).toMatch(/was knocked into the void by/);
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
