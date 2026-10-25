import { test, expect } from '@playwright/test';
test.use({ actionTimeout: 20000 });

test('real mouse attacks respect PvP and game mode over the local-tab connection', async ({ page: host, context }) => {
  await host.goto('/', { waitUntil: 'commit' });
  await host.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await host.click('#btn-start-new-world');
  await host.click('#world-mode-creative');
  await host.click('#btn-create-world-confirm');
  await host.waitForFunction(() => window.game.worldReady, null, { timeout: 180000 });
  console.log('PvP: world ready');
  await host.evaluate(() => document.exitPointerLock?.());
  await host.waitForFunction(() => !document.pointerLockElement);
  if (!await host.locator('#pause-menu').isVisible()) await host.keyboard.press('Escape');
  await host.click('#btn-host-world');
  await host.waitForFunction(() => window.game.worldSync.isHosting);
  console.log('PvP: host sharing');
  await host.locator('#host-pvp-toggle').check();
  const link = await host.inputValue('#host-share-link-input');
  const guest = await context.newPage();
  await guest.addInitScript(() => {
    const NativeConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends NativeConnection {
      constructor(config) { super({ ...config, iceServers: [], iceTransportPolicy: 'relay' }); }
    };
  });
  await guest.goto(link, { waitUntil: 'commit' });
  await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady
    && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 180000 });
  expect(await guest.evaluate(() => game.worldSync.client.hostLink.mode)).toBe('local');
  console.log('PvP: guest joined');
  await host.click('#btn-dismiss-host-modal');
  if (await host.locator('#pause-menu').isVisible()) await host.click('#btn-resume');

  const at = await host.evaluate(() => [Math.floor(game.player.position.x), Math.floor(game.player.position.z)]);
  const arrange = async (hostMode = 'survival', guestMode = 'survival') => {
    for (const [p, dz, yaw, mode] of [[host, 0, 0, hostMode], [guest, -2, Math.PI, guestMode]]) {
      await p.evaluate(({ at: [x, z], dz, yaw, mode }) => {
        const g = window.game;
        for (let dx = -4; dx <= 4; dx++) for (let dz = -5; dz <= 4; dz++) {
          g.world.setVoxel(x + dx, 58, z + dz, 4);
          for (let y = 59; y < 64; y++) g.world.setVoxel(x + dx, y, z + dz, 0);
        }
        g.player.setGameMode(mode);
        g.player.position.set(x + 0.5, 59, z + 0.5 + dz);
        g.player.velocity.set(0, 0, 0);
        g.player.yaw = yaw;
        g.player.pitch = 0;
        g.player.health = 20;
        g.player.invulnerableTimer = 0;
        g.player.secondsSinceSwing = 2;
      }, { at, dz, yaw, mode });
    }
    await expect.poll(() => host.evaluate(() => {
      const ray = game.getInteractionRay();
      return Boolean(game.worldSync.pickRemotePlayer(ray.origin, ray.direction, 3));
    })).toBe(true);
  };
  const clickAttack = async (p) => {
    await p.bringToFront();
    if (await p.locator('#pause-menu').isVisible()) await p.click('#btn-resume');
    if (!await p.evaluate(() => Boolean(document.pointerLockElement))) {
      await p.locator('#canvas-container canvas').first().click({ position: { x: 500, y: 300 } });
    }
    await p.waitForFunction(() => Boolean(document.pointerLockElement));
    await p.evaluate(() => {
      const other = [...game.worldSync.remotePlayers.remotePlayers.values()][0].currentPos;
      const delta = other.clone().sub(game.player.position);
      game.player.yaw = Math.atan2(-delta.x, -delta.z);
      game.player.pitch = 0;
    });
    // A second press is an attack, after the first click acquired the pointer lock. No direct attack helper.
    await p.mouse.down();
    await p.mouse.up();
  };

  await arrange();
  console.log('PvP: aiming at guest');
  await clickAttack(host);
  await expect.poll(() => guest.evaluate(() => game.player.health)).toBeLessThan(20);
  await arrange();
  await clickAttack(guest);
  await expect.poll(() => host.evaluate(() => game.player.health)).toBeLessThan(20);
});
