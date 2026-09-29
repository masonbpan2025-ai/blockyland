import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

export class EntityManager {
  constructor(scene, world, sounds) {
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.droppedItems = [];
    this.tntEntities = [];
    this.particles = [];
  }

  // Spawn spinning dropped item in 3D world
  spawnDroppedItem(pos, itemType, isBlock = true, count = 1, options = {}) {
    const group = new THREE.Group();
    let mesh;

    if (isBlock) {
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshLambertMaterial({ color: itemType === BLOCKS.WHITE_WOOL ? 0xf1eee4 : 0x88aa55 });
      mesh = new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.PlaneGeometry(0.35, 0.35);
      const tex = new THREE.TextureLoader().load(ITEMS[itemType] ? ITEMS[itemType].icon : '/assets/items/stick.png');
      tex.magFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      mesh = new THREE.Mesh(geo, mat);
    }

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
      pickupDelay: options.pickupDelay ?? 0.4
    });
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
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff3333 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0.5, 0.5, 0.5));
    this.scene.add(mesh);

    this.sounds.playBowShoot(); // fuse hiss/ignite

    this.tntEntities.push({
      mesh: mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 4.0, (Math.random() - 0.5) * 1.5),
      timer: 3.2,
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

  update(dt, player, inventory) {
    // 1. Update Dropped Items
    for (let i = this.droppedItems.length - 1; i >= 0; i--) {
      const item = this.droppedItems[i];
      item.age += dt;

      // Rest on the contact plane without repeatedly falling and snapping upward.
      const below = this.world.getVoxel(Math.floor(item.group.position.x), Math.floor(item.group.position.y - 0.15), Math.floor(item.group.position.z));
      if (item.grounded && (below === BLOCKS.AIR || below === BLOCKS.WATER)) item.grounded = false;
      if (!item.grounded) item.velocity.y -= 18 * dt;

      item.group.position.x += item.velocity.x * dt;
      item.group.position.z += item.velocity.z * dt;
      item.group.position.y += item.velocity.y * dt;

      // Floor collision
      const bX = Math.floor(item.group.position.x);
      const bY = Math.floor(item.group.position.y);
      const bZ = Math.floor(item.group.position.z);
      const block = this.world.getVoxel(bX, bY, bZ);

      if (block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
        item.group.position.y = bY + 1.1;
        item.velocity.set(0, 0, 0);
        item.grounded = true;
      }

      // Spin & Bob
      item.group.rotation.y += 2.5 * dt;
      item.group.children[0].position.y = Math.sin(item.age * 3) * 0.08;

      // Pickup detection
      const playerPos = player.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const dist = item.group.position.distanceTo(playerPos);

      if (dist < 1.6 && item.age > item.pickupDelay) {
        // Collect into inventory
        let added = 0;
        // Single-item transactions avoid duplicating a partially accepted stack.
        while (item.count > 0 && inventory.addItem(item.itemType, item.isBlock, 1)) { item.count--; added++; }
        if (added > 0) {
          this.sounds.playClick();
          this.onItemPickup?.(item.itemType, added);
        }
        if (item.count === 0) {
          this.scene.remove(item.group);
          item.group.traverse(child => { child.geometry?.dispose(); child.material?.map?.dispose(); child.material?.dispose(); });
          this.droppedItems.splice(i, 1);
        }
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
      const bY = Math.floor(tnt.mesh.position.y);
      const b = this.world.getVoxel(Math.floor(tnt.mesh.position.x), bY, Math.floor(tnt.mesh.position.z));
      if (b !== BLOCKS.AIR && b !== BLOCKS.WATER) {
        tnt.mesh.position.y = bY + 1;
        tnt.velocity.set(0, 0, 0);
      }

      // Flash & swell animation
      const flash = Math.sin(tnt.timer * 16) > 0;
      tnt.mesh.material.color.setHex(flash ? 0xffffff : 0xff2222);
      const scale = 1.0 + (3.2 - tnt.timer) * 0.08;
      tnt.mesh.scale.set(scale, scale, scale);

      // Explode!
      if (tnt.timer <= 0) {
        this.sounds.playExplosion();
        const center = tnt.mesh.position.clone();
        this.scene.remove(tnt.mesh);
        this.tntEntities.splice(i, 1);

        // Explode blocks in 3.5 radius
        const radius = 3.5;
        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);

        for (let x = cx - 4; x <= cx + 4; x++) {
          for (let y = cy - 4; y <= cy + 4; y++) {
            for (let z = cz - 4; z <= cz + 4; z++) {
              const d = Math.sqrt((x - center.x) ** 2 + (y - center.y) ** 2 + (z - center.z) ** 2);
              if (d <= radius) {
                const voxel = this.world.getVoxel(x, y, z);
                if (voxel !== BLOCKS.AIR && voxel !== BLOCKS.BEDROCK) {
                  this.world.setVoxel(x, y, z, BLOCKS.AIR);
                  if (Math.random() < 0.25) {
                    this.spawnDroppedItem(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), voxel, true, 1);
                  }
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

    // 3. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= (p.death ? 0.5 : 16) * dt;
      if (p.death) p.mesh.material.opacity = Math.max(0, p.life / 0.6) * 0.8;
      p.mesh.position.addScaledVector(p.velocity, dt);

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.death) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.particles.splice(i, 1);
      }
    }
  }
}
