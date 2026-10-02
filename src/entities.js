import * as THREE from 'three';
import { applyHeat } from './heat.js';
import { waterHeight, waterCurrent } from './waterGeometry.js';
import { ItemVisuals, getBlockDrop } from './itemVisuals.js';
import { createBlockGeometry } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { addPlayerExperience } from './experience.js';

export class EntityManager {
  constructor(scene, world, sounds, textures = null) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.textures = textures;
    this.itemVisuals = new ItemVisuals(textures);
    if(world.lava)world.lava.onIgniteTNT=(x,y,z)=>this.spawnPrimedTNT(new THREE.Vector3(x,y,z));
    this.blastLight = new THREE.PointLight(0xffb351, 0, 16, 1);
    this.scene.add(this.blastLight);
    this.blastLife = 0;
    this.droppedItems = [];
    this.tntEntities = [];
    this.particles = [];
    this.fireworkRockets = [];
    this.xpOrbs = [];
  }

  // Spawn purple/magenta Enderman portal particles
  spawnEndermanParticles(pos, count = 20) {
    const purpleShades = [0x9333ea, 0xa855f7, 0xc084fc, 0xd946ef, 0xec4899];
    for (let i = 0; i < count; i++) {
      const color = purpleShades[Math.floor(Math.random() * purpleShades.length)];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 0.08),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 0.9
      ));
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          Math.random() * 1.5 + 0.5,
          (Math.random() - 0.5) * 1.2
        ),
        life: 0.8 + Math.random() * 0.6,
        maxLife: 1.4,
        fade: true
      });
    }
  }

  // Spawn vibrant green sparkle Bone Meal particles
  spawnBoneMealParticles(pos, count = 18) {
    const greenShades = [0x22c55e, 0x4ade80, 0x86efac, 0x16a34a, 0xa3e635, 0xffffff];
    for (let i = 0; i < count; i++) {
      const color = greenShades[Math.floor(Math.random() * greenShades.length)];
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      );
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        Math.random() * 0.6 + 0.1,
        (Math.random() - 0.5) * 0.8
      ));
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.6,
          Math.random() * 1.0 + 0.4,
          (Math.random() - 0.5) * 0.6
        ),
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        fade: true
      });
    }
  }

  // Spawn a Firework Rocket that shoots into the sky and bursts into colorful sparks
  spawnFireworkRocket(pos, targetHeight = null, colors = null) {
    const startY = pos.y;
    const burstY = targetHeight || (startY + 22 + Math.random() * 14);
    const fireworkColors = colors || [0xff2244, 0xffd700, 0x00f0ff, 0x33ff66, 0xd946ef, 0xffffff, 0xff8800];

    const rocketGeo = new THREE.BoxGeometry(0.12, 0.35, 0.12);
    const rocketMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    mesh.position.copy(pos);
    this.scene.add(mesh);

    if (this.sounds?.playFireworkLaunch) {
      this.sounds.playFireworkLaunch();
    }

    this.fireworkRockets.push({
      mesh,
      targetY: burstY,
      speed: 24 + Math.random() * 6,
      colors: fireworkColors,
      trailTimer: 0
    });
  }

  // Launch a celebratory volley of tournament fireworks across the arena
  launchTournamentFireworks(centerPos = new THREE.Vector3(0, 24, 0), count = 6) {
    const arenaColors = [
      [0xff0044, 0xffd700, 0xffffff],
      [0x00ffff, 0x3b82f6, 0x60a5fa],
      [0xa855f7, 0xec4899, 0xf43f5e],
      [0x22c55e, 0x10b981, 0xfacc15],
      [0xf97316, 0xeab308, 0xffffff]
    ];

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 22,
          0,
          (Math.random() - 0.5) * 22
        );
        const startPos = centerPos.clone().add(offset);
        const burstHeight = startPos.y + 24 + Math.random() * 16;
        const colorSet = arenaColors[Math.floor(Math.random() * arenaColors.length)];
        this.spawnFireworkRocket(startPos, burstHeight, colorSet);
      }, i * 220 + Math.random() * 100);
    }
  }

  // Spawn spinning dropped item in 3D world
  spawnDroppedItem(pos, itemType, isBlock = true, count = 1, options = {}) {
    const group = new THREE.Group();
    const mesh = this.itemVisuals.create(itemType, isBlock);
    group.add(mesh);
    group.position.copy(pos);
    this.scene.add(group);

    this.droppedItems.push({
      group: group,
      itemType: itemType,
      isBlock: isBlock,
      count: count,
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        3.5,
        (Math.random() - 0.5) * 2
      ),
      age: 0,
      enchantments: options.enchantments ? structuredClone(options.enchantments) : null,
      pickupDelay: options.pickupDelay ?? 1.0
    });
  }

  // Spawn glowing XP orb entity
  spawnXpOrb(pos, value = 1) {
    const geo = new THREE.DodecahedronGeometry(0.12, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88ff00,
      transparent: true,
      opacity: 0.95
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.2,
      0.1 + Math.random() * 0.2,
      (Math.random() - 0.5) * 0.2
    ));
    this.scene.add(mesh);

    const orb = {
      mesh,
      value: Math.max(1, Math.floor(value)),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 2.0,
        Math.random() * 2.5 + 1.5,
        (Math.random() - 0.5) * 2.0
      ),
      age: 0,
      pickupDelay: 0.5,
      grounded: false
    };

    this.xpOrbs.push(orb);
    return orb;
  }

  // Spawn multiple XP orbs totaling totalXp
  spawnXpOrbs(pos, totalXp = 1) {
    if (totalXp <= 0) return;
    let remaining = Math.floor(totalXp);
    while (remaining > 0) {
      const take = Math.min(remaining, Math.random() < 0.4 ? 1 : (Math.random() < 0.5 ? 2 : 3));
      this.spawnXpOrb(pos, take);
      remaining -= take;
    }
  }

  spawnDeathParticles(pos) {
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.8 }));
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.7, (Math.random() - 0.5) * 0.8));
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.6 + Math.random(), (Math.random() - 0.5) * 0.8), life: 0.6, death: true });
    }
  }

  // Spawn Primed TNT
  spawnPrimedTNT(pos, onExplodeCallback) {
    const geo = this.textures ? createBlockGeometry(BLOCKS.TNT, this.textures) : new THREE.BoxGeometry(1, 1, 1);
    if (this.textures) geo.translate(-0.5, -0.5, -0.5);
    const mat = this.textures ? this.textures.opaqueMaterial.clone() : new THREE.MeshLambertMaterial({ color: 0xff3333 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0.5, 0.5, 0.5));
    this.scene.add(mesh);

    mesh.castShadow = mesh.receiveShadow = true;
    this.sounds.playBowShoot(); // fuse hiss/ignite

    this.tntEntities.push({
      mesh: mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 4.0, (Math.random() - 0.5) * 1.5),
      timer: 3.2,
      smokeTimer: 0,
      onExplode: onExplodeCallback
    });
  }

  // Spawn block breaking debris particles
  spawnBlockParticles(pos, blockId) {
    const count = 14;
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const def = BLOCK_DEFS[blockId];
    let col = 0x888888;
    if (blockId === BLOCKS.GRASS) col = 0x5b8e3a;
    else if (blockId === BLOCKS.DIRT) col = 0x866043;
    else if (blockId === BLOCKS.OAK_LOG || blockId === BLOCKS.OAK_PLANKS) col = 0x8f6a45;
    else if (blockId === BLOCKS.OAK_LEAVES) col = 0x336622;
    else if (blockId === BLOCKS.SAND) col = 0xddcc99;
    else if (blockId === BLOCKS.DIAMOND_ORE) col = 0x4eeddd;

    const mat = new THREE.MeshLambertMaterial({ color: col });

    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(geo, mat);
      p.position.set(
        pos.x + 0.5 + (Math.random() - 0.5) * 0.6,
        pos.y + 0.5 + (Math.random() - 0.5) * 0.6,
        pos.z + 0.5 + (Math.random() - 0.5) * 0.6
      );
      this.scene.add(p);

      this.particles.push({
        mesh: p,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 4,
          Math.random() * 3 + 1,
          (Math.random() - 0.5) * 4
        ),
        life: 0.7
      });
    }
  }

  updateHeat(dt,player) {
    if(!player?.position)return;
    applyHeat(this.world,player,player.position,dt,n=>player.takeDamage?.(n));
  }

  spawnSmoke(pos, size = 0.5, life = 1.8) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 1),
      new THREE.MeshLambertMaterial({ color: 0x77716b, transparent: true, opacity: 0.6, depthWrite: false }));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5, (Math.random() - 0.5) * 1.5), life, maxLife: life, smoke: true, growth: 1.4 });
  }

  spawnFurnaceParticles(pos) {
    // Subtle rising smoke
    if (Math.random() < 0.45) {
      const smokeOffset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.5 + Math.random() * 0.3,
        (Math.random() - 0.5) * 0.4
      );
      this.spawnSmoke(pos.clone().add(smokeOffset), 0.08 + Math.random() * 0.06, 0.8 + Math.random() * 0.5);
    }
    // Fire sparks from burning fuel
    const sparkCount = 1 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < sparkCount; i++) {
      const col = Math.random() < 0.5 ? 0xff7700 : (Math.random() < 0.5 ? 0xffaa00 : 0xff3300);
      const sparkGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
      const sparkMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95 });
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,
        0.1 + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.5
      ));
      this.scene.add(spark);
      this.particles.push({
        mesh: spark,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          0.8 + Math.random() * 0.9,
          (Math.random() - 0.5) * 0.5
        ),
        life: 0.45 + Math.random() * 0.3,
        maxLife: 0.75,
        spark: true
      });
    }
  }

  spawnBlastDebris(pos, blockId, center) {
    if (!this.textures) return;
    const mesh = this.itemVisuals.create(blockId, true, 0.10 + Math.random() * 0.13);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    this.scene.add(mesh);
    const velocity = pos.clone().sub(center).normalize().multiplyScalar(4 + Math.random() * 4);
    velocity.y += 3;
    this.particles.push({ mesh, velocity, life: 0.7 + Math.random() * 0.4, sharedMaterial: true });
  }

  spawnExplosion(center) {
    this.blastLight.position.copy(center);
    this.blastLife = 0.3;
    this.blastLight.intensity = 12;
    // A brief hot core, expanding pressure ring, then rising billows and sparks.
    for (const ring of [false, true]) {
      const mesh = new THREE.Mesh(ring ? new THREE.RingGeometry(0.85, 1, 48) : new THREE.IcosahedronGeometry(0.7, 2),
        new THREE.MeshBasicMaterial({ color: ring ? 0xffd59a : 0xffedbd, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      mesh.position.copy(center);
      if (ring) mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      const life = ring ? 0.45 : 0.22;
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life, maxLife: life, blast: true, growth: ring ? 14 : 9 });
    }
    for (let i = 0; i < 18; i++) {
      const offset = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * 2);
      this.spawnSmoke(center.clone().add(offset), 0.35 + Math.random() * 0.4, 1.3 + Math.random() * 1.2);
      this.particles.at(-1).velocity.addScaledVector(offset, 2);
    }
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.18),
        new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffc14d : 0xff672d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      mesh.position.copy(center);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 8);
      velocity.y += 2;
      this.particles.push({ mesh, velocity, life: 0.6 + Math.random() * 0.5, maxLife: 1.1, spark: true });
    }
  }

  update(dt, player, inventory) {
    dt = Math.min(dt, 0.1);
    this.blastLife = Math.max(0, this.blastLife - dt);
    this.blastLight.intensity = 12 * (this.blastLife / 0.3) ** 2;
    this.updateHeat(dt,player);
    // 1. Update Dropped Items
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const item = this.droppedItems[i];
      item.age += dt;
      const contact=this.world.getVoxel(Math.floor(item.group.position.x),Math.floor(item.group.position.y),Math.floor(item.group.position.z));
      if(contact===BLOCKS.LAVA||contact===BLOCKS.FIRE){this.itemVisuals.release(item.group);this.droppedItems.splice(i,1);continue;}

      // Small steps keep loot from tunneling through the ground or a wall.
      const steps = Math.max(1, Math.ceil(dt / 0.016));
      const step = dt / steps, radius = 0.18;
      const solid = (x, y, z) => {
        const def = BLOCK_DEFS[this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z))];
        return def && def.solid !== false && !def.plant;
      };
      for (let j = 0; j < steps; j++) {
        const pos = item.group.position;
        if (item.grounded && !solid(pos.x, pos.y - radius - 0.03, pos.z)) item.grounded = false;
        const wx=Math.floor(pos.x), wy=Math.floor(pos.y), wz=Math.floor(pos.z);
        const waterY=this.world.getVoxel(wx,wy,wz)===BLOCKS.WATER?wy:wy-1;
        const surface=waterY+waterHeight(this.world,wx,waterY,wz);
        if(this.world.getVoxel(wx,waterY,wz)===BLOCKS.WATER && pos.y-radius<surface) {
          item.grounded=false;
          const flow=waterCurrent(this.world,wx,waterY,wz);
          item.velocity.x+=(flow.x*1.2-item.velocity.x)*Math.min(1,step*4);
          item.velocity.z+=(flow.z*1.2-item.velocity.z)*Math.min(1,step*4);
          item.velocity.y+=(Math.min(2,(surface+.08-pos.y)*7)-item.velocity.y)*Math.min(1,step*7);
        } else if (!item.grounded) item.velocity.y -= 18 * step;
        for (const axis of ['x', 'z']) {
          const next = pos.clone(); next[axis] += item.velocity[axis] * step;
          const edge = next.clone(); edge[axis] += Math.sign(item.velocity[axis]) * radius;
          if (solid(edge.x, edge.y, edge.z)) item.velocity[axis] *= -0.25;
          else pos[axis] = next[axis];
        }
        const nextY = pos.y + item.velocity.y * step;
        if (item.velocity.y <= 0 && solid(pos.x, nextY - radius, pos.z)) {
          pos.y = Math.floor(nextY - radius) + 1 + radius;
          item.velocity.set(0, 0, 0); item.grounded = true;
        } else if (item.velocity.y > 0 && solid(pos.x, nextY + radius, pos.z)) {
          item.velocity.y = 0;
        } else pos.y = nextY;
      }

      // Spin & Bob
      item.group.rotation.y += 2.5 * dt;
      item.group.children[0].position.y = 0.06 + Math.sin(item.age * 3) * 0.045;

      // Pickup detection
      const playerPos = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const dist = item.group.position.distanceTo(playerPos);

      if (dist < 1.6 && item.age > item.pickupDelay) {
        // Collect into inventory
        let added = 0;
        // Single-item transactions avoid duplicating a partially accepted stack.
        while (item.count > 0 && inventory.addItem(item.itemType, item.isBlock, 1, item.enchantments)) { item.count--; added++; }
        if (added > 0) {
          this.sounds.playClick();
          this.onItemPickup?.(item.itemType, added);
        }
        if (item.count === 0) {
          this.itemVisuals.release(item.group);
          this.droppedItems.splice(i, 1);
        }
      }
    }

    // 1b. Update XP Orbs (Magnetism, physics, and collection)
    const playerTarget = player?.position ? player.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : null;
    for (let i = this.xpOrbs.length - 1; i >= 0; i--) {
      const orb = this.xpOrbs[i];
      orb.age += dt;

      // Pulse color between yellow-green, lime, and bright yellow
      if (orb.mesh.material) {
        const hue = 0.22 + Math.sin(orb.age * 10) * 0.08;
        orb.mesh.material.color.setHSL(hue, 1.0, 0.55);
      }
      orb.mesh.rotation.x += 4 * dt;
      orb.mesh.rotation.y += 5 * dt;

      // Player magnet attraction (within 7.5 blocks)
      let attracted = false;
      if (playerTarget && !player.isDead) {
        const dist = orb.mesh.position.distanceTo(playerTarget);

        // Pickup detection (< 1.25 blocks)
        if (dist < 1.25 && orb.age > orb.pickupDelay) {
          addPlayerExperience(player, orb.value, this.sounds, this.ui || player.ui);
          if (this.sounds?.playXpPickup) {
            this.sounds.playXpPickup(0.8 + Math.random() * 0.5);
          }
          this.scene.remove(orb.mesh);
          orb.mesh.geometry?.dispose();
          orb.mesh.material?.dispose();
          this.xpOrbs.splice(i, 1);
          continue;
        }

        if (dist < 7.5) {
          attracted = true;
          const pull = playerTarget.clone().sub(orb.mesh.position).normalize();
          const speed = (1 - dist / 7.5) * 11 + 3.5;
          orb.velocity.lerp(pull.multiplyScalar(speed), dt * 6.5);
          orb.mesh.position.addScaledVector(orb.velocity, dt);
        }
      }

      // Physics when not magnetically flying
      if (!attracted) {
        // Gravity
        orb.velocity.y -= 18 * dt;

        // Ground check
        const nextY = orb.mesh.position.y + orb.velocity.y * dt;
        const bx = Math.floor(orb.mesh.position.x);
        const by = Math.floor(nextY - 0.1);
        const bz = Math.floor(orb.mesh.position.z);
        const block = this.world.getVoxel(bx, by, bz);
        const def = BLOCK_DEFS[block];
        const isSolid = def && def.solid !== false && !def.plant;

        if (isSolid && orb.velocity.y <= 0) {
          orb.mesh.position.y = by + 1.12;
          orb.velocity.set(0, 0, 0);
          orb.grounded = true;
        } else {
          orb.mesh.position.y = nextY;
          orb.mesh.position.x += orb.velocity.x * dt;
          orb.mesh.position.z += orb.velocity.z * dt;
          orb.velocity.x *= Math.exp(-2.5 * dt);
          orb.velocity.z *= Math.exp(-2.5 * dt);
        }
      }

      // Despawn after 5 minutes (300s) like vanilla Minecraft
      if (orb.age > 300) {
        this.scene.remove(orb.mesh);
        orb.mesh.geometry?.dispose();
        orb.mesh.material?.dispose();
        this.xpOrbs.splice(i, 1);
      }
    }

    // 2. Update Primed TNT
    for (let i = this.tntEntities.length - 1; i >= 0; i--) {
      const tnt = this.tntEntities[i];
      tnt.timer -= dt;

      // Gravity
      tnt.velocity.y -= 20 * dt;
      tnt.mesh.position.addScaledVector(tnt.velocity, dt);

      // Floor check
      const bY = Math.floor(tnt.mesh.position.y - 0.5);
      const b = this.world.getVoxel(Math.floor(tnt.mesh.position.x), bY, Math.floor(tnt.mesh.position.z));
      if (b !== BLOCKS.AIR && b !== BLOCKS.WATER) {
        tnt.mesh.position.y = bY + 1.5;
        tnt.velocity.set(0, 0, 0);
      }

      // Flash & swell animation
      const flash = Math.sin(tnt.timer * 16) > 0;
      tnt.mesh.material.emissive.setHex(flash ? 0xffffff : 0x000000);
      tnt.mesh.material.emissiveIntensity = flash ? 0.9 : 0;
      tnt.smokeTimer -= dt;
      if (tnt.smokeTimer <= 0) {
        tnt.smokeTimer = 0.1;
        this.spawnSmoke(tnt.mesh.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.10, 0.65);
      }
      const scale = 1.0 + (3.2 - tnt.timer) * 0.08;
      tnt.mesh.scale.set(scale, scale, scale);

      // Explode!
      if (tnt.timer <= 0) {
        this.sounds.playExplosion();
        const center = tnt.mesh.position.clone();
        this.scene.remove(tnt.mesh);
        tnt.mesh.geometry.dispose(); tnt.mesh.material.dispose();
        this.spawnExplosion(center);
        this.tntEntities.splice(i, 1);

        // Explode blocks in 3.5 radius
        const radius = 3.5;
        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);

        let debris = 0;
        for (let x = cx - 4; x <= cx + 4; x++) {
          for (let y = cy - 4; y <= cy + 4; y++) {
            for (let z = cz - 4; z <= cz + 4; z++) {
              const d = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2 + (z - center.z) ** 2);
              if (d <= radius) {
                const voxel = this.world.getVoxel(x, y, z);
                if (voxel !== BLOCKS.AIR && voxel !== BLOCKS.BEDROCK) {
                  this.world.setVoxel(x, y, z, BLOCKS.AIR);
                  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
                  if (debris++ < 24) this.spawnBlastDebris(pos, voxel, center);
                  const drop = getBlockDrop(voxel);
                  if (drop && Math.random() < 0.25) this.spawnDroppedItem(pos, drop.id, drop.isBlock, 1);
                }
              }
            }
          }
        }

        // Damage player if in blast radius
        const distToPlayer = center.distanceTo(player.position);
        if (distToPlayer < 7.0) {
          const dmg = Math.floor((1 - distToPlayer / 7.0) * 16);
          player.takeDamage(dmg);
        }

        if (tnt.onExplode) tnt.onExplode(center);
      }
    }

    // 3. Update Firework Rockets
    for (let i = this.fireworkRockets.length - 1; i >= 0; i--) {
      const rocket = this.fireworkRockets[i];
      rocket.mesh.position.y += rocket.speed * dt;
      rocket.trailTimer = (rocket.trailTimer || 0) + dt;

      // Spark trail
      if (rocket.trailTimer >= 0.04) {
        rocket.trailTimer = 0;
        const trailMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.85 });
        const trail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), trailMat);
        trail.position.copy(rocket.mesh.position).add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          -0.2,
          (Math.random() - 0.5) * 0.1
        ));
        this.scene.add(trail);
        this.particles.push({
          mesh: trail,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, -1.5, (Math.random() - 0.5) * 0.5),
          life: 0.35,
          maxLife: 0.35,
          fade: true
        });
      }

      // Detonate at target height
      if (rocket.mesh.position.y >= rocket.targetY) {
        if (this.sounds?.playFireworkExplode) {
          this.sounds.playFireworkExplode();
        }

        const center = rocket.mesh.position.clone();
        const sparkCount = 50 + Math.floor(Math.random() * 20);
        const colorPalette = rocket.colors;

        for (let s = 0; s < sparkCount; s++) {
          const col = colorPalette[Math.floor(Math.random() * colorPalette.length)];
          const sparkGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
          const sparkMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1.0 });
          const spark = new THREE.Mesh(sparkGeo, sparkMat);
          spark.position.copy(center);
          this.scene.add(spark);

          // Spherical burst velocity
          const phi = Math.acos(2 * Math.random() - 1);
          const theta = Math.random() * Math.PI * 2;
          const speed = 4.0 + Math.random() * 7.5;
          const vx = Math.sin(phi) * Math.cos(theta) * speed;
          const vy = Math.cos(phi) * speed + 1.5;
          const vz = Math.sin(phi) * Math.sin(theta) * speed;

          this.particles.push({
            mesh: spark,
            velocity: new THREE.Vector3(vx, vy, vz),
            life: 1.2 + Math.random() * 0.8,
            maxLife: 2.0,
            spark: true,
            fade: true
          });
        }

        this.scene.remove(rocket.mesh);
        rocket.mesh.geometry?.dispose();
        rocket.mesh.material?.dispose();
        this.fireworkRockets.splice(i, 1);
      }
    }

    // 4. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;

      if (p.smoke) {
        p.velocity.multiplyScalar(Math.exp(-1.4 * dt)); p.velocity.y += dt * 0.8;
        p.mesh.scale.addScalar(dt * p.growth);
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * 0.6;
      } else if (p.blast) {
        p.mesh.scale.addScalar(dt * p.growth);
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife);
      } else if (p.spark) {
        p.velocity.x *= Math.exp(-2.2 * dt);
        p.velocity.z *= Math.exp(-2.2 * dt);
        p.velocity.y -= 4.5 * dt; // gentle gravity for sparks
        if (p.mesh.material) {
          const ratio = Math.max(0, p.life / (p.maxLife || 1.6));
          p.mesh.material.opacity = ratio;
          // Sparkle flicker
          if (Math.random() < 0.2) p.mesh.material.opacity = Math.min(1.0, ratio * 1.5);
        }
      } else if (p.death) {
        p.velocity.y -= 0.5 * dt;
        if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.life / 0.6) * 0.8;
      } else if (p.fade) {
        p.velocity.y -= 1.0 * dt;
        if (p.mesh.material) p.mesh.material.opacity = Math.max(0, p.life / (p.maxLife || 1.0));
      } else {
        p.velocity.y -= 16 * dt;
      }

      p.mesh.position.addScaledVector(p.velocity, dt);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.sharedMaterial) p.mesh.traverse(child => child.geometry?.dispose());
        else p.mesh.geometry?.dispose();
        if (!p.sharedMaterial) p.mesh.material?.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
