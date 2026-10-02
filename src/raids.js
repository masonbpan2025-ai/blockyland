import * as THREE from 'three';

export class RaidManager {
  constructor(mobManager, world, sounds, ui) {
    this.mobManager = mobManager;
    this.world = world;
    this.sounds = sounds;
    this.ui = ui;
    this.isRaidActive = false;
    this.currentWave = 0;
    this.maxWaves = 3;
    this.raidMobs = [];
    this.villageCenter = null;
    this.evokerFangs = [];
  }

  /**
   * Called when player with Bad Omen enters a village
   */
  startRaid(player, villagePos) {
    if (this.isRaidActive) return;
    this.isRaidActive = true;
    this.currentWave = 1;
    this.villageCenter = villagePos.clone();
    this.raidMobs = [];

    // Clear Bad Omen
    player.clearStatusEffect?.('bad_omen');

    if (this.sounds?.playRaidHorn) this.sounds.playRaidHorn();
    this.ui?.setBossBar?.('raid', `Raid - Wave 1/${this.maxWaves}`, 1.0, '#dc2626');
    this.spawnWave(this.currentWave);
  }

  spawnWave(wave) {
    this.raidMobs = [];
    const center = this.villageCenter || new THREE.Vector3(0, 10, 0);

    const spawnAtRadius = (type, angle, dist) => {
      const x = center.x + Math.cos(angle) * dist;
      const z = center.z + Math.sin(angle) * dist;
      const y = center.y + 1;
      const mob = this.mobManager.spawnMob(type, x, y, z);
      if (mob) {
        mob.isRaidMob = true;
        this.raidMobs.push(mob);
      }
      return mob;
    };

    if (wave === 1) {
      // 4 Pillagers
      for (let i = 0; i < 4; i++) {
        spawnAtRadius('pillager', (i / 4) * Math.PI * 2, 28);
      }
    } else if (wave === 2) {
      // 3 Pillagers + 2 Vindicators
      for (let i = 0; i < 3; i++) {
        spawnAtRadius('pillager', (i / 3) * Math.PI * 2, 28);
      }
      for (let i = 0; i < 2; i++) {
        spawnAtRadius('vindicator', ((i + 0.5) / 2) * Math.PI * 2, 26);
      }
    } else if (wave >= 3) {
      // 3 Pillagers, 2 Vindicators, 1 Evoker, 1 Ravager
      for (let i = 0; i < 3; i++) spawnAtRadius('pillager', (i / 3) * Math.PI * 2, 30);
      for (let i = 0; i < 2; i++) spawnAtRadius('vindicator', ((i + 0.5) / 2) * Math.PI * 2, 28);
      spawnAtRadius('evoker', 0, 26);
      spawnAtRadius('ravager', Math.PI, 28);
    }

    this.updateBossBar();
  }

  update(dt, player) {
    if (!this.isRaidActive) return;

    // Filter alive raid mobs
    this.raidMobs = this.raidMobs.filter(m => m.health > 0);
    this.updateBossBar();

    // Check wave clear
    if (this.raidMobs.length === 0) {
      if (this.currentWave < this.maxWaves) {
        this.currentWave++;
        if (this.sounds?.playRaidHorn) this.sounds.playRaidHorn();
        this.spawnWave(this.currentWave);
      } else {
        // Victory!
        this.completeRaid(player);
      }
    }

    // Special AI for Evoker and Ravager during raid
    for (let i = 0; i < this.raidMobs.length; i++) {
      const mob = this.raidMobs[i];
      if (mob.type === 'evoker') {
        this.updateEvokerAI(mob, dt, player);
      } else if (mob.type === 'ravager') {
        this.updateRavagerAI(mob, dt, player);
      }
    }

    // Update Evoker Fangs
    this.updateEvokerFangs(dt, player);
  }

  updateEvokerAI(evoker, dt, player) {
    evoker.castCooldown = (evoker.castCooldown || 4.0) - dt;
    const dist = evoker.mesh.position.distanceTo(player.position);
    if (dist < 18 && evoker.castCooldown <= 0) {
      evoker.castCooldown = 6.0;
      // 50% chance to summon Vexes or cast Evoker Fangs
      if (Math.random() < 0.5) {
        this.castEvokerFangs(evoker.mesh.position, player.position);
      } else {
        this.summonVexes(evoker.mesh.position);
      }
      if (this.sounds?.playMagic) this.sounds.playMagic();
    }
  }

  castEvokerFangs(fromPos, toPos) {
    const dir = toPos.clone().sub(fromPos);
    dir.y = 0;
    const dist = dir.length();
    dir.normalize();

    const fangCount = Math.min(12, Math.floor(dist / 1.5));
    for (let i = 1; i <= fangCount; i++) {
      setTimeout(() => {
        const fangPos = fromPos.clone().addScaledVector(dir, i * 1.5);
        const fangGeo = new THREE.BoxGeometry(0.5, 0.9, 0.5);
        const fangMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
        const fangMesh = new THREE.Mesh(fangGeo, fangMat);
        fangMesh.position.copy(fangPos).add(new THREE.Vector3(0, 0.45, 0));
        this.mobManager.scene.add(fangMesh);

        this.evokerFangs.push({
          mesh: fangMesh,
          position: fangPos,
          age: 0,
          hasDamaged: false
        });
      }, i * 70);
    }
  }

  summonVexes(pos) {
    for (let i = 0; i < 2; i++) {
      const vex = this.mobManager.spawnMob('vex', pos.x + (Math.random() - 0.5) * 2, pos.y + 1, pos.z + (Math.random() - 0.5) * 2);
      if (vex) {
        vex.isFlying = true;
        vex.target = this.mobManager.player;
        this.raidMobs.push(vex);
      }
    }
  }

  updateRavagerAI(ravager, dt, player) {
    const dist = ravager.mesh.position.distanceTo(player.position);
    if (dist < 14 && dist > 2.5) {
      // Charge at player
      const dir = player.position.clone().sub(ravager.mesh.position);
      dir.y = 0;
      dir.normalize();
      ravager.velocity.x = dir.x * 6.5;
      ravager.velocity.z = dir.z * 6.5;
      ravager.yaw = Math.atan2(dir.x, dir.z);
    } else if (dist <= 2.5) {
      // Attack with massive knockback
      ravager.attackCooldown = (ravager.attackCooldown || 0) - dt;
      if (ravager.attackCooldown <= 0) {
        ravager.attackCooldown = 1.8;
        player.takeDamage?.(12, 'ravager');
        if (player.velocity) {
          const knock = player.position.clone().sub(ravager.mesh.position).normalize();
          player.velocity.x += knock.x * 12;
          player.velocity.y += 6;
          player.velocity.z += knock.z * 12;
        }
        if (this.sounds?.playIronGolem) this.sounds.playIronGolem();
      }
    }
  }

  updateEvokerFangs(dt, player) {
    const remaining = [];
    for (let i = 0; i < this.evokerFangs.length; i++) {
      const fang = this.evokerFangs[i];
      fang.age += dt;

      // Damage player if stepped on
      if (!fang.hasDamaged && fang.position.distanceTo(player.position) < 1.2) {
        fang.hasDamaged = true;
        player.takeDamage?.(6, 'magic');
      }

      if (fang.age > 1.2) {
        this.mobManager.scene.remove(fang.mesh);
        fang.mesh.geometry?.dispose();
        fang.mesh.material?.dispose();
      } else {
        remaining.push(fang);
      }
    }
    this.evokerFangs = remaining;
  }

  updateBossBar() {
    if (!this.isRaidActive) return;
    const remaining = this.raidMobs.length;
    const progress = Math.min(1.0, remaining / 6.0);
    this.ui?.setBossBar?.('raid', `Raid - Wave ${this.currentWave}/${this.maxWaves} (${remaining} Remaining)`, progress, '#dc2626');
  }

  completeRaid(player) {
    this.isRaidActive = false;
    this.ui?.removeBossBar?.('raid');
    player.applyStatusEffect?.('hero_of_the_village', 600, 1);
    if (this.sounds?.playVictoryFanfare) this.sounds.playVictoryFanfare();
    // Firework celebrations
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.sounds?.playFireworkExplode?.();
        this.mobManager.spawnParticleBurst?.(
          player.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 12, (Math.random() - 0.5) * 10)),
          0x22c55e,
          25
        );
      }, i * 600);
    }
  }
}
