// The fake scripted bot the skills, playbook and plan tests share (and the Agent Arena's check of an agent's bot):
// every action recorded, the world and the shop faked, and seeded scenarios built from the real mods' arenas and
// general state (as a guest receives them). A scenario makes a bot of any session class built like the scripted bot.
import { ScriptedBotSession } from '../../agentArena/scriptedBot/scriptedBot.mjs';
import { BLOCKS, buildBedWarsArenaLayout } from '../../packages/blockyland-mcp/guestPeer.js';
import { sanitizeGeneralState } from '../../packages/blockyland-mcp/generalState.js';
import { describeSkyWars } from '../../src/mods/skywars/generalState.js';
import { describeBedWars } from '../../src/mods/bedwars/generalState.js';
import * as skywarsArena from '../../src/mods/skywars/arena.js';
import * as bedwarsArena from '../../src/mods/bedwars/arena.js';
import { planLayout } from '../../src/mods/bedwars/layouts.js';

/** A small seeded random, so every run plays the same scenarios. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Prices for the fake shop: enough for the shop's chains to buy in a row as they would.
const PRICES = {
  wool: { iron_ingot: 4, gives: ['wool', 16] }, stone_sword: { iron_ingot: 10, gives: ['stone_sword', 1] },
  chain_armor: { iron_ingot: 24, kit: ['armor', 1] }, pickaxe: { iron_ingot: 10, kit: ['pickaxe', 1] }, axe: { iron_ingot: 10, kit: ['axe', 1] },
  end_stone: { iron_ingot: 24, gives: ['end_stone', 12] }, iron_sword: { gold_ingot: 7, gives: ['iron_sword', 1] },
  iron_armor: { gold_ingot: 12, kit: ['armor', 2] }, gapple: { gold_ingot: 3, gives: ['golden_apple', 1] }, wood: { gold_ingot: 4, gives: ['oak_planks', 16] },
  diamond_armor: { emerald: 6, kit: ['armor', 3] }, diamond_sword: { emerald: 4, gives: ['diamond_sword', 1] }, pearl: { emerald: 4, gives: ['ender_pearl', 1] },
  sharpness: { diamond: 4 }, protection: { diamond: 2 }, forge: { diamond: 4 }, healPool: { diamond: 1 }, alarm: { diamond: 1 },
};
const BLOCK_ITEMS = new Set(['wool', 'end_stone', 'oak_planks']);

/** A fake inventory: counts by item. */
function fakeInventory(items) {
  const counts = new Map(Object.entries(items).filter(([, n]) => n > 0));
  return {
    counts,
    countItem: (id) => counts.get(id) ?? 0,
    countPlaceableBlocks: () => [...counts].reduce((n, [id, c]) => n + (BLOCK_ITEMS.has(id) ? c : 0), 0),
    allSlots: () => [...counts].filter(([, n]) => n > 0).map(([id, count]) => ({ id, count })),
    equipBest() {},
    takeItem(id, n = 1) { const c = counts.get(id) ?? 0; if (c < n) return false; counts.set(id, c - n); return true; },
  };
}

/**
 * A house bot with the world and every action faked: actions are recorded in `bot.log` and change only the fake
 * inventory (purchases) and the voxels (placing, breaking).
 */
export function fakeBot({ difficulty, gameMode, position, items, enemies, voxels, style = 'auto', round, general, kit, vitals = {}, Session = ScriptedBotSession }) {
  // Session: the class whose brain plays (the house bot's, or another built like it: houseBotDs).
  const bot = Object.create(Session.prototype);
  const log = [];
  Object.assign(bot, {
    log, clientId: 'me', name: 'Me', difficulty, gameMode, strategy: style, gamemode: 'survival', isDead: false, waitingRespawn: false,
    position: { ...position }, spawnPoint: { x: 0.5, y: 31, z: 0.5 }, yaw: 0, connected: true,
    inventory: fakeInventory(items), bedwarsKit: { ...kit }, bedDefenseCount: round.bedDefenseCount ?? 0, stockingSince: null,
    chests: new Map(), lootedChestKeys: new Set(), skywarsSpawns: [], generalState: general,
    // How I am, and the other players as the guest keeps them (a brain may read their health, gear and where they are).
    health: vitals.health ?? 20, absorption: vitals.absorption ?? 0, food: vitals.food ?? 20, saturation: 5,
    peers: new Map(enemies.map((e) => [e.id, { health: 20, ...e }])),
    ...round.fields,
  });
  for (const c of round.chests ?? []) bot.chests.set(`${c.x},${c.y},${c.z}`, { ...c, items: c.items ?? new Array(27).fill(null) });
  for (const k of round.looted ?? []) bot.lootedChestKeys.add(k);
  const v = new Map(voxels);
  const rec = (...e) => log.push(e.map((x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)));
  Object.assign(bot, {
    getVoxel: (x, y, z) => v.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
    isSolid: (x, y, z) => (v.get(`${x},${y},${z}`) ?? BLOCKS.AIR) !== BLOCKS.AIR,
    async moveStepToward(x, y, z, o = {}) { rec('move', x, y, z, !!o.bridge, o.stopWithin, o.durationMs, !!o.avoidVoid); return { ok: true }; },
    async lootChest(a) { rec('loot', ...a.position, !!a.bridge, a.duration_ms); return { ok: true, looted: [] }; },
    async engageEnemy(p) { rec('fight', p.id); return { ok: true }; },
    consumeHealingItem() { rec('heal'); return false; },
    findAliveEnemies: () => enemies.map((e) => ({ ...e })),
    voidCellsToward: (x, z) => Math.round(Math.hypot(x - bot.position.x, z - bot.position.z) / 3),
    chooseTeam(t) { rec('team', t); return { ok: true, team: t }; },
    sendPacket(m) { rec('packet', JSON.stringify(m)); },
    placeBlockAt(x, y, z) { rec('place', x, y, z); v.set(`${x},${y},${z}`, BLOCKS.WHITE_WOOL ?? 1); return { ok: true }; },
    breakBlockAt(x, y, z) { rec('break', x, y, z); v.set(`${x},${y},${z}`, BLOCKS.AIR); return { ok: true }; },
    buyInBedWars(item) {
      const price = PRICES[item];
      if (!price) { rec('buy-fail', item); return { ok: false }; }
      for (const [cur, n] of Object.entries(price)) if (cur !== 'gives' && cur !== 'kit' && bot.inventory.countItem(cur) < n) { rec('buy-fail', item); return { ok: false }; }
      for (const [cur, n] of Object.entries(price)) if (cur !== 'gives' && cur !== 'kit') bot.inventory.takeItem(cur, n);
      if (price.gives) bot.inventory.counts.set(price.gives[0], bot.inventory.countItem(price.gives[0]) + price.gives[1]);
      if (price.kit) bot.bedwarsKit[price.kit[0]] = Math.max(bot.bedwarsKit[price.kit[0]] ?? 0, price.kit[1]);
      rec('buy', item);
      return { ok: true };
    },
    broadcastState() {},
  });
  return bot;
}

export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

// --- SkyWars -----------------------------------------------------------------------------------------------------

export const SW_ARENA = skywarsArena.buildArena(skywarsArena.DEFAULT_MAP);

export function skywarsScenario(seed, { withGeneral = true } = {}) {
  const r = rng(seed);
  const slot = Math.floor(r() * SW_ARENA.spawns.length);
  const spawn = SW_ARENA.spawns[slot];
  const phase = r() < 0.9 ? 'playing' : pick(r, ['lobby', 'countdown', 'ended']);
  const players = [{ id: 'me', name: 'Me', slot, alive: r() < 0.95, kills: 0 }, { id: 'foe', name: 'Foe', slot: (slot + 1) % 8, alive: true, kills: 0 }];
  const state = { type: 'state', phase, round: 1, elapsed: Math.floor(r() * 300), refills: 0, timeLimit: 600, players };
  const chests = SW_ARENA.chests.map((c) => ({ x: c.x, y: c.y, z: c.z, slot: c.slot ?? null, kind: c.kind ?? 'island', items: r() < 0.3 ? [{ id: 'stone' }] : new Array(27).fill(null) }));
  const looted = chests.filter(() => r() < pick(r, [0, 0.4, 0.8, 1])).map((c) => `${c.x},${c.y},${c.z}`);
  const where = pick(r, ['spawn', 'middle', 'between']);
  const position = where === 'spawn' ? { x: spawn.x + r() * 3, y: spawn.y, z: spawn.z + r() * 3 } : where === 'middle' ? { x: r() * 6 - 3, y: 31, z: r() * 6 - 3 } : { x: spawn.x / 2, y: 31, z: spawn.z / 2 };
  const enemies = r() < 0.6 ? [{ id: 'foe', name: 'Foe', x: position.x + (r() - 0.5) * 40, y: 31, z: position.z + (r() - 0.5) * 40 }] : [];
  const items = { wool: pick(r, [0, 2, 3, 4, 20]), stone_sword: r() < 0.5 ? 1 : 0 };
  const general = withGeneral ? sanitizeGeneralState(describeSkyWars(state, SW_ARENA)) : null;
  const round = { chests, looted, fields: { skywarsState: { ...state, spawns: SW_ARENA.spawns }, skywarsSpawns: SW_ARENA.spawns } };
  const difficulty = pick(r, ['easy', 'normal', 'hard']), style = pick(r, ['auto', 'auto', 'rusher']);
  const vitals = { health: pick(r, [20, 20, 16, 11, 7, 3]), absorption: pick(r, [0, 0, 4]), food: pick(r, [20, 14, 6]) };
  if (r() < 0.4) items.golden_apple = pick(r, [1, 2]);
  return (Session) => fakeBot({ difficulty, gameMode: 'skywars', position, items: { ...items }, enemies, voxels: [], style, round, general, kit: {}, vitals, Session });
}

// --- Bed Wars ----------------------------------------------------------------------------------------------------

const BW_MAP = bedwarsArena.DEFAULT_MAP;
/** A Bed Wars map as host and guest have it: its blocks, its plan, the guest's layout, its teams. Cached by map. */
const bwWorlds = new Map();
function bwWorld(map) {
  const key = JSON.stringify(map);
  if (!bwWorlds.has(key)) {
    const host = bedwarsArena.buildArena(map), norm = bedwarsArena.normalizeMap(map);
    const plan = planLayout({ teams: norm.teams, layout: norm.layout, seed: norm.seed });
    bwWorlds.set(key, { map, host, plan, guest: buildBedWarsArenaLayout(map, plan), teams: host.bases.map((b) => b.team) });
  }
  return bwWorlds.get(key);
}
export const BW_HOST = bwWorld(BW_MAP).host;

/**
 * A seeded Bed Wars moment for one bot. `mates`: how many other players share its team (0-3: a team of 1-4); `map`: the
 * map (a mode's: { teams, layout, seed }), and `mode` the lobby's mode it is played in.
 */
export function bedwarsScenario(seed, { withGeneral = true, mates = 0, map = BW_MAP, mode = undefined } = {}) {
  const r = rng(seed);
  const { host: BW_HOST, plan: BW_PLAN, guest: BW_GUEST, teams: TEAMS } = bwWorld(map);
  const BW_MAP = map;
  const myTeam = pick(r, TEAMS);
  const phase = r() < 0.12 ? 'lobby' : 'playing';
  const lobbyNoTeam = phase === 'lobby' && r() < 0.8;
  const teams = TEAMS.map((id) => ({ id, bed: id === myTeam ? r() < 0.8 : r() < 0.6, eliminated: false, upgrades: {}, traps: [] }));
  const players = [{ id: 'me', name: 'Me', team: lobbyNoTeam ? null : myTeam, alive: r() < 0.95, dead: false }];
  for (let i = 1; i <= mates; i++) players.push({ id: `mate-${i}`, name: `Mate${i}`, team: lobbyNoTeam ? null : myTeam, alive: r() < 0.9, dead: false });
  for (const t of TEAMS) if (t !== myTeam && r() < 0.5) players.push({ id: `p-${t}`, name: t, team: t, alive: true, dead: false });
  const gens = [...TEAMS.map((t) => ({ id: `f-${t}`, kind: 'forge', team: t, stock: { iron: Math.floor(r() * 5), gold: 0 } })),
    ...BW_HOST.diamonds.map((d) => ({ id: d.id, kind: 'diamond', stock: { diamond: r() < 0.4 ? 2 : 0 } })),
    ...BW_HOST.emeralds.map((e) => ({ id: e.id, kind: 'emerald', stock: { emerald: r() < 0.3 ? 1 : 0 } }))];
  const state = { type: 'state', phase, round: 1, elapsed: 30, teams, players, gens, map: BW_MAP, plan: BW_PLAN, ...(mode ? { mode } : {}) };
  const base = BW_HOST.bases.find((b) => b.team === myTeam);
  const where = pick(r, ['bed', 'forge', 'middle', 'enemy']);
  const enemyBase = pick(r, BW_HOST.bases.filter((b) => b.team !== myTeam));
  const position = where === 'bed' ? { x: base.bed.foot[0] + r() * 4, y: 31, z: base.bed.foot[2] + r() * 4 } : where === 'forge' ? { x: base.forge.x, y: 31, z: base.forge.z }
    : where === 'middle' ? { x: r() * 10 - 5, y: 31, z: r() * 10 - 5 } : { x: enemyBase.bed.foot[0] + r() * 3, y: 31, z: enemyBase.bed.foot[2] + r() * 3 };
  const enemies = players.filter((p) => p.id !== 'me' && !p.id.startsWith('mate-')).map((p) => ({ id: p.id, name: p.name, x: position.x + (r() - 0.5) * 60, y: 31, z: position.z + (r() - 0.5) * 60 }));
  const items = { iron_ingot: pick(r, [0, 3, 4, 10, 24, 40]), gold_ingot: pick(r, [0, 3, 4, 7, 12, 20]), diamond: pick(r, [0, 0, 1, 4]), emerald: pick(r, [0, 0, 4, 6]),
    wool: pick(r, [0, 4, 7, 8, 16, 40]), wooden_sword: 1, iron_sword: r() < 0.2 ? 1 : 0, golden_apple: pick(r, [0, 1, 2]) };
  // Blocks already over the bed, some of them.
  const voxels = [];
  for (const [x, y, z] of [[base.bed.foot[0], base.bed.foot[1] + 1, base.bed.foot[2]], [base.bed.foot[0] + 1, base.bed.foot[1], base.bed.foot[2]]]) if (r() < 0.3) voxels.push([`${x},${y},${z}`, BLOCKS.WHITE_WOOL ?? 1]);
  if (r() < 0.3) voxels.push([`${enemyBase.bed.foot[0]},${enemyBase.bed.foot[1] + 1},${enemyBase.bed.foot[2]}`, BLOCKS.END_STONE ?? 2]);
  const general = withGeneral ? sanitizeGeneralState(describeBedWars(state, BW_HOST)) : null;
  const round = { bedDefenseCount: pick(r, [0, 0, 1, 2]), fields: { bedwarsState: state, bedwarsArena: BW_GUEST } };
  const difficulty = pick(r, ['easy', 'normal', 'hard']), style = pick(r, ['auto', 'auto', 'rusher', 'defender']), armor = pick(r, [0, 0, 1, 2]);
  const vitals = { health: pick(r, [20, 20, 16, 11, 7, 3]), absorption: pick(r, [0, 0, 4]), food: pick(r, [20, 14, 6]) };
  return (Session) => fakeBot({ difficulty, gameMode: 'bedwars', position, items: { ...items }, enemies, voxels, style, round, general, kit: { armor, pickaxe: 0, axe: 0 }, vitals, Session });
}

