import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

export class DeepDarkWardenManager {
  constructor(mobManager, world, sounds, ui) {
    this.mobManager = mobManager;
    this.world = world;
    this.sounds = sounds;
    this.ui = ui;
    this.warningLevel = 0;
    this.shriekCooldown = 0;
    this.activeWarden = null;
    this.darknessTimer = 0;
    this.sonicBoomProjectiles = [];
  }

  /**
   * Called when player makes noise / vibration (walking, sprinting, jumping, breaking block)
   */
  onPlayerVibration(playerPos, vibrationStrength = 1.0, player = null) {
    if (this.shriekCooldown > 0) return;

    const actualPlayer = player || (playerPos?.applyStatusEffect ? playerPos : this.game?.player);
    const pos = playerPos?.position || playerPos;

    // Check if near a sculk sensor or shrieker
    const px = Math.round(pos.x);
    const py = Math.round(pos.y);
    const pz = Math.round(pos.z);

    let foundSensor = false;
    let foundShrieker = false;
    let shriekerPos = null;

    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        for (let dy = -3; dy <= 3; dy++) {
          const block = this.world?.getVoxel(px + dx, py + dy, pz + dz);
          if (block === BLOCKS.SCULK_SENSOR) {
            foundSensor = true;
          }
          if (block === BLOCKS.SCULK_SHRIEKER) {
            foundShrieker = true;
            shriekerPos = new THREE.Vector3(px + dx, py + dy, pz + dz);
          }
        }
      }
    }

    if (foundSensor || foundShrieker) {
      this.shriekCooldown = 10.0;
      this.warningLevel++;
      if (this.sounds?.playWardenShriek) this.sounds.playWardenShriek();

      // Darkness effect
      this.triggerDarknessEffect(actualPlayer);

      if (this.warningLevel >= 3 && !this.activeWarden) {
        // Spawn Warden emerging from the ground!
        const spawnPos = shriekerPos || pos.clone().add(new THREE.Vector3(3, 0, 3));
        this.spawnWardenEmergence(spawnPos);
      }
    }
  }

  spawnWardenEmergence(pos) {
    const warden = this.mobManager.spawnWarden(pos.x, pos.y, pos.z);
    this.activeWarden = warden;
    warden.agitation = 0;
    warden.heartbeatTimer = 0;
    warden.sonicBoomCooldown = 6.0;
    warden.isEmerging = true;
    warden.emergenceTimer = 4.0;

    // Start partially underground
    if (warden.mesh) warden.mesh.position.y -= 2.0;
    if (this.sounds?.playWardenHeartbeat) this.sounds.playWardenHeartbeat();
    this.mobManager.spawnParticleBurst?.(pos, 0x06b6d4, 30);
  }

  triggerDarknessEffect(player = null) {
    this.darknessTimer = 12.0;
    const actualPlayer = player || this.game?.player;
    if (actualPlayer?.applyStatusEffect) {
      actualPlayer.applyStatusEffect('darkness', 12.0);
    }
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('darkness-vignette');
      if (overlay) overlay.style.opacity = '0.9';
    }
  }

  update(dt, player) {
    if (this.shriekCooldown > 0) this.shriekCooldown -= dt;

    // Darkness effect fade
    if (this.darknessTimer > 0) {
      this.darknessTimer -= dt;
      if (typeof document !== 'undefined') {
        const overlay = document.getElementById('darkness-vignette');
        if (overlay) {
          const pulse = 0.5 + 0.4 * Math.sin(Date.now() * 0.003);
          overlay.style.opacity = String(Math.min(0.9, (this.darknessTimer / 12.0) * pulse));
        }
      }
    }

    // Warden AI
    const warden = this.activeWarden;
    if (warden && warden.health > 0) {
      // Emergence animation
      if (warden.isEmerging) {
        warden.emergenceTimer -= dt;
        warden.mesh.position.y += (dt * 0.5);
        if (warden.emergenceTimer <= 0) {
          warden.isEmerging = false;
        }
        return;
      }

      // Heartbeat sound accelerating with agitation
      warden.agitation = Math.min(100, (warden.agitation || 0) + dt * 4.0);
      const heartbeatInterval = Math.max(0.6, 2.5 - (warden.agitation / 100) * 1.9);
      warden.heartbeatTimer = (warden.heartbeatTimer || 0) + dt;
      if (warden.heartbeatTimer >= heartbeatInterval) {
        warden.heartbeatTimer = 0;
        if (this.sounds?.playWardenHeartbeat) this.sounds.playWardenHeartbeat();
        this.mobManager.spawnParticleBurst?.(warden.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0x06b6d4, 6);
      }

      // Blind Tracking: Head turns towards player
      const dir = player.position.clone().sub(warden.mesh.position);
      const dist = dir.length();
      dir.y = 0;
      dir.normalize();

      if (!warden.velocity) warden.velocity = new THREE.Vector3();
      if (dist < 25) {
        warden.velocity.x = dir.x * 4.2;
        warden.velocity.z = dir.z * 4.2;
        warden.yaw = Math.atan2(dir.x, dir.z);

        // Sonic Boom Attack: If out of melee range (> 4 blocks away)
        warden.sonicBoomCooldown = (warden.sonicBoomCooldown || 6.0) - dt;
        if (dist > 4.5 && warden.sonicBoomCooldown <= 0) {
          warden.sonicBoomCooldown = 8.0;
          this.fireSonicBoom(warden, player);
        } else if (dist <= 2.5) {
          // Melee strike (massive damage)
          warden.attackCooldown = (warden.attackCooldown || 0) - dt;
          if (warden.attackCooldown <= 0) {
            warden.attackCooldown = 1.2;
            player.takeDamage?.(25, 'warden');
            if (this.sounds?.playHurt) this.sounds.playHurt();
          }
        }
      }
    } else if (warden && warden.health <= 0) {
      // Warden defeated
      this.activeWarden = null;
      this.warningLevel = 0;
      // Drop Sculk Catalyst
      this.entities?.spawnDroppedItem(warden.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), BLOCKS.SCULK_CATALYST, true);
    }

    // Update Sonic Boom Projectiles
    this.updateSonicBooms(dt, player);
  }

  updateWardenAI(warden, dt, player) {
    this.activeWarden = warden;
    this.update(dt, player);
  }

  fireSonicBoom(warden, player) {
    if (this.sounds?.playWardenSonicBoom) this.sounds.playWardenSonicBoom();

    const startPos = warden.mesh.position.clone().add(new THREE.Vector3(0, 2.0, 0));
    const targetPos = player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const dir = targetPos.clone().sub(startPos).normalize();

    const boomGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.5, 8);
    const boomMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9 });
    const boomMesh = new THREE.Mesh(boomGeo, boomMat);
    boomMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    boomMesh.position.copy(startPos);
    this.mobManager.scene.add(boomMesh);

    this.sonicBoomProjectiles.push({
      mesh: boomMesh,
      position: startPos,
      velocity: dir.multiplyScalar(35.0),
      age: 0,
      damage: 16
    });
  }

  updateSonicBooms(dt, player) {
    const remaining = [];
    for (let i = 0; i < this.sonicBoomProjectiles.length; i++) {
      const boom = this.sonicBoomProjectiles[i];
      boom.age += dt;
      boom.position.addScaledVector(boom.velocity, dt);
      boom.mesh.position.copy(boom.position);

      // Sonic boom penetrates through blocks and hits player directly!
      if (boom.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, 1.2, 0))) < 1.8) {
        player.takeDamage?.(boom.damage, 'sonic_boom');
        if (player.velocity) {
          const knock = boom.velocity.clone().normalize().multiplyScalar(15);
          player.velocity.x += knock.x;
          player.velocity.y += 5;
          player.velocity.z += knock.z;
        }
        boom.age = 999; // destroy
      }

      if (boom.age > 1.2) {
        this.mobManager.scene.remove(boom.mesh);
        boom.mesh.geometry?.dispose();
        boom.mesh.material?.dispose();
      } else {
        remaining.push(boom);
      }
    }
    this.sonicBoomProjectiles = remaining;
  }
}
