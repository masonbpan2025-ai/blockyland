import * as THREE from 'three';

export class DragonballSkillsManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.player = game.player;
    this.sounds = game.sounds;

    // Ki Gathering State
    this.activeSkill = null; // 'kamehameha' | 'genki_dama' | null
    this.chargeTime = 0;
    this.maxChargeTime = 3.5;
    this.soundTimer = 0;
    this.auraMesh = null;
    this.spiritBombMesh = null;

    // Active Beams & Projectiles
    this.activeBeams = [];
    this.activeBombs = [];

    // Screen Shake
    this.shakeIntensity = 0;

    // DOM HUD Elements
    const hasDoc = typeof document !== 'undefined';
    this.chargeHud = hasDoc ? document.getElementById('ki-charge-container') : null;
    this.chargeBar = hasDoc ? document.getElementById('ki-charge-bar') : null;
    this.chargeTitle = hasDoc ? document.getElementById('ki-charge-title') : null;
    this.chargeLevel = hasDoc ? document.getElementById('ki-charge-level') : null;

    // Hook counter-hit interrupt on player
    if (this.player) {
      this.player.onKiInterrupted = () => this.interruptCharge();
    }

    this.setupKeyListeners();
  }

  setupKeyListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in chat, terminal, or modals
      if (this.game.ui?.isModalOpen?.() || this.game.ui?.isChatOpen) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      if (e.code === 'KeyJ' && !e.repeat && !this.activeSkill) {
        this.startCharge('kamehameha');
      } else if (e.code === 'KeyK' && !e.repeat && !this.activeSkill) {
        this.startCharge('genki_dama');
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyJ' && this.activeSkill === 'kamehameha') {
        this.releaseCharge();
      } else if (e.code === 'KeyK' && this.activeSkill === 'genki_dama') {
        this.releaseCharge();
      }
    });
  }

  startCharge(skillType) {
    this.activeSkill = skillType;
    this.chargeTime = 0;
    this.soundTimer = 0;

    // Freeze player movement
    this.player.isGatheringKi = true;

    // Show HUD Charge Bar
    if (this.chargeHud) {
      this.chargeHud.classList.remove('hidden');
      if (this.chargeTitle) {
        this.chargeTitle.textContent = (skillType === 'kamehameha') ? '⚡ KAMEHAMEHA' : '☀️ GENKI DAMA (SPIRIT BOMB)';
        this.chargeTitle.style.color = (skillType === 'kamehameha') ? '#38bdf8' : '#67e8f9';
      }
      if (this.chargeBar) this.chargeBar.style.width = '0%';
    }

    // Create 3D Visual Aura / Charge Object
    if (skillType === 'kamehameha') {
      const geo = new THREE.SphereGeometry(0.35, 16, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.85
      });
      this.auraMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.auraMesh);
      this.sounds?.playKiCharge?.(false);
    } else if (skillType === 'genki_dama') {
      const geo = new THREE.SphereGeometry(0.5, 24, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x93c5fd,
        transparent: true,
        opacity: 0.88
      });
      this.spiritBombMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this.spiritBombMesh);
      this.sounds?.playKiCharge?.(true);
    }
  }

  interruptCharge() {
    if (!this.activeSkill) return;

    // Cancel skill without firing
    this.cleanupChargeVisuals();
    this.activeSkill = null;
    this.chargeTime = 0;
    this.player.isGatheringKi = false;

    // Play electric break snap sound
    this.sounds?.playKiBreak?.();

    // Show combat alert banner
    this.game.ui?.addChatMessage?.(
      '<span style="color:#ef4444;font-weight:bold;">[Combat] ⚡ Ki charge interrupted by enemy attack! 1.5x Critical Damage applied!</span>'
    );

    // Screen red flash
    if (typeof document !== 'undefined') {
      const canvas = document.getElementById('canvas-container');
      if (canvas) {
        canvas.style.filter = 'sepia(1) saturate(8) hue-rotate(-50deg)';
        setTimeout(() => { if (canvas) canvas.style.filter = 'none'; }, 220);
      }
    }
  }

  releaseCharge() {
    if (!this.activeSkill) return;

    const skill = this.activeSkill;
    const duration = this.chargeTime;

    this.cleanupChargeVisuals();
    this.activeSkill = null;
    this.player.isGatheringKi = false;

    if (duration < 0.15) return; // Tap too short

    if (skill === 'kamehameha') {
      this.fireKamehameha(duration);
    } else if (skill === 'genki_dama') {
      this.launchGenkiDama(duration);
    }
  }

  cleanupChargeVisuals() {
    if (this.auraMesh) {
      this.scene.remove(this.auraMesh);
      this.auraMesh.geometry.dispose();
      this.auraMesh.material.dispose();
      this.auraMesh = null;
    }
    if (this.spiritBombMesh) {
      this.scene.remove(this.spiritBombMesh);
      this.spiritBombMesh.geometry.dispose();
      this.spiritBombMesh.material.dispose();
      this.spiritBombMesh = null;
    }
    if (this.chargeHud) {
      this.chargeHud.classList.add('hidden');
    }
  }

  // --- KAMEHAMEHA (Turtle Destruction Wave Beam) ---
  fireKamehameha(chargeTime) {
    const power = Math.min(1.0, chargeTime / 3.0);
    const damage = Math.round(10 + power * 35); // 10 to 45 damage
    const beamLength = 48;
    const beamRadius = 0.5 + power * 1.0; // 0.5 to 1.5 blocks wide

    // Camera Direction
    const camDir = new THREE.Vector3();
    this.game.camera.getWorldDirection(camDir);
    const eyePos = this.game.camera.position.clone().add(camDir.clone().multiplyScalar(0.4));

    // Sound
    this.sounds?.playKamehameha?.();
    this.shakeIntensity = 0.35 + power * 0.45;

    // Create 3D Luminous Beam Group
    const beamGroup = new THREE.Group();

    // 1. Inner Pure White Core Cylinder
    const coreGeo = new THREE.CylinderGeometry(beamRadius * 0.45, beamRadius * 0.45, beamLength, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);

    // 2. Outer Luminous Cyan/Blue Plasma Cylinder
    const outerGeo = new THREE.CylinderGeometry(beamRadius, beamRadius, beamLength, 16);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.75 });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);

    // 3. Spherical Blast Head
    const headGeo = new THREE.SphereGeometry(beamRadius * 1.3, 16, 16);
    const headMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = beamLength / 2;

    beamGroup.add(coreMesh);
    beamGroup.add(outerMesh);
    beamGroup.add(headMesh);

    // Orient cylinder along look vector (Three.js cylinder defaults along Y axis)
    const midPoint = eyePos.clone().add(camDir.clone().multiplyScalar(beamLength / 2));
    beamGroup.position.copy(midPoint);
    beamGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), camDir.clone().normalize());

    this.scene.add(beamGroup);

    // Add to active beams list for fading
    this.activeBeams.push({
      group: beamGroup,
      materials: [coreMat, outerMat, headMat],
      life: 0.65,
      maxLife: 0.65
    });

    // Beam Damage Detection (Cylinder Capsule Raycast vs Mobs)
    if (this.game.mobs?.mobs) {
      for (const mob of this.game.mobs.mobs) {
        if (mob.health <= 0 || mob.dying) continue;
        const toMob = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)).sub(eyePos);
        const proj = toMob.dot(camDir);

        if (proj > 0.5 && proj < beamLength) {
          const perp = toMob.clone().sub(camDir.clone().multiplyScalar(proj)).length();
          if (perp < beamRadius + 0.8) {
            // Mob is caught inside the Kamehameha beam!
            this.game.mobs.damageMob(mob, damage, eyePos);
            // Extra energy knockback in beam direction
            mob.velocity.add(camDir.clone().multiplyScalar(8.0 + power * 10.0));
            mob.velocity.y += 3.5;

            // Spawn blue energy impact sparks
            this.spawnEnergySparks(mob.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 12, 0x00f0ff);
          }
        }
      }
    }

    this.game.ui?.addChatMessage?.(
      `<span style="color:#00f0ff;font-weight:bold;">⚡ KAMEHAMEHA!</span> (Power: ${Math.round(power * 100)}% | Damage: ${damage})`
    );
  }

  // --- GENKI DAMA (Spirit Bomb) ---
  launchGenkiDama(chargeTime) {
    const power = Math.min(1.0, chargeTime / 3.5);
    const damage = Math.round(18 + power * 45); // 18 to 63 AoE damage
    const bombRadius = 0.8 + power * 1.8; // 0.8 to 2.6 blocks radius
    const aoeRadius = 5.0 + power * 5.0; // 5 to 10 blocks AoE explosion

    const camDir = new THREE.Vector3();
    this.game.camera.getWorldDirection(camDir);
    const startPos = this.player.position.clone().add(new THREE.Vector3(0, 2.8, 0));

    // Throw Sound
    this.sounds?.playGenkiDamaLaunch?.();

    // Create Flying 3D Light Ball
    const geo = new THREE.SphereGeometry(bombRadius, 24, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.92
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(startPos);
    this.scene.add(mesh);

    // Initial velocity forward
    const speed = 18.0;
    const velocity = camDir.clone().multiplyScalar(speed);

    this.activeBombs.push({
      mesh,
      velocity,
      damage,
      aoeRadius,
      power,
      life: 6.0,
      trailTimer: 0
    });

    this.game.ui?.addChatMessage?.(
      `<span style="color:#38bdf8;font-weight:bold;">☀️ GENKI DAMA LAUNCHED!</span> (Charge: ${Math.round(power * 100)}% | Blast Radius: ${aoeRadius.toFixed(1)}m)`
    );
  }

  detonateGenkiDama(pos, damage, radius, power) {
    // Sound
    this.sounds?.playGenkiDamaExplosion?.();
    this.shakeIntensity = 0.6 + power * 0.8;

    // Expanding Celestial Shockwave Sphere
    const shockGeo = new THREE.SphereGeometry(1.0, 24, 24);
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.85,
      side: THREE.BackSide
    });
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.position.copy(pos);
    this.scene.add(shockMesh);

    // Expanding shock animation
    const maxScale = radius * 1.4;
    let shockLife = 0.45;
    const updateShock = (dt) => {
      shockLife -= dt;
      const progress = 1.0 - (shockLife / 0.45);
      const scale = progress * maxScale;
      shockMesh.scale.set(scale, scale, scale);
      shockMat.opacity = (shockLife / 0.45) * 0.85;
      if (shockLife <= 0) {
        this.scene.remove(shockMesh);
        shockGeo.dispose();
        shockMat.dispose();
      } else if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => updateShock(0.016));
      }
    };
    updateShock(0.016);

    // Spawn 50+ energy particles
    this.spawnEnergySparks(pos, 55, 0x38bdf8);

    // AoE Damage to all mobs in blast radius
    if (this.game.mobs?.mobs) {
      for (const mob of this.game.mobs.mobs) {
        if (mob.health <= 0 || mob.dying) continue;
        const dist = mob.mesh.position.distanceTo(pos);
        if (dist <= radius) {
          const falloff = Math.max(0.3, 1.0 - (dist / radius));
          const mobDamage = Math.round(damage * falloff);
          this.game.mobs.damageMob(mob, mobDamage, pos);

          // Massive radial knockback
          const kbDir = mob.mesh.position.clone().sub(pos).normalize();
          kbDir.y += 0.5;
          mob.velocity.add(kbDir.multiplyScalar(12.0 * falloff));
        }
      }
    }

    // Damage player if caught in own blast
    const playerDist = this.player.position.distanceTo(pos);
    if (playerDist <= radius * 0.7) {
      this.player.takeDamage(Math.round(8 * (1.0 - playerDist / (radius * 0.7))));
    }

    this.game.ui?.addChatMessage?.(
      `<span style="color:#f59e0b;font-weight:bold;">💥 GENKI DAMA IMPACT! Massive bombing explosion dealt ${damage} AoE damage!</span>`
    );
  }

  spawnEnergySparks(pos, count = 20, colorHex = 0x00f0ff) {
    if (!this.game.entities?.particles) return;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.95 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8
      ));
      this.scene.add(p);

      const speed = 4.0 + Math.random() * 8.0;
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;

      this.game.entities.particles.push({
        mesh: p,
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 1.0,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        spark: true,
        fade: true
      });
    }
  }

  update(dt) {
    // 1. Update Ki Gathering & Visuals
    if (this.activeSkill) {
      this.chargeTime += dt;
      this.soundTimer += dt;

      // Periodic charging hum
      if (this.soundTimer >= 0.35) {
        this.soundTimer = 0;
        this.sounds?.playKiCharge?.(this.activeSkill === 'genki_dama');
      }

      const powerPct = Math.min(100, Math.round((this.chargeTime / this.maxChargeTime) * 100));

      if (this.chargeBar) {
        this.chargeBar.style.width = `${powerPct}%`;
      }
      if (this.chargeLevel) {
        this.chargeLevel.textContent = `${powerPct}%`;
      }

      // Visual Updates
      if (this.activeSkill === 'kamehameha' && this.auraMesh) {
        const camDir = new THREE.Vector3();
        this.game.camera.getWorldDirection(camDir);
        // Position aura at chest level in front of player
        const auraPos = this.game.camera.position.clone().add(camDir.clone().multiplyScalar(0.7)).add(new THREE.Vector3(0, -0.3, 0));
        this.auraMesh.position.copy(auraPos);
        const pulse = 0.3 + Math.sin(Date.now() * 0.02) * 0.08 + (powerPct / 100) * 0.35;
        this.auraMesh.scale.set(pulse, pulse, pulse);

        // Emit gathering sparks inward
        if (Math.random() < 0.4) {
          this.spawnEnergySparks(auraPos, 2, 0x00f0ff);
        }
      } else if (this.activeSkill === 'genki_dama' && this.spiritBombMesh) {
        // Position sphere high above player's head
        const sphereY = this.player.position.y + 3.4 + (powerPct / 100) * 1.5;
        this.spiritBombMesh.position.set(this.player.position.x, sphereY, this.player.position.z);

        // Grow sphere size with charge
        const scale = 0.5 + (powerPct / 100) * 2.2 + Math.sin(Date.now() * 0.015) * 0.08;
        this.spiritBombMesh.scale.set(scale, scale, scale);

        if (Math.random() < 0.5) {
          this.spawnEnergySparks(this.spiritBombMesh.position, 3, 0x93c5fd);
        }
      }
    }

    // 2. Update Active Kamehameha Beams
    for (let i = this.activeBeams.length - 1; i >= 0; i--) {
      const beam = this.activeBeams[i];
      beam.life -= dt;
      const ratio = Math.max(0, beam.life / beam.maxLife);

      for (const mat of beam.materials) {
        mat.opacity = ratio * 0.85;
      }

      if (beam.life <= 0) {
        this.scene.remove(beam.group);
        beam.group.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.activeBeams.splice(i, 1);
      }
    }

    // 3. Update Active Genki Dama Flying Orbs
    for (let i = this.activeBombs.length - 1; i >= 0; i--) {
      const bomb = this.activeBombs[i];
      bomb.life -= dt;
      bomb.trailTimer += dt;

      // Slight downward arc
      bomb.velocity.y -= 3.0 * dt;
      bomb.mesh.position.addScaledVector(bomb.velocity, dt);

      // Trailing sparks
      if (bomb.trailTimer >= 0.06) {
        bomb.trailTimer = 0;
        this.spawnEnergySparks(bomb.mesh.position, 2, 0x67e8f9);
      }

      // Check collision with solid ground voxels
      const bX = Math.floor(bomb.mesh.position.x);
      const bY = Math.floor(bomb.mesh.position.y);
      const bZ = Math.floor(bomb.mesh.position.z);
      const voxel = this.game.world?.getVoxel?.(bX, bY, bZ);

      let collided = (voxel && voxel !== 0 && voxel !== 12); // hit block

      // Check collision with mobs
      if (!collided && this.game.mobs?.mobs) {
        for (const mob of this.game.mobs.mobs) {
          if (mob.health > 0 && mob.mesh.position.distanceTo(bomb.mesh.position) < bomb.mesh.geometry.parameters.radius + 0.8) {
            collided = true;
            break;
          }
        }
      }

      if (collided || bomb.life <= 0 || bomb.mesh.position.y < 1) {
        this.detonateGenkiDama(bomb.mesh.position.clone(), bomb.damage, bomb.aoeRadius, bomb.power);
        this.scene.remove(bomb.mesh);
        bomb.mesh.geometry.dispose();
        bomb.mesh.material.dispose();
        this.activeBombs.splice(i, 1);
      }
    }

    // 4. Update Camera Shake
    if (this.shakeIntensity > 0) {
      this.shakeIntensity -= dt * 1.8;
      if (this.shakeIntensity > 0) {
        this.game.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.35;
        this.game.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.35;
      }
    }
  }

  reset() {
    this.cleanupChargeVisuals();
    this.activeSkill = null;
    this.chargeTime = 0;
    if (this.player) this.player.isGatheringKi = false;

    for (const beam of this.activeBeams) {
      this.scene.remove(beam.group);
      beam.group.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    this.activeBeams = [];

    for (const bomb of this.activeBombs) {
      this.scene.remove(bomb.mesh);
      bomb.mesh.geometry.dispose();
      bomb.mesh.material.dispose();
    }
    this.activeBombs = [];
    this.shakeIntensity = 0;
  }
}

