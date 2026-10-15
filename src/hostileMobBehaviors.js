import {alertZombified,updateZombified,isZombifiedPiglin} from './zombifiedPiglin.js';
import { setMagmaSize, updateBlaze, updateMagmaCube, updateBlazeFireball } from './netherCombat.js';
import { updateHoglin } from './netherMobAI.js';
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { hasGoldTrim } from './smithing.js';

import { startBarter, updatePiglin } from './piglin.js';
import { applyDolphinsGrace } from './dolphinBehavior.js';
import { cubeHealth, cubeSide } from './cubeMobBehavior.js';
import { advancementEvent } from './advancements.js';
export { PIGLIN_BARTER_LOOT } from './piglin.js';

export class HostileMobBehaviors {
  constructor(mobManager, world, sounds, entities) {
    this.mobManager = mobManager;
    this.world = world;
    this.sounds = sounds;
    this.entities = entities;
    this.guardianBeams = []; // Active laser beams
    this.insomniaTicks = 0; // Ticks since last sleep
    this.phantomSpawnTimer = 0;
  }

  resetSleep() {
    this.insomniaTicks = 0;
  }

  /**
   * Called when player attacks or deflects projectiles
   */
  handlePlayerAttackProjectile(playerPos, lookDir) {
    if (!this.mobManager.customProjectiles) return false;
    for (let i = 0; i < this.mobManager.customProjectiles.length; i++) {
      const p = this.mobManager.customProjectiles[i];
      if ((p.isGhastFireball || p.type === 'ghast_fireball') && !p.deflected) {
        const dist = p.position.distanceTo(playerPos);
        if (dist < 3.2) {
          // Deflect fireball!
          p.deflected = true;
          p.velocity.copy(lookDir).multiplyScalar(24);
          if (this.sounds?.playPunch) this.sounds.playPunch();
          this.mobManager.spawnParticleBurst?.(p.position, 0xffa500, 12);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Splitting mechanics when Slime or Magma Cube dies
   */
  handleMobDeathSplitting(mob) {
    if (mob.type !== 'slime' && mob.type !== 'magma_cube') return false;
    if (mob.hasSplit) return false;
    mob.hasSplit = true;
    const size = mob.slimeSize || 4;
    if (size > 1) {
      const nextSize = Math.floor(size / 2);
      const splitCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < splitCount; i++) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          0.3,
          (Math.random() - 0.5) * 1.2
        );
        const childPos = mob.mesh.position.clone().add(offset);
        const child = this.mobManager.spawnMob(mob.type, childPos.x, childPos.y, childPos.z);
        if (child) {
          // Wiki: children have the size squared as health and a size-scaled hitbox, the
          // same rule as at spawn. This previously wrote `nextSize * 4`.
          child.slimeSize = nextSize;
          child.health = cubeHealth(nextSize);
          child.maxHealth = cubeHealth(nextSize);
          child.width = child.height = cubeSide(nextSize);
          const s = nextSize / 4;
          child.mesh.scale.set(s, s, s);
          if (mob.type === 'magma_cube') setMagmaSize(child, nextSize);
          if (!child.velocity) child.velocity = new THREE.Vector3();
          child.velocity.set(
            (Math.random() - 0.5) * 3,
            3.0,
            (Math.random() - 0.5) * 3
          );
        }
      }
      return true;
    }
    if (mob.type === 'magma_cube') return false;
    // Smallest size drops loot
    const dropItem = mob.type === 'magma_cube' ? 'magma_cream' : 'slime_ball';
    this.entities?.spawnDroppedItem(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), dropItem, false);
    return false;
  }

  /**
   * Bartering with Piglin
   */
  interactPiglin(mob, player, inventory = player?.inventory) {
    if (mob.type !== 'piglin' || mob.health <= 0 || mob.isBartering || mob.admireDisabledTime > 0 || !inventory) return false;
    if (inventory.getActiveItem()?.id !== 'gold_ingot') return false;
    if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
    startBarter(mob);
    advancementEvent('distract_piglin');
    return true;
  }

  /**
   * Group anger propagation for Zombified Piglins / Zombie Pigmen
   */
  angerZombifiedPiglins(damagedMob, attacker = this.mobManager.game?.player) {
    if(isZombifiedPiglin(damagedMob)&&damagedMob.health>0)alertZombified(this.mobManager,damagedMob,attacker);
  }

  /**
   * Checks if player is protected from Piglin aggression by wearing gold armor.
   *
   * Vanilla's `#piglin_safe_armor` tag is "golden armour" plus, for each trim material, armour carrying
   * that material's trim. So a netherite chestplate with a Gold trim pacifies piglins exactly as a
   * golden chestplate does, and the wiki says so in as many words: "Piglins do not pick up any
   * gold-trimmed armor pieces and remain hostile toward players wearing gold-trimmed armor, unless the
   * base armor is also golden."
   *
   * The `id.includes('golden')` test is this game's own: every golden piece is named `golden_<slot>`.
   * A trimmed piece is asked through `hasGoldTrim`, which reads the one trim shape -- the same accessor
   * the smithing table writes.
   */
  isPlayerWearingGold(player) {
    if (!player || !player.inventory) return false;
    const armor = player.inventory.armor;
    if (!armor) return false;
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const piece = armor[slot];
      if (!piece) continue;
      if (typeof piece.id === 'string' && piece.id.includes('golden')) return true;
      if (hasGoldTrim(piece)) return true;
    }
    return false;
  }

  /**
   * Per-frame update for all hostile & specialized mob behaviors
   */
  update(dt, player) {
    // Conversion and splitting can replace entries while behaviors are running.
    const mobs = [...this.mobManager.mobs];
    this.insomniaTicks += dt * 20; // 20 ticks per second

    // 1. Phantom Insomnia Spawning (if >= 72000 ticks = 3 in-game days without sleep)
    if (this.insomniaTicks >= 72000 && !this.world?.isNether && this.world?.dimension !== 'the_end') {
      this.phantomSpawnTimer -= dt;
      if (this.phantomSpawnTimer <= 0) {
        this.phantomSpawnTimer = 60 + Math.random() * 60;
        const angle = Math.random() * Math.PI * 2;
        const spawnX = player.position.x + Math.cos(angle) * 20;
        const spawnZ = player.position.z + Math.sin(angle) * 20;
        const spawnY = player.position.y + 25;
        this.mobManager.spawnMob('phantom', spawnX, spawnY, spawnZ);
        if (this.sounds?.playPhantom) this.sounds.playPhantom();
      }
    }

    // 2. Iterate mobs and run behaviors
    for (let i = 0; i < mobs.length; i++) {
      const mob = mobs[i];
      if (mob.health <= 0) continue;

      // A. Slime & Magma Cube Hopping
      if (mob.type === 'magma_cube') updateMagmaCube(this.mobManager, mob, player, dt);
      if (mob.type === 'slime') {
        mob.jumpTimer = (mob.jumpTimer || (1.5 + Math.random())) - dt;
        if (mob.jumpTimer <= 0) {
          mob.jumpTimer = 1.5 + Math.random();
          const dist = mob.mesh.position.distanceTo(player.position);
          if (dist < 16) {
            const dir = player.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            dir.normalize();
            mob.velocity.x = dir.x * 3.5;
            mob.velocity.z = dir.z * 3.5;
            mob.velocity.y = 5.0;
            mob.yaw = Math.atan2(dir.x, dir.z);
            if (this.sounds?.playStep) this.sounds.playStep('grass');
          }
        }
      }

      // B. Witch AI: Potion throwing and drinking
      if (mob.type === 'witch') {
        // Defensive: Drink healing if low HP, or fire res if on fire
        if (mob.health < 15 && (!mob.drinkTimer || mob.drinkTimer <= 0)) {
          mob.drinkTimer = 3.0;
          mob.isDrinking = true;
          if (this.sounds?.playEat) this.sounds.playEat();
          this.mobManager.spawnParticleBurst?.(mob.mesh.position, 0xef4444, 8);
        }
        if (mob.drinkTimer > 0) {
          mob.drinkTimer -= dt;
          if (mob.drinkTimer <= 0 && mob.isDrinking) {
            mob.health = Math.min(mob.maxHealth, mob.health + 8);
            mob.isDrinking = false;
            if (this.sounds?.playPop) this.sounds.playPop();
          }
        }

        // Offensive: Throw splash potions of Harm, Poison, or Slowness
        mob.potionCooldown = (mob.potionCooldown || 3.0) - dt;
        const distToPlayer = mob.mesh.position.distanceTo(player.position);
        if (distToPlayer < 14 && mob.potionCooldown <= 0 && !mob.isDrinking) {
          mob.potionCooldown = 3.5 + Math.random() * 2.0;
          this.throwWitchPotion(mob, player);
          if (this.sounds?.playWitch) this.sounds.playWitch();
        }
      }

      // C. Ghast AI: Flying, Player Tracking, Charging & Launching Explosive Fireball
      if (mob.type === 'ghast') {
        const dist = player?.position ? mob.mesh.position.distanceTo(player.position) : 999;

        // 1. Orient to face player when within aggro range (up to 64 blocks)
        if (player?.position && dist < 64 && mob.health > 0) {
          mob.hasPlayerTarget = true;
          const dx = player.position.x - mob.mesh.position.x;
          const dz = player.position.z - mob.mesh.position.z;
          const distXZ = Math.hypot(dx, dz);
          const targetYaw = Math.atan2(dx, dz);

          // Face the player (+Z front face)
          const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
          mob.yaw += turn * Math.min(1.0, dt * 4.0);
          if (mob.mesh) mob.mesh.rotation.y = mob.yaw;

          const dy = (player.position.y + 1.2) - (mob.mesh.position.y + 2.2);
          const targetPitch = Math.atan2(-dy, Math.max(2.0, distXZ));
          const clampedPitch = Math.max(-0.35, Math.min(0.35, targetPitch));
          if (mob.mesh) mob.mesh.rotation.x += (clampedPitch - mob.mesh.rotation.x) * Math.min(1.0, dt * 3.0);

          // Hover distance control (maintain ~14-28 blocks)
          if (distXZ < 14) {
            mob.velocity.x -= Math.sin(mob.yaw) * 1.5 * dt;
            mob.velocity.z -= Math.cos(mob.yaw) * 1.5 * dt;
          } else if (distXZ > 28) {
            mob.velocity.x += Math.sin(mob.yaw) * 1.5 * dt;
            mob.velocity.z += Math.cos(mob.yaw) * 1.5 * dt;
          } else {
            const strafeDir = (Math.sin(Date.now() * 0.001 + (mob.mesh?.id || 0)) > 0 ? 1 : -1);
            mob.velocity.x += Math.cos(mob.yaw) * strafeDir * 0.8 * dt;
            mob.velocity.z -= Math.sin(mob.yaw) * strafeDir * 0.8 * dt;
          }
          mob.velocity.x *= 0.96;
          mob.velocity.z *= 0.96;
        } else {
          mob.hasPlayerTarget = false;
        }

        // 2. Charging & Shooting state machine
        mob.fireballCooldown = (mob.fireballCooldown !== undefined ? mob.fireballCooldown : 3.5) - dt;

        if (mob.isChargingFireball) {
          mob.chargeTimer = (mob.chargeTimer || 0) - dt;

          // Mouth sparks / flame particle burst while charging
          if (Math.random() < 0.4 && this.mobManager.spawnParticleBurst) {
            const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), mob.yaw);
            const mouthPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)).add(forward.multiplyScalar(1.9));
            this.mobManager.spawnParticleBurst(mouthPos, 0xff7700, 2);
          }

          if (mob.chargeTimer <= 0) {
            mob.isChargingFireball = false;
            mob.isShooting = true;
            mob.shootingTimer = 0.4;
            mob.fireballCooldown = 4.5 + Math.random() * 2.5;
            this.spawnGhastFireball(mob, player);
            if (this.sounds?.playGhast) this.sounds.playGhast();
          }
        } else if (mob.isShooting) {
          mob.shootingTimer = (mob.shootingTimer || 0) - dt;
          if (mob.shootingTimer <= 0) {
            mob.isShooting = false;
          }
        } else if (player?.position && dist < 48 && mob.fireballCooldown <= 0 && mob.health > 0) {
          mob.isChargingFireball = true;
          mob.chargeTimer = 1.0;
          if (this.sounds?.playGhast) this.sounds.playGhast();
        }

        // 3. Dynamic face texture: eyes and mouth open when charging/shooting
        const shouldShowShooting = mob.isChargingFireball || mob.isShooting;
        if (mob.headMat && this.mobManager.textures) {
          const targetTex = shouldShowShooting ? this.mobManager.textures.ghast_shooting : this.mobManager.textures.ghast;
          if (mob.headMat.map !== targetTex && targetTex) {
            mob.headMat.map = targetTex;
            mob.headMat.needsUpdate = true;
          }
        }
      }

      // D. Blaze AI: Triple Fireball Burst
      if (mob.type === 'blaze') {
        updateBlaze(this.mobManager, mob, player, dt);
      }

      if (mob.type === 'piglin') updatePiglin(this, mob, dt, player);

      if(isZombifiedPiglin(mob))updateZombified(this.mobManager,mob,dt);

      if (mob.type === 'hoglin' || mob.type === 'zoglin') updateHoglin(this, mob, dt, player);

      // G. Guardian & Elder Guardian: Targeting Laser Beam & Mining Fatigue
      if (mob.type === 'guardian' || mob.type === 'elder_guardian') {
        const isElder = (mob.type === 'elder_guardian');
        const dist = mob.mesh.position.distanceTo(player.position);

        // Elder Guardian Curse
        if (isElder && dist < 50) {
          mob.curseTimer = (mob.curseTimer || 60) - dt;
          if (mob.curseTimer <= 0) {
            mob.curseTimer = 120;
            player.applyStatusEffect?.('mining_fatigue', 300, 3);
            player.triggerGhostApparition?.('elder_guardian');
            if (this.sounds?.playGuardian) this.sounds.playGuardian();
          }
        }

        // Laser targeting
        if (dist < 16) {
          mob.laserCharge = (mob.laserCharge || 0) + dt;
          if (!mob.laserBeamMesh) {
            mob.laserBeamMesh = this.createLaserBeamMesh();
            this.mobManager.scene.add(mob.laserBeamMesh);
          }
          this.updateLaserBeam(mob.laserBeamMesh, mob.mesh.position, player.position, mob.laserCharge / 3.0);

          if (mob.laserCharge >= 3.0) {
            // Zap!
            mob.laserCharge = 0;
            const dmg = isElder ? 12 : 7;
            player.takeDamage?.(dmg, 'guardian_laser');
            if (this.sounds?.playMagic) this.sounds.playMagic();
          }
        } else if (mob.laserBeamMesh) {
          this.mobManager.scene.remove(mob.laserBeamMesh);
          mob.laserBeamMesh = null;
          mob.laserCharge = 0;
        }
      }

      // H. Drowned: Underwater Swimming & Trident Throwing
      if (mob.type === 'drowned') {
        mob.tridentCooldown = (mob.tridentCooldown || 3.5) - dt;
        const dist = mob.mesh.position.distanceTo(player.position);
        if (dist < 18 && mob.tridentCooldown <= 0) {
          mob.tridentCooldown = 4.0;
          this.throwTrident(mob, player);
          if (this.sounds?.playBowShoot) this.sounds.playBowShoot();
        }
      }

      // I. Dolphins: Swimming Speed Boost (Dolphin's Grace). The wiki distinguishes a
      // 9-block grant radius from a 15-block keep radius, so a player drifting outward
      // keeps the boost instead of losing it the moment they pass 9 blocks.
      if (mob.type === 'dolphin') {
        applyDolphinsGrace(mob, player, this.mobManager);
      }

      // J. Phantom: Swooping Dive Attack
      if (mob.type === 'phantom') {
        mob.diveTimer = (mob.diveTimer || 5.0) - dt;
        if (mob.diveTimer <= 0) {
          // Swoop down at player
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.normalize();
          mob.velocity.copy(dir).multiplyScalar(12.0);
          if (mob.mesh.position.distanceTo(player.position) < 1.8) {
            player.takeDamage?.(6, mob.mesh.position, 'phantom');
            mob.diveTimer = 6.0;
            mob.velocity.y = 8.0; // Swoop back up
            if (this.sounds?.playPhantom) this.sounds.playPhantom();
          } else if (mob.mesh.position.y <= player.position.y) {
            mob.diveTimer = 6.0;
            mob.velocity.y = 8.0;
          }
        } else {
          // Circle high in sky
          mob.velocity.y = (player.position.y + 18 - mob.mesh.position.y) * 0.5;
        }
      }
    }

    // 3. Update Custom Projectiles (Ghast Fireballs, Witches Potions, Tridents)
    this.updateCustomProjectiles(dt, player);
  }

  throwWitchPotion(witch, player) {
    if (!this.mobManager.customProjectiles) this.mobManager.customProjectiles = [];
    // Aim at the player's body from the witch's hand. The old aim added the throw height on top of the target's, so the
    // potion flew a block and a half over the player's head and never landed (the projectile has no gravity).
    const origin = witch.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = player.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin).normalize();

    const types = ['harm', 'poison', 'slowness'];
    const pType = types[Math.floor(Math.random() * types.length)];
    const pColor = pType === 'harm' ? 0x991b1b : pType === 'poison' ? 0x22c55e : 0x64748b;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 6, 6),
      new THREE.MeshLambertMaterial({ color: pColor })
    );
    mesh.position.copy(witch.mesh.position).add(new THREE.Vector3(0, 1.2, 0));
    this.mobManager.scene.add(mesh);

    this.mobManager.customProjectiles.push({
      mesh,
      position: mesh.position.clone(),
      velocity: dir.multiplyScalar(16),
      isPotion: true,
      potionType: pType,
      age: 0
    });
  }

  spawnGhastFireball(ghast, player) {
    if (!this.mobManager.customProjectiles) this.mobManager.customProjectiles = [];
    const dir = player.position.clone().sub(ghast.mesh.position).normalize();
    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ghast.yaw || ghast.mesh?.rotation?.y || 0);
    const mouthPos = ghast.mesh.position.clone().add(new THREE.Vector3(0, 2.2, 0)).add(forward.clone().multiplyScalar(1.9));

    const group = new THREE.Group();
    const coreMat = new THREE.MeshLambertMaterial({
      map: this.mobManager?.textures?.fireball,
      color: 0xffffff,
      emissive: 0xff4400,
      emissiveIntensity: 0.75
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 10), coreMat);
    group.add(core);

    // Flaming quads for authentic Minecraft spinning fire silhouette
    const flameMat = new THREE.MeshBasicMaterial({
      map: this.mobManager?.textures?.fireball,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), flameMat);
    const q2 = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), flameMat);
    q2.rotation.y = Math.PI / 2;
    group.add(q1);
    group.add(q2);

    group.position.copy(mouthPos);
    this.mobManager.scene.add(group);

    this.mobManager.customProjectiles.push({
      mesh: group,
      flames: [q1, q2],
      position: group.position.clone(),
      velocity: dir.multiplyScalar(14),
      isGhastFireball: true,
      deflected: false,
      shooter: ghast,
      age: 0
    });
  }

  throwTrident(drowned, player) {
    if (!this.mobManager.customProjectiles) this.mobManager.customProjectiles = [];
    const dir = player.position.clone().sub(drowned.mesh.position);
    dir.normalize();

    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.4),
      new THREE.MeshLambertMaterial({ color: 0x0ea5e9 })
    );
    mesh.position.copy(drowned.mesh.position).add(new THREE.Vector3(0, 1.2, 0));
    this.mobManager.scene.add(mesh);

    this.mobManager.customProjectiles.push({
      mesh,
      position: mesh.position.clone(),
      velocity: dir.multiplyScalar(20),
      isTrident: true,
      age: 0
    });
  }

  createLaserBeamMesh() {
    const geo = new THREE.CylinderGeometry(0.06, 0.06, 1, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  updateLaserBeam(mesh, from, to, progress) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    mesh.scale.set(1 + progress * 1.5, len, 1 + progress * 1.5);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    // Color shifts from yellow to magenta
    const r = 1.0;
    const g = Math.max(0, 0.9 - progress * 0.9);
    const b = Math.min(1.0, progress * 0.8);
    mesh.material.color.setRGB(r, g, b);
  }

  updateCustomProjectiles(dt, player) {
    if (!this.mobManager.customProjectiles) return;
    const remaining = [];
    for (let i = 0; i < this.mobManager.customProjectiles.length; i++) {
      const p = this.mobManager.customProjectiles[i];
      if (p.isBlazeFireball) {
        if (updateBlazeFireball(this.mobManager, p, player, dt)) remaining.push(p);
        continue;
      }
      p.age += dt;
      p.position.addScaledVector(p.velocity, dt);
      if (p.mesh) p.mesh.position.copy(p.position);

      // Ghast Fireball spin and trail animation
      if (p.isGhastFireball) {
        if (p.flames) {
          for (const q of p.flames) q.rotation.z += dt * 6.0;
        }
        p.trailTimer = (p.trailTimer || 0) + dt;
        if (p.trailTimer > 0.08) {
          p.trailTimer = 0;
          this.mobManager.spawnParticleBurst?.(p.position, 0xf97316, 2);
        }
      }

      let hit = false;
      // Check collision with player
      if (!p.deflected && p.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1.2) {
        hit = true;
        if (p.isGhastFireball) {
          player.takeDamage?.(12, 'ghast_fireball');
          if (this.sounds?.playExplosion) this.sounds.playExplosion();
          this.mobManager.spawnParticleBurst?.(p.position, 0xff5500, 16);
          this.mobManager.spawnParticleBurst?.(p.position, 0x374151, 12);
        } else if (p.isBlazeFireball) {
          player.takeDamage?.(5, 'blaze_fireball');
          player.setOnFire?.(5.0);
        } else if (p.isTrident) {
          player.takeDamage?.(8, 'trident');
        } else if (p.isPotion) {
          if (p.potionType === 'harm') player.takeDamage?.(6, 'magic');
          else if (p.potionType === 'poison') player.applyStatusEffect?.('poison', 6.0, 1);
          else if (p.potionType === 'slowness') player.applyStatusEffect?.('slowness', 6.0, 1);
        }
      }

      // Check collision with solid blocks for Ghast Fireball (detonates on impact)
      if (p.isGhastFireball && !hit) {
        const bx = Math.floor(p.position.x), by = Math.floor(p.position.y), bz = Math.floor(p.position.z);
        if (this.mobManager.isBlockSolid?.(bx, by, bz)) {
          hit = true;
          if (this.sounds?.playExplosion) this.sounds.playExplosion();
          this.mobManager.spawnParticleBurst?.(p.position, 0xff5500, 18);
          this.mobManager.spawnParticleBurst?.(p.position, 0x374151, 14);
          // Splash damage to player if nearby
          if (player?.position && p.position.distanceTo(player.position) < 3.5) {
            player.takeDamage?.(12, 'ghast_fireball');
          }
          // Ignite fire on terrain surfaces adjacent to impact
          if (this.world) {
            for (let ox = -1; ox <= 1; ox++) {
              for (let oz = -1; oz <= 1; oz++) {
                if (Math.random() < 0.6) {
                  const fx = bx + ox, fz = bz + oz;
                  for (let fy = by - 1; fy <= by + 1; fy++) {
                    if (this.world.getVoxel(fx, fy, fz) === BLOCKS.AIR && this.mobManager.isBlockSolid(fx, fy - 1, fz)) {
                      this.world.setVoxel(fx, fy, fz, BLOCKS.FIRE);
                      break;
                    }
                  }
                }
              }
            }
          }
        }
      }

      // If deflected Ghast fireball hits a mob (especially Ghast)
      if (p.deflected && p.isGhastFireball) {
        for (const mob of this.mobManager.mobs) {
          if (mob.health > 0) {
            const targetCenter = (mob.type === 'ghast') ? mob.mesh.position.clone().add(new THREE.Vector3(0, 2.5, 0)) : mob.mesh.position;
            const hitDist = (mob.type === 'ghast') ? 3.5 : 2.5;
            if (p.position.distanceTo(targetCenter) < hitDist) {
              hit = true;
              // Remembered for the "Tears" disc (chickenJockey.js): a ghast killed by its own fireball, sent back.
              if (mob.type === 'ghast') mob.killedByDeflectedFireball = true;
              this.mobManager.damageMob(mob, 35, p.position,false,this.mobManager.game?.player);
              if (this.sounds?.playExplosion) this.sounds.playExplosion();
              this.mobManager.spawnParticleBurst?.(p.position, 0xff5500, 18);
              break;
            }
          }
        }
      }

      // Check egg projectile hatching
      if (p.isEgg) {
        p.velocity.y -= 15 * dt; // gravity
        const bx = Math.floor(p.position.x), by = Math.floor(p.position.y), bz = Math.floor(p.position.z);
        if (this.mobManager.isBlockSolid?.(bx, by, bz) || p.age > 4.0) {
          hit = true;
          this.mobManager.spawnParticleBurst?.(p.position, 0xffffff, 8);
          // 1/8 chance to hatch chick
          if (Math.random() < 0.125) {
            const chick = this.mobManager.spawnMob('chicken', p.position.x, p.position.y + 0.5, p.position.z);
            if (chick) {
              chick.isBaby = true;
              chick.mesh.scale.set(0.5, 0.5, 0.5);
            }
          }
        }
      }

      if (hit || p.age > 6.0) {
        if (p.mesh) {
          this.mobManager.scene.remove(p.mesh);
          p.mesh.traverse?.(c => {
            c.geometry?.dispose();
            c.material?.dispose();
          });
        }
      } else {
        remaining.push(p);
      }
    }
    this.mobManager.customProjectiles = remaining;
  }
}
