// Thrown lingering potions: a cloud on the ground that gives its effect to whatever stands in it.
//
// Lingering potions brewed (dragon's breath on a splash potion) and could not be used at all: nothing threw them. The
// cloud is Java's area effect cloud as a thrown lingering potion makes it (the wiki's Lingering Potion page, and
// ThrownPotion's numbers): radius 3, shrinking to nothing over 30 seconds, after a half-second wait; each time it gives
// its effect to someone the radius drops by half a block; the same target is given it at most once a second; an
// effect with a duration lasts a quarter of the potion's, and Healing and Harming are at half their potency.
import * as THREE from 'three';
import { POTION_DATA, potionCoreFor } from './brewing.js';
import { effectsFor, immuneToEffect, instantAmount, instantOutcomeOnMob, INSTANT_EFFECT_IDS } from './statusEffects.js';
import { BLOCK_DEFS } from './blocks.js';

export const LINGERING_CLOUD = Object.freeze({
  radius: 3, seconds: 30, waitSeconds: 0.5, radiusOnUse: 0.5, reapplySeconds: 1, durationScale: 0.25, instantScale: 0.5,
});

/** True for a lingering form of a potion this game has. */
export function isLingeringPotion(itemId) {
  return typeof itemId === 'string' && itemId.startsWith('lingering_') && Boolean(POTION_DATA[potionCoreFor(itemId)]);
}

/** A cloud's state, before any visuals: where, how big, and what it gives. */
export function createCloud(center, itemId) {
  const potion = POTION_DATA[potionCoreFor(itemId)] ?? {};
  return {
    x: center.x, y: center.y, z: center.z, radius: LINGERING_CLOUD.radius, age: 0, color: potion.color ?? '#3b82f6',
    effects: potion.effect ? effectsFor(potion.effect, potion.level ?? 1) : [],
    seconds: (potion.duration ?? 0) * LINGERING_CLOUD.durationScale,
    lastGiven: new Map(),
  };
}

/** Is a target (a mob, or the player) standing in the cloud? Within its radius, and its feet near the cloud's height. */
export function inCloud(cloud, position) {
  if (!position) return false;
  const dy = position.y - cloud.y;
  return dy > -0.5 && dy < 2 && Math.hypot(position.x - cloud.x, position.z - cloud.z) <= cloud.radius;
}

/** Give the cloud's effect to one target: a duration effect at a quarter, an instant one at half potency. */
export function giveCloudEffect(cloud, target, { player = null, mobs = null } = {}) {
  const isPlayer = target === player;
  let given = false;
  for (const [name, level] of cloud.effects) {
    if (!isPlayer && immuneToEffect(name, target.type)) continue;
    if (INSTANT_EFFECT_IDS.has(name)) {
      if (isPlayer) {
        const amount = instantAmount(name, level) * LINGERING_CLOUD.instantScale;
        if (name === 'instant_health') target.health = Math.min(target.maxHealth ?? target.health, target.health + amount);
        else target.takeDamage?.(amount, null, 'magic');
      } else {
        const outcome = instantOutcomeOnMob(name, level, target.type);
        if (outcome?.damage) mobs?.damageMob?.(target, outcome.damage * LINGERING_CLOUD.instantScale, null, false, null, true);
        else if (outcome?.heal) target.health = Math.min(target.maxHealth ?? target.health, target.health + outcome.heal * LINGERING_CLOUD.instantScale);
      }
      given = true;
    } else if (target.applyStatusEffect) {
      target.applyStatusEffect(name, cloud.seconds, level);
      given = true;
    }
  }
  return given;
}

/**
 * One step of a cloud: it ages and shrinks, and after its wait gives its effect to each target in it that has not had
 * it in the last second, shrinking by half a block a time. @returns {boolean} whether the cloud is still there
 */
export function stepCloud(cloud, dt, targets, context = {}) {
  cloud.age += dt;
  cloud.radius -= (LINGERING_CLOUD.radius / LINGERING_CLOUD.seconds) * dt;
  if (cloud.radius <= 0 || cloud.age >= LINGERING_CLOUD.seconds + LINGERING_CLOUD.waitSeconds) return false;
  if (cloud.age < LINGERING_CLOUD.waitSeconds || !cloud.effects.length) return true;
  for (const target of targets) {
    if (!target || target.health <= 0) continue;
    const position = target.mesh?.position ?? target.position;
    if (!inCloud(cloud, position)) continue;
    const last = cloud.lastGiven.get(target);
    if (last !== undefined && cloud.age - last < LINGERING_CLOUD.reapplySeconds) continue;
    if (!giveCloudEffect(cloud, target, context)) continue;
    cloud.lastGiven.set(target, cloud.age);
    cloud.radius -= LINGERING_CLOUD.radiusOnUse;
    if (cloud.radius <= 0) return false;
  }
  return true;
}

/** The game's clouds: thrown, stepped and drawn. */
export class LingeringClouds {
  constructor(game) { this.game = game; this.clouds = []; }

  /** Throw a lingering potion to land at `at`: the cloud settles on the ground below it. */
  throw(at, itemId) {
    if (!isLingeringPotion(itemId)) return false;
    const world = this.game?.world, x = Math.floor(at.x), z = Math.floor(at.z);
    let y = Math.floor(at.y);
    // Down to the first block with something to stand on, at most eight blocks.
    for (let i = 0; i < 8 && world && BLOCK_DEFS[world.getVoxel(x, y - 1, z)]?.solid === false; i++) y--;
    const cloud = createCloud({ x: at.x, y, z: at.z }, itemId);
    if (this.game?.scene) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: cloud.color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(cloud.x, cloud.y + 0.05, cloud.z); mesh.renderOrder = 3;
      this.game.scene.add(mesh); cloud.mesh = mesh;
    }
    this.clouds.push(cloud);
    return true;
  }

  update(dt) {
    if (!this.clouds.length) return;
    const g = this.game, targets = [...(g?.mobs?.mobs ?? []), g?.player].filter(Boolean);
    const context = { player: g?.player, mobs: g?.mobs };
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const cloud = this.clouds[i];
      const alive = stepCloud(cloud, dt, targets, context);
      if (cloud.mesh) cloud.mesh.scale.setScalar(Math.max(0.01, cloud.radius));
      if (!alive) { this.remove(cloud); this.clouds.splice(i, 1); }
    }
  }

  remove(cloud) {
    if (!cloud.mesh) return;
    cloud.mesh.removeFromParent();
    cloud.mesh.geometry.dispose(); cloud.mesh.material.dispose();
  }

  clear() { for (const cloud of this.clouds) this.remove(cloud); this.clouds = []; }
}
