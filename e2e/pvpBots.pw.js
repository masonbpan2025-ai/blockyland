// PvP played by bots in two real browsers. Each bot drives its own player through the game's real input and attack
// path (playerBot.js "fight player"), over a real shared-world connection, and the checks are what Java Edition does
// (minecraft.wiki Tutorial:PvP (Java Edition), Damage, Knockback, Particles): damage per hit, critical hits, the
// sprint-knockback push, the 3-block reach, the hit particles, and the death message.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui && window.game?.playerBot, null, { timeout: 300000 });
  return { page, context };
}

test('two bots fight with swords: damage, crits, knockback, reach, particles and the death message match Java', async ({ browser }) => {
  test.setTimeout(900000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors);
  const { page: guest, context: guestContext } = await openGame(browser, errors);
  try {
    await host.click('#btn-start-new-world');
    await host.click('#world-mode-creative');
    await host.click('#btn-create-world-confirm');
    await host.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 240000 });
    // A stone arena high up (the world is 64 blocks tall), built before sharing so the guest receives it with the world.
    const arena = await host.evaluate(() => {
      const g = window.game, x0 = Math.floor(g.player.position.x), z0 = Math.floor(g.player.position.z), y = 56;
      for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
        g.world.setVoxel(x0 + dx, y, z0 + dz, 1);
        for (let h = 1; h <= 4; h++) g.world.setVoxel(x0 + dx, y + h, z0 + dz, 0);
      }
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

    /** Put both players on the arena, in Survival, full health, a sword in hand: the guest `gap` blocks north (-z) of the host, facing each other. */
    const arrange = async (gap) => {
      for (const [page, dz, yaw] of [[host, 0, 0], [guest, gap, Math.PI]]) {
        await page.evaluate(({ a, dz, yaw }) => {
          const g = window.game, p = g.player;
          p.setGameMode('survival');
          p.isDead = false; p.health = 20; p.hunger = 20; p.invulnerableTimer = 0;
          p.position.set(a.x, a.y, a.z - dz); p.velocity.set(0, 0, 0); p.yaw = yaw; p.pitch = 0;
          p.fallDistance = 0; p.secondsSinceSwing = 5;
          g.inventory.hotbar[0] = { id: 'iron_sword', count: 1, isBlock: false };
          g.inventory.activeSlot = 0;
          g.ui?.updateHotbar?.();
          // Count block-fragment bursts: a hit on a player must not make any.
          if (!g.entities.__countsFragments) {
            const spawn = g.entities.spawnBlockParticles.bind(g.entities);
            g.entities.spawnBlockParticles = (...args) => { window.__fragments = (window.__fragments ?? 0) + 1; return spawn(...args); };
            g.entities.__countsFragments = true;
          }
          window.__fragments = 0;
        }, { a: arena, dz, yaw });
      }
      // Both see each other where they now stand.
      await expect.poll(() => guest.evaluate((a) => {
        const peer = [...window.game.worldSync.remotePlayers.remotePlayers.values()][0];
        return peer ? Math.abs(peer.currentPos.z - a.z) < 0.3 : false;
      }, arena), { timeout: 20000 }).toBe(true);
    };
    const health = (page) => page.evaluate(() => window.game.player.health);
    const fight = (page, command) => page.evaluate((c) => window.game.playerBot.run(c), command);

    // 1. A critical hit with an iron sword: 6 x 1.5 = 9, one hit at a time (the hurt window spaces them).
    await arrange(2);
    const crit = await fight(guest, 'fight player 1 hits with crits');
    expect(crit.ok, crit.message).toBe(true);
    await expect.poll(() => health(host), { timeout: 10000 }).toBeLessThan(20);
    expect(20 - await health(host)).toBeCloseTo(9, 0);
    const attackerParticles = await guest.evaluate(() => ({
      combat: window.game.entities.combatParticles.counts(),
      fragments: window.__fragments,
      critical: window.game.player.lastAttackCritical,
    }));
    expect(attackerParticles.critical).toBe(true);
    expect(attackerParticles.combat.crit ?? 0, 'crit stars around the target').toBeGreaterThan(0);
    expect(attackerParticles.combat.damage_indicator ?? 0, 'damage hearts: (int)(9 x 0.5)').toBe(4);
    expect(attackerParticles.fragments, 'no block fragments').toBe(0);

    // 2. A plain hit on the ground: 6, and a knockback of about a block away from the attacker.
    await arrange(2);
    const startZ = await host.evaluate(() => window.game.player.position.z);
    const plain = await fight(guest, 'fight player 1 hits');
    expect(plain.ok, plain.message).toBe(true);
    await expect.poll(() => health(host), { timeout: 10000 }).toBeLessThan(20);
    expect(20 - await health(host)).toBeCloseTo(6, 0);
    await host.waitForTimeout(800);
    const plainPush = await host.evaluate(() => window.game.player.position.z) - startZ;
    expect(plainPush, 'pushed away from the attacker, who is north').toBeGreaterThan(0.4);

    // 3. A sprint-knockback hit pushes further than a plain one.
    await arrange(4);
    const sprintStart = await host.evaluate(() => window.game.player.position.z);
    const sprint = await fight(guest, 'fight player 1 hits with sprint hits');
    expect(sprint.ok, sprint.message).toBe(true);
    await expect.poll(() => health(host), { timeout: 10000 }).toBeLessThan(20);
    await host.waitForTimeout(800);
    const sprintPush = await host.evaluate(() => window.game.player.position.z) - sprintStart;
    expect(sprintPush, `sprint ${sprintPush.toFixed(2)} vs plain ${plainPush.toFixed(2)}`).toBeGreaterThan(plainPush + 0.5);
    expect(await guest.evaluate(() => window.game.player.isSprinting), 'the sprint ended with the hit').toBe(false);

    // 4. Out of reach: 3.6 blocks apart, a swing finds nobody.
    await arrange(3.6 + 0.6);
    const reach = await guest.evaluate(() => {
      const g = window.game, ray = g.getInteractionRay();
      return { at3: Boolean(g.worldSync.pickRemotePlayer(ray.origin, ray.direction, 3)), at5: Boolean(g.worldSync.pickRemotePlayer(ray.origin, ray.direction, 5)) };
    });
    expect(reach).toEqual({ at3: false, at5: true });

    // 5. The host fights back until the guest dies: "<player> was slain by <player>".
    await arrange(2);
    const guestName = await guest.evaluate(() => window.game.worldSync.client.playerName);
    const hostName = await host.evaluate(() => window.game.worldSync.client.playerName);
    const kill = await fight(host, 'fight player 4 hits');
    expect(kill.ok, kill.message).toBe(true);
    await expect.poll(() => guest.evaluate(() => window.game.player.isDead || window.game.player.health <= 0), { timeout: 15000 }).toBe(true);
    const chat = await guest.evaluate(() => document.getElementById('chat-messages')?.textContent ?? document.body.textContent);
    expect(chat).toContain(`${guestName} was slain by ${hostName}`);

    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
