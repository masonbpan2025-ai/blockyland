// Mining Simulator's economy: what ores sell for, what upgrades cost, and the coin ledger the host keeps.
//
// Pure rules with no browser, world or Three.js in them, so the tests can play a whole economy. The host's browser
// owns the one Ledger of the session (client.js); guests only ask it for things.
//
// Coins are a number in the ledger, never an inventory item.

/** Coins for one item of each ore, as the trader buys it. Rarer ores are worth more; coal is the base 20. */
export const ORE_VALUES = Object.freeze({
  coal: 20,
  raw_copper: 15,
  lapis_lazuli: 10,
  redstone: 15,
  raw_iron: 40,
  raw_gold: 70,
  diamond: 150,
  emerald: 200,
});

export const ORE_NAMES = Object.freeze({
  coal: 'Coal', raw_copper: 'Raw Copper', lapis_lazuli: 'Lapis Lazuli', redstone: 'Redstone',
  raw_iron: 'Raw Iron', raw_gold: 'Raw Gold', diamond: 'Diamond', emerald: 'Emerald',
});

/** The pickaxe ladder: level 1 is what every player starts with. */
export const PICKAXES = Object.freeze([
  null,
  { level: 1, id: 'wooden_pickaxe', name: 'Wooden Pickaxe' },
  { level: 2, id: 'stone_pickaxe', name: 'Stone Pickaxe' },
  { level: 3, id: 'iron_pickaxe', name: 'Iron Pickaxe' },
  { level: 4, id: 'diamond_pickaxe', name: 'Diamond Pickaxe' },
  { level: 5, id: 'netherite_pickaxe', name: 'Netherite Pickaxe' },
]);
export const MAX_PICKAXE = 5;

export const HOUSE_NAMES = Object.freeze([null, 'Wooden Hut', 'Stone Cottage', 'Brick House', 'Two-Storey House', 'Manor']);
export const MAX_HOUSE = 5;

export const FIRST_PICKAXE_UPGRADE = 500;
export const PICKAXE_STEP = 300;
export const FIRST_HOUSE_UPGRADE = 750;
export const HOUSE_STEP = 400;
export const SUPERSTICK_COST = 300;
/** Health points one Superstick hit takes (a full player has 20). */
export const SUPERSTICK_DAMAGE = 2.5;
/** The share of a player's coins their killer takes. */
export const KILL_SHARE = 0.2;
/** How many players (and so plots) a world has. */
export const MAX_PLOTS = 8;

/**
 * Coins to go from pickaxe `level` to the next: 500 for stone, then 300 more for each one after. Null at the top.
 * @param {number} level the level the player has now (1 = wooden)
 */
export function pickaxeUpgradeCost(level) {
  if (!Number.isInteger(level) || level < 1 || level >= MAX_PICKAXE) return null;
  return FIRST_PICKAXE_UPGRADE + PICKAXE_STEP * (level - 1);
}

/** Coins to go from house `level` to the next: 750, then 400 more for each one after. Null at the top. */
export function houseUpgradeCost(level) {
  if (!Number.isInteger(level) || level < 1 || level >= MAX_HOUSE) return null;
  return FIRST_HOUSE_UPGRADE + HOUSE_STEP * (level - 1);
}

/**
 * What a pile of items sells for. Anything that is not an ore is left out.
 * @param {Record<string, number>} counts item id -> how many
 * @returns {{coins: number, sold: Record<string, number>}}
 */
export function saleValue(counts = {}) {
  const sold = {};
  let coins = 0;
  for (const [id, raw] of Object.entries(counts ?? {})) {
    const value = ORE_VALUES[id];
    const n = Math.floor(Number(raw));
    if (!value || !Number.isFinite(n) || n <= 0) continue;
    sold[id] = n;
    coins += value * n;
  }
  return { coins, sold };
}

/** The coins a killer takes from a victim holding `coins`: a fifth, rounded down. */
export function killTransfer(coins) {
  const c = Math.max(0, Math.floor(Number(coins) || 0));
  return Math.floor(c * KILL_SHARE);
}

/** The ledger's key for a player's name: names are matched without case or surrounding spaces. */
export function nameKey(name) {
  return String(name ?? '').trim().toLowerCase().slice(0, 32) || 'player';
}

function freshRecord(name, plot) {
  return { name: String(name ?? 'Player').slice(0, 32), coins: 0, pickaxe: 1, house: 1, superstick: false, plot, kills: 0, deaths: 0, chests: [] };
}

/**
 * Every player's coins and levels, by name, so a player who comes back under the same name keeps them.
 *
 * Every method that changes something returns `{ ok, reason?, ... }`; a refusal changes nothing.
 */
export class Ledger {
  constructor(saved = null) {
    /** nameKey -> record */
    this.players = new Map();
    if (saved?.players && typeof saved.players === 'object') {
      for (const [key, raw] of Object.entries(saved.players)) {
        if (!raw || typeof raw !== 'object') continue;
        const plot = Number.isInteger(raw.plot) && raw.plot >= 0 && raw.plot < MAX_PLOTS ? raw.plot : null;
        const record = freshRecord(raw.name ?? key, plot);
        record.coins = Math.max(0, Math.floor(Number(raw.coins) || 0));
        record.pickaxe = clampLevel(raw.pickaxe, MAX_PICKAXE);
        record.house = clampLevel(raw.house, MAX_HOUSE);
        record.superstick = raw.superstick === true;
        record.kills = Math.max(0, Math.floor(Number(raw.kills) || 0));
        record.deaths = Math.max(0, Math.floor(Number(raw.deaths) || 0));
        record.chests = Array.isArray(raw.chests) ? raw.chests.filter(Array.isArray).map((items) => items.slice(0, 27)) : [];
        this.players.set(nameKey(key), record);
      }
      // Two saved players on one plot: the later one gets a new plot when it next joins.
      const taken = new Set();
      for (const record of this.players.values()) {
        if (record.plot === null) continue;
        if (taken.has(record.plot)) record.plot = null;
        else taken.add(record.plot);
      }
    }
  }

  get(name) { return this.players.get(nameKey(name)) ?? null; }

  /** The first plot nobody owns, or null when all are taken. */
  freePlot() {
    const taken = new Set([...this.players.values()].map((r) => r.plot));
    for (let i = 0; i < MAX_PLOTS; i++) if (!taken.has(i)) return i;
    return null;
  }

  /**
   * A player arrives: their saved record, or a new one with the first free plot.
   * @returns {{ok: boolean, record?: object, fresh?: boolean, reason?: string}}
   */
  join(name) {
    const key = nameKey(name);
    const existing = this.players.get(key);
    if (existing) {
      if (existing.plot === null) existing.plot = this.freePlot();
      if (existing.plot === null) return { ok: false, reason: 'Every plot is taken.' };
      return { ok: true, record: existing, fresh: false };
    }
    const plot = this.freePlot();
    if (plot === null) return { ok: false, reason: 'Every plot is taken.' };
    const record = freshRecord(name, plot);
    this.players.set(key, record);
    return { ok: true, record, fresh: true };
  }

  /** Sell ores: the coins they are worth go to the player. */
  sell(name, counts) {
    const record = this.get(name);
    if (!record) return { ok: false, reason: 'Unknown player.' };
    const { coins, sold } = saleValue(counts);
    if (coins <= 0) return { ok: false, reason: 'You have no ores to sell.' };
    record.coins += coins;
    return { ok: true, coins, sold, total: record.coins };
  }

  buyPickaxe(name) {
    const record = this.get(name);
    if (!record) return { ok: false, reason: 'Unknown player.' };
    const cost = pickaxeUpgradeCost(record.pickaxe);
    if (cost === null) return { ok: false, reason: 'Your pickaxe is already the best there is.' };
    if (record.coins < cost) return { ok: false, reason: `You need ${cost - record.coins} more coins.` };
    record.coins -= cost;
    record.pickaxe += 1;
    return { ok: true, cost, level: record.pickaxe, total: record.coins };
  }

  buyHouse(name) {
    const record = this.get(name);
    if (!record) return { ok: false, reason: 'Unknown player.' };
    const cost = houseUpgradeCost(record.house);
    if (cost === null) return { ok: false, reason: 'Your house is already the biggest there is.' };
    if (record.coins < cost) return { ok: false, reason: `You need ${cost - record.coins} more coins.` };
    record.coins -= cost;
    record.house += 1;
    return { ok: true, cost, level: record.house, total: record.coins };
  }

  buySuperstick(name) {
    const record = this.get(name);
    if (!record) return { ok: false, reason: 'Unknown player.' };
    if (record.superstick) return { ok: false, reason: 'You already own the Superstick.' };
    if (record.coins < SUPERSTICK_COST) return { ok: false, reason: `You need ${SUPERSTICK_COST - record.coins} more coins.` };
    record.coins -= SUPERSTICK_COST;
    record.superstick = true;
    return { ok: true, cost: SUPERSTICK_COST, total: record.coins };
  }

  /**
   * A player died. With a killer (someone else), a fifth of the victim's coins, rounded down, moves to the killer.
   * @returns {{ok: boolean, coins: number, killer: object|null, victim: object|null}}
   */
  died(victimName, killerName = null) {
    const victim = this.get(victimName);
    if (!victim) return { ok: false, coins: 0, killer: null, victim: null };
    victim.deaths += 1;
    const killer = killerName ? this.get(killerName) : null;
    if (!killer || killer === victim) return { ok: true, coins: 0, killer: null, victim };
    const coins = killTransfer(victim.coins);
    victim.coins -= coins;
    killer.coins += coins;
    killer.kills += 1;
    return { ok: true, coins, killer, victim };
  }

  /** The ledger as plain data, for saving. */
  toJSON() {
    const players = {};
    for (const [key, r] of this.players) players[key] = { ...r, chests: r.chests.map((items) => items.slice(0, 27)) };
    return { version: 1, players };
  }
}

function clampLevel(raw, max) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : 1;
}
