// Another player's throws, drawn here: what flies from their hand, and what breaks where it lands. Drawn only -- the
// thrower's own game decides what anything hits, and the host whether that hurts (worldSyncManager.js projectileHit) --
// so an egg hatches nothing here and a pearl moves nobody. A potion is the exception: it reaches this player here, as
// it would in the thrower's world, its harmful effects only as the host rules (`harm`, shareSession.js relayShot).
//
// Arrows and snowballs are the game's own (arrows.js spawnArrow with `visual`, netherCombat.js throwVisualSnowball),
// so they stick and look the same. The rest fly here, with the thrower's own physics: an egg as animalBehaviors.js
// throws one, a pearl as endItems.js, an Eye of Ender as main.js. A firework is the game's own rocket.
import * as THREE from 'three';
import { BLOCK_DEFS } from '../blocks.js';
import { POTION_DATA } from '../brewing.js';
import { ENDER_EYE_LIFE } from '../endPortal.js';
import { throwVisualSnowball } from '../netherCombat.js';
import { splashOnPlayer } from '../splashPotion.js';

/** How each thrown thing looks and falls, from the code that throws it for real. */
export const FLYING = Object.freeze({
  egg: { radius: 0.12, color: 0xf5f5dc, gravity: 18, life: 4, burst: 0xf5f5dc, collide: true },
  ender_pearl: { radius: 0.13, color: 0x269e91, emissive: 0x124c45, gravity: 16, life: 20, burst: 0xa855f7, collide: true },
  // An Eye of Ender arcs through anything and is gone after its flight.
  ender_eye: { radius: 0.18, color: 0x86efac, gravity: 14, life: ENDER_EYE_LIFE, burst: 0x86efac, collide: false, basic: true },
});

const solidAt = (world, p) => {
  const def = BLOCK_DEFS[world?.getVoxel?.(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))];
  return Boolean(def && def.solid !== false && !def.plant);
};

/** A potion's colour, from its item id (`splash_potion_of_...`, `lingering_potion_of_...`). */
export function potionColor(itemId) {
  const core = String(itemId ?? '').replace(/^(splash|lingering)_/, '');
  const hex = POTION_DATA[core]?.color;
  return hex ? parseInt(hex.slice(1), 16) : 0x4a044e;
}

export class RemoteShots {
  constructor(game) { this.game = game; this.flying = []; }

  /** Draw one shot (shareProtocol.js sanitizeShot), thrown by `shooterId`. */
  show(shot, shooterId = null) {
    const g = this.game, mobs = g?.mobs;
    const at = new THREE.Vector3(shot.x, shot.y, shot.z);
    const velocity = new THREE.Vector3(shot.vx ?? 0, shot.vy ?? 0, shot.vz ?? 0);
    switch (shot.kind) {
      case 'arrow':
        return Boolean(mobs?.spawnArrow?.(at, velocity.clone().normalize(), 'remote', { visual: true, shooterId, speed: velocity.length(), damage: 0, flaming: Boolean(shot.flaming), spectral: Boolean(shot.spectral) }));
      case 'snowball':
        if (!mobs?.scene) return false;
        throwVisualSnowball(mobs, at, velocity, shooterId);
        return true;
      case 'firework':
        g?.entities?.spawnFireworkRocket?.(at, shot.top);
        return true;
      case 'splash_potion':
        mobs?.spawnParticleBurst?.(at, potionColor(shot.item), 16);
        g?.sounds?.playPotionSplash?.();
        if (g?.player && splashOnPlayer(g.player, at, shot.item, { harm: shot.harm === true })) g.ui?.updateStats?.();
        return true;
      case 'lingering_potion':
        mobs?.spawnParticleBurst?.(at, potionColor(shot.item), 16);
        g?.sounds?.playPotionSplash?.();
        g?.lingeringClouds?.throw?.(at, shot.item, { remote: true, harm: shot.harm === true });
        return true;
      case 'experience_bottle':
        mobs?.spawnParticleBurst?.(at, 0xa3e635, 14);
        g?.sounds?.playGlassBreak?.();
        return true;
      default:
        return this.throw(shot.kind, at, velocity, shooterId);
    }
  }

  /** Something that flies here until it lands: an egg, a pearl, an Eye of Ender. */
  throw(kind, at, velocity, shooterId = null) {
    const look = FLYING[kind], scene = this.game?.scene;
    if (!look || !scene) return false;
    const material = look.basic ? new THREE.MeshBasicMaterial({ color: look.color })
      : new THREE.MeshLambertMaterial({ color: look.color, ...(look.emissive ? { emissive: look.emissive } : {}) });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(look.radius, 8, 6), material);
    mesh.position.copy(at);
    scene.add(mesh);
    this.flying.push({ kind, look, mesh, velocity: velocity.clone(), age: 0, shooterId });
    return true;
  }

  update(dt) {
    if (!this.flying.length) return;
    const g = this.game, me = g?.player?.position;
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const shot = this.flying[i], { look } = shot;
      shot.age += dt;
      let landed = shot.age >= look.life;
      const steps = Math.max(1, Math.ceil(shot.velocity.length() * dt / 0.15)), step = dt / steps;
      for (let s = 0; s < steps && !landed; s++) {
        const from = shot.mesh.position.clone();
        shot.velocity.y -= look.gravity * step;
        shot.mesh.position.addScaledVector(shot.velocity, step);
        if (!look.collide) continue;
        const p = shot.mesh.position;
        const onMe = me && Math.abs(p.x - me.x) < 0.42 && Math.abs(p.z - me.z) < 0.42 && p.y >= me.y && p.y <= me.y + 1.8;
        landed = solidAt(g?.world, p) || onMe || p.y < -64
          || Boolean(g?.worldSync?.projectileTouches?.(from, p, { pad: look.radius, except: shot.shooterId }));
      }
      if (!landed) continue;
      if (look.collide) g?.mobs?.spawnParticleBurst?.(shot.mesh.position.clone(), look.burst, 8);
      this.remove(shot);
      this.flying.splice(i, 1);
    }
  }

  remove(shot) {
    shot.mesh.removeFromParent();
    shot.mesh.geometry.dispose();
    shot.mesh.material.dispose();
  }

  clear() { for (const shot of this.flying) this.remove(shot); this.flying = []; }
}
