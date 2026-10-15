// Rails, minecarts and boats with advanced physics and vehicle subtypes.
//
// Boats: 2-passenger rowing, high-speed gliding on ice/packed ice/blue ice, Boat with Chest.
// Minecarts: Standard, Chest, Furnace, Hopper, TNT; slope momentum, collision bouncing.

import * as THREE from 'three';
import { BLOCKS as B, BLOCK_DEFS, stackLimitFor } from './blocks.js';
import { waterSurfaceAt, isWaterCell } from './waterContact.js';
import { createBoatModel, boatHasChest } from './boatModel.js';

const DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** One redstone tick, matching the simulator. */
const TICK = 0.1;
/** How fast a cart may travel along a rail, in blocks per second. */
const MAX_CART_SPEED = 10;
const CART_ACCEL = 6;
/** Constant deceleration on plain rail, in blocks/s², so carts coast authentically. */
const ROLLING_FRICTION = 2.0;
const POWERED_ACCEL = 16;

/** Boat speed and friction parameters across surfaces */
const BOAT_WATER_MAX_SPEED = 8.0;
const BOAT_WATER_ACCEL = 6.5;
const BOAT_WATER_DRAG = 0.94;

const BOAT_LAND_MAX_SPEED = 2.2;
const BOAT_LAND_ACCEL = 2.5;
const BOAT_LAND_DRAG = 0.65;

const BOAT_ICE_MAX_SPEED = 40.0;
const BOAT_ICE_ACCEL = 18.0;
const BOAT_ICE_DRAG = 0.985;

const BOAT_PACKED_ICE_MAX_SPEED = 55.0;
const BOAT_PACKED_ICE_ACCEL = 24.0;
const BOAT_PACKED_ICE_DRAG = 0.99;

const BOAT_BLUE_ICE_MAX_SPEED = 72.0;
const BOAT_BLUE_ICE_ACCEL = 32.0;
const BOAT_BLUE_ICE_DRAG = 0.995;

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
    this.boatAccumulator = 0;
    this.time = 0;
    this.listeners = new Set();
  }

  /** Notify on interesting events (arrival, launch, collision, explosion) */
  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) {
      try { fn(type, detail); } catch { /* listener must not break physics */ }
    }
  }

  // --- rails ----------------------------------------------------------------

  isRail(p) {
    const id = this.world.getVoxel(...p);
    return [B.RAIL,B.POWERED_RAIL,B.ACTIVATOR_RAIL,B.DETECTOR_RAIL].includes(id);
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
    return this.world.redstone?.railPowered?.(p)??((this.world.redstone?.input(p)||0)>0);
  }

  nextRail(from, previous = null, preferred = null) {
    const dir = this.railDir(from);
    const forward = this.#forwardVector(dir);
    const candidates = [];

    if (forward) candidates.push(add(from, forward));
    const axis = dir === 0 || dir === 1 ? [[1, 0, 0], [-1, 0, 0]]
      : dir === 4 || dir === 5 ? [[0, 0, 1], [0, 0, -1]]
        : null;
    if (axis) for (const d of axis) candidates.push(add(from, d));
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

    if (preferred) {
      const wanted = options.find(o => same(o, add(from, preferred)));
      if (wanted) return wanted;
    }
    if (previous) {
      const away = options.find(o => {
        const step = [o[0] - from[0], o[1] - from[1], o[2] - from[2]];
        return !same(step, [previous[0] - from[0], previous[1] - from[1], previous[2] - from[2]]);
      });
      if (away) return away;
    }
    return options[0];
  }

  #dirVector(dir) {
    if (dir === 0) return [1, 0, 0];
    if (dir === 1) return [-1, 0, 0];
    if (dir === 2) return [0, 1, 0];
    if (dir === 3) return [0, -1, 0];
    if (dir === 4) return [0, 0, 1];
    if (dir === 5) return [0, 0, -1];
    return null;
  }

  #forwardVector(dir) {
    const v = this.#dirVector(dir);
    if (!v) return null;
    if (v[1] !== 0) return null;
    return v;
  }

  // --- carts ----------------------------------------------------------------

  layTrack(from, to, { powered = false, every = 0 } = {}) {
    const cells = [];
    const step = [Math.sign(to[0] - from[0]), Math.sign(to[1] - from[1]), Math.sign(to[2] - from[2])];
    const length = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]), Math.abs(to[2] - from[2]));
    for (let i = 0; i <= length; i++) {
      const p = [from[0] + step[0] * i, from[1] + step[1] * i, from[2] + step[2] * i];
      const isPowered = powered || (every > 0 && i % every === 0);
      this.world.setVoxel(...p, isPowered ? B.POWERED_RAIL : B.RAIL);
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

  /**
   * Place a cart on (or near) a rail.
   * Supports subtypes: 'minecart', 'chest_minecart', 'furnace_minecart', 'hopper_minecart', 'tnt_minecart'.
   */
  spawnCart(p, { rider = null, subType = 'minecart' } = {}) {
    let rail = this.nearestRail(p.map(v => Math.floor(v))) || p.map(v => Math.floor(v));
    const cart = {
      kind: 'minecart',
      subType,
      rail,
      position: new THREE.Vector3(rail[0] + 0.5, rail[1] + 0.35, rail[2] + 0.5),
      speed: 0,
      heading: null,
      rider: rider || null,
      items: ['chest_minecart', 'hopper_minecart'].includes(subType) ? new Array(subType === 'hopper_minecart' ? 5 : 27).fill(null) : null,
      fuelTime: subType === 'furnace_minecart' ? 0 : 0,
      primed: false,
      mesh: this.#cartMesh(subType)
    };
    if (cart.mesh && this.game?.scene) this.game.scene.add(cart.mesh);
    this.carts.push(cart);
    return cart;
  }

  #cartMesh(subType = 'minecart') {
    if (typeof document === 'undefined') return null;
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 1.0),
      new THREE.MeshLambertMaterial({ color: 0x6b7280 })
    );
    body.position.y = 0.25;
    group.add(body);

    if (subType === 'chest_minecart') {
      const chest = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.45, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x92400e })
      );
      chest.position.y = 0.55;
      group.add(chest);
    } else if (subType === 'furnace_minecart') {
      const furnace = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x4b5563 })
      );
      furnace.position.y = 0.55;
      group.add(furnace);
    } else if (subType === 'hopper_minecart') {
      const hopper = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.35, 0.65),
        new THREE.MeshLambertMaterial({ color: 0x374151 })
      );
      hopper.position.y = 0.48;
      group.add(hopper);
    } else if (subType === 'tnt_minecart') {
      const tnt = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.5, 0.6),
        new THREE.MeshLambertMaterial({ color: 0xdc2626 })
      );
      tnt.position.y = 0.55;
      group.add(tnt);
    }

    return group;
  }

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

  addCartItem(cart, id, isBlock = false, count = 1) {
    if (!cart.items) return false;
    let remaining = count;
    // A chest minecart's cargo stacks like any other inventory: to the item's own limit.
    const limit = stackLimitFor(id);
    for (let i = 0; i < cart.items.length; i++) {
      const it = cart.items[i];
      if (it && it.id === id && !!it.isBlock === !!isBlock && it.count < limit) {
        const can = Math.min(remaining, limit - it.count);
        it.count += can;
        remaining -= can;
        if (remaining <= 0) return true;
      }
    }
    for (let i = 0; i < cart.items.length; i++) {
      if (!cart.items[i]) {
        const toPut = Math.min(remaining, 64);
        cart.items[i] = { id, isBlock, count: toPut };
        remaining -= toPut;
        if (remaining <= 0) return true;
      }
    }
    return remaining < count;
  }

  extractCartItem(cart) {
    if (!cart.items) return null;
    for (let i = 0; i < cart.items.length; i++) {
      const it = cart.items[i];
      if (it && it.count > 0) {
        const res = { id: it.id, isBlock: it.isBlock, count: 1 };
        if (--it.count <= 0) cart.items[i] = null;
        return res;
      }
    }
    return null;
  }

  addFuel(cart, amount = 3600) {
    if (cart.subType !== 'furnace_minecart') return false;
    cart.fuelTime = (cart.fuelTime || 0) + amount;
    return true;
  }

  explodeTntCart(cart) {
    if (cart.exploded) return;
    cart.exploded = true;
    const pos = cart.position.clone();
    this.game?.sounds?.playExplosion?.();
    const bx = Math.floor(pos.x), by = Math.floor(pos.y), bz = Math.floor(pos.z);
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx * dx + dy * dy + dz * dz <= 5) {
            const p = [bx + dx, by + dy, bz + dz];
            const id = this.world.getVoxel(...p);
            if (id !== B.AIR && id !== B.BEDROCK && id !== B.OBSIDIAN) {
              this.world.setVoxel(...p, B.AIR);
            }
          }
        }
      }
    }
    this.remove(cart);
    this.emit('cart_explode', { cart, position: pos });
  }

  updateCarts(dt) {
    const steps = Math.max(1, Math.ceil(dt / TICK));
    const sub = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.#cartStep(sub);
      this.#cartCollisions();
    }
  }

  #cartStep(dt) {
    for (const cart of this.carts) {
      if (!cart.rail) continue;
      if(this.world.getVoxel(...cart.rail)===B.ACTIVATOR_RAIL&&this.world.redstone?.railPowered?.(cart.rail)){
        if(cart.subType==='tnt_minecart'&&cart.fuse===undefined){cart.primed=true;cart.fuse=4;}
        if(cart.subType==='hopper_minecart')cart.hopperDisabled=true;
        if(cart.rider){if(this.game?.riding===cart)this.game.dismount?.();if(cart.rider?.vehicle===cart)cart.rider.vehicle=null;cart.rider=null;}
      }else if(this.world.getVoxel(...cart.rail)===B.ACTIVATOR_RAIL&&cart.subType==='hopper_minecart')cart.hopperDisabled=false;
      if(cart.fuse!==undefined){cart.fuse-=dt;if(cart.fuse<=0){this.explodeTntCart(cart);continue;}}
      const dir = this.railDir(cart.rail);
      let forward = this.#cartHeading(cart, dir);

      // Slope momentum: gravity accelerates downhill, decelerates uphill
      const slope = this.#slopeEffect(cart.rail, dir);
      if (slope) {
        cart.speed += slope * dt;
        if (cart.speed < 0 && forward) {
          // Reversing on slope
          cart.heading = [-forward[0], 0, -forward[2]];
          forward = cart.heading;
          cart.speed = Math.abs(cart.speed);
        }
      }

      // Furnace Minecart locomotive thrust
      if (cart.subType === 'furnace_minecart' && (cart.fuelTime || 0) > 0) {
        cart.fuelTime -= dt * 20;
        const thrust = 7.5;
        cart.speed = Math.min(MAX_CART_SPEED, (cart.speed || 0) + thrust * dt);
        if (!forward) forward = this.#dirVector(dir) || [1, 0, 0];
        if (this.game?.entities?.spawnSmoke && Math.random() < 0.15) {
          this.game.entities.spawnSmoke(cart.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0.15, 0.6);
        }
      }

      // Hopper Minecart: item suction and container transfer
      if (cart.subType === 'hopper_minecart'&&!cart.hopperDisabled) {
        if (this.game?.entities?.droppedItems) {
          const dropped = this.game.entities.droppedItems;
          for (let i = dropped.length - 1; i >= 0; i--) {
            const it = dropped[i];
            const p = it.group?.position;
            if (p && p.distanceTo(cart.position) < 1.8) {
              if (this.addCartItem(cart, it.itemType, it.isBlock, 1)) {
                it.count--;
                if (it.count <= 0) {
                  this.game.entities.itemVisuals?.release?.(it.group);
                  this.game.entities.scene?.remove?.(it.group);
                  dropped.splice(i, 1);
                }
                break;
              }
            }
          }
        }
        // Pull from container above
        const above = [cart.rail[0], cart.rail[1] + 1, cart.rail[2]];
        if (this.world.getVoxel(...above) === B.CHEST && this.game?.chestManager) {
          const ex = this.game.chestManager.extractItem(...above);
          if (ex) this.addCartItem(cart, ex.id, ex.isBlock, 1);
        }
        // Deposit into hopper below rail
        const below = [cart.rail[0], cart.rail[1] - 1, cart.rail[2]];
        if (this.world.getVoxel(...below) === B.HOPPER && this.world.redstone) {
          const hs = this.world.redstone.state(below);
          if (hs && cart.items?.length) {
            const slot = cart.items.find(Boolean);
            if (slot && this.world.redstone.addHopperItem(hs, slot.id, slot.isBlock, 1)) {
              if (--slot.count <= 0) cart.items[cart.items.indexOf(slot)] = null;
            }
          }
        }
      }

      // Powered rail boosts, unpowered acts as an active brake
      if (this.isPoweredRail(cart.rail)) {
        if (this.railIsPowered(cart.rail)) {
          const push = forward || this.#dirVector(dir) || [1, 0, 0];
          cart.speed += POWERED_ACCEL * dt;
          if (!forward) forward = push;
          cart.atEnd = false;
        } else {
          cart.speed *= 0.65;
        }
      }

      // Rolling friction
      if (cart.speed > 0) cart.speed = Math.max(0, cart.speed - ROLLING_FRICTION * dt);
      else if (cart.speed < 0) cart.speed = Math.min(0, cart.speed + ROLLING_FRICTION * dt);

      cart.speed = Math.max(-MAX_CART_SPEED, Math.min(MAX_CART_SPEED, cart.speed));
      if (Math.abs(cart.speed) < 0.02) cart.speed = 0;
      if (!forward) cart.speed *= 0.8;

      cart.progress = (cart.progress || 0) + Math.abs(cart.speed) * dt;
      while (cart.progress >= 1) {
        cart.progress -= 1;
        const next = forward ? this.nextRail(cart.rail, cart.previousRail, forward) : null;
        if (!next) {
          const ahead = forward ? add(cart.rail, forward) : null;
          const hasBufferBlock = ahead && this.world.getVoxel(...ahead) !== B.AIR;
          if (hasBufferBlock && Math.abs(cart.speed) > 1.0) {
            // Buffer stop / barrier rebound
            const prevSpeed = cart.speed;
            cart.speed = -prevSpeed * 0.55;
            cart.progress = 0;
            if (cart.heading) cart.heading = [-cart.heading[0], 0, -cart.heading[2]];
            this.emit('cart_bounce', { cart, speed: cart.speed });
            if (cart.subType === 'tnt_minecart' && Math.abs(prevSpeed) >= 4.0) {
              this.explodeTntCart(cart);
            }
          } else {
            // Open end of track: cart stops at the end
            if (cart.subType === 'tnt_minecart' && Math.abs(cart.speed) >= 4.5) {
              this.explodeTntCart(cart);
            }
            cart.speed = 0;
            cart.progress = 0;
            if (!cart.atEnd) { cart.atEnd = true; this.emit('cart_stop', { cart }); }
          }
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
      if(cart.subType==='minecart'&&!cart.rider&&Math.abs(cart.speed)>.1){
        const mob=this.game?.mobs?.mobs?.find(m=>['squid','glow_squid','donkey','mule'].includes(m.type)&&m.health>0&&!m.vehicle&&!m.rider&&m.mesh.position.distanceTo(cart.position)<1);
        if(mob){cart.rider=mob;mob.vehicle=cart;}
      }
      if (cart.rider) {
        if(cart.rider.mesh&&cart.rider.health<=0){cart.rider.vehicle=null;cart.rider=null;}
        else (cart.rider.position||cart.rider.mesh?.position)?.set(cart.position.x, cart.position.y + 0.55, cart.position.z);
      }
    }
  }

  #cartCollisions() {
    for (let i = 0; i < this.carts.length; i++) {
      for (let j = i + 1; j < this.carts.length; j++) {
        const a = this.carts[i], b = this.carts[j];
        if (!a.rail || !b.rail) continue;
        const dist = a.position.distanceTo(b.position);
        if (dist < 0.95) {
          const now = this.time || 0;
          if (a._lastCollCart === b && Math.abs(now - (a._lastCollTime || 0)) < 0.35) {
            continue;
          }
          a._lastCollCart = b;
          a._lastCollTime = now;
          b._lastCollCart = a;
          b._lastCollTime = now;

          const vA = a.speed || 0;
          const vB = b.speed || 0;

          // Compute relative displacement along track
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const dirX = Math.sign(Math.round(dx));
          const dirZ = Math.sign(Math.round(dz));

          if (Math.abs(vA) > 0.5 && Math.abs(vB) <= 0.5) {
            // Cart A hits stationary/slow Cart B -> A transfers momentum to B and rebounds
            b.speed = Math.max(Math.abs(vA) * 0.85, 2.0);
            b.heading = [dirX || a.heading?.[0] || 1, 0, dirZ || a.heading?.[2] || 0];
            b.atEnd = false;
            b.progress = (b.progress || 0) + 0.1;

            a.speed = Math.abs(vA) * 0.35;
            if (a.heading) a.heading = [-a.heading[0], 0, -a.heading[2]];
          } else if (Math.abs(vB) > 0.5 && Math.abs(vA) <= 0.5) {
            // Cart B hits stationary Cart A
            a.speed = Math.max(Math.abs(vB) * 0.85, 2.0);
            a.heading = [-dirX || b.heading?.[0] || -1, 0, -dirZ || b.heading?.[2] || 0];
            a.atEnd = false;
            a.progress = (a.progress || 0) + 0.1;

            b.speed = Math.abs(vB) * 0.35;
            if (b.heading) b.heading = [-b.heading[0], 0, -b.heading[2]];
          } else {
            // Head-on or mutual collision: exchange momentum and bounce
            const newSpeedA = Math.max(Math.abs(vB) * 0.85, 1.5);
            const newSpeedB = Math.max(Math.abs(vA) * 0.85, 1.5);
            a.speed = newSpeedA;
            b.speed = newSpeedB;
            if (a.heading) a.heading = [-a.heading[0], 0, -a.heading[2]];
            if (b.heading) b.heading = [-b.heading[0], 0, -b.heading[2]];
          }

          this.emit('cart_collision', { cartA: a, cartB: b });
          if ((a.subType === 'tnt_minecart' || b.subType === 'tnt_minecart') && (Math.abs(vA) > 3.0 || Math.abs(vB) > 3.0)) {
            if (a.subType === 'tnt_minecart') this.explodeTntCart(a);
            if (b.subType === 'tnt_minecart') this.explodeTntCart(b);
          }
        }
      }
    }
  }

  #cartHeading(cart, dir) {
    if (cart.heading) return cart.heading;
    const v = this.#forwardVector(dir);
    if (v) return v;
    const next = this.nextRail(cart.rail, cart.previousRail);
    if (next) {
      return [Math.sign(next[0] - cart.rail[0]), 0, Math.sign(next[2] - cart.rail[2])];
    }
    return null;
  }

  #slopeEffect(rail, dir) {
    const v = this.#dirVector(dir);
    if (!v || v[1] === 0) return 0;
    // Going downhill adds speed, uphill opposes speed
    return v[1] > 0 ? -CART_ACCEL * 0.6 : CART_ACCEL * 0.6;
  }

  boost(cart, speed = MAX_CART_SPEED) {
    cart.speed = speed;
    return cart;
  }

  // --- boats ----------------------------------------------------------------

  isWater(p) {
    return this.world.getVoxel(...p) === B.WATER;
  }

  /**
   * Put a boat on water or ice at the given point.
   * Supports 2-passenger rowing, high-speed gliding on ice, and Boat with Chest.
   */
  spawnBoat(p, { rider = null, subType = 'oak_boat', hasChest = false } = {}) {
    const isChestBoat = hasChest || boatHasChest(subType);
    const meshObj = createBoatModel(subType, this.game?.textures, isChestBoat);
    const px = Number.isInteger(p[0]) ? p[0]+0.5 : p[0];
    const pz = Number.isInteger(p[2]) ? p[2]+0.5 : p[2];
    const water = waterSurfaceAt(this.world, px, p[1], pz);
    const boat = {
      kind: 'boat',
      subType,
      hasChest: isChestBoat,
      chestItems: isChestBoat ? new Array(27).fill(null) : null,
      position: new THREE.Vector3(px, water ? this.#boatWaterY(water) : p[1], pz),
      velocity: new THREE.Vector3(),
      yaw: 0,
      rider: rider || null,         // Seat 0 (primary driver/rower)
      passenger: null,              // Seat 1 (secondary passenger or mob)
      rowTime: 0,
      mesh: meshObj?.group || meshObj,
      leftOar: meshObj?.leftOar || null,
      rightOar: meshObj?.rightOar || null
    };
    boat.mesh?.position.copy(boat.position);
    if (boat.mesh && this.game?.scene) this.game.scene.add(boat.mesh);
    this.boats.push(boat);
    return boat;
  }

  #getSurfaceProperties(boat) {
    const p = [Math.floor(boat.position.x), Math.floor(boat.position.y + 0.13), Math.floor(boat.position.z)];
    const under = [p[0], Math.floor(boat.position.y - 0.2), p[2]];
    const vAt = this.world.getVoxel(...p);
    const vUnder = this.world.getVoxel(...under);

    if (vAt === B.BLUE_ICE || vUnder === B.BLUE_ICE) {
      return { type: 'blue_ice', maxSpeed: BOAT_BLUE_ICE_MAX_SPEED, accel: BOAT_BLUE_ICE_ACCEL, drag: BOAT_BLUE_ICE_DRAG };
    }
    if (vAt === B.PACKED_ICE || vUnder === B.PACKED_ICE) {
      return { type: 'packed_ice', maxSpeed: BOAT_PACKED_ICE_MAX_SPEED, accel: BOAT_PACKED_ICE_ACCEL, drag: BOAT_PACKED_ICE_DRAG };
    }
    if (vAt === B.ICE || vUnder === B.ICE) {
      return { type: 'ice', maxSpeed: BOAT_ICE_MAX_SPEED, accel: BOAT_ICE_ACCEL, drag: BOAT_ICE_DRAG };
    }
    if (isWaterCell(vAt) || isWaterCell(vUnder)) {
      return { type: 'water', maxSpeed: BOAT_WATER_MAX_SPEED, accel: BOAT_WATER_ACCEL, drag: BOAT_WATER_DRAG };
    }
    return { type: 'land', maxSpeed: BOAT_LAND_MAX_SPEED, accel: BOAT_LAND_ACCEL, drag: BOAT_LAND_DRAG };
  }

  updateBoats(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.boatAccumulator += Math.min(dt, 0.25);
    while (this.boatAccumulator + 1e-9 >= 1/60) {
      this.boatAccumulator -= 1/60;
      this.#stepBoats(1/60);
    }
  }

  #stepBoats(dt) {
    for (const boat of this.boats) {
      const cell = [Math.floor(boat.position.x), Math.floor(boat.position.y), Math.floor(boat.position.z)];
      const props = this.#getSurfaceProperties(boat);
      boat.surface = props.type;

      // Surface height settling (water or solid ice/ground)
      const water = waterSurfaceAt(this.world, boat.position.x, boat.position.y + 0.13, boat.position.z);
      const surfaceY = water ? this.#boatWaterY(water) : this.#surfaceY(cell);
      if (surfaceY !== null) {
        boat.position.y += (surfaceY - boat.position.y) * (1 - Math.exp(-5 * dt));
        boat.velocity.y = 0;
      } else {
        boat.velocity.y -= 9.8 * dt;
      }

      // Steering & Rowing from the rider
      const keys = boat.rider?.keys;
      const input = this.game?.input || this.game?.controls || (keys ? { forward: keys.KeyW, backward: keys.KeyS, left: keys.KeyA, right: keys.KeyD } : null);
      if (boat.rider && input) {
        if (input.left) boat.yaw += 2.4 * dt;
        if (input.right) boat.yaw -= 2.4 * dt;

        let thrust = 0;
        if (input.forward) thrust += 1;
        if (input.backward) thrust -= 0.6;
        if (thrust !== 0) {
          const fX = -Math.sin(boat.yaw);
          const fZ = -Math.cos(boat.yaw);
          boat.velocity.x += fX * props.accel * thrust * dt;
          boat.velocity.z += fZ * props.accel * thrust * dt;
        }
      }

      // Drag and speed capping
      const horizontal = Math.hypot(boat.velocity.x, boat.velocity.z);
      if (horizontal > props.maxSpeed) {
        boat.velocity.x *= props.maxSpeed / horizontal;
        boat.velocity.z *= props.maxSpeed / horizontal;
      }
      boat.velocity.x *= Math.pow(props.drag, dt * 20);
      boat.velocity.z *= Math.pow(props.drag, dt * 20);

      const previous = boat.position.clone();
      boat.position.addScaledVector(boat.velocity, dt);

      // Sweep the hull, not just its centre, so banks stop the boat before clipping.
      const distance = boat.position.distanceTo(previous);
      const next = boat.position.clone();
      for (let i = 1, steps = Math.max(1, Math.ceil(distance / 0.1)); i <= steps; i++) {
        boat.position.copy(previous).lerp(next, i / steps);
        if (this.#boatBlocked(boat)) {
          boat.position.copy(previous).lerp(next, (i-1)/steps);
          boat.velocity.set(0, 0, 0);
          break;
        }
      }

      // Visual updates & oar animations
      if (boat.mesh) {
        boat.mesh.position.copy(boat.position);
        boat.mesh.rotation.y = boat.yaw;
      }
      if (boat.leftOar && boat.rightOar && horizontal > 0.1) {
        boat.rowTime = (boat.rowTime || 0) + dt * Math.min(horizontal, 10);
        const oarAngle = Math.sin(boat.rowTime * 6) * 0.35;
        boat.leftOar.rotation.y = oarAngle;
        boat.rightOar.rotation.y = -oarAngle;
      }

      // 2-Passenger Seat Positions (Seat 0 = driver, Seat 1 = passenger)
      const fX = -Math.sin(boat.yaw);
      const fZ = -Math.cos(boat.yaw);
      if (boat.rider) {
        const rPos = boat.rider.position || boat.rider.mesh?.position;
        if (rPos) rPos.set(boat.position.x + fX * 0.2, boat.position.y + 0.55, boat.position.z + fZ * 0.2);
      }
      if (boat.passenger) {
        const pPos = boat.passenger.position || boat.passenger.mesh?.position;
        if (pPos) pPos.set(boat.position.x - fX * 0.4, boat.position.y + 0.45, boat.position.z - fZ * 0.4);
      }

      // Mob embarkation into empty secondary seat (if not a chest boat)
      if (!boat.passenger && !boat.hasChest && this.game?.mobs?.mobs) {
        for (const mob of this.game.mobs.mobs) {
          if (!mob.isRiding && !mob.vehicle && !mob.rider && mob.health > 0 && (!['horse','donkey','mule'].includes(mob.type)||mob.isBaby)) {
            const mPos = mob.position || mob.mesh?.position;
            if (mPos && mPos.distanceTo(boat.position) < 1.3) {
              boat.passenger = mob;
              mob.isRiding = true;
              mob.ridingBoat = boat;
              break;
            }
          }
        }
      }
    }
  }

  #boatBlocked(boat) {
    const p = boat.position;
    const c = Math.abs(Math.cos(boat.yaw)), s = Math.abs(Math.sin(boat.yaw));
    const rx = c*0.6875 + s*0.9375, rz = s*0.6875 + c*0.9375;
    for (let x=Math.floor(p.x-rx+0.02); x<=Math.floor(p.x+rx-0.02); x++) {
      for (let z=Math.floor(p.z-rz+0.02); z<=Math.floor(p.z+rz-0.02); z++) {
        for (let y=Math.floor(p.y+0.15); y<=Math.floor(p.y+0.55); y++) {
          const id=this.world.getVoxel(x,y,z);
          if (id!==B.AIR && !isWaterCell(id) && BLOCK_DEFS[id]?.solid!==false) return true;
        }
      }
    }
    return false;
  }

  #boatWaterY(water) {
    const below = this.world.getVoxel(water.x, water.y - 1, water.z);
    const floor = below !== B.AIR && !isWaterCell(below) && BLOCK_DEFS[below]?.solid !== false ? water.y : -Infinity;
    // A thin stream over solid ground cannot accommodate the full draft.
    return Math.max(water.surfaceY - 0.13, floor);
  }

  #surfaceY(p) {
    for (let y = Math.min(63, p[1]); y >= Math.max(0, p[1] - 1); y--) {
      const v = this.world.getVoxel(p[0], y, p[2]);
      if (v === B.WATER && this.world.getVoxel(p[0], y + 1, p[2]) !== B.WATER) {
        return this.#boatWaterY(waterSurfaceAt(this.world, p[0]+0.5, y, p[2]+0.5));
      }
      if (v !== B.AIR && v !== B.WATER && BLOCK_DEFS[v]?.solid !== false && this.world.getVoxel(p[0], y + 1, p[2]) === B.AIR) {
        return y + 1.0;
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

  remove(vehicle) {
    if (this.game?.riding === vehicle) { this.game.dismount?.(); this.game.riding = null; }
    if(vehicle.rider?.vehicle===vehicle){vehicle.rider.vehicle=null;vehicle.rider=null;}
    if (vehicle.mesh && this.game?.scene) this.game.scene.remove(vehicle.mesh);
    if (vehicle.kind === 'boat') {
      const materials = new Set();
      vehicle.mesh?.traverse(part => { part.geometry?.dispose(); if (part.material) materials.add(part.material); });
      for (const material of materials) material.dispose();
      if (vehicle.passenger) { vehicle.passenger.isRiding = false; vehicle.passenger.ridingBoat = null; vehicle.passenger = null; }
    }
    let i = this.carts.indexOf(vehicle);
    if (i >= 0) this.carts.splice(i, 1);
    i = this.boats.indexOf(vehicle);
    if (i >= 0) this.boats.splice(i, 1);
  }

  reset() {
    for (const cart of [...this.carts, ...this.boats]) this.remove(cart);
    this.carts = [];
    this.boats = [];
    this.boatAccumulator = 0;
    this.time = 0;
  }

  cartAt(cell, tolerance = 0.5) {
    return this.carts.find(cart => (
      Math.abs(cart.position.x - (cell[0] + 0.5)) <= tolerance
      && Math.abs(cart.position.z - (cell[2] + 0.5)) <= tolerance
      && Math.abs(cart.position.y - (cell[1] + 0.35)) <= 1.5
    )) || null;
  }

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

export const RAIL_LIMITS = {
  MAX_CART_SPEED,
  BOAT_WATER_MAX_SPEED,
  BOAT_ICE_MAX_SPEED,
  BOAT_PACKED_ICE_MAX_SPEED,
  BOAT_BLUE_ICE_MAX_SPEED,
  TICK
};
export { DIRECTIONS };
