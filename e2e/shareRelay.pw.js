// Joining when a direct connection is impossible: some networks and browser settings block every peer-to-peer route.
// The guest's browser here may only use relay servers, and none are configured, so WebRTC cannot connect at all --
// the failure players saw as "A direct connection to the host could not be made". Two separate browser contexts, so
// the same-browser local channel cannot help either. The game's frames must go through the sharing service instead.
import { test, expect } from '@playwright/test';

test('a guest whose network blocks direct connections still joins with the code, and both see each other\'s blocks', async ({ browser }) => {
  const errors = [];
  const open = async (blockDirect) => {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    if (blockDirect) await page.addInitScript(() => {
      const NativeConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativeConnection {
        constructor(config) { super({ ...config, iceServers: [], iceTransportPolicy: 'relay' }); }
      };
    });
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 300000 });
    return { page, context };
  };

  const { page: host, context: hostContext } = await open(false);
  const { page: guest, context: guestContext } = await open(true);
  try {
    await host.click('#btn-start-new-world');
    await host.click('#world-mode-creative');
    await host.click('#btn-create-world-confirm');
    await host.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
    await host.evaluate(() => document.exitPointerLock?.());
    if (!await host.locator('#pause-menu').isVisible()) await host.keyboard.press('Escape');
    await host.click('#btn-host-world');
    await host.waitForFunction(() => window.game.worldSync.isHosting);
    const code = await host.textContent('#host-room-id-badge');
    expect(code).toMatch(/^[0-9]{4}$/);

    // The guest types the code on the start screen, as a friend would.
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady
      && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 180000 });
    const link = await guest.evaluate(() => ({ mode: game.worldSync.client.hostLink.mode, chunks: game.world.chunks.size }));
    expect(link.mode, 'the game frames went through the sharing service').toBe('relay');
    expect(link.chunks).toBeGreaterThan(20);

    // Blocks travel both ways over the relay.
    const at = await host.evaluate(() => [Math.floor(game.player.position.x) + 2, 45, Math.floor(game.player.position.z) + 2]);
    await host.evaluate((p) => game.worldSync.client.sendBlockUpdate(...p, 5), at);
    await expect.poll(() => guest.evaluate((p) => game.world.getVoxel(...p), at)).toBe(5);
    const back = [at[0] + 1, at[1], at[2]];
    await guest.evaluate((p) => game.worldSync.client.sendBlockUpdate(...p, 4), back);
    await expect.poll(() => host.evaluate((p) => game.world.getVoxel(...p), back)).toBe(4);
    await expect(host.locator('#hud-multiplayer-text')).toHaveText('Sharing: 2 players');

    // Stopping sharing reaches the relayed guest.
    await host.evaluate(() => game.worldSync.client.disconnect());
    await expect.poll(() => guest.evaluate(() => game.worldSync.client.connected)).toBe(false);
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
