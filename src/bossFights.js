import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { endSpikes, buildSpike, buildPodium, gatewayOrder } from './worldgen/generators/endFeatures.js';
import { CellCanvas } from './worldgen/cellStructure.js';
import { endStateFor, writeEndCanvas, addEndGateway } from './endProgression.js';
import { updateEnderDragonAI, onCrystalDestroyed, createDragonBreathCloud } from './enderDragonBehavior.js';

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
    wither.summonChargeTimer = 11.0; // 11s (220-tick) birth charge
    wither.mesh.scale.set(0.4, 0.4, 0.4);

    if (this.sounds?.playWitherSpawn) this.sounds.playWitherSpawn();
    this.ui?.setBossBar?.('wither', 'The Wither', 1.0, '#581c87');
    return wither;
  }

  // ==========================================
  // ENDER DRAGON ARENA INITIALIZATION
  // ==========================================
  initEndArena() {
    this.clearEndVisuals();
    const state=endStateFor(this.world);
    state.initialized=true;
    // Loaded mob snapshots and a live encounter must not create two dragons.
    for(const mob of this.mobManager.mobs??[])if(mob.type==='ender_dragon')mob.mesh?.removeFromParent();
    this.mobManager.mobs=(this.mobManager.mobs??[]).filter(m=>m.type!=='ender_dragon');
    this.mobManager.bossFightManager=this;
    // An End crystal on the bedrock atop each of the ten spikes (src/worldgen/generators/endFeatures.js places the
    // spikes themselves when the End's chunks generate).
    for (const [index,spike] of endSpikes(this.world?.seed ?? 0).entries()) {
      if(state.crystals[index])this.spawnEndCrystal(spike.x + 0.5, spike.top + 1.5, spike.z + 0.5,{spikeIndex:index});
    }
    this.mobManager.endCrystals=this.endCrystals;
    if(!state.defeated&&state.health<=0)this.onDragonDefeated();
    if(!state.defeated)this.spawnEnderDragonBoss(0,48,0);
    if(state.respawning)for(const [dx,dz]of [[3,0],[-3,0],[0,3],[0,-3]])this.spawnEndCrystal(dx+.5,this.podiumY()+1,dz+.5,{placed:true});
    if(state.defeated)this.activateEndExitPortal(false);
  }

  clearEndVisuals() {
    for(const c of this.endCrystals??[]){c.mesh?.removeFromParent();c.mesh?.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
    for(const c of this.dragonBreathClouds??[]) {c.mesh?.removeFromParent();c.mesh?.geometry?.dispose();c.mesh?.material?.dispose();}
    this.enderDragon=null;this.endCrystals=[];this.dragonBreathClouds=[];
    this.mobManager.endCrystals=this.endCrystals;
    this.ui?.removeBossBar?.('ender_dragon');
  }

  podiumY(){return (this.world?.surfaceHeightAt?.(0,0)??32)+1;}

  placeEndCrystal(x,y,z) {
    const below=this.world.getVoxel(x,y-1,z);
    if(![BLOCKS.OBSIDIAN,BLOCKS.BEDROCK].includes(below)||this.world.getVoxel(x,y,z)!==BLOCKS.AIR||this.world.getVoxel(x,y+1,z)!==BLOCKS.AIR)return false;
    if(this.endCrystals.some(c=>c.alive&&Math.abs(c.position.x-x-.5)<1&&Math.abs(c.position.z-z-.5)<1&&Math.abs(c.position.y-y)<2))return false;
    this.spawnEndCrystal(x+.5,y+.5,z+.5,{placed:true});
    const state=endStateFor(this.world),level=this.podiumY()+1;
    if(state.defeated&&[[3,0],[-3,0],[0,3],[0,-3]].every(([dx,dz])=>this.endCrystals.some(c=>c.alive&&c.placed&&Math.abs(c.position.x-dx-.5)<.6&&Math.abs(c.position.z-dz-.5)<.6&&Math.abs(c.position.y-level)<2))) {
      state.respawning=true;state.ritualElapsed=0;
      const canvas=new CellCanvas();buildPodium(canvas,this.podiumY());writeEndCanvas(this.world,canvas);
      this.world.setVoxel(0,this.podiumY()+4,0,BLOCKS.AIR);
    }
    return true;
  }

  updateDragonRespawn(dt) {
    const state=endStateFor(this.world);
    if(!state.respawning)return;
    state.ritualElapsed=(state.ritualElapsed??0)+dt;
    const spikes=endSpikes(this.world.seed),index=Math.min(9,Math.floor(state.ritualElapsed/3));
    const target=new THREE.Vector3(spikes[index].x+.5,spikes[index].top+2,spikes[index].z+.5);
    for(const c of this.endCrystals)if(c.alive&&c.placed)this.setCrystalBeam(c,target);
    if(state.ritualElapsed<30)return;
    for(const c of this.endCrystals){if(c.alive&&c.placed)this.entities?.spawnExplosion?.(c.position);c.mesh?.removeFromParent();}
    const canvas=new CellCanvas();
    for(const spike of endSpikes(this.world.seed))buildSpike(canvas,spike);
    writeEndCanvas(this.world,canvas);
    state.crystals=Array(10).fill(true);state.health=200;state.defeated=false;state.respawning=false;
    this.initEndArena();
  }

  spawnEndCrystal(x, y, z, options={}) {
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
      alive: true, ...options
    };
    this.endCrystals.push(crystal);
    return crystal;
  }

  setCrystalBeam(crystal,target) {
    let beam=crystal.mesh.getObjectByName('crystal-beam');
    if(!beam){beam=new THREE.Mesh(new THREE.CylinderGeometry(.08,.08,1,6),new THREE.MeshBasicMaterial({color:0xf7a1ff,transparent:true,opacity:.7,depthWrite:false}));beam.name='crystal-beam';crystal.mesh.add(beam);}
    beam.visible=!!target;if(!target)return;
    const delta=target.clone().sub(crystal.position),length=delta.length();
    beam.position.copy(delta).multiplyScalar(.5);beam.scale.y=length;
    if(length)beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());
  }

  checkCrystalHit(rayOrigin, rayDir) {
    for (const c of this.endCrystals) {
      if (c.alive && !c.exploded) {
        const toCrystal = c.position.clone().sub(rayOrigin);
        const proj = toCrystal.dot(rayDir);
        if (proj > 0 && proj < 6.0) {
          const closest = rayOrigin.clone().addScaledVector(rayDir, proj);
          const dist = closest.distanceTo(c.position);
          if (dist < 1.8) {
            let blocked=false;
            for(let d=.2;d<Math.max(0,proj-1);d+=.2){const p=rayOrigin.clone().addScaledVector(rayDir,d);if(this.mobManager.isBlockSolid?.(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))){blocked=true;break;}}
            if(blocked)continue;
            this.destroyEndCrystal(c);
            return true;
          }
        }
      }
    }
    return false;
  }

  hitCrystalSegment(from,to) {
    const delta=to.clone().sub(from),length=delta.lengthSq();
    for(const crystal of this.endCrystals)if(crystal.alive) {
      const t=length?THREE.MathUtils.clamp(crystal.position.clone().sub(from).dot(delta)/length,0,1):0;
      if(from.clone().addScaledVector(delta,t).distanceTo(crystal.position)<1){this.destroyEndCrystal(crystal);return true;}
    }
    return false;
  }

  destroyEndCrystal(crystal) {
    if(!crystal.alive)return false;
    crystal.alive=false;crystal.exploded=true;crystal.mesh?.removeFromParent();
    const state=endStateFor(this.world);
    if(crystal.spikeIndex!==undefined)state.crystals[crystal.spikeIndex]=false;
    if(crystal.placed&&state.respawning){state.respawning=false;state.ritualElapsed=0;this.activateEndExitPortal(false);}
    onCrystalDestroyed(this.mobManager,crystal);
    this.entities?.spawnExplosion?.(crystal.position);
    this.sounds?.playExplosion?.();
    const player=this.game?.player;
    if(player?.position && player.position.distanceTo(crystal.position)<6 && !['creative','spectator'].includes(player.gamemode))player.takeDamage?.(Math.max(1,Math.round(30*(1-player.position.distanceTo(crystal.position)/6))),crystal.position,'explosion');
    return true;
  }

  spawnEnderDragonBoss(x, y, z) {
    const dragon = this.mobManager.spawnMob('ender_dragon', x, y, z);
    if (!dragon) return null;
    this.enderDragon = dragon;
    dragon.isBoss = true;
    dragon.health = endStateFor(this.world).health || 200;
    dragon.maxHealth = 200;
    dragon.dragonPhase = 'circling';
    dragon.phaseTimer = 10.0;
    dragon.perchTimer = 0;
    dragon.endEncounterManaged=true;
    dragon.endRepeatFight=endStateFor(this.world).kills>0;

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

    this.updateWitherSkulls(dt, player);
    if(this.world?.dimension!=='the_end')return;
    this.updateDragonRespawn(dt);
    // 2. Update Ender Dragon Boss
    if (this.enderDragon) {
      this.updateEnderDragonBoss(dt, player);
    }

    // 3. Update Dragon Breath Pools
    this.updateDragonBreath(dt, player);

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
    this.mobManager.spawnXpOrbs?.(pos, 50);
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

    updateEnderDragonAI(this.mobManager,dragon,dt,player);
    dragon.mesh.position.addScaledVector(dragon.velocity,dt);
    for(const c of this.endCrystals)if(c.alive)this.setCrystalBeam(c,c===dragon.healingCrystal?dragon.mesh.position:null);
    const state=endStateFor(this.world);state.health=dragon.health;
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
      for (const p of [...this.mobManager.customProjectiles]) {
        if(!p.isDragonBreathBall)continue;
        p.age+=dt;
        const steps=Math.max(1,Math.ceil(p.velocity.length()*dt/.2)),step=dt/steps;
        for(let i=0;i<steps;i++) {
          p.position.addScaledVector(p.velocity,step);
          const id=this.world.getVoxel(Math.floor(p.position.x),Math.floor(p.position.y),Math.floor(p.position.z));
          if(id!==BLOCKS.AIR){p.targetY=p.position.y;break;}
        }
        p.mesh.position.copy(p.position);
        if (p.isDragonBreathBall && !p.breathCreated && (p.position.y <= p.targetY || p.age > 4.0)) {
          p.breathCreated=true;
          p.age = 999;
          this.createDragonBreathCloud(p.position);
          p.mesh.removeFromParent();p.mesh.geometry?.dispose();p.mesh.material?.dispose();
          this.mobManager.customProjectiles.splice(this.mobManager.customProjectiles.indexOf(p),1);
        }
      }
    }

    // Update lingering clouds
    const remaining = [];
    for (let i = 0; i < this.dragonBreathClouds.length; i++) {
      const cloud = this.dragonBreathClouds[i];
      cloud.age += dt;

      // Damage player inside cloud
      cloud.damageCooldown=Math.max(0,(cloud.damageCooldown??0)-dt);
      if (player && !['creative','spectator'].includes(player.gamemode) && cloud.position.distanceTo(player.position) < cloud.radius && cloud.damageCooldown<=0) {
        player.takeDamage?.(3,cloud.position,'dragon_breath');
        cloud.damageCooldown=.5;
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
    this.mobManager.dragonBreathClouds=this.dragonBreathClouds;
    createDragonBreathCloud(this.mobManager,pos);
  }

  onDragonDefeated() {
    const state=endStateFor(this.world);
    if(state.defeated)return;
    state.defeated=true;state.health=0;
    const xp=state.kills===0?12000:500;
    state.kills++;
    this.ui?.removeBossBar?.('ender_dragon');this.sounds?.playVictoryFanfare?.();
    const position=new THREE.Vector3(0,this.podiumY()+3,0);
    if(this.entities?.spawnXpOrbs)this.entities.spawnXpOrbs(position,xp);
    else this.mobManager.spawnXpOrbs?.(position,xp);
    this.activateEndExitPortal(true);
    this.enderDragon=null;
  }

  activateEndExitPortal(newDefeat=true) {
    const state=endStateFor(this.world),canvas=new CellCanvas();
    buildPodium(canvas,this.podiumY(),{active:true,egg:newDefeat&&state.kills===1});
    writeEndCanvas(this.world,canvas);
    const order=gatewayOrder(this.world.seed),opened=state.gateways.filter(g=>Math.hypot(g.x,g.z)<1000).length;
    if(newDefeat&&opened<order.length){const g=order[opened];addEndGateway(this.world,g.x,g.y,g.z);}
  }
}
