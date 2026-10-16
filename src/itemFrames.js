// Item frames and glow item frames (Java Edition).
//
// Wiki (Item Frame): placed on any face of a block (walls, floors and ceilings); using it with an item puts the item in,
// using it again "rotates the item 45 degrees clockwise", eight positions; attacking it pops the item out, and attacking
// an empty frame breaks it and drops it; it breaks when the block it hangs on goes. "A redstone comparator ... outputs a
// signal strength of 1 to 8 depending on the rotation", 0 for an empty frame, read from the block space the frame is in
// (directly, or through a solid block). Tutorial:Combination locks: "Items in item frames can be rotated into 8
// different positions. This rotation can be detected by a comparator". Before this an item frame was only an item.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const FRAME_ITEMS = new Set(['item_frame', 'glow_item_frame']);
const THICKNESS = 1 / 16;
const key = (p) => `${p.x},${p.y},${p.z}`;

/** Comparator output for a frame: its rotation plus one with an item, else 0. */
export const frameSignal = (frame) => (frame?.item ? (frame.rotation % 8) + 1 : 0);

const supports = (id) => {
  const def = BLOCK_DEFS[id];
  return id !== BLOCKS.AIR && !!def && def.solid !== false && !def.liquid;
};

export class ItemFrameManager {
  constructor(game) { this.game = game; this.frames = []; this.checkTimer = 0; }
  get world() { return this.game?.world; }
  get dimension() { return this.game?.currentDimension || 'overworld'; }
  active() { const d = this.dimension; return this.frames.filter((f) => f.dimension === d); }
  at(p) { const k = key(p); return this.active().find((f) => key(f.anchor) === k) ?? null; }

  /** Hang a frame in the air cell `anchor`, on the face whose outward normal is `normal`. */
  place(anchor, normal, { glow = false, item = null, rotation = 0, silent = false } = {}) {
    const at = { x: Math.floor(anchor.x), y: Math.floor(anchor.y), z: Math.floor(anchor.z) };
    const n = { x: Math.round(normal.x || 0), y: Math.round(normal.y || 0), z: Math.round(normal.z || 0) };
    if (Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z) !== 1) return null;
    if (this.at(at) && key(this.at(at).normal) === key(n)) return null;
    const world = this.world;
    if (world && (world.getVoxel(at.x, at.y, at.z) !== BLOCKS.AIR || !supports(world.getVoxel(at.x - n.x, at.y - n.y, at.z - n.z)))) return null;
    const frame = { anchor: at, normal: n, glow, item: item ? { ...item, count: 1 } : null, rotation: rotation % 8, dimension: this.dimension, mesh: null };
    this.frames.push(frame);
    this.rebuild(frame);
    if (!silent) this.game?.sounds?.playPlace?.('wood');
    this.signal(frame);
    return frame;
  }

  /** Use: put the held item in, or turn the one inside. Returns true when something happened. */
  use(frame, held, { creative = false } = {}) {
    if (!frame.item) {
      if (!held || held.count <= 0) return false;
      frame.item = { ...held, count: 1 }; frame.rotation = 0;
      if (!creative) held.count -= 1;
    } else frame.rotation = (frame.rotation + 1) % 8;
    this.rebuild(frame); this.signal(frame);
    this.game?.sounds?.playClick?.();
    return true;
  }

  /** Attack: the item pops out; an empty frame breaks. */
  hit(frame, { creative = false } = {}) {
    const centre = this.centre(frame);
    if (frame.item) {
      if (!creative) this.game?.entities?.spawnDroppedItem?.(centre, frame.item.id, !!frame.item.isBlock, 1, { enchantments: frame.item.enchantments });
      frame.item = null; frame.rotation = 0; this.rebuild(frame); this.signal(frame);
      return 'item';
    }
    this.remove(frame, { drop: !creative });
    return 'frame';
  }

  remove(frame, { drop = true } = {}) {
    const i = this.frames.indexOf(frame); if (i < 0) return false;
    this.frames.splice(i, 1);
    if (frame.mesh) { this.game?.scene?.remove(frame.mesh); frame.mesh = null; }
    const centre = this.centre(frame);
    if (drop) {
      this.game?.entities?.spawnDroppedItem?.(centre, frame.glow ? 'glow_item_frame' : 'item_frame', false, 1);
      if (frame.item) this.game?.entities?.spawnDroppedItem?.(centre, frame.item.id, !!frame.item.isBlock, 1, { enchantments: frame.item.enchantments });
    }
    this.signal(frame);
    return true;
  }

  centre(frame) {
    const n = frame.normal, a = frame.anchor;
    return new THREE.Vector3(a.x + 0.5 - n.x * 0.45, a.y + 0.5 - n.y * 0.45, a.z + 0.5 - n.z * 0.45);
  }

  /** Comparators and other redstone near it see the change. */
  signal(frame) { this.world?.redstone?.mark?.([frame.anchor.x, frame.anchor.y, frame.anchor.z]); }

  /** Comparator reading of the block space `p` (redstone.js getContainerSignal). */
  signalAt(p) { const f = this.at({ x: p[0], y: p[1], z: p[2] }); return f ? frameSignal(f) : null; }

  /** The nearest frame the ray hits, with the distance. */
  raycast(origin, direction, maxDistance = 5) {
    let best = null;
    for (const frame of this.active()) {
      const n = frame.normal, a = frame.anchor;
      const axis = n.x ? 'x' : n.y ? 'y' : 'z', sign = n[axis];
      const face = a[axis] + 0.5 - sign * 0.5 + sign * THICKNESS;
      const d = direction[axis];
      if (Math.abs(d) < 1e-9 || Math.sign(d) === Math.sign(sign)) continue;
      const t = (face - origin[axis]) / d;
      if (t < 0 || t > maxDistance || (best && t >= best.distance)) continue;
      const hit = { x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t };
      const others = ['x', 'y', 'z'].filter((k) => k !== axis);
      if (others.some((k) => hit[k] < a[k] + 0.125 || hit[k] > a[k] + 0.875)) continue;
      best = { frame, distance: t };
    }
    return best;
  }

  /** A frame whose block is gone breaks and drops (checked four times a second). */
  update(dt) {
    if (!this.frames.length || !this.world?.getVoxel) return;
    this.checkTimer += dt; if (this.checkTimer < 0.25) return; this.checkTimer = 0;
    const d = this.dimension;
    for (const f of this.frames) if (f.mesh) f.mesh.visible = f.dimension === d;
    for (const f of this.active()) {
      const n = f.normal, a = f.anchor;
      if (!supports(this.world.getVoxel(a.x - n.x, a.y - n.y, a.z - n.z)) || this.world.getVoxel(a.x, a.y, a.z) !== BLOCKS.AIR) this.remove(f, { drop: true });
    }
  }

  rebuild(frame) {
    const scene = this.game?.scene; if (!scene) return;
    if (frame.mesh) scene.remove(frame.mesh);
    const group = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, THICKNESS), new THREE.MeshLambertMaterial({ color: frame.glow ? 0xcfe9d8 : 0x8a5a33 }));
    group.add(board);
    if (frame.item) {
      const visual = this.game?.entities?.itemVisuals?.create?.(frame.item.id, !!frame.item.isBlock);
      if (visual) { visual.scale.multiplyScalar(0.8); visual.position.z = THICKNESS; visual.rotation.z = -frame.rotation * Math.PI / 4; group.add(visual); }
    }
    group.position.copy(this.centre(frame));
    const n = frame.normal;
    group.lookAt(group.position.x + n.x, group.position.y + n.y, group.position.z + n.z);
    scene.add(group); frame.mesh = group;
  }

  clear() { for (const f of [...this.frames]) this.remove(f, { drop: false }); }

  serialize() {
    return this.active().map((f) => ({ x: f.anchor.x, y: f.anchor.y, z: f.anchor.z, normal: f.normal, glow: f.glow, item: f.item, rotation: f.rotation }));
  }

  restore(list) {
    this.clear();
    for (const e of Array.isArray(list) ? list : []) if (e && e.normal) this.place({ x: e.x, y: e.y, z: e.z }, e.normal, { glow: !!e.glow, item: e.item ?? null, rotation: e.rotation | 0, silent: true });
  }
}
