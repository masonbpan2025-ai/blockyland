import * as THREE from 'three';
import { hiddenAt } from './entityVisibility.js';

/**
 * Doing less for the mobs the player cannot see in detail: the cost of a village is the cost of its mobs.
 *
 * Measured with a village crowd around the player (about 200 mobs, 80 of them within 20 blocks) on an Intel Iris Xe
 * laptop: the mob update was 8.5ms a frame and drawing the mobs another 6.4ms -- 1,940 separate meshes, most of them
 * eyes, ears, beaks and the pieces of a horse's mane. Three things here, each switchable for comparison:
 *
 *   1. Far mobs think less often. A mob more than FAR_MOB_DISTANCE blocks from the player updates about twelve
 *      times a second rather than every frame, with the time it skipped handed to it when it does (so it walks the
 *      same distance, in fewer, larger steps -- the step a 12fps frame already takes). Anything that has to be
 *      exact keeps updating every frame: a mob that is dying, hurt, ridden, riding, on a lead, carrying a jockey,
 *      angry, or a boss or long-range shooter.
 *   2. Unseen mobs are not animated. Limb swing and the quadruped gait are only a pose; a mob behind the camera or
 *      past the fog keeps simulating but is not re-posed.
 *   3. Far mobs drop their small parts. While a frame is drawn, a part of a distant mob that would cover fewer than
 *      DETAIL_MIN_PIXELS on screen is hidden -- never the mob's largest part, so the mob itself never disappears.
 *      Flags are put back straight after the frame, as entityVisibility.js does.
 */
export const FAR_MOB_DISTANCE = 32;
/** How often a far mob updates, in seconds. */
export const FAR_MOB_STEP = 1 / 12;
/** The longest step a mob is ever given, matching MobManager.update's own clamp. */
const MAX_MOB_STEP = 0.1;
/** A part smaller than this on screen is not drawn on a distant mob. */
export const DETAIL_MIN_PIXELS = 2.5;
/** ...and only beyond this distance, so a mob near enough to look at is always whole. */
export const DETAIL_MIN_DISTANCE = 24;

/** Mobs whose fight or flight is too fast, or whose reach is too long, to be stepped coarsely. */
const ALWAYS_FULL_RATE = new Set(['ender_dragon', 'wither', 'warden', 'elder_guardian', 'ghast', 'phantom', 'shulker', 'vex', 'breeze', 'blaze']);

/** Must this mob update every frame regardless of distance? */
export function needsFullRate(mob) {
  return !!(mob.health <= 0 || mob.dying || mob.hurtTime > 0
    || mob.rider || mob.vehicle || mob.jockeyMount || mob.ridingBoat || mob.isRiding || mob.leashHolder
    || mob.angryAt || mob.target?.type === 'player' || mob.target?.isPlayer
    || ALWAYS_FULL_RATE.has(mob.type));
}

let nextSlot = 0;

/** How many frames apart a far mob's updates are at this frame time: about FAR_MOB_STEP, at least every frame. */
export function farMobSlots(frameDt) {
  return Math.max(1, Math.min(8, Math.round(FAR_MOB_STEP / Math.max(1e-3, frameDt))));
}

/**
 * The timestep this mob gets this frame: the frame's own near the player; for a far mob, the time built up since its
 * last update on the frames its slot comes round, and 0 (skip it) on the others. Sets `mob.lodSkipped` either way.
 *
 * Far mobs are spread over the frames by a slot each is given once, so the same share of them updates every frame.
 * Letting each wait for its own time to build up instead was tried and failed: one long frame (switching worlds, a
 * hitch) took every far mob past its threshold at once, after which all of them updated on the same frame forever --
 * no saving, and a spike every few frames.
 *
 * @param {number} frame  the manager's frame counter
 */
export function mobStep(mob, frameDt, playerPosition, frame = 0) {
  const p = mob.mesh?.position;
  const far = p && playerPosition
    && (p.x - playerPosition.x) ** 2 + (p.z - playerPosition.z) ** 2 > FAR_MOB_DISTANCE * FAR_MOB_DISTANCE;
  const pending = mob.lodPending ?? 0;
  if (!far || needsFullRate(mob)) {
    // Coming near: whatever time it had built up is used now rather than lost.
    mob.lodPending = 0;
    mob.lodSkipped = false;
    return Math.min(MAX_MOB_STEP, frameDt + pending);
  }
  if (mob.lodSlot === undefined) mob.lodSlot = nextSlot++ & 0xffff;
  const total = pending + frameDt;
  // Its slot, or as much time as one step may carry: waiting longer would lose time to the clamp.
  if ((frame + mob.lodSlot) % farMobSlots(frameDt) !== 0 && total + frameDt <= MAX_MOB_STEP) {
    mob.lodPending = total;
    mob.lodSkipped = true;
    return 0;
  }
  mob.lodPending = 0;
  mob.lodSkipped = false;
  return Math.min(MAX_MOB_STEP, total);
}

/** What the camera can see this frame, for deciding whether to animate a mob. */
export class MobViewCheck {
  constructor() {
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.sphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
    this.camera = null;
    this.world = null;
    this.fog = null;
  }

  /** Take the camera as it stands now. Returns this, or null without a camera (then everything counts as seen). */
  update(camera, world, fog) {
    if (!camera?.projectionMatrix) return null;
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    this.camera = camera;
    this.world = world;
    this.fog = fog;
    return this;
  }

  sees(mob) {
    const p = mob.mesh?.position;
    if (!p) return false;
    if (this.world && hiddenAt(p, this.world, this.camera, this.fog)) return false;
    this.sphere.center.set(p.x, p.y + 1, p.z);
    return this.frustum.intersectsSphere(this.sphere);
  }
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * Each part of a mob with its size in blocks, the largest first. Cached on the mob's root, and worked out again when
 * the model's parts change (armour put on, a sheep sheared).
 */
function mobParts(root) {
  let count = 0;
  root.traverse((o) => { if (o.isMesh) count++; });
  const cached = root.userData.lodParts;
  if (cached && cached.count === count) return cached;
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getSize(_size);
    // Sizes in the root's frame: divide out the root's own scale, which changes (a hurt pulse, a baby growing).
    const scale = root.scale ? Math.max(Math.abs(root.scale.x), Math.abs(root.scale.y), Math.abs(root.scale.z)) || 1 : 1;
    parts.push({ mesh: o, size: Math.max(_size.x, _size.y, _size.z) / scale });
  });
  parts.sort((a, b) => b.size - a.size);
  const entry = { count, parts };
  root.userData.lodParts = entry;
  return entry;
}

/**
 * Hide, for one frame, the parts of distant mobs too small to see. Returns what was hidden, for restoreHidden.
 *
 * @param {object} game  `mobs.mobs`, `camera`, `renderer`
 */
export function hideDistantMobDetails(game, camera = game?.camera) {
  const hidden = [];
  const mobs = game?.mobs?.mobs;
  if (!mobs?.length || !camera?.position) return hidden;
  const height = game.renderer?.getDrawingBufferSize?.(new THREE.Vector2()).y || 720;
  // Pixels one block covers at distance 1, for a perspective camera.
  const pixelsPerBlockAtOne = (height / 2) / Math.tan(THREE.MathUtils.degToRad((camera.fov ?? 70) / 2));
  const minDistanceSq = DETAIL_MIN_DISTANCE * DETAIL_MIN_DISTANCE;
  for (const mob of mobs) {
    const root = mob.mesh;
    if (!root?.visible) continue;
    const dx = root.position.x - camera.position.x, dy = root.position.y - camera.position.y, dz = root.position.z - camera.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < minDistanceSq) continue;
    const { parts } = mobParts(root);
    if (parts.length < 2) continue;
    const scale = Math.max(Math.abs(root.scale.x), Math.abs(root.scale.y), Math.abs(root.scale.z)) || 1;
    const minSize = DETAIL_MIN_PIXELS * Math.sqrt(distSq) / pixelsPerBlockAtOne / scale;
    // parts[0] is the largest and is always drawn.
    for (let i = 1; i < parts.length; i++) {
      const { mesh, size } = parts[i];
      if (size >= minSize) continue;
      if (!mesh.visible) continue;
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
  return hidden;
}
