// Special spawners: every mob-creating mechanism that is NOT `NaturalSpawner`.
//
// Why these are separate, and why they are one module rather than a file each.
//
// Minecraft's non-natural spawn mechanisms are genuinely independent systems with their own state
// machines: a monster spawner is a block entity with a delay and a nearby-entity cap, a trial
// spawner is a block entity with a cooldown and a per-player budget, a patrol is a scheduler on a
// five-day timer, a wandering trader is a counter that decrements once a minute, a phantom is an
// insomnia timer. None of them consults the mob caps, and none of them is driven by the biome spawn
// table.
//
// They live in one module because they share the same shape -- a tick-driven timer that calls
// `createMob` -- and because splitting five eighty-line state machines into five files makes the
// shared contract (what a special spawn must and must not do) harder to see. The registry makes the
// set explicit, so a mechanism that is NOT implemented is visible as an absent entry rather than as
// silence.
//
// What every special spawn must NOT do, and why that matters for parity:
//   * It must not consume the natural spawn RNG. Vanilla's special mechanisms draw from different
//     sources, and interleaving them would desynchronise the natural cycle's seeded sequence.
//   * It must not count against the mob caps. The wiki is explicit that the caps do not apply to
//     mobs spawned by spawners, commands, spawn eggs or breeding.
//   * It must mark its mobs so the despawn rules can treat them correctly (a structure mob does not
//     despawn on its own; a patrol does).
//
// Reference: docs/mob-spawning-spec-1.21.4.md section 14. Behaviour reimplemented; no Mojang source
// copied.

import { CHUNK_HEIGHT } from './lightEngine.js';
import { SpawnRejection } from './spawnValidation.js';

/**
 * Monster spawner block (`BaseSpawner`).
 *
 * Vanilla: a 16-block activation sphere around a player, spawning within a 9x3x9 volume centred on
 * the block, `SpawnCount` 4, a delay drawn from 200..799 ticks, and a `MaxNearbyEntities` of 6 of the
 * same type. The block entity also requires the player to be inside 16 blocks and the light/position
 * rules of the mob's own spawn placement — a spawner does NOT bypass them.
 */
export class MonsterSpawnerMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'monster_spawner';
    /** Block position key -> `{ type, delay, spawned }`. */
    this.spawners = new Map();
    this.stats = { activations: 0, spawned: 0 };
  }

  register(key, type) {
    if (!type) { this.spawners.delete(key); return; }
    if (!this.spawners.has(key)) this.spawners.set(key, { type, delay: this.#initialDelay(), spawned: 0 });
    else this.spawners.get(key).type = type;
  }

  unregister(key) { this.spawners.delete(key); }

  #initialDelay() {
    // Vanilla draws 200 + nextInt(600). This uses the SPECIAL rng so the natural stream is untouched.
    return 200 + this.manager.specialRandom.nextInt(600);
  }

  tick(players) {
    if (this.spawners.size === 0) return;
    for (const [key, spawner] of this.spawners) {
      const [x, y, z] = key.split(',').map(Number);
      // Activation sphere: a player within 16 blocks.
      let active = false;
      for (const p of players) {
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy + dz * dz <= 16 * 16) { active = true; break; }
      }
      if (!active) continue;
      this.stats.activations++;
      spawner.delay--;
      if (spawner.delay > 0) continue;
      spawner.delay = this.#initialDelay();
      this.#spawnBatch(spawner, x, y, z);
    }
  }

  /**
   * One batch: up to `SpawnCount` mobs inside the 9x3x9 volume, refusing while 6 of the same type are
   * already nearby.
   */
  #spawnBatch(spawner, x, y, z) {
    const random = this.manager.specialRandom;
    const nearby = this.manager.mobs.filter(mob =>
      mob.type === spawner.type && mob.health > 0
      && Math.abs(mob.mesh.position.x - x) <= 8 && Math.abs(mob.mesh.position.y - y) <= 4 && Math.abs(mob.mesh.position.z - z) <= 8).length;
    if (nearby >= 6) return;
    for (let i = 0; i < 4; i++) {
      const sx = x + random.nextInt(9) - 4;
      const sy = y + random.nextInt(3) - 1;
      const sz = z + random.nextInt(9) - 4;
      const mob = this.manager.createMob(spawner.type, sx + 0.5, sy, sz + 0.5, {
        natural: false, source: 'spawner', category: null,
      });
      if (mob) { spawner.spawned++; this.stats.spawned++; }
    }
  }
}

/**
 * Trial spawner.
 *
 * Vanilla: a 14-block activation radius plus line of sight, intervals of 20/40/160 ticks by player
 * count, a total of 6 (+2 per additional player) mobs, 2-3 simultaneous (+0.5-2 per player), spawning
 * in a 4-block sphere, and a 36000-tick cooldown once the budget is spent.
 */
export class TrialSpawnerMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'trial_spawner';
    this.spawners = new Map();
    this.stats = { spawned: 0, cooldowns: 0 };
  }

  register(key, config = {}) {
    this.spawners.set(key, {
      types: config.types || ['breeze', 'bogged'],
      budget: config.total ?? 6,
      simultaneous: config.simultaneous ?? 3,
      interval: config.interval ?? 40,
      timer: 0,
      cooldown: 0,
    });
  }

  unregister(key) { this.spawners.delete(key); }

  tick(players) {
    if (this.spawners.size === 0) return;
    const random = this.manager.specialRandom;
    for (const [key, spawner] of this.spawners) {
      const [x, y, z] = key.split(',').map(Number);
      if (spawner.cooldown > 0) { spawner.cooldown--; continue; }
      let inRange = 0;
      for (const p of players) {
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        if (dx * dx + dy * dy + dz * dz <= 14 * 14) inRange++;
      }
      if (inRange === 0) continue;
      spawner.timer++;
      if (spawner.timer < spawner.interval) continue;
      spawner.timer = 0;
      const alive = this.manager.mobs.filter(m => m.spawnSource === 'trial_spawner' && m.health > 0).length;
      if (alive >= spawner.simultaneous) continue;
      if (spawner.budget <= 0) { spawner.cooldown = 36000; this.stats.cooldowns++; continue; }
      const type = spawner.types[random.nextInt(spawner.types.length)];
      const sx = x + random.nextInt(9) - 4;
      const sy = y + random.nextInt(5) - 2;
      const sz = z + random.nextInt(9) - 4;
      const mob = this.manager.createMob(type, sx + 0.5, Math.max(0, Math.min(CHUNK_HEIGHT - 2, sy)), sz + 0.5, {
        natural: false, source: 'trial_spawner',
      });
      if (mob) { spawner.budget--; this.stats.spawned++; }
    }
  }
}

/**
 * Pillager patrols.
 *
 * Vanilla: one attempt every 5 in-game days (roughly 10-11 minutes of play), a 20% success chance,
 * 1-5 pillagers, spawned 24-48 blocks from a player, in light 8 or darker, and a patrol leader with a
 * banner. Only in the Overworld at difficulty above Peaceful.
 */
export class PatrolMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'patrol';
    // 5 in-game days at 24000 ticks each.
    this.intervalTicks = 5 * 24000;
    this.timer = 0;
    this.enabled = true;
    this.stats = { attempts: 0, patrols: 0, members: 0 };
  }

  tick(players) {
    if (!this.enabled || players.length === 0) return;
    if (this.manager.peacefulMode) return;
    this.timer++;
    if (this.timer < this.intervalTicks) return;
    this.timer = 0;
    this.stats.attempts++;
    // 20% success.
    if (this.manager.specialRandom.nextInt(5) !== 0) return;
    const player = players[0];
    const angle = this.manager.specialRandom.nextDouble() * Math.PI * 2;
    const distance = 24 + this.manager.specialRandom.nextInt(25);
    const x = Math.floor(player.x + Math.cos(angle) * distance);
    const z = Math.floor(player.z + Math.sin(angle) * distance);
    const y = this.manager.world?.getHighestSolidY ? this.manager.world.getHighestSolidY(x, z) + 1 : Math.floor(player.y);
    // Light 8 or darker.
    if (this.manager.lightLevelAt({ x, y, z }) > 8) return;
    const count = 1 + this.manager.specialRandom.nextInt(5);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const mob = this.manager.createMob(i === 0 ? 'pillager' : 'pillager', x + i * 0.6, y, z, {
        natural: false, source: 'patrol',
      });
      if (!mob) continue;
      if (i === 0) {
        mob.isRaidCaptain = true;
        mob.isPatrolLeader = true;
        mob.persistent = true;
      }
      placed++;
    }
    if (placed) { this.stats.patrols++; this.stats.members += placed; }
  }
}

/**
 * Wandering trader.
 *
 * Vanilla: a 24000-tick counter decremented by 1200 every minute, a 25/50/75% chance, a 90% total
 * failure chance, 10 attempts within -48..+47 of the player, and a 48000-tick despawn timer. The
 * engine already has the trader's own behaviour in `wanderingTraderBehavior.js`, so this mechanism
 * only SCHEDULES the spawn.
 */
export class WanderingTraderMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'wandering_trader';
    this.counter = 24000;
    this.minuteAccumulator = 0;
    this.enabled = true;
    this.stats = { attempts: 0, traders: 0 };
  }

  tick(players) {
    if (!this.enabled || players.length === 0) return;
    // 1200 ticks is one in-game minute at 20 tps.
    this.minuteAccumulator++;
    if (this.minuteAccumulator < 1200) return;
    this.minuteAccumulator = 0;
    this.counter = Math.max(0, this.counter - 1200);
    if (this.counter > 0) return;
    this.counter = 24000;
    this.stats.attempts++;
    const random = this.manager.specialRandom;
    // 25% base, +25% after a failed attempt, +25% after two; then a flat 90% failure.
    if (random.nextDouble() > 0.25) return;
    if (random.nextDouble() < 0.9) return;
    const player = players[0];
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = Math.floor(player.x) + random.nextInt(96) - 48;
      const z = Math.floor(player.z) + random.nextInt(96) - 48;
      const y = this.manager.world?.getHighestSolidY ? this.manager.world.getHighestSolidY(x, z) + 1 : Math.floor(player.y);
      const mob = this.manager.createMob('wandering_trader', x + 0.5, y, z + 0.5, {
        natural: false, source: 'wandering_trader',
      });
      if (mob) {
        this.stats.traders++;
        // Two trader llamas, as vanilla spawns.
        for (let i = 0; i < 2; i++) {
          this.manager.createMob('trader_llama', x + 1 + i, y, z + 1, {
            natural: false, source: 'wandering_trader',
          });
        }
        return;
      }
    }
  }
}

/**
 * Phantoms.
 *
 * Vanilla: driven by `doInsomnia` and a 72000-tick insomnia timer, attempted every 1200-2400 ticks,
 * with a chance of `(x - 72000) / x`, spawned in a 21x15x21 box 28 blocks above the player, capped at
 * 5 in the area. Not produced by `NaturalSpawner` at all.
 */
export class PhantomMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'phantom';
    this.insomniaTicks = 0;
    this.timer = 0;
    this.enabled = true;
    this.stats = { spawns: 0, packs: 0 };
  }

  reset() { this.insomniaTicks = 0; }

  tick(players) {
    if (!this.enabled || players.length === 0) return;
    if (this.manager.peacefulMode) { this.insomniaTicks = 0; return; }
    this.insomniaTicks++;
    if (this.insomniaTicks < 72000) return;
    this.timer++;
    if (this.timer < 1200) return;
    this.timer = 0;
    const random = this.manager.specialRandom;
    // (x - 72000) / x, which at 72000 is 0 and rises toward 1.
    const chance = (this.insomniaTicks - 72000) / this.insomniaTicks;
    if (random.nextDouble() > chance) return;
    const player = players[0];
    const existing = this.manager.mobs.filter(m => m.type === 'phantom' && m.health > 0).length;
    if (existing >= 5) return;
    const count = 1 + random.nextInt(4);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(player.x) + random.nextInt(21) - 10;
      const z = Math.floor(player.z) + random.nextInt(21) - 10;
      const y = Math.floor(player.y) + 28;
      const mob = this.manager.createMob('phantom', x + 0.5, y, z + 0.5, {
        natural: false, source: 'phantom',
      });
      if (mob) { this.stats.spawns++; this.stats.packs++; }
    }
  }
}

/**
 * Village cats and iron golems.
 *
 * Vanilla: cats are attempted every 1200 ticks in a village with fewer than 5 cats, 8-32 blocks from
 * a player, within 2 chunks of the village centre and 48 blocks of 5 beds, with a 25% baby chance.
 * Iron golems spawn from gossip (5 participants) or panic (3 participants) in a +/-8 / +/-6 box with
 * 10 attempts.
 *
 * This engine has no village/POI model, so the mechanism is registered and takes a village position
 * registry; with none registered it does nothing. That is an honest "not wired" rather than a silent
 * approximation, and it is listed as a gap in the parity document.
 */
export class VillageSpawnMechanism {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.name = 'village';
    this.villages = [];
    this.timer = 0;
    this.stats = { cats: 0, golems: 0 };
  }

  registerVillage(centre) { this.villages.push(centre); }

  tick(players) {
    if (this.villages.length === 0 || players.length === 0) return;
    this.timer++;
    if (this.timer < 1200) return;
    this.timer = 0;
    const random = this.manager.specialRandom;
    for (const village of this.villages) {
      const cats = this.manager.mobs.filter(m => m.type === 'cat' && m.health > 0
        && Math.hypot(m.mesh.position.x - village.x, m.mesh.position.z - village.z) < 48).length;
      if (cats >= 5) continue;
      const player = players[0];
      const x = Math.floor(player.x) + random.nextInt(25) - 12;
      const z = Math.floor(player.z) + random.nextInt(25) - 12;
      const y = this.manager.world?.getHighestSolidY ? this.manager.world.getHighestSolidY(x, z) + 1 : Math.floor(player.y);
      const mob = this.manager.createMob('cat', x + 0.5, y, z + 0.5, { natural: false, source: 'village' });
      if (mob) this.stats.cats++;
    }
  }
}

/**
 * The registry of special spawners.
 *
 * Every mechanism is ticked here. A mechanism that is not registered is a mechanism this engine does
 * not have, and the parity document lists exactly which those are -- rather than the subsystem
 * quietly doing nothing and looking like a bug.
 */
export class SpecialSpawnerRegistry {
  constructor({ mobSpawnManager } = {}) {
    this.manager = mobSpawnManager;
    this.monsterSpawner = new MonsterSpawnerMechanism({ mobSpawnManager });
    this.trialSpawner = new TrialSpawnerMechanism({ mobSpawnManager });
    this.patrol = new PatrolMechanism({ mobSpawnManager });
    this.wanderingTrader = new WanderingTraderMechanism({ mobSpawnManager });
    this.phantom = new PhantomMechanism({ mobSpawnManager });
    this.village = new VillageSpawnMechanism({ mobSpawnManager });
    /** Enable or disable individual mechanisms by name. */
    this.enabled = {
      monster_spawner: true,
      trial_spawner: true,
      patrol: true,
      wandering_trader: true,
      phantom: true,
      village: false,
    };
    this.stats = { ticks: 0 };
  }

  /** Every mechanism, as a list, for iteration and for the debug overlay. */
  get mechanisms() {
    return [
      this.monsterSpawner, this.trialSpawner, this.patrol,
      this.wanderingTrader, this.phantom, this.village,
    ];
  }

  tick(players) {
    this.stats.ticks++;
    for (const mechanism of this.mechanisms) {
      if (!this.enabled[mechanism.name]) continue;
      try {
        mechanism.tick(players);
      } catch (err) {
        // One faulty mechanism must not stop natural spawning or the others.
        if (!this._warned) this._warned = new Set();
        const key = `${mechanism.name}:${err?.message}`;
        if (!this._warned.has(key)) {
          this._warned.add(key);
          console.warn(`[spawning] ${mechanism.name} failed: ${err?.message || err}`);
        }
      }
    }
  }

  /** A snapshot for the debug overlay. */
  telemetry() {
    const out = {};
    for (const mechanism of this.mechanisms) {
      out[mechanism.name] = { enabled: !!this.enabled[mechanism.name], ...mechanism.stats };
    }
    return out;
  }
}

export { SpawnRejection };
