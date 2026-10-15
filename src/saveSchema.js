// What a save contains, and what loading one is allowed to do.
//
// The v1 format saved a player's position, velocity, look angles, mode, health, hunger, exp and level -- and
// an inventory of the hotbar, storage and active slot. Everything else Survival keeps was dropped on save
// and invented on load:
//
//  - **saturation and exhaustion** were never saved, so a player who saved at full saturation loaded at
//    whatever the Player constructor set.
//  - **armour, the offhand and the cursor stack** were not saved at all, so a full suit of armour and a
//    shield vanished on every reload.
//  - **the bed binding** was not saved, so your respawn point was forgotten.
//  - `hunger` defaulted to **20** when absent, so an older save with no hunger field arrived *well fed*.
//    Loading a save must not heal, and it must not feed.
//  - `mapData.inventory.hotbar.map(...)` threw outright if the inventory was missing or not an array.
//
// This module owns the schema, the migration and the normalisation, so `mapManager` only has to call it.

import { capturePacks, restorePacks, createPackStore } from './dataPackStore.js';
import { captureEndState, restoreEndState } from './endProgression.js';

/**
 * Bumped when the shape changes.
 *
 * v1 is the format above. v2 is everything this module captures. v3 adds `session.dataPacks`, the loaded data
 * packs, because content has to be restored before the world is rebuilt from it.
 */
export const SAVE_VERSION = 3;

/** Exactly these many slots, as Java has. */
export const HOTBAR_SLOTS = 9;
export const STORAGE_SLOTS = 27;

/** What a field defaults to when an older save does not carry it. Documented, not guessed at load time. */
export const LEGACY_DEFAULTS = Object.freeze({
  saturation: 5,      // Java's starting saturation, and what a missing field becomes
  exhaustion: 0,
  absorption: 0,
  air: 300,
  gamemode: 'survival', // NOT 'creative'. The old default granted Creative abilities on a malformed save.
  difficulty: 'normal',
  health: 20,
  hunger: 20,
  exp: 0,
  level: 0,
});

/**
 * A slot array of exactly `size` entries, padded with null and truncated if longer.
 *
 * Returning a fresh array matters: loading must REPLACE session state rather than merge into it, so a
 * leftover item from the previous world cannot survive a load.
 */
export function normaliseSlots(list, size) {
  const out = new Array(size).fill(null);
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < Math.min(size, list.length); i++) {
    const item = list[i];
    // A saved stack is copied, so the loaded world does not alias the parsed JSON.
    out[i] = item && typeof item === 'object' ? { ...item } : null;
  }
  return out;
}

/** The armour object, with every slot present and nothing invented. */
function normaliseArmour(armor) {
  const out = { head: null, chest: null, legs: null, feet: null };
  if (!armor || typeof armor !== 'object') return out;
  for (const key of ['head', 'chest', 'legs', 'feet']) {
    const item = armor[key];
    out[key] = item && typeof item === 'object' ? { ...item } : null;
  }
  return out;
}

/**
 * The Survival half of the player.
 *
 * `isDead` is saved deliberately. A player who saves while dead must load **dead** -- restoring them at full
 * health would be a free resurrection, and it would also let them die a second time and drop a second
 * inventory. `deathDropsDone` travels with it so the drop transaction stays spent across a reload.
 */
export function capturePlayerState(player) {
  if (!player) return null;
  return {
    saturation: player.saturation,
    exhaustion: player.exhaustion,
    absorption: player.absorption ?? 0,
    air: player.air,
    xp: player.xp ?? 0,
    // Transient effects, as `[name, {duration, level, tickTimer}]` pairs: a Map does not survive JSON.
    statusEffects: player.statusEffects instanceof Map
      ? [...player.statusEffects.entries()].map(([name, e]) => [name, { ...e }])
      : [],
    isDead: player.isDead === true,
    deathDropsDone: player.deathDropsDone === true,
    // The bed binding, which v1 forgot entirely.
    bedBlockPosition: player.bedBlockPosition ? { ...player.bedBlockPosition } : null,
    bedSpawnPosition: player.bedSpawnPosition
      ? { x: player.bedSpawnPosition.x, y: player.bedSpawnPosition.y, z: player.bedSpawnPosition.z }
      : null,
    bedDimension: player.bedDimension ?? null,
    anchorSpawn: player.anchorSpawn ? { ...player.anchorSpawn } : null,
    spawnPosition: player.spawnPosition
      ? { x: player.spawnPosition.x, y: player.spawnPosition.y, z: player.spawnPosition.z }
      : null,
  };
}

/**
 * Apply a saved player to a live one.
 *
 * Missing fields take the **documented** defaults above rather than being invented here, and crucially a
 * missing `hunger`/`saturation` does not become a full bar.
 *
 * @param {object} player
 * @param {object} saved the `player` object from a save file of any version
 * @param {{makeVector:(x:number,y:number,z:number)=>object}} [helpers]
 */
export function applyPlayerState(player, saved, helpers = {}) {
  if (!player) return null;
  const s = saved && typeof saved === 'object' ? saved : {};
  const makeVector = helpers.makeVector ?? ((x, y, z) => ({ x, y, z }));

  player.saturation = num(s.saturation, LEGACY_DEFAULTS.saturation);
  player.exhaustion = num(s.exhaustion, LEGACY_DEFAULTS.exhaustion);
  player.absorption = num(s.absorption, LEGACY_DEFAULTS.absorption);
  if (s.air !== undefined) player.air = num(s.air, LEGACY_DEFAULTS.air);
  player.xp = num(s.xp, LEGACY_DEFAULTS.exp);

  // Effects, replacing whatever the previous session had.
  if (player.statusEffects?.clear) player.statusEffects.clear();
  else if (player.statusEffects) player.statusEffects = new Map();
  if (Array.isArray(s.statusEffects) && player.statusEffects?.set) {
    for (const entry of s.statusEffects) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const [name, effect] = entry;
      if (typeof name !== 'string' || !effect || typeof effect !== 'object') continue;
      player.statusEffects.set(name, {
        duration: num(effect.duration, 0),
        level: num(effect.level, 1),
        tickTimer: num(effect.tickTimer, 0),
      });
    }
  }

  // Dead stays dead, and the drop transaction stays spent.
  player.isDead = s.isDead === true;
  player.deathDropsDone = s.deathDropsDone === true;
  if (player.isDead) player.health = 0;

  player.bedBlockPosition = s.bedBlockPosition && Number.isFinite(s.bedBlockPosition.x) ? { x: s.bedBlockPosition.x, y: s.bedBlockPosition.y, z: s.bedBlockPosition.z } : null;
  player.bedSpawnPosition = s.bedSpawnPosition
    ? makeVector(num(s.bedSpawnPosition.x, 0), num(s.bedSpawnPosition.y, 0), num(s.bedSpawnPosition.z, 0))
    : null;
  player.bedDimension = typeof s.bedDimension === 'string' ? s.bedDimension : null;
  player.anchorSpawn = s.anchorSpawn ? {x:num(s.anchorSpawn.x,0),y:num(s.anchorSpawn.y,0),z:num(s.anchorSpawn.z,0),dimension:String(s.anchorSpawn.dimension??'nether')} : null;
  if (s.spawnPosition) {
    player.spawnPosition = makeVector(
      num(s.spawnPosition.x, 0), num(s.spawnPosition.y, 0), num(s.spawnPosition.z, 0));
  }
  return player;
}

/** The inventory compartments v1 forgot. */
export function captureInventoryState(inventory) {
  if (!inventory) return null;
  return {
    hotbar: (inventory.hotbar ?? []).map(it => (it ? { ...it } : null)),
    storage: (inventory.storage ?? []).map(it => (it ? { ...it } : null)),
    activeSlot: inventory.activeSlot ?? 0,
    armor: {
      head: inventory.armor?.head ? { ...inventory.armor.head } : null,
      chest: inventory.armor?.chest ? { ...inventory.armor.chest } : null,
      legs: inventory.armor?.legs ? { ...inventory.armor.legs } : null,
      feet: inventory.armor?.feet ? { ...inventory.armor.feet } : null,
    },
    offhand: inventory.offhand ? { ...inventory.offhand } : null,
    cursorItem: inventory.cursorItem ? { ...inventory.cursorItem } : null,
  };
}

/**
 * Apply a saved inventory.
 *
 * Loading REPLACES the session's inventory: every array is rebuilt to its exact length, so an item from the
 * previous world cannot survive into the loaded one. A save with no inventory means **empty**, not the demo
 * kit -- which is what the plan requires, and what the old `if (mapData.inventory)` guard happened to do only
 * because it skipped the block entirely while leaving whatever the constructor had put there.
 *
 * Crafting grids are deliberately not restored. They are a workspace, their result is a preview, and the plan
 * asks for the preview to be rebuilt from inputs rather than trusted.
 */
export function applyInventoryState(inventory, saved) {
  if (!inventory) return null;
  const s = saved && typeof saved === 'object' ? saved : {};
  inventory.hotbar = normaliseSlots(s.hotbar, HOTBAR_SLOTS);
  inventory.storage = normaliseSlots(s.storage, STORAGE_SLOTS);
  const active = Number.isFinite(s.activeSlot) ? Math.floor(s.activeSlot) : 0;
  inventory.activeSlot = Math.max(0, Math.min(HOTBAR_SLOTS - 1, active));
  inventory.armor = normaliseArmour(s.armor);
  inventory.offhand = s.offhand && typeof s.offhand === 'object' ? { ...s.offhand } : null;
  inventory.cursorItem = s.cursorItem && typeof s.cursorItem === 'object' ? { ...s.cursorItem } : null;
  // Grids are a workspace, and their preview is a calculation. Cleared rather than restored.
  inventory.craft2x2 = new Array(4).fill(null);
  inventory.craft2x2Result = null;
  inventory.craft3x3 = new Array(9).fill(null);
  inventory.craft3x3Result = null;
  return inventory;
}

/** The session and world settings a save should carry so a load does not re-invent them. */
export function captureSessionState(game) {
  if (!game) return null;
  return {
    difficulty: game.difficulty,
    dimension: game.currentDimension || game.world?.dimension || 'overworld',
    biomes: game.world?.selectedBiome,
    dayCount: game.dayCount ?? 0,
    endState: captureEndState(game.world,game),
    // The loaded data packs. Captured here rather than beside the world, because a pack changes the CONTENT
    // -- biomes, recipes, drops -- and content has to be back in place before the world is regenerated from
    // it. A save that restored the terrain but not the packs would rebuild the world with different rules.
    dataPacks: capturePacks(game.dataPacks),
    settings: game.settings
      ? { gameMode: game.settings.gameMode, difficulty: game.settings.difficulty,
        cheats: game.settings.cheats, preset: game.settings.preset,
        // Which generation pack the world was built with, so the setup screen can show it again rather than
        // silently reverting to Vanilla on the next world.
        dataPackPreset: game.settings.dataPackPreset ?? null }
      : null,
    gamerules: game.gamerules ? { ...game.gamerules } : {},
  };
}

/**
 * Apply saved session state.
 *
 * Mode abilities follow the restored mode rather than whatever flags the running session had, which is the
 * plan's "restore authoritative state before unpausing".
 */
export function applySessionState(game, saved) {
  if (!game) return null;
  const s = saved && typeof saved === 'object' ? saved : {};
  if(game.world && 'endState' in s)restoreEndState(game.world,s.endState);
  if (typeof s.difficulty === 'string' && s.difficulty) {
    game.difficulty = s.difficulty;
    if (game.player) game.player.difficulty = s.difficulty;
  }
  if (typeof s.dimension === 'string' && s.dimension) game.currentDimension = s.dimension;
  if (Number.isFinite(s.dayCount)) game.dayCount = s.dayCount;
  if (s.gamerules && typeof s.gamerules === 'object') game.gamerules = { ...s.gamerules };
  // Data packs are restored into the game's store, NOT applied here. Applying needs `dataPackRuntime`, and a
  // `mapManager` that applied content while deserialising would be doing world generation's job. The caller
  // applies them once the store is back, which is also where a pack that failed to restore can be reported.
  const restored = restorePacks(s.dataPacks);
  game.dataPacks = restored.store;
  game.dataPackRestoreReport = {
    errors: restored.errors,
    // Named so the UI can say which packs a save could not carry, rather than starting with less content
    // than the player left and no explanation.
    omitted: restored.omitted,
  };
  if (s.settings && typeof s.settings === 'object') {
    game.settings = { ...(game.settings ?? {}), ...s.settings };
    if (game.player?.setGameMode && typeof s.settings.gameMode === 'string') {
      game.player.setGameMode(s.settings.gameMode);
    }
  }
  return game;
}

/**
 * Bring any older save up to the current shape.
 *
 * v1 saves simply lack the new fields; nothing has to be renamed or moved, so the migration is a version bump
 * plus a note of what was absent. It deliberately does **not** invent an inventory: a v1 save with no
 * inventory loads empty, which is the documented default.
 */
export function migrateSave(mapData) {
  if (!mapData || typeof mapData !== 'object') return mapData;
  const version = Number.isFinite(mapData.version) ? mapData.version : 1;
  if (version >= SAVE_VERSION) {
    mapData.version = SAVE_VERSION;
    return mapData;
  }
  const migrated = { ...mapData };
  migrated.version = SAVE_VERSION;
  // Recorded so a later reader can tell a migrated save from one written by this version.
  migrated.migratedFrom = version;
  return migrated;
}

/** A finite number, or the documented default. Guards against NaN, null and strings reaching the game. */
function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}
