// A shared world in two real browsers, played by bots: what each player holds is seen in their hand; an arrow the host's
// bot shoots hurts the guest; a snowball knocks the guest back without hurting; and a guest who dies is seen to fall,
// vanish in smoke and drop what they carried -- for both players, with each drop going to the first to reach it -- and
// to stand again when they respawn.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui && window.game?.playerBot, null, { timeout: 300000 });
  return { page, context };
}

test('shared world: held items, arrows, snowballs, and a death everyone sees with drops anyone can take', async ({ browser }) => {
  test.setTimeout(900000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    await host.click('#btn-start-new-world');
    await host.click('#btn-create-world-confirm');
    await host.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 240000 });
    // A stone floor high up, built before sharing so the guest receives it.
    const arena = await host.evaluate(() => {
      const g = window.game, x0 = Math.floor(g.player.position.x), z0 = Math.floor(g.player.position.z), y = 56;
      for (let dx = -10; dx <= 10; dx++) for (let dz = -14; dz <= 6; dz++) { g.world.setVoxel(x0 + dx, y, z0 + dz, 1); for (let h = 1; h <= 5; h++) g.world.setVoxel(x0 + dx, y + h, z0 + dz, 0); }
      return { x: x0 + 0.5, y: y + 1, z: z0 + 0.5 };
    });
    await host.evaluate(() => document.exitPointerLock?.());
    if (!await host.locator('#pause-menu').isVisible()) await host.keyboard.press('Escape');
    await host.click('#btn-host-world');
    await host.waitForFunction(() => window.game.worldSync.isHosting);
    await host.locator('#host-pvp-toggle').check();
    const code = await host.textContent('#host-room-id-badge');
    await host.click('#btn-dismiss-host-modal');
    if (await host.locator('#pause-menu').isVisible()) await host.click('#btn-resume');
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady
      && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 240000 });

    /** Both in Survival on the floor: the host at the south end, the guest `gap` blocks north, facing each other. */
    const arrange = async (gap) => {
      for (const [page, dz, yaw] of [[host, 0, 0], [guest, gap, Math.PI]]) {
        await page.evaluate(({ a, dz, yaw }) => {
          const g = window.game, p = g.player;
          p.setGameMode('survival');
          p.isDead = false; p.health = 20; p.hunger = 20; p.invulnerableTimer = 0;
          p.position.set(a.x, a.y, a.z - dz); p.velocity.set(0, 0, 0); p.yaw = yaw; p.pitch = 0; p.fallDistance = 0;
        }, { a: arena, dz, yaw });
      }
      await expect.poll(() => host.evaluate((a) => {
        const peer = [...window.game.worldSync.remotePlayers.remotePlayers.values()][0];
        return peer ? Math.abs(peer.currentPos.z - (a.z - 8)) < 0.4 || Math.abs(peer.currentPos.z - a.z) > 0 : false;
      }, arena), { timeout: 20000 }).toBe(true);
      await host.waitForTimeout(500);
    };
    const hostSeesGuest = () => host.evaluate(() => {
      const peer = [...window.game.worldSync.remotePlayers.remotePlayers.values()][0];
      return peer ? { dead: Boolean(peer.dead), visible: peer.avatar.mesh.visible, held: peer.avatar.handSlot.children[0]?.userData.itemId ?? null, z: peer.currentPos.z } : null;
    });
    const hold = (page, slot) => page.evaluate((s) => { const g = window.game; g.inventory.hotbar[0] = s; g.inventory.activeSlot = 0; g.ui.updateHotbar(); }, slot);

    // 1. What the guest holds, the host sees in the guest's hand: a sword (an item), then planks (a block, by number).
    await arrange(8);
    await hold(guest, { id: 'diamond_sword', count: 1, isBlock: false });
    await expect.poll(() => hostSeesGuest().then((s) => s?.held), { timeout: 15000 }).toBe('diamond_sword');
    await hold(guest, { id: 10, count: 12, isBlock: true });
    await expect.poll(() => hostSeesGuest().then((s) => s?.held), { timeout: 15000 }).toBe(10);

    // 2. The host's bot shoots the guest with an arrow from 8 blocks: the guest is hurt.
    const guestChest = () => guest.evaluate(() => { const p = window.game.player.position; return [p.x, p.y + 1, p.z]; });
    const shoot = async () => {
      const [x, y, z] = await guestChest();
      await host.evaluate(() => { const inv = window.game.inventory; inv.hotbar[2] = { id: 'bow', count: 1, isBlock: false }; inv.hotbar[3] = { id: 'arrow', count: 16, isBlock: false }; window.game.ui.updateHotbar(); });
      const r = await host.evaluate((c) => window.game.playerBot.run(c), `shoot at ${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      expect(r.ok, r.message).toBe(true);
    };
    await shoot();
    await expect.poll(() => guest.evaluate(() => window.game.player.health), { timeout: 10000 }).toBeLessThan(20);

    // 3. A snowball: no damage, but the guest is pushed away from the thrower (north, -z).
    await arrange(6);
    const zBefore = await guest.evaluate(() => window.game.player.position.z);
    await host.evaluate(async (a) => {
      const g = window.game, p = g.player;
      p.yaw = 0; p.pitch = Math.atan2(0.3, 6);
      g.player.camera?.updateMatrixWorld?.();
      g.camera.updateMatrixWorld();
      g.inventory.hotbar[0] = { id: 'snowball', count: 4, isBlock: false }; g.inventory.activeSlot = 0;
      const { useSnowball } = await import('/src/netherCombat.js');
      useSnowball(g);
    }, arena);
    await expect.poll(() => guest.evaluate((z0) => z0 - window.game.player.position.z, zBefore), { timeout: 10000 }).toBeGreaterThan(0.3);
    expect(await guest.evaluate(() => window.game.player.health)).toBe(20);

    // 4. The guest, weak and carrying a sword and planks, is shot dead.
    await arrange(8);
    await guest.evaluate(() => {
      const g = window.game; g.player.health = 4;
      g.inventory.hotbar[0] = { id: 'diamond_sword', count: 1, isBlock: false };
      g.inventory.hotbar[1] = { id: 10, count: 12, isBlock: true };
      g.ui.updateHotbar();
    });
    await shoot();
    await expect.poll(() => guest.evaluate(() => window.game.player.isDead), { timeout: 10000 }).toBe(true);
    const guestName = await guest.evaluate(() => window.game.worldSync.client.playerName);
    const hostName = await host.evaluate(() => window.game.worldSync.client.playerName);
    expect(await guest.evaluate(() => document.getElementById('chat-messages')?.textContent ?? document.body.textContent)).toContain(`${guestName} was shot by ${hostName}`);
    // The host sees the guest fall, then vanish in smoke.
    await expect.poll(() => hostSeesGuest().then((s) => s?.dead), { timeout: 10000 }).toBe(true);
    const smokeBefore = await host.evaluate(() => window.game.entities.particles.filter((p) => p.smoke).length);
    await expect.poll(() => hostSeesGuest().then((s) => s?.visible), { timeout: 10000 }).toBe(false);
    expect(await host.evaluate(() => window.game.entities.particles.filter((p) => p.smoke).length)).toBeGreaterThan(smokeBefore);
    // Both see both drops.
    for (const page of [host, guest]) {
      await expect.poll(() => page.evaluate(() => [...window.game.worldSync.sharedDrops.values()].map((d) => d.itemType).sort().join()), { timeout: 10000 }).toBe('10,diamond_sword');
    }
    // The host walks over them and takes them; they are gone for the guest too.
    const dropAt = await host.evaluate(() => { const d = [...window.game.worldSync.sharedDrops.values()][0].group.position; return [d.x, d.y, d.z]; });
    await host.evaluate((at) => { const p = window.game.player; p.position.set(at[0], at[1] - 0.2, at[2]); p.velocity.set(0, 0, 0); }, dropAt);
    await expect.poll(() => host.evaluate(() => [...window.game.inventory.hotbar, ...window.game.inventory.storage].some((s) => s?.id === 'diamond_sword')), { timeout: 20000 }).toBe(true);
    await expect.poll(() => guest.evaluate(() => window.game.worldSync.sharedDrops.size), { timeout: 20000 }).toBe(0);
    expect(await guest.evaluate(() => [...window.game.inventory.hotbar, ...window.game.inventory.storage].some((s) => s?.id === 'diamond_sword'))).toBe(false);

    // 5. The guest respawns: the host sees them standing again.
    await guest.click('#btn-death-respawn');
    await expect.poll(() => hostSeesGuest().then((s) => s && !s.dead && s.visible), { timeout: 15000 }).toBe(true);

    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
