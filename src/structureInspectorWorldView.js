// Browser half of the Inspector's real-world view: textured chunk meshes from the GAME's mesher and texture atlas,
// mob markers, door toggling, a seed gallery and the first-person walk-through.
//
// What it does NOT reproduce, so the page can say so: the water shader (water is a flat translucent blue here), the
// day/night cycle and shadows (one fixed sun), and the mob models (markers, not meshes). Everything else -- block
// textures, shapes, ambient occlusion, biome tint, doors, beds and chests in their stored orientation -- comes from
// `ChunkMesher` and `TextureManager`, the same code the game draws with.
import * as THREE from 'three';
import { TextureManager } from './textures.js';
import { ChunkMesher } from './mesher.js';
import { BLOCK_DEFS } from './blocks.js';
import { buildStructureWorld, meshBuiltWorld } from './structureInspectorWorld.js';
import { StructureWalker, PLACEABLE } from './structureWalker.js';
import { createInspectorMobs } from './structureInspectorMobs.js';

let texturesPromise = null;
/** One atlas for the whole page: decoding it is the slow part and it never changes. */
export function loadTextures() {
  if (!texturesPromise) {
    const textures = new TextureManager();
    texturesPromise = textures.init().then(() => textures);
  }
  return texturesPromise;
}

const WATER_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x3a6fd0, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false });

function mobColour(type) {
  let hash = 0;
  for (const char of type) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return new THREE.Color().setHSL((hash % 360) / 360, 0.7, 0.55);
}

/** Add one chunk's meshes to a group, tagged so they can be replaced when a door opens. */
function addChunkMeshes(group, textures, entry) {
  const { opaqueGeo, transparentGeo, waterGeo, lightGeo } = entry.geo;
  const meshes = [];
  const add = (geometry, material, order = 0) => {
    if (!geometry) return;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.userData.chunk = [entry.cx, entry.cz];
    group.add(mesh);
    meshes.push(mesh);
  };
  add(opaqueGeo, textures.opaqueMaterial);
  add(lightGeo, textures.lightMaterial);
  add(waterGeo, WATER_MATERIAL, 1);
  add(transparentGeo, textures.transparentMaterial, 2);
  return meshes;
}

function disposeGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    child.geometry?.dispose();
  }
}

/** Mob markers: a tinted box at each requested mob position. They are markers, not models. */
function addMobMarkers(group, recorder) {
  for (const mob of recorder.mobs) {
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), new THREE.MeshLambertMaterial({ color: mobColour(mob.type) }));
    marker.position.set(mob.x, mob.y + 0.75, mob.z);
    marker.userData.mob = mob.type;
    group.add(marker);
  }
}

/**
 * The world view. `scene` receives one group; call `show()` to build a structure and `clear()` to remove it.
 */
export function createWorldView({ scene }) {
  const group = new THREE.Group();
  const mobs = new THREE.Group();
  group.add(mobs);
  group.visible = false;
  scene.add(group);
  let built = null;
  let mesher = null;
  let textures = null;
  const chunkMeshes = new Map();
  let realMobs = null;
  let mobStatus = 'none';

  async function ensureMesher() {
    if (!mesher) {
      textures = await loadTextures();
      mesher = new ChunkMesher(textures);
    }
  }

  function placeChunk(entry) {
    for (const old of chunkMeshes.get(`${entry.cx},${entry.cz}`) ?? []) {
      group.remove(old);
      old.geometry.dispose();
    }
    chunkMeshes.set(`${entry.cx},${entry.cz}`, addChunkMeshes(group, textures, entry));
  }

  return {
    group,
    get built() { return built; },
    get textures() { return textures; },
    get mobStatus() { return mobStatus; },

    /** Advance the mobs, with the viewer at `position`. */
    tickMobs(dt, position) { realMobs?.tick(dt, position); },

    /** Where each mob is now (the real mobs wander), or the requested spots when only markers are drawn. */
    mobPositions() {
      if (realMobs) return realMobs.positions();
      return (built?.recorder.mobs ?? []).map((mob) => ({ type: mob.type, x: mob.x, y: mob.y, z: mob.z }));
    },

    /** Generate and mesh a structure. Resolves with the built world. */
    async show({ structureId, seed, biome = 'auto' }) {
      await ensureMesher();
      this.clear();
      built = await buildStructureWorld({ structureId, seed, biome });
      for (const entry of meshBuiltWorld(built, mesher)) placeChunk(entry);
      // The game's own mobs; coloured markers only if the mob manager cannot start here.
      try {
        realMobs = await createInspectorMobs({ scene, built });
        mobStatus = realMobs.failed.length ? `${realMobs.count} mobs, problems: ${realMobs.failed.join('; ')}` : `${realMobs.count} mobs`;
      } catch (error) {
        realMobs = null;
        mobStatus = `markers only (${error.message})`;
        addMobMarkers(mobs, built.recorder);
      }
      group.visible = true;
      return built;
    },

    clear() {
      for (const meshes of chunkMeshes.values()) for (const mesh of meshes) { group.remove(mesh); mesh.geometry.dispose(); }
      chunkMeshes.clear();
      disposeGroup(mobs);
      if (realMobs) { realMobs.dispose(); realMobs = null; }
      built = null;
      group.visible = false;
    },

    /** Re-mesh the chunk holding a block, e.g. after a door opened. */
    remeshAround(x, z) {
      this.remeshChunk(Math.floor(x / 16), Math.floor(z / 16));
    },

    remeshChunk(cx, cz) {
      if (!built) return;
      placeChunk({ cx, cz, geo: mesher.meshChunk(built.world.getOrCreateChunk(cx, cz), built.world) });
    },

    /** Open or close the door at a position and redraw. Returns the door state, or null. */
    toggleDoor(x, y, z) {
      const door = built?.world.game.doorManager.toggleDoor(x, y, z);
      if (door) this.remeshAround(x, z);
      return door;
    }
  };
}

/**
 * Render one small picture of a structure in a world, for the seed gallery.
 *
 * @returns {Promise<{seed:string, url:string, chunk:number[], found:boolean, error?:string}>}
 */
let thumbnailRenderer = null;

export async function renderThumbnail({ structureId, seed, size = 220, biome = 'auto' }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bc4f0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6d7a60, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(40, 80, 25);
  scene.add(sun);
  const view = createWorldView({ scene });
  try {
    const built = await view.show({ structureId, seed, biome });
    // One renderer for every thumbnail: browsers cap live WebGL contexts at about sixteen.
    if (!thumbnailRenderer) {
      thumbnailRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      thumbnailRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    const renderer = thumbnailRenderer;
    renderer.setSize(size, size);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);
    const { minX, minY, minZ, maxX, maxY, maxZ } = built.box;
    const cx = (minX + maxX) / 2; const cy = (minY + maxY) / 2; const cz = (minZ + maxZ) / 2;
    const radius = Math.max(maxX - minX, maxZ - minZ, maxY - minY, 8);
    camera.position.set(cx + radius * 0.85, cy + radius * 0.75, cz + radius * 0.85);
    camera.lookAt(cx, cy - 1, cz);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
    view.clear();
    return { seed: String(seed), url, chunk: built.found.chunk, found: true };
  } catch (error) {
    view.clear();
    return { seed: String(seed), url: '', chunk: [], found: false, error: error.message };
  }
}

/** Seeds to show in a gallery: the current one first, then a deterministic spread. */
export function gallerySeeds(base, count) {
  const first = Number(base) || 0;
  const seeds = [first];
  for (let i = 1; i < count; i++) seeds.push((first * 31 + i * 7919) % 1000000007);
  return seeds;
}

// ---------------------------------------------------------------------------------------------------------------
// First-person walk-through.

const KEYS = {
  KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', Space: 'jump',
  ShiftLeft: 'sneak', ShiftRight: 'sneak', ControlLeft: 'sprint', ControlRight: 'sprint'
};

/**
 * Walk around inside a built world. Returns `{ start(), stop(), active, walker, hud() }`.
 *
 * Pointer lock gives mouse look; without it (or when the browser refuses it) the arrow keys turn the view, so the
 * walk-through still works from the keyboard alone.
 */
export function createWalkThrough({ renderer, scene, view, onChange = () => {} }) {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 500);
  camera.rotation.order = 'YXZ';
  const input = {};
  let walker = null;
  let active = false;
  let last = 0;
  let nearestMob = null;

  const canvas = renderer.domElement;

  function setInput(code, down) {
    const name = KEYS[code];
    if (name) input[name] = down;
    if (code === 'ArrowLeft') input.turnLeft = down;
    if (code === 'ArrowRight') input.turnRight = down;
    if (code === 'ArrowUp') input.lookUp = down;
    if (code === 'ArrowDown') input.lookDown = down;
  }
  const onKeyDown = (event) => {
    if (!active) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    setInput(event.code, true);
    if (event.code === 'Space' && !event.repeat) walker.tapJump(performance.now());
    if (event.code === 'KeyF') walker.toggleFlying();
    if (/^Digit[1-9]$/.test(event.code)) walker.select(Number(event.code.slice(5)) - 1);
    if (event.code === 'KeyE') useDoor();
    if (event.code === 'Escape' && !document.pointerLockElement) stop();
    if (KEYS[event.code] || event.code.startsWith('Arrow')) event.preventDefault();
  };
  const onKeyUp = (event) => setInput(event.code, false);
  const onMouseMove = (event) => {
    if (active && document.pointerLockElement === canvas) walker.look(-event.movementX * 0.0022, -event.movementY * 0.0022);
  };
  // Creative: the first click captures the mouse; after that left click breaks, right click places (or opens the door
  // being looked at), and the changed chunks are meshed again.
  const onMouseDown = (event) => {
    if (!active) return;
    if (document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
    if (event.button === 0) breakTarget();
    else if (event.button === 2) { if (!useDoor()) placeTarget(); }
  };
  const onContextMenu = (event) => { if (active) event.preventDefault(); };

  function remeshCells(cells) {
    const chunks = new Set();
    for (const { x, z } of cells) {
      for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) chunks.add(`${Math.floor((x + dx) / 16)},${Math.floor((z + dz) / 16)}`);
    }
    for (const key of chunks) { const [cx, cz] = key.split(',').map(Number); view.remeshChunk(cx, cz); }
  }
  function breakTarget() {
    const cells = walker.breakBlock();
    if (cells.length) remeshCells(cells);
    return cells.length > 0;
  }
  function placeTarget() {
    const placed = walker.placeBlock();
    if (placed) remeshCells([placed]);
    return Boolean(placed);
  }

  function useDoor() {
    const hit = walker?.targetDoor();
    if (!hit) return false;
    view.toggleDoor(hit.bottomPos[0], hit.bottomPos[1], hit.bottomPos[2]);
    return true;
  }

  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (input.turnLeft) walker.look(1.8 * dt, 0);
    if (input.turnRight) walker.look(-1.8 * dt, 0);
    if (input.lookUp) walker.look(0, 1.2 * dt);
    if (input.lookDown) walker.look(0, -1.2 * dt);
    walker.step(input, dt);
    camera.position.set(walker.x, walker.eyeY, walker.z);
    camera.rotation.set(walker.pitch, walker.yaw, 0);
    updateNearestMob();
    onChange(hud());
    requestAnimationFrame(frame);
  }

  function updateNearestMob() {
    nearestMob = null;
    for (const mob of view.mobPositions()) {
      const d = Math.hypot(mob.x - walker.x, mob.y - walker.y, mob.z - walker.z);
      if (!nearestMob || d < nearestMob.distance) nearestMob = { type: mob.type, distance: d };
    }
  }

  function hud() {
    if (!walker) return null;
    const target = walker.targetBlock();
    const heading = ['north', 'west', 'south', 'east'][Math.round((((walker.yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2)) % 4];
    return {
      position: [walker.x, walker.y, walker.z].map((v) => v.toFixed(1)).join(', '),
      facing: heading,
      flying: walker.flying,
      onGround: walker.onGround,
      selected: PLACEABLE[walker.selected].toLowerCase(),
      looking: target ? `${BLOCK_DEFS[target.id]?.name ?? `block ${target.id}`} at ${target.x},${target.y},${target.z}` : 'nothing in reach',
      door: Boolean(walker.targetDoor()),
      nearestMob: nearestMob ? `${nearestMob.type} ${nearestMob.distance.toFixed(1)} blocks` : null
    };
  }

  /** The structure was rebuilt (Regenerate, another seed or structure): stand at the new arrival point. */
  function rebind() {
    const built = view.built;
    if (!active || !built) return false;
    const a = built.arrival;
    walker = new StructureWalker(built.world, { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch });
    return true;
  }

  function start() {
    const built = view.built;
    if (!built) throw new Error('build the textured world first');
    const a = built.arrival;
    walker = new StructureWalker(built.world, { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch });
    active = true;
    last = performance.now();
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.requestPointerLock?.();
    requestAnimationFrame(frame);
    return walker;
  }

  function stop() {
    active = false;
    for (const key of Object.keys(input)) input[key] = false;
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('contextmenu', onContextMenu);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    onChange(null);
  }

  return {
    camera,
    get active() { return active; },
    get walker() { return walker; },
    start, stop, rebind, hud, useDoor, breakTarget, placeTarget,
    /** Move to a structure-relative viewpoint, e.g. inside the doorway. */
    teleport(x, y, z, yaw, pitch) { walker?.placeAt(x, y, z, yaw, pitch); }
  };
}
