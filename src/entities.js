import * as THREE from 'three';
import { applyHeat } from './heat.js';
import { waterHeight, waterCurrent } from './waterGeometry.js';
import { ItemVisuals, getBlockDrop } from './itemVisuals.js';
import { createBlockGeometry } from './blockGeometry.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { isDestroyedByExplosion, explosionBlocks, TNT_EXPLOSION_POWER } from './blockHarvestData.js';
import { addPlayerExperience } from './experience.js';
import { isFireproof } from './smithing.js';
import { CombatParticles } from './combatParticles.js';

/**
 * How bright an explosion's glow is: fading over its 0.35 s life, scaled by its power, and by how near the player is --
 * full within 4 blocks, nothing beyond 28. Without a position (the moment of the blast) it is at full strength.
 */
export function blastGlow(life, scale, playerPosition, center) {
  if (!(life > 0)) return 0;
  const near = playerPosition ? Math.min(1, Math.max(0, 1 - (playerPosition.distanceTo(center) - 4) / 24)) : 1;
  return 2.4 * scale * (life / 0.35) ** 2 * near;
}

// An explosion's materials, one function each, so the ones compiled in advance (EntityManager.prewarm) are the very ones
// an explosion makes: a shader program is chosen by a material's settings, and a different one would compile anew.
const blastMaterial = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const smokeMaterial = (color, opacity) => new THREE.MeshLambertMaterial({ color, transparent: true, opacity, depthWrite: false });
const sparkMaterial = (color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
// One geometry for every puff of smoke and one for every spark, sized by the mesh's scale: each explosion made some 90 of
// its own, every one uploaded to the GPU in the frame after the blast and thrown away a second later.
const PUFF_GEOMETRY = new THREE.IcosahedronGeometry(1, 1);
const SPARK_GEOMETRY = new THREE.BoxGeometry(0.08, 0.08, 0.2);

/** Item (entity): 6000 game ticks. */
export const ITEM_DESPAWN_SECONDS = 300;

export class EntityManager {
  constructor(scene, world, sounds, textures = null) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.textures = textures;
    this.itemVisuals = new ItemVisuals(textures);
    if (world?.lava) world.lava.onIgniteTNT = (x, y, z) => this.spawnPrimedTNT(new THREE.Vector3(x, y, z));
    // The flash of an explosion: an ambient glow, brighter the nearer the blast. It was a point light hidden until
    // something exploded -- but a point light appearing or disappearing changes the number of lights every lit
    // material's shader is compiled for, so each explosion recompiled every shader in view twice (a frame of up to
    // 1.7 s after a creeper blew up), and again on the next explosion, as three.js frees programs no material uses.
    // Ambient lights are summed into one uniform: no shader depends on how many there are, or on this one's intensity,
    // and an idle one at zero costs nothing per pixel.
    this.blastLight = new THREE.AmbientLight(0xffb351, 0);
    this.blastCenter = new THREE.Vector3();
    this.blastScale = 1;
    this.scene.add(this.blastLight);
    this.blastLife = 0;
    this.droppedItems = [];
    this.tntEntities = [];
    this.particles = [];
    // Crit stars, damage hearts and sweeps of melee hits (combatParticles.js).
    this.combatParticles = new CombatParticles(scene);
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
      velocity: options.velocity ? options.velocity.clone() : new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        3.5,
        (Math.random() - 0.5) * 2
      ),
      age: 0,
        enchantments: options.enchantments ? structuredClone(options.enchantments) : null,
        ...(options.itemData?{itemData:structuredClone(options.itemData)}:{}),
      ...(options.durability!==undefined?{durability:options.durability}:{}),
      // Wiki (Item (entity)): "a delay of 10 ticks (half a second) between appearing and being able to be picked up,
      // or 40 ticks (2 seconds) if thrown by a player".
      pickupDelay: options.pickupDelay ?? (options.thrownByPlayer ? 2.0 : 0.5),
      ...(options.thrownByPlayer ? { thrownByPlayer: true } : {})
    });
    return this.droppedItems[this.droppedItems.length - 1];
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

  /**
   * Compile an explosion's shaders before the first one goes off, and keep them. The first creeper of a session stalled
   * a frame for half a second or more compiling them; and as three.js deletes a program once no material uses it, they
   * could be thrown away between explosions and compiled again. So one tiny, all but invisible mesh of each kind is drawn
   * in front of the camera for a few frames -- drawn, not just compiled, because the world is drawn into the shader's
   * and the water's own targets, whose colour handling is part of each program -- and their materials are never
   * disposed, so the programs stay.
   * @returns {boolean} whether it started
   */
  prewarm(camera) {
    if (this.prewarmed || !camera) return false;
    this.prewarmed = true;
    const group = new THREE.Group();
    const box = new THREE.BoxGeometry(0.02, 0.02, 0.02);
    this.warmMaterials = [blastMaterial(0x000000), smokeMaterial(0xffffff, 0.001), sparkMaterial(0x000000)];
    for (const material of this.warmMaterials) group.add(new THREE.Mesh(box, material));
    // The blast's flying debris and the drops it leaves are item visuals, on the shared textured block material: the
    // last shader the first explosion compiled, and the atlas it first uploaded.
    if (this.textures) {
      this.warmVisuals = [this.itemVisuals.create(BLOCKS.DIRT, true, 0.02), this.itemVisuals.create('stick', false, 0.02)].filter(Boolean);
      for (const visual of this.warmVisuals) group.add(visual);
    }
    group.position.copy(camera.position).add(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.5));
    this.scene.add(group);
    this.warmGroup = group;
    this.warmFrames = 3;
    return true;
  }

  spawnExplosion(center, power = 3) {
    const scale = Math.max(0.5, power / 3);
    this.blastCenter.copy(center);
    this.blastScale = scale;
    this.blastLife = 0.35;
    this.blastLight.intensity = blastGlow(this.blastLife, scale, null, center);

    // A brief hot core and expanding shockwave ring
    for (const ring of [false, true]) {
      const mesh = new THREE.Mesh(
        ring ? new THREE.RingGeometry(0.85 * scale, 1.1 * scale, 48) : new THREE.IcosahedronGeometry(0.8 * scale, 2),
        blastMaterial(ring ? 0xffdfaa : 0xfffae0)
      );
      mesh.position.copy(center);
      if (ring) mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
      const life = ring ? 0.45 : 0.25;
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life, maxLife: life, blast: true, growth: (ring ? 15 : 10) * scale });
    }

    // Iconic Minecraft billowing white and light-gray explosion cloud sphere (huge_explosion / poof)
    const cloudColors = [0xffffff, 0xf8fafc, 0xf1f5f9, 0xe2e8f0, 0xd1d5db, 0x94a3b8];
    const cloudCount = Math.floor(45 * scale);
    for (let i = 0; i < cloudCount; i++) {
      const radius = (0.35 + Math.random() * 0.5) * scale;
      const color = cloudColors[Math.floor(Math.random() * cloudColors.length)];
      const mesh = new THREE.Mesh(PUFF_GEOMETRY, smokeMaterial(color, 0.92));
      mesh.scale.setScalar(radius);
      const dir = new THREE.Vector3().randomDirection();
      const dist = Math.random() * 1.2 * scale;
      mesh.position.copy(center).addScaledVector(dir, dist);
      this.scene.add(mesh);

      const speed = (2.0 + Math.random() * 5.5) * scale;
      const velocity = dir.clone().multiplyScalar(speed);
      velocity.y += (0.8 + Math.random() * 1.6) * scale;
      const life = 0.7 + Math.random() * 0.6;
      this.particles.push({
        mesh,
        velocity,
        life,
        maxLife: life,
        smoke: true,
        baseOpacity: 0.92,
        growth: (1.8 + Math.random() * 1.6) * scale,
        size: radius,
        sharedGeometry: true,
      });
    }

    // Trailing dark smoke puffs on outer edges
    const darkColors = [0x64748b, 0x475569, 0x334155];
    const darkCount = Math.floor(16 * scale);
    for (let i = 0; i < darkCount; i++) {
      const color = darkColors[Math.floor(Math.random() * darkColors.length)];
      const size = (0.3 + Math.random() * 0.35) * scale;
      const mesh = new THREE.Mesh(PUFF_GEOMETRY, smokeMaterial(color, 0.7));
      mesh.scale.setScalar(size);
      const dir = new THREE.Vector3().randomDirection();
      mesh.position.copy(center).addScaledVector(dir, (0.5 + Math.random() * 1.5) * scale);
      this.scene.add(mesh);

      const velocity = dir.clone().multiplyScalar((1.5 + Math.random() * 3.5) * scale);
      velocity.y += (1.2 + Math.random() * 2.0) * scale;
      const life = 0.9 + Math.random() * 0.7;
      this.particles.push({
        mesh,
        velocity,
        life,
        maxLife: life,
        smoke: true,
        baseOpacity: 0.7,
        growth: 1.2 * scale,
        size,
        sharedGeometry: true,
      });
    }

    // Fiery flying sparks
    const sparkCount = Math.floor(32 * scale);
    const sparkColors = [0xffd166, 0xf97316, 0xef4444, 0xfef08a, 0xffedd5];
    for (let i = 0; i < sparkCount; i++) {
      const col = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      const mesh = new THREE.Mesh(SPARK_GEOMETRY, sparkMaterial(col));
      mesh.scale.setScalar(scale);
      mesh.position.copy(center);
      this.scene.add(mesh);
      const velocity = new THREE.Vector3().randomDirection().multiplyScalar((5 + Math.random() * 9) * scale);
      velocity.y += (2 + Math.random() * 3) * scale;
      this.particles.push({ mesh, velocity, life: 0.6 + Math.random() * 0.6, maxLife: 1.2, spark: true, sharedGeometry: true });
    }
  }

  update(dt, player, inventory) {
    this.combatParticles?.update(dt);
    // The explosion shaders' warm-up (prewarm): drawn a few frames, then gone, its materials kept.
    if (this.warmGroup && --this.warmFrames <= 0) {
      for (const visual of this.warmVisuals ?? []) this.itemVisuals.release(visual);
      this.warmGroup.removeFromParent();
      this.warmGroup = null;
    }
    dt = Math.min(dt, 0.1);
    this.blastLife = Math.max(0, this.blastLife - dt);
    this.blastLight.intensity = blastGlow(this.blastLife, this.blastScale, player?.position, this.blastCenter);
    this.updateHeat(dt,player);
    // 1. Update Dropped Items
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const item = this.droppedItems[i];
      item.age += dt;
      const contact=this.world.getVoxel(Math.floor(item.group.position.x),Math.floor(item.group.position.y),Math.floor(item.group.position.z));
      // Netherite survives lava and fire, as the wiki's netherite upgrade describes; everything else burns up.
      if((contact===BLOCKS.LAVA||contact===BLOCKS.FIRE)&&!isFireproof(item.itemType)){this.itemVisuals.release(item.group);this.droppedItems.splice(i,1);continue;}
      // Item (entity): "an item despawns after existing for 6000 game ticks (5 minutes)". Only XP orbs had the timer,
      // so every dropped item -- a death's whole inventory included -- stayed forever, and "collect your items within
      // 5 minutes" (The second day) was not a thing to hurry for. `age` counts only while the item's chunk updates.
      if(item.age>=ITEM_DESPAWN_SECONDS&&!item.noDespawn){this.itemVisuals.release(item.group);this.droppedItems.splice(i,1);continue;}

      // Small steps keep loot from tunneling through the ground or a wall.
      const steps = Math.max(1, Math.ceil(dt / 0.016));
      const step = dt / steps, radius = 0.18;
      const solid = (x, y, z) => {
        const def = BLOCK_DEFS[this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z))];
        // A pressure plate has no collision box: an item lies in it (and presses it), not on top of a full block.
        return def && def.solid !== false && !def.plant && !def.pressurePlate;
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

      // A dead player picks nothing up: the death drop used to fly straight back into the corpse's inventory a second
      // later, so "return to where you died" had nothing to find (Beginner's guide play-test).
      if (dist < 1.6 && item.age > item.pickupDelay && !player.isDead && !(player.health <= 0)) {
        // An item every player in a shared game can see is not taken here: `claim` asks whoever owns it (the host),
        // and the answer adds it to the inventory and removes it everywhere. Asked again after a while if unanswered.
        if (typeof item.claim === 'function') {
          if (!(item.claimedAt > item.age - 2)) { item.claimedAt = item.age; item.claim(item); }
          continue;
        }
        // Collect into inventory
        let added = 0;
        // Single-item transactions avoid duplicating a partially accepted stack.
        while (item.count > 0 && (item.itemData?inventory.addItem({...item.itemData,count:1}):inventory.addItem(item.itemType, item.isBlock, 1, item.enchantments))) { item.count--; added++; }
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
        if (dist < 1.25 && orb.age > orb.pickupDelay && !player.isDead && !(player.health <= 0)) {
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

        // Explode blocks in 3.5 radius. Which of them actually break is decided by blast
        // resistance, not by the radius alone -- see isDestroyedByExplosion. Blocks with no
        // resistance entry (bedrock and friends) are immune.
        const radius = 3.5;
        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);

        let debris = 0;
        // TNT that explodes in water breaks no blocks (Tutorial:Igniting TNT underwater: it works only inside sand or
        // gravel, where "the high blast resistance of water" no longer shields the blocks around it).
        const inWater = [BLOCKS.WATER, BLOCKS.BUBBLE_COLUMN].includes(this.world.getVoxel(cx, cy, cz));
        // The wiki's ray method: blocks in front shield the ones behind (explosionBlocks).
        if (!inWater) for (const hitBlock of explosionBlocks(this.world, center, TNT_EXPLOSION_POWER)) {
          {
            {
              const x = hitBlock.x, y = hitBlock.y, z = hitBlock.z, voxel = hitBlock.id;
              {
                {
                  this.world.setVoxel(x, y, z, BLOCKS.AIR);
                  const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
                  if (debris++ < 24) this.spawnBlastDebris(pos, voxel, center);
                  // Blast chamber: "TNT blasts ... drop all blocks broken as items as of Java Edition 1.14" (it was 25%).
                  const drop = getBlockDrop(voxel);
                  if (drop) this.spawnDroppedItem(pos, drop.id, drop.isBlock, 1);
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
        // A puff on the shared unit geometry is scaled to its size, so it grows in proportion to it.
        p.mesh.scale.addScalar(dt * p.growth * (p.size ?? 1));
        p.mesh.material.opacity = Math.max(0, p.life / p.maxLife) * (p.baseOpacity ?? 0.6);
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
        else if (!p.sharedGeometry) p.mesh.geometry?.dispose();
        if (!p.sharedMaterial) p.mesh.material?.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
