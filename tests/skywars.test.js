// SkyWars against minecraft.wiki Tutorial:SkyWars and Hypixel's SkyWars rules: the islands, the loot, the lobby, the
// 3-2-1 start, kills and the void, refills, the time limit, and playing again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, buildArena, allCageCells, arenaDifferences, cellKey, DEFAULT_MAP } from '../src/mods/skywars/arena.js';
import { rollIslandLoot, rollCenterChest, fillChests, armorPoints, MODES } from '../src/mods/skywars/loot.js';
import { SkyWarsMatch, deathMessage, HOST_ID, COUNTDOWN_SECONDS, REFILL_TIMES, TIME_LIMIT_SECONDS, KILL_CREDIT_SECONDS } from '../src/mods/skywars/rules.js';
import { seededRandom } from '../src/mods/skywars/arena.js';
import { BLOCKS } from '../src/blocks.js';
import { sanitizeGameData, sanitizeContainer } from '../src/multiplayer/shareProtocol.js';
import manifest from '../src/mods/skywars/manifest.js';

// The default map (Classic Ring in the Meadow pack); every template and pack is checked in skywarsMaps.test.js.
const arena = buildArena(DEFAULT_MAP);
const spawnIslands = arena.islands.filter((i) => i.role === 'spawn');
const centerIsland = arena.islands.find((i) => i.role === 'center');

// --- the map ---------------------------------------------------------------------------------------------------

test('map: "each player starts off on a separate island that is floating in the void"', () => {
  assert.equal(spawnIslands.length, ARENA.maxPlayers, 'one island per player');
  for (const c of spawnIslands) {
    assert.equal(arena.blocks.get(cellKey(c.x, c.y, c.z)), BLOCKS.GRASS, 'grass on top');
    // The void: nothing at all under the island's bottom, down to the world floor.
    let lowest = c.y;
    while (arena.blocks.has(cellKey(c.x, lowest - 1, c.z))) lowest--;
    for (let y = 0; y < lowest; y++) assert.equal(arena.blocks.has(cellKey(c.x, y, c.z)), false);
    assert.ok(lowest > 10, 'floating high above the void');
  }
  // Islands are apart: open air between a spawn island and the middle that has to be bridged.
  const north = spawnIslands[0];
  for (let z = north.z + north.radius + 2; z < -centerIsland.radius - 2; z++) {
    assert.equal(arena.blocks.has(cellKey(0, ARENA.surfaceY, z)), false, `gap at z=${z}`);
  }
});

test('map: a larger middle island with an enchanting table and an anvil', () => {
  assert.ok(centerIsland.radius > spawnIslands[0].radius);
  assert.equal(arena.blocks.get(cellKey(...arena.enchantingTables[0])), BLOCKS.ENCHANTING_TABLE);
  assert.equal(arena.blocks.get(cellKey(...arena.anvils[0])), BLOCKS.ANVIL);
  assert.equal(arena.chests.filter((c) => c.kind === 'center').length, 4);
});

test('map: three chests on every spawn island (Hypixel), each a chest block on the island', () => {
  for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
    const chests = arena.chests.filter((c) => c.slot === slot);
    assert.equal(chests.length, 3);
    for (const c of chests) {
      assert.equal(arena.blocks.get(cellKey(c.x, c.y, c.z)), BLOCKS.CHEST);
      assert.equal(arena.blocks.has(cellKey(c.x, c.y - 1, c.z)), true, 'standing on the island');
    }
  }
});

test('map: each spawn is inside a closed glass cage on its island, facing the middle', () => {
  for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
    const spot = arena.spawns[slot];
    const x = Math.floor(spot.x), z = Math.floor(spot.z), y = spot.y;
    assert.equal(arena.blocks.has(cellKey(x, y - 1, z)), true, 'floor under the spawn');
    assert.equal(arena.blocks.has(cellKey(x, y, z)) || arena.blocks.has(cellKey(x, y + 1, z)), false, 'room to stand');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const h of [0, 1]) assert.equal(arena.blocks.get(cellKey(x + dx, y + h, z + dz)), BLOCKS.GLASS, 'walled in');
    }
    assert.equal(arena.blocks.get(cellKey(x, y + 3, z)), BLOCKS.GLASS, 'roofed');
    assert.ok(arena.cages[slot].every(([cx, cy, cz]) => arena.blocks.get(cellKey(cx, cy, cz)) === BLOCKS.GLASS));
    // Facing the middle: forward is (-sin yaw, -cos yaw).
    const forward = [-Math.sin(spot.yaw), -Math.cos(spot.yaw)];
    assert.ok(forward[0] * -spot.x + forward[1] * -spot.z > 0, `slot ${slot} faces the middle`);
  }
});

test('map: two players start on opposite islands, north and south, so a straight bridge meets in the middle', () => {
  const [a, b] = [arena.spawns[0], arena.spawns[1]];
  assert.ok(Math.abs(a.x - 0.5) < 1e-9 && a.z < -20, 'slot 0 due north');
  assert.ok(Math.abs(b.x - 0.5) < 1e-9 && b.z > 20, 'slot 1 due south');
  assert.equal(a.z, 1 - b.z, 'as far out as each other');
});

test('map: the arena is the same for every seed\'s host and guest, and a changed world is found and restored', () => {
  assert.deepEqual([...buildArena(DEFAULT_MAP).blocks], [...buildArena(DEFAULT_MAP).blocks]);
  const world = new Map(arena.blocks);
  const get = (x, y, z) => world.get(cellKey(x, y, z)) ?? BLOCKS.AIR;
  assert.equal(arenaDifferences(arena, get).length, 0);
  world.set(cellKey(0, ARENA.surfaceY + 1, -14), BLOCKS.OAK_PLANKS); // a bridge block
  world.delete(cellKey(0, ARENA.surfaceY, 0)); // a broken block
  for (const cell of arena.cages[0]) world.delete(cellKey(...cell)); // an opened cage
  const diff = arenaDifferences(arena, get);
  assert.equal(diff.length, 2 + arena.cages[0].length);
  assert.deepEqual(diff.find(([x, y, z]) => x === 0 && y === ARENA.surfaceY + 1 && z === -14), [0, ARENA.surfaceY + 1, -14, BLOCKS.AIR]);
  assert.equal(allCageCells(arena).length, 8 * arena.cages[0].length);
});

// --- loot ------------------------------------------------------------------------------------------------------

const ROLLS = 300;
const swordsOf = (stacks) => stacks.filter((s) => /_sword$/.test(s.id));
const blocksOf = (stacks) => stacks.filter((s) => s.isBlock && (s.id === BLOCKS.OAK_PLANKS || s.id === BLOCKS.STONE));

test('loot, Normal: leather or iron armor worth 1 to 15 points, on every island', () => {
  const random = seededRandom(7);
  for (let i = 0; i < ROLLS; i++) {
    const loot = rollIslandLoot('normal', random);
    const armor = loot.filter((s) => /_(helmet|chestplate|leggings|boots)$/.test(s.id));
    assert.ok(armor.every((s) => /^(leather|iron)_/.test(s.id)), 'leather or iron');
    const points = armorPoints(armor);
    assert.ok(points >= 1 && points <= 15, `points ${points}`);
  }
});

test('loot, Normal: 1 to 3 swords -- stone, stone Sharpness I, or iron', () => {
  const random = seededRandom(8);
  const seen = new Set();
  for (let i = 0; i < ROLLS; i++) {
    const swords = swordsOf(rollIslandLoot('normal', random));
    assert.ok(swords.length >= 1 && swords.length <= 3);
    for (const s of swords) {
      const kind = `${s.id}${s.enchantments ? `+${s.enchantments.map((e) => `${e.id}${e.level}`).join()}` : ''}`;
      assert.ok(['stone_sword', 'stone_sword+sharpness1', 'iron_sword'].includes(kind), kind);
      seen.add(kind);
    }
  }
  assert.equal(seen.size, 3, 'all three appear');
});

test('loot: planks and stone, 8 to 16 in a slot -- enough on every island to bridge to the middle', () => {
  for (const mode of MODES) {
    const random = seededRandom(9);
    for (let i = 0; i < ROLLS; i++) {
      const stacks = blocksOf(rollIslandLoot(mode, random));
      assert.ok(stacks.length >= 2);
      assert.ok(stacks.every((s) => s.count >= 8 && s.count <= 16));
      const total = stacks.reduce((n, s) => n + s.count, 0);
      assert.ok(total >= 16, `only ${total} blocks`); // the widest gap on any map is checked against this (skywarsMaps.test.js)
    }
  }
});

test('loot, Insane: at least three pieces of iron or diamond armor, 9 to 20 points', () => {
  const random = seededRandom(10);
  for (let i = 0; i < ROLLS; i++) {
    const armor = rollIslandLoot('insane', random).filter((s) => /_(helmet|chestplate|leggings|boots)$/.test(s.id));
    assert.ok(armor.length >= 3);
    assert.ok(armor.every((s) => /^(iron|diamond)_/.test(s.id)));
    const points = armorPoints(armor);
    assert.ok(points >= 9 && points <= 20, `points ${points}`);
  }
});

test('loot, Insane: 1 to 3 swords -- stone Sharpness I, diamond, diamond Sharpness I; and the wiki\'s random items', () => {
  const random = seededRandom(11);
  const extras = new Set();
  for (let i = 0; i < ROLLS; i++) {
    const loot = rollIslandLoot('insane', random);
    const swords = swordsOf(loot);
    assert.ok(swords.length >= 1 && swords.length <= 3);
    for (const s of swords) {
      const kind = `${s.id}${s.enchantments ? `+${s.enchantments.map((e) => `${e.id}${e.level}`).join()}` : ''}`;
      assert.ok(['stone_sword+sharpness1', 'diamond_sword', 'diamond_sword+sharpness1'].includes(kind), kind);
    }
    for (const s of loot) if (!/_sword$|_(helmet|chestplate|leggings|boots)$/.test(s.id) && !s.isBlock) extras.add(s.id);
    const bow = loot.find((s) => s.id === 'bow');
    if (bow) {
      const power = bow.enchantments?.find((e) => e.id === 'power')?.level;
      const arrows = loot.find((s) => s.id === 'arrow')?.count;
      assert.ok((power === 1 && arrows === 15) || (power === 3 && arrows === 20), `Power ${power} with ${arrows} arrows`);
    }
  }
  for (const id of ['water_bucket', 'lava_bucket', 'diamond_pickaxe', 'diamond_axe', 'splash_potion_of_regeneration',
    'splash_potion_of_swiftness', 'potion_of_fire_resistance', 'bow', 'arrow', 'fishing_rod']) assert.ok(extras.has(id), id);
  assert.ok(extras.has('egg') || extras.has('snowball'));
});

test('loot: the middle is better -- enchanted diamond and iron armor, ender pearls and golden apples', () => {
  const random = seededRandom(12);
  const normal = Array.from({ length: ROLLS }, () => rollCenterChest('normal', random)).flat();
  assert.ok(normal.some((s) => s.id === 'diamond_helmet' && s.enchantments?.length));
  assert.ok(normal.some((s) => s.id === 'iron_chestplate' && s.enchantments?.length));
  const pearls = normal.filter((s) => s.id === 'ender_pearl');
  assert.ok(pearls.length && pearls.every((s) => s.count >= 1 && s.count <= 2), '1-2 ender pearls');
  const apples = normal.filter((s) => s.id === 'golden_apple');
  assert.ok(apples.length && apples.every((s) => s.count >= 1 && s.count <= 3), '1-3 golden apples');
  assert.ok(normal.some((s) => s.id === 'stick' && s.enchantments?.some((e) => e.id === 'knockback')), 'a knockback rod');
  const insane = Array.from({ length: ROLLS }, () => rollCenterChest('insane', random)).flat();
  assert.ok(insane.some((s) => s.id === 'diamond_sword' && s.enchantments?.length), 'enchanted diamond swords');
  assert.ok(Math.max(...insane.filter((s) => s.id === 'ender_pearl').map((s) => s.count)) > 2, 'more pearls');
});

test('loot: a fill gives every chest its own list, and the second refill adds an ender pearl to every chest', () => {
  const first = fillChests(arena, { mode: 'normal', seed: 3, refill: 0 });
  assert.equal(first.length, arena.chests.length);
  assert.ok(first.every((list) => list.length === 27));
  assert.ok(first.every((list) => list.some(Boolean)), 'no empty chest');
  assert.notDeepEqual(fillChests(arena, { seed: 3, refill: 1 }), first, 'the refill is new loot');
  const second = fillChests(arena, { mode: 'normal', seed: 3, refill: 2 });
  assert.ok(second.every((list) => list.some((s) => s?.id === 'ender_pearl')));
  // Every stack is one the game knows how to send between players.
  for (const [i, list] of first.entries()) {
    const c = arena.chests[i];
    assert.ok(sanitizeContainer({ x: c.x, y: c.y, z: c.z, items: list }), `chest ${i} travels`);
  }
});

// --- the lobby and the start ------------------------------------------------------------------------------------

function lobby(n = 2) {
  const match = new SkyWarsMatch({ seed: 1 });
  match.join(HOST_ID, 'Hosty');
  for (let i = 1; i < n; i++) match.join(`p${i}`, `Guest${i}`);
  return match;
}

test('lobby: each player who joins gets an island of their own, the first two opposite each other', () => {
  const match = lobby(4);
  assert.deepEqual([...match.players.values()].map((p) => p.slot), [0, 1, 2, 3]);
  match.leave('p1');
  match.join('p9', 'Late');
  assert.equal(match.players.get('p9').slot, 1, 'a freed island is reused');
});

test('lobby: the host cannot start alone -- at least one other player must have joined', () => {
  const match = lobby(1);
  assert.deepEqual(match.canStart(HOST_ID), { ok: false, reason: 'Waiting for at least one more player to join.' });
  assert.equal(match.start(HOST_ID).ok, false);
  assert.equal(match.phase, 'lobby');
  match.join('p1', 'Guest');
  assert.deepEqual(match.canStart(HOST_ID), { ok: true, reason: null });
});

test('lobby: only the host starts the game', () => {
  const match = lobby(2);
  assert.equal(match.start('p1').ok, false);
  assert.equal(match.phase, 'lobby');
  assert.equal(match.setMode('p1', 'insane'), false);
  assert.equal(match.setMode(HOST_ID, 'insane'), true);
  assert.equal(match.mode, 'insane');
  assert.equal(match.setMode(HOST_ID, 'lucky'), false);
});

test('start: a countdown from 3, then the cages open and the match is on', () => {
  const match = lobby(2);
  match.drainEvents();
  match.start(HOST_ID);
  assert.equal(match.phase, 'countdown');
  assert.equal(COUNTDOWN_SECONDS, 3);
  const seen = [];
  const collect = () => { for (const e of match.drainEvents()) seen.push(e.kind === 'countdown' ? e.seconds : e.kind); };
  collect();
  for (let t = 0; t < 29; t++) { match.update(0.1); collect(); }
  assert.equal(match.phase, 'countdown', 'still counting just before 3 seconds');
  for (let t = 0; t < 3; t++) { match.update(0.1); collect(); }
  assert.deepEqual(seen, [3, 2, 1, 'start']);
  assert.equal(match.phase, 'playing');
});

test('start: the countdown announces 3 when it begins', () => {
  const match = lobby(2);
  match.drainEvents();
  match.start(HOST_ID);
  assert.deepEqual(match.drainEvents(), [{ kind: 'countdown', seconds: 3 }]);
});

test('start: nobody can fight before the cages open, and a spectator neither hits nor is hit', () => {
  const match = lobby(3);
  assert.equal(match.canAttack(HOST_ID, 'p1'), 'not_started');
  match.start(HOST_ID);
  assert.equal(match.canAttack(HOST_ID, 'p1'), 'not_started');
  match.update(3.1);
  assert.equal(match.canAttack(HOST_ID, 'p1'), null);
  match.eliminate('p2', 'void');
  assert.equal(match.canAttack(HOST_ID, 'p2'), 'spectator');
  assert.equal(match.canAttack('p2', HOST_ID), 'spectator');
});

test('start: a player leaving during the countdown, leaving one, sends everyone back to the lobby', () => {
  const match = lobby(2);
  match.start(HOST_ID);
  match.leave('p1');
  assert.equal(match.phase, 'lobby');
});

test('joining late: a player arriving after the start watches instead of playing', () => {
  const match = lobby(2);
  match.start(HOST_ID);
  match.update(3.1);
  const late = match.join('p7', 'Late');
  assert.equal(late.slot, null);
  assert.equal(late.alive, false);
});

// --- kills, the void, and winning -----------------------------------------------------------------------------

function playing(n = 3) {
  const match = lobby(n);
  match.start(HOST_ID);
  match.update(3.1);
  match.drainEvents();
  return match;
}

test('kills: a death right after a player\'s hit is that player\'s kill, and reads "was slain by"', () => {
  const match = playing(3);
  match.hit('p1', 'p2');
  match.update(2);
  const { killer, message } = match.eliminate('p2', 'player');
  assert.equal(killer.id, 'p1');
  assert.equal(match.players.get('p1').kills, 1);
  assert.equal(message, 'Guest2 was slain by Guest1');
});

test('the void: knocked off by a player, it is their kill -- "was knocked into the void by"; alone, "fell into the void"', () => {
  const match = playing(4);
  match.hit(HOST_ID, 'p1');
  match.update(1);
  assert.equal(match.eliminate('p1', 'void').message, 'Guest1 was knocked into the void by Hosty');
  assert.equal(match.players.get(HOST_ID).kills, 1);
  match.update(1);
  assert.equal(match.eliminate('p2', 'void').message, 'Guest2 fell into the void');
});

test(`kill credit lasts ${KILL_CREDIT_SECONDS} seconds after the last hit`, () => {
  const match = playing(3);
  match.hit('p1', 'p2');
  match.update(KILL_CREDIT_SECONDS + 1);
  assert.equal(match.eliminate('p2', 'void').killer, null);
  assert.equal(match.players.get('p1').kills, 0);
});

test('winning: "be the last person ... alive to win"', () => {
  const match = playing(3);
  match.eliminate('p1', 'void');
  assert.equal(match.phase, 'playing');
  match.eliminate(HOST_ID, 'void');
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, 'p2');
  assert.equal(match.endReason, 'last_alive');
  assert.ok(match.drainEvents().some((e) => e.kind === 'end' && e.winner === 'p2'));
  assert.equal(match.eliminate('p2', 'void'), null, 'nothing more happens');
});

test('a player who leaves mid-match is out, and their last attacker gets the kill', () => {
  const match = playing(3);
  match.hit('p1', 'p2');
  match.leave('p2');
  assert.equal(match.players.get('p2').alive, false);
  assert.equal(match.players.get('p1').kills, 1);
});

test('a dead player cannot die twice', () => {
  const match = playing(3);
  assert.ok(match.eliminate('p1', 'void'));
  assert.equal(match.eliminate('p1', 'void'), null);
});

test('death messages, in Minecraft\'s words', () => {
  assert.equal(deathMessage('A', 'B', 'player'), 'A was slain by B');
  assert.equal(deathMessage('A', null, 'other'), 'A died');
  assert.equal(deathMessage('A', null, 'fall'), 'A hit the ground too hard');
  assert.equal(deathMessage('A', 'B', 'fall'), 'A hit the ground too hard whilst trying to escape B');
});

// --- refills and the time limit -------------------------------------------------------------------------------

test('refills: every chest refills, then again (with ender pearls); time running out is a draw', () => {
  const match = playing(2);
  const refills = [];
  let t = 0;
  while (match.phase === 'playing' && t < TIME_LIMIT_SECONDS + 5) {
    match.update(1);
    t += 1;
    for (const e of match.drainEvents()) if (e.kind === 'refill') refills.push([e.refill, Math.round(match.elapsed)]);
  }
  assert.deepEqual(refills, REFILL_TIMES.map((at, i) => [i + 1, at]));
  assert.equal(match.phase, 'ended');
  assert.equal(match.winner, null, 'a draw');
  assert.equal(match.endReason, 'time');
});

// --- playing again --------------------------------------------------------------------------------------------

test('play again: the host takes everyone still here back to the islands, kills cleared, a new round', () => {
  const match = playing(3);
  match.hit('p1', 'p2');
  match.eliminate('p2', 'player');
  match.leave('p2');
  match.eliminate(HOST_ID, 'void');
  assert.equal(match.phase, 'ended');
  assert.equal(match.reset('p1'), false, 'only the host');
  assert.equal(match.reset(HOST_ID), true);
  assert.equal(match.phase, 'lobby');
  assert.equal(match.round, 2);
  const players = [...match.players.values()];
  assert.deepEqual(players.map((p) => p.id).sort(), [HOST_ID, 'p1'].sort(), 'the one who left is gone');
  assert.ok(players.every((p) => p.kills === 0 && p.alive && p.slot !== null));
});

test('the state every player is sent is plain data that the share channel accepts', () => {
  const match = playing(8);
  const state = match.snapshot();
  assert.equal(state.type, 'state');
  assert.deepEqual(sanitizeGameData(state), state);
  assert.equal(state.players.length, 8);
  assert.equal(state.nextRefill, REFILL_TIMES[0]);
});

test('the mod declares its world, mechanism and manager', () => {
  assert.equal(manifest.id, 'skywars');
  assert.equal(manifest.mechanism, 'skywars');
  assert.deepEqual(manifest.maps, ['SkyWars.json']);
});
