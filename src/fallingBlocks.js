// Gravity-affected blocks: sand, red sand, gravel, suspicious sand and gravel, concrete powder, anvils, dragon eggs.
//
// Wiki (Falling Block): "A falling block is the entity form of a block that appears when a gravity-affected block
// loses its support" -- it falls when the "Block below is replaceable", accelerates at 0.04 blocks/tick^2 with a
// drag of 0.98, and "continues falling until it lands on another block with a solid top surface. If it lands with
// the bottom center of its hitbox in a replaceable block, and the block below can support it (i.e. not a replaceable
// block), then the falling block returns to its block state. Otherwise, it breaks and drops as an item." A falling
// block that "has existed for more than 600 ticks (30 seconds) destroys itself and drops as an item".
//
// Until this existed nothing fell: a tutorial's "if you use sand, it will fall down" was simply false, and sand
// placed in mid-air hung there.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { createBlockGeometry } from './blockGeometry.js';

const TICK = 1 / 20;
const GRAVITY = 0.04, DRAG = 0.98, MAX_AGE_TICKS = 600, CHECK_DELAY_TICKS = 2;
const named = (...names) => names.map((n) => BLOCKS[n]).filter((id) => id !== undefined);

const COLOURS = ['WHITE', 'ORANGE', 'MAGENTA', 'LIGHT_BLUE', 'YELLOW', 'LIME', 'PINK', 'GRAY', 'LIGHT_GRAY', 'CYAN', 'PURPLE', 'BLUE', 'BROWN', 'GREEN', 'RED', 'BLACK'];
/** Concrete powder id -> the concrete it solidifies into. */
export const CONCRETE_OF = new Map(COLOURS.map((c) => [BLOCKS[`${c}_CONCRETE_POWDER`], BLOCKS[`${c}_CONCRETE`]]).filter(([a, b]) => a !== undefined && b !== undefined));
export const ANVILS = named('ANVIL', 'CHIPPED_ANVIL', 'DAMAGED_ANVIL');
const SUSPICIOUS = new Set(named('SUSPICIOUS_SAND', 'SUSPICIOUS_GRAVEL'));
/** Every block the wiki's table lists as falling when the block below is replaceable (Java Edition). */
export const GRAVITY_BLOCKS = new Set([...named('SAND', 'RED_SAND', 'GRAVEL', 'DRAGON_EGG'), ...SUSPICIOUS, ...CONCRETE_OF.keys(), ...ANVILS]);

/** Blocks a falling block falls through and may come to rest in (air, fluids, fire, grass-like plants, vines...). */
export const REPLACEABLE = new Set([BLOCKS.AIR, ...named('CAVE_AIR', 'WATER', 'LAVA', 'FIRE', 'SOUL_FIRE', 'SHORT_GRASS', 'TALL_GRASS', 'FERN', 'LARGE_FERN',
  'DEAD_BUSH', 'VINE', 'GLOW_LICHEN', 'SEAGRASS', 'TALL_SEAGRASS', 'STRUCTURE_VOID', 'LIGHT', 'HANGING_ROOTS', 'NETHER_SPROUTS', 'CRIMSON_ROOTS',
  'WARPED_ROOTS', 'BUBBLE_COLUMN')]);
// Blocks with a collision box that does not reach the top of their cell: a falling block lands on them with its
// bottom centre still inside their cell, which cannot be replaced, so it "breaks and drops as an item".
const LOW_TOP = /(_SLAB|CARPET|^SNOW|_BED|^BED|CHEST|ENCHANTING_TABLE|DAYLIGHT_DETECTOR|STONECUTTER|CAMPFIRE|_PRESSURE_PLATE|REPEATER|COMPARATOR|FLOWER_POT|CANDLE|LANTERN|BREWING_STAND|END_PORTAL_FRAME|LECTERN|SCULK_SENSOR|_HEAD|_SKULL|CONDUIT|BELL|GRINDSTONE|_TRAPDOOR)$|^POTTED_|_SLAB$|_CARPET$/;
const BLOCK_NAME = new Map(Object.entries(BLOCKS).map(([name, id]) => [id, name]));

export const isReplaceable = (id) => REPLACEABLE.has(id) || id === undefined || id === null;
/** Does `id` stop a falling block (has collision)? Torches, flowers, rails and the like do not. */
export function stopsFall(id) {
  if (isReplaceable(id)) return false;
  const def = BLOCK_DEFS[id];
  return !!def && !def.liquid && def.solid !== false;
}

export class FallingBlocks {
  constructor(world) {
    this.world = world;
    this.pending = new Map(); // "x,y,z" -> ticks left before the support check
    this.entities = [];
    this.acc = 0;
    this.random = Math.random;
    /** Block id -> the instanced mesh its falling blocks are drawn with (see `draw`). */
    this.drawn = new Map();
  }
  /** main.js hands over drawing and the item/entity systems once they exist. */
  attach({ scene, textures, entities, mobs, player, sounds } = {}) { Object.assign(this, { scene, textures, entityManager: entities, mobs, player, sounds }); }
  reset() { this.pending.clear(); this.entities.length = 0; this.acc = 0; this.draw(); }

  /** A block changed at x,y,z: the block there and the one above it may have lost (or gained) support. */
  notify(x, y, z) {
    for (const [dx, dy, dz] of [[0, 0, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
      const id = this.world.getVoxel(x + dx, y + dy, z + dz);
      if (GRAVITY_BLOCKS.has(id)) this.pending.set(`${x + dx},${y + dy},${z + dz}`, CHECK_DELAY_TICKS);
    }
  }

  update(dt) {
    if (!this.pending.size && !this.entities.length && !this.shown) return;
    this.acc = Math.min(this.acc + dt, TICK * 10);
    while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
    this.draw();
  }

  /**
   * Falling blocks of one kind share one geometry and are drawn as instances of it. Each used to be a mesh with its
   * own geometry: a beach collapsing into a flooded cave put two thousand in the air at once, and drawing them took
   * most of a second a frame -- and their geometries were never disposed.
   */
  draw() {
    const scene = this.scene ?? this.world.game?.scene;
    if (!scene) return;
    const counts = new Map();
    for (const e of this.entities) counts.set(e.id, (counts.get(e.id) ?? 0) + 1);
    for (const [id, n] of counts) {
      let mesh = this.drawn.get(id);
      if (!mesh || mesh.instanceMatrix.count < n) {
        const geometry = mesh?.geometry ?? this.blockGeometry(id);
        const material = mesh?.material ?? (this.textures ?? this.world.game?.textures)?.opaqueMaterial ?? new THREE.MeshLambertMaterial({ color: 0xdbcf9a });
        if (mesh) { mesh.removeFromParent(); mesh.dispose(); }
        mesh = new THREE.InstancedMesh(geometry, material, Math.max(16, 2 ** Math.ceil(Math.log2(n))));
        mesh.name = 'falling blocks';
        // Its bounds would have to be recomputed every frame as the blocks move; there are few of these meshes.
        mesh.frustumCulled = false;
        this.drawn.set(id, mesh);
      }
      if (mesh.parent !== scene) scene.add(mesh);
    }
    const next = new Map();
    const matrix = new THREE.Matrix4();
    for (const e of this.entities) {
      const mesh = this.drawn.get(e.id), i = next.get(e.id) ?? 0;
      next.set(e.id, i + 1);
      mesh.setMatrixAt(i, matrix.makeTranslation(e.x, e.y + 0.5, e.z));
    }
    for (const [id, mesh] of this.drawn) {
      mesh.count = counts.get(id) ?? 0;
      mesh.visible = mesh.count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.shown = this.entities.length > 0;
  }

  /** The geometry a falling block of this kind is drawn with, centred on its origin. */
  blockGeometry(id) {
    const textures = this.textures ?? this.world.game?.textures;
    try {
      const geometry = textures?.opaqueMaterial ? createBlockGeometry(id, textures) : null;
      if (geometry) return geometry.translate(-0.5, -0.5, -0.5);
    } catch { /* drawn as a plain box */ }
    return new THREE.BoxGeometry(0.98, 0.98, 0.98);
  }

  tick() {
    if (this.pending.size) {
      const due = [];
      for (const [k, t] of this.pending) { if (t <= 1) due.push(k); else this.pending.set(k, t - 1); }
      for (const k of due) { this.pending.delete(k); const [x, y, z] = k.split(',').map(Number); this.check(x, y, z); }
    }
    for (let i = this.entities.length - 1; i >= 0; i--) if (this.step(this.entities[i])) this.entities.splice(i, 1);
  }

  /** Concrete powder: "placed into, placed next to, or fall into ... water" turns it into concrete. */
  touchesWater(x, y, z) {
    return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => {
      const id = this.world.getVoxel(x + dx, y + dy, z + dz);
      return id === BLOCKS.WATER || !!BLOCK_DEFS[id]?.waterPlant;
    });
  }

  check(x, y, z) {
    const id = this.world.getVoxel(x, y, z);
    if (!GRAVITY_BLOCKS.has(id)) return;
    if (CONCRETE_OF.has(id) && this.touchesWater(x, y, z)) { this.world.setVoxel(x, y, z, CONCRETE_OF.get(id)); return; }
    if (y <= 0 || !isReplaceable(this.world.getVoxel(x, y - 1, z))) return;
    this.world.setVoxel(x, y, z, BLOCKS.AIR);
    this.spawn(id, x, y, z);
  }

  spawn(id, x, y, z) {
    const e = { id, x: x + 0.5, y, z: z + 0.5, vy: 0, startY: y, age: 0 };
    this.entities.push(e);
    return e;
  }

  /** One game tick of a falling block. Returns true when it is gone (landed or broke). */
  step(e) {
    e.age++;
    if (e.age > MAX_AGE_TICKS) { this.dropItem(e, Math.floor(e.y)); return true; }
    e.vy = (e.vy - GRAVITY) * DRAG;
    const target = e.y + e.vy;
    const bx = Math.floor(e.x), bz = Math.floor(e.z);
    // Concrete powder that falls into water solidifies there.
    if (CONCRETE_OF.has(e.id)) {
      for (let cy = Math.floor(e.y); cy >= Math.floor(target); cy--) {
        if (this.world.getVoxel(bx, cy, bz) === BLOCKS.WATER) return this.land(e, cy, CONCRETE_OF.get(e.id));
      }
    }
    // Did it reach a block with collision? Check every cell it passes through this tick.
    for (let cy = Math.floor(e.y) - 1; cy >= Math.floor(target) - 1; cy--) {
      if (cy < 0) { e.y = 0; return this.land(e, 0); }
      if (stopsFall(this.world.getVoxel(bx, cy, bz)) && target <= cy + 1) return this.land(e, cy + 1);
    }
    e.y = target;
    if (e.y < -64) return true;
    return false;
  }

  land(e, cy, as = e.id) {
    const bx = Math.floor(e.x), bz = Math.floor(e.z);
    const fallen = e.startY - cy;
    const here = this.world.getVoxel(bx, cy, bz), below = this.world.getVoxel(bx, cy - 1, bz);
    const belowName = BLOCK_NAME.get(below) || '';
    const lowTop = LOW_TOP.test(belowName) && !(belowName.endsWith('_SLAB') && this.world.structureOrientations?.get?.(`${bx},${cy - 1},${bz}`)?.slabType === 'top');
    if (ANVILS.includes(e.id)) this.hurtBelow(bx, cy, bz, fallen);
    // Suspicious blocks "break and play a sound" on landing; their contents are lost and nothing drops.
    if (SUSPICIOUS.has(e.id)) { this.sounds?.playBreak?.('sand'); return true; }
    if (!isReplaceable(here) || lowTop) { this.dropItem(e, cy); return true; }
    let id = as;
    // "If it falls from a height greater than one block, the chance of degrading by one stage is 5% x the number of
    // blocks fallen" -- and a damaged anvil that degrades breaks.
    if (ANVILS.includes(e.id) && fallen > 1 && this.random() < 0.05 * fallen) {
      const stage = ANVILS.indexOf(e.id);
      if (stage === ANVILS.length - 1) { this.sounds?.playBreak?.('anvil'); return true; }
      id = ANVILS[stage + 1];
    }
    if (CONCRETE_OF.has(id) && this.touchesWater(bx, cy, bz)) id = CONCRETE_OF.get(id);
    this.world.setVoxel(bx, cy, bz, id);
    return true;
  }

  /** Anvil: "2 HP per block fallen after the first ... capped at 40", to anything in the cell it lands in. */
  hurtBelow(bx, cy, bz, fallen) {
    const damage = Math.min(40, Math.max(0, (fallen - 1) * 2));
    if (!damage) return;
    const inCell = (p, h) => Math.floor(p.x) === bx && Math.floor(p.z) === bz && p.y < cy + 1 && p.y + h > cy;
    const player = this.player ?? this.world.game?.player;
    if (player?.position && inCell(player.position, player.height || 1.8)) player.takeDamage?.(damage, null, 'falling_anvil');
    for (const mob of this.mobs?.mobs ?? this.world.game?.mobs?.mobs ?? []) {
      if (mob.health > 0 && mob.mesh?.position && inCell(mob.mesh.position, mob.height || 1)) (this.mobs ?? this.world.game?.mobs)?.damageMob?.(mob, damage, mob.mesh.position, false, null);
    }
  }

  dropItem(e, cy) {
    // The entity drops the block itself (gravel as gravel, not its flint roll); a suspicious block drops nothing.
    const drop = SUSPICIOUS.has(e.id) ? null : { id: e.id, isBlock: true, count: 1 };
    const items = this.entityManager ?? this.world.game?.entities;
    if (drop && items?.spawnDroppedItem) items.spawnDroppedItem(new THREE.Vector3(Math.floor(e.x) + 0.5, cy + 0.25, Math.floor(e.z) + 0.5), drop.id, drop.isBlock, drop.count);
  }
}
