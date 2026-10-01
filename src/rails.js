// Rails, minecarts and boats.
//
// These were previously decorative only: `minecart` and `oak_boat` existed as item
// icons with no behaviour, and there were no rail blocks at all. This module gives
// them real physics — carts follow connected rail, powered rails accelerate, and
// boats float on water — so redstone machines and mini-games can actually run.

import * as THREE from 'three';
import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** One redstone tick, matching the simulator. */
const TICK = 0.1;
/** How fast a cart may travel along a rail, in blocks per second. */
const MAX_CART_SPEED = 8;
const CART_ACCEL = 6;
/** Constant deceleration on plain rail, in blocks/s², so carts actually stop. */
const ROLLING_FRICTION = 3.5;
const POWERED_ACCEL = 14;
/** Boats drift slowly and are pushed by the rider. */
const BOAT_MAX_SPEED = 4.5;
const BOAT_ACCEL = 5;
const BOAT_DRAG = 0.94;

const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const flat = d => d[1] === 0;

export class RailSystem {
  /**
   * @param {object} world voxel world (needs getVoxel/setVoxel/getChunk)
   * @param {object} [game] for sounds, entities and the player
   */
  constructor(world, game = null) {
    this.world = world;
    this.game = game;
    this.carts = [];
    this.boats = [];
    this.time = 0;
    this.listeners = new Set();
  }

  /** Notify on interesting events (arrival, launch) for mini-games to hook. */
  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) {
      try { fn(type, detail); } catch { /* a listener must never break physics */ }
    }
  }

  // --- rails ----------------------------------------------------------------

  isRail(p) {
    const id = this.world.getVoxel(...p);
    return id === B.RAIL || id === B.POWERED_RAIL;
  }

  /** Rail direction, from the redstone state: 0 east, 1 west, 2 up, 3 down, 4 south, 5 north. */
  railDir(p) {
    const state = this.world.redstone?.state(p);
    if (state && Number.isInteger(state.dir)) return state.dir;
    return 0;
  }

  isPoweredRail(p) {
    return this.world.getVoxel(...p) === B.POWERED_RAIL;
  }

  /** A powered rail pushes when it has a signal. */
  railIsPowered(p) {
    if (!this.isPoweredRail(p)) return false;
    return (this.world.redstone?.input(p) || 0) > 0;
  }

  /**
   * Where a cart goes next from a rail.
   *
   * Direction 2 climbs and 3 descends, so those are one-way; the horizontal
   * directions are two-way. Neighbours are preferred in the order straight-ahead,
   * then the sides — which keeps a cart on its line through a junction instead of
   * being flung off at every branch.
   */
  nextRail(from, previous = null, preferred = null) {
    const dir = this.railDir(from);
    const forward = this.#forwardVector(dir);
    const candidates = [];

    if (forward) candidates.push(add(from, forward));
    // Both halves of the axis the rail lies along.
    const axis = dir === 0 || dir === 1 ? [[1, 0, 0], [-1, 0, 0]]
      : dir === 4 || dir === 5 ? [[0, 0, 1], [0, 0, -1]]
        : null;
    if (axis) for (const d of axis) candidates.push(add(from, d));
    // Slopes also connect to the flat rail one block below their low end.
    if (!flat(this.#dirVector(dir))) {
      candidates.push(add(from, [0, -1, 0]));
      candidates.push(add(add(from, this.#dirVector(dir)), [0, -1, 0]));
    }

    const seen = new Set();
    const options = [];
    for (const candidate of candidates) {
      const key = candidate.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      if (previous && same(candidate, previous)) continue;
      if (!this.isRail(candidate)) continue;
      options.push(candidate);
    }
    if (!options.length) return null;

    // Continue in the same direction if that rail is available.
    if (preferred) {
      const wanted = options.find(o => same(o, add(from, preferred)));
      if (wanted) return wanted;
    }
    // Otherwise prefer travelling away from where we came from.
    if (previous) {
      const away = options.find(o => {
        const step = [o[0] - from[0], o[1] - from[1], o[2] - from[2]];
        return !same(step, [previous[0] - from[0], previous[1] - from[1], previous[2] - from[2]]);
      });
      if (away) return away;
    }
    return options[0];
  }

  /** Unit vector for a horizontal-ish direction id, or null when it is vertical. */
  #dirVector(dir) {
    if (dir === 0) return [1, 0, 0];
    if (dir === 1) return [-1, 0, 0];
    if (dir === 2) return [0, 1, 0];
    if (dir === 3) return [0, -1, 0];
    if (dir === 4) return [0, 0, 1];
    if (dir === 5) return [0, 0, -1];
    return null;
  }

  /** The horizontal travel direction, treating slopes as their flat component. */
  #forwardVector(dir) {
    const v = this.#dirVector(dir);
    if (!v) return null;
    if (v[1] !== 0) {
      // A slope's travel is horizontal; the rise is handled by the rail it leads to.
      return null;
    }
    return v;
  }

  // --- carts ----------------------------------------------------------------

  /** Lay a straight line of rail. @returns {Array<number[]>} the cells placed */
  layTrack(from, to, { powered = false, every = 0 } = {}) {
    const cells = [];
    const step = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1]), Math.sign(to[2] - from[2])];
    const length = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), Math.abs(to[2] - from[2]));
    for (let i = 0; i <= length; i++) {
      const p = [from[0] + step[0] * i, from[1] + step[1] * i, from[2] + step[2] * i];
      const isPowered = powered || (every > 0 && i % every === 0);
      this.world.setVoxel(...p, isPowered ? B.POWERED_RAIL : B.RAIL);
      // 0/1 run east-west, 4/5 run north-south, 2/3 slope up and down.
      let dir = 0;
      if (step[0] < 0) dir = 1;
      else if (step[0] > 0) dir = 0;
      else if (step[2] < 0) dir = 5;
      else if (step[2] > 0) dir = 4;
      if (step[1] > 0) dir = 2;
      else if (step[1] < 0) dir = 3;
      this.world.redstone?.configure(p, dir);
      cells.push(p);
    }
    return cells;
  }

  /** Place a cart on (or near) a rail. */
  spawnCart(p, { rider = null } = {}) {
    let rail = this.nearestRail(p.map(v => Math.floor(v))) || p.map(v => Math.floor(v));
    const cart = {
      kind: 'minecart',
      rail,
      position: new THREE.Vector3(rail[0] + 0.5, rail[1] + 0.35, rail[2] + 0.5),
      speed: 0,
      heading: null,
      rider: rider || null,
      mesh: this.#cartMesh()
    };
    if (cart.mesh && this.game?.scene) this.game.scene.add(cart.mesh);
    this.carts.push(cart);
    return cart;
  }

  #cartMesh() {
    if (typeof document === 'undefined') return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x6b7280 })
    );
    body.position.y = 0.25;
    group.add(body);
    return group;
  }

  /** Closest rail within a small radius, for placing and re-railing carts. */
  nearestRail(p, radius = 2) {
    for (let r = 0; r <= radius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            const q = [p[0] + dx, p[1] + dy, p[2] + dz];
            if (this.isRail(q)) return q;
          }
        }
      }
    }
    return null;
  }

  /**
   * Advance every cart.
   *
   * A cart travels along its rail, and on reaching the end of a segment it hands
   * over to the next connected rail. Powered rails accelerate it; ordinary rail
   * applies friction so it coasts to a stop, which is what makes a boost loop or a
   * station work.
   */
  updateCarts(dt) {
    const steps = Math.max(1, Math.ceil(dt / TICK));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) this.#cartStep(sub);
  }

  #cartStep(dt) {
    for (const cart of this.carts) {
      if (!cart.rail) continue;
      const dir = this.railDir(cart.rail);
      let forward = this.#cartHeading(cart, dir);

      // Gravity on a slope, in whichever direction the rail descends.
      const slope = this.#slopeEffect(cart.rail, dir);
      if (slope) cart.speed += slope * dt;

      // Powered rail launches, unpowered powered-rail brakes.
      if (this.isPoweredRail(cart.rail)) {
        if (this.railIsPowered(cart.rail)) {
          const push = forward || this.#dirVector(dir) || [1, 0, 0];
          cart.speed += POWERED_ACCEL * dt;
          if (!forward) forward = push;
          cart.atEnd = false;
        } else {
          cart.speed *= 0.94;
        }
      }
      // Rolling friction is a constant deceleration, not a multiplier: a multiplier
      // never quite reaches zero, so a cart would creep along the track forever
      // instead of coming to rest.
      if (cart.speed > 0) cart.speed = Math.max(0, cart.speed - ROLLING_FRICTION * dt);
      else if (cart.speed < 0) cart.speed = Math.min(0, cart.speed + ROLLING_FRICTION * dt);

      cart.speed = Math.max(-MAX_CART_SPEED, Math.min(MAX_CART_SPEED, cart.speed));
      if (Math.abs(cart.speed) < 0.02) { cart.speed = 0; }

      if (!forward) { cart.speed *= 0.8; }

      // Move one rail at a time, so the cart never skips over a block.
      cart.progress = (cart.progress || 0) + Math.abs(cart.speed) * dt;
      while (cart.progress >= 1) {
        cart.progress -= 1;
        const next = forward ? this.nextRail(cart.rail, cart.previousRail, forward) : null;
        if (!next) {
          // Ran out of track: stop at the end rather than drifting off.
          cart.speed = 0;
          cart.progress = 0;
          if (!cart.atEnd) { cart.atEnd = true; this.emit('cart_stop', { cart }); }
          break;
        }
        cart.atEnd = false;
        cart.previousRail = cart.rail;
        cart.rail = next;
        this.emit('cart_rail', { cart, rail: next });
      }

      if (cart.speed !== 0 && forward) {
        const target = new THREE.Vector3(cart.rail[0] + 0.5, cart.rail[1] + 0.35, cart.rail[2] + 0.5);
        cart.position.lerp(target, Math.min(1, dt * 8));
      } else {
        cart.position.set(cart.rail[0] + 0.5, cart.rail[1] + 0.35, cart.rail[2] + 0.5);
      }
      if (cart.mesh) cart.mesh.position.copy(cart.position);
      if (cart.rider) {
        cart.rider.position.set(cart.position.x, cart.position.y + 0.55, cart.position.z);
      }
    }
  }

  /** Keep a cart's heading, defaulting to the rail's own direction. */
  #cartHeading(cart, dir) {
    if (cart.heading) return cart.heading;
    const v = this.#forwardVector(dir);
    if (v) return v;
    // Vertical/slope rail: derive from whichever neighbour is a rail.
    const next = this.nextRail(cart.rail, cart.previousRail);
    if (next) {
      return [Math.sign(next[0] - cart.rail[0]), 0, Math.sign(next[2] - cart.rail[2])];
    }
    return null;
  }

  /** Slopes pull carts downhill. */
  #slopeEffect(rail, dir) {
    const v = this.#dirVector(dir);
    if (!v || v[1] === 0) return 0;
    // Going up costs speed, going down gains it.
    return v[1] > 0 ? -CART_ACCEL * 0.5 : CART_ACCEL * 0.5;
  }

  /** Launch a cart by hand or from a game script. */
  boost(cart, speed = MAX_CART_SPEED) {
    cart.speed = speed;
    return cart;
  }

  // --- boats ----------------------------------------------------------------

  isWater(p) {
    return this.world.getVoxel(...p) === B.WATER;
  }

  /** Put a boat in the water at (or just above) the given point. */
  spawnBoat(p, { rider = null } = {}) {
    const at = p.map(v => Math.floor(v));
    const boat = {
      kind: 'boat',
      position: new THREE.Vector3(at[0] + 0.5, at[1] + 0.1, at[2] + 0.5),
      velocity: new THREE.Vector3(),
      yaw: 0,
      rider: rider || null,
      mesh: this.#boatMesh()
    };
    if (boat.mesh && this.game?.scene) this.game.scene.add(boat.mesh);
    this.boats.push(boat);
    return boat;
  }

  #boatMesh() {
    if (typeof document === 'undefined') return null;
    const group = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.35, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xb45309 })
    );
    group.add(hull);
    return group;
  }

  /**
   * Boats float on the surface and drift with their momentum, with a little drag
   * from the water. Steering comes from the rider.
   */
  updateBoats(dt) {
    for (const boat of this.boats) {
      const cell = [Math.floor(boat.position.x), Math.floor(boat.position.y), Math.floor(boat.position.z)];
      const onWater = this.isWater(cell) || this.isWater([cell[0], cell[1] - 1, cell[2]]);

      // Settle onto the water surface when floating; sink gently when not.
      const surfaceY = this.#waterSurfaceY(cell);
      if (surfaceY !== null) {
        boat.position.y += (surfaceY - boat.position.y) * Math.min(1, dt * 4);
        boat.velocity.y = 0;
        boat.velocity.multiplyScalar(BOAT_DRAG);
      } else {
        boat.velocity.y -= 9.8 * dt;
      }

      // Steering: the rider's input pushes the boat forwards.
      const input = this.game?.input;
      if (boat.rider && input) {
        const yaw = boat.rider.yaw ?? 0;
        let thrust = 0;
        if (input.forward) thrust += 1;
        if (input.backward) thrust -= 1;
        if (thrust) {
          boat.velocity.x += -Math.sin(yaw) * BOAT_ACCEL * thrust * dt;
          boat.velocity.z += -Math.cos(yaw) * BOAT_ACCEL * thrust * dt;
          boat.yaw = yaw;
        }
      }

      const horizontal = Math.hypot(boat.velocity.x, boat.velocity.z);
      if (horizontal > BOAT_MAX_SPEED) {
        boat.velocity.x *= BOAT_MAX_SPEED / horizontal;
        boat.velocity.z *= BOAT_MAX_SPEED / horizontal;
      }

      boat.position.addScaledVector(boat.velocity, dt);

      // Solid blocks stop a boat rather than letting it pass through.
      const ahead = [Math.floor(boat.position.x), Math.floor(boat.position.y), Math.floor(boat.position.z)];
      const id = this.world.getVoxel(...ahead);
      if (id !== B.AIR && id !== B.WATER && BLOCK_DEFS[id]?.solid !== false) {
        boat.velocity.set(0, 0, 0);
        boat.position.x -= Math.sign(boat.velocity.x);
      }

      if (boat.mesh) {
        boat.mesh.position.copy(boat.position);
        boat.mesh.rotation.y = boat.yaw;
      }
      if (boat.rider) {
        boat.rider.position.set(boat.position.x, boat.position.y + 0.6, boat.position.z);
      }
    }
  }

  /** World y of the water surface for a column, or null when there is no water. */
  #waterSurfaceY(p) {
    for (let y = Math.min(63, p[1] + 3); y >= Math.max(0, p[1] - 3); y--) {
      if (this.world.getVoxel(p[0], y, p[2]) === B.WATER && this.world.getVoxel(p[0], y + 1, p[2]) !== B.WATER) {
        return y + 0.05;
      }
    }
    return null;
  }

  // --- lifecycle ------------------------------------------------------------

  update(dt) {
    this.time += dt;
    this.updateCarts(dt);
    this.updateBoats(dt);
  }

  /** Remove a cart or boat and its mesh. */
  remove(vehicle) {
    if (vehicle.mesh && this.game?.scene) this.game.scene.remove(vehicle.mesh);
    let i = this.carts.indexOf(vehicle);
    if (i >= 0) this.carts.splice(i, 1);
    i = this.boats.indexOf(vehicle);
    if (i >= 0) this.boats.splice(i, 1);
  }

  reset() {
    for (const cart of [...this.carts, ...this.boats]) this.remove(cart);
    this.carts = [];
    this.boats = [];
    this.time = 0;
  }

  /** Did a cart pass through this cell? Used by mini-games to score laps. */
  cartAt(cell, tolerance = 0.5) {
    return this.carts.find(cart => (
      Math.abs(cart.position.x - (cell[0] + 0.5)) <= tolerance
      && Math.abs(cart.position.z - (cell[2] + 0.5)) <= tolerance
      && Math.abs(cart.position.y - (cell[1] + 0.35)) <= 1.5
    )) || null;
  }

  /** Nearest cart or boat to a point, for mounting. */
  nearestVehicle(point, maxDistance = 3) {
    let best = null;
    let bestDistance = maxDistance;
    for (const vehicle of [...this.carts, ...this.boats]) {
      const d = vehicle.position.distanceTo(point);
      if (d < bestDistance) { bestDistance = d; best = vehicle; }
    }
    return best;
  }
}

export const RAIL_LIMITS = { MAX_CART_SPEED, BOAT_MAX_SPEED, TICK };
export { DIRECTIONS };
