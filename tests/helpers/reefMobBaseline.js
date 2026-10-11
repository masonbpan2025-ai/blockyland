// Frozen BEFORE the reef optimizations; independent reference for differential tests/benchmarks.
// SHA256 of captured methods: addd85b794f44661712f25802a9e2642765d30e28105a1bb913d1ff61bd969c9
import * as THREE from 'three';
import { BLOCKS } from '../../src/blocks.js';
import { isSquid, updateSquid, updateSquidPredator } from '../../src/squidBehavior.js';
import { updateDolphinMoistness } from '../../src/dolphinBehavior.js';
import { isPufferfish, pufferfishReactsTo, PUFFERFISH_TRIGGER } from '../../src/fishBehavior.js';

export function originalMobCollisions(dt = 0.05) {
    if (!this.mobs || this.mobs.length < 2) return;
    const len = this.mobs.length;
    const checkCol = (m, p) => (typeof this.checkMobCollision === 'function' ? this.checkMobCollision(m, p) : false);

    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < len; i++) {
        const mobA = this.mobs[i];
        if (!mobA || mobA.health <= 0 || mobA.dying || !mobA.mesh?.position) continue;

        const dimsA = this.getMobDimensions ? this.getMobDimensions(mobA.type) : { width: 0.6, height: 1.0 };
        const scaleA = mobA.isBaby ? (isSquid(mobA) ? .625 : mobA.type==='horse' ? .7 : .5) : 1.0;
        const hA = (mobA.height || dimsA?.height || 1.0) * scaleA;
        const wA = (mobA.width || dimsA?.width || 0.6) * scaleA;
        const rA = Math.max(0.24, wA * 0.5);
        const yA = mobA.mesh.position.y;

        for (let j = i + 1; j < len; j++) {
          const mobB = this.mobs[j];
          if (!mobB || mobB.health <= 0 || mobB.dying || !mobB.mesh?.position) continue;
          if (mobA.rider === mobB || mobB.rider === mobA) continue;

          const dimsB = this.getMobDimensions ? this.getMobDimensions(mobB.type) : { width: 0.6, height: 1.0 };
          const scaleB = mobB.isBaby ? (isSquid(mobB) ? .625 : mobB.type==='horse' ? .7 : .5) : 1.0;
          const hB = (mobB.height || dimsB?.height || 1.0) * scaleB;
          const yB = mobB.mesh.position.y;

          // Check vertical overlap
          if (yA + hA <= yB || yB + hB <= yA) continue;

          const wB = (mobB.width || dimsB?.width || 0.6) * scaleB;
          const rB = Math.max(0.24, wB * 0.5);
          const minDist = rA + rB;

          let dx = mobA.mesh.position.x - mobB.mesh.position.x;
          let dz = mobA.mesh.position.z - mobB.mesh.position.z;
          let distSq = dx * dx + dz * dz;

          if (distSq < minDist * minDist) {
            let dist = Math.sqrt(distSq);
            let nx, nz;
            if (dist < 1e-4) {
              const angle = ((i * 17 + j * 31 + iter * 47) % 360) * (Math.PI / 180);
              nx = Math.cos(angle);
              nz = Math.sin(angle);
              dist = 1e-4;
            } else {
              nx = dx / dist;
              nz = dz / dist;
            }

            const overlap = minDist - dist;
            const halfPush = overlap * 0.5;

            const testA = mobA.mesh.position.clone();
            testA.x += nx * halfPush;
            testA.z += nz * halfPush;
            const colA = checkCol(mobA, testA);

            const testB = mobB.mesh.position.clone();
            testB.x -= nx * halfPush;
            testB.z -= nz * halfPush;
            const colB = checkCol(mobB, testB);

            if (!colA && !colB) {
              mobA.mesh.position.x = testA.x;
              mobA.mesh.position.z = testA.z;
              mobB.mesh.position.x = testB.x;
              mobB.mesh.position.z = testB.z;
            } else if (!colA && colB) {
              testA.x = mobA.mesh.position.x + nx * overlap;
              testA.z = mobA.mesh.position.z + nz * overlap;
              if (!checkCol(mobA, testA)) {
                mobA.mesh.position.x = testA.x;
                mobA.mesh.position.z = testA.z;
              }
            } else if (colA && !colB) {
              testB.x = mobB.mesh.position.x - nx * overlap;
              testB.z = mobB.mesh.position.z - nz * overlap;
              if (!checkCol(mobB, testB)) {
                mobB.mesh.position.x = testB.x;
                mobB.mesh.position.z = testB.z;
              }
            }

            if (iter === 0) {
              const pushV = Math.min(1.0, overlap * 2.0);
              if (mobA.velocity) {
                mobA.velocity.x += nx * pushV * 0.25;
                mobA.velocity.z += nz * pushV * 0.25;
              }
              if (mobB.velocity) {
                mobB.velocity.x -= nx * pushV * 0.25;
                mobB.velocity.z -= nz * pushV * 0.25;
              }
            }
          }
        }
      }
    }
  }

export function originalPufferfishThreat(manager, mob, player = null) {
  if (!isPufferfish(mob) || !mob.mesh) return null;
  const candidates = [];
  if (player?.position) candidates.push(player);
  for (const other of manager?.mobs ?? []) {
    if (other === mob || other.health <= 0) continue;
    candidates.push(other);
  }
  let best = null;
  let bestDistance = PUFFERFISH_TRIGGER.semiRange;
  for (const candidate of candidates) {
    if (!pufferfishReactsTo(candidate)) continue;
    const position = candidate.position ?? candidate.mesh?.position;
    if (!position) continue;
    const distance = mob.mesh.position.distanceTo(position);
    if (distance < bestDistance) { bestDistance = distance; best = candidate; }
  }
  return best;
}

export function originalAquaticMob(mob, dt, player) {
      if(isSquid(mob)){updateSquid(this,mob,dt,player);return true;}
      if(updateSquidPredator(this,mob,dt))return true;
      // --- AQUATIC CREATURE AI & 3D SWIMMING PHYSICS ---
      const bX = Math.floor(mob.mesh.position.x);
      const bY = Math.floor(mob.mesh.position.y + 0.15);
      const bZ = Math.floor(mob.mesh.position.z);
      const currentVoxel = this.world.getVoxel(bX, bY, bZ);
      const inWater = (currentVoxel === BLOCKS.WATER);
      mob.inWater = inWater;

      // Wiki: a dry dolphin suffocates after two minutes, and rain refills its moistness.
      if (mob.type === 'dolphin') {
        const raining = this.game?.weather?.isRaining?.() ?? false;
        updateDolphinMoistness(this, mob, dt, raining);
      }

      mob.swimCycle += dt * (inWater ? 1.0 : 2.5);

      if (inWater) {
        // Smoothly restore upright orientation in water
        mob.mesh.rotation.z = THREE.MathUtils.lerp(mob.mesh.rotation.z, 0, dt * 5.0);

        // 1. Fluid drag
        mob.velocity.x *= Math.exp(-3.7 * dt);
        mob.velocity.y *= Math.exp(-5 * dt);
        mob.velocity.z *= Math.exp(-3.7 * dt);

        // 2. Swim Target Seeking
        mob.timer -= dt;
        if (mob.timer <= 0 || !mob.targetPos || mob.mesh.position.distanceTo(mob.targetPos) < 0.8) {
          mob.timer = 2.5 + Math.random() * 4.0;
          // Search nearby water voxels within radius 6
          const waterSpots = [];
          for (let dx = -5; dx <= 5; dx += 2) {
            for (let dy = -2; dy <= 2; dy += 1) {
              for (let dz = -5; dz <= 5; dz += 2) {
                const wx = bX + dx;
                const wy = bY + dy;
                const wz = bZ + dz;
                if (this.world.getVoxel(wx, wy, wz) === BLOCKS.WATER) {
                  const candidate = new THREE.Vector3(wx + 0.5, wy + 0.15, wz + 0.5);
                  if (!this.checkMobCollision(mob, candidate)) waterSpots.push(candidate);
                }
              }
            }
          }
          if (waterSpots.length > 0) {
            mob.targetPos = waterSpots[Math.floor(Math.random() * waterSpots.length)];
          } else {
            mob.targetPos = mob.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 3));
          }
        }

        // 3. Steer towards targetPos
        if (mob.targetPos) {
          const dir = mob.targetPos.clone().sub(mob.mesh.position);
          const dist = dir.length();
          if (dist > 0.1) {
            const targetYaw = Math.atan2(dir.x, dir.z);
            const horizDist = Math.hypot(dir.x, dir.z);
            const targetPitch = -Math.atan2(dir.y, Math.max(0.1, horizDist));

            let diffYaw = targetYaw - mob.yaw;
            while (diffYaw < -Math.PI) diffYaw += Math.PI * 2;
            while (diffYaw > Math.PI) diffYaw -= Math.PI * 2;
            mob.yaw += diffYaw * Math.min(1.0, dt * 3.5);

            mob.pitch = THREE.MathUtils.lerp(mob.pitch, targetPitch, Math.min(1.0, dt * 3.5));

            const baseSpeed = (mob.type === 'dolphin') ? 3.0 : (mob.type === 'salmon' ? 2.2 : (mob.type === 'axolotl' ? 1.6 : 1.2));
            // Octopus pulses with rhythmic jet propulsion
            const thrust = (mob.type === 'octopus') ? (Math.sin(mob.swimCycle * 3.5) > 0.4 ? baseSpeed * 1.8 : 0.2) : baseSpeed;

            const forwardX = Math.sin(mob.yaw) * Math.cos(mob.pitch);
            const forwardZ = Math.cos(mob.yaw) * Math.cos(mob.pitch);
            const forwardY = -Math.sin(mob.pitch);

            mob.velocity.x += forwardX * thrust * dt * 3.0;
            mob.velocity.y += forwardY * thrust * dt * 3.0;
            mob.velocity.z += forwardZ * thrust * dt * 3.0;
          }
        }

        // Keep fish inside water and recover from a blocked route on a cooldown.
        const canSwimTo = pos => !this.checkMobCollision(mob, pos) && this.world.getVoxel(Math.floor(pos.x), Math.floor(pos.y + 0.15), Math.floor(pos.z)) === BLOCKS.WATER;
        let swimBlocked = false;
        // Move with 3D collision check
        const stepX = mob.mesh.position.x + mob.velocity.x * dt;
        const stepY = mob.mesh.position.y + mob.velocity.y * dt;
        const stepZ = mob.mesh.position.z + mob.velocity.z * dt;

        if (canSwimTo(new THREE.Vector3(stepX, mob.mesh.position.y, mob.mesh.position.z))) {
          mob.mesh.position.x = stepX;
        } else {
          mob.velocity.x = 0;
          swimBlocked = true;
        }

        if (canSwimTo(new THREE.Vector3(mob.mesh.position.x, stepY, mob.mesh.position.z))) {
          mob.mesh.position.y = stepY;
        } else {
          mob.velocity.y = 0;
          swimBlocked = true;
        }

        if (canSwimTo(new THREE.Vector3(mob.mesh.position.x, mob.mesh.position.y, stepZ))) {
          mob.mesh.position.z = stepZ;
        } else {
          mob.velocity.z = 0;
          swimBlocked = true;
        }

        mob.swimBlockedTime = swimBlocked ? (mob.swimBlockedTime || 0) + dt : 0;
        if (mob.swimBlockedTime > 0.4) { mob.timer = 0; mob.targetPos = null; mob.swimBlockedTime = 0; }

        mob.mesh.rotation.y = mob.yaw;
        mob.mesh.rotation.x = mob.pitch;

      } else {
        // --- OUT OF WATER: BEACHED FLOPPING ---
        mob.velocity.y -= 20 * dt; // Gravity
        mob.flopTimer -= dt;

        if (mob.flopTimer <= 0) {
          mob.flopTimer = 0.5 + Math.random() * 0.7;
          mob.velocity.y = 3.5 + Math.random() * 2.0;
          mob.velocity.x = (Math.random() - 0.5) * 3.0;
          mob.velocity.z = (Math.random() - 0.5) * 3.0;
          mob.yaw += (Math.random() - 0.5) * 2.0;
          this.sounds.playFall();
        }

        const testPos = mob.mesh.position.clone();
        testPos.y += mob.velocity.y * dt;
        if (!this.checkMobCollision(mob, testPos)) {
          mob.mesh.position.y = testPos.y;
        } else {
          mob.velocity.y = 0;
        }

        mob.mesh.position.x += mob.velocity.x * dt;
        mob.mesh.position.z += mob.velocity.z * dt;
        mob.velocity.x *= 0.88;
        mob.velocity.z *= 0.88;

        mob.mesh.rotation.y = mob.yaw;
        mob.mesh.rotation.z = Math.PI / 2.6; // beached sideways
        mob.mesh.rotation.x = 0;
      }

      // --- SPECIFIC AQUATIC ANIMATIONS ---
      if (mob.type === 'salmon') {
        const tailWiggle = Math.sin(mob.swimCycle * 9.0) * (inWater ? 0.45 : 0.8);
        if (mob.tail) mob.tail.rotation.y = tailWiggle;
        if (mob.finL) mob.finL.rotation.z = -0.35 + Math.sin(mob.swimCycle * 9.0) * 0.2;
        if (mob.finR) mob.finR.rotation.z = 0.35 - Math.sin(mob.swimCycle * 9.0) * 0.2;
      } else if (mob.type === 'cod') {
        const tailWiggle = Math.sin(mob.swimCycle * 11.0) * (inWater ? 0.45 : 0.8);
        if (mob.tail) mob.tail.rotation.y = tailWiggle;
        if (mob.finL) mob.finL.rotation.z = -0.3 + Math.sin(mob.swimCycle * 11.0) * 0.2;
        if (mob.finR) mob.finR.rotation.z = 0.3 - Math.sin(mob.swimCycle * 11.0) * 0.2;
      } else if (mob.type === 'dolphin') {
        const flukeWave = Math.sin(mob.swimCycle * 6.5) * (inWater ? 0.45 : 0.7);
        if (mob.fluke) mob.fluke.rotation.x = flukeWave;
        if (mob.tail) mob.tail.rotation.x = flukeWave * 0.5;
        if (mob.flipperL) mob.flipperL.rotation.z = -0.4 + Math.sin(mob.swimCycle * 6.5) * 0.15;
        if (mob.flipperR) mob.flipperR.rotation.z = 0.4 - Math.sin(mob.swimCycle * 6.5) * 0.15;
      } else if (mob.type === 'octopus' || mob.type === 'squid') {
        const pulse = Math.pow((Math.sin(mob.swimCycle * 3.5) + 1.0) * 0.5, 2.0);
        if (mob.tentacles) {
          for (let t = 0; t < mob.tentacles.length; t++) {
            mob.tentacles[t].rotation.x = (pulse * 0.6) - 0.1;
          }
        }
      } else if (mob.type === 'glow_squid') {
        const pulse = Math.pow((Math.sin(mob.swimCycle * 3.5) + 1.0) * 0.5, 2.0);
        if (mob.tentacles) {
          for (let t = 0; t < mob.tentacles.length; t++) {
            mob.tentacles[t].rotation.x = (pulse * 0.6) - 0.1;
          }
        }
        mob.glowParticleTimer = (mob.glowParticleTimer || 0) + dt;
        if (mob.glowParticleTimer > 1.8 && inWater) {
          mob.glowParticleTimer = 0;
          this.spawnParticleBurst(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x22d3ee, 3);
        }
      } else if (mob.type === 'guardian' || mob.type === 'elder_guardian') {
        const tailWiggle = Math.sin(mob.swimCycle * 6.0) * (inWater ? 0.35 : 0.6);
        if (mob.tail1) mob.tail1.rotation.y = tailWiggle;
        if (mob.tail2) mob.tail2.rotation.y = tailWiggle * 1.3;

        // Spike retraction when swimming fast vs extended when stopping/attacking/beached
        const isSpurting = inWater && mob.velocity.length() > 1.2;
        const targetExt = isSpurting ? 0.3 : 1.0;
        mob.spikeExtension = THREE.MathUtils.lerp(mob.spikeExtension || 1.0, targetExt, Math.min(1.0, dt * 5.0));
        if (mob.spikes) {
          for (const sp of mob.spikes) {
            sp.mesh.position.copy(sp.basePos).addScaledVector(sp.dir, (mob.spikeExtension - 1.0) * 0.12);
          }
        }

        // Pupil eye tracking
        const distToPlayer = (player?.position) ? mob.mesh.position.distanceTo(player.position) : 999;
        if (mob.pupil && player?.position && distToPlayer < 20) {
          const eyeDx = player.position.x - mob.mesh.position.x;
          const eyeDy = (player.position.y + 0.9) - (mob.mesh.position.y + 0.5);
          const eyeDz = player.position.z - mob.mesh.position.z;
          const cosYaw = Math.cos(mob.yaw);
          const sinYaw = Math.sin(mob.yaw);
          const localX = eyeDx * cosYaw - eyeDz * sinYaw;
          mob.pupil.position.x = Math.max(-0.06, Math.min(0.06, localX * 0.015));
          mob.pupil.position.y = Math.max(-0.06, Math.min(0.06, eyeDy * 0.015));
        }

        // Laser Attack Behavior
        mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
        if (player?.position && distToPlayer < 16 && inWater && !player.isFlying && mob.attackCooldown <= 0) {
          mob.laserTimer = (mob.laserTimer || 0) + dt;
          const eyePos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0));
          const playerChest = player.position.clone().add(new THREE.Vector3(0, 0.9, 0));

          if (!mob.laserLine && this.scene) {
            const geo = new THREE.BufferGeometry().setFromPoints([eyePos, playerChest]);
            const mat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 3 });
            mob.laserLine = new THREE.Line(geo, mat);
            this.scene.add(mob.laserLine);
          } else if (mob.laserLine) {
            mob.laserLine.geometry.setFromPoints([eyePos, playerChest]);
            const progress = Math.min(1.0, mob.laserTimer / 2.2);
            mob.laserLine.material.color.setRGB(progress, 1.0 - progress * 0.8, 1.0);
          }

          if (mob.laserTimer >= 2.2) {
            const dmg = mob.isElder ? 12 : 6;
            if (typeof player.takeDamage === 'function') {
              player.takeDamage(dmg, mob.isElder ? 'Elder Guardian Laser' : 'Guardian Laser');
            } else if (player.health !== undefined) {
              player.health = Math.max(0, player.health - dmg);
            }
            this.sounds?.playExplosion?.();
            this.spawnParticleBurst(playerChest, 0x06b6d4, 10);

            if (mob.laserLine && this.scene) {
              this.scene.remove(mob.laserLine);
              mob.laserLine.geometry?.dispose();
              mob.laserLine.material?.dispose();
              mob.laserLine = null;
            }
            mob.laserTimer = 0;
            mob.attackCooldown = 3.5;
          }
        } else {
          if (mob.laserLine && this.scene) {
            this.scene.remove(mob.laserLine);
            mob.laserLine.geometry?.dispose();
            mob.laserLine.material?.dispose();
            mob.laserLine = null;
          }
          mob.laserTimer = 0;
        }
      } else if (mob.type === 'axolotl') {
        const bodyWiggle = Math.sin(mob.swimCycle * 6.0) * (inWater ? 0.35 : 0.65);
        if (mob.tail) mob.tail.rotation.y = bodyWiggle;
        if (mob.gillsL) mob.gillsL.rotation.y = Math.sin(mob.swimCycle * 3.5) * 0.2;
        if (mob.gillsR) mob.gillsR.rotation.y = -Math.sin(mob.swimCycle * 3.5) * 0.2;
        if (mob.feet) {
          mob.feet[0].rotation.y = bodyWiggle * 0.4;
          mob.feet[1].rotation.y = -bodyWiggle * 0.4;
          mob.feet[2].rotation.y = -bodyWiggle * 0.4;
          mob.feet[3].rotation.y = bodyWiggle * 0.4;
        }
      }

      return true;
    return false;
  }

