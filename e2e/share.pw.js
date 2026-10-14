// Sharing a world, the way a host and a friend do it: a link, a click, and they are playing together.
//
// Two separate browser contexts (so separate storage, like two computers), the real introduction service running inside
// the game's dev server, and a real WebRTC connection between the pages. Nothing in the session is faked.
import { test, expect } from '@playwright/test';

test.describe('sharing a world with a link', () => {
  test.describe.configure({ mode: 'serial' });
  const errors = [];
  let host;
  let hostContext;
  let link;
  const guests = [];

  /** A page with the game loaded, with errors collected. */
  async function open(browser, url = '/') {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${url}: ${e.message}`));
    await page.goto(url, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.game?.worldSync && window.game?.inventory && window.game?.ui, null, { timeout: 300000 });
    return { page, context };
  }

  async function waitForJoined(page) {
    await page.waitForFunction(() => window.game?.worldSync?.isJoined && window.game?.worldReady
      && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 300000 });
  }

  test.afterAll(async () => {
    for (const g of guests) await g.context.close().catch(() => {});
    await hostContext?.close().catch(() => {});
  });

  test('SHARE-01 a host starts sharing from the pause menu and gets a link', async ({ browser }) => {
    ({ page: host, context: hostContext } = await open(browser));
    await host.evaluate(async () => {
      const g = window.game;
      g.applyWorldSettings({ gameMode: 'creative' });
      g.world.reseed(4242, 'plains');
      await g.generateNewWorld();
      document.getElementById('start-overlay').style.display = 'none';
      // A block the guest should find, placed near where the host stands.
      const p = g.player.position;
      window.__marker = [Math.floor(p.x) + 3, 40, Math.floor(p.z) + 3];
      g.world.setVoxel(...window.__marker, 5);
    });
    // The pause menu button, as a player would press it.
    await host.evaluate(() => document.getElementById('btn-host-world').click());
    await expect(host.locator('#host-world-modal')).not.toHaveClass(/hidden/);
    link = await host.inputValue('#host-share-link-input');
    expect(link, 'the link is the game\'s own address with a world code').toMatch(/^http:\/\/127\.0\.0\.1:3025\/\?join=[0-9a-z]{8}$/);
    expect(await host.textContent('#host-room-id-badge')).toBe(new URL(link).searchParams.get('join'));
    await expect(host.locator('#host-error')).toHaveClass(/hidden/);
    await expect(host.locator('#hud-multiplayer-text')).toHaveText('Sharing: 1 player');
  });

  test('SHARE-02 a friend opens the link and is in the host\'s world, with no other step', async ({ browser }) => {
    const guest = await open(browser, link);
    guests.push(guest);
    await waitForJoined(guest.page);
    const state = await guest.page.evaluate(() => {
      const g = window.game;
      const session = g.worldSync.client;
      return {
        chunks: g.world.chunks.size,
        phase: g.lifecycle.phase,
        connection: session.hostLink?.pc?.connectionState,
        introductionClosed: session.signaling === null,
        peers: [...session.peers.values()].map((p) => ({ name: p.name, host: p.isHost })),
        startScreenHidden: document.getElementById('start-overlay').style.display === 'none',
        avatars: g.worldSync.remotePlayers.remotePlayers.size,
        badge: document.getElementById('hud-multiplayer-text').textContent,
      };
    });
    const timings = await guest.page.evaluate(() => window.game.worldSync.joinTimings);
    console.log('JOIN TIMINGS', JSON.stringify(timings));
    expect(state.chunks, 'the world arrived').toBeGreaterThan(20);
    expect(state.phase, 'and is running').toBe('ready');
    expect(state.connection, 'over a direct WebRTC connection').toBe('connected');
    expect(state.introductionClosed, 'the introduction service is no longer used').toBe(true);
    expect(state.peers.length).toBe(2);
    expect(state.peers.some((p) => p.host)).toBe(true);
    expect(state.startScreenHidden).toBe(true);
    expect(state.avatars, 'the host is visible').toBe(1);
    expect(state.badge).toBe('Joined: 2 players');

    // The block the host placed before sharing is in the guest's copy of the world.
    console.log('HOST SNAPSHOT TIMINGS', JSON.stringify(await host.evaluate(() => window.game.worldSync.snapshotTimings)));
    const marker = await host.evaluate(() => window.__marker);
    const found = await guest.page.evaluate((m) => window.game.world.getVoxel(...m), marker);
    expect(found, 'the host\'s world is the guest\'s world').toBe(5);

    await expect(host.locator('#hud-multiplayer-text')).toHaveText('Sharing: 2 players');
    const health = await (await host.request.get('/api/share/health')).json();
    expect(health.guests, 'nobody is waiting on the introduction service: the two browsers talk directly').toBe(0);
    expect(health.rooms).toBe(1);
  });

  test('SHARE-03 blocks placed by either player appear for the other', async () => {
    const guest = guests[0].page;
    const [x, y, z] = await host.evaluate(() => { const [mx, , mz] = window.__marker; return [mx + 2, 41, mz + 2]; });
    // The host places a block, through the same hook the game's own placing calls.
    await host.evaluate(([bx, by, bz]) => { window.game.world.setVoxel(bx, by, bz, 7); window.game.worldSync.onBlockPlaced(bx, by, bz, 7); }, [x, y, z]);
    await expect.poll(() => guest.evaluate(([bx, by, bz]) => window.game.world.getVoxel(bx, by, bz), [x, y, z]), { timeout: 10000 }).toBe(7);
    // The guest breaks it.
    await guest.evaluate(([bx, by, bz]) => { window.game.world.setVoxel(bx, by, bz, 0); window.game.worldSync.onBlockBroken(bx, by, bz); }, [x, y, z]);
    await expect.poll(() => host.evaluate(([bx, by, bz]) => window.game.world.getVoxel(bx, by, bz), [x, y, z]), { timeout: 10000 }).toBe(0);
  });

  test('SHARE-04 chat and movement are shared, and nothing typed becomes markup', async () => {
    const guest = guests[0].page;
    await guest.evaluate(() => {
      const ui = window.game.ui;
      ui.chatInput.value = 'hello <img src=x onerror=window.__pwned=1> from the guest';
      ui.chatInput.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
    });
    await expect.poll(() => host.evaluate(() => document.getElementById('chat-messages').textContent), { timeout: 10000 }).toContain('from the guest');
    const html = await host.evaluate(() => document.getElementById('chat-messages').innerHTML);
    expect(html, 'the host received the text as text').toContain('&lt;img');
    expect(await host.evaluate(() => window.__pwned), 'and nothing ran').toBeUndefined();

    // The guest walks; the host sees the avatar move.
    await guest.evaluate(() => { window.game.player.position.set(window.game.player.position.x + 5, 60, window.game.player.position.z); });
    await expect.poll(() => host.evaluate(() => {
      const avatars = [...window.game.worldSync.remotePlayers.remotePlayers.values()];
      return avatars.length === 1 ? Math.round(avatars[0].targetPos.x - window.game.player.position.x) : null;
    }), { timeout: 10000 }).toBeGreaterThanOrEqual(3);
  });

  test('SHARE-05 a second friend joins with the same link, and everyone sees everyone', async ({ browser }) => {
    const second = await open(browser, link);
    guests.push(second);
    await waitForJoined(second.page);
    await expect(host.locator('#hud-multiplayer-text')).toHaveText('Sharing: 3 players');
    // The newcomer sees both the host and the first friend; the first friend is told about the newcomer.
    expect(await second.page.evaluate(() => window.game.worldSync.remotePlayers.remotePlayers.size)).toBe(2);
    await expect.poll(() => guests[0].page.evaluate(() => window.game.worldSync.remotePlayers.remotePlayers.size), { timeout: 10000 }).toBe(2);
    const names = await host.evaluate(() => [...document.getElementById('host-connected-players-list').children].map((r) => r.children[0].textContent));
    expect(names.length).toBe(3);
    // A block placed by one friend reaches the other, through the host.
    await guests[0].page.evaluate(() => { window.game.world.setVoxel(1, 50, 1, 9); window.game.worldSync.onBlockPlaced(1, 50, 1, 9); });
    await expect.poll(() => second.page.evaluate(() => window.game.world.getVoxel(1, 50, 1)), { timeout: 10000 }).toBe(9);
  });

  test('SHARE-06 a friend who leaves is gone for everyone, and the others carry on', async () => {
    await guests[1].page.evaluate(() => document.getElementById('btn-title-screen').click());
    await expect(host.locator('#hud-multiplayer-text')).toHaveText('Sharing: 2 players', { timeout: 15000 });
    await expect.poll(() => guests[0].page.evaluate(() => window.game.worldSync.remotePlayers.remotePlayers.size), { timeout: 10000 }).toBe(1);
    expect(await guests[1].page.evaluate(() => window.game.worldSync.isJoined)).toBe(false);
  });

  test('SHARE-07 a link to a world that is not being shared says so, and offers the way back', async ({ browser }) => {
    const stranger = await open(browser, '/?join=zzzzzzzz');
    guests.push(stranger);
    await expect(stranger.page.locator('#join-status-text')).toContainText('not being shared right now', { timeout: 30000 });
    await expect(stranger.page.locator('#btn-join-cancel')).toBeVisible();
    await expect(stranger.page.locator('#btn-join-cancel')).toHaveText('Back to Main');
  });

  test('SHARE-08 a link with a damaged code says so too', async ({ browser }) => {
    const broken = await open(browser, '/?join=oops');
    guests.push(broken);
    await expect(broken.page.locator('#join-status-text')).toContainText('valid world code', { timeout: 30000 });
  });

  test('SHARE-09 when the host closes the world, the friends are told', async () => {
    await host.evaluate(() => document.getElementById('btn-title-screen').click());
    await expect(guests[0].page.locator('#join-status-text')).toContainText('closed', { timeout: 20000 });
    await expect(guests[0].page.locator('#btn-join-cancel')).toBeVisible();
    expect(await host.evaluate(() => window.game.worldSync.isHosting)).toBe(false);
    const health = await (await host.request.get('/api/share/health')).json();
    expect(health.rooms, 'the room is gone from the introduction service').toBe(0);
  });

  test('SHARE-10 nothing raised an error', async () => {
    expect(errors).toEqual([]);
  });
});
