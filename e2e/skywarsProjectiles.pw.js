// Arrows in a SkyWars match, two real browsers, bots shooting: an arrow that hits the other player hurts them, a kill by
// arrows is credited to the shooter -- "<player> was shot by <player>" -- and the shooter wins.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui && window.game?.playerBot, null, { timeout: 300000 });
  return { page, context };
}

test('SkyWars: arrows hurt the other player, and a kill by arrows is the shooter\'s', async ({ browser }) => {
  test.setTimeout(900000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    await host.click('#btn-start-designed-world');
    await host.waitForFunction(() => /SkyWars/.test(document.getElementById('map-designed-list')?.textContent ?? ''), null, { timeout: 60000 });
    await host.locator('#map-designed-list > *', { hasText: 'SkyWars' }).first().getByRole('button').first().click();
    await host.waitForFunction(() => /^[0-9]{4}$/.test(document.getElementById('skywars-code')?.textContent ?? ''), null, { timeout: 120000 });
    const code = await host.textContent('#skywars-code');
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady && window.game.skywars?.state, null, { timeout: 240000 });
    await host.waitForFunction(() => !document.getElementById('skywars-start').disabled, null, { timeout: 30000 });
    await host.click('#skywars-start');
    for (const page of [host, guest]) await page.waitForFunction(() => window.game.skywars.phase === 'playing', null, { timeout: 20000 });

    // Both on the middle island, 8 blocks apart, facing each other; the host with a bow and arrows.
    const middle = await host.evaluate(() => { const c = window.game.skywars.arena.islands.find((i) => i.role === 'center'); return { x: c.x + 0.5, y: c.y + 1, z: c.z + 0.5 }; });
    for (const [page, dz, yaw] of [[host, 4, 0], [guest, -4, Math.PI]]) {
      await page.evaluate(({ m, dz, yaw }) => { const p = window.game.player; p.position.set(m.x, m.y + 0.2, m.z + dz); p.velocity.set(0, 0, 0); p.yaw = yaw; p.pitch = 0; p.fallDistance = 0; }, { m: middle, dz, yaw });
    }
    await host.evaluate(() => { const inv = window.game.inventory; inv.hotbar[2] = { id: 'bow', count: 1, isBlock: false }; inv.hotbar[3] = { id: 'arrow', count: 16, isBlock: false }; window.game.ui.updateHotbar(); });
    await host.waitForTimeout(1500);

    const shoot = async () => {
      const [x, y, z] = await guest.evaluate(() => { const p = window.game.player.position; return [p.x, p.y + 1, p.z]; });
      const r = await host.evaluate((c) => window.game.playerBot.run(c), `shoot at ${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`);
      expect(r.ok, r.message).toBe(true);
    };
    await shoot();
    await expect.poll(() => guest.evaluate(() => window.game.player.health), { timeout: 10000 }).toBeLessThan(20);

    // Shot until out of the match.
    for (let i = 0; i < 8 && (await host.evaluate(() => window.game.skywars.phase)) === 'playing'; i++) {
      await host.waitForTimeout(700);
      if ((await host.evaluate(() => window.game.skywars.phase)) !== 'playing') break;
      await shoot();
    }
    await host.waitForFunction(() => window.game.skywars.phase === 'ended', null, { timeout: 20000 });
    const state = await host.evaluate(() => window.game.skywars.state);
    const hostPlayer = state.players.find((p) => p.id === 'host');
    expect(state.winner).toBe('host');
    expect(hostPlayer.kills, 'the kill is the shooter\'s').toBe(1);
    const guestName = state.players.find((p) => p.id !== 'host').name;
    await expect.poll(() => host.evaluate(() => document.getElementById('chat-messages')?.textContent ?? document.body.textContent), { timeout: 10000 })
      .toContain(`${guestName} was shot by ${hostPlayer.name}`);
    expect(await guest.evaluate(() => window.game.player.gamemode)).toBe('spectator');
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
