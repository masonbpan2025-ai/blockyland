// Beacon beams, drawn: a column of light from each activated beacon straight up into the sky.
//
// Wiki (https://minecraft.wiki/w/Beacon § Beam): the beam rises 2048 blocks from the beacon and "is visible from any
// loaded chunk". It is two square columns: a core a little under half a block across that turns slowly about its axis,
// and a faint wider sheath round it, both with light streaming up them. Stained glass colours it from that block up
// (beaconConduit.js beaconColumn decides the colours; this file only draws them).
//
// The core is SOLID. Wiki (Beacon, History, 12w38a): the beam "has been changed from a semi-transparent smooth beam
// (which conflicted with water transparency), to a pattern with 0% transparency". A see-through beam took its colour
// from whatever was behind it -- white against the sky, cyan against water -- and, not being in the depth buffer, let
// the terrain behind it be drawn over it. So the core is drawn like a block, its streaks shades of its colour; only
// the faint sheath is see-through. And, as 1.21.5 made them, beams "appear thicker when further away so that they
// remain visible".
//
// Which beacons there are is found by looking, not told: `BeaconFinder` looks through each loaded chunk for beacon
// blocks once, and again only when the chunk changes. A beacon placed by hand, built by a structure or loaded from a
// save is found the same way, which a list kept by placement (beaconManager.js) cannot promise.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { beaconBeam } from './beaconConduit.js';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, CHUNK_HEIGHT } from './world.js';

/** Vanilla's beam: the core is 0.4 of a block across (radius 0.2), the sheath 0.5 (radius 0.25). */
export const BEAM_CORE_RADIUS = 0.2, BEAM_GLOW_RADIUS = 0.25;
/** How often the beams are checked against the world: a placed glass or a broken pyramid shows within this. */
export const BEAM_CHECK_SECONDS = 0.5;

/** How far away (in blocks) a beam starts to widen, keeping it about as wide on screen from there on. */
export const BEAM_WIDEN_FROM = 64;
/** The sheath's opacity: faint, as vanilla's outer beam is drawn (an alpha of 32 in 255). */
export const BEAM_GLOW_OPACITY = 32 / 255;

/** The light streaming up the beam: vertical streaks, lighter and darker, that tile up the column. Opaque. */
function beamTexture() {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < 16; x++) for (let y = 0; y < 64; y++) {
    const streak = 0.55 + 0.45 * Math.sin((y / 64) * Math.PI * 2 * (1 + (x % 3)) + x * 1.7);
    const v = Math.round(255 * (0.72 + 0.28 * streak));
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A square open column `height` tall, its texture repeating once a block up it. */
function column(radius, height) {
  const geometry = new THREE.CylinderGeometry(radius * Math.SQRT2, radius * Math.SQRT2, height, 4, 1, true);
  geometry.rotateY(Math.PI / 4);
  geometry.translate(0, height / 2, 0);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * height);
  return geometry;
}

/** Finds the beacon blocks in a world's loaded chunks, looking again only at chunks that changed. */
export class BeaconFinder {
  constructor() { this.seen = new WeakMap(); this.found = new Map(); }
  /** Every beacon in the loaded chunks, as [{x, y, z}]. */
  scan(world) {
    const chunks = world?.chunks;
    if (!chunks) return [];
    const live = new Set();
    for (const chunk of chunks.values()) {
      if (!chunk?.voxels) continue;
      live.add(chunk);
      const revision = chunk.weatherRevision ?? 0;
      if (this.seen.get(chunk) === revision && this.found.has(chunk)) continue;
      this.seen.set(chunk, revision);
      const list = [], voxels = chunk.voxels;
      for (let i = voxels.indexOf(BLOCKS.BEACON); i !== -1; i = voxels.indexOf(BLOCKS.BEACON, i + 1)) {
        const lx = i % CHUNK_SIZE_X, lz = Math.floor(i / CHUNK_SIZE_X) % CHUNK_SIZE_Z, y = Math.floor(i / (CHUNK_SIZE_X * CHUNK_SIZE_Z));
        list.push({ x: chunk.cx * CHUNK_SIZE_X + lx, y, z: chunk.cz * CHUNK_SIZE_Z + lz });
      }
      this.found.set(chunk, list);
    }
    // Chunks that have been unloaded take their beacons with them.
    for (const chunk of this.found.keys()) if (!live.has(chunk)) this.found.delete(chunk);
    return [...this.found.values()].flat();
  }
}

export class BeaconBeamRenderer {
  /** `parent`: the scene (or a group placed as the world's blocks are) the beams are drawn in. */
  constructor(parent) {
    this.group = new THREE.Group(); this.group.name = 'beacon-beams';
    parent.add(this.group);
    this.texture = beamTexture();
    this.beams = new Map();
    this.timer = Infinity;
    this.time = 0;
  }

  /**
   * Bring the beams up to date and move them on. `beacons` is where the beacons are (a list, or a function giving
   * one, asked only when the check is due); `world` is read for whether each one is lit and in what colours, every
   * BEAM_CHECK_SECONDS (or at once when `force`).
   */
  update(dt, world, beacons, { force = false, top = CHUNK_HEIGHT, camera = null } = {}) {
    this.time += dt;
    this.timer += dt;
    if (force || this.timer >= BEAM_CHECK_SECONDS) {
      this.timer = 0;
      const wanted = new Map();
      for (const b of (typeof beacons === 'function' ? beacons() : beacons)) {
        const beam = beaconBeam(world, b.x, b.y, b.z, { top });
        if (beam) wanted.set(`${b.x},${b.y},${b.z}`, { ...b, beam, key: JSON.stringify(beam.segments) });
      }
      for (const [key, drawn] of this.beams) if (wanted.get(key)?.key !== drawn.key) { this.remove(drawn); this.beams.delete(key); }
      for (const [key, want] of wanted) if (!this.beams.has(key)) this.beams.set(key, this.build(want));
    }
    // The light streams up both columns, and the core turns slowly about its axis.
    this.texture.offset.y = -this.time * 0.6;
    for (const drawn of this.beams.values()) {
      drawn.core.rotation.y = this.time * 0.8;
      // Further than BEAM_WIDEN_FROM blocks, wider in step with the distance, so it stays visible (1.21.5).
      const d = camera ? Math.hypot(camera.position.x - drawn.x - 0.5, camera.position.z - drawn.z - 0.5) : 0;
      const widen = Math.max(1, d / BEAM_WIDEN_FROM);
      drawn.holder.scale.set(widen, 1, widen);
    }
  }

  /** The beams drawn, for the tests and the Block Inspector: [{x, y, z, segments}]. */
  get drawn() { return [...this.beams.values()].map(({ x, y, z, segments }) => ({ x, y, z, segments })); }

  build({ x, y, z, beam, key }) {
    const holder = new THREE.Group(); holder.position.set(x + 0.5, y, z + 0.5);
    const core = new THREE.Group(); holder.add(core);
    const parts = [];
    for (const s of beam.segments) {
      // The dye colours are sRGB, as written; three.js works in linear light.
      const height = s.to - s.from, color = new THREE.Color().setRGB(...s.color.map((c) => c / 255), THREE.SRGBColorSpace);
      // The core: solid, in the depth buffer like a block; unlit and unfogged, so it reads as light from far off.
      const inner = new THREE.Mesh(column(BEAM_CORE_RADIUS, height), new THREE.MeshBasicMaterial({
        map: this.texture, color, fog: false, toneMapped: false,
      }));
      // The sheath: faint, see-through, blended normally -- never added to what is behind it.
      const outer = new THREE.Mesh(column(BEAM_GLOW_RADIUS, height), new THREE.MeshBasicMaterial({
        map: this.texture, color, transparent: true, opacity: BEAM_GLOW_OPACITY, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
      }));
      inner.position.y = outer.position.y = s.from - y;
      for (const mesh of [inner, outer]) { mesh.frustumCulled = false; mesh.userData.beaconBeam = true; }
      outer.renderOrder = 10;
      core.add(inner); holder.add(outer); parts.push(inner, outer);
    }
    this.group.add(holder);
    return { x, y, z, segments: beam.segments, key, holder, core, parts };
  }

  remove(drawn) {
    drawn.holder.removeFromParent();
    for (const mesh of drawn.parts) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }

  dispose() {
    for (const drawn of this.beams.values()) this.remove(drawn);
    this.beams.clear();
    this.group.removeFromParent();
    this.texture.dispose();
  }
}
