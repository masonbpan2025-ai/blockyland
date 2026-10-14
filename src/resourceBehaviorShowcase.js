// Small, deterministic Inspector world. The showcase and Node tests use the
// same chunk mesher and FurnaceManager as the game; no terrain is generated.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { Chunk } from './world.js';
import { ChunkMesher } from './mesher.js';
import { FurnaceManager } from './furnace.js';
import { occludesWholeFace } from './blockOcclusion.js';

export const INSPECTION_VIEWS = [
  { id: 'east', direction: [1, 0, 0] }, { id: 'west', direction: [-1, 0, 0] },
  { id: 'top', direction: [0, 1, 0] }, { id: 'bottom', direction: [0, -1, 0] },
  { id: 'north', direction: [0, 0, 1] }, { id: 'south', direction: [0, 0, -1] },
];
const CENTER = [8, 2, 8];
const FALLBACK_TEXTURES = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

export class ResourceInspectionWorld {
  constructor(blockId, { scene = new THREE.Scene(), onChange = () => {} } = {}) {
    this.chunk = new Chunk(0, 0);
    this.drops = [];
    this.revision = 0;
    this.blockId = blockId;
    this.world = {
      getVoxel: (x, y, z) => this.chunk.getVoxel(x, y, z),
      setVoxel: (x, y, z, id) => { this.chunk.setVoxel(x, y, z, id); this.revision++; },
      getChunk: () => this.chunk,
    };
    this.game = {
      world: this.world, scene,
      rebuildChunkMesh: () => onChange(),
      entities: { spawnDroppedItem: (position, id, isBlock, count) => this.drops.push({ position, id, isBlock, count }) },
      ui: { closeFurnaceModal() {} },
    };
    this.furnaceManager = new FurnaceManager(this.game);
    this.reset();
  }

  reset(blockId = this.blockId) {
    for (const furnace of this.furnaceManager.furnaces.values()) {
      if (furnace.pointLight) {
        this.game.scene.remove(furnace.pointLight);
        furnace.pointLight.dispose?.();
      }
    }
    this.furnaceManager.furnaces.clear();
    this.drops.length = 0;
    this.chunk.voxels.fill(0);
    this.world.setVoxel(...CENTER, blockId);
    // The screenshot's regression: opaque-textured, one-pixel carpet beside
    // and below a furnace. Stones below must not be visible THROUGH its body.
    this.world.setVoxel(8, 2, 9, BLOCKS.RED_CARPET);
    this.world.setVoxel(9, 2, 8, BLOCKS.RED_CARPET);
    this.world.setVoxel(8, 1, 8, BLOCKS.RED_CARPET);
    for (let x = 7; x <= 9; x++) for (let z = 7; z <= 9; z++) this.world.setVoxel(x, 0, z, BLOCKS.COBBLESTONE);
  }

  mesh(textures = FALLBACK_TEXTURES) {
    return new ChunkMesher(textures).meshChunk(this.chunk, this.world);
  }

  // Ray-test the WORLD mesh, not a separate, perfect BoxGeometry. That is what
  // exposes a side culled by an adjacent carpet (the old Inspector missed it).
  inspectFace(direction, textures = FALLBACK_TEXTURES) {
    const geometries = this.mesh(textures);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = ['opaqueGeo', 'lightGeo'].filter(k => geometries[k]).map(k => new THREE.Mesh(geometries[k], material));
    const center = new THREE.Vector3(8.5, 2.5, 8.5);
    const normal = new THREE.Vector3(...direction);
    const ray = new THREE.Raycaster(center.clone().addScaledVector(normal, 2), normal.clone().negate());
    const hits = ray.intersectObjects(meshes, false);
    const expected = center.clone().addScaledVector(normal, 0.5);
    const ok = hits.some(hit => hit.point.distanceTo(expected) < 0.001);
    for (const key of ['opaqueGeo', 'lightGeo', 'transparentGeo', 'waterGeo']) geometries[key]?.dispose();
    material.dispose();
    return ok;
  }

  get furnace() { return this.furnaceManager.getOrCreateFurnace(...CENTER); }
  tick(dt) { this.furnaceManager.update(dt); }
  dispose() { this.reset(); }
}

function furnaceScenarios(session) {
  const manager = session.furnaceManager;
  const tick = seconds => { let remaining = seconds; while (remaining > 1e-8) { const dt = Math.min(0.05, remaining); session.tick(dt); remaining -= dt; } };
  return [
    { id: 'load-fuel', label: 'Load raw iron and coal', duration: 1.3,
      enter() { session.reset(BLOCKS.FURNACE); manager.addItem(...CENTER, 'raw_iron', false, 2); manager.addItem(...CENTER, 'coal', false, 1, 'fuel'); },
      verify: () => session.furnace.input?.count === 2 && session.furnace.fuel?.count === 1 },
    { id: 'ignite', label: 'Ignite: lit front and warm light', duration: 1.5,
      enter: () => session.tick(0.05),
      verify: () => session.world.getVoxel(...CENTER) === BLOCKS.LIT_FURNACE && !!session.furnace.pointLight },
    { id: 'smelt', label: 'Smelt iron (simulation at 4× speed)', duration: 3,
      update: dt => tick(dt * 4),
      verify: () => session.furnace.output?.id === 'iron_ingot' && session.furnace.output.count === 1 && session.furnace.input.count === 1 },
    { id: 'collect-output', label: 'Collect the iron ingot', duration: 1.5,
      enter() { session.collected = manager.extractItem(...CENTER); },
      verify: () => session.collected?.id === 'iron_ingot' && session.collected.count === 1 && session.furnace.output === null },
    { id: 'blocked-output', label: 'Full output: fuel and input remain untouched', duration: 1.4,
      enter() { session.reset(BLOCKS.FURNACE); Object.assign(session.furnace, { input: { id: 'raw_iron', count: 1 }, fuel: { id: 'coal', count: 1 }, output: { id: 'iron_ingot', isBlock: false, count: 64 } }); tick(1); },
      verify: () => session.furnace.fuel.count === 1 && session.furnace.input.count === 1 && !session.furnace.lit },
    { id: 'lava-bucket', label: 'Lava fuel leaves an empty bucket', duration: 1.5,
      enter() { session.reset(BLOCKS.FURNACE); manager.addItem(...CENTER, 'raw_iron'); manager.addItem(...CENTER, 'lava_bucket', false, 1, 'fuel'); session.tick(0.05); },
      verify: () => session.furnace.fuel?.id === 'bucket' && session.furnace.lit },
    { id: 'extinguish', label: 'Fuel expires: unlit front and no point light', duration: 1.5,
      enter() { session.furnace.input = null; session.furnace.burnTime = 0.05; session.tick(0.1); },
      verify: () => session.world.getVoxel(...CENTER) === BLOCKS.FURNACE && !session.furnace.pointLight },
    { id: 'break-contents', label: 'Break furnace: its stored items drop', duration: 2,
      enter() { session.furnace.input = { id: 'raw_iron', isBlock: false, count: 2 }; session.furnace.output = { id: 'iron_ingot', isBlock: false, count: 1 }; manager.onBlockBroken(...CENTER); session.world.setVoxel(...CENTER, BLOCKS.AIR); },
      verify: () => manager.furnaces.size === 0 && session.drops.some(d => d.id === 'raw_iron' && d.count === 2) && session.drops.some(d => d.id === 'bucket') && session.drops.some(d => d.id === 'iron_ingot') },
  ];
}

// A timed runner lets people WATCH each existing registry check, inspect six
// sides, and run supported behavior scenarios. Unimplemented simulations are
// explicitly described rather than claiming every item's gameplay is covered.
export class ResourceBehaviorShowcase {
  constructor({ entry, checks = [], session = null, textures = FALLBACK_TEXTURES, onStep = () => {} }) {
    this.entry = entry;
    this.session = session;
    this.onStep = onStep;
    this.results = [];
    this.steps = checks.map(check => ({ id: check.id, label: check.label, duration: 0.12, result: check }));
    for (const view of INSPECTION_VIEWS) {
      this.steps.push({ id: `view-${view.id}`, label: `Inspect ${view.id} view${view.id === 'bottom' && session ? ' (support cutaway)' : ''}`, duration: 0.7, view,
        verify: session && occludesWholeFace(BLOCK_DEFS[entry.blockId]) ? () => session.inspectFace(view.direction, textures) : null });
    }
    if (session && [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE].includes(entry.blockId)) {
      this.steps.push(...furnaceScenarios(session));
    }
    this.index = -1;
    this.elapsed = 0;
    this.running = true;
    this.next();
  }

  get current() { return this.steps[this.index]; }
  next() {
    this.index++;
    this.elapsed = 0;
    if (this.index >= this.steps.length) { this.running = false; return; }
    this.stepError = null;
    try { this.current.enter?.(); this.onStep(this.current); }
    catch (error) { this.stepError = error; }
  }
  update(dt) {
    if (!this.running || !Number.isFinite(dt) || dt <= 0) return;
    // Clamp browser stalls, but retain the last step's exact simulation duration.
    const step = this.current;
    const delta = Math.min(dt, 0.1, step.duration - this.elapsed);
    try { if (!this.stepError) step.update?.(delta); }
    catch (error) { this.stepError = error; }
    this.elapsed += delta;
    if (this.elapsed + 1e-6 < step.duration) return;
    let result = step.result;
    try {
      if (this.stepError) throw this.stepError;
      if (!result) result = { status: step.verify ? (step.verify() ? 'observed' : 'not observed') : 'unsupported', detail: step.verify ? '' : 'Visual inspection; no automated assertion for this shape.' };
    } catch (error) { result = { status: 'error', detail: error.message }; }
    this.results.push({ ...result, id: step.id, label: step.label });
    this.next();
  }
  stop() { this.running = false; }
}
