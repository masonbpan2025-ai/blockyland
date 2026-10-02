import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

export const PIGLIN_BARTER_LOOT = [
  { id: 'ender_pearl', count: 2 },
  { id: 'fire_charge', count: 1 },
  { id: 'quartz', count: 6 },
  { id: 'glowstone_dust', count: 4 },
  { id: 'magma_cream', count: 1 },
  { id: 'iron_boots', count: 1 },
  { id: 'string', count: 4 }
];

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
          child.slimeSize = nextSize;
          child.health = nextSize * 4;
          child.maxHealth = nextSize * 4;
          const s = nextSize / 4;
          child.mesh.scale.set(s, s, s);
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
    // Smallest size drops loot
    const dropItem = mob.type === 'magma_cube' ? 'magma_cream' : 'slime_ball';
    this.entities?.spawnDroppedItem(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), dropItem, false);
    return false;
  }

  /**
   * Bartering with Piglin
   */
  interactPiglin(mob, player, inventory) {
    if (mob.type !== 'piglin' || mob.isBartering) return false;
    const activeItem = inventory.getActiveItem();
    if (activeItem?.id === 'gold_ingot') {
      if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
      mob.isBartering = true;
      mob.barterTimer = 5.0; // 5 seconds examining gold
      if (this.sounds?.playPop) this.sounds.playPop();
      this.mobManager.spawnParticleBurst?.(mob.mesh.position, 0xfacc15, 6);
      return true;
    }
    return false;
  }

  /**
   * Group anger propagation for Zombified Piglins / Zombie Pigmen
   */
  angerZombifiedPiglins(damagedMob) {
    if (!damagedMob || (damagedMob.type !== 'zombified_piglin' && damagedMob.type !== 'zombie_pigman')) return;
    const pos = damagedMob.mesh.position;
    for (const mob of this.mobManager.mobs) {
      if ((mob.type === 'zombified_piglin' || mob.type === 'zombie_pigman') && mob.health > 0) {
        if (mob.mesh.position.distanceTo(pos) < 25) {
          mob.angerTimer = 25.0;
          mob.aggroToPlayer = true;
          mob.target = this.entities?.player || this.mobManager?.game?.player;
          if (this.sounds?.playZombie) this.sounds.playZombie();
          this.mobManager.spawnParticleBurst?.(mob.mesh.position, 0xef4444, 4);
        }
      }
    }
  }

  /**
   * Checks if player is protected from Piglin aggression by wearing gold armor
   */
  isPlayerWearingGold(player) {
    if (!player || !player.inventory) return false;
    const armor = player.inventory.armor;
    if (!armor) return false;
    return Boolean(
      (armor.head?.id && armor.head.id.includes('golden')) ||
      (armor.chest?.id && armor.chest.id.includes('golden')) ||
      (armor.legs?.id && armor.legs.id.includes('golden')) ||
      (armor.feet?.id && armor.feet.id.includes('golden'))
    );
  }

  /**
   * Per-frame update for all hostile & specialized mob behaviors
   */
  update(dt, player) {
    const mobs = this.mobManager.mobs;
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
      if (mob.type === 'slime' || mob.type === 'magma_cube') {
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

      // C. Ghast AI: Flying, Launching Explosive Fireball
      if (mob.type === 'ghast') {
        mob.fireballCooldown = (mob.fireballCooldown || 4.5) - dt;
        const dist = mob.mesh.position.distanceTo(player.position);
        if (dist < 35 && mob.fireballCooldown <= 0) {
          mob.fireballCooldown = 5.0 + Math.random() * 3.0;
          this.spawnGhastFireball(mob, player);
          if (this.sounds?.playGhast) this.sounds.playGhast();
        }
      }

      // D. Blaze AI: Triple Fireball Burst
      if (mob.type === 'blaze') {
        mob.blazeBurstCooldown = (mob.blazeBurstCooldown || 4.0) - dt;
        const dist = mob.mesh.position.distanceTo(player.position);
        if (dist < 22 && mob.blazeBurstCooldown <= 0) {
          mob.blazeBurstCooldown = 5.0;
          this.shootBlazeBurst(mob, player);
          if (this.sounds?.playBlaze) this.sounds.playBlaze();
        }
      }

      // E. Wither Skeleton: Wither Status on Melee
      if (mob.type === 'wither_skeleton') {
        const dist = mob.mesh.position.distanceTo(player.position);
        if (dist < 1.8) {
          mob.attackCooldown = (mob.attackCooldown || 0) - dt;
          if (mob.attackCooldown <= 0) {
            mob.attackCooldown = 1.2;
            player.takeDamage?.(5, 'wither_skeleton');
            player.applyStatusEffect?.('wither', 10.0, 1);
            if (this.sounds?.playHurt) this.sounds.playHurt();
          }
        }
      }

      // F. Piglin AI: Gold Armor Neutrality & Bartering
      if (mob.type === 'piglin') {
        if (mob.isBartering) {
          mob.velocity.set(0, mob.velocity.y, 0);
          mob.barterTimer -= dt;
          if (mob.barterTimer <= 0) {
            mob.isBartering = false;
            // Drop barter reward
            const reward = PIGLIN_BARTER_LOOT[Math.floor(Math.random() * PIGLIN_BARTER_LOOT.length)];
            const dropPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0));
            this.entities?.spawnDroppedItem(dropPos, reward.id, false);
            if (this.sounds?.playPop) this.sounds.playPop();
          }
        } else {
          // If player wears gold armor, Piglins don't target player unless attacked
          const wearsGold = this.isPlayerWearingGold(player);
          if (wearsGold && !mob.aggroToPlayer) {
            mob.target = null;
          } else {
            const dist = mob.mesh.position.distanceTo(player.position);
            if (dist < 12) mob.target = player;
          }
        }
      }

      // F2. Zombified Piglin AI: Pack Retaliation
      if (mob.type === 'zombified_piglin' || mob.type === 'zombie_pigman') {
        if (mob.angerTimer > 0) {
          mob.angerTimer -= dt;
          mob.target = player;
          const dist = mob.mesh.position.distanceTo(player.position);
          if (dist < 18) {
            const dir = player.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            if (dir.lengthSq() > 0.01) {
              dir.normalize();
              mob.velocity.x = dir.x * 4.0;
              mob.velocity.z = dir.z * 4.0;
              mob.yaw = Math.atan2(dir.x, dir.z);
            }
          }
          if (dist < 1.8) {
            mob.attackCooldown = (mob.attackCooldown || 0) - dt;
            if (mob.attackCooldown <= 0) {
              mob.attackCooldown = 1.0;
              player.takeDamage?.(5, 'zombified_piglin');
              if (this.sounds?.playZombie) this.sounds.playZombie();
            }
          }
        } else {
          mob.target = null;
        }
      }

      // F3. Hoglin AI: Tusk Charge and Warped Fungus Avoidance
      if (mob.type === 'hoglin') {
        let isScared = false;
        const activeItem = player?.inventory?.getActiveItem?.();
        if (activeItem?.id === 'warped_fungus' || activeItem?.id === BLOCKS.WARPED_FUNGUS) {
          if (mob.mesh.position.distanceTo(player.position) < 8) {
            isScared = true;
          }
        }
        if (!isScared && this.world) {
          const hx = Math.floor(mob.mesh.position.x);
          const hy = Math.floor(mob.mesh.position.y);
          const hz = Math.floor(mob.mesh.position.z);
          for (let dx = -3; dx <= 3 && !isScared; dx += 2) {
            for (let dz = -3; dz <= 3 && !isScared; dz += 2) {
              const blk = this.world.getVoxel(hx + dx, hy, hz + dz);
              if (blk === BLOCKS.WARPED_FUNGUS) {
                isScared = true;
              }
            }
          }
        }

        if (isScared) {
          mob.target = null;
          const fleeDir = mob.mesh.position.clone().sub(player.position);
          fleeDir.y = 0;
          if (fleeDir.lengthSq() > 0.01) {
            fleeDir.normalize();
            mob.velocity.x = fleeDir.x * 4.5;
            mob.velocity.z = fleeDir.z * 4.5;
            mob.yaw = Math.atan2(fleeDir.x, fleeDir.z);
          }
        } else {
          const dist = mob.mesh.position.distanceTo(player.position);
          const isTargetable = player && !player.isCreative && !player.isSpectator && (player.health === undefined || player.health > 0);
          if (dist < 16 && isTargetable) {
            mob.target = player;
            const dir = player.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            if (dir.lengthSq() > 0.01) {
              dir.normalize();
              const targetYaw = Math.atan2(dir.x, dir.z);
              if (!mob.avoidTime || mob.avoidTime <= 0) {
                mob.velocity.x = dir.x * 3.8;
                mob.velocity.z = dir.z * 3.8;
                const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
                mob.yaw += turn * Math.min(1.0, 8 * dt);
              }
            }
            if (dist < 2.0) {
              mob.attackCooldown = (mob.attackCooldown || 0) - dt;
              if (mob.attackCooldown <= 0) {
                mob.attackCooldown = 1.4;
                player.takeDamage?.(6, 'hoglin');
                const toss = dir.clone().multiplyScalar(5);
                toss.y = 5.0;
                if (player.velocity) player.velocity.add(toss);
                if (this.sounds?.playHit) this.sounds.playHit();
              }
            }
          }
        }
      }

      // F4. Strider AI: Lava walking and shivering when out of lava
      if (mob.type === 'strider') {
        const sx = Math.floor(mob.mesh.position.x);
        const sy = Math.floor(mob.mesh.position.y);
        const sz = Math.floor(mob.mesh.position.z);
        const onLava = this.world?.getVoxel(sx, sy, sz) === BLOCKS.LAVA ||
                       this.world?.getVoxel(sx, sy - 1, sz) === BLOCKS.LAVA ||
                       this.world?.getVoxel(sx, Math.floor(mob.mesh.position.y - 0.2), sz) === BLOCKS.LAVA;
        mob.inLava = onLava;
        if (onLava) {
          mob.isCold = false;
          if (mob.striderWarmMat && mob.bodyMesh) {
            mob.bodyMesh.material = mob.striderWarmMat;
          }
        } else {
          mob.isCold = true;
          if (mob.striderColdMat && mob.bodyMesh) {
            mob.bodyMesh.material = mob.striderColdMat;
          }
          if (mob.head) {
            mob.head.position.x = (Math.random() - 0.5) * 0.06;
          }
        }
      }

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

      // I. Dolphins: Swimming Speed Boost (Dolphin's Grace)
      if (mob.type === 'dolphin') {
        const dist = mob.mesh.position.distanceTo(player.position);
        if (dist < 10 && player.isInWater) {
          player.applyStatusEffect?.('dolphins_grace', 5.0, 1);
        }
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
            player.takeDamage?.(6, 'phantom');
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
    const dir = player.position.clone().sub(witch.mesh.position);
    dir.y += 1.2;
    dir.normalize();

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
    const dir = player.position.clone().sub(ghast.mesh.position);
    dir.normalize();

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

    group.position.copy(ghast.mesh.position).add(new THREE.Vector3(0, 0.5, 0));
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

  shootBlazeBurst(blaze, player) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!blaze || blaze.health <= 0) return;
        const dir = player.position.clone().sub(blaze.mesh.position);
        dir.x += (Math.random() - 0.5) * 0.15;
        dir.z += (Math.random() - 0.5) * 0.15;
        dir.normalize();

        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.22, 6, 6),
          new THREE.MeshLambertMaterial({ color: 0xf59e0b, emissive: 0xd97706 })
        );
        mesh.position.copy(blaze.mesh.position).add(new THREE.Vector3(0, 1.0, 0));
        this.mobManager.scene.add(mesh);

        this.mobManager.customProjectiles.push({
          mesh,
          position: mesh.position.clone(),
          velocity: dir.multiplyScalar(18),
          isBlazeFireball: true,
          age: 0
        });
      }, i * 200);
    }
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
          if (mob.health > 0 && p.position.distanceTo(mob.mesh.position) < 2.5) {
            hit = true;
            this.mobManager.damageMob(mob, 35, p.position);
            if (this.sounds?.playExplosion) this.sounds.playExplosion();
            this.mobManager.spawnParticleBurst?.(p.position, 0xff5500, 18);
            break;
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
