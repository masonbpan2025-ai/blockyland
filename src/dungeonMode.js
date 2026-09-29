import * as THREE from 'three';

export class DungeonModeManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.player = game.player;
    this.sounds = game.sounds;
    this.mobs = game.mobs;

    this.isActive = false;
    this.currentZone = null; // 'punching' | 'kamehameha' | 'genki_dama' | 'arena'
    this.clearedZones = new Set();
    this.exitTimer = 0;
    this.isExiting = false;

    // Defined Dungeon Zones
    this.zones = [
      {
        id: 'punching',
        name: 'Punching Combat Yard',
        bounds: { minX: 30, maxX: 70, minZ: -16, maxZ: 16 },
        hint: 'Defeat all combatants with punches [U] or skills!'
      },
      {
        id: 'kamehameha',
        name: 'Kamehameha Target Range',
        bounds: { minX: -70, maxX: -30, minZ: -16, maxZ: 16 },
        hint: 'Defeat target mobs using Kamehameha [J] or melee strikes!'
      },
      {
        id: 'genki_dama',
        name: 'Genki Dama (Spirit Bomb) Crater',
        bounds: { minX: -16, maxX: 16, minZ: -70, maxZ: -30 },
        hint: 'Defeat the clustered mobs using Spirit Bomb [K]!'
      },
      {
        id: 'arena',
        name: 'World Martial Arts Boss Arena',
        bounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 },
        hint: 'Defeat the Enderman Challenger to become World Champion!'
      }
    ];

    // DOM HUD elements
    const hasDoc = typeof document !== 'undefined';
    this.hudContainer = hasDoc ? document.getElementById('dungeon-mode-hud') : null;
    this.zoneTitleEl = hasDoc ? document.getElementById('dungeon-zone-title') : null;
    this.enemyCountEl = hasDoc ? document.getElementById('dungeon-enemy-count') : null;
    this.rollCdEl = hasDoc ? document.getElementById('dungeon-roll-cd') : null;
    this.clearedBanner = hasDoc ? document.getElementById('dungeon-cleared-banner') : null;
    this.clearedSubEl = hasDoc ? document.getElementById('dungeon-cleared-sub') : null;

    this.setupCombatHooks();
  }

  setupCombatHooks() {
    if (!this.player) return;

    // Wire player punch execution (Key U)
    this.player.onPunch = () => {
      this.executePunch();
    };

    // Wire player dodge roll effects (Key N)
    this.player.onRoll = () => {
      this.executeRoll();
    };
  }

  executePunch() {
    this.sounds?.playPunch?.();

    // Facing vector & origin: adapts to 1st Person or Dungeon Mode
    const facing = new THREE.Vector3();
    const punchOrigin = new THREE.Vector3();

    if (this.player.isDungeonMode) {
      facing.set(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw)).normalize();
      punchOrigin.copy(this.player.position).add(new THREE.Vector3(0, 1.1, 0));
    } else {
      this.game.camera.getWorldDirection(facing);
      punchOrigin.copy(this.game.camera.position).add(facing.clone().multiplyScalar(0.4));
    }

    // 1. Spawn vibrant 3D martial arts punch energy shockwave
    this.spawnPunchWave(punchOrigin, facing);

    // 2. Also trigger 1st person hand swing if in 1st person view
    if (this.player.perspective === 0 && !this.player.isDungeonMode) {
      this.game.heldItemRenderer?.swing?.();
    }

    let hitAny = false;
    if (this.game.mobs?.mobs) {
      for (const mob of this.game.mobs.mobs) {
        if (mob.health <= 0 || mob.dying) continue;
        if (mob.type === 'site_manager' || mob.type === 'tournament_host' || mob.type === 'villager') continue;

        const toMob = mob.mesh.position.clone().sub(this.player.position);
        const distXZ = Math.hypot(toMob.x, toMob.z);
        const distY = Math.abs(toMob.y);

        // Close quarters / Point-blank melee range: distXZ <= 1.8 and distY <= 2.8
        // Hits opponent regardless of angle when in close contact!
        // Extended frontal range: 1.8 < distXZ <= 3.2 and in front hemisphere
        let canHit = false;
        if (distY <= 2.8) {
          if (distXZ <= 1.8) {
            canHit = true;
          } else if (distXZ <= 3.2) {
            toMob.y = 0;
            if (toMob.lengthSq() > 0.001) toMob.normalize();
            // Generous >180 degree frontal arc
            if (toMob.dot(facing) >= -0.15) {
              canHit = true;
            }
          }
        }

        if (canHit) {
          hitAny = true;
          this.game.mobs.damageMob(mob, 14, this.player.position, true);
          mob.velocity.add(facing.clone().multiplyScalar(4.0));
          mob.velocity.y += 1.8;

          // Spawn punch impact particle sparks
          this.game.dragonballSkills?.spawnEnergySparks?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 12, 0xfacc15);

          const hpLeft = Math.max(0, Math.ceil(mob.health));
          const mobName = mob.name || (mob.type.charAt(0).toUpperCase() + mob.type.slice(1));
          this.game.ui?.addChatMessage?.(
            `<span style="color:#facc15;font-weight:bold;">👊 PUNCH HIT!</span> Dealt 14 damage to ${mobName}! (HP: ${hpLeft})`
          );
        }
      }
    }

    if (hitAny) {
      this.sounds?.playHit?.();
    }
  }

  // 3D Sonic Punch Shockwave & Burst Particles
  spawnPunchWave(origin, direction) {
    if (!this.scene) return;
    const waveGroup = new THREE.Group();

    // Golden / Cyan Energy Punch Slash Arc
    const ringGeo = new THREE.TorusGeometry(0.52, 0.08, 8, 20, Math.PI * 0.95);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.z = Math.PI / 2;
    waveGroup.add(ringMesh);

    // White Core Fist Flash
    const coreGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    waveGroup.add(coreMesh);

    const startPos = origin.clone().add(direction.clone().multiplyScalar(0.7));
    waveGroup.position.copy(startPos);
    waveGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction.clone().normalize());
    this.scene.add(waveGroup);

    // Fast expansion & surge forward
    let life = 0.22;
    const updateWave = () => {
      life -= 0.032;
      const progress = 1.0 - Math.max(0, life / 0.22);
      waveGroup.position.addScaledVector(direction, 0.22);
      const scale = 1.0 + progress * 2.4;
      waveGroup.scale.set(scale, scale, scale);
      ringMat.opacity = (1.0 - progress) * 0.95;
      coreMat.opacity = (1.0 - progress) * 0.95;

      if (life > 0) {
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(updateWave);
      } else {
        this.scene.remove(waveGroup);
        ringGeo.dispose();
        ringMat.dispose();
        coreGeo.dispose();
        coreMat.dispose();
      }
    };
    updateWave();

    // Forward air punch speed streak particles
    if (this.game.entities?.particles) {
      for (let i = 0; i < 7; i++) {
        const pGeo = new THREE.BoxGeometry(0.1, 0.1, 0.2);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.9 });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.copy(startPos).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.4
        ));
        this.scene.add(pMesh);

        const pVel = direction.clone().multiplyScalar(7.0 + Math.random() * 4.0);
        pVel.x += (Math.random() - 0.5) * 2.0;
        pVel.y += (Math.random() - 0.5) * 1.5;
        pVel.z += (Math.random() - 0.5) * 2.0;

        this.game.entities.particles.push({
          mesh: pMesh,
          velocity: pVel,
          life: 0.18,
          maxLife: 0.18,
          spark: false,
          fade: true
        });
      }
    }
  }

  executeRoll() {
    this.sounds?.playRoll?.();
    // Spawn dust particles along dash trajectory
    if (this.game.dragonballSkills?.spawnEnergySparks) {
      const feetPos = this.player.position.clone();
      this.game.dragonballSkills.spawnEnergySparks(feetPos, 8, 0xd4d4d8);
    }
  }

  // Count living hostile mobs inside a specific zone
  getEnemiesInZone(zone) {
    if (!this.game.mobs?.mobs) return 0;
    const b = zone.bounds;
    let count = 0;

    for (const mob of this.game.mobs.mobs) {
      if (mob.health <= 0 || mob.dying) continue;
      // Exclude friendly NPCs
      if (mob.type === 'site_manager' || mob.type === 'tournament_host' || mob.type === 'villager') continue;

      const p = mob.mesh?.position || mob.position;
      if (!p) continue;

      if (zone.id === 'arena') {
        // In arena, the target is the Enderman Boss
        if (mob.type === 'enderman' && mob.health > 0) {
          count++;
        }
      } else if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) {
        count++;
      }
    }
    return count;
  }

  enterDungeonMode(zone) {
    this.isActive = true;
    this.currentZone = zone;
    this.isExiting = false;
    this.exitTimer = 0;

    if (this.player) {
      this.player.isDungeonMode = true;
    }

    // Show HUD
    if (this.hudContainer) {
      this.hudContainer.classList.remove('hidden');
      if (this.zoneTitleEl) this.zoneTitleEl.textContent = zone.name;
    }

    this.game.sounds?.playHostSpeak?.();
    this.game.ui?.addChatMessage?.(
      `<span style="color:#f59e0b;font-weight:bold;">⚔️ [Dungeon Mode]</span> Entered <strong>${zone.name}</strong>! Defeat all enemies to clear the area!`
    );
  }

  exitDungeonMode(wasCleared = false) {
    this.isActive = false;
    this.isExiting = false;
    this.exitTimer = 0;

    if (this.player) {
      this.player.isDungeonMode = false;
    }

    if (this.hudContainer) {
      this.hudContainer.classList.add('hidden');
    }

    if (wasCleared && this.currentZone) {
      this.clearedZones.add(this.currentZone.id);
      this.showClearedBanner(this.currentZone);
    }

    this.currentZone = null;
  }

  showClearedBanner(zone) {
    if (!this.clearedBanner) return;
    if (this.clearedSubEl) {
      this.clearedSubEl.textContent = `${zone.name} Cleared! All Enemies Defeated`;
    }
    this.clearedBanner.classList.remove('hidden');
    this.clearedBanner.classList.add('visible');

    setTimeout(() => {
      if (this.clearedBanner) {
        this.clearedBanner.classList.remove('visible');
        this.clearedBanner.classList.add('hidden');
      }
    }, 3200);
  }

  update(dt) {
    if (!this.player) return;
    if (!this.game?.tournament?.isTournamentMap) {
      if (this.isActive) this.exitDungeonMode(false);
      return;
    }

    // Check Dodge Roll cooldown indicator on HUD
    if (this.rollCdEl && this.isActive) {
      if (this.player.rollCooldown > 0) {
        this.rollCdEl.textContent = `${this.player.rollCooldown.toFixed(1)}s`;
        this.rollCdEl.style.color = '#f97316';
        this.rollCdEl.style.borderColor = '#ea580c';
      } else {
        this.rollCdEl.textContent = 'READY';
        this.rollCdEl.style.color = '#22c55e';
        this.rollCdEl.style.borderColor = '#16a34a';
      }
    }

    const p = this.player.position;

    // If currently in Dungeon Mode
    if (this.isActive && this.currentZone) {
      const enemiesCount = this.getEnemiesInZone(this.currentZone);
      if (this.enemyCountEl) {
        this.enemyCountEl.textContent = enemiesCount;
      }

      // Check if all enemies in the zone are defeated
      if (enemiesCount === 0 && !this.isExiting) {
        this.isExiting = true;
        this.exitTimer = 1.8; // Brief victory delay
        this.game.sounds?.playVictoryFanfare?.();
        this.game.ui?.addChatMessage?.(
          `<span style="color:#22c55e;font-weight:bold;">★ [Dungeon Mode]</span> ${this.currentZone.name} CLEARED! Exiting Dungeon Mode...`
        );
      }

      if (this.isExiting) {
        this.exitTimer -= dt;
        if (this.exitTimer <= 0) {
          this.exitDungeonMode(true);
        }
        return;
      }

      // Check if player walked far outside the site boundary
      const b = this.currentZone.bounds;
      const margin = 8.0;
      const isOutside = (
        p.x < b.minX - margin ||
        p.x > b.maxX + margin ||
        p.z < b.minZ - margin ||
        p.z > b.maxZ + margin
      );

      if (isOutside) {
        this.exitDungeonMode(false);
      }
      return;
    }

    // Not in Dungeon Mode: Check if player enters a combat training site or boss battle
    // 1. Check Tournament Arena Boss Battle
    if (this.game.tournament?.state === 'FIGHTING') {
      const arenaZone = this.zones.find(z => z.id === 'arena');
      if (arenaZone && !this.clearedZones.has('arena')) {
        const enemies = this.getEnemiesInZone(arenaZone);
        if (enemies > 0) {
          this.enterDungeonMode(arenaZone);
          return;
        }
      }
    }

    // 2. Check the 3 combat training sites (Punching, Kamehameha, Genki Dama)
    // EXCLUDES Parkour site (minZ: 30, maxZ: 70, minX: -16, maxX: 16)
    for (const zone of this.zones) {
      if (zone.id === 'arena') continue;
      const b = zone.bounds;
      const inside = (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ);

      if (inside) {
        // If not already cleared and hostile enemies exist
        if (!this.clearedZones.has(zone.id)) {
          const enemies = this.getEnemiesInZone(zone);
          if (enemies > 0) {
            this.enterDungeonMode(zone);
            break;
          }
        }
      }
    }
  }

  reset() {
    this.isActive = false;
    this.currentZone = null;
    this.clearedZones.clear();
    this.isExiting = false;
    this.exitTimer = 0;
    if (this.player) this.player.isDungeonMode = false;
    if (this.hudContainer) this.hudContainer.classList.add('hidden');
    if (this.clearedBanner) {
      this.clearedBanner.classList.remove('visible');
      this.clearedBanner.classList.add('hidden');
    }
  }
}
