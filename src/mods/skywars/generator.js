// The building kit the SkyWars map templates (templates.js) draw with: islands, cages, chests, and the decorations a
// data pack (packs.js) asks for. Pure and seeded, so the host and every guest build the same arena from
// { template, pack, seed }, and a new seed gives a new arena.
import { BLOCKS } from '../../blocks.js';

export const ARENA = Object.freeze({
  /** The default height of the islands' grass; players stand one above it. The world is 64 blocks tall. */
  surfaceY: 30,
  /** Falling below this is falling into the void: out of the game. */
  voidY: -4,
  /** One island per player. */
  maxPlayers: 8,
  /** Blocks of open void between any two islands, at least: a sprint-jump crosses 4, so every gap must be bridged. */
  minGap: 5,
  /** Nothing is built below this or above this (the world is 0-63). */
  minY: 4,
  maxY: 60,
});

/** A small seeded random source (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const cellKey = (x, y, z) => `${x},${y},${z}`;
const columnKey = (x, z) => `${x},${z}`;

/** Chest facing (chest.js CHEST_ROTATIONS): 0 south (+z), 1 west (-x), 2 north (-z), 3 east (+x); toward (dx, dz). */
export const facingToward = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 3 : 1) : (dz > 0 ? 0 : 2));

/** Leaves and logs of each tree kind a pack may name. */
const TREES = {
  oak: { log: 'OAK_LOG', leaves: 'OAK_LEAVES', height: [4, 5], shape: 'round' },
  birch: { log: 'BIRCH_LOG', leaves: 'BIRCH_LEAVES', height: [5, 6], shape: 'round' },
  spruce: { log: 'SPRUCE_LOG', leaves: 'SPRUCE_LEAVES', height: [6, 8], shape: 'cone' },
  jungle: { log: 'JUNGLE_LOG', leaves: 'JUNGLE_LEAVES', height: [6, 8], shape: 'palm' },
  cherry: { log: 'CHERRY_LOG', leaves: 'CHERRY_LEAVES', height: [4, 5], shape: 'wide' },
  acacia: { log: 'ACACIA_LOG', leaves: 'ACACIA_LEAVES', height: [4, 5], shape: 'wide' },
  dark_oak: { log: 'DARK_OAK_LOG', leaves: 'DARK_OAK_LEAVES', height: [4, 6], shape: 'round' },
  azalea: { log: 'OAK_LOG', leaves: 'AZALEA_LEAVES', height: [3, 4], shape: 'round' },
};

export class ArenaBuilder {
  /**
   * @param {{seed:number, generation:object}} a `generation` is a pack's resolved generation settings (packs.js):
   *   palette (block ids), terrain, decorations, center.
   */
  constructor({ seed, generation }) {
    this.seed = seed >>> 0;
    this.random = seededRandom(this.seed);
    this.gen = generation;
    this.blocks = new Map();
    this.reserved = new Set();
    /** Columns of every island so far: a new island keeps ARENA.minGap of void from all of them. */
    this.land = new Set();
    this.islands = [];
    this.chests = [];
    this.spawns = [];
    this.cages = [];
    this.enchantingTables = [];
    this.anvils = [];
    this.decorBase = null;
  }

  int(lo, hi) { return lo + Math.floor(this.random() * (hi - lo + 1)); }
  range(r, fallback = [1, 1]) { const [lo, hi] = Array.isArray(r) ? r : Number.isFinite(r) ? [r, r] : fallback; return this.int(lo, hi); }
  pick(list) { return list[Math.floor(this.random() * list.length)]; }
  chance(p) { return this.random() < p; }

  set(x, y, z, id) {
    if (y < ARENA.minY || y > ARENA.maxY) return;
    // While decorating (decorBase is the island's standing height), a block goes only into air, and never low in a
    // column kept for a cage or a chest: a mushroom cap does not land on a cage, nor a boulder on top of a chest.
    if (this.decorBase !== null && (!this.isAir(x, y, z) || (this.isReserved(x, z) && y <= this.decorBase + 2))) return;
    this.blocks.set(cellKey(x, y, z), id);
  }
  get(x, y, z) { return this.blocks.get(cellKey(x, y, z)) ?? BLOCKS.AIR; }
  isAir(x, y, z) { return !this.blocks.has(cellKey(x, y, z)); }
  reserve(x, z, radius = 0) {
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) this.reserved.add(columnKey(x + dx, z + dz));
  }
  isReserved(x, z) { return this.reserved.has(columnKey(x, z)); }

  /**
   * A floating island: its top flat at `y` (in the pack's surface block, on two of subsurface), its outline wobbling
   * outward by up to the pack's roughness, and a rough cone of core stone with ores hanging under it. Its cells nearer
   * than ARENA.minGap to an island already built are left out, so however rough the outlines, every gap needs a bridge.
   */
  island({ x, z, y = ARENA.surfaceY, radius, role, slot = null }) {
    const { palette, terrain } = this.gen;
    const rough = Math.max(0, Math.min(0.5, terrain.roughness ?? 0.2));
    const phases = [this.random(), this.random(), this.random()].map((p) => p * Math.PI * 2);
    const edgeAt = (a) => radius * (1 + rough * (1 + 0.5 * Math.sin(2 * a + phases[0]) + 0.3 * Math.sin(3 * a + phases[1]) + 0.2 * Math.sin(5 * a + phases[2])) / 2);
    const island = { x, z, y, radius, extent: radius * (1 + rough), role, slot, cells: [], cellSet: new Set() };
    const reach = Math.ceil(island.extent) + 1;
    for (let dx = -reach; dx <= reach; dx++) {
      for (let dz = -reach; dz <= reach; dz++) {
        const d = Math.hypot(dx, dz);
        const edge = edgeAt(Math.atan2(dz, dx));
        if (d > edge + 0.5 || this.nearLand(x + dx, z + dz)) continue;
        const depth = Math.max(1, Math.floor((edge + 0.5 - d) * (terrain.depth ?? 1.6)) + 1) + (this.chance(0.3) ? 1 : 0);
        for (let k = 0; k <= depth + 1; k++) {
          let block = k === 0 ? palette.surface : k <= 2 ? palette.subsurface : palette.core;
          if (k > 2) for (const ore of palette.ores) if (this.random() < ore.chance) { block = ore.block; break; }
          this.set(x + dx, y - k, z + dz, block);
        }
        island.cells.push([x + dx, z + dz]);
        island.cellSet.add(columnKey(x + dx, z + dz));
      }
    }
    for (const [cx, cz] of island.cells) this.land.add(columnKey(cx, cz));
    this.islands.push(island);
    return island;
  }

  /** Whether (x, z) is within ARENA.minGap blocks of void of another island (centre to centre under minGap + 1). */
  nearLand(x, z) {
    const r = ARENA.minGap + 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz < r * r && this.land.has(columnKey(x + dx, z + dz))) return true;
    }
    return false;
  }

  /** Whether (x, z) is on `island` with `margin` cells of it all round. */
  inside(island, x, z, margin = 0) {
    for (let dx = -margin; dx <= margin; dx++) for (let dz = -margin; dz <= margin; dz++) {
      if (!island.cellSet.has(columnKey(x + dx, z + dz))) return false;
    }
    return true;
  }

  /** Where slot `slot` waits: in a glass cage on `island`'s middle, facing (toward.x, toward.z). */
  spawn(slot, island, toward = { x: 0, z: 0 }) {
    const x = island.x, z = island.z, y = island.y + 1;
    const spot = { x: x + 0.5, y, z: z + 0.5, yaw: Math.atan2(x - toward.x, z - toward.z) };
    const cage = [];
    for (let h = 0; h <= 2; h++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) cage.push([x + dx, y + h, z + dz]);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) cage.push([x + dx, y + 3, z + dz]);
    for (let h = 0; h <= 3; h++) this.blocks.delete(cellKey(x, y + h, z));
    for (const [cx, cy, cz] of cage) this.set(cx, cy, cz, this.gen.palette.cage);
    this.reserve(x, z, 2);
    // The way out toward the middle stays clear of decorations: that is where the bridge starts.
    const len = Math.hypot(toward.x - x, toward.z - z) || 1;
    for (let d = 0; d <= Math.ceil(island.extent) + 1; d++) {
      for (const side of [-1, 0, 1]) this.reserve(Math.round(x + ((toward.x - x) / len) * d - ((toward.z - z) / len) * side), Math.round(z + ((toward.z - z) / len) * d + ((toward.x - x) / len) * side));
    }
    this.spawns[slot] = spot;
    this.cages[slot] = cage;
    return spot;
  }

  /** A chest on top of `island` at (x, z), facing (toward.x, toward.z). */
  chest(island, x, z, kind, { slot = null, toward = { x: island.x, z: island.z }, y = island.y + 1 } = {}) {
    this.set(x, y, z, BLOCKS.CHEST);
    this.reserve(x, z, 1);
    const chest = { x, y, z, facing: facingToward(toward.x - x, toward.z - z), kind, slot };
    this.chests.push(chest);
    return chest;
  }

  /** `n` free spots on `island`, at least `margin` cells in from its edge and not on anything reserved. */
  spots(island, n, { margin = 1, spacing = 2, avoidCenter = 0 } = {}) {
    const out = [];
    const candidates = island.cells.filter(([x, z]) => this.inside(island, x, z, margin) && !this.isReserved(x, z)
      && Math.hypot(x - island.x, z - island.z) >= avoidCenter && this.isAir(x, island.y + 1, z));
    for (let tries = 0; out.length < n && tries < candidates.length * 2 && candidates.length; tries++) {
      const [x, z] = this.pick(candidates);
      if (out.some(([ox, oz]) => Math.hypot(ox - x, oz - z) < spacing)) continue;
      if (this.isReserved(x, z)) continue;
      out.push([x, z]);
    }
    return out;
  }

  // --- decorations, as a pack lists them ------------------------------------------------------------------------

  tree(x, y, z, kind = 'oak') {
    const spec = TREES[kind] ?? TREES.oak;
    const log = BLOCKS[spec.log], leaves = BLOCKS[spec.leaves];
    const height = this.range(spec.height);
    for (let h = 0; h < height; h++) this.set(x, y + h, z, log);
    const top = y + height;
    // Low leaves keep off the reserved columns, so a chest is never covered (a chest needs air above it to open).
    const leaf = (lx, ly, lz) => { if (this.isAir(lx, ly, lz) && !(ly <= y + 1 && this.isReserved(lx, lz))) this.set(lx, ly, lz, leaves); };
    if (spec.shape === 'cone') {
      for (let ly = top - 4; ly <= top; ly++) {
        const r = Math.max(0, Math.min(2, Math.floor((top - ly) / 2) + (ly === top ? 0 : 1)));
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (Math.abs(dx) + Math.abs(dz) <= r + 1 && ly >= y + 2) leaf(x + dx, ly, z + dz);
      }
      leaf(x, top + 1, z);
    } else if (spec.shape === 'palm') {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) + Math.abs(dz) <= 2) leaf(x + dx, top, z + dz);
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) leaf(x + dx, top - 1, z + dz);
      leaf(x, top + 1, z);
    } else if (spec.shape === 'wide') {
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.hypot(dx, dz) <= 3.2) leaf(x + dx, top - 1, z + dz);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.hypot(dx, dz) <= 2.2) leaf(x + dx, top, z + dz);
    } else {
      for (let ly = top - 2; ly <= top + 1; ly++) {
        const r = ly >= top ? 1 : 2;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) if (!(Math.abs(dx) === r && Math.abs(dz) === r && this.chance(0.6))) leaf(x + dx, ly, z + dz);
      }
    }
  }

  hugeMushroom(x, y, z, kind = 'red') {
    const height = this.int(4, 5);
    for (let h = 0; h < height; h++) this.set(x, y + h, z, BLOCKS.MUSHROOM_STEM);
    const top = y + height;
    if (kind === 'brown') {
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (Math.abs(dx) + Math.abs(dz) <= 5) this.set(x + dx, top, z + dz, BLOCKS.BROWN_MUSHROOM_BLOCK);
    } else {
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        if (edge) for (let h = -2; h <= 0; h++) this.set(x + dx, top + h, z + dz, BLOCKS.RED_MUSHROOM_BLOCK);
        else this.set(x + dx, top + 1, z + dz, BLOCKS.RED_MUSHROOM_BLOCK);
      }
    }
  }

  hugeFungus(x, y, z, kind = 'crimson') {
    const stem = kind === 'warped' ? BLOCKS.WARPED_STEM : BLOCKS.CRIMSON_STEM;
    const wart = kind === 'warped' ? BLOCKS.WARPED_WART_BLOCK : BLOCKS.NETHER_WART_BLOCK;
    const height = this.int(4, 6);
    for (let h = 0; h < height; h++) this.set(x, y + h, z, stem);
    const top = y + height;
    for (let ly = top - 2; ly <= top; ly++) {
      const r = ly === top ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (!this.isAir(x + dx, ly, z + dz)) continue;
        this.set(x + dx, ly, z + dz, this.chance(0.12) ? BLOCKS.SHROOMLIGHT : wart);
      }
    }
  }

  /** A column of `block`, `width` 1 or 2, tapering to a point, with an optional `cap`: ice spikes, basalt, obsidian pillars, cactus. */
  spike(x, y, z, { block, height = 4, width = 1, cap = null }) {
    for (let h = 0; h < height; h++) {
      const w = h < height * 0.6 ? width : 1;
      for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < w; dz++) this.set(x + dx, y + h, z + dz, block);
    }
    if (cap) this.set(x, y + height, z, cap);
  }

  boulder(x, y, z, { block, size = 1 }) {
    for (let dx = -size; dx <= size; dx++) for (let dz = -size; dz <= size; dz++) for (let h = 0; h <= size; h++) {
      if (Math.hypot(dx, dz, h * 1.3) <= size + 0.3) this.set(x + dx, y + h, z + dz, block);
    }
  }

  /** A pool of water or lava sunk one block into the surface, walled by the island all round. */
  pool(island, x, z, { fluid, radius = 1 }) {
    if (!this.inside(island, x, z, radius + 1)) return false;
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) {
      if (this.isReserved(x + dx, z + dz)) return false;
      if (!this.isAir(x + dx, island.y + 1, z + dz)) return false;
      if (this.isAir(x + dx, island.y - 1, z + dz)) return false;
    }
    for (let dx = -radius; dx <= radius; dx++) for (let dz = -radius; dz <= radius; dz++) this.blocks.set(cellKey(x + dx, island.y, z + dz), fluid);
    this.reserve(x, z, radius + 1);
    return true;
  }

  /** A broken wall: an L of `blocks`, one to `height` high, with gaps, as ruins. */
  ruin(x, y, z, { blocks, height = 3 }) {
    const lx = this.int(3, 5), lz = this.int(2, 4);
    const sx = this.chance(0.5) ? 1 : -1, sz = this.chance(0.5) ? 1 : -1;
    const cells = [];
    for (let i = 0; i < lx; i++) cells.push([x + i * sx, z]);
    for (let i = 1; i < lz; i++) cells.push([x, z + i * sz]);
    for (const [cx, cz] of cells) {
      if (this.isReserved(cx, cz)) continue;
      const h = this.int(0, height);
      for (let k = 0; k < h; k++) this.set(cx, y + k, cz, this.pick(blocks));
    }
  }

  /** A post `height` high with a light on top. */
  lampPost(x, y, z, { post, light, height = 2 }) {
    for (let h = 0; h < height; h++) this.set(x, y + h, z, post);
    this.set(x, y + height, z, light);
  }

  /** A striped pillar (a candy cane): `blocks` alternate up it, and it hooks over at the top. */
  stripedPillar(x, y, z, { blocks, height = 5 }) {
    for (let h = 0; h < height; h++) this.set(x, y + h, z, blocks[h % blocks.length]);
    this.set(x + 1, y + height, z, blocks[height % blocks.length]);
    this.set(x + 2, y + height - 1, z, blocks[(height + 1) % blocks.length]);
  }

  /** Something hanging from the underside of an island: icicles, roots, dripstone. */
  hang(island, x, z, { block, length = 2 }) {
    let y = island.y;
    while (!this.isAir(x, y - 1, z)) y--;
    for (let k = 1; k <= length; k++) this.set(x, y - k, z, block);
  }

  /** Every decoration a pack lists, on the islands of the roles it names. */
  decorate() {
    for (const deco of this.gen.decorations) {
      for (const island of this.islands) {
        if (!deco.on.includes(island.role)) continue;
        const y = island.y + 1;
        this.decorBase = y;
        if (deco.type === 'plants') {
          for (const [x, z] of island.cells) {
            if (this.isReserved(x, z) || !this.isAir(x, y, z) || this.get(x, island.y, z) !== this.gen.palette.surface) continue;
            if (this.random() < deco.density) this.set(x, y, z, this.pick(deco.blocks));
          }
          continue;
        }
        if (deco.type === 'hanging') {
          for (const [x, z] of island.cells) if (!this.inside(island, x, z, 1) && this.random() < deco.density) this.hang(island, x, z, { block: deco.block, length: this.range(deco.length, [1, 3]) });
          continue;
        }
        const count = this.range(deco.count, [1, 1]);
        const big = ['tree', 'huge_mushroom', 'huge_fungus', 'ruin'].includes(deco.type);
        if (deco.type === 'pool') {
          // A pool needs island all round it: try more spots, keep the first that fit, and on a crowded island make do
          // with a pool of one block.
          const radius = this.range(deco.radius, [1, 1]);
          let placed = 0;
          for (const r of radius > 0 ? [radius, 0] : [0]) {
            for (const [x, z] of this.spots(island, count * 8, { margin: r + 1, spacing: 1, avoidCenter: island.role === 'center' ? 2 : 0 })) {
              if (placed >= count) break;
              if (this.pool(island, x, z, { fluid: deco.fluid, radius: r })) placed++;
            }
          }
          continue;
        }
        for (const [x, z] of this.spots(island, count, { margin: 1, spacing: big ? 4 : 3, avoidCenter: island.role === 'center' ? 3 : 0 })) {
          if (deco.type === 'tree') this.tree(x, y, z, deco.kind);
          else if (deco.type === 'huge_mushroom') this.hugeMushroom(x, y, z, deco.kind);
          else if (deco.type === 'huge_fungus') this.hugeFungus(x, y, z, deco.kind);
          else if (deco.type === 'spike') this.spike(x, y, z, { block: deco.block, height: this.range(deco.height, [3, 6]), width: this.range(deco.width, [1, 1]), cap: deco.cap });
          else if (deco.type === 'boulder') this.boulder(x, y, z, { block: deco.block, size: this.range(deco.size, [1, 1]) });
          else if (deco.type === 'ruin') this.ruin(x, y, z, { blocks: deco.blocks, height: this.range(deco.height, [2, 3]) });
          else if (deco.type === 'lamp_post') this.lampPost(x, y, z, { post: deco.post, light: deco.light ?? this.gen.palette.light, height: this.range(deco.height, [2, 2]) });
          else if (deco.type === 'striped_pillar') this.stripedPillar(x, y, z, { blocks: deco.blocks, height: this.range(deco.height, [4, 6]) });
          this.reserve(x, z, big ? 2 : 1);
        }
      }
    }
    this.decorBase = null;
  }

  /** The middle's tables, and its feature: a great tree, lamp posts, a small tower or nothing. */
  centerPieces(island) {
    const center = this.gen.center;
    const y = island.y + 1;
    const spots = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, 1]];
    let n = 0;
    const place = (block, list) => {
      const [dx, dz] = spots[n++ % spots.length];
      this.set(island.x + dx, y, island.z + dz, block);
      list.push([island.x + dx, y, island.z + dz]);
    };
    for (let i = 0; i < center.enchanting_tables; i++) place(BLOCKS.ENCHANTING_TABLE, this.enchantingTables);
    for (let i = 0; i < center.anvils; i++) place(BLOCKS.ANVIL, this.anvils);
    if (center.brewing_stand) place(BLOCKS.BREWING_STAND, []);
    this.reserve(island.x, island.z, 1);
    const ring = Math.max(4, Math.round(island.radius * 0.7));
    if (center.feature === 'lamp_posts') {
      for (const [dx, dz] of [[-ring, 0], [ring, 0], [0, -ring], [0, ring]]) if (this.inside(island, island.x + dx, island.z + dz) && !this.isReserved(island.x + dx, island.z + dz)) {
        this.lampPost(island.x + dx, y, island.z + dz, { post: this.gen.palette.accent, light: this.gen.palette.light, height: 1 });
        this.reserve(island.x + dx, island.z + dz, 1);
      }
    } else if (center.feature === 'tree' || center.feature === 'huge_mushroom' || center.feature === 'huge_fungus') {
      const [x, z] = this.spots(island, 1, { margin: 2, avoidCenter: 3 })[0] ?? [];
      if (x !== undefined) {
        if (center.feature === 'tree') this.tree(x, y, z, center.kind ?? 'oak');
        else if (center.feature === 'huge_mushroom') this.hugeMushroom(x, y, z, center.kind ?? 'red');
        else this.hugeFungus(x, y, z, center.kind ?? 'crimson');
        this.reserve(x, z, 2);
      }
    } else if (center.feature === 'beacon_tower') {
      // A pillar of the accent block with the light on top, beside the tables: seen from every island.
      const [x, z] = this.spots(island, 1, { margin: 1, avoidCenter: 2 })[0] ?? [island.x + 2, island.z + 2];
      for (let h = 0; h < 6; h++) this.set(x, y + h, z, this.gen.palette.accent);
      this.set(x, y + 6, z, this.gen.palette.light);
      this.reserve(x, z, 1);
    }
  }

  /** The finished arena. */
  finish({ template, pack, spectator }) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const key of this.blocks.keys()) {
      const [x, , z] = key.split(',').map(Number);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    return {
      template, pack, seed: this.seed,
      blocks: this.blocks,
      chests: this.chests,
      spawns: this.spawns,
      cages: this.cages,
      islands: this.islands.map(({ x, z, y, radius, extent, role, slot, cells }) => ({ x, z, y, radius, extent, role, slot, cells })),
      enchantingTables: this.enchantingTables,
      anvils: this.anvils,
      spectator,
      bounds: { minX: minX - 2, maxX: maxX + 2, minY: 0, maxY: 63, minZ: minZ - 2, maxZ: maxZ + 2 },
    };
  }
}
