import * as THREE from 'three';
import { BLOCKS, ITEMS } from './blocks.js';

/**
 * Ender Dragon rules, boss phases and combat AI.
 * Reference: https://minecraft.wiki/w/Ender_Dragon
 *
 * Stats & Characteristics:
 * - 200 HP (100 hearts)
 * - Hitbox: 16.0 m wide x 8.0 m high
 * - Damage (wing / contact): Easy 6, Normal 10, Hard 15
 * - Boss bar: Purple ("Ender Dragon")
 * - Phases:
 *   1. Circling: orbits the obsidian pillars (radius ~35-45)
 *   2. Strafing: shoots Dragon Fireballs toward player
 *   3. Perching: lands on exit portal (x=0, z=0); immune to arrows while perched!
 *   4. Wing buffet: knocks player away with huge velocity if within 6m
 * - End Crystals:
 *   - Heals dragon when within 38 blocks (2 HP/s)
 *   - If crystal is destroyed while healing dragon, dragon suffers 10 backlash damage!
 * - Dragon Breath:
 *   - Fireball impacts create lingering purple dragon's breath cloud (3.5m radius, ~8s duration)
 *   - Deals continuous magic damage (4 damage every second)
 *   - Player holding an empty bottle can collect Dragon's Breath!
 * - Death:
 *   - Drops 12,000 XP
 *   - Activates Exit Portal & spawns Dragon Egg atop center bedrock pillar
 */

export const ENDER_DRAGON_HEALTH = 200;
export const ENDER_DRAGON_DIMENSIONS = { width: 16.0, height: 8.0 };
export const ENDER_DRAGON_DAMAGE = {
  peaceful: 0,
  easy: 6,
  normal: 10,
  hard: 15
};
export const ENDER_DRAGON_CRYSTAL_BACKLASH = 10;
export const ENDER_DRAGON_XP = 12000;
export const ENDER_DRAGON_BREATH_RADIUS = 3.5;
export const ENDER_DRAGON_BREATH_DAMAGE = 4;
export const ENDER_DRAGON_BREATH_DURATION = 8.0;

export function isEnderDragon(mob) {
  if (!mob) return false;
  const t = typeof mob === 'string' ? mob : mob.type;
  return t === 'ender_dragon';
}

export function enderDragonDimensions() {
  return ENDER_DRAGON_DIMENSIONS;
}

export function enderDragonDamageFor(difficulty = 'normal') {
  return ENDER_DRAGON_DAMAGE[difficulty] ?? ENDER_DRAGON_DAMAGE.normal;
}

export function enderDragonDrops(mob) {
  if (!isEnderDragon(mob)) return [];
  // The dragon does not drop item entities; it drops 12,000 XP and generates the Dragon Egg block.
  return [];
}

export function enderDragonXp(mob, killedByPlayer = true) {
  if (!isEnderDragon(mob)) return 0;
  // First dragon kill yields 12,000 XP
  return mob?.endRepeatFight ? 500 : ENDER_DRAGON_XP;
}

/**
 * Handle crystal destruction.
 * If the crystal was healing the dragon (or within healing range 38m), dragon takes 10 backlash damage.
 */
export function onCrystalDestroyed(manager, crystal) {
  if (!manager) return 0;
  let backlashDamage = 0;
  const dragon = manager.enderDragon || manager.mobs?.find(m => isEnderDragon(m) && m.health > 0);
  if (dragon && dragon.mesh) {
    const dist = dragon.mesh.position.distanceTo(crystal.position);
    if (dist <= 38.0 && (!dragon.endEncounterManaged || dragon.healingCrystal===crystal)) {
      backlashDamage = ENDER_DRAGON_CRYSTAL_BACKLASH;
      dragon.health = Math.max(0, dragon.health - backlashDamage);
      if (manager.spawnParticleBurst) {
        manager.spawnParticleBurst(dragon.mesh.position, 0xd946ef, 25);
      }
    }
  }
  return backlashDamage;
}

/**
 * Allows player to collect Dragon's Breath in an empty bottle
 */
export function collectDragonBreath(cloud, player) {
  if (!cloud || !player || !player.inventory) return false;
  const inv = player.inventory;
  const active = inv.getActiveItem?.();
  if (active && (active.type === 'glass_bottle' || active.id === 'glass_bottle')) {
    inv.consumeActiveItem?.();
    inv.addItem?.({ id: 'dragon_breath', name: "Dragon's Breath", count: 1, isBlock: false });
    return true;
  }
  return false;
}

/**
 * Fly helper towards target coordinates
 */
export function flyDragonTowards(dragon, tx, ty, tz, speed) {
  const target = new THREE.Vector3(tx, ty, tz);
  const dir = target.sub(dragon.mesh.position);
  const dist = dir.length();
  dir.normalize();

  if (!dragon.velocity) dragon.velocity = new THREE.Vector3();
  dragon.velocity.copy(dir).multiplyScalar(Math.min(dist * 2.0, speed));
  dragon.yaw = Math.atan2(dir.x, dir.z);
  dragon.mesh.rotation.y = dragon.yaw;
}

/**
 * Update Ender Dragon AI per frame
 */
export function updateEnderDragonAI(manager, dragon, dt, player) {
  if (!isEnderDragon(dragon) || dragon.health <= 0) return false;
  const difficulty = manager.game?.difficulty ?? 'normal';

  // Track healing from End Crystals
  let isBeingHealed = false;
  const crystals = manager.endCrystals || manager.bossFightManager?.endCrystals || [];
  let nearest=null,range=32;
  for(const c of crystals)if(c.alive&&!c.exploded) {
    if(c.core)c.core.rotation.y+=dt*3;
    const distance=dragon.mesh.position.distanceTo(c.position);
    if(distance<range){nearest=c;range=distance;}
  }
  dragon.healingCrystal=nearest;
  if(nearest){isBeingHealed=true;dragon.health=Math.min(dragon.maxHealth,dragon.health+dt*2);}

  // Update Boss Bar UI
  const hpPercent = dragon.health / dragon.maxHealth;
  const barTitle = isBeingHealed ? 'Ender Dragon (Healing)' : 'Ender Dragon';
  manager.ui?.setBossBar?.('ender_dragon', barTitle, hpPercent, '#a855f7');

  // Phases: circling, strafing, perching
  if (!dragon.dragonPhase) dragon.dragonPhase = 'circling';
  dragon.phaseTimer = (dragon.phaseTimer ?? 12.0) - dt;

  if (dragon.phaseTimer <= 0) {
    if (dragon.dragonPhase === 'circling') {
      dragon.dragonPhase = 'strafing';
      dragon.phaseTimer = 8.0;
    } else if (dragon.dragonPhase === 'strafing') {
      dragon.dragonPhase = 'perching';
      dragon.phaseTimer = 12.0;
      if (manager.sounds?.playDragonRoar) manager.sounds.playDragonRoar();
    } else {
      dragon.dragonPhase = 'circling';
      dragon.phaseTimer = 14.0;
    }
  }

  const pPos = player?.position || new THREE.Vector3(0, 0, 0);

  if (dragon.dragonPhase === 'circling') {
    dragon.isArrowImmune = false;
    dragon.circleAngle = (dragon.circleAngle || 0) + dt * 0.45;
    const targetX = Math.cos(dragon.circleAngle) * 35;
    const targetZ = Math.sin(dragon.circleAngle) * 35;
    const targetY = 48 + Math.sin(dragon.circleAngle * 2) * 5;
    flyDragonTowards(dragon, targetX, targetY, targetZ, 14.0);
  } else if (dragon.dragonPhase === 'strafing') {
    dragon.isArrowImmune = false;
    const attackable=player && !['creative','spectator'].includes(player.gamemode) && !player.isDead;
    flyDragonTowards(dragon, attackable?pPos.x:0, attackable?pPos.y+14:48, attackable?pPos.z:0, 18.0);
    dragon.fireballCooldown = (dragon.fireballCooldown || 3.0) - dt;
    if (dragon.fireballCooldown <= 0 && attackable && difficulty!=='peaceful') {
      dragon.fireballCooldown = 3.5;
      shootDragonBreathFireball(manager, dragon.mesh.position, pPos);
      if (manager.sounds?.playDragonRoar) manager.sounds.playDragonRoar();
    }
  } else if (dragon.dragonPhase === 'perching') {
    // Perch on center Exit Portal Bedrock Fountain (0, 31, 0)
    const podiumY=manager.bossFightManager?.podiumY?.()??31;
    flyDragonTowards(dragon, 0, podiumY+4, 0, 10.0);
    dragon.isArrowImmune = true; // Wiki: immune to arrows while perched!

    // Wing buffet knockback to nearby players
    const distToPlayer = dragon.mesh.position.distanceTo(pPos);
    dragon.contactCooldown=Math.max(0,(dragon.contactCooldown??0)-dt);
    if (player && !['creative','spectator'].includes(player.gamemode) && !player.isDead && distToPlayer < 6.0 && dragon.contactCooldown<=0) {
      dragon.contactCooldown=.5;
      const dmg = enderDragonDamageFor(difficulty);
      player.takeDamage?.(dmg, dragon.mesh.position, 'dragon_wing');
      if (player.velocity) {
        const knock = pPos.clone().sub(dragon.mesh.position).normalize().multiplyScalar(16);
        player.velocity.x += knock.x;
        player.velocity.y += 6;
        player.velocity.z += knock.z;
      }
    }
  }

  // Flap wings animation
  if (dragon.wingL && dragon.wingR) {
    const flap = Math.sin(Date.now() * 0.008) * 0.4;
    dragon.wingL.rotation.z = flap;
    dragon.wingR.rotation.z = -flap;
  }

  return true;
}

/**
 * Launch dragon fireball
 */
export function shootDragonBreathFireball(manager, fromPos, toPos) {
  if (!manager) return;
  const dir = toPos.clone().sub(fromPos).normalize();
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xd946ef })
  );
  ballMesh.position.copy(fromPos);
  manager.scene?.add(ballMesh);

  if (!manager.customProjectiles) manager.customProjectiles = [];
  manager.customProjectiles.push({
    mesh: ballMesh,
    position: ballMesh.position.clone(),
    velocity: dir.multiplyScalar(22.0),
    isDragonBreathBall: true,
    targetY: toPos.y,
    age: 0
  });
}

/**
 * Create lingering dragon's breath cloud
 */
export function createDragonBreathCloud(manager, pos) {
  if (!manager) return;
  const cloudGeo = new THREE.CylinderGeometry(ENDER_DRAGON_BREATH_RADIUS, ENDER_DRAGON_BREATH_RADIUS, 0.4, 12);
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xc026d3, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(cloudGeo, cloudMat);
  mesh.position.set(pos.x, pos.y + 0.2, pos.z);
  manager.scene?.add(mesh);

  if (!manager.dragonBreathClouds) manager.dragonBreathClouds = [];
  manager.dragonBreathClouds.push({
    mesh,
    position: pos.clone(),
    age: 0,
    radius: ENDER_DRAGON_BREATH_RADIUS,
    damage: ENDER_DRAGON_BREATH_DAMAGE,
    maxAge: ENDER_DRAGON_BREATH_DURATION
  });
}
