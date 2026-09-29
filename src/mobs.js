import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { wanderMob, moveGroundMob } from './mobMotion.js';

// Helper to create box with UV mapping on a specific texture sheet
function createBoxWithUV(w, h, d, u, v, texW = 64, texH = 64, pw, ph, pd) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uvs = geo.attributes.uv;

  // Use texture pixel dimensions if specified, else scale from world units
  const tw = pw !== undefined ? pw : Math.round(w * 16);
  const th = ph !== undefined ? ph : Math.round(h * 16);
  const td = pd !== undefined ? pd : Math.round(d * 16);

  // Standard Minecraft UV layout for a box (width: tw, height: th, depth: td)
  // Row 1 (y = v): [empty: td] [top: tw] [bottom: tw]
  // Row 2 (y = v + td): [right: td] [front: tw] [left: td] [back: tw]
  const faceUVMap = [
    { x: u + td + tw, y: v + td, w: td, h: th },        // 0: Right (+X)
    { x: u, y: v + td, w: td, h: th },                // 1: Left (-X)
    { x: u + td, y: v, w: tw, h: td },                // 2: Top (+Y)
    { x: u + td + tw, y: v, w: tw, h: td },           // 3: Bottom (-Y)
    { x: u + td, y: v + td, w: tw, h: th },           // 4: Front (+Z)
    { x: u + td + tw + td, y: v + td, w: tw, h: th }  // 5: Back (-Z)
  ];

  for (let face = 0; face < 6; face++) {
    const f = faceUVMap[face];
    const u0 = f.x / texW;
    const u1 = (f.x + f.w) / texW;
    const v1 = 1.0 - (f.y / texH);
    const v0 = 1.0 - ((f.y + f.h) / texH);

    const base = face * 4;
    uvs.setXY(base + 0, u0, v1);
    uvs.setXY(base + 1, u1, v1);
    uvs.setXY(base + 2, u0, v0);
    uvs.setXY(base + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

export class MobManager {
  constructor(scene, world, sounds, entities = null) {
    this.entities = entities;
    this.scene = scene;
    this.world = world;
    this.sounds = sounds;
    this.mobs = [];
    this.arrows = [];
    this.textureLoader = new THREE.TextureLoader();

    // Cache textures
    this.textures = {
      villager: this.loadTexture('/assets/entity/villager.png'),
      iron_golem: this.loadTexture('/assets/entity/iron_golem.png'),
      pillager: this.loadTexture('/assets/entity/pillager.png'),
      zombie: this.loadTexture('/assets/entity/zombie.png'),
      pig: this.loadTexture('/assets/entity/pig.png'),
      cow: this.loadTexture('/assets/entity/cow.png'),
      sheep: this.loadTexture('/assets/entity/sheep.png'),
      creeper: this.loadTexture('/assets/entity/creeper.png'),
      skeleton: this.loadTexture('/assets/entity/skeleton.png'),
      salmon: this.createAquaticTexture('salmon'),
      dolphin: this.createAquaticTexture('dolphin'),
      octopus: this.createAquaticTexture('octopus'),
      axolotl: this.createAquaticTexture('axolotl'),
      tournament_host: this.createHostTexture(),
      enderman: this.createEndermanTexture()
    };
  }

  clearMobs() {
    for (const mob of this.mobs) {
      if (mob.mesh) {
        this.scene.remove(mob.mesh);
        mob.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
    }
    this.mobs = [];
  }

  spawnMob(type, x, y, z) {
    switch (type) {
      case 'villager': return this.spawnVillager(x, y, z);
      case 'tournament_host': return this.spawnTournamentHost(x, y, z);
      case 'enderman': return this.spawnEnderman(x, y, z);
      case 'iron_golem': return this.spawnIronGolem(x, y, z);
      case 'pillager': return this.spawnPillager(x, y, z);
      case 'zombie': return this.spawnZombie(x, y, z);
      case 'skeleton': return this.spawnSkeleton(x, y, z);
      case 'creeper': return this.spawnCreeper(x, y, z);
      case 'pig': return this.spawnPig(x, y, z);
      case 'cow': return this.spawnCow(x, y, z);
      case 'sheep': return this.spawnSheep(x, y, z);
      case 'chicken': return this.spawnChicken(x, y, z);
      case 'salmon': return this.spawnSalmon(x, y, z);
      case 'dolphin': return this.spawnDolphin(x, y, z);
      case 'octopus':
      case 'squid': return this.spawnOctopus(x, y, z);
      case 'axolotl': return this.spawnAxolotl(x, y, z);
      default: return this.spawnVillager(x, y, z);
    }
  }


  createAquaticTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (type === 'salmon') {
      // Base vibrant salmon red-orange with scale highlights & pale cream belly
      ctx.fillStyle = '#b83b37';
      ctx.fillRect(0, 0, 64, 64);
      // Cream belly
      ctx.fillStyle = '#e4ceb0';
      ctx.fillRect(0, 40, 64, 24);
      // Dark red dorsal ridge
      ctx.fillStyle = '#8f2320';
      ctx.fillRect(0, 0, 64, 14);
      // Scales pattern
      ctx.fillStyle = '#d44f4a';
      for (let x = 4; x < 60; x += 8) {
        for (let y = 14; y < 40; y += 6) {
          ctx.fillRect(x + (y % 12 === 0 ? 0 : 4), y, 4, 3);
        }
      }
      // Silvery fin strips
      ctx.fillStyle = '#9aa5ad';
      ctx.fillRect(44, 18, 16, 12);
      ctx.fillRect(48, 44, 14, 10);
      // Eyes
      ctx.fillStyle = '#151515';
      ctx.fillRect(6, 18, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(6, 18, 2, 2);
    } else if (type === 'dolphin') {
      // Oceanic slate-blue upper body and clean ivory-white underbelly
      ctx.fillStyle = '#678297';
      ctx.fillRect(0, 0, 64, 64);
      // Dark slate top
      ctx.fillStyle = '#4c6578';
      ctx.fillRect(0, 0, 64, 16);
      // Ivory white belly
      ctx.fillStyle = '#e4ecf3';
      ctx.fillRect(0, 36, 64, 28);
      // Gentle skin pixel noise
      ctx.fillStyle = '#7793a8';
      for (let i = 0; i < 40; i++) {
        const rx = Math.floor(Math.random() * 60);
        const ry = 16 + Math.floor(Math.random() * 20);
        ctx.fillRect(rx, ry, 3, 2);
      }
      // Blowhole & snout
      ctx.fillStyle = '#26343e';
      ctx.fillRect(28, 4, 6, 4);
      // Eyes
      ctx.fillStyle = '#151c22';
      ctx.fillRect(8, 20, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 20, 2, 2);
    } else if (type === 'octopus') {
      // Deep squid navy-cyan mantle with bioluminescent spots & suction cups
      ctx.fillStyle = '#163546';
      ctx.fillRect(0, 0, 64, 64);
      // Darker shading
      ctx.fillStyle = '#0f2430';
      ctx.fillRect(0, 0, 64, 16);
      ctx.fillRect(0, 48, 64, 16);
      // Glowing suction cup spots / skin texture
      ctx.fillStyle = '#4496ba';
      for (let x = 6; x < 60; x += 10) {
        for (let y = 8; y < 60; y += 10) {
          ctx.fillRect(x, y, 4, 4);
          ctx.fillStyle = '#78cce6';
          ctx.fillRect(x + 1, y + 1, 2, 2);
          ctx.fillStyle = '#4496ba';
        }
      }
      // Large expressive eyes
      ctx.fillStyle = '#e8f0f5';
      ctx.fillRect(8, 30, 8, 8);
      ctx.fillRect(48, 30, 8, 8);
      ctx.fillStyle = '#101418';
      ctx.fillRect(10, 32, 4, 4);
      ctx.fillRect(50, 32, 4, 4);
    } else if (type === 'axolotl') {
      // Lucy Axolotl soft pink with ruby-magenta external gill frills
      ctx.fillStyle = '#f7aab7';
      ctx.fillRect(0, 0, 64, 64);
      // Soft paler belly
      ctx.fillStyle = '#fde2e8';
      ctx.fillRect(0, 38, 64, 26);
      // Crimson / magenta gill accents
      ctx.fillStyle = '#e6356c';
      ctx.fillRect(0, 0, 20, 16);
      ctx.fillRect(44, 0, 20, 16);
      ctx.fillStyle = '#ba184b';
      ctx.fillRect(4, 4, 12, 8);
      ctx.fillRect(48, 4, 12, 8);
      // Cute black bead eyes with twinkle & mouth
      ctx.fillStyle = '#151515';
      ctx.fillRect(14, 24, 4, 4);
      ctx.fillRect(46, 24, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 24, 2, 2);
      ctx.fillRect(46, 24, 2, 2);
      // Cute smile
      ctx.fillStyle = '#d67487';
      ctx.fillRect(26, 32, 12, 2);
      ctx.fillRect(24, 30, 2, 2);
      ctx.fillRect(38, 30, 2, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createHostTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Default dark base
    ctx.fillStyle = '#1c1c1f';
    ctx.fillRect(0, 0, 64, 64);

    // 1. Head (0,0) to (32, 16)
    // Blonde swept-back hair on top, back, sides
    ctx.fillStyle = '#f0c74d';
    ctx.fillRect(0, 0, 32, 16);
    // Face (8, 8, 8, 8)
    // Skin tone
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(8, 8, 8, 8);
    // Hair bangs
    ctx.fillStyle = '#e5b83b';
    ctx.fillRect(8, 8, 8, 2);
    // Iconic black sunglasses across eyes
    ctx.fillStyle = '#111111';
    ctx.fillRect(8, 10, 8, 3);
    // Glass reflection white glints
    ctx.fillStyle = '#777777';
    ctx.fillRect(10, 10, 1, 1);
    ctx.fillRect(14, 10, 1, 1);
    // Confident announcer smile
    ctx.fillStyle = '#b36d52';
    ctx.fillRect(10, 14, 4, 1);

    // 2. Torso (16, 16, 24, 16)
    // Black tailored suit jacket
    ctx.fillStyle = '#141416';
    ctx.fillRect(16, 16, 24, 16);
    // White shirt collar V
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 20, 4, 3);
    // Bright red tournament tie
    ctx.fillStyle = '#d31b1b';
    ctx.fillRect(23, 21, 2, 8);
    // Gold tie clip
    ctx.fillStyle = '#f5c842';
    ctx.fillRect(23, 25, 2, 1);

    // 3. Legs & Arms
    // Suit pants & sleeves
    ctx.fillStyle = '#18181a';
    ctx.fillRect(0, 16, 16, 32);
    ctx.fillRect(40, 16, 16, 32);
    // Hands
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(44, 28, 4, 4);
    // Shoes
    ctx.fillStyle = '#080808';
    ctx.fillRect(4, 28, 4, 4);
    ctx.fillRect(12, 28, 4, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createEndermanTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Deep black/obsidian base with subtle pixel noise
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, 64, 64);

    for (let x = 0; x < 64; x += 2) {
      for (let y = 0; y < 64; y += 2) {
        const rand = Math.random();
        if (rand < 0.25) {
          ctx.fillStyle = '#0a0a0c';
          ctx.fillRect(x, y, 2, 2);
        } else if (rand > 0.75) {
          ctx.fillStyle = '#1c1c20';
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    // Glowing purple eyes on head front (8, 8, 8, 8)
    ctx.fillStyle = '#9333ea';
    ctx.fillRect(8, 12, 3, 1);
    ctx.fillRect(13, 12, 3, 1);
    ctx.fillStyle = '#d946ef';
    ctx.fillRect(9, 12, 1, 1);
    ctx.fillRect(14, 12, 1, 1);
    ctx.fillStyle = '#f5d0fe';
    ctx.fillRect(9, 12, 1, 1);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  loadTexture(path) {
    const tex = this.textureLoader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  isBlockSolid(x, y, z) {
    const b = this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b === BLOCKS.AIR || b === BLOCKS.WATER) return false;
    const def = BLOCK_DEFS[b];
    return def && def.solid !== false && !def.plant;
  }

  getMobDimensions(type) {
    switch (type) {
      case 'iron_golem': return { width: 1.4, height: 2.7 };
      case 'pig': return { width: 0.9, height: 0.9 };
      case 'cow': return { width: 0.9, height: 1.4 };
      case 'sheep': return { width: 0.9, height: 1.3 };
      case 'creeper': return { width: 0.6, height: 1.7 };
      case 'skeleton': return { width: 0.6, height: 1.98 };
      case 'zombie': return { width: 0.6, height: 1.95 };
      case 'pillager': return { width: 0.6, height: 1.95 };
      case 'salmon': return { width: 0.4, height: 0.35 };
      case 'dolphin': return { width: 0.9, height: 0.65 };
      case 'octopus':
      case 'squid': return { width: 0.7, height: 0.9 };
      case 'axolotl': return { width: 0.5, height: 0.35 };
      case 'tournament_host': return { width: 0.6, height: 1.95 };
      case 'enderman': return { width: 0.6, height: 2.9 };
      case 'villager':
      default:
        return { width: 0.6, height: 1.95 };
    }
  }

  checkMobCollision(mob, pos) {
    const dims = this.getMobDimensions(mob.type);
    const hw = (mob.width || dims.width) / 2;
    const h = mob.height || dims.height;

    // Small inset (0.02) to prevent precision sticking to block walls
    const minX = Math.floor(pos.x - hw + 0.02);
    const maxX = Math.floor(pos.x + hw - 0.02);
    const minY = Math.floor(pos.y + 0.02);
    const maxY = Math.floor(pos.y + h - 0.02);
    const minZ = Math.floor(pos.z - hw + 0.02);
    const maxZ = Math.floor(pos.z + hw - 0.02);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isBlockSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // --- VILLAGER ---
  spawnVillager(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.villager, transparent: true, alphaTest: 0.1 });

    // Head (8x10x8)
    const headGeo = createBoxWithUV(0.5, 0.625, 0.5, 0, 0, 64, 64, 8, 10, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    // Nose (2x4x2)
    const noseGeo = createBoxWithUV(0.125, 0.25, 0.125, 24, 0, 64, 64, 2, 4, 2);
    const nose = new THREE.Mesh(noseGeo, mat);
    nose.position.set(0, -0.15, 0.31);
    head.add(nose);

    // Torso / Robe (8x12x6)
    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.375, 16, 20, 64, 64, 8, 12, 6);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // Crossed Arms (8x8x6)
    const armsGeo = createBoxWithUV(0.55, 0.35, 0.35, 40, 38, 64, 64, 8, 8, 6);
    const arms = new THREE.Mesh(armsGeo, mat);
    arms.position.set(0, 0.82, 0.16);
    group.add(arms);

    // Legs (4x12x4)
    const legGeo = createBoxWithUV(0.24, 0.45, 0.24, 0, 22, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.22, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.22, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'villager',
      name: 'Villager',
      mesh: group,
      head: head,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };

    this.mobs.push(mob);
    return mob;
  }

  // --- IRON GOLEM ---
  spawnIronGolem(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.iron_golem, transparent: true, alphaTest: 0.1 });

    // Head (8x10x8)
    const headGeo = createBoxWithUV(0.65, 0.8, 0.65, 0, 0, 128, 128, 8, 10, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 2.3;
    group.add(head);

    // Nose (2x4x2)
    const noseGeo = createBoxWithUV(0.15, 0.3, 0.15, 24, 0, 128, 128, 2, 4, 2);
    const nose = new THREE.Mesh(noseGeo, mat);
    nose.position.set(0, -0.2, 0.4);
    head.add(nose);

    // Torso (18x12x11)
    const torsoGeo = createBoxWithUV(1.4, 0.95, 0.85, 0, 40, 128, 128, 18, 12, 11);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.6;
    group.add(torso);

    // Left Arm (4x30x6)
    const armGeo = createBoxWithUV(0.35, 1.6, 0.45, 60, 21, 128, 128, 4, 30, 6);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.95, 1.45, 0);
    group.add(leftArm);

    // Right Arm (4x30x6)
    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.95, 1.45, 0);
    group.add(rightArm);

    // Legs (6x16x5)
    const legGeo = createBoxWithUV(0.45, 1.0, 0.45, 37, 0, 128, 128, 6, 16, 5);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.4, 0.5, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.4, 0.5, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'iron_golem',
      name: 'Iron Golem',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 100,
      maxHealth: 100,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'patrol',
      target: null,
      timer: 0,
      attackCooldown: 0,
      hitCooldown: 0
    };

    this.mobs.push(mob);
    return mob;
  }

  // --- PILLAGER ---
  spawnPillager(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.pillager, transparent: true, alphaTest: 0.1 });

    // Head (8x10x8)
    const headGeo = createBoxWithUV(0.5, 0.6, 0.5, 0, 0, 64, 64, 8, 10, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    // Nose (2x4x2)
    const noseGeo = createBoxWithUV(0.125, 0.25, 0.125, 24, 0, 64, 64, 2, 4, 2);
    const nose = new THREE.Mesh(noseGeo, mat);
    nose.position.set(0, -0.15, 0.31);
    head.add(nose);

    // Torso (8x12x6)
    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.35, 16, 20, 64, 64, 8, 12, 6);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // Arms holding Crossbow forward (4x12x4)
    const leftArmGeo = createBoxWithUV(0.24, 0.7, 0.24, 40, 46, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(leftArmGeo, mat);
    leftArm.position.set(-0.38, 0.75, 0.15);
    leftArm.rotation.x = -Math.PI / 4;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(leftArmGeo, mat);
    rightArm.position.set(0.38, 0.75, 0.15);
    rightArm.rotation.x = -Math.PI / 3;
    group.add(rightArm);

    // 3D Crossbow in hand
    const bowMat = new THREE.MeshLambertMaterial({ color: 0x5a3d28 });
    const bowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), bowMat);
    bowMesh.position.set(0.3, 0.65, 0.4);
    bowMesh.rotation.y = Math.PI / 8;
    group.add(bowMesh);

    // Legs (4x12x4)
    const legGeo = createBoxWithUV(0.24, 0.45, 0.24, 0, 22, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.22, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.22, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'pillager',
      name: 'Pillager',
      mesh: group,
      head: head,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      leftArm: leftArm,
      rightArm: rightArm,
      mat: mat,
      health: 24,
      maxHealth: 24,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'patrol',
      target: null,
      timer: 0,
      shootCooldown: 2.0,
      hitCooldown: 0
    };

    this.mobs.push(mob);
    return mob;
  }

  // --- ZOMBIE ---
  spawnZombie(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.zombie });

    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 64);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // Arms outstretched forward (90 degrees)
    const armGeo = createBoxWithUV(0.24, 0.75, 0.24, 40, 16, 64, 64);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.38, 0.75, 0.25);
    leftArm.rotation.x = -Math.PI / 2;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.38, 0.75, 0.25);
    rightArm.rotation.x = -Math.PI / 2;
    group.add(rightArm);

    const legGeo = createBoxWithUV(0.24, 0.75, 0.24, 0, 16, 64, 64);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.38, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'zombie',
      name: 'Zombie',
      mesh: group,
      head: head,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'chase',
      target: null,
      timer: 0,
      hitCooldown: 0
    };

    this.mobs.push(mob);
    return mob;
  }

  // --- PASSIVE PIG ---
  spawnPig(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.pig });

    // Body
    const body = new THREE.Mesh(createBoxWithUV(0.65, 0.5, 0.9, 28, 8, 64, 32), mat);
    body.position.y = 0.55;
    group.add(body);

    // Head
    const head = new THREE.Mesh(createBoxWithUV(0.45, 0.45, 0.45, 0, 0, 64, 32), mat);
    head.position.set(0, 0.75, 0.55);
    group.add(head);

    // Snout
    const snout = new THREE.Mesh(createBoxWithUV(0.22, 0.16, 0.08, 16, 16, 64, 32), mat);
    snout.position.set(0, -0.08, 0.26);
    head.add(snout);

    // 4 Legs
    const legGeo = createBoxWithUV(0.2, 0.35, 0.2, 0, 16, 64, 32);
    const fl = new THREE.Mesh(legGeo, mat); fl.position.set(-0.2, 0.18, 0.3); group.add(fl);
    const fr = new THREE.Mesh(legGeo, mat); fr.position.set(0.2, 0.18, 0.3); group.add(fr);
    const bl = new THREE.Mesh(legGeo, mat); bl.position.set(-0.2, 0.18, -0.3); group.add(bl);
    const br = new THREE.Mesh(legGeo, mat); br.position.set(0.2, 0.18, -0.3); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'pig',
      name: 'Pig',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      mat: mat,
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };

    this.mobs.push(mob);
    return mob;
  }

  // --- PASSIVE COW ---
  spawnCow(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.cow });

    const body = new THREE.Mesh(createBoxWithUV(0.75, 0.65, 1.1, 18, 4, 64, 32), mat);
    body.position.y = 0.7;
    group.add(body);

    const head = new THREE.Mesh(createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 32), mat);
    head.position.set(0, 0.95, 0.65);
    group.add(head);

    const legGeo = createBoxWithUV(0.22, 0.45, 0.22, 0, 16, 64, 32);
    const fl = new THREE.Mesh(legGeo, mat); fl.position.set(-0.24, 0.22, 0.35); group.add(fl);
    const fr = new THREE.Mesh(legGeo, mat); fr.position.set(0.24, 0.22, 0.35); group.add(fr);
    const bl = new THREE.Mesh(legGeo, mat); bl.position.set(-0.24, 0.22, -0.35); group.add(bl);
    const br = new THREE.Mesh(legGeo, mat); br.position.set(0.24, 0.22, -0.35); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'cow',
      name: 'Cow',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      mat: mat,
      health: 12,
      maxHealth: 12,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- PASSIVE SHEEP ---
  spawnSheep(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.sheep });

    const body = new THREE.Mesh(createBoxWithUV(0.7, 0.6, 1.0, 28, 8, 64, 32), mat);
    body.position.y = 0.65;
    group.add(body);

    const head = new THREE.Mesh(createBoxWithUV(0.42, 0.42, 0.45, 0, 0, 64, 32), mat);
    head.position.set(0, 0.88, 0.6);
    group.add(head);

    const legGeo = createBoxWithUV(0.2, 0.4, 0.2, 0, 16, 64, 32);
    const fl = new THREE.Mesh(legGeo, mat); fl.position.set(-0.22, 0.2, 0.32); group.add(fl);
    const fr = new THREE.Mesh(legGeo, mat); fr.position.set(0.22, 0.2, 0.32); group.add(fr);
    const bl = new THREE.Mesh(legGeo, mat); bl.position.set(-0.22, 0.2, -0.32); group.add(bl);
    const br = new THREE.Mesh(legGeo, mat); br.position.set(0.22, 0.2, -0.32); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'sheep',
      name: 'Sheep',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      mat: mat,
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- HOSTILE CREEPER ---
  spawnCreeper(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.creeper });

    // Head (8x8x8)
    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 32, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    // Torso (8x12x4)
    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.28, 16, 16, 64, 32, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // 4 Feet (4x6x4)
    const footGeo = createBoxWithUV(0.24, 0.38, 0.24, 0, 16, 64, 32, 4, 6, 4);
    const fl = new THREE.Mesh(footGeo, mat); fl.position.set(-0.14, 0.19, 0.16); group.add(fl);
    const fr = new THREE.Mesh(footGeo, mat); fr.position.set(0.14, 0.19, 0.16); group.add(fr);
    const bl = new THREE.Mesh(footGeo, mat); bl.position.set(-0.14, 0.19, -0.16); group.add(bl);
    const br = new THREE.Mesh(footGeo, mat); br.position.set(0.14, 0.19, -0.16); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'creeper',
      name: 'Creeper',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      mat: mat,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- HOSTILE SKELETON ---
  spawnSkeleton(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.skeleton, transparent: true, alphaTest: 0.1 });

    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 32, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.6;
    group.add(head);

    const bodyGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 32, 8, 12, 4);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.95;
    group.add(body);

    const armGeo = createBoxWithUV(0.18, 0.75, 0.18, 40, 16, 64, 32, 2, 12, 2);
    const leftArm = new THREE.Mesh(armGeo, mat); leftArm.position.set(-0.35, 0.95, 0); group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, mat); rightArm.position.set(0.35, 0.95, 0); group.add(rightArm);

    const legGeo = createBoxWithUV(0.18, 0.75, 0.18, 0, 16, 64, 32, 2, 12, 2);
    const leftLeg = new THREE.Mesh(legGeo, mat); leftLeg.position.set(-0.13, 0.38, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, mat); rightLeg.position.set(0.13, 0.38, 0); group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'skeleton',
      name: 'Skeleton',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      shootCooldown: 2.0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- DRAGON BALL WORLD MARTIAL ARTS TOURNAMENT HOST (ANNOUNCER) ---
  spawnTournamentHost(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.tournament_host || this.textures.villager,
      transparent: true,
      alphaTest: 0.1
    });

    // Head (8x8x8)
    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    // Torso (8x12x4)
    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // Left Arm (at side)
    const armGeo = createBoxWithUV(0.22, 0.75, 0.22, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.37, 0.75, 0);
    group.add(leftArm);

    // Right Arm (holding microphone up)
    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.37, 0.75, 0);
    rightArm.rotation.x = -Math.PI / 3;
    rightArm.rotation.z = -0.12;
    group.add(rightArm);

    // Microphone in hand
    const micGroup = new THREE.Group();
    const micHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    micHandle.position.y = 0.1;
    micGroup.add(micHandle);

    const micHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xc8c8c8 })
    );
    micHead.position.y = 0.22;
    micGroup.add(micHead);

    micGroup.position.set(0, -0.38, 0.08);
    micGroup.rotation.x = Math.PI / 2.2;
    rightArm.add(micGroup);

    // Legs
    const legGeo = createBoxWithUV(0.24, 0.75, 0.24, 0, 16, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.38, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'tournament_host',
      name: 'Tournament Announcer',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 100,
      maxHealth: 100,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'host',
      timer: 0,
      hitCooldown: 0,
      noLoot: true
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- ENDERMAN (TOURNAMENT CHALLENGER BOSS) ---
  spawnEnderman(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.enderman,
      transparent: true,
      alphaTest: 0.1
    });

    // Enderman height: ~2.9 blocks tall, slender
    // Head (8x8x8) -> 0.44 x 0.44 x 0.44
    const headGeo = createBoxWithUV(0.44, 0.44, 0.44, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 2.45;
    group.add(head);

    // Glowing purple eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd946ef });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.02), eyeMat);
    eyeL.position.set(-0.1, 0, 0.23);
    head.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.02), eyeMat);
    eyeR.position.set(0.1, 0, 0.23);
    head.add(eyeR);

    // Torso (0.38 x 0.72 x 0.22)
    const torsoGeo = createBoxWithUV(0.38, 0.72, 0.22, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 1.85;
    group.add(torso);

    // Arms: Long slender (0.13 x 1.6 x 0.13)
    const armGeo = createBoxWithUV(0.13, 1.6, 0.13, 40, 16, 64, 64, 2, 16, 2);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.28, 1.45, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.28, 1.45, 0);
    group.add(rightArm);

    // Legs: Long slender (0.13 x 1.7 x 0.13)
    const legGeo = createBoxWithUV(0.13, 1.7, 0.13, 0, 16, 64, 64, 2, 16, 2);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.11, 0.85, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.11, 0.85, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'enderman',
      name: 'World Martial Arts Challenger: The Enderman',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      eyeMat: eyeMat,
      health: 60,
      maxHealth: 60,
      isBoss: true,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'combat',
      timer: 0,
      teleportCooldown: 4.5,
      attackCooldown: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  teleportEnderman(mob, targetX = null, targetY = null, targetZ = null) {
    if (!mob || !mob.mesh) return;
    const oldPos = mob.mesh.position.clone();
    this.entities?.spawnEndermanParticles(oldPos.clone().add(new THREE.Vector3(0, 1.4, 0)), 22);

    let newX = targetX;
    let newY = targetY;
    let newZ = targetZ;

    if (newX === null || newZ === null) {
      // Pick a location on the arena stage
      newX = (Math.random() - 0.5) * 14;
      newZ = (Math.random() - 0.5) * 14;
      newY = 24.5;
    }

    mob.mesh.position.set(newX, newY, newZ);
    mob.velocity.set(0, 0, 0);

    this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 22);
    if (this.sounds?.playEndermanTeleport) {
      this.sounds.playEndermanTeleport();
    }
  }

  // --- AQUATIC: SALMON ---
  spawnSalmon(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.salmon });

    // Main Torso
    const bodyGeo = new THREE.BoxGeometry(0.18, 0.28, 0.48);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, 0.16, 0);
    group.add(body);

    // Head / Snout
    const headGeo = new THREE.BoxGeometry(0.15, 0.22, 0.22);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 0.15, 0.32);
    group.add(head);

    // Dorsal Fin
    const dorsalGeo = new THREE.BoxGeometry(0.04, 0.14, 0.2);
    const dorsal = new THREE.Mesh(dorsalGeo, mat);
    dorsal.position.set(0, 0.34, -0.05);
    group.add(dorsal);

    // Left and Right Pectoral Fins
    const finGeo = new THREE.BoxGeometry(0.16, 0.04, 0.12);
    const finL = new THREE.Mesh(finGeo, mat);
    finL.position.set(-0.14, 0.08, 0.15);
    finL.rotation.z = -0.35;
    group.add(finL);

    const finR = new THREE.Mesh(finGeo, mat);
    finR.position.set(0.14, 0.08, 0.15);
    finR.rotation.z = 0.35;
    group.add(finR);

    // Articulated Tail Section
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.16, -0.24);

    const tailBodyGeo = new THREE.BoxGeometry(0.12, 0.2, 0.28);
    const tailBody = new THREE.Mesh(tailBodyGeo, mat);
    tailBody.position.set(0, 0, -0.14);
    tailGroup.add(tailBody);

    const tailFinGeo = new THREE.BoxGeometry(0.04, 0.36, 0.26);
    const tailFin = new THREE.Mesh(tailFinGeo, mat);
    tailFin.position.set(0, 0, -0.38);
    tailGroup.add(tailFin);

    group.add(tailGroup);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'salmon',
      name: 'Salmon',
      mesh: group,
      isAquatic: true,
      inWater: true,
      tail: tailGroup,
      finL: finL,
      finR: finR,
      mat: mat,
      health: 6,
      maxHealth: 6,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      swimCycle: Math.random() * 10,
      timer: 0,
      flopTimer: 0,
      targetPos: null,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- AQUATIC: DOLPHIN ---
  spawnDolphin(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.dolphin });

    // Main Streamlined Torso
    const bodyGeo = new THREE.BoxGeometry(0.5, 0.42, 0.85);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, 0.25, 0);
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.42, 0.35, 0.42);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 0.23, 0.55);
    group.add(head);

    // Snout / Beak
    const snoutGeo = new THREE.BoxGeometry(0.2, 0.12, 0.24);
    const snout = new THREE.Mesh(snoutGeo, mat);
    snout.position.set(0, 0.16, 0.84);
    group.add(snout);

    // Dorsal Fin
    const dorsalGeo = new THREE.BoxGeometry(0.08, 0.32, 0.28);
    const dorsal = new THREE.Mesh(dorsalGeo, mat);
    dorsal.position.set(0, 0.58, -0.1);
    group.add(dorsal);

    // Pectoral Flippers
    const flipperGeo = new THREE.BoxGeometry(0.35, 0.06, 0.24);
    const flipperL = new THREE.Mesh(flipperGeo, mat);
    flipperL.position.set(-0.35, 0.14, 0.25);
    flipperL.rotation.z = -0.4;
    flipperL.rotation.y = 0.2;
    group.add(flipperL);

    const flipperR = new THREE.Mesh(flipperGeo, mat);
    flipperR.position.set(0.35, 0.14, 0.25);
    flipperR.rotation.z = 0.4;
    flipperR.rotation.y = -0.2;
    group.add(flipperR);

    // Articulated Tail with Horizontal Cetacean Fluke
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.25, -0.42);

    const tailBodyGeo = new THREE.BoxGeometry(0.32, 0.28, 0.5);
    const tailBody = new THREE.Mesh(tailBodyGeo, mat);
    tailBody.position.set(0, 0, -0.25);
    tailGroup.add(tailBody);

    const flukeGeo = new THREE.BoxGeometry(0.68, 0.06, 0.3);
    const fluke = new THREE.Mesh(flukeGeo, mat);
    fluke.position.set(0, 0, -0.58);
    tailGroup.add(fluke);

    group.add(tailGroup);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'dolphin',
      name: 'Dolphin',
      mesh: group,
      isAquatic: true,
      inWater: true,
      tail: tailGroup,
      fluke: fluke,
      flipperL: flipperL,
      flipperR: flipperR,
      mat: mat,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      swimCycle: Math.random() * 10,
      timer: 0,
      flopTimer: 0,
      targetPos: null,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- AQUATIC: OCTOPUS / SQUID ---
  spawnOctopus(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.octopus });

    // Elongated Mantle / Head
    const mantleGeo = new THREE.BoxGeometry(0.52, 0.65, 0.52);
    const mantle = new THREE.Mesh(mantleGeo, mat);
    mantle.position.set(0, 0.6, 0);
    group.add(mantle);

    // 8 Articulated Tentacles Ring
    const tentacles = [];
    const tentacleGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tPivot = new THREE.Group();
      tPivot.position.set(Math.sin(angle) * 0.2, 0.3, Math.cos(angle) * 0.2);

      const tMesh = new THREE.Mesh(tentacleGeo, mat);
      tMesh.position.set(0, -0.3, 0);
      tPivot.add(tMesh);

      // Pre-orient radial angle
      tPivot.rotation.y = angle;
      group.add(tPivot);
      tentacles.push(tPivot);
    }

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'octopus',
      name: 'Octopus',
      mesh: group,
      isAquatic: true,
      inWater: true,
      tentacles: tentacles,
      mat: mat,
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      swimCycle: Math.random() * 10,
      timer: 0,
      flopTimer: 0,
      targetPos: null,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnSquid(x, y, z) {
    return this.spawnOctopus(x, y, z);
  }

  // --- AQUATIC: AXOLOTL ---
  spawnAxolotl(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.axolotl });

    // Main Torso
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.22, 0.62);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, 0.14, 0);
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.42, 0.24, 0.34);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 0.15, 0.42);
    group.add(head);

    // External Branching Gill Frills (3 left, 3 right)
    const gillsL = new THREE.Group();
    gillsL.position.set(-0.24, 0.16, 0.42);
    const gillGeo = new THREE.BoxGeometry(0.18, 0.05, 0.05);

    for (let g = 0; g < 3; g++) {
      const gMesh = new THREE.Mesh(gillGeo, mat);
      gMesh.position.set(-0.08, (g - 1) * 0.08, 0);
      gMesh.rotation.z = -0.2 + (g - 1) * 0.25;
      gillsL.add(gMesh);
    }
    group.add(gillsL);

    const gillsR = new THREE.Group();
    gillsR.position.set(0.24, 0.16, 0.42);
    for (let g = 0; g < 3; g++) {
      const gMesh = new THREE.Mesh(gillGeo, mat);
      gMesh.position.set(0.08, (g - 1) * 0.08, 0);
      gMesh.rotation.z = 0.2 - (g - 1) * 0.25;
      gillsR.add(gMesh);
    }
    group.add(gillsR);

    // 4 Splayed Swimming Feet
    const footGeo = new THREE.BoxGeometry(0.18, 0.05, 0.14);
    const fl = new THREE.Mesh(footGeo, mat); fl.position.set(-0.24, 0.06, 0.22); group.add(fl);
    const fr = new THREE.Mesh(footGeo, mat); fr.position.set(0.24, 0.06, 0.22); group.add(fr);
    const bl = new THREE.Mesh(footGeo, mat); bl.position.set(-0.24, 0.06, -0.22); group.add(bl);
    const br = new THREE.Mesh(footGeo, mat); br.position.set(0.24, 0.06, -0.22); group.add(br);

    // Swimming Tail
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.14, -0.31);

    const tailGeo = new THREE.BoxGeometry(0.06, 0.28, 0.55);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.position.set(0, 0.02, -0.26);
    tailGroup.add(tail);

    group.add(tailGroup);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'axolotl',
      name: 'Axolotl',
      mesh: group,
      isAquatic: true,
      inWater: true,
      tail: tailGroup,
      gillsL: gillsL,
      gillsR: gillsR,
      feet: [fl, fr, bl, br],
      mat: mat,
      health: 14,
      maxHealth: 14,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      swimCycle: Math.random() * 10,
      timer: 0,
      flopTimer: 0,
      targetPos: null,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- PROJECTILES: ARROWS ---
  spawnArrow(origin, direction, shooter) {
    const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4);
    const mat = new THREE.MeshLambertMaterial({ color: 0x8b6540 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

    this.scene.add(mesh);
    this.sounds.playBowShoot();

    this.arrows.push({
      mesh: mesh,
      velocity: direction.clone().normalize().multiplyScalar(22),
      shooter: shooter,
      life: 5.0
    });
  }

  damageMob(mob, amount, knockbackOrigin) {
    if (mob.health <= 0 || mob.dying || mob.hitCooldown > 0) return;
    mob.health -= amount;
    mob.hitCooldown = 0.35;

    // Flash red
    mob.mat.color.setRGB(1.0, 0.2, 0.2);
    mob.hurtTime = 0.18;

    // Apply knockback
    if (knockbackOrigin) {
      mob.fleeFrom = knockbackOrigin.clone();
      mob.fleeTime = 2.5;
      const kbDir = mob.mesh.position.clone().sub(knockbackOrigin);
      kbDir.y = 0;
      kbDir.normalize();
      mob.knockback = kbDir.multiplyScalar(6);
      mob.velocity.y += 4;

    }

    if (mob.type === 'iron_golem') this.sounds.playIronGolem();
    else if (mob.type === 'villager') this.sounds.playVillager();
    else if (mob.type === 'pillager') this.sounds.playPillager();
    else if (mob.type === 'zombie') this.sounds.playZombie();
    else if (mob.type === 'enderman') {
      if (this.sounds?.playEndermanHurt) this.sounds.playEndermanHurt();
      // 45% chance to teleport away on hit to evade combos
      if (Math.random() < 0.45 && mob.health > 0) {
        setTimeout(() => {
          if (mob && mob.health > 0 && !mob.dying) {
            this.teleportEnderman(mob);
          }
        }, 90);
      }
    }
  }

  updateDeath(mob, dt) {
    if (!mob.dying) {
      mob.dying = true;
      mob.deathTime = 0;
      mob.velocity.x = mob.velocity.z = 0;
      mob.deathRotation = mob.mesh.rotation.z;
      mob.deathMaterials = new Set();
      mob.mesh.traverse(child => {
        if (child.material) for (const mat of Array.isArray(child.material) ? child.material : [child.material]) mob.deathMaterials.add(mat);
      });
    }
    mob.deathTime += dt;
    mob.mesh.position.y -= mob.deathLift || 0;
    moveGroundMob(this, mob, dt);
    const fall = THREE.MathUtils.smoothstep(mob.deathTime, 0, 0.5);
    mob.mesh.rotation.z = mob.deathRotation + fall * Math.PI / 2;
    mob.deathLift = Math.sin(fall * Math.PI / 2) * this.getMobDimensions(mob.type).width * 0.5;
    mob.mesh.position.y += mob.deathLift;
    if (mob.deathTime >= 0.65 && !mob.lootDropped) {
      mob.lootDropped = true;
      const pos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0));
      const loot = {
        pig: [['porkchop', false, 1, 3]], cow: [['beef', false, 1, 3], ['leather', false, 1, 2]],
        sheep: [[BLOCKS.WHITE_WOOL, true, 1, 1]], salmon: [['salmon', false, 1, 1]],
        skeleton: [['bone', false, 1, 2], ['arrow', false, 1, 2]], creeper: [['gunpowder', false, 1, 2]],
        iron_golem: [['iron_ingot', false, 3, 5], [BLOCKS.POPPY, true, 1, 1]],
        pillager: [['arrow', false, 1, 2]],
      };
      if (!mob.noLoot) for (const [id, isBlock, min, max] of loot[mob.type] || []) {
        this.entities?.spawnDroppedItem(pos, id, isBlock, min + Math.floor(Math.random() * (max - min + 1)), { pickupDelay: 1.2 });
      }
      this.entities?.spawnDeathParticles(pos);
    }
    for (const mat of mob.deathMaterials) {
      mat.transparent = true;
      mat.opacity = 1 - THREE.MathUtils.smoothstep(mob.deathTime, 0.65, 0.95);
    }
    if (mob.deathTime >= 0.95) {
      this.scene.remove(mob.mesh);
      this.mobs.splice(this.mobs.indexOf(mob), 1);
      const geometries = new Set();
      mob.mesh.traverse(child => { if (child.geometry) geometries.add(child.geometry); });
      geometries.forEach(geo => geo.dispose());
      mob.deathMaterials.forEach(mat => mat.dispose()); // texture maps are shared and stay cached
    }
  }

  update(dt, player) {
    dt = Math.min(dt, 0.1);
    // 1. Update Projectiles (Arrows)
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const arrow = this.arrows[i];
      arrow.life -= dt;
      arrow.velocity.y -= 9.8 * dt; // gravity arc

      arrow.mesh.position.addScaledVector(arrow.velocity, dt);

      // Hit player check
      if (arrow.shooter !== 'player') {
        const distToPlayer = arrow.mesh.position.distanceTo(player.position.clone().add(new THREE.Vector3(0, 1, 0)));
        if (distToPlayer < 0.8) {
          player.takeDamage(4);
          this.scene.remove(arrow.mesh);
          this.arrows.splice(i, 1);
          continue;
        }
      }

      // Hit block check
      const bX = Math.floor(arrow.mesh.position.x);
      const bY = Math.floor(arrow.mesh.position.y);
      const bZ = Math.floor(arrow.mesh.position.z);
      const block = this.world.getVoxel(bX, bY, bZ);
      if (block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
        this.scene.remove(arrow.mesh);
        this.arrows.splice(i, 1);
        continue;
      }

      if (arrow.life <= 0) {
        this.scene.remove(arrow.mesh);
        this.arrows.splice(i, 1);
      }
    }

    // 2. Update Mobs AI & Physics
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];

      if (mob.hitCooldown > 0) mob.hitCooldown -= dt;

      mob.hurtTime = Math.max(0, (mob.hurtTime || 0) - dt);
      if (mob.hurtTime === 0 && !mob.dying) mob.mat.color.setRGB(1, 1, 1);
      if (mob.health <= 0) {
        this.updateDeath(mob, dt);
        continue;
      }

      if (mob.isAquatic) {
        // --- AQUATIC CREATURE AI & 3D SWIMMING PHYSICS ---
        const bX = Math.floor(mob.mesh.position.x);
        const bY = Math.floor(mob.mesh.position.y + 0.15);
        const bZ = Math.floor(mob.mesh.position.z);
        const currentVoxel = this.world.getVoxel(bX, bY, bZ);
        const inWater = (currentVoxel === BLOCKS.WATER);
        mob.inWater = inWater;

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
        } else if (mob.type === 'dolphin') {
          const flukeWave = Math.sin(mob.swimCycle * 6.5) * (inWater ? 0.45 : 0.7);
          if (mob.fluke) mob.fluke.rotation.x = flukeWave;
          if (mob.tail) mob.tail.rotation.x = flukeWave * 0.5;
          if (mob.flipperL) mob.flipperL.rotation.z = -0.4 + Math.sin(mob.swimCycle * 6.5) * 0.15;
          if (mob.flipperR) mob.flipperR.rotation.z = 0.4 - Math.sin(mob.swimCycle * 6.5) * 0.15;
        } else if (mob.type === 'octopus') {
          const pulse = Math.pow((Math.sin(mob.swimCycle * 3.5) + 1.0) * 0.5, 2.0);
          if (mob.tentacles) {
            for (let t = 0; t < mob.tentacles.length; t++) {
              mob.tentacles[t].rotation.x = (pulse * 0.6) - 0.1;
            }
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

        continue;
      }

      // Distance to player
      const distToPlayer = mob.mesh.position.distanceTo(player.position);

      // --- MOB SPECIFIC AI BEHAVIORS ---
      if (mob.type === 'villager') {
        // Look at player if near, or wander peacefully
        if (distToPlayer < 2.5) {
          mob.yaw = Math.atan2(player.position.x - mob.mesh.position.x, player.position.z - mob.mesh.position.z);
          mob.velocity.x *= 0.5;
          mob.velocity.z *= 0.5;
        } else { wanderMob(this, mob, dt, 1.2); }
      } else if (mob.type === 'iron_golem') {
        // Find nearest hostile target (Pillager or Zombie)
        let nearestHostile = null;
        let minDist = 16;
        for (const other of this.mobs) {
          if (other.health > 0 && (other.type === 'pillager' || other.type === 'zombie')) {
            const d = mob.mesh.position.distanceTo(other.mesh.position);
            if (d < minDist) {
              minDist = d;
              nearestHostile = other;
            }
          }
        }

        if (nearestHostile) {
          // Charge at enemy!
          const dir = nearestHostile.mesh.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * 3.8;
          mob.velocity.z = dir.z * 3.8;

          // Attack when close
          if (minDist < 2.0 && mob.attackCooldown <= 0) {
            mob.attackCooldown = 1.0;
            this.sounds.playIronGolem();
            // Uppercut punch animation
            mob.rightArm.rotation.x = -Math.PI / 1.5;
            setTimeout(() => { if (mob.rightArm) mob.rightArm.rotation.x = 0; }, 300);
            this.damageMob(nearestHostile, 18, mob.mesh.position);
          }
        } else {
          // Patrol slowly
          wanderMob(this, mob, dt, 1.0);
        }
        if (mob.attackCooldown > 0) mob.attackCooldown -= dt;
      } else if (mob.type === 'pillager') {
        // Target player or villagers
        let targetPos = null;
        let targetEntity = null;
        if (distToPlayer < 18) {
          targetPos = player.position;
          targetEntity = 'player';
        } else {
          for (const other of this.mobs) {
            if (other.health > 0 && other.type === 'villager' && mob.mesh.position.distanceTo(other.mesh.position) < 16) {
              targetPos = other.mesh.position;
              targetEntity = other;
              break;
            }
          }
        }

        if (targetPos) {
          const dir = targetPos.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);

          // Maintain distance ~8 blocks and shoot crossbow
          const dist = mob.mesh.position.distanceTo(targetPos);
          if (dist > 10) {
            mob.velocity.x = dir.x * 2.2;
            mob.velocity.z = dir.z * 2.2;
          } else if (dist < 5) {
            mob.velocity.x = -dir.x * 1.8;
            mob.velocity.z = -dir.z * 1.8;
          } else {
            mob.velocity.x *= 0.5;
            mob.velocity.z *= 0.5;
          }

          mob.shootCooldown -= dt;
          if (mob.shootCooldown <= 0) {
            mob.shootCooldown = 2.5;
            const shootOrigin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            const shootDir = targetPos.clone().add(new THREE.Vector3(0, 1, 0)).sub(shootOrigin).normalize();
            this.spawnArrow(shootOrigin, shootDir, mob);
          }
        } else {
          // Patrol wander
          wanderMob(this, mob, dt, 1.2);
        }
      } else if (mob.type === 'zombie') {
        // Chase player or villagers
        let targetPos = null;
        let targetEntity = null;
        if (distToPlayer < 16) {
          targetPos = player.position;
          targetEntity = 'player';
        }

        if (targetPos) {
          const dir = targetPos.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * 2.8;
          mob.velocity.z = dir.z * 2.8;

          // Attack player
          if (distToPlayer < 1.4 && mob.hitCooldown <= 0) {
            player.takeDamage(3);
            mob.hitCooldown = 1.0;
          }
        } else {
          // Wander
          wanderMob(this, mob, dt, 1.0);
        }
      } else if (mob.type === 'pig' || mob.type === 'cow' || mob.type === 'sheep') {
        wanderMob(this, mob, dt, 1.15);
        if (mob.fleeTime > 0) {
          mob.fleeTime -= dt;
          const escape = mob.mesh.position.clone().sub(mob.fleeFrom); escape.y = 0; escape.normalize();
          mob.yaw = Math.atan2(escape.x, escape.z);
          mob.velocity.x = escape.x * 2.8; mob.velocity.z = escape.z * 2.8;
        }
      } else if (mob.type === 'creeper') {
        if (distToPlayer < 16) {
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * 2.5;
          mob.velocity.z = dir.z * 2.5;

          if (distToPlayer < 2.0 && mob.hitCooldown <= 0) {
            player.takeDamage(10);
            this.sounds.playExplosion();
            mob.health = 0; // explode
            mob.noLoot = true;
            continue;
          }
        } else {
          wanderMob(this, mob, dt, 0.8);
        }
      } else if (mob.type === 'skeleton') {
        if (distToPlayer < 18) {
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          if (distToPlayer > 10) {
            mob.velocity.x = dir.x * 2.0;
            mob.velocity.z = dir.z * 2.0;
          } else {
            mob.velocity.x = 0;
            mob.velocity.z = 0;
          }

          mob.shootCooldown -= dt;
          if (mob.shootCooldown <= 0) {
            mob.shootCooldown = 2.5;
            const shootOrigin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
            const shootDir = player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(shootOrigin).normalize();
            this.spawnArrow(shootOrigin, shootDir, mob);
          }
        } else {
          wanderMob(this, mob, dt, 0.8);
        }
      } else if (mob.type === 'tournament_host') {
        // Face player if near, stationary announcer posture
        if (distToPlayer < 7.0) {
          mob.yaw = Math.atan2(player.position.x - mob.mesh.position.x, player.position.z - mob.mesh.position.z);
        }
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        // Subtle breathing & mic motion
        if (mob.rightArm) {
          mob.rightArm.rotation.x = -Math.PI / 3 + Math.sin(Date.now() * 0.003) * 0.04;
        }
      } else if (mob.type === 'enderman') {
        mob.teleportCooldown = (mob.teleportCooldown || 4.5) - dt;
        mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
        mob.particleTimer = (mob.particleTimer || 0) - dt;

        // Subtle ambient purple portal particles
        if (mob.particleTimer <= 0) {
          mob.particleTimer = 0.35;
          this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 2);
        }

        // Periodic arena teleportation
        if (mob.teleportCooldown <= 0) {
          mob.teleportCooldown = 4.0 + Math.random() * 3.5;
          this.teleportEnderman(mob);
        }

        // Aggressively pursue player
        const dir = player.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 0.1) {
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          const endermanSpeed = 3.2;
          mob.velocity.x = dir.x * endermanSpeed;
          mob.velocity.z = dir.z * endermanSpeed;
        }

        // Melee attack
        if (dist < 1.7 && mob.attackCooldown <= 0) {
          player.takeDamage(4);
          this.sounds?.playZombie?.();
          mob.attackCooldown = 1.0;
          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.x = -Math.PI / 2.2;
            mob.rightArm.rotation.x = -Math.PI / 2.2;
          }
        }
      }

      const moveSpeed = moveGroundMob(this, mob, dt);
      mob.walkCycle = (mob.walkCycle || 0) + moveSpeed * dt * 7;
      const legSwing = Math.sin(mob.walkCycle) * Math.min(0.8, moveSpeed * 0.4);
      if (mob.leftLeg && mob.rightLeg) {
        mob.leftLeg.rotation.x = legSwing;
        mob.rightLeg.rotation.x = -legSwing;
      }
      if (mob.legs) {
        mob.legs[0].rotation.x = legSwing;
        mob.legs[1].rotation.x = -legSwing;
        mob.legs[2].rotation.x = -legSwing;
        mob.legs[3].rotation.x = legSwing;
      }
    }
  }
}
