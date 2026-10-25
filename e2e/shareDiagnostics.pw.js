import { test, expect } from '@playwright/test';

// These tests deliberately retain Chrome's normal mDNS/IP privacy behavior. The game-world sharing suite's
// special loopback flags are not evidence that a normal browser profile can connect.
test.use({ launchOptions: { args: [] } });

test('connection check joins two normal tabs without loading a game world', async ({ page, context }) => {
  await page.goto('/share-debug.html');
  await page.click('#host');
  await expect(page.locator('#guest-link')).toBeVisible();
  const opened = context.waitForEvent('page');
  await page.click('#guest-link');
  const guest = await opened;
  await expect(guest.locator('#status')).toContainText('handshake both succeeded', { timeout: 35000 });
  await expect(page.locator('#status')).toContainText('handshake both succeeded');
  const report = JSON.parse(await guest.locator('#report').textContent());
  expect(report.connected).toBe(true);
  expect(report.peers).toBe(2);
  expect(report.connections[0].channelState).toBe('open');
  expect(report.connections[0].remoteDescriptionReceived).toBe(true);
  expect(report.connections[0].turnConfigured).toBe(false);
  console.log('Normal Chrome connection diagnostics', JSON.stringify(report.connections[0]));
  expect(await page.evaluate(() => typeof window.game)).toBe('undefined');
});

test('connection check falls back to a local channel when Chrome cannot gather a usable candidate', async ({ page, context }) => {
  await page.goto('/share-debug.html');
  await page.click('#host');
  await expect(page.locator('#guest-link')).toBeVisible();
  const link = await page.locator('#guest-link').getAttribute('href');
  const guest = await context.newPage();
  try {
    await guest.addInitScript(() => {
      // Deterministically prevent any route, without relying on a real firewall or breaking signaling.
      const NativeConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativeConnection {
        constructor(config) { super({ ...config, iceServers: [], iceTransportPolicy: 'relay' }); }
      };
    });
    await guest.goto(link);
    await expect(guest.locator('#status')).toContainText('handshake both succeeded', { timeout: 15000 });
    const report = JSON.parse(await guest.locator('#report').textContent());
    expect(report.connected).toBe(true);
    expect(report.connections[0].transport).toBe('local');
    expect(report.connections[0].localCandidates).toEqual({});
  } finally { await guest.close(); }
});

// No route at all: another storage partition (so no same-browser channel) and a browser that may only use relay servers,
// with none configured. The introduction service's relay connects it, and the report says how (resilientPeerLink.js).
test('a blocked peer in another storage partition connects through the relay, and the report says so', async ({ page, browser }) => {
  await page.goto('/share-debug.html');
  await page.click('#host');
  await expect(page.locator('#guest-link')).toBeVisible();
  const link = await page.locator('#guest-link').getAttribute('href');
  const isolated = await browser.newContext();
  try {
    await isolated.addInitScript(() => {
      const NativeConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends NativeConnection {
        constructor(config) { super({ ...config, iceServers: [], iceTransportPolicy: 'relay' }); }
      };
    });
    const guest = await isolated.newPage();
    await guest.goto(link);
    await expect(guest.locator('#status')).toContainText('Connected', { timeout: 45000 });
    const report = JSON.parse(await guest.locator('#report').textContent());
    expect(report.connected).toBe(true);
    expect(report.connections[0].remoteDescriptionReceived).toBe(true);
    expect(report.connections[0].localCandidates, 'WebRTC found no route').toEqual({});
    expect(report.connections[0].transport).toBe('relay');
    expect(report.connections[0].relayState).toBe('ready');
  } finally { await isolated.close(); }
});

test('the actual game receives the world and synchronizes edits over the local fallback', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.click('#btn-start-new-world');
  await page.click('#world-mode-creative');
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
  await page.evaluate(() => document.exitPointerLock?.());
  await page.keyboard.press('Escape');
  await page.click('#btn-host-world');
  await page.waitForFunction(() => window.game.worldSync.isHosting);
  const link = await page.inputValue('#host-share-link-input');
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
  expect(await guest.evaluate(() => window.game.worldSync.client.hostLink.mode)).toBe('local');
  await expect(page.locator('#hud-multiplayer-text')).toHaveText('Sharing: 2 players');
  const spot = await page.evaluate(() => [Math.floor(game.player.position.x) + 2, 45, Math.floor(game.player.position.z) + 2]);
  await page.evaluate(([x, y, z]) => { game.world.setVoxel(x, y, z, 4); game.worldSync.onBlockPlaced(x, y, z, 4); }, spot);
  await expect.poll(() => guest.evaluate(([x, y, z]) => game.world.getVoxel(x, y, z), spot)).toBe(4);
  await guest.evaluate(([x, y, z]) => { game.world.setVoxel(x, y, z, 0); game.worldSync.onBlockBroken(x, y, z); }, spot);
  await expect.poll(() => page.evaluate(([x, y, z]) => game.world.getVoxel(x, y, z), spot)).toBe(0);
});
