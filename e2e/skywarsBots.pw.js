// A whole SkyWars match, played by two bots in two real browsers (minecraft.wiki Tutorial:SkyWars): the host opens
// SkyWars and waits in the lobby, a friend joins with the 4-digit code, the host starts, 3-2-1, the cages open, each
// bot loots its island's chests, bridges to the middle and fights, the last one alive wins, and the host plays again.
// Everything goes through the game's own start screen, sharing, chests, block placing and attack path.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

const BLOCK_NAMES = { 10: 'oak_planks', 3: 'stone' };

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 680 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui && window.game?.playerBot, null, { timeout: 300000 });
  return { page, context };
}

const bot = (page, command) => page.evaluate((c) => window.game.playerBot.run(c), command);

/** Take everything out of this player's own island chests with the bot, then wear the armour. */
async function lootIsland(page) {
  const plan = await page.evaluate((names) => {
    const g = window.game, sw = g.skywars, slot = sw.me().slot;
    return sw.arena.chests.filter((c) => c.slot === slot).map((c) => ({
      at: [c.x, c.y, c.z],
      stacks: (g.chestManager.getChest(c.x, c.y, c.z)?.items ?? []).filter(Boolean)
        .map((s) => ({ name: typeof s.id === 'number' ? names[s.id] : s.id, count: s.count })).filter((s) => s.name),
    }));
  }, BLOCK_NAMES);
  const taken = [];
  for (const chest of plan) {
    // Several stacks of the same item go in one withdrawal.
    const totals = new Map();
    for (const s of chest.stacks) totals.set(s.name, (totals.get(s.name) ?? 0) + s.count);
    for (const [name, count] of totals) {
      const result = await bot(page, `withdraw ${count} ${name} from chest at ${chest.at.join(' ')}`);
      expect(result.ok, result.message).toBe(true);
      taken.push(name);
    }
  }
  for (const piece of taken.filter((n) => /_(helmet|chestplate|leggings|boots)$/.test(n))) {
    await bot(page, `equip ${piece}`);
  }
  return { plan, taken };
}

/** Bridge from the island to the middle, `direction` north or south, with whatever building blocks the bot has. */
async function bridgeToMiddle(page, direction) {
  const need = 15;
  let laid = 0;
  for (const name of ['oak_planks', 'stone']) {
    const have = await page.evaluate((n) => window.game.playerBot.survival.count(n), name);
    const count = Math.min(have, need - laid);
    if (count <= 0) continue;
    const result = await bot(page, `bridge ${count} ${direction} with ${name}`);
    expect(result.ok, result.message).toBe(true);
    laid += count;
    if (laid >= need) break;
  }
  return laid;
}

test('two bots play a SkyWars match from the lobby to the winner, and the host plays again', async ({ browser }) => {
  test.setTimeout(1200000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    // --- the host opens SkyWars and waits in the lobby -----------------------------------------------------
    await host.click('#btn-start-designed-world');
    await host.waitForFunction(() => /SkyWars/.test(document.getElementById('map-designed-list')?.textContent ?? ''), null, { timeout: 60000 });
    await host.locator('#map-designed-list > *', { hasText: 'SkyWars' }).first().getByRole('button').first().click();
    await host.waitForFunction(() => window.game?.skywars?.active && window.game.worldReady
      && /^[0-9]{4}$/.test(document.getElementById('skywars-code')?.textContent ?? ''), null, { timeout: 180000 });
    const code = await host.textContent('#skywars-code');
    await expect(host.locator('#skywars-start')).toBeDisabled();
    await expect(host.locator('#skywars-start-reason')).toHaveText('Waiting for at least one more player to join.');
    expect(await host.evaluate(() => ({ phase: game.skywars.phase, mode: game.player.gamemode, slot: game.skywars.me().slot })))
      .toEqual({ phase: 'lobby', mode: 'adventure', slot: 0 });

    // --- a friend joins with the code and waits in their own cage ----------------------------------------
    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady && window.game.skywars?.me()?.slot === 1, null, { timeout: 240000 });
    await expect(host.locator('#skywars-start')).toBeEnabled({ timeout: 15000 });
    await expect(host.locator('#skywars-players li')).toHaveCount(2);
    await expect.poll(() => guest.evaluate(() => {
      const p = window.game.player, s = window.game.skywars.arena.spawns[1];
      return Math.hypot(p.position.x - s.x, p.position.z - s.z) < 1 && p.gamemode === 'adventure';
    }), { timeout: 15000 }).toBe(true);
    // Nobody fights in the lobby.
    expect(await host.evaluate(() => game.worldSync.client.attackPolicy('host', 'p1'))).toBe('not_started');

    // --- the host starts: 3, 2, 1, the cages open ----------------------------------------------------------
    await host.evaluate(() => {
      window.__titles = [];
      const t = document.getElementById('skywars-title');
      new MutationObserver(() => window.__titles.push(t.textContent)).observe(t, { childList: true, characterData: true, subtree: true });
    });
    await host.click('#skywars-start');
    for (const page of [host, guest]) await page.waitForFunction(() => window.game.skywars.phase === 'playing', null, { timeout: 15000 });
    const titles = await host.evaluate(() => window.__titles);
    expect(titles.filter((t) => ['3', '2', '1', 'Fight!'].includes(t))).toEqual(['3', '2', '1', 'Fight!']);
    for (const page of [host, guest]) {
      const after = await page.evaluate(() => {
        const g = window.game, sw = g.skywars;
        const cageGlass = [0, 1].flatMap((slot) => { const s = sw.arena.spawns[slot]; return [g.world.getVoxel(Math.floor(s.x) + 1, s.y, Math.floor(s.z))]; });
        return { mode: g.player.gamemode, cageGlass };
      });
      expect(after).toEqual({ mode: 'survival', cageGlass: [0, 0] });
    }

    // --- each bot loots its own island ---------------------------------------------------------------------
    const guestLoot = await lootIsland(guest);
    const hostLoot = await lootIsland(host);
    expect(guestLoot.taken.some((n) => /_sword$/.test(n)), 'a sword on every island').toBe(true);
    expect(hostLoot.taken.some((n) => /_sword$/.test(n))).toBe(true);
    // The chests the guest emptied are empty for the host too: chest contents are shared.
    await expect.poll(() => host.evaluate((chests) => chests.every(({ at }) => (window.game.chestManager.getChest(...at)?.items ?? []).every((s) => !s)), guestLoot.plan), { timeout: 10000 }).toBe(true);

    // --- both bridge to the middle; each sees the other's bridge ------------------------------------------
    const guestBridge = await bridgeToMiddle(guest, 'north');
    const hostBridge = await bridgeToMiddle(host, 'south');
    expect(guestBridge).toBe(15);
    expect(hostBridge).toBe(15);
    await expect.poll(() => host.evaluate(() => window.game.world.getVoxel(0, 30, 15)), { timeout: 10000 }).not.toBe(0);
    await expect.poll(() => guest.evaluate(() => window.game.world.getVoxel(0, 30, -15)), { timeout: 10000 }).not.toBe(0);

    // --- they meet in the middle and fight until one is left ---------------------------------------------
    expect((await bot(host, 'go to 2.5 31 -2.5')).ok).toBe(true);
    expect((await bot(guest, 'go to 2.5 31 1.5')).ok).toBe(true);
    const hostFight = bot(host, 'fight player 60 hits').catch((e) => ({ ok: false, message: String(e) }));
    const guestFight = bot(guest, 'fight player 60 hits').catch((e) => ({ ok: false, message: String(e) }));
    await host.waitForFunction(() => window.game.skywars.phase === 'ended', null, { timeout: 180000 });
    await Promise.all([hostFight, guestFight]);
    const end = await host.evaluate(() => window.game.skywars.state);
    const winner = end.players.find((p) => p.id === end.winner);
    const loser = end.players.find((p) => p.id !== end.winner);
    expect(winner, 'one player is left').toBeTruthy();
    expect(winner.kills).toBe(1);
    expect(loser.alive).toBe(false);
    const loserPage = loser.id === 'host' ? host : guest;
    const winnerPage = loserPage === host ? guest : host;
    await expect.poll(() => loserPage.evaluate(() => window.game.player.gamemode)).toBe('spectator');
    await expect.poll(() => guest.evaluate(() => window.game.skywars.phase)).toBe('ended');
    for (const page of [host, guest]) {
      const chat = await page.evaluate(() => document.getElementById('chat-messages')?.textContent ?? '');
      expect(chat).toContain(`${loser.name} was slain by ${winner.name}`);
      await expect(page.locator('#skywars-end')).toBeVisible();
    }
    await expect(winnerPage.locator('#skywars-end h2')).toHaveText('Victory!');
    await expect(loserPage.locator('#skywars-end h2')).toHaveText(`${winner.name} won!`);
    // The loser's loot dropped where both can see it.
    await expect.poll(() => winnerPage.evaluate(() => window.game.skywars.drops.size)).toBeGreaterThan(0);
    expect(await loserPage.evaluate(() => window.game.skywars.drops.size)).toBe(await winnerPage.evaluate(() => window.game.skywars.drops.size));

    // --- play again: the islands as they were, everyone back in a cage ------------------------------------
    await host.click('#skywars-again');
    for (const page of [host, guest]) {
      await page.waitForFunction(() => window.game.skywars.phase === 'lobby' && window.game.skywars.state.round === 2, null, { timeout: 20000 });
      await expect.poll(() => page.evaluate(() => {
        const g = window.game, sw = g.skywars, s = sw.arena.spawns[sw.me().slot];
        return {
          bridges: [g.world.getVoxel(0, 30, 15), g.world.getVoxel(0, 30, -15)],
          cage: g.world.getVoxel(Math.floor(s.x) + 1, s.y, Math.floor(s.z)),
          mode: g.player.gamemode,
          inCage: Math.hypot(g.player.position.x - s.x, g.player.position.z - s.z) < 1,
          empty: [...g.inventory.hotbar, ...g.inventory.storage].every((i) => !i),
          drops: sw.drops.size,
        };
      }), { timeout: 15000 }).toEqual({ bridges: [0, 0], cage: 11, mode: 'adventure', inCage: true, empty: true, drops: 0 });
    }
    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
