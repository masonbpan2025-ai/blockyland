// Monster spawners, from the wiki (https://minecraft.wiki/w/Monster_Spawner).
//
//   * "A monster spawner activates when a player, who is not in Spectator mode, comes within a spherical radius of 16
//     blocks from the center point of the block";
//   * "attempts to spawn 4 mobs at randomly chosen points within the spawning volume [a 9x3x9 volume centered on the
//     monster spawner], then waits anywhere from 200 to 799 ticks"; "If the monster spawner fails to spawn any mobs
//     because it did not pick any suitable locations, it repeats this process every tick until it succeeds";
//   * "If 6 or more mobs of a monster spawner's type have their hitbox intersecting a 9x9x9 volume centered on the
//     monster spawner block ... the monster spawner 'poofs' without creating any mobs";
//   * "the general solid block requirement is removed, but the volume (hitbox of the mob) is kept": a spot needs room
//     for the mob's height; "a torch placed on any side or top of the monster spawner is sufficient to disable it"
//     for mobs that need light level 0, and "For a blaze or silverfish spawner, a light level of 12 is required";
//   * "In Peaceful difficulty, monster spawners still activate but do not spawn monsters".
//
// Structures place spawners with the mob they spawn (the world keeps it with the block's orientation data); this
// module runs them. Not modelled: the spinning mob model and the particles.

import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const SPAWNER_RANGE = 16;
export const SPAWN_ATTEMPTS = 4;
export const NEARBY_CAP = 6;
export const MIN_DELAY = 200;
export const MAX_DELAY = 799;

/** Mob height in blocks (how much empty room a spot needs) and the light it needs. */
const MOB_ROOM = { zombie: 2, skeleton: 2, blaze: 2, spider: 1, cave_spider: 1, silverfish: 1, magma_cube: 3 };
const BRIGHT_OK = new Set(['blaze', 'silverfish']); // light below 12
const ANY_LIGHT = new Set(['magma_cube']);

export function lightAllows(mob, light) {
  if (ANY_LIGHT.has(mob)) return true;
  if (BRIGHT_OK.has(mob)) return light < 12;
  return light === 0;
}

const isOpen = (world, x, y, z) => {
  const id = world.getVoxel(x, y, z);
  const def = BLOCK_DEFS[id];
  return id === BLOCKS.AIR || (def && def.solid === false && !def.liquid);
};

export class MonsterSpawners {
  /**
   * @param {object} options
   * @param {object} options.world   getVoxel, getLightLevel, spawners() -> [{x, y, z, mob}]
   * @param {object} options.mobs    spawnMob(type, x, y, z, options), mobs: [{type, mesh.position}]
   * @param {() => number} [options.random]
   */
  constructor({ world, mobs, random = Math.random }) {
    this.world = world;
    this.mobs = mobs;
    this.random = random;
    this.delays = new Map();
  }

  /** One game tick. `player` is `{ position, gamemode }`. Returns how many mobs were spawned. */
  tick(player, { difficulty = 'normal' } = {}) {
    if (!player || player.gamemode === 'spectator') return 0;
    let spawned = 0;
    for (const s of this.world.spawners?.() ?? []) {
      if (this.world.getVoxel(s.x, s.y, s.z) !== BLOCKS.SPAWNER || !s.mob) continue;
      const p = player.position;
      if (Math.hypot(p.x - (s.x + 0.5), p.y - (s.y + 0.5), p.z - (s.z + 0.5)) > SPAWNER_RANGE) continue;
      const key = `${s.x},${s.y},${s.z}`;
      const delay = this.delays.get(key) ?? 20;
      if (delay > 0) { this.delays.set(key, delay - 1); continue; }
      const n = this.spawnFrom(s, difficulty);
      spawned += n;
      // A cycle that spawned nothing is retried next tick; a poof or a success waits 200-799 ticks.
      if (n > 0 || n === -1) this.delays.set(key, MIN_DELAY + Math.floor(this.random() * (MAX_DELAY - MIN_DELAY + 1)));
      if (n === -1) spawned += 0;
    }
    return Math.max(0, spawned);
  }

  /** One spawn cycle: up to 4 mobs, or -1 for a poof. */
  spawnFrom(s, difficulty) {
    const nearby = () => (this.mobs.mobs ?? []).filter((m) => m.type === s.mob && !m.dead && m.mesh
      && Math.abs(m.mesh.position.x - (s.x + 0.5)) <= 4.5 && Math.abs(m.mesh.position.y - (s.y + 0.5)) <= 4.5 && Math.abs(m.mesh.position.z - (s.z + 0.5)) <= 4.5).length;
    let count = 0;
    for (let i = 0; i < SPAWN_ATTEMPTS; i++) {
      if (nearby() >= NEARBY_CAP) return count || -1;
      const x = s.x + 0.5 + (this.random() - this.random()) * 4;
      const y = s.y + Math.floor(this.random() * 3) - 1;
      const z = s.z + 0.5 + (this.random() - this.random()) * 4;
      const bx = Math.floor(x); const bz = Math.floor(z);
      const room = MOB_ROOM[s.mob] ?? 2;
      let fits = true;
      for (let dy = 0; dy < room; dy++) if (!isOpen(this.world, bx, y + dy, bz)) { fits = false; break; }
      if (!fits) continue;
      const light = this.world.getLightLevel ? this.world.getLightLevel(bx, y, bz) : 0;
      if (!lightAllows(s.mob, light)) continue;
      if (difficulty === 'peaceful') continue;
      if (this.mobs.spawnMob(s.mob, x, y, z, { fromSpawner: true })) count++;
    }
    return count;
  }
}
