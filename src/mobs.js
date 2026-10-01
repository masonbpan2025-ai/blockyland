import * as THREE from 'three';
import { spawnArrow, updateArrows, removeArrow } from './arrows.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { wanderMob, moveGroundMob, moveFlyingMob } from './mobMotion.js';
import { MobLibrary } from './mobLibrary.js';

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
      enderman: this.createEndermanTexture(),
      jackie_chun: this.createJackieChunTexture(),
      site_manager: this.createTrainerTexture()
    };
  }

  clearMobs() {
    for (const arrow of [...this.arrows]) removeArrow(this, arrow);
    if (this.customProjectiles) {
      for (const p of this.customProjectiles) {
        if (p.mesh) {
          this.scene.remove(p.mesh);
          p.mesh.geometry?.dispose();
          p.mesh.material?.dispose();
        }
      }
      this.customProjectiles = [];
    }
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
    if (typeof type === 'object' && type !== null) {
      return this.spawnCustomMob(type, x, y, z);
    }
    if (typeof type === 'string' && (type.startsWith('custom_') || MobLibrary.getMob(type))) {
      const def = MobLibrary.getMob(type);
      if (def) return this.spawnCustomMob(def, x, y, z);
    }
    switch (type) {
      case 'villager': return this.spawnVillager(x, y, z);
      case 'tournament_host': return this.spawnTournamentHost(x, y, z);
      case 'site_manager': return this.spawnSiteManager(x, y, z);
      case 'jackie_chun': return this.spawnJackieChun(x, y, z);
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
      case 'mooshroom': return this.spawnMooshroom(x, y, z);
      case 'polar_bear': return this.spawnPolarBear(x, y, z);
      case 'panda': return this.spawnPanda(x, y, z);
      case 'warden': return this.spawnWarden(x, y, z);
      case 'blaze': return this.spawnBlaze(x, y, z);
      case 'piglin': return this.spawnPiglin(x, y, z);
      case 'ghast': return this.spawnGhast(x, y, z);
      case 'magma_cube': return this.spawnMagmaCube(x, y, z);
      case 'shulker': return this.spawnShulker(x, y, z);
      default:
        if (typeof type === 'string' && MobLibrary.getMob(type)) {
          return this.spawnCustomMob(MobLibrary.getMob(type), x, y, z);
        }
        return this.spawnVillager(x, y, z);
    }
  }

  /**
   * Build the 64x64 texture for a custom mob.
   *
   * @param {object} look appearance definition
   * @param {Function} [createCanvas] canvas factory, defaulting to
   *   document.createElement. Injectable so tests can supply a stub without
   *   assigning a global `document`, which would leak across the shared test
   *   process and break unrelated files.
   */
  createCustomMobTexture(look = {}, createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();
    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const main = look.mainColor || '#7c3aed';
    const accent = look.accentColor || '#ec4899';
    const eye = look.eyeColor || '#facc15';

    // 1. Base Fill
    ctx.fillStyle = main;
    ctx.fillRect(0, 0, 64, 64);

    // 2. Texture details / shading grid
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 64; y += 4) {
        if ((x + y) % 8 === 0) {
          ctx.fillRect(x, y, 4, 4);
        }
      }
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let x = 2; x < 64; x += 8) {
      for (let y = 2; y < 64; y += 8) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // 3. Head details (Head block at u:0, v:0; Front face spans x:8..15, y:8..15)
    // Only draw crown/crest if not a character mob with ears or cheek markings
    if (!look.hasCheekPatches && !look.ears) {
      ctx.fillStyle = accent;
      ctx.fillRect(8, 0, 8, 4); // crown / crest
    }

    const headFrontX = 8;
    const headFrontY = 8;

    // Eyes: 2x2 pupils with white shine gleam
    ctx.fillStyle = eye;
    ctx.fillRect(headFrontX + 1, headFrontY + 1, 2, 2); // Left eye: x 9..10, y 9..10
    ctx.fillRect(headFrontX + 5, headFrontY + 1, 2, 2); // Right eye: x 13..14, y 9..10

    // White shine gleam on upper-left of each eye
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(headFrontX + 1, headFrontY + 1, 1, 1); // Left shine: (9, 9)
    ctx.fillRect(headFrontX + 5, headFrontY + 1, 1, 1); // Right shine: (13, 9)

    // Nose: small dark dot centered between eyes and mouth
    if (look.hasNose) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(headFrontX + 3, headFrontY + 3, 2, 1); // (11..12, 11)
    }

    // Cheeks: 2x2 bright red circular patches on lower cheeks (no overlap with eyes!)
    if (look.hasCheekPatches) {
      ctx.fillStyle = look.cheekColor || '#e3342f';
      ctx.fillRect(headFrontX + 0, headFrontY + 4, 2, 2); // Left cheek: (8..9, 12..13)
      ctx.fillRect(headFrontX + 6, headFrontY + 4, 2, 2); // Right cheek: (14..15, 12..13)
    }

    // Cute cat mouth (3-shaped smile)
    if (look.hasMouth) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(headFrontX + 3, headFrontY + 5, 2, 1);
      ctx.fillRect(headFrontX + 2, headFrontY + 6, 4, 1);
    }

    // 4. Torso accents
    if (look.hasBackStripes || look.ears === 'pointed' || (look.mainColor === '#f7d02c' && look.accentColor === '#8b4513')) {
      // Signature brown back stripes (Torso back face spans x:38..45, y:27..36)
      const stripeCol = look.accentColor || '#8b4513';
      ctx.fillStyle = stripeCol;
      ctx.fillRect(39, 29, 6, 2); // Upper horizontal back stripe
      ctx.fillRect(39, 33, 6, 2); // Lower horizontal back stripe
    } else {
      // Humanoid chestplate and belt
      ctx.fillStyle = accent;
      ctx.fillRect(20, 18, 8, 12);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(22, 28, 4, 2);
    }

    // 5. Limbs accents
    if (!look.hasCheekPatches && look.modelType !== 'biped_creature') {
      ctx.fillStyle = accent;
      ctx.fillRect(0, 24, 8, 4);
      ctx.fillRect(40, 24, 8, 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  spawnCustomMob(mobDef, x, y, z) {
    if (!mobDef) return null;
    const group = new THREE.Group();
    const look = mobDef.look || {};
    const behavior = mobDef.behavior || {};
    let modelType = look.modelType || 'humanoid';

    const isPikachuOrBipedCreature = (mobDef.name && /pikachu/i.test(mobDef.name)) ||
      (look.ears === 'pointed' && look.tail === 'lightning') ||
      modelType === 'biped_creature';

    if (isPikachuOrBipedCreature) {
      modelType = 'biped_creature';
    }

    const tex = this.createCustomMobTexture(look);
    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      transparent: modelType === 'slime',
      opacity: modelType === 'slime' ? 0.75 : 1.0,
      alphaTest: modelType === 'slime' ? 0.05 : 0.1
    });

    let head = null;
    let leftArm = null;
    let rightArm = null;
    let leftLeg = null;
    let rightLeg = null;
    let legs = null;
    let wings = null;

    if (modelType === 'biped_creature') {
      // Authentic biped mascot creature (Pikachu/cute chibi characters)
      // Head (0.54 x 0.52 x 0.48)
      const headGeo = createBoxWithUV(0.54, 0.52, 0.48, 0, 0, 64, 64, 8, 8, 8);
      head = new THREE.Mesh(headGeo, mat);
      head.position.set(0, 1.05, 0.04);
      group.add(head);

      // Torso / Chubby Body (0.52 x 0.54 x 0.44)
      const torsoGeo = createBoxWithUV(0.52, 0.54, 0.44, 16, 20, 64, 64, 8, 10, 7);
      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.set(0, 0.54, 0);
      group.add(torso);

      // Folded Arms / Little Paws resting in front (like Pikachu reference)
      const armGeo = createBoxWithUV(0.14, 0.30, 0.14, 40, 46, 64, 64, 3, 7, 3);
      leftArm = new THREE.Mesh(armGeo, mat);
      leftArm.position.set(-0.22, 0.58, 0.14);
      leftArm.rotation.set(0.65, 0.25, -0.45);
      group.add(leftArm);

      const rArmGeo = createBoxWithUV(0.14, 0.30, 0.14, 40, 46, 64, 64, 3, 7, 3);
      rightArm = new THREE.Mesh(rArmGeo, mat);
      rightArm.position.set(0.22, 0.58, 0.14);
      rightArm.rotation.set(0.65, -0.25, 0.45);
      group.add(rightArm);

      // Flat Little Feet
      const footGeo = createBoxWithUV(0.18, 0.14, 0.28, 0, 22, 64, 64, 4, 3, 6);
      leftLeg = new THREE.Mesh(footGeo, mat);
      leftLeg.position.set(-0.16, 0.07, 0.06);
      group.add(leftLeg);

      const rFootGeo = createBoxWithUV(0.18, 0.14, 0.28, 0, 22, 64, 64, 4, 3, 6);
      rightLeg = new THREE.Mesh(rFootGeo, mat);
      rightLeg.position.set(0.16, 0.07, 0.06);
      group.add(rightLeg);
      legs = null;
    } else if (modelType === 'quadruped') {
      // Body (Horizontal 0.7 x 0.6 x 1.0)
      const bodyGeo = createBoxWithUV(0.7, 0.6, 1.0, 16, 20, 64, 64, 11, 10, 16);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 0.65;
      group.add(body);

      // Head (0.5 x 0.5 x 0.5)
      const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
      head = new THREE.Mesh(headGeo, mat);
      head.position.set(0, 0.95, 0.55);
      group.add(head);

      // Snout (only for animals, suppress if snout is false or pointed ears or cheeks)
      if (look.hasSnout !== false && look.ears !== 'pointed' && !look.hasCheekPatches) {
        const snoutGeo = createBoxWithUV(0.25, 0.2, 0.25, 24, 0, 64, 64, 4, 3, 4);
        const snout = new THREE.Mesh(snoutGeo, mat);
        snout.position.set(0, -0.1, 0.35);
        head.add(snout);
      }

      // 4 Legs
      const legGeo = createBoxWithUV(0.24, 0.45, 0.24, 0, 22, 64, 64, 4, 8, 4);
      const fl = new THREE.Mesh(legGeo, mat); fl.position.set(-0.25, 0.22, 0.35); group.add(fl);
      const fr = new THREE.Mesh(legGeo, mat); fr.position.set(0.25, 0.22, 0.35); group.add(fr);
      const bl = new THREE.Mesh(legGeo, mat); bl.position.set(-0.25, 0.22, -0.35); group.add(bl);
      const br = new THREE.Mesh(legGeo, mat); br.position.set(0.25, 0.22, -0.35); group.add(br);
      legs = [fl, fr, bl, br];

      // Tail (only if no custom tail like lightning is specified)
      if (!look.tail || look.tail === 'none') {
        const tailGeo = createBoxWithUV(0.12, 0.12, 0.45, 40, 0, 64, 64, 2, 2, 7);
        const tail = new THREE.Mesh(tailGeo, mat);
        tail.position.set(0, 0.7, -0.6);
        tail.rotation.x = -Math.PI / 4;
        group.add(tail);
      }
    } else if (modelType === 'golem') {
      // Heavy Torso (1.3 x 0.9 x 0.8)
      const torsoGeo = createBoxWithUV(1.3, 0.9, 0.8, 0, 40, 64, 64, 18, 12, 11);
      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 1.6;
      group.add(torso);

      // Golem Head
      const headGeo = createBoxWithUV(0.65, 0.75, 0.65, 0, 0, 64, 64, 8, 10, 8);
      head = new THREE.Mesh(headGeo, mat);
      head.position.y = 2.25;
      group.add(head);

      // Huge Arms
      const armGeo = createBoxWithUV(0.35, 1.45, 0.4, 40, 21, 64, 64, 4, 24, 6);
      leftArm = new THREE.Mesh(armGeo, mat); leftArm.position.set(-0.9, 1.4, 0); group.add(leftArm);
      rightArm = new THREE.Mesh(armGeo, mat); rightArm.position.set(0.9, 1.4, 0); group.add(rightArm);

      // Sturdy Legs
      const legGeo = createBoxWithUV(0.42, 0.9, 0.42, 37, 0, 64, 64, 6, 14, 5);
      leftLeg = new THREE.Mesh(legGeo, mat); leftLeg.position.set(-0.35, 0.45, 0); group.add(leftLeg);
      rightLeg = new THREE.Mesh(legGeo, mat); rightLeg.position.set(0.35, 0.45, 0); group.add(rightLeg);
    } else if (modelType === 'flying') {
      // Aerodynamic dragon/bird body
      const bodyGeo = createBoxWithUV(0.6, 0.45, 0.95, 16, 20, 64, 64, 9, 7, 15);
      const body = new THREE.Mesh(bodyGeo, mat);
      body.position.y = 1.15;
      group.add(body);

      // Head
      const headGeo = createBoxWithUV(0.45, 0.42, 0.5, 0, 0, 64, 64, 7, 7, 8);
      head = new THREE.Mesh(headGeo, mat);
      head.position.set(0, 1.35, 0.6);
      group.add(head);

      // Snout / Beak
      const beakGeo = createBoxWithUV(0.2, 0.15, 0.35, 24, 0, 64, 64, 3, 2, 5);
      const beak = new THREE.Mesh(beakGeo, mat);
      beak.position.set(0, -0.08, 0.35);
      head.add(beak);

      // Tail fin
      const tailGeo = createBoxWithUV(0.12, 0.3, 0.65, 40, 0, 64, 64, 2, 5, 10);
      const tail = new THREE.Mesh(tailGeo, mat);
      tail.position.set(0, 1.25, -0.65);
      tail.rotation.x = -0.2;
      group.add(tail);

      // Large Flapping Wings
      const wingGeo = createBoxWithUV(0.85, 0.08, 0.5, 0, 48, 64, 64, 14, 2, 8);
      const lWing = new THREE.Mesh(wingGeo, mat); lWing.position.set(-0.6, 1.25, 0.05); group.add(lWing);
      const rWing = new THREE.Mesh(wingGeo, mat); rWing.position.set(0.6, 1.25, 0.05); group.add(rWing);
      wings = { left: lWing, right: rWing };
    } else if (modelType === 'slime') {
      // Outer translucent cube
      const outerGeo = createBoxWithUV(0.85, 0.85, 0.85, 0, 0, 64, 64, 14, 14, 14);
      const outerCube = new THREE.Mesh(outerGeo, mat);
      outerCube.position.y = 0.42;
      group.add(outerCube);

      // Inner solid core cube
      const coreMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.accentColor || '#ec4899') });
      const coreGeo = createBoxWithUV(0.45, 0.45, 0.45, 16, 16, 64, 64, 8, 8, 8);
      const coreCube = new THREE.Mesh(coreGeo, coreMat);
      coreCube.position.y = 0.42;
      group.add(coreCube);

      head = outerCube;
    } else {
      // Standard humanoid
      const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
      head = new THREE.Mesh(headGeo, mat);
      head.position.y = 1.35;
      group.add(head);

      const torsoGeo = createBoxWithUV(0.5, 0.75, 0.35, 16, 20, 64, 64, 8, 12, 6);
      const torso = new THREE.Mesh(torsoGeo, mat);
      torso.position.y = 0.75;
      group.add(torso);

      const armGeo = createBoxWithUV(0.24, 0.7, 0.24, 40, 46, 64, 64, 4, 12, 4);
      leftArm = new THREE.Mesh(armGeo, mat); leftArm.position.set(-0.38, 0.75, 0); group.add(leftArm);
      rightArm = new THREE.Mesh(armGeo, mat); rightArm.position.set(0.38, 0.75, 0); group.add(rightArm);

      const legGeo = createBoxWithUV(0.24, 0.45, 0.24, 0, 22, 64, 64, 4, 12, 4);
      leftLeg = new THREE.Mesh(legGeo, mat); leftLeg.position.set(-0.13, 0.22, 0); group.add(leftLeg);
      rightLeg = new THREE.Mesh(legGeo, mat); rightLeg.position.set(0.13, 0.22, 0); group.add(rightLeg);
    }

    // Add Wings if requested and not already flying model
    if (look.hasWings && !wings) {
      const wingMat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(look.accentColor || '#ec4899'),
        side: THREE.DoubleSide
      });
      const wingGeo = createBoxWithUV(0.65, 0.06, 0.45, 0, 48, 64, 64, 10, 2, 7);
      const lWing = new THREE.Mesh(wingGeo, wingMat);
      lWing.position.set(-0.45, head ? head.position.y - 0.25 : 0.8, -0.2);
      lWing.rotation.y = 0.3;
      group.add(lWing);

      const rWing = new THREE.Mesh(wingGeo, wingMat);
      rWing.position.set(0.45, head ? head.position.y - 0.25 : 0.8, -0.2);
      rWing.rotation.y = -0.3;
      group.add(rWing);
      wings = { left: lWing, right: rWing };
    }

    // Add Horns if requested
    if (look.hasHorns && head) {
      const hornMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.accentColor || '#ec4899') });
      const hornGeo = new THREE.BoxGeometry(0.08, 0.25, 0.08);
      const lHorn = new THREE.Mesh(hornGeo, hornMat);
      lHorn.position.set(-0.2, 0.32, 0);
      lHorn.rotation.z = 0.35;
      head.add(lHorn);

      const rHorn = new THREE.Mesh(hornGeo, hornMat);
      rHorn.position.set(0.2, 0.32, 0);
      rHorn.rotation.z = -0.35;
      head.add(rHorn);
    }

    // Ears. A character is recognised by its silhouette far more than by colour,
    // and without these a "Pikachu" was just a coloured box with a snout.
    this.addMobEars(group, head, look);

    // Signature tails (a lightning bolt is not a stub).
    const tail = this.addMobTail(group, look, modelType);

    // Add Glowing Eyes if requested
    if (look.hasGlowingEyes && head) {
      const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.eyeColor || '#facc15') });      const eyeGeo = new THREE.BoxGeometry(0.09, 0.09, 0.04);
      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.position.set(-0.12, 0.05, 0.26);
      head.add(lEye);

      const rEye = new THREE.Mesh(eyeGeo, eyeMat);
      rEye.position.set(0.12, 0.05, 0.26);
      head.add(rEye);
    }

    // Apply scale
    const scale = look.scale || 1.0;
    group.scale.set(scale, scale, scale);

    group.position.set(x, y, z);
    group.traverse(obj => {
      if (obj.isMesh) obj.castShadow = obj.receiveShadow = true;
    });
    this.scene.add(group);

    const mob = {
      type: mobDef.id || 'custom',
      name: mobDef.name || 'Custom Mob',
      isCustomMob: true,
      isPikachu: isPikachuOrBipedCreature,
      customDef: mobDef,
      mesh: group,
      head,
      leftLeg,
      rightLeg,
      leftArm,
      rightArm,
      legs,
      wings,
      tail,
      tailMesh: tail?.tailGroup || (Array.isArray(tail) ? tail[0] : tail),
      mat,
      health: behavior.health || 40,
      maxHealth: behavior.health || 40,
      speed: behavior.speed || 2.6,
      attackDamage: behavior.attack || 5,
      behaviorType: behavior.type || 'hostile',
      followPlayer: Boolean(behavior.followPlayer),
      skills: [...(mobDef.skills || [])],
      look,
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      skillCooldown: 2.5,
      isFlying: modelType === 'flying',
      width: modelType === 'flying' ? 1.0 * scale : (modelType === 'golem' ? 1.0 * scale : 0.6 * scale),
      height: modelType === 'flying' ? 0.9 * scale : (modelType === 'golem' ? 2.4 * scale : (modelType === 'slime' ? 0.85 * scale : 1.85 * scale))
    };

    this.mobs.push(mob);
    return mob;
  }

  /**
   * Attach ears to a custom mob's head.
   *
   * Silhouette is what makes a character recognisable at a glance — two tall
   * pointed ears read as "Pikachu" long before the colour does. An ear is a thin
   * box rotated outward, optionally tipped in a contrasting colour (the black tips
   * of a lightning mouse), and attached to the head so it animates with it.
   */
  addMobEars(group, head, look = {}) {
    const style = look.ears;
    if (!style || style === 'none') return null;

    const target = head || group;
    const mainMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.mainColor || '#7c3aed') });
    const tipMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(look.earTipColor || '#111111') });
    const hasTip = Boolean(look.earTipColor) || style === 'pointed';

    const specs = {
      pointed: { length: 0.44, width: 0.11, depth: 0.08, tiltZ: 0.55, tiltX: -0.18, tip: 0.38, offsetX: 0.20, lift: 0.26 },
      long: { length: 0.55, width: 0.09, depth: 0.08, tiltZ: 0.16, tiltX: 0, tip: 0.22, offsetX: 0.14, lift: 0.28 },
      round: { length: 0.14, width: 0.16, depth: 0.08, tiltZ: 0.10, tiltX: 0, tip: 0, offsetX: 0.18, lift: 0.25 }
    };
    const spec = specs[style];
    if (!spec) return null;

    const ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width, spec.length, spec.depth),
        mainMat
      );
      ear.position.set(side * spec.offsetX, spec.lift + spec.length / 2, -0.02);
      ear.rotation.z = -side * spec.tiltZ;
      ear.rotation.x = spec.tiltX;

      if (hasTip && spec.tip > 0) {
        const tipLength = spec.length * spec.tip;
        const tip = new THREE.Mesh(
          new THREE.BoxGeometry(spec.width * 1.02, tipLength, spec.depth * 1.02),
          tipMat
        );
        tip.position.y = spec.length / 2 - tipLength / 2;
        ear.add(tip);
      }

      target.add(ear);
      ears.push(ear);
    }
    return ears;
  }

  /**
   * Attach a signature tail.
   *
   * The default quadruped tail is a short stub, and "lightning bolt" is an iconic
   * 3D zigzag bolt featuring a brown base segment and expanding into a wide blade.
   */
  addMobTail(group, look = {}, modelType = 'humanoid') {
    const style = look.tail;
    if (style !== 'lightning' && style !== 'long') return null;
    if (modelType === 'flying') return null;

    const tailColor = look.tailColor || look.mainColor || '#f7d02c';
    const rootColor = look.accentColor || '#8b4513';
    const tailMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(tailColor) });
    const rootMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(rootColor) });

    const backZ = modelType === 'quadruped' ? -0.55 : (modelType === 'biped_creature' ? -0.22 : -0.20);
    const baseY = modelType === 'quadruped' ? 0.70 : (modelType === 'biped_creature' ? 0.42 : 0.65);

    if (style === 'long') {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), tailMat);
      seg.position.set(0, baseY, backZ - 0.22);
      seg.rotation.x = -Math.PI / 5;
      group.add(seg);
      const arr = [seg];
      arr.traverse = (fn) => seg.traverse(fn);
      return arr;
    }

    // 3D Zigzag Lightning Bolt Tail (Authentic Pikachu Tail)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, baseY, backZ);

    // Segment 1: Brown root segment extending up and back from lower spine
    const seg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.10, 0.22), rootMat);
    seg1.position.set(0, 0.05, -0.10);
    seg1.rotation.x = -0.4;
    tailGroup.add(seg1);

    // Segment 2: Stepping upward and back, yellow
    const seg2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.16), tailMat);
    seg2.position.set(0.04, 0.18, -0.24);
    seg2.rotation.x = -0.2;
    seg2.rotation.y = 0.15;
    tailGroup.add(seg2);

    // Segment 3: Zigzag step outward / up
    const seg3 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.18), tailMat);
    seg3.position.set(-0.04, 0.32, -0.36);
    seg3.rotation.x = -0.3;
    seg3.rotation.y = -0.15;
    tailGroup.add(seg3);

    // Segment 4: Zigzag step up / back
    const seg4 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.20), tailMat);
    seg4.position.set(0.06, 0.48, -0.48);
    seg4.rotation.x = -0.25;
    seg4.rotation.y = 0.12;
    tailGroup.add(seg4);

    // Segment 5: Wide lightning bolt blade tip!
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.08), tailMat);
    blade.position.set(-0.02, 0.68, -0.62);
    blade.rotation.x = -0.35;
    blade.rotation.z = 0.25;
    tailGroup.add(blade);

    const bolts = [seg1, seg2, seg3, seg4, blade];
    bolts.traverse = (fn) => tailGroup.traverse(fn);
    bolts.tailGroup = tailGroup;
    group.add(tailGroup);
    return bolts;
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

  createTrainerTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Orange Gi Base
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 0, 64, 64);

    // Head (0,0, 32, 16)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 32, 16);
    // Face (8, 8, 8, 8)
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(8, 8, 8, 8);
    // Eyes & bushy eyebrows
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(9, 10, 2, 1);
    ctx.fillRect(13, 10, 2, 1);
    // White beard / mustache
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(10, 13, 4, 3);

    // Torso (16, 16, 24, 16)
    ctx.fillStyle = '#ea580c'; // Orange Gi
    ctx.fillRect(16, 16, 24, 16);
    // Dark Blue Undershirt V
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(22, 20, 4, 4);
    // Martial Arts Circular Kanji Badge on Chest
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(22, 23, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.fillRect(21, 22, 2, 2);
    // Dark Blue Belt / Sash at waist
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(16, 28, 24, 4);

    // Arms: Orange sleeves with blue wristbands
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(40, 16, 16, 32);
    ctx.fillStyle = '#1d4ed8'; // blue wristbands
    ctx.fillRect(40, 26, 16, 2);
    ctx.fillStyle = '#f8c29d'; // skin hands
    ctx.fillRect(44, 28, 4, 4);

    // Legs: Orange pants with dark boots
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 16, 16, 32);
    ctx.fillStyle = '#111111'; // black martial shoes
    ctx.fillRect(4, 28, 4, 4);
    ctx.fillRect(12, 28, 4, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createJackieChunTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // 1. Dark navy kung fu changshan robe base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 64, 64);

    // 2. Head (0,0 to 32,16)
    // Bald tan head top and back
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(0, 0, 32, 16);
    // White hair side puffs (ears and back)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 8, 8, 8); // Right side hair
    ctx.fillRect(16, 8, 8, 8); // Left side hair
    ctx.fillRect(24, 8, 8, 8); // Back hair

    // Face front (8, 8, 8, 8)
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(8, 8, 8, 8);
    // Dark sunglasses across face
    ctx.fillStyle = '#090d16';
    ctx.fillRect(8, 9, 8, 3);
    // Sunglasses white glint reflection
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(9, 9, 1, 1);
    ctx.fillRect(13, 9, 1, 1);
    // Thick bushy white mustache below sunglasses
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 12, 8, 2);
    // White beard goatee extending to chin
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(10, 14, 4, 2);

    // 3. Torso (16, 16, 24, 16)
    // Dark kung fu jacket
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(16, 16, 24, 16);
    // White center seam & button closures
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(23, 16, 2, 16);
    // White sash around waist
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(16, 28, 24, 4);

    // 4. Arms & Legs
    // Sleeves with bold white cuffs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 16, 16, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 26, 16, 6); // Cuffs
    // Tan bare hands
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(44, 28, 4, 4);

    // Kung fu trousers (navy) and black kung fu slippers with white socks
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 16, 16, 32);
    // White ankle socks
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 42, 16, 3);
    // Black martial arts slippers
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 45, 16, 3);

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
      case 'iron_golem':
      case 'golem': return { width: 1.4, height: 2.7 };
      case 'quadruped': return { width: 0.9, height: 1.2 };
      case 'flying': return { width: 1.0, height: 1.2 };
      case 'slime': return { width: 0.8, height: 0.8 };
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
      case 'site_manager': return { width: 0.6, height: 1.95 };
      case 'jackie_chun': return { width: 0.6, height: 1.85 };
      case 'enderman': return { width: 0.5, height: 2.85 };
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

  // --- BIOME MOBS ---
  spawnMooshroom(x, y, z) {
    const group = new THREE.Group();
    const redMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const body = new THREE.Mesh(createBoxWithUV(0.8, 0.7, 1.1, 28, 8, 64, 32), redMat);
    body.position.y = 0.75;
    group.add(body);

    const head = new THREE.Mesh(createBoxWithUV(0.45, 0.45, 0.45, 0, 0, 64, 32), redMat);
    head.position.set(0, 1.05, 0.65);
    group.add(head);

    // Mushrooms on back
    const shroomGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const m1 = new THREE.Mesh(shroomGeo, redMat); m1.position.set(0.15, 1.25, 0.1); group.add(m1);
    const m2 = new THREE.Mesh(shroomGeo, redMat); m2.position.set(-0.15, 1.25, -0.2); group.add(m2);

    const legGeo = createBoxWithUV(0.22, 0.45, 0.22, 0, 16, 64, 32);
    const fl = new THREE.Mesh(legGeo, redMat); fl.position.set(-0.24, 0.22, 0.35); group.add(fl);
    const fr = new THREE.Mesh(legGeo, redMat); fr.position.set(0.24, 0.22, 0.35); group.add(fr);
    const bl = new THREE.Mesh(legGeo, redMat); bl.position.set(-0.24, 0.22, -0.35); group.add(bl);
    const br = new THREE.Mesh(legGeo, redMat); br.position.set(0.24, 0.22, -0.35); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'mooshroom',
      name: 'Mooshroom',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      health: 14,
      maxHealth: 14,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnPolarBear(x, y, z) {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 1.4), whiteMat);
    body.position.y = 0.85;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.6), whiteMat);
    head.position.set(0, 1.15, 0.85);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.3), darkMat);
    snout.position.set(0, 1.05, 1.2);
    group.add(snout);

    const legGeo = new THREE.BoxGeometry(0.3, 0.55, 0.3);
    const fl = new THREE.Mesh(legGeo, whiteMat); fl.position.set(-0.32, 0.28, 0.45); group.add(fl);
    const fr = new THREE.Mesh(legGeo, whiteMat); fr.position.set(0.32, 0.28, 0.45); group.add(fr);
    const bl = new THREE.Mesh(legGeo, whiteMat); bl.position.set(-0.32, 0.28, -0.45); group.add(bl);
    const br = new THREE.Mesh(legGeo, whiteMat); br.position.set(0.32, 0.28, -0.45); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'polar_bear',
      name: 'Polar Bear',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      health: 30,
      maxHealth: 30,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnPanda(x, y, z) {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x18181b });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.85, 1.2), whiteMat);
    body.position.y = 0.8;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.55, 0.55), whiteMat);
    head.position.set(0, 1.1, 0.75);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.25), blackMat);
    snout.position.set(0, 0.98, 1.05);
    group.add(snout);

    const legGeo = new THREE.BoxGeometry(0.28, 0.5, 0.28);
    const fl = new THREE.Mesh(legGeo, blackMat); fl.position.set(-0.3, 0.25, 0.4); group.add(fl);
    const fr = new THREE.Mesh(legGeo, blackMat); fr.position.set(0.3, 0.25, 0.4); group.add(fr);
    const bl = new THREE.Mesh(legGeo, blackMat); bl.position.set(-0.3, 0.25, -0.4); group.add(bl);
    const br = new THREE.Mesh(legGeo, blackMat); br.position.set(0.3, 0.25, -0.4); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'panda',
      name: 'Panda',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
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

  spawnWarden(x, y, z) {
    const group = new THREE.Group();
    const sculkMat = new THREE.MeshLambertMaterial({ color: 0x0f2e3a });
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x06b6d4 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.7), sculkMat);
    torso.position.y = 1.9;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.7), sculkMat);
    head.position.set(0, 2.9, 0);
    group.add(head);

    // Horns
    const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), cyanMat); hornL.position.set(-0.55, 3.4, 0); group.add(hornL);
    const hornR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), cyanMat); hornR.position.set(0.55, 3.4, 0); group.add(hornR);

    // Glowing core
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.1), cyanMat); core.position.set(0, 2.0, 0.36); group.add(core);

    const armGeo = new THREE.BoxGeometry(0.4, 1.5, 0.4);
    const leftArm = new THREE.Mesh(armGeo, sculkMat); leftArm.position.set(-0.85, 1.8, 0); group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, sculkMat); rightArm.position.set(0.85, 1.8, 0); group.add(rightArm);

    const legGeo = new THREE.BoxGeometry(0.45, 1.2, 0.45);
    const leftLeg = new THREE.Mesh(legGeo, sculkMat); leftLeg.position.set(-0.35, 0.6, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, sculkMat); rightLeg.position.set(0.35, 0.6, 0); group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'warden',
      name: 'Warden',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      health: 500,
      maxHealth: 500,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      attackCooldown: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnBlaze(x, y, z) {
    const group = new THREE.Group();
    const blazeMat = new THREE.MeshLambertMaterial({ color: 0xf59e0b });
    const rodMat = new THREE.MeshLambertMaterial({ color: 0xfbbf24 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), blazeMat);
    head.position.y = 1.3;
    group.add(head);

    // Orbiting blaze rods
    const rodGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(Math.cos(angle) * 0.45, 1.0 + (i % 2) * 0.25, Math.sin(angle) * 0.45);
      group.add(rod);
    }

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'blaze',
      name: 'Blaze',
      mesh: group,
      head: head,
      isFlying: true,
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

  spawnPiglin(x, y, z) {
    const group = new THREE.Group();
    const pigMat = new THREE.MeshLambertMaterial({ color: 0xf472b6 });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), pigMat);
    head.position.y = 1.6;
    group.add(head);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.28), goldMat);
    body.position.y = 0.95;
    group.add(body);

    const armGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftArm = new THREE.Mesh(armGeo, pigMat); leftArm.position.set(-0.35, 0.95, 0); group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, pigMat); rightArm.position.set(0.35, 0.95, 0); group.add(rightArm);

    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftLeg = new THREE.Mesh(legGeo, goldMat); leftLeg.position.set(-0.13, 0.38, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, goldMat); rightLeg.position.set(0.13, 0.38, 0); group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'piglin',
      name: 'Piglin',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      health: 16,
      maxHealth: 16,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnGhast(x, y, z) {
    const group = new THREE.Group();
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), whiteMat);
    body.position.y = 1.8;
    group.add(body);

    // Tentacles
    const tentacleGeo = new THREE.BoxGeometry(0.15, 0.8, 0.15);
    for (let i = 0; i < 9; i++) {
      const t = new THREE.Mesh(tentacleGeo, whiteMat);
      t.position.set(((i % 3) - 1) * 0.5, 0.5, (Math.floor(i / 3) - 1) * 0.5);
      group.add(t);
    }

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'ghast',
      name: 'Ghast',
      mesh: group,
      isFlying: true,
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

  spawnMagmaCube(x, y, z) {
    const group = new THREE.Group();
    const cubeMat = new THREE.MeshLambertMaterial({ color: 0xc2410c });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), cubeMat);
    body.position.y = 0.4;
    group.add(body);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'magma_cube',
      name: 'Magma Cube',
      mesh: group,
      health: 16,
      maxHealth: 16,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnShulker(x, y, z) {
    const group = new THREE.Group();
    const purpurMat = new THREE.MeshLambertMaterial({ color: 0x9333ea });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xfacc15 });

    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), purpurMat);
    shell.position.y = 0.35;
    group.add(shell);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), headMat);
    head.position.y = 0.45;
    group.add(head);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'shulker',
      name: 'Shulker',
      mesh: group,
      health: 30,
      maxHealth: 30,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
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

  // --- DRAGON BALL TRAINING SITE MANAGERS ---
  spawnSiteManager(x, y, z, siteInfo = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.site_manager || this.textures.villager,
      transparent: true,
      alphaTest: 0.1
    });

    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    const armGeo = createBoxWithUV(0.22, 0.75, 0.22, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.37, 0.75, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.37, 0.75, 0);
    group.add(rightArm);

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
      type: 'site_manager',
      siteId: siteInfo.id || 'general',
      name: siteInfo.managerName || 'Training Site Master',
      role: siteInfo.managerRole || 'Instructor',
      dialogue: siteInfo.dialogue || '',
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
      state: 'trainer',
      timer: 0,
      hitCooldown: 0,
      noLoot: true
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- JACKIE CHUN (WORLD TOURNAMENT CHALLENGER) ---
  spawnJackieChun(x, y, z, options = {}) {
    const difficulty = options.difficulty || 'normal';
    const isClone = !!options.isClone;
    const isPlayerControlled = !!options.isPlayerControlled;

    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.jackie_chun || this.createJackieChunTexture(),
      transparent: true,
      alphaTest: 0.1
    });

    // Master Roshi / Jackie Chun dimensions:
    // Head: 0.44 x 0.44 x 0.44
    const headGeo = createBoxWithUV(0.44, 0.44, 0.44, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.48;
    group.add(head);

    // 3D Sunglasses Frame across front of head
    const glassesMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const glassesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.06), glassesMat);
    glassesMesh.position.set(0, 0.03, 0.23);
    head.add(glassesMesh);

    // Gold temples on sides of glasses
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const templeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), goldMat);
    templeL.position.set(-0.23, 0.03, 0.12);
    head.add(templeL);
    const templeR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), goldMat);
    templeR.position.set(0.23, 0.03, 0.12);
    head.add(templeR);

    // 3D Bushy White Mustache
    const hairMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.08), hairMat);
    mustache.position.set(0, -0.06, 0.24);
    head.add(mustache);

    // 3D White Goatee Beard
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), hairMat);
    beard.position.set(0, -0.16, 0.23);
    head.add(beard);

    // White Hair side puffs
    const hairPuffL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.24), hairMat);
    hairPuffL.position.set(-0.23, -0.02, 0);
    head.add(hairPuffL);
    const hairPuffR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.24), hairMat);
    hairPuffR.position.set(0.23, -0.02, 0);
    head.add(hairPuffR);

    // Torso: 0.44 x 0.62 x 0.24
    const torsoGeo = createBoxWithUV(0.44, 0.62, 0.24, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.98;
    group.add(torso);

    // Arms: 0.16 x 0.62 x 0.16
    const armGeo = createBoxWithUV(0.16, 0.62, 0.16, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.31, 0.98, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.31, 0.98, 0);
    group.add(rightArm);

    // Legs: 0.18 x 0.68 x 0.18
    const legGeo = createBoxWithUV(0.18, 0.68, 0.18, 0, 16, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.11, 0.34, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.11, 0.34, 0);
    group.add(rightLeg);

    // If clone, slight ethereal shimmer
    if (isClone) {
      mat.opacity = 0.88;
    }
    // 3D Luminous Ki Aura (Martial Arts Energy Field around Jackie Chun)
    const auraGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.85, 16, 1, true);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const kiAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    kiAuraMesh.position.y = 0.95;
    group.add(kiAuraMesh);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    let baseHp = 100;
    let punchDmg = 4;
    let kameDmg = 12;
    let teleCd = 4.5;
    let splitCd = 18;

    if (difficulty === 'easy') {
      baseHp = 60;
      punchDmg = 2;
      kameDmg = 8;
      teleCd = 6.0;
      splitCd = 28;
    } else if (difficulty === 'hard') {
      baseHp = 160;
      punchDmg = 6;
      kameDmg = 18;
      teleCd = 2.8;
      splitCd = 12;
    }

    const maxHp = isClone ? Math.max(1, Math.round(baseHp / 4)) : baseHp;
    const actualPunch = isClone ? Math.max(1, Math.floor(punchDmg / 3)) : punchDmg;
    const actualKame = isClone ? Math.max(2, Math.floor(kameDmg / 4)) : kameDmg;

    const mob = {
      type: 'jackie_chun',
      name: isClone ? 'Jackie Chun (Illusion Clone)' : 'World Martial Arts Challenger: Jackie Chun',
      mesh: group,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      mat,
      kiAuraMesh,
      kiAuraMat: auraMat,
      auraSparkTimer: 0,
      chargeSphereGroup: null,
      health: maxHp,
      maxHealth: maxHp,
      difficulty,
      isBoss: !isClone,
      isClone,
      isPlayerControlled,
      punchDamage: actualPunch,
      kamehamehaDamage: actualKame,
      teleportCooldown: teleCd,
      baseTeleportCooldown: teleCd,
      shadowSplitCooldown: splitCd,
      baseShadowSplitCooldown: splitCd,
      kamehamehaCooldown: 2.2 + Math.random() * 1.5,
      kamehamehaChargeTimer: 0,
      isChargingKamehameha: false,
      attackCooldown: 0,
      hitCooldown: 0,
      velocity: new THREE.Vector3(),
      yaw: 0,
      clones: []
    };

    this.mobs.push(mob);
    return mob;
  }

  ensureJackieChargeSphere(mob) {
    if (!mob || !mob.mesh) return null;
    if (mob.chargeSphereGroup) return mob.chargeSphereGroup;

    const group = new THREE.Group();
    // Inner pure white core
    const coreGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Outer luminous cyan plasma
    const outerGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    group.add(outer);

    group.position.set(0, 0.95, 0.55);
    mob.mesh.add(group);
    mob.chargeSphereGroup = group;
    mob.chargeSphereCore = core;
    mob.chargeSphereOuter = outer;
    return group;
  }

  removeJackieChargeSphere(mob) {
    if (!mob || !mob.chargeSphereGroup) return;
    mob.mesh.remove(mob.chargeSphereGroup);
    mob.chargeSphereGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    mob.chargeSphereGroup = null;
    mob.chargeSphereCore = null;
    mob.chargeSphereOuter = null;
  }

  teleportJackieChun(mob, targetX = null, targetY = null, targetZ = null) {
    if (!mob || !mob.mesh) return;
    const oldPos = mob.mesh.position.clone();
    this.entities?.spawnEndermanParticles(oldPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 22);

    let newX = targetX;
    let newY = targetY;
    let newZ = targetZ;

    if (newX === null || newZ === null) {
      newX = (Math.random() - 0.5) * 13;
      newZ = (Math.random() - 0.5) * 13;
      newY = 24.5;
    }

    mob.mesh.position.set(newX, newY, newZ);
    mob.velocity.set(0, 0, 0);

    this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 22);
    if (this.sounds?.playEndermanTeleport) {
      this.sounds.playEndermanTeleport();
    }
  }

  shadowSplit(mob) {
    if (!mob || mob.isClone || mob.isPlayerControlled) return [];
    if (mob.clones && mob.clones.length > 0) {
      for (const cl of mob.clones) {
        if (cl && cl.mesh) {
          this.scene.remove(cl.mesh);
          const idx = this.mobs.indexOf(cl);
          if (idx !== -1) this.mobs.splice(idx, 1);
        }
      }
      mob.clones = [];
    }

    const posOffsets = [
      { x: -4.5, z: -4.5 },
      { x: 4.5, z: -4.5 },
      { x: -4.5, z: 4.5 },
      { x: 4.5, z: 4.5 }
    ];

    const spots = [...posOffsets].sort(() => Math.random() - 0.5);
    const realSpot = spots[0];
    this.teleportJackieChun(mob, realSpot.x, 24.5, realSpot.z);

    const createdClones = [];
    for (let i = 1; i < 4; i++) {
      const s = spots[i];
      const clone = this.spawnJackieChun(s.x, 24.5, s.z, {
        difficulty: mob.difficulty,
        isClone: true
      });
      this.entities?.spawnEndermanParticles(clone.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 20);
      createdClones.push(clone);
    }

    mob.clones = createdClones;
    mob.shadowSplitCooldown = mob.baseShadowSplitCooldown || 18;

    if (this.game?.ui?.addChatMessage) {
      this.game.ui.addChatMessage('<span style="color:#38bdf8;font-weight:bold;">[Jackie Chun]</span> Zanzoken! Shadow Split illusion has created 4 Jackie Chuns!');
    }
    return createdClones;
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
      width: 0.5,
      height: 2.85,
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
      if (this.game?.tournamentActive) {
        // Tournament arena stage coordinates
        newX = (Math.random() - 0.5) * 14;
        newZ = (Math.random() - 0.5) * 14;
        newY = 24.5;
      } else {
        // Normal world: teleport around mob or player to a safe, valid ground block
        const refPos = (this.game?.player?.position && Math.random() < 0.6)
          ? this.game.player.position
          : mob.mesh.position;
        let found = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 6 + Math.random() * 10;
          const tx = Math.floor(refPos.x + Math.sin(angle) * dist);
          const tz = Math.floor(refPos.z + Math.cos(angle) * dist);
          const baseY = Math.floor(refPos.y);
          for (let ty = baseY + 5; ty >= baseY - 6; ty--) {
            if (this.isBlockSolid(tx, ty, tz) &&
                !this.isBlockSolid(tx, ty + 1, tz) &&
                !this.isBlockSolid(tx, ty + 2, tz) &&
                !this.isBlockSolid(tx, ty + 3, tz)) {
              newX = tx + 0.5;
              newY = ty + 1.0;
              newZ = tz + 0.5;
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (!found) {
          newX = mob.mesh.position.x + (Math.random() - 0.5) * 8;
          newZ = mob.mesh.position.z + (Math.random() - 0.5) * 8;
          newY = mob.mesh.position.y;
        }
      }
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
  spawnArrow(origin, direction, shooter, options) {
    return spawnArrow(this, origin, direction, shooter, options);
  }

  isTrainingSiteMob(mob) {
    if (!mob || !mob.mesh) return false;
    if (this.game && !this.game.tournament?.isTournamentMap) return false;
    const hostileTypes = ['zombie', 'skeleton', 'pillager', 'creeper', 'enderman'];
    if (!hostileTypes.includes(mob.type)) return false;

    if (this.game?.dungeonMode?.isActive) return true;

    const x = mob.mesh.position.x;
    const z = mob.mesh.position.z;
    // Punching Yard: x [28, 72], z [-18, 18]
    if (x >= 28 && x <= 72 && z >= -18 && z <= 18) return true;
    // Kamehameha Range: x [-72, -28], z [-18, 18]
    if (x >= -72 && x <= -28 && z >= -18 && z <= 18) return true;
    // Genki Dama Crater: x [-18, 18], z [-72, -28]
    if (x >= -18 && x <= 18 && z >= -72 && z <= -28) return true;
    // South Parkour: x [-18, 18], z [28, 72]
    if (x >= -18 && x <= 18 && z >= 28 && z <= 72) return true;
    // Central Tournament Arena: x [-32, 32], z [-32, 32]
    if (x >= -32 && x <= 32 && z >= -32 && z <= 32) return true;

    return false;
  }

  ensureHealthBar(mob) {
    if (typeof document === 'undefined') return;
    if (mob.healthBarSprite) return;

    const hostileTypes = ['zombie', 'skeleton', 'pillager', 'creeper', 'enderman'];
    if (!hostileTypes.includes(mob.type)) return;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(1.5, 0.42, 1.0);

    // Height offset based on mob dimensions
    let headY = 2.25;
    if (mob.type === 'enderman') headY = 3.25;
    else if (mob.type === 'creeper') headY = 1.95;

    sprite.position.set(0, headY, 0);
    mob.mesh.add(sprite);

    mob.healthBarCanvas = canvas;
    mob.healthBarCtx = ctx;
    mob.healthBarTexture = texture;
    mob.healthBarSprite = sprite;
    mob.lastRenderedHealth = -999;

    this.renderHealthBar(mob);
  }

  renderHealthBar(mob) {
    if (!mob.healthBarCanvas || !mob.healthBarCtx) return;
    const ctx = mob.healthBarCtx;
    const currentHealth = Math.max(0, Math.ceil(mob.health));
    const maxHealth = mob.maxHealth || 30;

    ctx.clearRect(0, 0, 256, 64);

    // 1. Dark container pill
    ctx.fillStyle = 'rgba(12, 14, 20, 0.88)';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(8, 8, 240, 48, 8);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(8, 8, 240, 48);
      ctx.strokeRect(8, 8, 240, 48);
    }

    // 2. Name & HP text
    ctx.font = 'bold 16px "Minecraft", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    const mobName = mob.type === 'enderman' ? 'Enderman' : (mob.name || (mob.type.charAt(0).toUpperCase() + mob.type.slice(1)));
    ctx.fillText(mobName, 18, 26);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ff4d4d';
    ctx.fillText(`❤ ${currentHealth} / ${maxHealth}`, 238, 26);

    // 3. Health bar background
    const barX = 18;
    const barY = 33;
    const barW = 220;
    const barH = 15;

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#300808';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 4);
      ctx.fill();
    } else {
      ctx.fillRect(barX, barY, barW, barH);
    }

    // 4. Health bar fill with color tiering
    const pct = Math.max(0, Math.min(1.0, currentHealth / maxHealth));
    if (pct > 0) {
      let fillColor = '#22c55e'; // Green
      if (pct <= 0.25) fillColor = '#ef4444'; // Red
      else if (pct <= 0.55) fillColor = '#f59e0b'; // Amber

      ctx.fillStyle = fillColor;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * pct, barH, 4);
        ctx.fill();
      } else {
        ctx.fillRect(barX, barY, barW * pct, barH);
      }
    }

    mob.healthBarTexture.needsUpdate = true;
    mob.lastRenderedHealth = mob.health;
  }

  damageMob(mob, amount, knockbackOrigin, isPunch = false) {
    if (mob.health <= 0 || mob.dying) return false;
    if (!isPunch && mob.hitCooldown > 0) return false;
    mob.health -= amount;
    mob.hitCooldown = isPunch ? 0.15 : 0.35;

    // Flash red
    if (mob.mat?.color) {
      mob.mat.color.setRGB(1.0, 0.2, 0.2);
    }
    mob.hurtTime = 0.18;

    // Update floating health bar immediately on damage
    if (this.isTrainingSiteMob(mob)) {
      this.ensureHealthBar(mob);
      this.renderHealthBar(mob);
    }

    // Apply knockback
    if (knockbackOrigin) {
      mob.fleeFrom = knockbackOrigin.clone();
      mob.fleeTime = 2.5;
      const kbDir = mob.mesh.position.clone().sub(knockbackOrigin);
      kbDir.y = 0;
      if (kbDir.lengthSq() > 0.001) kbDir.normalize();
      else kbDir.set(0, 0, 1);
      const isHeavyOrFlying = mob.isBoss || mob.isFlying || /dragon/i.test(mob.name || '');
      const kbFactor = isHeavyOrFlying ? 0.25 : 1.0;
      mob.knockback = kbDir.multiplyScalar((isPunch ? 3.5 : 6) * kbFactor);
      mob.velocity.y += (isPunch ? 1.8 : 4) * kbFactor;
    }

    const isDragon = mob.isFlying && (
      mob.customDef?.id === 'fire_dragon' ||
      /dragon/i.test(mob.name || '') ||
      /dragon/i.test(mob.customDef?.name || '')
    );
    if (isDragon && mob.health > 0) {
      if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
      // Counter-attack: if circling, high chance to immediately enrage into dive swoop!
      if (mob.dragonState === 'circling' && Math.random() < 0.65) {
        mob.dragonState = 'swooping';
        mob.dragonStateTimer = 4.0;
        mob.swoopTarget = knockbackOrigin ? knockbackOrigin.clone() : (this.game?.player?.position?.clone() || null);
      } else {
        mob.fireballCooldown = 0; // immediate counter fireball
      }
    }

    if (mob.type === 'iron_golem') this.sounds.playIronGolem();
    else if (mob.type === 'villager') this.sounds.playVillager();
    else if (mob.type === 'pillager') this.sounds.playPillager();
    else if (mob.type === 'zombie') this.sounds.playZombie();
    else if (mob.type === 'jackie_chun') {
      if (this.sounds?.playHit) this.sounds.playHit();
      // Clone death check
      if (mob.isClone && mob.health <= 0) {
        this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 18);
        this.entities?.spawnDeathParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
        this.scene.remove(mob.mesh);
        const idx = this.mobs.indexOf(mob);
        if (idx !== -1) this.mobs.splice(idx, 1);
        return true;
      }
      // If real boss died, dispel clones
      if (!mob.isClone && mob.health <= 0 && mob.clones) {
        for (const cl of mob.clones) {
          if (cl && cl.mesh) {
            this.entities?.spawnEndermanParticles(cl.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 14);
            this.scene.remove(cl.mesh);
            const clIdx = this.mobs.indexOf(cl);
            if (clIdx !== -1) this.mobs.splice(clIdx, 1);
          }
        }
        mob.clones = [];
      }
      // Sudden teleport evasion on hit
      const evadeChance = (mob.difficulty === 'hard' ? 0.60 : mob.difficulty === 'easy' ? 0.25 : 0.45);
      if (Math.random() < evadeChance && mob.health > 0 && !mob.isPlayerControlled) {
        setTimeout(() => {
          if (mob && mob.health > 0 && !mob.dying) {
            this.teleportJackieChun(mob);
          }
        }, 90);
      }
    }
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

    // Pikachu retaliation: if attacked, it immediately retaliates with a Thunderbolt lightning attack on the attacker!
    const isPikachu = mob.isPikachu || Boolean(
      (mob.name && /pikachu/i.test(mob.name)) ||
      mob.type === 'pikachu' ||
      mob.customDef?.id === 'pikachu' ||
      (mob.look?.ears === 'pointed' && mob.look?.tail === 'lightning')
    );

    if (isPikachu && mob.health > 0) {
      this.entities?.spawnEndermanParticles?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 18);
      const player = this.game?.player;
      const targetPos = player?.position ? player.position.clone() : (knockbackOrigin ? knockbackOrigin.clone() : null);

      if (targetPos) {
        // Face player
        const toPlayer = targetPos.clone().sub(mob.mesh.position);
        mob.yaw = Math.atan2(toPlayer.x, toPlayer.z);
        if (mob.mesh) mob.mesh.rotation.y = mob.yaw;

        // Startled defensive hop backward
        const retreat = toPlayer.clone().negate();
        retreat.y = 0;
        if (retreat.lengthSq() > 0.01) retreat.normalize(); else retreat.set(0, 0, 1);
        mob.velocity.x = retreat.x * 5.0;
        mob.velocity.z = retreat.z * 5.0;
        mob.velocity.y = 4.2;
        mob.onGround = false;
        mob.wasInAir = true;

        // Strike lightning right on the attacker/player!
        this.strikeLightning(targetPos, 6, true);

        // Chat notification
        if (this.game?.ui?.addChatMessage) {
          this.game.ui.addChatMessage('<span style="color:#facc15;font-weight:bold;">⚡ Pikachu retaliated with Thunderbolt!</span>', 'system');
        }
      }
    }
    return true;
  }

  updateDeath(mob, dt) {
    if (!mob.dying) {
      mob.dying = true;
      if (mob.healthBarSprite) mob.healthBarSprite.visible = false;
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
    updateArrows(this, dt, player);

    // 2. Update Mobs AI & Physics
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];

      if (mob.hitCooldown > 0) mob.hitCooldown -= dt;

      mob.hurtTime = Math.max(0, (mob.hurtTime || 0) - dt);
      if (mob.hurtTime === 0 && !mob.dying) mob.mat.color.setRGB(1, 1, 1);

      // Overhead health bar for training & combat mobs
      const showHealthBars = this.game?.mechanisms
        ? this.game.mechanisms.isFeatureEnabled('hasOverheadHealthBars')
        : (this.game?.tournament?.isTournamentMap ?? true);

      if (showHealthBars && this.isTrainingSiteMob(mob)) {
        this.ensureHealthBar(mob);
        if (mob.healthBarSprite) {
          if (mob.health <= 0 || mob.dying) {
            mob.healthBarSprite.visible = false;
          } else {
            mob.healthBarSprite.visible = true;
            if (mob.health !== mob.lastRenderedHealth) {
              this.renderHealthBar(mob);
            }
          }
        }
      } else if (mob.healthBarSprite) {
        mob.healthBarSprite.visible = false;
      }

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
          const dist = dir.length();
          if (dist > 1.2) {
            dir.normalize();
            const targetYaw = Math.atan2(dir.x, dir.z);
            const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
            mob.yaw += turn * Math.min(1.0, 9 * dt);
            if (!mob.avoidTime || mob.avoidTime <= 0) {
              mob.velocity.x = Math.sin(mob.yaw) * 2.8;
              mob.velocity.z = Math.cos(mob.yaw) * 2.8;
            }
          } else {
            mob.velocity.x *= 0.5;
            mob.velocity.z *= 0.5;
          }

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
          const dist = dir.length();
          if (dist > 1.2) {
            dir.normalize();
            const targetYaw = Math.atan2(dir.x, dir.z);
            const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
            mob.yaw += turn * Math.min(1.0, 9 * dt);
            if (!mob.avoidTime || mob.avoidTime <= 0) {
              mob.velocity.x = Math.sin(mob.yaw) * 2.5;
              mob.velocity.z = Math.cos(mob.yaw) * 2.5;
            }
          } else {
            mob.velocity.x *= 0.5;
            mob.velocity.z *= 0.5;
          }

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
      } else if (mob.type === 'jackie_chun') {
        mob.attackCooldown = Math.max(0, (mob.attackCooldown ?? 0) - dt);
        mob.teleportCooldown = (mob.teleportCooldown ?? 4.5) - dt;

        // --- 1. Jackie Chun Martial Arts Ki Aura & Energy Sparks (Visual Effects like Goku) ---
        const isCharging = mob.isChargingKamehameha || (this.game?.tournament?.bossMob === mob && this.game?.tournament?.p2IsChargingKamehameha);
        if (mob.kiAuraMesh) {
          mob.kiAuraMesh.rotation.y += dt * 2.5;
          if (isCharging) {
            const flare = 1.25 + Math.sin(Date.now() * 0.02) * 0.18;
            mob.kiAuraMesh.scale.set(flare, 1.05, flare);
            if (mob.kiAuraMat) {
              mob.kiAuraMat.opacity = 0.65 + Math.sin(Date.now() * 0.025) * 0.15;
              mob.kiAuraMat.color.setHex(0x38bdf8);
            }
          } else {
            const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.06;
            mob.kiAuraMesh.scale.set(pulse, 1.0, pulse);
            if (mob.kiAuraMat) {
              mob.kiAuraMat.opacity = 0.28 + Math.sin(Date.now() * 0.004) * 0.08;
              mob.kiAuraMat.color.setHex(0x00f0ff);
            }
          }

          // Rising Ki sparks around Jackie Chun (just like Goku)
          mob.auraSparkTimer = (mob.auraSparkTimer ?? 0) - dt;
          if (mob.auraSparkTimer <= 0) {
            mob.auraSparkTimer = isCharging ? 0.08 : 0.35;
            const sparkPos = mob.mesh.position.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 0.7,
              0.2 + Math.random() * 1.3,
              (Math.random() - 0.5) * 0.7
            ));
            const skillsMgr = this.game.skills || this.game.dragonballSkills;
            skillsMgr?.spawnEnergySparks?.(sparkPos, isCharging ? 3 : 1, isCharging ? 0x38bdf8 : 0x00f0ff);
          }
        }

        if (mob.isPlayerControlled) {
          // Controlled by Player 2 keyboard inputs (handled via tournament.js)
        } else {
          mob.kamehamehaCooldown = (mob.kamehamehaCooldown ?? 3.5) - dt;
          if (!mob.isClone) {
            // Aggressive Shadow Split: count down faster in 1P mode to keep intense match pressure
            mob.shadowSplitCooldown = (mob.shadowSplitCooldown ?? 12.0) - dt * 1.6;

            // If all illusion clones were dispelled, Jackie Chun fast-tracks Zanzoken Shadow Split!
            if (mob.clones && mob.clones.length > 0) {
              const activeClones = mob.clones.filter(c => c.health > 0 && !c.dying && this.mobs.includes(c));
              if (activeClones.length === 0 && mob.shadowSplitCooldown > 3.0) {
                mob.shadowSplitCooldown = 2.5;
              }
            }
          }

          // 1. Shadow Split (Real Jackie Chun only)
          if (!mob.isClone && mob.shadowSplitCooldown <= 0) {
            this.shadowSplit(mob);
            // Dynamic aggressive reuse cooldown once performed
            mob.shadowSplitCooldown = (mob.difficulty === 'hard' ? 6.0 : mob.difficulty === 'easy' ? 12.0 : 8.5);
          }

          // 2. Sudden position change (teleport)
          if (mob.teleportCooldown <= 0) {
            mob.teleportCooldown = (mob.baseTeleportCooldown || 4.5) + Math.random() * 2.0;
            this.teleportJackieChun(mob);
          }

          // 3. Kamehameha charging & shooting (Aggressive in 1P mode)
          if (mob.isChargingKamehameha) {
            mob.kamehamehaChargeTimer -= dt;
            mob.velocity.x *= 0.82;
            mob.velocity.z *= 0.82;
            const toP = player.position.clone().sub(mob.mesh.position);
            toP.y = 0;
            if (toP.lengthSq() > 0.01) mob.yaw = Math.atan2(toP.x, toP.z);
            mob.mesh.rotation.y = mob.yaw;

            if (mob.leftArm && mob.rightArm) {
              mob.leftArm.rotation.set(-Math.PI / 2.3, 0.15, 0.25);
              mob.rightArm.rotation.set(-Math.PI / 2.3, -0.15, -0.25);
            }

            // Visual charge sphere in hands
            const sphere = mob.chargeSphereGroup || this.ensureJackieChargeSphere(mob);
            if (sphere) {
              const chargeProg = Math.max(0, 1.0 - (mob.kamehamehaChargeTimer / 0.85));
              const pulse = 0.5 + chargeProg * 0.8 + Math.sin(Date.now() * 0.03) * 0.12;
              sphere.scale.set(pulse, pulse, pulse);

              if (Math.random() < 0.45) {
                const worldPos = new THREE.Vector3();
                sphere.getWorldPosition(worldPos);
                const skillsMgr = this.game.skills || this.game.dragonballSkills;
                skillsMgr?.spawnEnergySparks?.(worldPos, 2, 0x00f0ff);
              }
            }

            if (mob.kamehamehaChargeTimer <= 0) {
              mob.isChargingKamehameha = false;
              this.removeJackieChargeSphere(mob);

              if (mob.leftArm && mob.rightArm) {
                mob.leftArm.rotation.set(-Math.PI / 2.0, 0, 0.05);
                mob.rightArm.rotation.set(-Math.PI / 2.0, 0, -0.05);
                setTimeout(() => {
                  if (mob && !mob.isChargingKamehameha) {
                    if (mob.leftArm) mob.leftArm.rotation.set(0, 0, 0);
                    if (mob.rightArm) mob.rightArm.rotation.set(0, 0, 0);
                  }
                }, 350);
              }

              // Aggressive cooldown: 2.6s - 4.5s in 1P mode
              mob.kamehamehaCooldown = (mob.difficulty === 'hard' ? 2.6 : mob.difficulty === 'easy' ? 4.8 : 3.4) + Math.random() * 1.4;
              const origin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
              const shootDir = player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(origin).normalize();

              // Jackie Chun's Kamehameha is 1.5x the width of Goku's beam (Goku max radius: 1.5 -> Jackie Chun: 2.25)
              const beamRadius = mob.isClone ? 1.5 : 2.25;
              const skillsMgr = this.game.skills || this.game.dragonballSkills;
              skillsMgr?.shootOpponentKamehameha?.(origin, shootDir, mob.kamehamehaDamage, beamRadius, mob);
              if (skillsMgr) {
                skillsMgr.shakeIntensity = 0.55;
              }
              this.sounds?.playKamehameha?.();
              skillsMgr?.spawnEnergySparks?.(origin.clone().add(shootDir.clone().multiplyScalar(1.2)), 16, 0x00f0ff);
            }
          } else if (mob.kamehamehaCooldown <= 0) {
            // Aggressive trigger: if player is very close, do a swift backstep leap before charging
            if (distToPlayer <= 2.2) {
              const backDir = player.position.clone().sub(mob.mesh.position).normalize();
              mob.velocity.x = -backDir.x * 4.5;
              mob.velocity.z = -backDir.z * 4.5;
              mob.velocity.y = 1.8;
            } else {
              mob.velocity.set(0, 0, 0);
            }
            mob.isChargingKamehameha = true;
            mob.kamehamehaChargeTimer = 0.85;
            this.ensureJackieChargeSphere(mob);
            this.sounds?.playKiCharge?.(false);
          } else {
            // 4. Martial Arts pursuit & Punch
            const dir = player.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            const dist = dir.length();
            if (dist > 1.2) {
              dir.normalize();
              const targetYaw = Math.atan2(dir.x, dir.z);
              const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
              mob.yaw += turn * Math.min(1.0, 10 * dt);
              if (!mob.avoidTime || mob.avoidTime <= 0) {
                const speed = (mob.difficulty === 'hard' ? 3.4 : mob.difficulty === 'easy' ? 2.6 : 3.0);
                mob.velocity.x = Math.sin(mob.yaw) * speed;
                mob.velocity.z = Math.cos(mob.yaw) * speed;
              }
            } else {
              mob.velocity.x *= 0.5;
              mob.velocity.z *= 0.5;
            }

            // Punch when close: Yellow shock waves visual effect identical to Goku's punch!
            if (dist < 2.0 && mob.attackCooldown <= 0) {
              player.takeDamage(mob.punchDamage);
              if (this.sounds?.playPunch) this.sounds.playPunch();
              if (this.sounds?.playHit) this.sounds.playHit();
              else this.sounds?.playZombie?.();
              mob.attackCooldown = (mob.difficulty === 'hard' ? 0.65 : mob.difficulty === 'easy' ? 1.0 : 0.78);
              if (mob.leftArm && mob.rightArm) {
                mob.rightArm.rotation.x = -Math.PI / 1.8;
                mob.leftArm.rotation.x = -Math.PI / 3.0;
                setTimeout(() => {
                  if (mob.rightArm) mob.rightArm.rotation.x = 0;
                  if (mob.leftArm) mob.leftArm.rotation.x = 0;
                }, 180);
              }

              // Spawn yellow martial arts punch shock wave forward towards player
              const punchDir = player.position.clone().sub(mob.mesh.position);
              punchDir.y = 0;
              if (punchDir.lengthSq() > 0.001) punchDir.normalize();
              else punchDir.set(Math.sin(mob.yaw), 0, Math.cos(mob.yaw));
              const punchOrigin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));

              const skillsMgr = this.game.skills || this.game.dragonballSkills;
              skillsMgr?.spawnPunchWave?.(punchOrigin, punchDir, 0xfacc15);
              skillsMgr?.spawnEnergySparks?.(player.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 12, 0xfacc15);
            }
          }
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
        if (dist > 1.2) {
          dir.normalize();
          const targetYaw = Math.atan2(dir.x, dir.z);
          const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
          mob.yaw += turn * Math.min(1.0, 9 * dt);
          if (!mob.avoidTime || mob.avoidTime <= 0) {
            const endermanSpeed = 3.4;
            mob.velocity.x = Math.sin(mob.yaw) * endermanSpeed;
            mob.velocity.z = Math.cos(mob.yaw) * endermanSpeed;
          }
        } else {
          mob.velocity.x *= 0.5;
          mob.velocity.z *= 0.5;
          const targetYaw = Math.atan2(dir.x, dir.z);
          mob.yaw = targetYaw;
        }

        // Melee attack
        if (dist < 1.8 && mob.attackCooldown <= 0) {
          player.takeDamage(5);
          if (this.sounds?.playZombie) this.sounds.playZombie();
          mob.attackCooldown = 0.9;
          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.x = -Math.PI / 2.2;
            mob.rightArm.rotation.x = -Math.PI / 2.2;
          }
        }
      } else if (mob.isCustomMob) {
        if (mob.isPreview) {
          mob.velocity.set(0, 0, 0);
          if (mob.wings) {
            const flap = Math.sin(Date.now() * 0.005) * 0.25;
            mob.wings.left.rotation.z = flap;
            mob.wings.right.rotation.z = -flap;
          }
          continue;
        }
        this.updateCustomMobAI(mob, dt, player);
      }

      if (mob.isFlying) {
        moveFlyingMob(this, mob, dt);
      } else {
        const moveSpeed = moveGroundMob(this, mob, dt);
        mob.walkCycle = (mob.walkCycle || 0) + moveSpeed * dt * 7;
        const legSwing = Math.sin(mob.walkCycle) * Math.min(0.8, moveSpeed * 0.4);
        if (mob.isPikachu) {
          // Pikachu bunny hop leg posture: tucked when airborne, flat when on ground
          if (!mob.onGround || mob.wasInAir) {
            if (mob.leftLeg && mob.rightLeg) {
              mob.leftLeg.rotation.x = 0.45;
              mob.rightLeg.rotation.x = 0.45;
            }
          } else {
            if (mob.leftLeg && mob.rightLeg) {
              mob.leftLeg.rotation.x = 0;
              mob.rightLeg.rotation.x = 0;
            }
          }
        } else if (mob.leftLeg && mob.rightLeg) {
          mob.leftLeg.rotation.x = legSwing;
          mob.rightLeg.rotation.x = -legSwing;
        } else if (Array.isArray(mob.legs)) {
          if (mob.legs.length === 4) {
            mob.legs[0].rotation.x = legSwing;
            mob.legs[1].rotation.x = -legSwing;
            mob.legs[2].rotation.x = -legSwing;
            mob.legs[3].rotation.x = legSwing;
          } else {
            for (let i = 0; i < mob.legs.length; i++) {
              if (mob.legs[i]) {
                mob.legs[i].rotation.x = (i % 2 === 0 ? legSwing : -legSwing);
              }
            }
          }
        }
      }
    }

    // Update custom projectiles (fireballs, etc.)
    if (this.customProjectiles && this.customProjectiles.length > 0) {
      for (let pIdx = this.customProjectiles.length - 1; pIdx >= 0; pIdx--) {
        const p = this.customProjectiles[pIdx];
        p.life -= dt;
        p.mesh.position.addScaledVector(p.velocity, dt);

        let hit = false;
        const hitThreshold = p.isDragonFireball ? 1.8 : 1.0;
        if (player && p.mesh.position.distanceTo(player.position) < hitThreshold) {
          player.takeDamage(p.damage);
          if (p.isDragonFireball && player.velocity) {
            const knock = p.velocity.clone().normalize();
            player.velocity.x += knock.x * 8;
            player.velocity.y += 6;
            player.velocity.z += knock.z * 8;
          }
          hit = true;
        }
        if (p.life <= 0 || hit) {
          if (p.isDragonFireball) {
            this.entities?.spawnDeathParticles?.(p.mesh.position.clone());
            if (this.sounds?.playExplosion) this.sounds.playExplosion();
          } else {
            this.entities?.spawnEndermanParticles(p.mesh.position, 8);
          }
          this.scene.remove(p.mesh);
          p.mesh.traverse?.(node => {
            if (node.isMesh) {
              node.geometry?.dispose();
              node.material?.dispose();
            }
          });
          this.customProjectiles.splice(pIdx, 1);
        }
      }
    }
  }

  updateCustomMobAI(mob, dt, player) {
    const isDragon = mob.isFlying && (
      mob.customDef?.id === 'fire_dragon' ||
      /dragon/i.test(mob.name || '') ||
      /dragon/i.test(mob.customDef?.name || '')
    );
    const isSurvival = player && player.gamemode !== 'creative';

    if (isDragon) {
      if (isSurvival) {
        this.updateDragonCombatAI(mob, dt, player);
      } else {
        this.updateDragonPeacefulAI(mob, dt, player);
      }
      return;
    }

    // 1. Wing flap animation
    if (mob.wings) {
      const flapSpeed = mob.isFlying ? 12.0 : 6.0;
      const flap = Math.sin((mob.walkCycle || 0) * flapSpeed + Date.now() * 0.006) * 0.4;
      mob.wings.left.rotation.z = flap;
      mob.wings.right.rotation.z = -flap;
    }

    // 2. Flying altitude control
    if (mob.isFlying) {
      const targetY = (player ? player.position.y : 5) + 1.8;
      mob.velocity.y += (targetY - mob.mesh.position.y) * 2.0 * dt;
      mob.velocity.y = Math.max(-3, Math.min(3, mob.velocity.y));
    }

    const distToPlayer = player ? mob.mesh.position.distanceTo(player.position) : 999;

    // 3. Behavior Type logic
    if (mob.behaviorType === 'pet' || mob.followPlayer) {
      // Teleport if too far
      if (distToPlayer > 28 && player) {
        mob.mesh.position.set(
          player.position.x + (Math.random() - 0.5) * 3,
          player.position.y + 0.1,
          player.position.z + (Math.random() - 0.5) * 3
        );
        this.entities?.spawnEndermanParticles(mob.mesh.position, 12);
        this.sounds?.playPop?.();
      }

      // Find nearby hostile mobs to defend player
      let targetMob = null;
      let closestDist = 14;
      for (const m of this.mobs) {
        if (m !== mob && !m.isCustomMob && (m.type === 'zombie' || m.type === 'skeleton' || m.type === 'creeper' || m.type === 'enderman')) {
          const d = mob.mesh.position.distanceTo(m.mesh.position);
          if (d < closestDist) {
            closestDist = d;
            targetMob = m;
          }
        }
      }

      if (mob.isPikachu) {
        // --- Pikachu Bunny Hop & Loyal Pet AI ---
        mob.hopTimer = (mob.hopTimer || 0) - dt;

        // Cute tail wiggle
        if (mob.tailMesh) {
          mob.tailMesh.rotation.y = Math.sin(Date.now() * 0.012) * 0.22;
        }

        // Check if just landed from a hop
        if (mob.onGround && mob.wasInAir) {
          mob.wasInAir = false;
          mob.mesh.rotation.x = 0;
          if (mob.leftLeg && mob.rightLeg) {
            mob.leftLeg.rotation.x = 0;
            mob.rightLeg.rotation.x = 0;
          }
          if (mob.head) mob.head.rotation.x = 0;
          mob.velocity.x *= 0.25;
          mob.velocity.z *= 0.25;
          // Hop interval: short pause if following/chasing, longer playful pause if nearby
          mob.hopTimer = (distToPlayer > 3.2 || targetMob) ? (0.16 + Math.random() * 0.12) : (0.75 + Math.random() * 0.9);
        }

        if (targetMob) {
          // Bunny leap towards hostile mob to defend owner
          const dir = targetMob.mesh.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.mesh.rotation.y = mob.yaw;

          if (mob.onGround && mob.hopTimer <= 0) {
            mob.velocity.y = 4.8;
            mob.velocity.x = dir.x * (mob.speed * 1.3);
            mob.velocity.z = dir.z * (mob.speed * 1.3);
            mob.wasInAir = true;
            mob.hopTimer = 0.35;
            this.sounds?.playPop?.();
          }

          if (closestDist < 2.2 && mob.hitCooldown <= 0) {
            this.damageMob(targetMob, mob.attackDamage, mob.mesh.position);
            mob.hitCooldown = 0.8;
            this.handleMobSkills(mob, targetMob.mesh.position, dt);
          }
        } else if (player) {
          const dirToPlayer = player.position.clone().sub(mob.mesh.position);
          dirToPlayer.y = 0;

          if (distToPlayer > 3.2) {
            // Far from player: hop actively to follow you!
            dirToPlayer.normalize();
            mob.yaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
            mob.mesh.rotation.y = mob.yaw;
            if (mob.hopTimer > 0.12) {
              mob.hopTimer = 0.05;
            }

            if (mob.onGround && mob.hopTimer <= 0) {
              const hopSpeed = (distToPlayer > 8) ? (mob.speed * 1.4) : (mob.speed * 1.1);
              mob.velocity.y = 4.6 + Math.random() * 0.5;
              mob.velocity.x = dirToPlayer.x * hopSpeed;
              mob.velocity.z = dirToPlayer.z * hopSpeed;
              mob.wasInAir = true;
              mob.hopTimer = 0.35;
              this.sounds?.playPop?.();
            }
          } else {
            // Near player: hop around playfully like a cute bunny!
            if (mob.onGround) {
              // Always look toward the player while resting on ground
              if (dirToPlayer.lengthSq() > 0.01) {
                mob.yaw = Math.atan2(dirToPlayer.x, dirToPlayer.z);
                mob.mesh.rotation.y = mob.yaw;
              }
              mob.velocity.x *= Math.exp(-6 * dt);
              mob.velocity.z *= Math.exp(-6 * dt);

              if (mob.hopTimer <= 0) {
                // Hop playfully in player's vicinity
                let hopAngle;
                if (distToPlayer < 1.5) {
                  // Polite spacing: hop back/sideways
                  const away = mob.mesh.position.clone().sub(player.position);
                  away.y = 0;
                  if (away.lengthSq() > 0.01) away.normalize(); else away.set(1, 0, 0);
                  hopAngle = Math.atan2(away.x, away.z) + (Math.random() - 0.5) * 1.0;
                } else {
                  // Hop in an arc around the player
                  hopAngle = mob.yaw + (Math.random() - 0.5) * 2.2;
                }
                mob.yaw = hopAngle;
                mob.mesh.rotation.y = hopAngle;
                const hopDir = new THREE.Vector3(Math.sin(hopAngle), 0, Math.cos(hopAngle));
                const hopSpd = 1.9 + Math.random() * 0.8;
                mob.velocity.y = 3.9 + Math.random() * 0.5;
                mob.velocity.x = hopDir.x * hopSpd;
                mob.velocity.z = hopDir.z * hopSpd;
                mob.wasInAir = true;
                mob.hopTimer = 0.35;
                this.sounds?.playPop?.();
              }
            }
          }

          // Self-heal if hurt
          if (mob.skills.includes('heal') && mob.health < mob.maxHealth * 0.7) {
            this.handleMobSkills(mob, null, dt);
          }
        }

        // Air pose while bunny hopping
        if (!mob.onGround || mob.wasInAir) {
          mob.mesh.rotation.x = -0.22;
          if (mob.leftLeg && mob.rightLeg) {
            mob.leftLeg.rotation.x = 0.45;
            mob.rightLeg.rotation.x = 0.45;
          }
          if (mob.head) mob.head.rotation.x = -0.12;
        }
      } else if (targetMob) {
        // Chase & attack hostile mob
        const dir = targetMob.mesh.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        mob.velocity.x = dir.x * (mob.speed * 1.2);
        mob.velocity.z = dir.z * (mob.speed * 1.2);

        if (closestDist < 1.8 && mob.hitCooldown <= 0) {
          this.damageMob(targetMob, mob.attackDamage, mob.mesh.position);
          mob.hitCooldown = 0.8;
          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.x = -Math.PI / 2.2;
            mob.rightArm.rotation.x = -Math.PI / 2.2;
          }
        }
        this.handleMobSkills(mob, targetMob.mesh.position, dt);
      } else {
        // Follow player gently
        if (distToPlayer > 3.5 && player) {
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * mob.speed;
          mob.velocity.z = dir.z * mob.speed;
        } else {
          mob.velocity.x *= 0.5;
          mob.velocity.z *= 0.5;
        }
        // Self-heal if hurt
        if (mob.skills.includes('heal') && mob.health < mob.maxHealth * 0.7) {
          this.handleMobSkills(mob, null, dt);
        }
      }
    } else if (mob.behaviorType === 'hostile' || mob.behaviorType === 'boss') {
      const detectRange = mob.customDef?.behavior?.range || (mob.behaviorType === 'boss' ? 24 : 18);
      if (distToPlayer < detectRange && player) {
        const dir = player.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 1.3) {
          dir.normalize();
          const targetYaw = Math.atan2(dir.x, dir.z);
          const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
          mob.yaw += turn * Math.min(1.0, 9 * dt);
          if (!mob.avoidTime || mob.avoidTime <= 0) {
            mob.velocity.x = Math.sin(mob.yaw) * mob.speed;
            mob.velocity.z = Math.cos(mob.yaw) * mob.speed;
          }
        } else {
          mob.velocity.x *= 0.5;
          mob.velocity.z *= 0.5;
        }

        // Melee attack
        if (distToPlayer < 1.7 && mob.hitCooldown <= 0) {
          player.takeDamage(mob.attackDamage);
          mob.hitCooldown = 1.0;
          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.x = -Math.PI / 2.2;
            mob.rightArm.rotation.x = -Math.PI / 2.2;
          }
          this.sounds?.playZombie?.();
        }

        // Skills
        this.handleMobSkills(mob, player.position, dt);
      } else {
        wanderMob(this, mob, dt, 1.0);
      }
    } else if (mob.behaviorType === 'neutral') {
      if (mob.targetEntity && mob.targetEntity.position) {
        const dir = mob.targetEntity.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        mob.velocity.x = dir.x * mob.speed;
        mob.velocity.z = dir.z * mob.speed;
        const d = mob.mesh.position.distanceTo(mob.targetEntity.position);
        if (d < 1.7 && mob.hitCooldown <= 0) {
          if (mob.targetEntity.takeDamage) {
            mob.targetEntity.takeDamage(mob.attackDamage);
          } else {
            this.damageMob(mob.targetEntity, mob.attackDamage, mob.mesh.position);
          }
          mob.hitCooldown = 1.0;
        }
      } else {
        wanderMob(this, mob, dt, 1.0);
      }
    } else {
      // Passive
      wanderMob(this, mob, dt, 1.0);
      if (mob.fleeTime > 0 && mob.fleeFrom) {
        mob.fleeTime -= dt;
        const escape = mob.mesh.position.clone().sub(mob.fleeFrom);
        escape.y = 0;
        escape.normalize();
        mob.yaw = Math.atan2(escape.x, escape.z);
        mob.velocity.x = escape.x * (mob.speed * 1.3);
        mob.velocity.z = escape.z * (mob.speed * 1.3);
      }
    }
  }

  updateDragonPeacefulAI(mob, dt, player) {
    const center = player ? player.position : new THREE.Vector3(0, 10, 0);
    mob.orbitAngle = (mob.orbitAngle || 0) + 0.35 * dt;
    const targetX = center.x + Math.sin(mob.orbitAngle) * 26;
    const targetZ = center.z + Math.cos(mob.orbitAngle) * 26;
    const targetY = center.y + 16 + Math.sin(Date.now() * 0.001) * 2;

    const toTarget = new THREE.Vector3(targetX - mob.mesh.position.x, targetY - mob.mesh.position.y, targetZ - mob.mesh.position.z);
    mob.velocity.x += (toTarget.x * 0.8 - mob.velocity.x) * 2.0 * dt;
    mob.velocity.y += (toTarget.y * 1.2 - mob.velocity.y) * 2.0 * dt;
    mob.velocity.z += (toTarget.z * 0.8 - mob.velocity.z) * 2.0 * dt;
  }

  updateDragonCombatAI(mob, dt, player) {
    mob.dragonState = mob.dragonState || 'circling';
    mob.dragonStateTimer = (mob.dragonStateTimer || 6.0) - dt;
    mob.fireballCooldown = (mob.fireballCooldown || 3.0) - dt;
    mob.roarCooldown = (mob.roarCooldown || 5.0) - dt;

    if (mob.roarCooldown <= 0) {
      mob.roarCooldown = 7.0 + Math.random() * 5.0;
      if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
      else if (this.sounds?.playExplosion) this.sounds.playExplosion();
    }

    // Trailing fiery breath/particles
    this.entities?.spawnFireParticles?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 1);

    const distToPlayer = mob.mesh.position.distanceTo(player.position);

    if (mob.dragonState === 'circling') {
      mob.orbitAngle = (mob.orbitAngle || 0) + (mob.speed * 0.55 / 20) * dt;
      const targetPos = player.position.clone().add(new THREE.Vector3(
        Math.sin(mob.orbitAngle) * 20,
        14 + Math.sin(Date.now() * 0.002) * 2.5,
        Math.cos(mob.orbitAngle) * 20
      ));
      const toTarget = targetPos.sub(mob.mesh.position);
      mob.velocity.x += (toTarget.x * 2.2 - mob.velocity.x) * 2.5 * dt;
      mob.velocity.y += (toTarget.y * 2.0 - mob.velocity.y) * 2.5 * dt;
      mob.velocity.z += (toTarget.z * 2.2 - mob.velocity.z) * 2.5 * dt;

      // Launch dragon fireball from high altitude
      if (mob.fireballCooldown <= 0) {
        mob.fireballCooldown = 3.5 + Math.random() * 2.5;
        const snoutPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.3, 0));
        this.spawnDragonFireball(snoutPos, player.position.clone().add(new THREE.Vector3(0, 0.5, 0)), mob.attackDamage || 15);
      }

      // Transition to swooping dive attack
      if (mob.dragonStateTimer <= 0) {
        mob.dragonState = 'swooping';
        mob.dragonStateTimer = 4.5;
        mob.swoopTarget = player.position.clone();
        if (this.sounds?.playDragonRoar) this.sounds.playDragonRoar();
      }
    } else if (mob.dragonState === 'swooping') {
      const toPlayer = player.position.clone().sub(mob.mesh.position);
      const dist = toPlayer.length();
      toPlayer.normalize();
      const diveSpeed = Math.max(9.5, (mob.speed || 4.6) * 2.2);

      mob.velocity.x += (toPlayer.x * diveSpeed - mob.velocity.x) * 3.8 * dt;
      mob.velocity.y += (toPlayer.y * diveSpeed - mob.velocity.y) * 3.8 * dt;
      mob.velocity.z += (toPlayer.z * diveSpeed - mob.velocity.z) * 3.8 * dt;

      // Strike player with dive swoop
      if (dist < 3.2) {
        player.takeDamage(mob.attackDamage || 15);
        const knock = mob.velocity.clone().normalize();
        if (player.velocity) {
          player.velocity.x += knock.x * 14;
          player.velocity.y += 9.5;
          player.velocity.z += knock.z * 14;
        }
        if (this.sounds?.playExplosion) this.sounds.playExplosion();
        this.entities?.spawnDeathParticles?.(player.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
        mob.dragonState = 'ascending';
        mob.dragonStateTimer = 3.2;
        mob.velocity.y = 8.5;
      } else if (mob.mesh.position.y <= player.position.y + 0.8 || mob.dragonStateTimer <= 0) {
        // Close to ground or timed out, pull up
        mob.dragonState = 'ascending';
        mob.dragonStateTimer = 3.2;
        mob.velocity.y = 8.5;
      }
    } else if (mob.dragonState === 'ascending') {
      mob.velocity.y += (8.5 - mob.velocity.y) * 4.0 * dt;
      if (mob.mesh.position.y >= player.position.y + 14 || mob.dragonStateTimer <= 0) {
        mob.dragonState = 'circling';
        mob.dragonStateTimer = 6.0 + Math.random() * 4.0;
        mob.orbitAngle = Math.atan2(mob.mesh.position.x - player.position.x, mob.mesh.position.z - player.position.z);
      }
    }
  }

  spawnDragonFireball(fromPos, toPos, damage = 15) {
    const dir = toPos.clone().sub(fromPos).normalize();
    const group = new THREE.Group();
    // Outer fiery shell
    const outerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2200 })
    );
    // Inner brilliant core
    const innerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffdd00 })
    );
    group.add(outerMesh);
    group.add(innerMesh);
    group.position.copy(fromPos);
    this.scene.add(group);

    this.customProjectiles = this.customProjectiles || [];
    this.customProjectiles.push({
      mesh: group,
      velocity: dir.multiplyScalar(16),
      damage,
      life: 3.5,
      isDragonFireball: true
    });
    if (this.sounds?.playBowShoot) this.sounds.playBowShoot();
  }

  handleMobSkills(mob, targetPos, dt) {
    if (!mob.skills || mob.skills.length === 0) return;
    mob.skillCooldown = (mob.skillCooldown || 3.0) - dt;
    if (mob.skillCooldown > 0) return;

    const skill = mob.skills[Math.floor(Math.random() * mob.skills.length)];

    if (skill === 'heal') {
      mob.health = Math.min(mob.maxHealth, mob.health + Math.round(mob.maxHealth * 0.25));
      this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 12);
      this.sounds?.playPop?.();
      mob.skillCooldown = 5.0;
      return;
    }

    if (!targetPos) return;

    if (skill === 'teleport') {
      const dir = targetPos.clone().sub(mob.mesh.position);
      dir.y = 0;
      dir.normalize();
      this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 10);
      mob.mesh.position.set(targetPos.x - dir.x * 2.2, targetPos.y, targetPos.z - dir.z * 2.2);
      this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)), 10);
      this.sounds?.playEndermanTeleport?.();
      mob.skillCooldown = 4.5;
    } else if (skill === 'leap') {
      const dir = targetPos.clone().sub(mob.mesh.position);
      dir.y = 0;
      dir.normalize();
      mob.velocity.y = 6.5;
      mob.velocity.x = dir.x * 4.5;
      mob.velocity.z = dir.z * 4.5;
      this.sounds?.playZombie?.();
      mob.skillCooldown = 4.0;
    } else if (skill === 'fireball') {
      this.spawnFireball(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), targetPos, (mob.attackDamage || 4) * 1.5);
      mob.skillCooldown = 3.5;
    } else if (skill === 'laser') {
      this.spawnLaserBeam(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), targetPos, (mob.attackDamage || 4) * 1.2);
      mob.skillCooldown = 4.0;
    } else if (skill === 'lightning') {
      this.strikeLightning(targetPos, (mob.attackDamage || 4) * 1.5);
      mob.skillCooldown = 5.0;
    } else if (skill === 'freeze') {
      this.entities?.spawnEndermanParticles(targetPos, 14);
      mob.skillCooldown = 4.5;
    }
  }

  spawnFireball(fromPos, toPos, damage = 6) {
    const dir = toPos.clone().sub(fromPos).normalize();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4500 })
    );
    mesh.position.copy(fromPos);
    this.scene.add(mesh);
    this.customProjectiles = this.customProjectiles || [];
    this.customProjectiles.push({
      mesh,
      velocity: dir.multiplyScalar(14),
      damage,
      life: 2.5
    });
  }

  spawnLaserBeam(fromPos, toPos, damage = 6) {
    const points = [fromPos, toPos];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ffff, linewidth: 3 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.entities?.spawnEndermanParticles(toPos, 8);
    setTimeout(() => {
      this.scene.remove(line);
      geo.dispose();
      mat.dispose();
    }, 180);
  }

  strikeLightning(targetPos, damage = 8, isCounterAttack = false) {
    if (!targetPos) return;

    // 1. Audio: thunder crack
    if (this.sounds?.playThunder) {
      this.sounds.playThunder();
    } else if (this.sounds?.playFireworkExplode) {
      this.sounds.playFireworkExplode();
    }

    // 2. 3D Visual Lightning Bolt
    if (this.scene && typeof this.scene.add === 'function') {
      const boltGroup = new THREE.Group();
      const startY = targetPos.y + 24;
      const steps = 8;
      const points = [];
      let curX = targetPos.x;
      let curZ = targetPos.z;

      for (let s = 0; s <= steps; s++) {
        const ratio = s / steps;
        const y = startY - ratio * 24;
        const jX = (s === steps) ? 0 : (Math.random() - 0.5) * 1.2;
        const jZ = (s === steps) ? 0 : (Math.random() - 0.5) * 1.2;
        points.push(new THREE.Vector3(curX + jX, y, curZ + jZ));
      }

      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffea00, transparent: true, opacity: 0.85 });

      for (let s = 0; s < steps; s++) {
        const p1 = points[s];
        const p2 = points[s + 1];
        const dist = p1.distanceTo(p2);
        const mid = p1.clone().add(p2).multiplyScalar(0.5);
        const dir = p2.clone().sub(p1).normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

        // Core white bolt
        const cGeo = new THREE.BoxGeometry(0.16, dist, 0.16);
        const cMesh = new THREE.Mesh(cGeo, coreMat);
        cMesh.position.copy(mid);
        cMesh.quaternion.copy(quat);
        boltGroup.add(cMesh);

        // Electric yellow glow sheath
        const gGeo = new THREE.BoxGeometry(0.36, dist, 0.36);
        const gMesh = new THREE.Mesh(gGeo, glowMat);
        gMesh.position.copy(mid);
        gMesh.quaternion.copy(quat);
        boltGroup.add(gMesh);
      }

      // Bright point light flash on ground
      const light = new THREE.PointLight(0xffea00, 7, 24);
      light.position.set(targetPos.x, targetPos.y + 2, targetPos.z);
      boltGroup.add(light);

      this.scene.add(boltGroup);

      // Fast flicker and removal
      let flicker = 0;
      const interval = setInterval(() => {
        flicker++;
        boltGroup.visible = (flicker % 2 === 0);
        if (flicker >= 6) {
          clearInterval(interval);
          this.scene.remove(boltGroup);
          boltGroup.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
          });
        }
      }, 35);
    }

    // 3. Particles
    this.entities?.spawnFireworkRocket?.(targetPos, targetPos.y + 8, [0xffffff, 0xfacc15, 0x38bdf8]);
    this.entities?.spawnEndermanParticles?.(targetPos.clone().add(new THREE.Vector3(0, 1, 0)), 20);

    // 4. Damage player if struck
    const player = this.game?.player;
    if (player && player.position && player.position.distanceTo(targetPos) < 3.2) {
      if (player.takeDamage) {
        player.takeDamage(damage);
      }
      if (player.velocity) {
        player.velocity.y = Math.max(player.velocity.y || 0, 4.2);
        const knock = player.position.clone().sub(targetPos);
        knock.y = 0;
        if (knock.lengthSq() > 0.01) knock.normalize(); else knock.set(0, 0, 1);
        player.velocity.x += knock.x * 3.5;
        player.velocity.z += knock.z * 3.5;
      }
    }

    // 5. Damage any nearby mobs (e.g. hostiles)
    if (this.mobs && Array.isArray(this.mobs)) {
      for (const m of this.mobs) {
        if (m && m.health > 0 && m.mesh && m.mesh.position) {
          const d = m.mesh.position.distanceTo(targetPos);
          if (d < 2.8 && !m.isCustomMob) {
            this.damageMob(m, damage, targetPos);
          }
        }
      }
    }
  }
}

