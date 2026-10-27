// Bed Wars, without a browser: the map, the rules played through whole matches, the shops, and explosions. The numbers
// checked are the Hypixel wiki's (Bed Wars article: the item shop and team upgrade tables, the 5-second respawn, the
// event timetable).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { buildArena, normalizeMap, isMapBlock, ARENA, THEME_IDS, cellKey } from '../src/mods/bedwars/arena.js';
import { BedWarsMatch, HOST_ID, EVENTS, GENERATORS, RESPAWN_SECONDS, deathMessage } from '../src/mods/bedwars/rules.js';
import { TEAMS, MODES } from '../src/mods/bedwars/teams.js';
import {
  ITEM_SHOP, UPGRADES, buy, whyNot, newKit, afterDeath, armorFor, loadoutFor, countItem, priceGroup, upgradeCost, trapCost, resourcesOf,
} from '../src/mods/bedwars/shop.js';
import { explosionCells, explosionOn, blastProof } from '../src/mods/bedwars/explosions.js';

// --- the map --------------------------------------------------------------------------------------------------------

test('every team\'s island has its bed, forge, shops, chest and spawn; diamonds between, emeralds in the middle', () => {
  for (const teams of [2, 4, 8]) {
    const arena = buildArena({ teams, theme: 'meadow', seed: 9 });
    assert.equal(arena.bases.length, teams);
    assert.equal(arena.diamonds.length, teams === 2 ? 2 : 4);
    assert.equal(arena.emeralds.length, teams === 8 ? 4 : 2, 'four emerald generators with eight teams, two otherwise (Hypixel)');
    arena.bases.forEach((base, i) => {
      const team = TEAMS[i];
      assert.equal(base.team, team.id);
      assert.equal(arena.blocks.get(cellKey(...base.bed.foot)), team.bedFoot, `${team.id} bed foot`);
      assert.equal(arena.blocks.get(cellKey(...base.bed.head)), team.bedHead, `${team.id} bed head`);
      assert.equal(arena.blocks.get(cellKey(base.chest.x, base.chest.y, base.chest.z)), BLOCKS.CHEST);
      for (const spot of [base.spawn, base.forge, base.shop, base.upgrades]) {
        assert.ok(arena.blocks.has(cellKey(Math.floor(spot.x), spot.y - 1, Math.floor(spot.z))), 'something to stand on');
        assert.ok(!arena.blocks.has(cellKey(Math.floor(spot.x), spot.y, Math.floor(spot.z))), 'and room to stand');
      }
      // The bed faces the middle.
      const toMiddle = Math.hypot(base.bed.head[0], base.bed.head[2]) < Math.hypot(base.bed.foot[0], base.bed.foot[2]);
      assert.ok(toMiddle, 'head toward the middle');
    });
    for (const g of arena.diamonds) assert.equal(arena.blocks.get(cellKey(Math.floor(g.x), g.y - 1, Math.floor(g.z))), BLOCKS.DIAMOND_BLOCK);
    for (const g of arena.emeralds) assert.equal(arena.blocks.get(cellKey(Math.floor(g.x), g.y - 1, Math.floor(g.z))), BLOCKS.EMERALD_BLOCK);
  }
});

test('islands are apart: every base must be bridged to, from the middle and from each other', () => {
  for (const teams of [2, 4, 8]) {
    const arena = buildArena({ teams, seed: 3 });
    const top = new Set();
    for (const key of arena.blocks.keys()) { const [x, y, z] = key.split(',').map(Number); if (y === ARENA.surfaceY) top.add(`${x},${z}`); }
    // From each base's spawn, walk the island's top: it never reaches the middle.
    for (const base of arena.bases) {
      const seen = new Set();
      const queue = [[Math.floor(base.spawn.x), Math.floor(base.spawn.z)]];
      while (queue.length) {
        const [x, z] = queue.pop();
        const k = `${x},${z}`;
        if (seen.has(k) || !top.has(k)) continue;
        seen.add(k);
        queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
      }
      assert.ok(!seen.has('0,0'), `${base.team} is not joined to the middle`);
      assert.ok(seen.size > 150 && seen.size < 400, `${base.team}'s island alone (${seen.size} cells)`);
    }
  }
});

test('the same map from the same teams, theme and seed; every theme builds; nonsense falls back', () => {
  const a = buildArena({ teams: 4, theme: 'desert', seed: 77 }), b = buildArena({ teams: 4, theme: 'desert', seed: 77 });
  assert.deepEqual([...a.blocks.entries()], [...b.blocks.entries()]);
  for (const theme of THEME_IDS) assert.ok(buildArena({ teams: 4, theme, seed: 1 }).blocks.size > 5000, theme);
  assert.deepEqual(normalizeMap({ teams: 3, theme: 'moon', seed: 'x' }), { teams: 4, theme: 'meadow', seed: 2017 });
});

// --- the match ------------------------------------------------------------------------------------------------------

/** A match with players in it, started and playing. */
function playing({ mode = 'solo', players = ['host', 'p1'], pace = 'normal' } = {}) {
  let n = 0;
  const m = new BedWarsMatch({ mode, pace, seed: 1, random: () => ((n++ * 0.37) % 1) });
  for (const id of players) m.join(id, id === 'host' ? 'Hosty' : id);
  assert.equal(m.start(HOST_ID).ok, true);
  m.update(10);
  assert.equal(m.phase, 'playing');
  m.drainEvents();
  return m;
}

test('the lobby: players fill the teams evenly, may pick another with room, and the host starts once two teams have someone', () => {
  const m = new BedWarsMatch({ mode: 'doubles', seed: 1 });
  m.join('host', 'Hosty');
  assert.equal(m.canStart(HOST_ID).ok, false);
  m.join('p1', 'P1');
  assert.notEqual(m.players.get('p1').team, m.players.get('host').team, 'spread out');
  assert.equal(m.chooseTeam('p1', m.players.get('host').team), true, 'two to a team in Doubles');
  assert.equal(m.canStart(HOST_ID).reason, 'Everyone is on one team: at least two teams need a player.');
  m.join('p2', 'P2');
  assert.equal(m.chooseTeam('p2', 'red'), false, 'red is full');
  assert.equal(m.canStart('p1').ok, false, 'only the host');
  assert.equal(m.canStart(HOST_ID).ok, true);
  assert.equal(m.setMode(HOST_ID, 'duel'), true);
  assert.equal(m.map.teams, 2);
  assert.deepEqual([...new Set([...m.players.values()].map((p) => p.team))].sort(), ['blue', 'red']);
});

test('generators: iron and gold at each forge, diamonds every 30 s, emeralds every 65 s, each up to its cap', () => {
  const m = playing();
  m.update(30.01);
  const forge = m.gens.find((g) => g.id === 'f-red');
  assert.equal(forge.stock.iron, 20, 'iron every 1.5 s');
  assert.equal(forge.stock.gold, 5, 'gold every 6 s');
  assert.equal(m.gens.find((g) => g.kind === 'diamond').stock.diamond, 1);
  assert.equal(m.gens.find((g) => g.kind === 'emerald').stock.emerald, 0);
  m.update(40);
  assert.equal(m.gens.find((g) => g.kind === 'emerald').stock.emerald, 1);
  m.update(600);
  assert.equal(forge.stock.iron, GENERATORS.iron.cap);
  assert.equal(m.gens.find((g) => g.kind === 'diamond').stock.diamond, GENERATORS.diamond.cap);
  // An empty team's forge makes nothing.
  assert.equal(m.gens.find((g) => g.id === 'f-yellow').stock.iron, 0);
});

test('picking up: the whole pile; a teammate standing on the forge gets the iron and gold too', () => {
  const m = playing({ mode: 'doubles', players: ['host', 'p1', 'p2'] });
  m.players.get('p2').team = 'red';
  m.update(3.01);
  const grants = m.collect('host', 'f-red', (id) => id === 'p2');
  assert.deepEqual(grants.map((g) => g.id), ['host', 'p2']);
  assert.equal(grants[0].items.iron, 2);
  assert.equal(grants[1].items.iron, 2);
  assert.deepEqual(m.collect('host', 'f-red'), [], 'nothing left');
  assert.deepEqual(m.collect('p1', 'nope'), []);
});

test('a death with the bed standing: back in 5 seconds, the killer credited and given what was carried', () => {
  const m = playing();
  m.hit('p1', 'host');
  const result = m.died('host', 'player', { iron: 12, gold: 3, diamond: 0, emerald: 1 });
  assert.equal(result.final, false);
  const events = m.drainEvents();
  assert.equal(events[0].message, 'Hosty was killed by p1.');
  assert.deepEqual(events[1], { kind: 'grant', id: 'p1', items: { iron: 12, gold: 3, emerald: 1 }, from: 'Hosty' });
  assert.equal(m.players.get('p1').kills, 1);
  assert.equal(m.canAttack('p1', 'host'), 'spectator', 'not while dead');
  m.update(RESPAWN_SECONDS - 0.1);
  assert.equal(m.players.get('host').dead, true);
  m.update(0.2);
  assert.equal(m.players.get('host').dead, false);
  assert.deepEqual(m.drainEvents().filter((e) => e.kind === 'respawn'), [{ kind: 'respawn', id: 'host' }]);
});

test('beds: an enemy breaks one, not its own team; then the next death is a FINAL KILL and the last team wins', () => {
  const m = playing();
  const hostTeam = m.players.get('host').team, p1Team = m.players.get('p1').team;
  assert.equal(m.bedBroken(hostTeam, 'host'), false, 'not your own');
  assert.equal(m.bedBroken(hostTeam, 'p1'), true);
  assert.equal(m.bedBroken(hostTeam, 'p1'), false, 'once');
  const [bed] = m.drainEvents();
  assert.equal(bed.message, `BED DESTRUCTION > ${TEAMS.find((t) => t.id === hostTeam).name} Bed was destroyed by p1!`);
  assert.equal(m.players.get('p1').beds, 1);
  m.hit('p1', 'host');
  assert.equal(m.died('host', 'void').final, true);
  const events = m.drainEvents();
  assert.equal(events[0].message, 'Hosty was knocked into the void by p1. FINAL KILL!');
  assert.ok(events.some((e) => e.kind === 'team_out' && e.team === hostTeam));
  assert.deepEqual(events.find((e) => e.kind === 'end'), { kind: 'end', winner: p1Team, reason: 'last_team' });
  assert.equal(m.players.get('p1').finalKills, 1);
});

test('no friendly fire: teammates cannot hurt each other, enemies can', () => {
  const m = playing({ mode: 'doubles', players: ['host', 'p1', 'p2'] });
  m.players.get('p2').team = m.players.get('host').team;
  assert.equal(m.canAttack('host', 'p2'), 'teammate');
  assert.equal(m.canAttack('host', 'p1'), null);
});

test('the timetable: Diamond II at 6:00 … Bed Destruction at 30:00, the game over at 50:00; the fast pace halves it', () => {
  assert.deepEqual(EVENTS.map((e) => [e.label, e.at]), [
    ['Diamond II', 360], ['Emerald II', 720], ['Diamond III', 1080], ['Emerald III', 1440], ['Bed Destruction', 1800], ['Sudden Death', 2400], ['Game End', 3000],
  ]);
  const m = playing({ pace: 'fast' });
  m.update(180.1);
  assert.equal(m.gens.find((g) => g.kind === 'diamond').tier, 2);
  assert.equal(m.snapshot().next.label, 'Emerald II');
  m.update(720);
  assert.ok([...m.teams.values()].every((t) => !t.bed), 'every bed gone');
  m.update(700);
  assert.equal(m.phase, 'ended');
  assert.equal(m.endReason, 'time');
});

test('team upgrades go up a tier at a time to their maximum; the forge speeds the base\'s generator', () => {
  const m = playing();
  const team = m.teams.get(m.players.get('host').team);
  assert.equal(m.buyUpgrade('host', 'forge'), 1);
  assert.equal(m.drainEvents()[0].cost, 2, 'Iron Forge: 2 diamonds in Solo');
  for (let i = 0; i < 3; i++) m.buyUpgrade('host', 'forge');
  assert.equal(m.buyUpgrade('host', 'forge'), null, 'Molten Forge is the last');
  assert.equal(team.upgrades.forge, 4);
  m.update(3.01);
  assert.equal(m.gens.find((g) => g.id === `f-${team.id}`).stock.iron, 6, 'Molten Forge: +200%');
  m.update(60);
  assert.ok(m.gens.find((g) => g.id === `f-${team.id}`).stock.emerald >= 1, 'Emerald Forge: emeralds at the base');
});

test('traps: three at most, fired one at a time on the first enemy in the base, not on one who drank Magic Milk', () => {
  const m = playing();
  const team = m.players.get('host').team;
  for (const t of ['its_a_trap', 'miner', 'alarm']) assert.equal(m.buyTrap('host', t), true);
  assert.equal(m.buyTrap('host', 'counter'), false, 'the queue holds three');
  assert.deepEqual(m.drainEvents().map((e) => e.cost), [1, 2, 4]);
  const inBase = (id, t) => id === 'p1' && t === team;
  m.checkTraps(inBase, () => true);
  assert.equal(m.drainEvents().length, 0, 'milk');
  m.checkTraps(inBase);
  const [fired] = m.drainEvents();
  assert.deepEqual([fired.trap, fired.intruder], ['its_a_trap', 'p1']);
  m.checkTraps(inBase);
  assert.equal(m.drainEvents().length, 0, 'not again at once');
  m.update(10.1);
  m.checkTraps(inBase);
  assert.equal(m.drainEvents()[0].trap, 'miner');
});

test('a player who leaves mid-game is out; play again puts everyone back in the lobby on a fresh map', () => {
  const m = playing();
  m.leave('p1');
  assert.equal(m.phase, 'ended');
  const seed = m.map.seed;
  assert.equal(m.reset(HOST_ID), true);
  assert.equal(m.phase, 'lobby');
  assert.notEqual(m.map.seed, seed);
  assert.deepEqual([...m.players.keys()], ['host']);
});

test('death messages read as Hypixel\'s', () => {
  assert.equal(deathMessage('A', 'B', 'player'), 'A was killed by B.');
  assert.equal(deathMessage('A', 'B', 'void', true), 'A was knocked into the void by B. FINAL KILL!');
  assert.equal(deathMessage('A', null, 'void'), 'A fell into the void.');
  assert.equal(deathMessage('A', 'B', 'explosion'), 'A was blown up by B.');
});

// --- the shops --------------------------------------------------------------------------------------------------------

function inventory(resources = {}) {
  const inv = { hotbar: new Array(9).fill(null), storage: new Array(27).fill(null),
    addItem(item) { const free = [...this.hotbar.keys()].map((i) => ['hotbar', i]).concat([...this.storage.keys()].map((i) => ['storage', i])).find(([l, i]) => !this[l][i]); if (!free) return false; this[free[0]][free[1]] = { ...item }; return true; } };
  const ids = { iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', emerald: 'emerald' };
  for (const [r, n] of Object.entries(resources)) inv.addItem({ id: ids[r], count: n, isBlock: false });
  return inv;
}

test('the item shop\'s prices are the wiki\'s, the dearer ones in the four-team modes', () => {
  const price = (key, group = 'small') => ITEM_SHOP.find((e) => e.key === key).price[group];
  assert.deepEqual(price('wool'), { iron: 4 });
  assert.deepEqual(price('clay'), { iron: 12 });
  assert.deepEqual(price('end_stone'), { iron: 24 });
  assert.deepEqual(price('obsidian'), { emerald: 4 });
  assert.deepEqual(price('iron_sword'), { gold: 7 });
  assert.deepEqual(price('diamond_sword', 'small'), { emerald: 4 });
  assert.deepEqual(price('diamond_sword', 'large'), { emerald: 3 });
  assert.deepEqual(price('iron_armor'), { gold: 12 });
  assert.deepEqual(price('tnt', 'large'), { gold: 8 });
  assert.deepEqual(price('pearl'), { emerald: 4 });
  assert.deepEqual(price('tower'), { iron: 24 });
  assert.deepEqual(UPGRADES.protection.large, [5, 10, 20, 30]);
  assert.equal(upgradeCost('sharpness', 1, 'small'), 4);
  assert.equal(upgradeCost('sharpness', 1, 'large'), 8);
  assert.deepEqual([0, 1, 2, 3].map(trapCost), [1, 2, 4, null]);
  assert.equal(priceGroup('doubles'), 'small');
  assert.equal(priceGroup('fours'), 'large');
});

test('buying: wool in the team\'s colour, a sword in place of the wooden one, armour and tools for good', () => {
  const red = TEAMS[0];
  const inv = inventory({ iron: 100, gold: 20 });
  inv.addItem({ id: 'wooden_sword', count: 1, isBlock: false });
  const kit = newKit();
  const ctx = { inv, kit, team: red, group: 'small', mode: 'solo' };
  const shop = (key) => buy(ITEM_SHOP.find((e) => e.key === key), ctx);
  assert.equal(shop('wool').ok, true);
  assert.equal(countItem(inv, red.wool), 16);
  assert.equal(countItem(inv, 'iron_ingot'), 96);
  assert.equal(shop('stone_sword').ok, true);
  assert.equal(countItem(inv, 'wooden_sword'), 0);
  assert.equal(countItem(inv, 'stone_sword'), 1);
  assert.equal(shop('chain_armor').kitChanged, true);
  assert.equal(shop('chain_armor').reason, 'Already owned');
  assert.equal(shop('pickaxe').ok, true);
  assert.equal(shop('pickaxe').ok, true);
  assert.equal(kit.pickaxe, 2);
  assert.deepEqual(resourcesOf(inv), { iron: 42, gold: 20, diamond: 0, emerald: 0 });
  assert.equal(shop('diamond_armor').reason, 'Not enough resources');
  assert.equal(whyNot(ITEM_SHOP.find((e) => e.key === 'obsidian'), { inv, kit, group: 'large', mode: 'duel' }), 'Not sold in this mode');
  const egg = (() => { shop('bridge_egg'); return [...inv.hotbar, ...inv.storage].find((s) => s?.id === 'egg'); })();
  assert.equal(egg, undefined, 'no emeralds for one');
  inv.addItem({ id: 'emerald', count: 1, isBlock: false });
  shop('bridge_egg');
  assert.deepEqual(([...inv.hotbar, ...inv.storage].find((s) => s?.id === 'egg')), { id: 'egg', isBlock: false, bedwars: 'bridge_egg', count: 1, customName: 'Bridge Egg' });
});

test('death keeps the armour and shears and drops each tool a tier, never below wood; the loadout follows the kit', () => {
  const kit = { armor: 2, pickaxe: 3, axe: 1, shears: true };
  assert.deepEqual(afterDeath(kit), { armor: 2, pickaxe: 2, axe: 1, shears: true });
  const items = loadoutFor(afterDeath(kit), { sharpness: 1 });
  assert.deepEqual(items.map((i) => i.id), ['wooden_sword', 'iron_pickaxe', 'wooden_axe', 'shears']);
  assert.deepEqual(items[0].enchantments, [{ id: 'sharpness', level: 1 }], 'Sharpened Swords');
  assert.ok(items[2].enchantments.some((e) => e.id === 'sharpness'), 'and axes');
  const armor = armorFor(kit, { protection: 2, cushioned: 1 });
  assert.deepEqual([armor.head.id, armor.chest.id, armor.legs.id, armor.feet.id], ['leather_helmet', 'leather_chestplate', 'iron_leggings', 'iron_boots']);
  assert.deepEqual(armor.legs.enchantments, [{ id: 'protection', level: 2 }]);
  assert.deepEqual(armor.feet.enchantments, [{ id: 'protection', level: 2 }, { id: 'feather_falling', level: 1 }]);
});

// --- explosions -------------------------------------------------------------------------------------------------------

test('TNT and fireballs break only what players placed, and not glass, end stone or obsidian', () => {
  const placed = new Map([['0,31,0', BLOCKS.RED_WOOL], ['1,31,0', BLOCKS.END_STONE], ['0,31,1', BLOCKS.RED_STAINED_GLASS], ['-1,31,0', BLOCKS.OAK_PLANKS], ['0,32,0', BLOCKS.OBSIDIAN]]);
  const map = new Map([['0,30,0', BLOCKS.GRASS]]);
  const get = (x, y, z) => placed.get(`${x},${y},${z}`) ?? map.get(`${x},${y},${z}`) ?? BLOCKS.AIR;
  const cells = explosionCells({ x: 0.5, y: 31.5, z: 0.5 }, 'tnt', get, (x, y, z) => placed.has(`${x},${y},${z}`));
  assert.deepEqual(cells.map((c) => c.join(',')).sort(), ['-1,31,0', '0,31,0']);
  assert.ok(blastProof(BLOCKS.WHITE_STAINED_GLASS) && blastProof(BLOCKS.GLASS) && !blastProof(BLOCKS.RED_WOOL));
  assert.ok(Object.values(BLOCKS).filter((id) => BLOCK_DEFS[id]?.bed).every((id) => explosionCells({ x: 0.5, y: 0.5, z: 0.5 }, 'tnt', () => id, () => true).length === 0), 'never a bed');
});

test('an explosion hurts an enemy, its thrower half as much, a teammate not at all, and pushes all of them', () => {
  const center = { x: 0, y: 31, z: 0 };
  const enemy = explosionOn(center, { x: 1, y: 30.5, z: 0 }, 'tnt', 'enemy');
  const self = explosionOn(center, { x: 1, y: 30.5, z: 0 }, 'tnt', 'self');
  const mate = explosionOn(center, { x: 1, y: 30.5, z: 0 }, 'tnt', 'teammate');
  assert.ok(enemy.damage > 3);
  assert.ok(self.damage > 0 && Math.abs(self.damage - enemy.damage / 2) <= 0.5, 'half, to the half heart');
  assert.equal(mate.damage, 0);
  assert.ok(mate.velocity.x > 0 && mate.velocity.y > 0, 'pushed away and up');
  assert.equal(explosionOn(center, { x: 20, y: 31, z: 0 }, 'tnt', 'enemy'), null);
  const fire = explosionOn(center, { x: 0.5, y: 30, z: 0 }, 'fireball', 'self');
  assert.ok(fire.velocity.y > 7, 'a fireball jump');
});

test('the modes are Hypixel\'s queues', () => {
  assert.deepEqual(Object.values(MODES).map((m) => [m.name, m.teams, m.size]), [['Solo', 8, 1], ['Doubles', 8, 2], ['3v3v3v3', 4, 3], ['4v4v4v4', 4, 4], ['4v4', 2, 4]]);
  assert.ok(isMapBlock(buildArena({ teams: 2, seed: 1 }), 0, ARENA.surfaceY, 0));
});
