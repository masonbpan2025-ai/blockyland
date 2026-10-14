// A first-person walker for the Structure Inspector's walk-through.
//
// DOM-free so tests can drive it against a real `World`. It is a small copy of the game's movement model, not the
// game's `Player` (which owns the camera, the inventory, the HUD and the pointer lock): same speeds, gravity and
// jump, an AABB 0.6 wide and 1.8 tall, and axis-separated collision against the world's solid blocks. A closed door
// is solid and an open one is not, so the way into a building is to open its door.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

/** The blocks a walker can place with the number keys. */
export const PLACEABLE = ['OAK_PLANKS', 'SPRUCE_PLANKS', 'COBBLESTONE', 'STONE', 'GLASS', 'OAK_LOG', 'DIRT', 'TORCH', 'GLOWSTONE'];

export const WALKER = Object.freeze({
  halfWidth: 0.3, height: 1.8, sneakHeight: 1.5, eye: 1.62, sneakEye: 1.27,
  walk: 4.3, sprint: 5.6, sneak: 1.3, fly: 11.0, jump: 8.6, gravity: 28.0, terminal: 55, reach: 5,
  /** Two Space presses within this many milliseconds toggle flying, as in Creative. */
  doubleTapMs: 300
});

/** Forward and right on the ground plane for a yaw. The game's forward is (-sin yaw, -cos yaw). */
export function headingVectors(yaw) {
  return { forward: [-Math.sin(yaw), -Math.cos(yaw)], right: [Math.cos(yaw), -Math.sin(yaw)] };
}

export class StructureWalker {
  constructor(world, { x = 0, y = 40, z = 0, yaw = 0, pitch = 0 } = {}) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.yaw = yaw; this.pitch = pitch;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.onGround = false;
    this.flying = false;
    this.sneaking = false;
    this.sprinting = false;
    this.lastJumpTap = -Infinity;
    this.selected = 0;
  }

  /**
   * A Space key press (not a held repeat). Two within `doubleTapMs` toggle flying, like Creative; the walker keeps
   * flying until the next double tap, however long Space is held. Returns true when this press toggled flight.
   */
  tapJump(nowMs) {
    const toggled = nowMs - this.lastJumpTap <= WALKER.doubleTapMs;
    this.lastJumpTap = toggled ? -Infinity : nowMs;
    if (toggled) this.toggleFlying();
    return toggled;
  }

  /** Choose the block the next placement uses (0-based index into PLACEABLE). */
  select(index) {
    this.selected = Math.max(0, Math.min(PLACEABLE.length - 1, index));
    return PLACEABLE[this.selected];
  }

  get eyeY() { return this.y + (this.sneaking ? WALKER.sneakEye : WALKER.eye); }

  placeAt(x, y, z, yaw = this.yaw, pitch = this.pitch) {
    this.x = x; this.y = y; this.z = z;
    this.yaw = yaw; this.pitch = pitch;
    this.vx = this.vy = this.vz = 0;
    this.onGround = false;
  }

  look(dyaw, dpitch) {
    this.yaw += dyaw;
    this.pitch = Math.max(-1.553, Math.min(1.553, this.pitch + dpitch));
  }

  toggleFlying() {
    this.flying = !this.flying;
    this.vy = 0;
    return this.flying;
  }

  /** Is the block in this cell something the walker cannot pass through? */
  isSolid(bx, by, bz) {
    if (by < 0) return true;
    const id = this.world.getVoxel(bx, by, bz);
    if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.LAVA) return false;
    const def = BLOCK_DEFS[id];
    if (!def) return true;
    if (def.door) return !this.world.game?.doorManager?.getDoor?.(bx, by, bz)?.open;
    return !(def.plant || def.solid === false);
  }

  collides(px, py, pz) {
    const h = this.sneaking ? WALKER.sneakHeight : WALKER.height;
    const e = 1e-6;
    for (let bx = Math.floor(px - WALKER.halfWidth); bx <= Math.floor(px + WALKER.halfWidth - e); bx++) {
      for (let bz = Math.floor(pz - WALKER.halfWidth); bz <= Math.floor(pz + WALKER.halfWidth - e); bz++) {
        for (let by = Math.floor(py); by <= Math.floor(py + h - e); by++) {
          if (this.isSolid(bx, by, bz)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Advance by `dt` seconds.
   * @param {{forward?:boolean,back?:boolean,left?:boolean,right?:boolean,jump?:boolean,sprint?:boolean,sneak?:boolean}} input
   */
  step(input = {}, dt = 1 / 60) {
    dt = Math.min(dt, 0.05);
    this.sneaking = Boolean(input.sneak) && !this.flying;
    const { forward, right } = headingVectors(this.yaw);
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const r = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.sprinting = Boolean(input.sprint) && f > 0 && !this.sneaking;
    const speed = this.flying ? WALKER.fly : this.sneaking ? WALKER.sneak : this.sprinting ? WALKER.sprint : WALKER.walk;
    let dx = forward[0] * f + right[0] * r;
    let dz = forward[1] * f + right[1] * r;
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx = (dx / len) * speed; dz = (dz / len) * speed; }
    this.vx = dx;
    this.vz = dz;

    if (this.flying) {
      this.vy = (input.jump ? WALKER.fly : 0) - (input.sneak ? WALKER.fly : 0);
    } else {
      if (input.jump && this.onGround) { this.vy = WALKER.jump; this.onGround = false; }
      this.vy = Math.max(-WALKER.terminal, this.vy - WALKER.gravity * dt);
    }

    this.#move('x', this.vx * dt);
    this.#move('z', this.vz * dt);
    const blocked = this.#move('y', this.vy * dt);
    if (blocked) {
      if (this.vy < 0) this.onGround = true;
      this.vy = 0;
    } else if (!this.flying) {
      this.onGround = false;
    }
    return this;
  }

  /** Move along one axis in slices of at most 0.25 so a fast fall cannot tunnel. Returns true if something blocked it. */
  #move(axis, delta) {
    if (delta === 0) return false;
    const slices = Math.max(1, Math.ceil(Math.abs(delta) / 0.25));
    const each = delta / slices;
    for (let i = 0; i < slices; i++) {
      const next = { x: this.x, y: this.y, z: this.z };
      next[axis] += each;
      if (this.collides(next.x, next.y, next.z)) {
        // Settle against the obstacle instead of stopping short of it.
        if (axis === 'y') this.y = each < 0 ? Math.floor(this.y + each) + 1 : Math.ceil(this.y + each) - (this.sneaking ? WALKER.sneakHeight : WALKER.height) - 1e-4;
        return true;
      }
      this[axis] = next[axis];
    }
    return false;
  }

  /** The first non-air cell along the view ray, or null within `reach`. */
  targetBlock(reach = WALKER.reach) {
    const cp = Math.cos(this.pitch);
    const dir = [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
    let prev = null;
    for (let t = 0; t <= reach; t += 0.05) {
      const bx = Math.floor(this.x + dir[0] * t);
      const by = Math.floor(this.eyeY + dir[1] * t);
      const bz = Math.floor(this.z + dir[2] * t);
      const id = this.world.getVoxel(bx, by, bz);
      if (id !== BLOCKS.AIR && id !== BLOCKS.WATER) return { x: bx, y: by, z: bz, id, distance: t, prev };
      prev = { x: bx, y: by, z: bz };
    }
    return null;
  }

  /**
   * Creative break: remove the block being looked at (both halves of a door or bed). Bedrock at y 0 stays.
   * Returns the cells changed, `[{x,y,z,id}]`, or `[]` when nothing was in reach.
   */
  breakBlock() {
    const hit = this.targetBlock();
    if (!hit || hit.y <= 0) return [];
    const game = this.world.game;
    const cells = [[hit.x, hit.y, hit.z]];
    const door = game?.doorManager?.getDoor?.(hit.x, hit.y, hit.z);
    if (door) cells.push(door.bottomPos, door.topPos);
    const bed = game?.bedManager?.getBed?.(hit.x, hit.y, hit.z);
    if (bed) cells.push(bed.footPos, bed.headPos);
    const changed = [];
    for (const [x, y, z] of cells) {
      const id = this.world.getVoxel(x, y, z);
      if (id === BLOCKS.AIR || changed.some((c) => c.x === x && c.y === y && c.z === z)) continue;
      this.world.setVoxel(x, y, z, BLOCKS.AIR);
      changed.push({ x, y, z, id });
    }
    return changed;
  }

  /**
   * Creative place: put the selected block against the face being looked at. Refuses to fill the walker's own space.
   * Returns `{x,y,z,id}` or null.
   */
  placeBlock(id = BLOCKS[PLACEABLE[this.selected]]) {
    const hit = this.targetBlock();
    if (!hit || !hit.prev || id === undefined) return null;
    const { x, y, z } = hit.prev;
    if (y < 1 || y > 62) return null;
    const before = this.world.getVoxel(x, y, z);
    this.world.setVoxel(x, y, z, id);
    const def = BLOCK_DEFS[id];
    if (this.collides(this.x, this.y, this.z) && def && !def.plant && def.solid !== false) {
      this.world.setVoxel(x, y, z, before);
      return null;
    }
    return { x, y, z, id };
  }

  /** The door being looked at, within reach, or null. */
  targetDoor() {
    const manager = this.world.game?.doorManager;
    const hit = this.targetBlock();
    return (manager?.getDoor && hit && manager.getDoor(hit.x, hit.y, hit.z)) || null;
  }
}

export function createWalker(world, options) {
  return new StructureWalker(world, options);
}
