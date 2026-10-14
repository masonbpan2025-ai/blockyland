// Trial spawners and vaults, from the wiki (https://minecraft.wiki/w/Trial_Spawner and /Vault).
//
// Trial spawner:
//   * "a required player range of 14 blocks. Any player in Survival or Adventure mode activates the spawner if the
//     distance ... becomes less than the required player range, and the spawner has a direct line of sight";
//     not on Peaceful; "The light level around a trial spawner does not affect how it summons entities";
//   * the values for trial chambers' spawners: every 20 ticks (160 for the slow ones); total mobs 6 (+2 per extra
//     player), simultaneous 3 (+0.5) -- breezes: total 2 (+1), simultaneous 1 (+0.5); slow: simultaneous 4 (+2);
//   * "Mobs spawn in positions that have a line of sight to the trial spawner, in a 4-block spherical radius";
//   * "When all mobs have been killed, the trial spawner waits 40 ticks ... Then, every 30 ticks ... it ejects random
//     items from the loot table ... for every detected player. It has a 50% chance of picking a trial key";
//   * "a cooldown state for 30 minutes before it can be activated again".
// Vault:
//   * "When a trial key is used on a vault, it ejects items"; "Each vault can be unlocked only once per player"; up to
//     128 players remembered; "A vault ejects 2 to 5 stacks of loot".
//
// Not modelled: ominous trials, the particles and the vault's idle item display.

import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { rollStructureLoot } from './structureLoot.js';

export const TRIAL_RANGE = 14;
export const TRIAL_COOLDOWN = 36000;
export const TRIAL_LOOT = 'minecraft:spawners/trial_chamber/consumables';
export const VAULT_LOOT = 'minecraft:chests/trial_chambers/reward';
export const VAULT_PLAYER_LIMIT = 128;

/** The spawning values for a spawner of this mob and kind ('normal' or 'slow'). */
export function trialValues(mob, kind = 'normal') {
  if (mob === 'breeze') return { interval: 20, total: 2, totalPerPlayer: 1, simultaneous: 1, simultaneousPerPlayer: 0.5 };
  if (kind === 'slow') return { interval: 160, total: 6, totalPerPlayer: 2, simultaneous: 4, simultaneousPerPlayer: 2 };
  return { interval: 20, total: 6, totalPerPlayer: 2, simultaneous: 3, simultaneousPerPlayer: 0.5 };
}

const ROOM = { breeze: 2, bogged: 2, skeleton: 2, stray: 2, zombie: 2, husk: 2, spider: 1, cave_spider: 1, silverfish: 1, slime: 1, baby_zombie: 1 };
const open = (world, x, y, z) => { const id = world.getVoxel(x, y, z); return id === BLOCKS.AIR || BLOCK_DEFS[id]?.solid === false; };

/** A straight line of open blocks between two points (the spawner's own block excepted). */
export function lineOfSight(world, a, b) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.floor(a.x + (b.x - a.x) * t); const y = Math.floor(a.y + (b.y - a.y) * t); const z = Math.floor(a.z + (b.z - a.z) * t);
    if (x === Math.floor(a.x) && y === Math.floor(a.y) && z === Math.floor(a.z)) continue;
    if (!open(world, x, y, z)) return false;
  }
  return true;
}

export class TrialSpawners {
  constructor({ world, mobs, drop = null, random = Math.random }) {
    this.world = world; this.mobs = mobs; this.drop = drop; this.random = random;
    this.state = new Map();
  }

  /** One tick. `players`: `[{ id, position, gamemode }]`. */
  tick(players, { difficulty = 'normal' } = {}) {
    for (const s of this.world.trialSpawners?.() ?? []) {
      if (this.world.getVoxel(s.x, s.y, s.z) !== BLOCKS.TRIAL_SPAWNER) continue;
      const key = `${s.x},${s.y},${s.z}`;
      const st = this.state.get(key) ?? { phase: 'waiting', players: new Set(), spawned: [], made: 0, timer: 0 };
      this.state.set(key, st);
      const centre = { x: s.x + 0.5, y: s.y + 0.5, z: s.z + 0.5 };
      const v = trialValues(s.mob, s.kind);
      if (st.phase === 'cooldown') { if (--st.timer <= 0) Object.assign(st, { phase: 'waiting', players: new Set(), spawned: [], made: 0 }); continue; }
      if (difficulty === 'peaceful') continue;
      for (const p of players) {
        if (p.gamemode !== 'survival' && p.gamemode !== 'adventure') continue;
        if (Math.hypot(p.position.x - centre.x, p.position.y + 0.9 - centre.y, p.position.z - centre.z) >= TRIAL_RANGE) continue;
        if (!lineOfSight(this.world, centre, { x: p.position.x, y: p.position.y + 0.9, z: p.position.z })) continue;
        st.players.add(p.id ?? 'player');
        if (st.phase === 'waiting') { st.phase = 'active'; st.timer = 0; }
      }
      if (st.phase === 'active') {
        const n = Math.max(1, st.players.size);
        const total = v.total + v.totalPerPlayer * (n - 1);
        const simultaneous = Math.floor(v.simultaneous + v.simultaneousPerPlayer * (n - 1));
        const alive = st.spawned.filter((m) => !m.dead && (m.health ?? 1) > 0);
        st.spawned = alive;
        if (st.made >= total && alive.length === 0) { st.phase = 'ejecting'; st.timer = 40; st.ejected = 0; continue; }
        if (--st.timer > 0 || st.made >= total || alive.length >= simultaneous) continue;
        st.timer = v.interval;
        const spot = this.spot(s, centre);
        if (!spot) continue;
        const mob = this.mobs.spawnMob(s.mob === 'baby_zombie' ? 'zombie' : s.mob, spot.x, spot.y, spot.z, { fromTrialSpawner: true, baby: s.mob === 'baby_zombie' });
        if (mob) { if (typeof mob === 'object') { mob.persistenceRequired = true; st.spawned.push(mob); } st.made++; }
      } else if (st.phase === 'ejecting') {
        if (--st.timer > 0) continue;
        // For every detected player: 50% a trial key (for all), otherwise one item each.
        const key = this.random() < 0.5;
        for (let i = 0; i < Math.max(1, st.players.size); i++) {
          if (key) this.drop?.({ x: centre.x, y: s.y + 1.2, z: centre.z }, { id: 'trial_key', isBlock: false, count: 1 });
          else { const stack = rollStructureLoot(TRIAL_LOOT, Math.floor(this.random() * 2 ** 31)).find(Boolean); if (stack) this.drop?.({ x: centre.x, y: s.y + 1.2, z: centre.z }, stack); }
        }
        st.phase = 'cooldown'; st.timer = TRIAL_COOLDOWN;
      }
    }
  }

  spot(s, centre) {
    for (let tries = 0; tries < 8; tries++) {
      const dx = (this.random() * 2 - 1) * 4; const dz = (this.random() * 2 - 1) * 4; const dy = Math.floor(this.random() * 3) - 1;
      if (Math.hypot(dx, dy, dz) > 4) continue;
      const x = centre.x + dx; const y = s.y + dy; const z = centre.z + dz;
      const bx = Math.floor(x); const bz = Math.floor(z);
      let fits = true;
      for (let h = 0; h < (ROOM[s.mob] ?? 2); h++) if (!open(this.world, bx, y + h, bz)) fits = false;
      if (fits && lineOfSight(this.world, centre, { x, y: y + 0.5, z })) return { x, y, z };
    }
    return null;
  }
}

/** A vault: opens once per player with a trial key, ejecting 2-5 stacks of the reward loot. */
export class Vaults {
  constructor({ drop = null, random = Math.random } = {}) { this.drop = drop; this.random = random; this.opened = new Map(); }

  /** Use a key on the vault at (x, y, z). Returns the stacks ejected, or null when this player has opened it. */
  use(x, y, z, playerId, { ominous = false, lootTable = VAULT_LOOT } = {}) {
    const key = `${x},${y},${z}`;
    const list = this.opened.get(key) ?? [];
    if (list.includes(playerId)) return null;
    list.push(playerId);
    if (list.length > VAULT_PLAYER_LIMIT) list.shift();
    this.opened.set(key, list);
    const table = ominous ? 'minecraft:chests/trial_chambers/reward_ominous' : lootTable;
    const stacks = rollStructureLoot(table, Math.floor(this.random() * 2 ** 31)).filter(Boolean);
    const count = Math.min(stacks.length, 2 + Math.floor(this.random() * 4));
    const out = stacks.slice(0, Math.max(2, count));
    for (const stack of out) this.drop?.({ x: x + 0.5, y: y + 1.1, z: z + 0.5 }, stack);
    return out;
  }
}
