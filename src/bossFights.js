import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

export class BossFightManager {
  constructor(mobManager, world, sounds, ui, entities) {
    this.mobManager = mobManager;
    this.world = world;
    this.sounds = sounds;
    this.ui = ui;
    this.entities = entities;

    // Ender Dragon Boss state
    this.enderDragon = null;
    this.endCrystals = [];
    this.dragonHealingBeams = [];
    this.dragonBreathClouds = [];

    // The Wither Boss state
    this.wither = null;
    this.witherSkulls = [];
  }

  // ==========================================
  // WITHER SUMMONING STRUCTURE CHECK
  // ==========================================
  /**
   * Checks if placed skull completed a Wither summoning structure:
   * 4 Soul Sand in a T shape:
   *   [S][S][S] (row y)
   *      [S]    (row y-1)
   * And 3 Wither Skeleton Skulls placed on top (row y+1):
   *   [K][K][K]
   */
  checkWitherSummon(x, y, z) {
    const tryMatchCenter = (cx, cz, dx, dz) => {
      // y-1 is the horizontal Soul Sand row, y-2 is the stem
      const stemBlock = this.world?.getVoxel(cx, y - 2, cz);
      if (stemBlock !== BLOCKS.SOUL_SAND) return false;

      // Check the 3 horizontal soul sand blocks
      for (let offset = -1; offset <= 1; offset++) {
        const sx = cx + offset * dx;
        const sz = cz + offset * dz;
        if (this.world?.getVoxel(sx, y - 1, sz) !== BLOCKS.SOUL_SAND) return false;
        // Check the 3 skull blocks on top
        if (this.world?.getVoxel(sx, y, sz) !== BLOCKS.WITHER_SKELETON_SKULL_BLOCK) return false;
      }

      // Valid structure! Clear the blocks
      this.world?.setVoxel(cx, y - 2, cz, BLOCKS.AIR);
      for (let offset = -1; offset <= 1; offset++) {
        const sx = cx + offset * dx;
        const sz = cz + offset * dz;
        this.world?.setVoxel(sx, y - 1, sz, BLOCKS.AIR);
        this.world?.setVoxel(sx, y, sz, BLOCKS.AIR);
      }
      this.spawnWitherBoss(cx, y, cz);
      return true;
    };

    // The placed skull could be at offset -1, 0, or 1 relative to center
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      for (const centerOffset of [-1, 0, 1]) {
        const cx = x - centerOffset * dx;
        const cz = z - centerOffset * dz;
        if (tryMatchCenter(cx, cz, dx, dz)) return true;
      }
    }
    return false;
  }

  spawnWitherBoss(x, y, z) {
    const wither = this.mobManager.spawnMob('wither', x, y, z);
    if (!wither) return null;
    this.wither = wither;
    wither.isBoss = true;
    wither.health = 300;
    wither.maxHealth = 300;
    wither.isInvulnerable = true;
    wither.summonChargeTimer = 10.0; // 10s birth charge
    wither.mesh.scale.set(0.4, 0.4, 0.4);

    if (this.sounds?.playWitherSpawn) this.sounds.playWitherSpawn();
    this.ui?.setBossBar?.('wither', 'The Wither', 1.0, '#581c87');
    return wither;
  }

  // ==========================================
  // ENDER DRAGON ARENA INITIALIZATION
  // ==========================================
  initEndArena() {
    this.endCrystals = [];
    const pillarCoords = [
      { x: 18, z: 0, h: 22 },
      { x: -18, z: 0, h: 26 },
      { x: 0, z: 18, h: 24 },
      { x: 0, z: -18, h: 28 },
      { x: 12, z: 12, h: 20 },
      { x: -12, z: 12, h: 25 },
      { x: 12, z: -12, h: 23 },
      { x: -12, z: -12, h: 27 }
    ];

    for (const p of pillarCoords) {
      this.spawnEndCrystal(p.x, p.h + 28, p.z);
    }

    // Spawn Ender Dragon
    this.spawnEnderDragonBoss(0, 48, 0);
  }

  spawnEndCrystal(x, y, z) {
    const group = new THREE.Group();
    // Glass cube
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.55 })
    );
    // Inner spinning core
    const core = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xd946ef })
    );
    group.add(glass);
    group.add(core);
    group.position.set(x, y, z);
    this.mobManager.scene.add(group);

    const crystal = {
      mesh: group,
      core,
      position: new THREE.Vector3(x, y, z),
      health: 1,
      alive: true
    };
    this.endCrystals.push(crystal);
    return crystal;
  }

  checkCrystalHit(rayOrigin, rayDir) {
    for (const c of this.endCrystals) {
      if (c.alive && !c.exploded) {
        const toCrystal = c.position.clone().sub(rayOrigin);
        const proj = toCrystal.dot(rayDir);
        if (proj > 0 && proj < 32.0) {
          const closest = rayOrigin.clone().addScaledVector(rayDir, proj);
          const dist = closest.distanceTo(c.position);
          if (dist < 1.8) {
            c.alive = false;
            c.exploded = true;
            if (c.mesh) this.mobManager.scene.remove(c.mesh);
            if (this.sounds?.playExplosion) this.sounds.playExplosion();
            this.mobManager.spawnParticleBurst?.(c.position, 0xd946ef, 30);

            if (this.enderDragon && this.enderDragon.mesh.position.distanceTo(c.position) < 14) {
              this.enderDragon.health -= 15;
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  spawnEnderDragonBoss(x, y, z) {
    const dragon = this.mobManager.spawnMob('ender_dragon', x, y, z);
    if (!dragon) return null;
    this.enderDragon = dragon;
    dragon.isBoss = true;
    dragon.health = 200;
    dragon.maxHealth = 200;
    dragon.dragonPhase = 'circling';
    dragon.phaseTimer = 10.0;
    dragon.perchTimer = 0;

    if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
    this.ui?.setBossBar?.('ender_dragon', 'Ender Dragon', 1.0, '#a855f7');
    return dragon;
  }

  // ==========================================
  // PER-FRAME UPDATE
  // ==========================================
  update(dt, player) {
    // 1. Update Wither Boss
    if (this.wither) {
      this.updateWitherBoss(dt, player);
    }

    // 2. Update Ender Dragon Boss
    if (this.enderDragon) {
      this.updateEnderDragonBoss(dt, player);
    }

    // 3. Update Dragon Breath Pools
    this.updateDragonBreath(dt, player);

    // 4. Update Wither Skulls
    this.updateWitherSkulls(dt, player);
  }

  // ==========================================
  // WITHER BOSS AI
  // ==========================================
  updateWitherBoss(dtOrWither, playerOrDt, maybePlayer) {
    let dt, player;
    if (typeof dtOrWither === 'number') {
      dt = dtOrWither;
      player = playerOrDt;
    } else {
      dt = playerOrDt;
      player = maybePlayer;
    }
    const wither = this.wither || dtOrWither;
    if (!wither || wither.health <= 0) {
      if (wither?.health <= 0) this.onWitherDefeated();
      return;
    }

    if (!wither.velocity) wither.velocity = new THREE.Vector3();

    // Summoning charge phase
    if (wither.summonChargeTimer > 0) {
      wither.summonChargeTimer -= dt;
      const progress = 1.0 - (wither.summonChargeTimer / 10.0);
      const s = 0.4 + progress * 0.8;
      wither.mesh.scale.set(s, s, s);
      wither.mesh.position.y += dt * 0.2;
      this.ui?.setBossBar?.('wither', 'The Wither (Charging)', progress, '#06b6d4');

      if (wither.summonChargeTimer <= 0) {
        // Birth Explosion!
        wither.isInvulnerable = false;
        if (this.sounds?.playExplosion) this.sounds.playExplosion();
        this.mobManager.spawnParticleBurst?.(wither.mesh.position, 0x38bdf8, 40);
        player?.takeDamage?.(12, 'wither_birth');
      }
      return;
    }

    // Normal & Armored Combat Phase
    const isArmored = wither.health <= wither.maxHealth * 0.5;
    wither.isImmuneToProjectiles = isArmored;
    wither.hasWitherArmor = isArmored;

    const hpPercent = wither.health / wither.maxHealth;
    this.ui?.setBossBar?.('wither', isArmored ? 'The Wither (Wither Armor)' : 'The Wither', hpPercent, isArmored ? '#38bdf8' : '#581c87');

    const pPos = player?.position || new THREE.Vector3(0, 0, 0);
    // Movement: Fly around player, descend if armored
    const targetY = isArmored ? pPos.y + 2.5 : pPos.y + 7.0;
    const dirToPlayer = pPos.clone().sub(wither.mesh.position);
    dirToPlayer.y = 0;
    const dist = dirToPlayer.length();
    dirToPlayer.normalize();

    wither.velocity.x = dirToPlayer.x * (isArmored ? 5.5 : 3.5);
    wither.velocity.z = dirToPlayer.z * (isArmored ? 5.5 : 3.5);
    wither.velocity.y = (targetY - wither.mesh.position.y) * 0.8;
    wither.yaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);

    // Shooting 3 Heads
    wither.shootCooldown = (wither.shootCooldown || 1.8) - dt;
    if (wither.shootCooldown <= 0) {
      wither.shootCooldown = isArmored ? 1.2 : 1.8;
      // Main head shoots at player
      this.fireWitherSkull(wither.mesh.position, player.position, false);
      // Side heads shoot at surrounding targets
      const sideTarget1 = player.position.clone().add(new THREE.Vector3(3, 0, 3));
      const sideTarget2 = player.position.clone().add(new THREE.Vector3(-3, 0, -3));
      this.fireWitherSkull(wither.mesh.position, sideTarget1, Math.random() < 0.2); // 20% blue skull
      this.fireWitherSkull(wither.mesh.position, sideTarget2, false);
      if (this.sounds?.playWitherShoot) this.sounds.playWitherShoot();
    }
  }

  fireWitherSkull(fromPos, targetPos, isBlue = false) {
    const dir = targetPos.clone().sub(fromPos).normalize();
    const skullMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshBasicMaterial({ color: isBlue ? 0x0284c7 : 0x18181b })
    );
    skullMesh.position.copy(fromPos).add(new THREE.Vector3(0, 1.2, 0));
    this.mobManager.scene.add(skullMesh);

    this.witherSkulls.push({
      mesh: skullMesh,
      position: skullMesh.position.clone(),
      velocity: dir.multiplyScalar(22.0),
      isBlue,
      age: 0
    });
  }

  updateWitherSkulls(dt, player) {
    const remaining = [];
    for (let i = 0; i < this.witherSkulls.length; i++) {
      const s = this.witherSkulls[i];
      s.age += dt;
      s.position.addScaledVector(s.velocity, dt);
      s.mesh.position.copy(s.position);

      let hit = false;
      if (s.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1.4) {
        hit = true;
        player.takeDamage?.(s.isBlue ? 14 : 9, 'wither');
        player.applyStatusEffect?.('wither', 8.0, 2);
        if (this.sounds?.playExplosion) this.sounds.playExplosion();
      }

      if (hit || s.age > 4.5) {
        this.mobManager.scene.remove(s.mesh);
        s.mesh.geometry?.dispose();
        s.mesh.material?.dispose();
      } else {
        remaining.push(s);
      }
    }
    this.witherSkulls = remaining;
  }

  onWitherDefeated() {
    const pos = this.wither.mesh.position.clone();
    this.wither = null;
    this.ui?.removeBossBar?.('wither');
    // Drop Nether Star & XP
    this.entities?.spawnDroppedItem(pos.clone().add(new THREE.Vector3(0, 1, 0)), 'nether_star', false);
    this.mobManager.spawnXpOrbs?.(pos, 500);
    if (this.sounds?.playExplosion) this.sounds.playExplosion();
  }

  // ==========================================
  // ENDER DRAGON BOSS AI
  // ==========================================
  updateEnderDragonBoss(dtOrDragon, playerOrDt, maybePlayer) {
    let dt, player;
    if (typeof dtOrDragon === 'number') {
      dt = dtOrDragon;
      player = playerOrDt;
    } else {
      dt = playerOrDt;
      player = maybePlayer;
    }
    const dragon = this.enderDragon || dtOrDragon;
    if (!dragon || dragon.health <= 0) {
      if (dragon?.health <= 0) this.onDragonDefeated();
      return;
    }

    // 1. Crystal Healing Beams
    let isBeingHealed = false;
    for (const c of this.endCrystals) {
      if (c.alive) {
        c.core.rotation.y += dt * 3.0;
        const dist = dragon.mesh.position.distanceTo(c.position);
        if (dist < 38) {
          isBeingHealed = true;
          dragon.health = Math.min(dragon.maxHealth, dragon.health + dt * 2.0);
          this.mobManager.spawnParticleBurst?.(dragon.mesh.position, 0xd946ef, 3);
        }
      }
    }

    const hpPercent = dragon.health / dragon.maxHealth;
    this.ui?.setBossBar?.('ender_dragon', isBeingHealed ? 'Ender Dragon (Healing)' : 'Ender Dragon', hpPercent, '#a855f7');

    // 2. Dragon Phases: Circling, Strafing, Perching
    dragon.phaseTimer -= dt;
    if (dragon.phaseTimer <= 0) {
      if (dragon.dragonPhase === 'circling') {
        dragon.dragonPhase = 'strafing';
        dragon.phaseTimer = 8.0;
      } else if (dragon.dragonPhase === 'strafing') {
        dragon.dragonPhase = 'perching';
        dragon.phaseTimer = 12.0;
        if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
      } else {
        dragon.dragonPhase = 'circling';
        dragon.phaseTimer = 14.0;
      }
    }

    if (dragon.dragonPhase === 'circling') {
      // Circle the End island pillars
      dragon.circleAngle = (dragon.circleAngle || 0) + dt * 0.45;
      const targetX = Math.cos(dragon.circleAngle) * 35;
      const targetZ = Math.sin(dragon.circleAngle) * 35;
      const targetY = 48 + Math.sin(dragon.circleAngle * 2) * 5;
      this.flyTowards(dragon, targetX, targetY, targetZ, 14.0);
    } else if (dragon.dragonPhase === 'strafing') {
      // Swoop towards player & launch Dragon Fireball
      this.flyTowards(dragon, player.position.x, player.position.y + 14, player.position.z, 18.0);
      dragon.fireballCooldown = (dragon.fireballCooldown || 3.0) - dt;
      if (dragon.fireballCooldown <= 0) {
        dragon.fireballCooldown = 3.5;
        this.shootDragonBreathFireball(dragon.mesh.position, player.position);
        if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
      }
    } else if (dragon.dragonPhase === 'perching') {
      // Perch on center Bedrock Fountain (0, 30, 0)
      this.flyTowards(dragon, 0, 31, 0, 10.0);
      dragon.isArrowImmune = true; // Invulnerable to arrows while perched!

      // Wing buffet knockback to nearby players
      if (dragon.mesh.position.distanceTo(player.position) < 6.0) {
        player.takeDamage?.(10, 'dragon_wing');
        if (player.velocity) {
          const knock = player.position.clone().sub(dragon.mesh.position).normalize().multiplyScalar(16);
          player.velocity.x += knock.x;
          player.velocity.y += 6;
          player.velocity.z += knock.z;
        }
      }
    } else {
      dragon.isArrowImmune = false;
    }
  }

  flyTowards(dragon, tx, ty, tz, speed) {
    const target = new THREE.Vector3(tx, ty, tz);
    const dir = target.sub(dragon.mesh.position);
    const dist = dir.length();
    dir.normalize();

    if (!dragon.velocity) dragon.velocity = new THREE.Vector3();
    dragon.velocity.copy(dir).multiplyScalar(Math.min(dist * 2.0, speed));
    dragon.yaw = Math.atan2(dir.x, dir.z);
    dragon.mesh.rotation.y = dragon.yaw;
  }

  shootDragonBreathFireball(fromPos, toPos) {
    const dir = toPos.clone().sub(fromPos).normalize();
    const ballMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xd946ef })
    );
    ballMesh.position.copy(fromPos);
    this.mobManager.scene.add(ballMesh);

    if (!this.mobManager.customProjectiles) this.mobManager.customProjectiles = [];
    this.mobManager.customProjectiles.push({
      mesh: ballMesh,
      position: ballMesh.position.clone(),
      velocity: dir.multiplyScalar(22.0),
      isDragonBreathBall: true,
      targetY: toPos.y,
      age: 0
    });
  }

  updateDragonBreath(dt, player) {
    // Check if any dragon breath projectile hit ground -> creates lingering cloud
    if (this.mobManager.customProjectiles) {
      for (const p of this.mobManager.customProjectiles) {
        if (p.isDragonBreathBall && (p.position.y <= p.targetY || p.age > 4.0)) {
          p.age = 999;
          this.createDragonBreathCloud(p.position);
        }
      }
    }

    // Update lingering clouds
    const remaining = [];
    for (let i = 0; i < this.dragonBreathClouds.length; i++) {
      const cloud = this.dragonBreathClouds[i];
      cloud.age += dt;

      // Damage player inside cloud
      if (cloud.position.distanceTo(player.position) < 3.5) {
        player.takeDamage?.(4, 'dragon_breath');
      }

      if (cloud.age > 8.0) {
        this.mobManager.scene.remove(cloud.mesh);
        cloud.mesh.geometry?.dispose();
        cloud.mesh.material?.dispose();
      } else {
        remaining.push(cloud);
      }
    }
    this.dragonBreathClouds = remaining;
  }

  createDragonBreathCloud(pos) {
    const cloudGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.4, 12);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xc026d3, transparent: true, opacity: 0.6 });
    const mesh = new THREE.Mesh(cloudGeo, cloudMat);
    mesh.position.set(pos.x, pos.y + 0.2, pos.z);
    this.mobManager.scene.add(mesh);

    this.dragonBreathClouds.push({
      mesh,
      position: pos.clone(),
      age: 0
    });
  }

  onDragonDefeated() {
    this.ui?.removeBossBar?.('ender_dragon');
    if (this.sounds?.playVictoryFanfare) this.sounds.playVictoryFanfare();

    // Spawn massive XP drop (12,000 XP)
    this.mobManager.spawnXpOrbs?.(new THREE.Vector3(0, 32, 0), 12000);

    // Activate Exit Portal & place Dragon Egg atop central bedrock fountain
    this.activateEndExitPortal();
    this.enderDragon = null;
  }

  activateEndExitPortal() {
    // Center bedrock fountain at (0, 28, 0)
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        if (Math.abs(ox) === 2 || Math.abs(oz) === 2) {
          this.world?.setVoxel(ox, 28, oz, BLOCKS.BEDROCK);
        } else {
          this.world?.setVoxel(ox, 28, oz, BLOCKS.END_PORTAL);
        }
      }
    }
    // Bedrock pillar in center
    this.world?.setVoxel(0, 29, 0, BLOCKS.BEDROCK);
    this.world?.setVoxel(0, 30, 0, BLOCKS.BEDROCK);
    this.world?.setVoxel(0, 31, 0, BLOCKS.BEDROCK);
    // Dragon Egg on top!
    this.world?.setVoxel(0, 32, 0, BLOCKS.DRAGON_EGG);
  }
}
