// The wind charge a player throws (and a dispenser fires), as the Minecraft Wiki's "Wind Charge", "Explosion" and
// "Blast Protection" pages describe it in Java Edition:
//
// * Thrown by using it; used up (not in Creative); a 10-tick (0.5 s) cooldown shared by every wind charge carried;
//   stacks to 64; four from a breeze rod (extraRecipes.js).
// * It flies in a straight line (no gravity, like a fireball), with a small random spread in a cone, carrying some of
//   the thrower's own motion. Liquids slow it (attenuate its distance); cobwebs and powdered snow too.
// * A direct hit on an entity: 1 damage and knockback. Then -- on an entity or a block -- a burst of wind: an
//   explosion of power 1.2 that destroys nothing and hurts no one, pushing every entity within 2 x 1.2 = 2.4 blocks
//   (the thrower included: a charge at one's own feet launches one about 8 blocks up -- the "Who Needs Rockets?"
//   advancement's 8) by the Explosion page's rule:
//     magnitude = (1 - distance / (2 x power)) x exposure x 1.22 x (1 - explosion knockback resistance)
//   distance from the centre to the entity's feet, along the line from the centre to its eyes; exposure is the share
//   of rays from the centre to points of the entity's box that no block stops. Blast Protection adds 15% explosion
//   knockback resistance a level, over all armour worn.
// * A player launched by a player's wind charge takes fall damage only for the fall below the burst's height.
// * The burst flips wooden doors and trapdoors (never iron ones), flips fence gates and levers, presses buttons, rings
//   bells, puts out lit candles, breaks chorus flowers and shatters decorated pots.
// * A melee hit (or another projectile) deflects it, as a ghast's fireball.
//
// Numbers not on those pages are Java's own and say so where they are used.
//
// The breeze's wind charge (`breeze_wind_charge`) flies here too (source 'breeze'): the same straight flight, a direct
// hit of 1 (Easy, Normal) or 1.5 (Hard) damage (Breeze), and a burst that reaches "a 6-block sphere" (power 3) and
// pushes with "40% less knockback than regular explosions" (multiplier 0.6). A player it launches takes fall damage
// in full: the floor at the burst's height is only for a player's or a dispenser's charge.
//
// In a shared world (multiplayer/), a charge this player threw also reaches the other players: they are bodies here,
// and a direct hit's damage and the burst's push go to each through the host (worldSyncManager.js windChargeHit),
// which applies them in their own game. The others see the charge fly (remoteShots.js).
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { knockbackFactor } from './mobEnvironment.js';
import { toggleFenceGate, extinguishCandle } from './blockStateActions.js';

const TICKS = 20;
export const WIND_CHARGE = Object.freeze({
  /** Wiki infobox: "usecooldown 0.5 seconds (10 ticks)". */
  cooldownTicks: 10,
  cooldownSeconds: 0.5,
  /** Wiki infobox: stackable to 64. */
  stackSize: 64,
  /** Wiki: a direct hit "takes 1 damage". */
  directDamage: 1,
  /** Wiki infobox: 0.3125 blocks high and wide. */
  size: 0.3125,
  /** Explosion: power 1.2 (it reaches 2 x power: the wiki's "2.4-block sphere"). */
  power: 1.2,
  /** Explosion page, knockback multiplier: "Player-thrown wind charge: 1.22". */
  knockbackMultiplier: 1.22,
  /** Java: a thrown wind charge leaves at 1.5 blocks a tick (30 a second); not on the wiki's page. */
  speed: 1.5 * TICKS,
  /** Java: the throw's spread (inaccuracy 1, a triangular 0.0172275 per unit); the wiki: "a random offset ... over a cone". */
  spread: 0.0172275,
  /** It flies until it hits something; one far from anything is let go after this many seconds. */
  maxSeconds: 10,
  /** Java: in a liquid it keeps 80% of its speed a tick (the wiki: "distance attenuated by liquids"). */
  liquidInertia: 0.8,
  /** Blast Protection: +15% explosion knockback resistance a level (Java), summed over the armour. */
  blastProtectionPerLevel: 0.15,
  /** A thrower's own charge does not hit it for its first moments (the wiki: the thrower is "briefly invincible"). */
});
/**
 * The breeze's charge (Wind Charge: "breeze-fired wind charges affect entities within a 6-block sphere", "40% less
 * knockback than regular explosions"; Explosion: knockback multiplier 0.6). Its flight speed, 0.7 blocks a tick, is
 * Java's (BREEZE's shot), not on the wiki.
 */
export const BREEZE_WIND_CHARGE = Object.freeze({ power: 3, knockbackMultiplier: 0.6, speed: 0.7 * 20 });
/** The burst's figures for a charge: a breeze's, or a player's or dispenser's. */
export const burstKindOf = (c) => (c?.source === 'breeze' ? BREEZE_WIND_CHARGE : WIND_CHARGE);

const LIQUIDS = new Set([BLOCKS.WATER, BLOCKS.LAVA]);
const SLOWING = new Set([BLOCKS.COBWEB, BLOCKS.POWDER_SNOW].filter((b) => b !== undefined));
/** A block a wind charge strikes: anything with a collision box (not air, liquids, plants or cobwebs). */
export function stopsWindCharge(id) {
  if (!id || id === BLOCKS.AIR || LIQUIDS.has(id) || SLOWING.has(id)) return false;
  const def = BLOCK_DEFS[id];
  return !!def && def.solid !== false && !def.plant;
}
/** A block that stops an exposure ray: a full solid cube (Explosion: blocks reaching outside their cube count as their cube). */
function blocksRay(id) {
  if (!id || id === BLOCKS.AIR || LIQUIDS.has(id)) return false;
  const def = BLOCK_DEFS[id];
  return !!def && def.solid !== false && !def.plant && !def.transparent;
}

/**
 * Exposure (Explosion): the share of rays from the centre to sample points spread over the entity's box (a grid of
 * 1 / (2 x size + 1) steps a side) that no block stops. `box` is { x, y, z } feet, `width`, `height`.
 */
export function exposure(world, center, box) {
  const w = box.width ?? 0.6, h = box.height ?? 1.8;
  const sx = 1 / (w * 2 + 1), sy = 1 / (h * 2 + 1), sz = 1 / (w * 2 + 1);
  const ox = (1 - Math.floor(1 / sx) * sx) / 2, oz = (1 - Math.floor(1 / sz) * sz) / 2;
  let seen = 0, total = 0;
  for (let a = 0; a <= 1; a += sx) for (let b = 0; b <= 1; b += sy) for (let c = 0; c <= 1; c += sz) {
    const tx = box.x - w / 2 + a * w + ox, ty = box.y + b * h, tz = box.z - w / 2 + c * w + oz;
    total++;
    const dx = tx - center.x, dy = ty - center.y, dz = tz - center.z, len = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(len / 0.1));
    let clear = true;
    for (let i = 1; i < steps && clear; i++) {
      const t = i / steps;
      if (blocksRay(world.getVoxel(Math.floor(center.x + dx * t), Math.floor(center.y + dy * t), Math.floor(center.z + dz * t)))) clear = false;
    }
    if (clear) seen++;
  }
  return total ? seen / total : 1;
}

/** Explosion knockback resistance from Blast Protection: 15% a level, summed over every armour piece, at most 100%. */
export function blastProtectionResistance(armor) {
  let levels = 0;
  for (const piece of Object.values(armor ?? {})) for (const e of piece?.enchantments ?? []) if (e.id === 'blast_protection') levels += e.level ?? 1;
  return Math.min(1, levels * WIND_CHARGE.blastProtectionPerLevel);
}

/**
 * The burst's push on one entity, in blocks a tick (Explosion): null outside its reach (2 x power from the feet).
 * { center, feet, eyeHeight, exposure, resistance, power, multiplier }.
 */
export function burstImpulse({ center, feet, eyeHeight = 1.62, exposure: seen = 1, resistance = 0, power = WIND_CHARGE.power, multiplier = WIND_CHARGE.knockbackMultiplier }) {
  const distance = Math.hypot(feet.x - center.x, feet.y - center.y, feet.z - center.z);
  if (distance > 2 * power) return null;
  const magnitude = (1 - distance / (2 * power)) * seen * multiplier * (1 - Math.min(1, Math.max(0, resistance)));
  let dx = feet.x - center.x, dy = feet.y + eyeHeight - center.y, dz = feet.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-9) { dx = 0; dy = 1; dz = 0; } else { dx /= len; dy /= len; dz /= len; }
  return { x: dx * magnitude, y: dy * magnitude, z: dz * magnitude, magnitude, distance };
}

/**
 * A player pushed by a burst: `impulse` (blocks a tick) joins its velocity, moved by Java's tick physics (player.js
 * movePvpKnockback). With `floorY` (a player's or dispenser's charge) its fall counts only below that height.
 */
export function pushPlayer(p, impulse, floorY = null) {
  p.velocity.x += impulse.x * TICKS; p.velocity.y += impulse.y * TICKS; p.velocity.z += impulse.z * TICKS;
  p.pvpKnockbackActive = true;
  p.pvpKnockbackAccumulator = 0;
  p.pvpKnockbackGrounded = p.onGround;
  if (impulse.y > 0) p.onGround = false;
  if (Number.isFinite(floorY)) { p.fallDistance = 0; p.windChargeFloorY = floorY; }
}

/** Java's triangular spread: a value in [-spread, spread], most often near 0. */
const triangle = (random, spread) => (random() - random()) * spread;

/**
 * The blocks a burst at `center` acts on (each block whose middle is within the explosion's power plus half a block),
 * and what it does to each, as the wiki lists. `world` must give getVoxel/setVoxel; `doors` toggleDoor/toggleTrapdoor
 * (DoorManager), `redstone` interact (for levers and buttons), `sounds` playBell, `entities` spawnDroppedItem.
 * Returns { flipped, pressed, rung, extinguished, broken } (each a list of "x,y,z" with the block's name).
 */
export function windBurstBlocks({ world, center, doors = null, redstone = null, sounds = null, entities = null, power = WIND_CHARGE.power }) {
  const out = { flipped: [], pressed: [], rung: [], extinguished: [], broken: [] };
  const seenDoors = new Set();
  const r = Math.ceil(power + 1);
  for (let x = Math.floor(center.x) - r; x <= Math.floor(center.x) + r; x++)
    for (let y = Math.floor(center.y) - r; y <= Math.floor(center.y) + r; y++)
      for (let z = Math.floor(center.z) - r; z <= Math.floor(center.z) + r; z++) {
        if (Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z) > power + 0.5) continue;
        const id = world.getVoxel(x, y, z);
        if (!id || id === BLOCKS.AIR) continue;
        const def = BLOCK_DEFS[id] ?? {};
        const name = def.name ?? String(id);
        const at = `${x},${y},${z} ${name}`;
        const iron = /iron/i.test(name);
        if (def.door) {
          if (iron) continue; // "Non-iron doors": an iron door stays as it is
          // A door is two blocks, flipped together: once one half is flipped, the other is done.
          if (seenDoors.has(`${x},${y},${z}`)) continue;
          for (const dy of [-1, 0, 1]) seenDoors.add(`${x},${y + dy},${z}`);
          if (doors?.toggleDoor?.(x, y, z)?.success !== false) out.flipped.push(at);
        } else if (def.trapdoor) {
          if (iron) continue;
          if (doors?.toggleTrapdoor?.(x, y, z)?.success !== false) out.flipped.push(at);
        } else if (id === BLOCKS.LEVER || def.button || /button/i.test(name)) {
          redstone?.interact?.([x, y, z], false, null);
          (id === BLOCKS.LEVER ? out.flipped : out.pressed).push(at);
        } else if (id === BLOCKS.BELL) {
          sounds?.playBell?.();
          out.rung.push(at);
        } else if (id === BLOCKS.CHORUS_FLOWER || id === BLOCKS.DECORATED_POT) {
          world.setVoxel(x, y, z, BLOCKS.AIR);
          entities?.spawnDroppedItem?.(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), id, true, 1);
          out.broken.push(at);
        } else if (def.fenceGate) {
          // "When hit, it opens if closed and vice versa" (Fence Gate).
          if (toggleFenceGate(world, x, y, z, { sounds })) out.flipped.push(at);
        } else if (def.candle && def.lit) {
          // "Lit candles (both standalone and on cake) are extinguished."
          if (extinguishCandle(world, x, y, z, { sounds })) out.extinguished.push(at);
        }
      }
  return out;
}

/**
 * The wind charges in flight in one game: thrown by the player (use), fired by dispensers (launch), each flown, struck
 * and burst; and the player's 0.5 s cooldown on them. `game` gives world, player, inventory, mobs (a MobManager:
 * mobs, damageMob, getMobDimensions), doorManager, sounds, scene and ui -- any may be missing in a test.
 */
export class WindChargeSystem {
  constructor(game, { random = Math.random } = {}) {
    this.game = game;
    this.random = random;
    this.charges = [];
    this.time = 0;
    this.cooldownUntil = 0;
  }

  /** The cooldown's share left (1 just thrown, 0 ready), for the hotbar's overlay. */
  cooldownFraction() { return Math.max(0, Math.min(1, (this.cooldownUntil - this.time) / WIND_CHARGE.cooldownSeconds)); }

  /** The player uses the item in hand: true when it is a wind charge (thrown, or held back by the cooldown). */
  use() {
    const g = this.game, item = g.inventory?.getActiveItem?.();
    if (!item || item.isBlock || item.id !== 'wind_charge') return false;
    if (this.time < this.cooldownUntil) return true;
    const p = g.player;
    const direction = new THREE.Vector3();
    if (g.camera?.getWorldDirection) g.camera.getWorldDirection(direction); else direction.set(-Math.sin(p.yaw ?? 0) * Math.cos(p.pitch ?? 0), Math.sin(p.pitch ?? 0), -Math.cos(p.yaw ?? 0) * Math.cos(p.pitch ?? 0));
    const origin = new THREE.Vector3(p.position.x, p.position.y + (p.eyeHeight ?? 1.62), p.position.z);
    // The thrower's own motion is carried (the wiki: it "slightly offset[s] to whatever direction the shooter is
    // moving"); Java adds the vertical part only while airborne.
    const carry = new THREE.Vector3(p.velocity?.x ?? 0, p.onGround ? 0 : p.velocity?.y ?? 0, p.velocity?.z ?? 0);
    const charge = this.launch({ origin, direction, owner: p, carry, source: 'player' });
    g.worldSync?.shareShot?.('wind_charge', charge.position, charge.velocity); // the others see it fly (remoteShots.js)
    if (p.gamemode !== 'creative') g.inventory.consumeActiveItem?.(1);
    this.cooldownUntil = this.time + WIND_CHARGE.cooldownSeconds;
    if (g.sounds?.playWindChargeThrow) g.sounds.playWindChargeThrow(); else g.sounds?.playBowShoot?.();
    g.ui?.updateHotbar?.();
    return true;
  }

  /**
   * A charge leaves `origin` along `direction`, plus `carry` (blocks a second). `source` is 'player', 'dispenser' or
   * 'breeze'; a breeze's flies at its own speed, straight where it aims (its spread is not modelled), and hits for
   * `damage` (the breeze's, by difficulty).
   */
  launch({ origin, direction, owner = null, carry = null, source = 'player', damage = WIND_CHARGE.directDamage, speed = null }) {
    const d = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    if (source !== 'breeze') { d.x += triangle(this.random, WIND_CHARGE.spread); d.y += triangle(this.random, WIND_CHARGE.spread); d.z += triangle(this.random, WIND_CHARGE.spread); }
    const velocity = d.multiplyScalar(speed ?? (source === 'breeze' ? BREEZE_WIND_CHARGE.speed : WIND_CHARGE.speed));
    if (carry) velocity.add(carry);
    const charge = { position: new THREE.Vector3(origin.x, origin.y, origin.z), velocity, age: 0, owner, source, damage, mesh: null };
    if (this.game.scene) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(WIND_CHARGE.size / 2, 1), new THREE.MeshLambertMaterial({ color: 0xd8f2ff, emissive: 0x6fa8c8, transparent: true, opacity: 0.85 }));
      mesh.position.copy(charge.position);
      this.game.scene.add(mesh);
      charge.mesh = mesh;
    }
    this.charges.push(charge);
    return charge;
  }

  /**
   * The players and mobs a burst or a direct hit can touch: { entity, feet, width, height, eyeHeight, kind }. With
   * `c` a charge this player threw, the other players in a shared world too (kind 'remote', `peerId`).
   */
  bodies(c = null) {
    const out = [];
    if (c && c.owner && c.owner === this.game.player) {
      for (const r of this.game.worldSync?.remoteBodies?.() ?? []) out.push({ entity: r, peerId: r.peerId, feet: r.feet, width: 0.6, height: 1.8, eyeHeight: 1.62, kind: 'remote' });
    }
    const p = this.game.player;
    if (p && !p.isDead && p.gamemode !== 'spectator') out.push({ entity: p, feet: p.position, width: 0.6, height: p.height ?? 1.8, eyeHeight: p.eyeHeight ?? 1.62, kind: 'player' });
    const m = this.game.mobs;
    for (const mob of m?.mobs ?? []) {
      if (!(mob.health > 0) || !mob.mesh) continue;
      const dims = m.getMobDimensions?.(mob.type) ?? {};
      const width = mob.width ?? dims.width ?? 0.6, height = mob.height ?? dims.height ?? 1.8;
      out.push({ entity: mob, feet: mob.mesh.position, width, height, eyeHeight: height * 0.85, kind: 'mob' });
    }
    return out;
  }

  update(dt) {
    this.time += dt;
    // The hotbar's cooldown overlay, each frame while it shows and once more when it has gone.
    const cooling = this.cooldownFraction();
    if (cooling > 0 || this.shownCooldown > 0) { this.game.ui?.updateItemCooldowns?.('wind_charge', cooling); this.shownCooldown = cooling; }
    const w = this.game.world;
    for (const c of [...this.charges]) {
      c.age += dt;
      if (c.age > WIND_CHARGE.maxSeconds) { this.remove(c); continue; }
      const steps = Math.max(1, Math.ceil((c.velocity.length() * dt) / 0.1));
      const step = dt / steps;
      let ended = false;
      for (let i = 0; i < steps && !ended; i++) {
        const here = w?.getVoxel?.(Math.floor(c.position.x), Math.floor(c.position.y), Math.floor(c.position.z));
        if (LIQUIDS.has(here) || SLOWING.has(here)) c.velocity.multiplyScalar(Math.pow(WIND_CHARGE.liquidInertia, step * TICKS));
        const next = c.position.clone().addScaledVector(c.velocity, step);
        const hit = this.bodyAt(next, c);
        if (hit) { this.directHit(c, hit); ended = true; break; }
        if (stopsWindCharge(w?.getVoxel?.(Math.floor(next.x), Math.floor(next.y), Math.floor(next.z)))) {
          this.burst(c.position.clone(), c);
          ended = true;
          break;
        }
        c.position.copy(next);
        // Java's "left owner": the thrower can be hit only once the charge has been outside its body.
        if (!c.leftOwner && c.owner && !this.bodyAt(c.position, { owner: null, leftOwner: true }, c.owner)) c.leftOwner = true;
      }
      if (ended) { this.remove(c); continue; }
      c.mesh?.position.copy(c.position);
      if (c.mesh) { c.mesh.rotation.y += dt * 9; c.mesh.rotation.x += dt * 5; }
    }
  }

  /** The body a charge at `point` is inside (its own half-size added), not its thrower until the charge has left its body. */
  bodyAt(point, c, only = null) {
    const pad = WIND_CHARGE.size / 2;
    for (const b of this.bodies(c)) {
      if (only && b.entity !== only) continue;
      if (b.entity === c.owner && !c.leftOwner) continue;
      const half = b.width / 2 + pad;
      if (Math.abs(point.x - b.feet.x) <= half && Math.abs(point.z - b.feet.z) <= half && point.y >= b.feet.y - pad && point.y <= b.feet.y + b.height + pad) return b;
    }
    return null;
  }

  /** A direct hit: the charge's damage (1 for a player's), then the burst where it struck. */
  directHit(c, body) {
    const from = c.position.clone().addScaledVector(c.velocity, -0.01);
    const damage = c.damage ?? WIND_CHARGE.directDamage;
    if (body.kind === 'remote') c.hitPeer = body.peerId; // its damage goes with the burst's push (burst below)
    else if (damage > 0 && body.kind === 'player') body.entity.takeDamage?.(damage, from, c.source === 'breeze' ? 'breeze' : 'wind_charge', c.owner, { fromPlayer: c.source === 'player' });
    else if (damage > 0) this.game.mobs?.damageMob?.(body.entity, damage, from, false, c.owner);
    this.burst(c.position.clone(), c);
  }

  /**
   * The burst at `center`: every player and mob within reach pushed by the Explosion rule (no damage), and the blocks
   * around it acted on. Returns what it did: { pushed: [{ entity, impulse }], blocks }.
   */
  burst(center, c = {}) {
    const g = this.game, pushed = [], kind = burstKindOf(c);
    for (const b of this.bodies(c)) {
      if (b.kind === 'player' && (b.entity.isFlying && b.entity.gamemode === 'creative')) continue; // a flying Creative player is not knocked back (Explosion)
      if (c.source === 'breeze' && b.entity === c.owner) continue; // the breeze that fired it stays where it is
      const seen = g.world ? exposure(g.world, center, { x: b.feet.x, y: b.feet.y, z: b.feet.z, width: b.width, height: b.height }) : 1;
      // Another player's Blast Protection is applied in their own game (worldSyncManager.js takeHit).
      const resistance = b.kind === 'player' ? blastProtectionResistance(g.inventory?.armor ?? b.entity.armor) : 0;
      const impulse = burstImpulse({ center, feet: b.feet, eyeHeight: b.eyeHeight, exposure: seen, resistance, power: kind.power, multiplier: kind.knockbackMultiplier });
      if (b.kind === 'remote') {
        const damage = b.peerId === c.hitPeer ? (c.damage ?? WIND_CHARGE.directDamage) : 0;
        if (impulse?.magnitude > 0 || damage > 0) g.worldSync?.windChargeHit?.(b.peerId, damage, impulse ? { x: impulse.x, y: impulse.y, z: impulse.z } : { x: 0, y: 0, z: 0 }, { floorY: center.y });
        if (impulse) pushed.push({ entity: b.entity, impulse });
        continue;
      }
      if (!impulse || impulse.magnitude <= 0) continue;
      // Wind Charge: the fall counts only below the burst for "wind charges shot by a player or a dispenser".
      if (b.kind === 'player') this.pushPlayer(b.entity, impulse, center, c.source === 'player' || c.source === 'dispenser');
      else this.pushMob(b.entity, impulse);
      pushed.push({ entity: b.entity, impulse });
    }
    const blocks = g.world ? windBurstBlocks({ world: g.world, center, doors: g.doorManager, redstone: g.world.redstone, sounds: g.sounds, entities: g.entities, power: kind.power }) : null;
    if (blocks && (blocks.flipped.length || blocks.pressed.length || blocks.broken.length || blocks.extinguished.length)) g.refreshDirtyChunks?.();
    g.sounds?.playWindBurst?.();
    g.mobs?.spawnParticleBurst?.(center.clone(), 0xe4f6ff, 14);
    return { pushed, blocks };
  }

  /**
   * A player pushed: the impulse joins its velocity, moved by Java's tick physics (player.js movePvpKnockback). A
   * player's own kind of charge leaves fall damage counted only below the burst's height.
   */
  pushPlayer(p, impulse, center, fromPlayerCharge) { pushPlayer(p, impulse, fromPlayerCharge ? center.y : null); }

  /** A mob pushed, less its knockback resistance (the wiki: iron golems, wardens and shulkers are not knocked back). */
  pushMob(mob, impulse) {
    // The mob's share of knockback, from the wiki's knockback resistance (mobEnvironment.js), as a hit's.
    const share = mob.isBoss || /dragon/i.test(mob.name || '') ? 0 : knockbackFactor(mob.type) ?? 1;
    if (share <= 0) return;
    mob.knockback = (mob.knockback ?? new THREE.Vector3()).add(new THREE.Vector3(impulse.x, 0, impulse.z).multiplyScalar(TICKS * share));
    mob.knockbackConsumed = false;
    if (mob.velocity) mob.velocity.y += impulse.y * TICKS * share;
  }

  /**
   * A melee hit along the player's look deflects the first charge within 3 blocks of the eye and 0.6 of the line: it
   * flies off along the look, now the hitter's. True when one was hit.
   */
  deflect(origin, direction, owner = this.game.player) {
    const d = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    for (const c of this.charges) {
      const rel = c.position.clone().sub(origin);
      const along = rel.dot(d);
      if (along < 0 || along > 3) continue;
      if (rel.clone().sub(d.clone().multiplyScalar(along)).length() > 0.6) continue;
      c.velocity.copy(d.multiplyScalar(c.velocity.length() || WIND_CHARGE.speed));
      c.owner = owner; c.leftOwner = false;
      c.age = 0;
      return true;
    }
    return false;
  }

  remove(c) {
    c.mesh?.removeFromParent?.();
    c.mesh?.geometry?.dispose?.();
    c.mesh?.material?.dispose?.();
    const i = this.charges.indexOf(c);
    if (i >= 0) this.charges.splice(i, 1);
  }

  clear() { for (const c of [...this.charges]) this.remove(c); }
}
