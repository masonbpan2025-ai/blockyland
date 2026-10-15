// Leaf decay.
//
// Wiki (Leaves): "Leaves from trees spontaneously decay (disappear) when they receive a block tick if they are not
// connected to any log or wood blocks, stripped or otherwise, either directly or via other leaf blocks, with a maximum
// distance of 6 blocks". Player-placed leaves are `persistent` and never decay. "Leaves that decay have the same drop
// chances as when broken by players, yielding saplings 5% of the time, sticks 2% of the time ... Oak and dark oak
// leaves also have a separate but additional 0.5% chance of dropping an apple."
//
// A block gets a random tick with probability randomTickSpeed (3) / 4096 per game tick, 20 ticks a second, so a
// cut-off leaf waits on average 4096 / 60 = 68.3 s -- "the leaves automatically decay after a few minutes" (Tutorial:
// Your first 10 minutes). Before this existed leaves never decayed, and every felled tree left its canopy in the air.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { blockDrops } from './blockDrops.js';

const NAME = new Map(Object.entries(BLOCKS).map(([n, id]) => [id, n]));
export const isLeaves = (id) => /_LEAVES$/.test(NAME.get(id) || '');
/** The `prevents_nearby_leaf_decay` tag: every log and wood, stripped or not (and the mangrove's roots are not). */
export const keepsLeaves = (id) => /(_LOG|_WOOD)$/.test(NAME.get(id) || '') && !/PETRIFIED/.test(NAME.get(id) || '');
export const MAX_DISTANCE = 6;
export const MEAN_RANDOM_TICK_SECONDS = 4096 / (3 * 20);
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const key = (x, y, z) => `${x},${y},${z}`;

export class LeafDecay {
  constructor(world) {
    this.world = world;
    this.persistent = new Set();
    this.doomed = new Map(); // "x,y,z" -> seconds until its next random tick
    this.random = Math.random;
  }
  reset() { this.doomed.clear(); }

  /** A player placed a block: leaves placed by a player never decay. */
  onPlaced(x, y, z, id) { if (isLeaves(id)) this.persistent.add(key(x, y, z)); }

  /** Distance from the leaves at x,y,z to the nearest log through leaves, or Infinity beyond 6. */
  distance(x, y, z) {
    let frontier = [[x, y, z]]; const seen = new Set([key(x, y, z)]);
    for (let d = 1; d <= MAX_DISTANCE; d++) {
      const next = [];
      for (const [cx, cy, cz] of frontier) for (const [dx, dy, dz] of FACES) {
        const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = key(nx, ny, nz);
        if (seen.has(k)) continue; seen.add(k);
        const id = this.world.getVoxel(nx, ny, nz);
        if (keepsLeaves(id)) return d;
        if (isLeaves(id)) next.push([nx, ny, nz]);
      }
      frontier = next;
    }
    return Infinity;
  }

  /** A block changed. When a log or leaves went away, the leaves around it may have lost their tree. */
  notify(x, y, z, previous, id) {
    if (previous === id) return;
    if (isLeaves(previous) && !isLeaves(id)) { this.persistent.delete(key(x, y, z)); this.doomed.delete(key(x, y, z)); }
    if (!(keepsLeaves(previous) || isLeaves(previous))) return;
    // Every leaf whose distance could have changed lies within 6 blocks (taxicab) of the change.
    for (let dx = -MAX_DISTANCE; dx <= MAX_DISTANCE; dx++) for (let dy = -MAX_DISTANCE; dy <= MAX_DISTANCE; dy++) for (let dz = -MAX_DISTANCE; dz <= MAX_DISTANCE; dz++) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > MAX_DISTANCE) continue;
      const lx = x + dx, ly = y + dy, lz = z + dz, k = key(lx, ly, lz);
      if (this.doomed.has(k) || this.persistent.has(k) || !isLeaves(this.world.getVoxel(lx, ly, lz))) continue;
      if (this.distance(lx, ly, lz) === Infinity) this.doomed.set(k, this.nextRandomTick());
    }
  }

  /** Seconds until a block's next random tick: geometric in game ticks, exponential in the limit. */
  nextRandomTick() { return -Math.log(1 - this.random()) * MEAN_RANDOM_TICK_SECONDS; }

  update(dt) {
    if (!this.doomed.size) return;
    for (const [k, t] of this.doomed) {
      if (t - dt > 0) { this.doomed.set(k, t - dt); continue; }
      this.doomed.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      const id = this.world.getVoxel(x, y, z);
      // The random tick re-reads the block: a log placed since, or a player's leaves, save it.
      if (!isLeaves(id) || this.persistent.has(k) || this.distance(x, y, z) !== Infinity) continue;
      this.world.setVoxel(x, y, z, BLOCKS.AIR);
      const items = this.world.game?.entities;
      for (const drop of blockDrops(id, this.random)) {
        if (drop.id === id) continue; // the leaves themselves come only with shears or Silk Touch
        items?.spawnDroppedItem?.(new THREE.Vector3(x + 0.5, y + 0.25, z + 0.5), drop.id, drop.isBlock, drop.count);
      }
    }
  }
}
