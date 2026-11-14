// The Bed Wars referee (agentArena/referee.mjs bedwarsReferee): a bot's inventory lives in its own process and the host
// takes its word for what it bought, so the referee lets an item in only through the game client, a purchase only at
// the team's own shopkeeper, a team upgrade only from the client's own purchase, and no explosion at all (the bot client
// has none). The game client's own buy (guestPeer.js) refuses a purchase away from the keeper too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestPeerSession, buildBedWarsArenaLayout, SHOP_REACH } from '../packages/blockyland-mcp/guestPeer.js';
import { normalizeMap, publishedPlan } from '../src/mods/bedwars/arena.js';
import { bedwarsReferee } from '../agentArena/referee.mjs';

function redSession() {
  const s = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false });
  s.clientId = 'r1';
  s.gameMode = 'bedwars';
  const map = normalizeMap({ teams: 5, layout: 'compact', seed: 1 });
  s.bedwarsArena = buildBedWarsArenaLayout(map, publishedPlan(map));
  s.bedwarsState = { phase: 'playing', mode: 'fives', map, players: [{ id: 'r1', name: 'Red1', team: 'red', alive: true }], teams: [{ id: 'red', bed: true, upgrades: {}, traps: [] }] };
  const shop = s.bedwarsArena.bases[0].shop;
  s.position = { x: shop.x + 1, y: shop.y, z: shop.z };
  const sent = [];
  s.sendPacket = (m) => { sent.push(m); return true; };
  return { s, sent, base: s.bedwarsArena.bases[0] };
}

test('the game client sells only at the team\'s own keeper', () => {
  const { s, base } = redSession();
  s.inventory.addItem('iron_ingot', false, 40);
  assert.equal(s.buyInBedWars('wool').ok, true, 'beside the item shop');
  s.position = { x: base.bed.foot[0] + 0.5, y: base.bed.foot[1], z: base.bed.foot[2] + 0.5 };
  const away = s.buyInBedWars('wool');
  assert.equal(away.ok, false, 'at the bed, 9 blocks off');
  assert.match(away.reason, new RegExp(`within ${SHOP_REACH}`));
});

test('the referee: items only through the game, purchases at the keeper, upgrades only bought, no explosions', () => {
  const { s, sent, base } = redSession();
  s.inventory.addItem('iron_ingot', false, 40);
  s.inventory.addItem('diamond', false, 10);
  const violations = [];
  bedwarsReferee('Red1', violations)(s);
  // A bot's own code adding a sword: dropped.
  assert.equal(s.inventory.addItem('diamond_sword', false, 1), false);
  assert.equal(s.inventory.countItem('diamond_sword'), 0);
  // The game client's purchase adds its item.
  assert.equal(s.buyInBedWars('wool').ok, true);
  assert.ok(s.inventory.countPlaceableBlocks() >= 16);
  // An upgrade message from the bot's own code: dropped. Bought from the keeper: sent (the diamonds taken).
  s.sendPacket({ t: 'game', data: { type: 'upgrade', key: 'sharpness' } });
  assert.equal(sent.filter((m) => m.data?.type === 'upgrade').length, 0);
  const up = base.upgrades;
  s.position = { x: up.x + 1, y: up.y, z: up.z };
  assert.equal(s.buyInBedWars('protection').ok, true);
  assert.equal(sent.filter((m) => m.data?.type === 'upgrade').length, 1);
  assert.equal(s.inventory.countItem('diamond'), 5);
  // Explosions: none.
  s.sendPacket({ t: 'game', data: { type: 'boom', kind: 'tnt', x: 0, y: 31, z: 0 } });
  assert.equal(sent.filter((m) => m.data?.type === 'boom').length, 0);
  // Away from the keepers: refused by the referee whatever the bot's own buy says.
  s.position = { x: 0.5, y: 31, z: 0.5 };
  assert.equal(s.buyInBedWars('wool').ok, false);
  const kinds = violations.map((v) => v.kind);
  assert.deepEqual([...new Set(kinds)].sort(), ['explosion', 'item', 'shop']);
  assert.ok(violations.every((v) => v.dropped));
});
