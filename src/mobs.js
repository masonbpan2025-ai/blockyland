import { createWitherSkeletonModel } from './witherSkeletonModel.js';
import { initializeWitherSkeleton, updateWitherSkeleton, hurtWitherSkeleton, dropWitherSkeletonLoot, updateWitherSkeletonSpawning, updateWolfWitherHunt } from './witherSkeleton.js';
import { updateMobWither } from './witherEffect.js';
import { isSquid, spawnSquid, updateSquid, hurtSquid, dropSquidLoot, updateSquidSpawning, updateSquidPredator } from './squidBehavior.js';
import {createZombifiedPiglinModel} from './zombifiedPiglinModel.js';
import {initializeZombified,isZombifiedPiglin,hurtZombified,dropZombifiedLoot,mountZombified} from './zombifiedPiglin.js';
import { createStriderModel } from './striderModel.js';
import { updateStrider, updateStriderSpawning, updateStriderExposure } from './striderBehavior.js';
import { updateHorseLead, releaseHorseLead } from './horseLead.js';
import { createHorseModel } from './horseModel.js';
import { createPackEquineModel, isPackEquine } from './packEquineModel.js';
import { packEquineStats, hurtPackEquine, dropPackEquineLoot, updateDonkeySpawning } from './packEquine.js';
import { isEquine, randomHorseStats } from './horseBehavior.js';
import { setMagmaSize, updateSnowballs } from './netherCombat.js';
import { updateBarterEffects } from './barterItems.js';
import { retaliateHoglins } from './netherMobAI.js';
import { separatePlayerFromMobs } from './mobPlayerCollision.js';
import { piglinTexture, angerPiglins, syncPiglinEquipment } from './piglin.js';
import * as THREE from 'three';
import { spawnArrow, updateArrows, removeArrow } from './arrows.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { wanderMob, moveGroundMob, moveFlyingMob, updateHazardEscape } from './mobMotion.js';
import { MobLibrary } from './mobLibrary.js';
import { AnimalBehaviors } from './animalBehaviors.js';
import { sheepApplyWool } from './sheepBehavior.js';
import { applyMooshroomVariant, MOOSHROOM_COLORS } from './mooshroomBehavior.js';
import { SALMON_SIZES, rollSalmonSize, salmonBonusDrops } from './salmonBehavior.js';
import { HostileMobBehaviors } from './hostileMobBehaviors.js';
import { initVillagerEconomy, updateVillagerWorkstation, updateZombieVillagerCuring } from './villagerEconomy.js';

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
    this.customProjectiles = [];
    // Mobs that threw while updating, plus a tally of distinct faults. A broken mob
    // is skipped rather than retried every frame, and each distinct error is reported
    // once so the console shows the cause instead of thousands of repeats.
    this.brokenMobs = new WeakSet();
    this.mobErrors = new Map();
    // Optional developer overlay. Labels are scene sprites so they remain
    // readable in 3D and do not affect normal gameplay when disabled.
    this.debugLabelsEnabled = false;
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
      chicken: this.loadTexture('/assets/entity/chicken.png'),
      creeper: this.loadTexture('/assets/entity/creeper.png'),
      skeleton: this.loadTexture('/assets/entity/skeleton.png'),
      salmon: this.createAquaticTexture('salmon'),
      dolphin: this.createAquaticTexture('dolphin'),
      octopus: this.createAquaticTexture('octopus'),
      squid: this.createAquaticTexture('octopus'),
      axolotl: this.createAquaticTexture('axolotl'),
      guardian: this.createAquaticTexture('guardian'),
      elder_guardian: this.createAquaticTexture('elder_guardian'),
      glow_squid: this.createAquaticTexture('glow_squid'),
      drowned: this.createAquaticTexture('drowned'),
      cod: this.createAquaticTexture('cod'),
      tournament_host: this.createHostTexture(),
      enderman: this.createEndermanTexture(),
      jackie_chun: this.createJackieChunTexture(),
      site_manager: this.createTrainerTexture(),
      cat_tuxedo: this.createCatTexture('tuxedo'),
      cat_tabby: this.createCatTexture('tabby'),
      cat_siamese: this.createCatTexture('siamese'),
      cat_british: this.createCatTexture('british'),
      ocelot: this.createCatTexture('ocelot'),
      wolf: this.createWolfTexture(),
      ghast_plain: this.createNetherTexture('ghast_plain'),
      ghast: this.createNetherTexture('ghast'),
      ghast_shooting: this.createNetherTexture('ghast_shooting'),
      fireball: this.createNetherTexture('fireball'),
      blaze_head: this.createNetherTexture('blaze_head'),
      blaze: this.createNetherTexture('blaze'),
      // Ravagers are raid mobs and need an actual skin rather than the
      // untextured gray placeholder that used to be used by spawnRavager.
      ravager: this.createRavagerTexture(),
      piglin: this.createNetherTexture('piglin'),
      zombified_piglin: this.createNetherTexture('zombified_piglin'),
      hoglin: this.createNetherTexture('hoglin'),
      magma_cube: this.createNetherTexture('magma_cube'),
      magma_cube_core: this.createNetherTexture('magma_cube_core'),
      strider: this.createNetherTexture('strider'),
      strider_cold: this.createNetherTexture('strider_cold'),
      wither_skeleton: this.createNetherTexture('wither_skeleton'),
      wither_skull: this.createNetherTexture('wither_skull')
    };

    this.animalBehaviors = new AnimalBehaviors(this, world, sounds, entities);
    this.hostileBehaviors = new HostileMobBehaviors(this, world, sounds, entities);
  }

  clearMobs() {
    for(const mob of this.mobs){for(const texture of mob.ownedTextures || [])texture.dispose();if(isSquid(mob)){for(const mat of mob.squidMaterials||[])mat.map?.dispose();}if(mob.laserLine){mob.laserLine.removeFromParent();mob.laserLine.geometry.dispose();mob.laserLine.material.dispose();mob.laserLine=null;}if(mob.leashLine){mob.leashLine.removeFromParent();mob.leashLine.geometry.dispose();mob.leashLine.material.dispose();mob.leashLine=null;}mob.leashHolder=null;}
    this.playerContactStart = null;
    for (const potion of this.splashPotions || []) { potion.mesh.removeFromParent(); potion.mesh.geometry.dispose(); potion.mesh.material.dispose(); }
    this.splashPotions = [];
    for (const mob of this.mobs) if (mob.glowOutline) { mob.glowOutline.removeFromParent(); mob.glowOutline.geometry.dispose(); mob.glowOutline.material.dispose(); }

    for (const arrow of [...this.arrows]) removeArrow(this, arrow);
    this.clearDebugLabels();
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
      if (mob.laserLine && this.scene) {
        this.scene.remove(mob.laserLine);
        mob.laserLine.geometry?.dispose();
        mob.laserLine.material?.dispose();
        mob.laserLine = null;
      }
      if (mob.mesh) {
        this.scene.remove(mob.mesh);
        mob.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
    }
    this.mobs = [];
  }

  /**
   * Enable or disable the mob inspection overlay. The pause menu owns the
   * toggle, while this method keeps the rendering concern inside MobManager so
   * labels also work for mobs spawned by raids and custom agents.
   */
  setDebugLabelsEnabled(enabled) {
    this.debugLabelsEnabled = Boolean(enabled);
    if (!this.debugLabelsEnabled) {
      this.clearDebugLabels();
      return false;
    }
    for (const mob of this.mobs) this.ensureDebugLabel(mob);
    return true;
  }

  clearDebugLabels() {
    for (const mob of this.mobs || []) {
      this.removeDebugLabel(mob);
    }
  }

  removeDebugLabel(mob) {
    const label = mob?.debugLabel;
    if (!label) return;
    label.parent?.remove(label);
    label.material?.map?.dispose?.();
    label.material?.dispose?.();
    mob.debugLabel = null;
    mob.debugLabelKey = null;
  }

  createDebugLabelTexture(text) {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    return texture;
  }

  ensureDebugLabel(mob) {
    if (!mob?.mesh || !this.scene) return null;
    const health = Number.isFinite(mob.health) ? Math.max(0, mob.health) : null;
    const maxHealth = Number.isFinite(mob.maxHealth) ? Math.max(1, mob.maxHealth) : null;
    const name = mob.name || String(mob.type || 'Mob').replace(/_/g, ' ');
    const title = name.replace(/\b\w/g, char => char.toUpperCase());
    const text = health === null
      ? title
      : `${title}  HP ${Math.ceil(health)}/${Math.ceil(maxHealth || health)}`;
    const key = `${text}|${this.debugLabelsEnabled}`;

    if (!mob.debugLabel) {
      const material = new THREE.SpriteMaterial({
        map: this.createDebugLabelTexture(text),
        transparent: true,
        depthTest: false,
        depthWrite: false
      });
      const label = new THREE.Sprite(material);
      label.name = `mob-debug-${mob.type || 'mob'}`;
      label.renderOrder = 1000;
      label.scale.set(2.7, 0.52, 1);
      this.scene.add(label);
      mob.debugLabel = label;
    } else if (mob.debugLabelKey !== key) {
      const nextTexture = this.createDebugLabelTexture(text);
      const previousTexture = mob.debugLabel.material?.map;
      mob.debugLabel.material.map = nextTexture;
      mob.debugLabel.material.needsUpdate = true;
      previousTexture?.dispose?.();
    }
    mob.debugLabelKey = key;
    mob.debugLabel.visible = this.debugLabelsEnabled && mob.health > 0 && !mob.dying;
    return mob.debugLabel;
  }

  /** Update label positions and health text once per rendered frame. */
  updateDebugLabels() {
    if (!this.debugLabelsEnabled) return;
    for (const mob of this.mobs || []) {
      const label = this.ensureDebugLabel(mob);
      if (!label || !label.visible) continue;
      const dims = this.getMobDimensions?.(mob.type) || { height: 1.4 };
      if (mob.mesh.getWorldPosition) {
        mob.mesh.getWorldPosition(label.position);
      } else {
        label.position.copy(mob.mesh.position);
      }
      label.position.y += Number.isFinite(mob.height) ? mob.height + 0.35 : (dims.height || 1.4) + 0.55;
    }
  }

  spawnParticleBurst(pos, color = 0xf43f5e, count = 8) {
    const scene = this.scene || this.entities?.scene;
    if (!scene) return;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.9 })
      );
      mesh.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        Math.random() * 0.4,
        (Math.random() - 0.5) * 0.6
      ));
      scene.add(mesh);
      if (this.entities?.particles) {
        this.entities.particles.push({
          mesh,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 1.2,
            0.8 + Math.random() * 1.5,
            (Math.random() - 0.5) * 1.2
          ),
          life: 0.8,
          death: true
        });
      } else {
        setTimeout(() => {
          scene.remove(mesh);
          mesh.geometry?.dispose();
          mesh.material?.dispose();
        }, 800);
      }
    }
  }

  spawnXpOrbs(pos, count = 1) {
    if (this.entities?.spawnXpOrbs) {
      this.entities.spawnXpOrbs(pos, count);
    }
  }

  spawnMob(type, x, y, z) {
    if (typeof type === 'object' && type !== null) {
      return this.spawnCustomMob(type, x, y, z);
    }
    if (typeof type === 'string' && (type.startsWith('custom_') || MobLibrary.getMob(type))) {
      const def = MobLibrary.getMob(type);
      if (def && !def.isBuiltin) return this.spawnCustomMob(def, x, y, z);
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
      case 'zombie_villager': return this.spawnZombieVillager(x, y, z);
      case 'skeleton': return this.spawnSkeleton(x, y, z);
      case 'creeper': return this.spawnCreeper(x, y, z);
      case 'pig': return this.spawnPig(x, y, z);
      case 'cow': return this.spawnCow(x, y, z);
      case 'sheep': return this.spawnSheep(x, y, z);
      case 'chicken': return this.spawnChicken(x, y, z);
      case 'cod': return this.spawnCod(x, y, z);
      case 'salmon': return this.spawnSalmon(x, y, z);
      case 'dolphin': return this.spawnDolphin(x, y, z);
      case 'octopus':
      case 'squid': return this.spawnSquid(x, y, z);
      case 'axolotl': return this.spawnAxolotl(x, y, z);
      case 'mooshroom': return this.spawnMooshroom(x, y, z);
      case 'polar_bear': return this.spawnPolarBear(x, y, z);
      case 'panda': return this.spawnPanda(x, y, z);
      case 'warden': return this.spawnWarden(x, y, z);
      case 'blaze': return this.spawnBlaze(x, y, z);
      case 'piglin': return this.spawnPiglin(x, y, z);
      case 'zombified_piglin':
      case 'zombie_pigman': return this.spawnZombifiedPiglin(x, y, z);
      case 'hoglin': return this.spawnHoglin(x, y, z);
      case 'zoglin': { const mob = this.spawnHoglin(x, y, z); mob.type = 'zoglin'; mob.name = 'Zoglin'; mob.fireImmune = true; return mob; }
      case 'ghast': return this.spawnGhast(x, y, z);
      case 'magma_cube': return this.spawnMagmaCube(x, y, z);
      case 'shulker': return this.spawnShulker(x, y, z);
      case 'horse': return this.spawnHorse(x, y, z);
      case 'mule': return this.spawnMule(x,y,z);
      case 'donkey': return this.spawnDonkey(x, y, z);
      case 'wolf': return this.spawnWolf(x, y, z);
      case 'cat': return this.spawnCat(x, y, z);
      case 'ocelot': return this.spawnOcelot(x, y, z);
      case 'slime': return this.spawnSlime(x, y, z);
      case 'witch': return this.spawnWitch(x, y, z);
      case 'wither_skeleton': return this.spawnWitherSkeleton(x, y, z);
      case 'strider': return this.spawnStrider(x, y, z);
      case 'guardian': return this.spawnGuardian(x, y, z, false);
      case 'elder_guardian': return this.spawnGuardian(x, y, z, true);
      case 'drowned': return this.spawnDrowned(x, y, z);
      case 'glow_squid': return this.spawnGlowSquid(x, y, z);
      case 'phantom': return this.spawnPhantom(x, y, z);
      case 'vindicator': return this.spawnVindicator(x, y, z);
      case 'evoker': return this.spawnEvoker(x, y, z);
      case 'vex': return this.spawnVex(x, y, z);
      case 'ravager': return this.spawnRavager(x, y, z);
      case 'ender_dragon': return this.spawnEnderDragon(x, y, z);
      case 'wither': return this.spawnWither(x, y, z);
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



  createChickenTexture(createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();
    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Default white feather fill
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, 64, 32);

    // Subtle feather variations
    ctx.fillStyle = '#ebebeb';
    for (let x = 0; x < 64; x += 4) {
      for (let y = 0; y < 32; y += 4) {
        if ((x + y) % 8 === 0) ctx.fillRect(x, y, 2, 2);
      }
    }

    // 1. Head (0, 0, 14, 9)
    // Eyes: front face is x: 3..6, y: 3..8
    ctx.fillStyle = '#141414';
    ctx.fillRect(3, 5, 1, 1); // left pupil
    ctx.fillRect(6, 5, 1, 1); // right pupil
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 4, 1, 1); // left gleam
    ctx.fillRect(6, 4, 1, 1); // right gleam

    // 2. Beak (14, 0, 8, 4)
    ctx.fillStyle = '#ee9b14';
    ctx.fillRect(14, 0, 8, 4);
    ctx.fillStyle = '#cd7d0c';
    ctx.fillRect(14, 2, 8, 2);

    // 3. Wattle (14, 4, 6, 4)
    ctx.fillStyle = '#cc2323';
    ctx.fillRect(14, 4, 6, 4);
    ctx.fillStyle = '#a01414';
    ctx.fillRect(14, 6, 6, 2);

    // 4. Legs & Claws (26, 0, 12, 11)
    ctx.fillStyle = '#eea519';
    ctx.fillRect(26, 0, 12, 11);
    ctx.fillStyle = '#d2870f';
    ctx.fillRect(26, 8, 12, 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createCatTexture(breed = 'tuxedo', createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();
    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Breed specific colors:
    let baseColor = '#1f1f23'; // Tuxedo charcoal black
    let chestColor = '#f3f4f6'; // Crisp white chest
    let eyeColor = '#22c55e'; // Emerald green
    let pupilColor = '#0f172a';
    let noseColor = '#f472b6'; // Cute pink
    let innerEarColor = '#f472b6';
    let pawColor = '#f3f4f6'; // White socks
    let hasSpots = false;
    let hasStripes = false;

    if (breed === 'tabby') {
      baseColor = '#ea580c'; // Warm orange
      chestColor = '#fed7aa'; // Cream
      eyeColor = '#84cc16'; // Hazel green
      pupilColor = '#451a03';
      noseColor = '#fb7185';
      innerEarColor = '#fbcfe8';
      pawColor = '#fed7aa';
      hasStripes = true;
    } else if (breed === 'siamese') {
      baseColor = '#f5ede0'; // Pale cream
      chestColor = '#fdfbf7';
      eyeColor = '#0284c7'; // Piercing sapphire blue
      pupilColor = '#0c4a6e';
      noseColor = '#3e2723';
      innerEarColor = '#4e342e';
      pawColor = '#3e2723'; // Seal brown points
    } else if (breed === 'british') {
      baseColor = '#64748b'; // Slate gray
      chestColor = '#94a3b8';
      eyeColor = '#f59e0b'; // Amber yellow
      pupilColor = '#1e293b';
      noseColor = '#475569';
      innerEarColor = '#f9a8d4';
      pawColor = '#64748b';
    } else if (breed === 'ocelot') {
      baseColor = '#eab308'; // Ocelot golden yellow
      chestColor = '#fef08a'; // Pale yellow
      eyeColor = '#10b981'; // Mint green
      pupilColor = '#451a03';
      noseColor = '#ea580c';
      innerEarColor = '#fbbf24';
      pawColor = '#eab308';
      hasSpots = true;
    }

    // 1. Base coat
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 64, 32);

    // Fur texture noise
    ctx.fillStyle = breed === 'tuxedo' ? '#2c2c34' : 'rgba(0, 0, 0, 0.08)';
    for (let x = 0; x < 64; x += 2) {
      for (let y = 0; y < 32; y += 2) {
        if ((x * 3 + y * 7) % 5 === 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    // 2. Head (u:0, v:0, tw:5, th:4, td:5)
    // Front face: x: 5 to 9, y: 5 to 8
    if (breed === 'siamese') {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(5, 5, 5, 4);
    }

    // Muzzle / Chin patch on face
    if (breed === 'tuxedo' || breed === 'tabby' || breed === 'ocelot') {
      ctx.fillStyle = chestColor;
      ctx.fillRect(6, 7, 3, 2);
    }

    // Eyes: left eye at (5, 6), right eye at (9, 6)
    ctx.fillStyle = eyeColor;
    ctx.fillRect(5, 6, 1, 1);
    ctx.fillRect(9, 6, 1, 1);
    // Vertical pupil slit
    ctx.fillStyle = pupilColor;
    ctx.fillRect(5, 6, 1, 1);
    ctx.fillRect(9, 6, 1, 1);
    ctx.fillStyle = eyeColor;
    ctx.fillRect(5, 6, 1, 1);
    ctx.fillRect(9, 6, 1, 1);
    // Eye shine
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, 5, 1, 1);
    ctx.fillRect(9, 5, 1, 1);

    // Pink nose at (7, 7)
    ctx.fillStyle = noseColor;
    ctx.fillRect(7, 7, 1, 1);

    // Whiskers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(3, 7, 2, 1);
    ctx.fillRect(10, 7, 2, 1);

    // 3. Snout (u:0, v:24, tw:3, th:2, td:1)
    ctx.fillStyle = (breed === 'tuxedo' || breed === 'tabby' || breed === 'ocelot') ? chestColor : baseColor;
    ctx.fillRect(0, 24, 8, 4);
    ctx.fillStyle = noseColor;
    ctx.fillRect(2, 25, 1, 1);

    // 4. Ears (Left u:0, v:10; Right u:6, v:10)
    ctx.fillStyle = innerEarColor;
    ctx.fillRect(1, 11, 1, 1);
    ctx.fillRect(7, 11, 1, 1);

    // 5. Body (u:20, v:0, tw:5, th:5, td:12)
    // Chest bib & belly
    if (breed === 'tuxedo' || breed === 'tabby' || breed === 'siamese' || breed === 'ocelot') {
      ctx.fillStyle = chestColor;
      ctx.fillRect(32, 12, 5, 4);
      ctx.fillRect(25, 0, 5, 10);
    }

    // Stripes for Tabby
    if (hasStripes) {
      ctx.fillStyle = '#9a3412';
      ctx.fillRect(22, 12, 1, 5);
      ctx.fillRect(25, 12, 1, 5);
      ctx.fillRect(28, 12, 1, 5);
      ctx.fillRect(38, 12, 1, 5);
      ctx.fillRect(41, 12, 1, 5);
    }

    // Spots for Ocelot
    if (hasSpots) {
      ctx.fillStyle = '#78350f';
      for (let sx = 22; sx < 44; sx += 4) {
        for (let sy = 3; sy < 16; sy += 3) {
          ctx.fillRect(sx, sy, 2, 2);
          ctx.fillStyle = '#ca8a04';
          ctx.fillRect(sx, sy, 1, 1);
          ctx.fillStyle = '#78350f';
        }
      }
    }

    // 6. Legs (u:40, v:0; u:40, v:12; u:48, v:0; u:48, v:12)
    ctx.fillStyle = pawColor;
    ctx.fillRect(40, 6, 8, 2);
    ctx.fillRect(40, 18, 8, 2);
    ctx.fillRect(48, 6, 8, 2);
    ctx.fillRect(48, 18, 8, 2);

    // 7. Tail (u:0, v:15)
    if (breed === 'tuxedo') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 15, 4, 2);
    } else if (breed === 'siamese') {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(0, 15, 6, 8);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createWolfTexture(createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();
    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Base light gray
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(0, 0, 64, 32);

    // Fur noise
    ctx.fillStyle = '#9ca3af';
    for (let x = 0; x < 64; x += 3) {
      for (let y = 0; y < 32; y += 3) {
        if ((x + y) % 6 === 0) ctx.fillRect(x, y, 1, 1);
      }
    }

    // Head (u:0, v:0) -> Front face at x: 6..11, y: 6..11
    ctx.fillStyle = '#111827';
    ctx.fillRect(7, 7, 1, 2);
    ctx.fillRect(10, 7, 1, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(7, 7, 1, 1);
    ctx.fillRect(10, 7, 1, 1);

    // Muzzle (u:0, v:10)
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(0, 10, 14, 7);
    ctx.fillStyle = '#111827';
    ctx.fillRect(5, 14, 2, 2); // Black nose

    // Ears (u:16, v:14)
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(16, 14, 8, 4);

    // Dorsal fur
    ctx.fillStyle = '#9ca3af';
    ctx.fillRect(24, 18, 12, 6);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createAquaticTexture(type) {
    if (typeof document === 'undefined') return new THREE.Texture();
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
    } else if (type === 'guardian') {
      // Prismarine teal base with geometric brick segments
      ctx.fillStyle = '#1e7b75';
      ctx.fillRect(0, 0, 64, 64);
      // Darker prismarine mortar grid
      ctx.fillStyle = '#13544f';
      for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 1, 64);
      for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 1);
      // Mottled prismarine scale highlights
      ctx.fillStyle = '#2db8ad';
      for (let i = 0; i < 48; i++) {
        const rx = (Math.floor(i * 13) % 8) * 8 + 2;
        const ry = (Math.floor(i * 7) % 8) * 8 + 2;
        ctx.fillRect(rx, ry, 3, 3);
      }
      // Eye socket area
      ctx.fillStyle = '#0e423e';
      ctx.fillRect(20, 20, 24, 24);
      // White sclera
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(22, 22, 20, 20);
      // Red-orange iris & dark pupil
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(26, 26, 12, 12);
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(28, 28, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(29, 29, 2, 2);
      // Spikes accent bar
      ctx.fillStyle = '#ea580c';
      ctx.fillRect(0, 56, 64, 8);
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(0, 60, 64, 4);
    } else if (type === 'elder_guardian') {
      // Ancient ivory-grey prismarine
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#64748b';
      for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 1, 64);
      for (let y = 0; y < 64; y += 8) ctx.fillRect(0, y, 64, 1);
      ctx.fillStyle = '#94a3b8';
      for (let i = 0; i < 40; i++) {
        const rx = (Math.floor(i * 11) % 8) * 8 + 2;
        const ry = (Math.floor(i * 5) % 8) * 8 + 2;
        ctx.fillRect(rx, ry, 4, 3);
      }
      // Eye socket
      ctx.fillStyle = '#475569';
      ctx.fillRect(20, 20, 24, 24);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(22, 22, 20, 20);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(26, 26, 12, 12);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(28, 28, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(29, 29, 2, 2);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, 56, 64, 8);
    } else if (type === 'glow_squid') {
      // Deep glowing dark cyan-navy mantle
      ctx.fillStyle = '#07262c';
      ctx.fillRect(0, 0, 64, 64);
      // Shading & mantle gradient
      ctx.fillStyle = '#04171a';
      ctx.fillRect(0, 0, 64, 14);
      ctx.fillRect(0, 50, 64, 14);
      // Bioluminescent spots and constellation of glowing stars
      ctx.fillStyle = '#06b6d4';
      for (let x = 4; x < 60; x += 8) {
        for (let y = 10; y < 54; y += 8) {
          ctx.fillRect(x + ((y % 16 === 0) ? 0 : 4), y, 3, 3);
        }
      }
      // Vibrant glowing cyan highlights
      ctx.fillStyle = '#22d3ee';
      for (let i = 0; i < 30; i++) {
        const rx = ((i * 17) % 56) + 4;
        const ry = ((i * 23) % 44) + 10;
        ctx.fillRect(rx, ry, 2, 2);
      }
      // Large squid eyes with glowing cyan iris
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(8, 28, 10, 10);
      ctx.fillRect(46, 28, 10, 10);
      ctx.fillStyle = '#0891b2';
      ctx.fillRect(10, 30, 6, 6);
      ctx.fillRect(48, 30, 6, 6);
      ctx.fillStyle = '#021319';
      ctx.fillRect(12, 32, 3, 3);
      ctx.fillRect(50, 32, 3, 3);
    } else if (type === 'drowned') {
      // Waterlogged decaying green-cyan skin
      ctx.fillStyle = '#164e4a';
      ctx.fillRect(0, 0, 64, 64);
      // Rotting flesh mottling & kelp stains
      ctx.fillStyle = '#0f3a36';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 3 + y * 7) % 5 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Seaweed patches
      ctx.fillStyle = '#14532d';
      ctx.fillRect(8, 4, 8, 10);
      ctx.fillRect(44, 18, 12, 8);
      // Tattered waterlogged clothes
      ctx.fillStyle = '#155e75';
      ctx.fillRect(16, 16, 32, 16);
      ctx.fillStyle = '#0e7490';
      ctx.fillRect(20, 20, 24, 12);
      // Pants
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 32, 64, 16);
      // Glowing light-cyan undead eyes
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(8, 8, 4, 3);
      ctx.fillRect(20, 8, 4, 3);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(9, 9, 2, 2);
      ctx.fillRect(21, 9, 2, 2);
    } else if (type === 'cod') {
      // Sandy tan/olive-brown upper body
      ctx.fillStyle = '#7a6a57';
      ctx.fillRect(0, 0, 64, 64);
      // Silvery cream underbelly
      ctx.fillStyle = '#dcd5c9';
      ctx.fillRect(0, 38, 64, 26);
      // Darker olive-brown dorsal ridge
      ctx.fillStyle = '#594d3f';
      ctx.fillRect(0, 0, 64, 14);
      // Mottled scale speckles
      ctx.fillStyle = '#9e8d78';
      for (let x = 4; x < 60; x += 6) {
        for (let y = 14; y < 38; y += 6) {
          ctx.fillRect(x + (y % 12 === 0 ? 0 : 3), y, 3, 2);
        }
      }
      // Silvery fin strips
      ctx.fillStyle = '#c4bbb0';
      ctx.fillRect(46, 18, 14, 10);
      ctx.fillRect(48, 44, 12, 8);
      // Eyes
      ctx.fillStyle = '#18181b';
      ctx.fillRect(6, 18, 4, 4);
      ctx.fillStyle = '#fafaf9';
      ctx.fillRect(6, 18, 2, 2);
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

  /**
   * Build a small nearest-neighbour Ravager skin.  The raid mob used to be
   * assembled entirely from one gray material, which made it look like an
   * unskinned white placeholder in bright worlds.  The sheet deliberately
   * includes the dark muzzle, brow, scars and warm hide shading so it remains
   * readable at Minecraft's normal render distance.
   */
  createRavagerTexture(createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();

    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Base hide and pixel-level shading.
    ctx.fillStyle = '#59636b';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#707b82';
    ctx.fillRect(0, 0, 64, 10);
    ctx.fillStyle = '#414a52';
    ctx.fillRect(0, 48, 64, 16);
    for (let x = 2; x < 64; x += 8) {
      ctx.fillStyle = x % 16 === 2 ? '#7f898f' : '#4b555d';
      ctx.fillRect(x, 14, 4, 3);
      ctx.fillRect(x + 2, 28, 3, 3);
      ctx.fillRect(x - 1, 40, 5, 2);
    }

    // Muzzle and nose are intentionally high contrast so the face is visible
    // even when the mob is viewed from a distance or in shadow.
    ctx.fillStyle = '#252b31';
    ctx.fillRect(20, 34, 24, 14);
    ctx.fillStyle = '#11161b';
    ctx.fillRect(27, 40, 10, 6);
    ctx.fillStyle = '#a8b0b5';
    ctx.fillRect(22, 35, 5, 3);
    ctx.fillRect(37, 35, 5, 3);

    // Red-brown brow and scar accents match the hostile raid variant.
    ctx.fillStyle = '#8f3e36';
    ctx.fillRect(9, 20, 14, 5);
    ctx.fillRect(41, 20, 14, 5);
    ctx.fillRect(13, 52, 9, 4);
    ctx.fillRect(43, 52, 9, 4);
    ctx.fillStyle = '#d7dde0';
    ctx.fillRect(19, 22, 5, 5);
    ctx.fillRect(40, 22, 5, 5);
    ctx.fillStyle = '#0b0d0f';
    ctx.fillRect(21, 23, 2, 3);
    ctx.fillRect(41, 23, 2, 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Generate a lightweight pixel coat for horses and donkeys. */
  createHorseTexture(coat = 0x78350f, createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();

    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const coatColor = new THREE.Color(coat).getStyle();
    const coatDark = new THREE.Color(coat).multiplyScalar(0.62).getStyle();
    const coatLight = new THREE.Color(coat).lerp(new THREE.Color(0xffffff), 0.2).getStyle();

    ctx.fillStyle = coatColor;
    ctx.fillRect(0, 0, 64, 64);
    // Pixel shading keeps the texture legible on the large torso and legs.
    ctx.fillStyle = coatLight;
    ctx.fillRect(0, 0, 64, 8);
    ctx.fillRect(4, 16, 8, 3);
    ctx.fillRect(38, 26, 10, 3);
    ctx.fillStyle = coatDark;
    ctx.fillRect(0, 48, 64, 16);
    for (let x = 3; x < 62; x += 9) ctx.fillRect(x, 35 + (x % 3), 4, 3);

    // Dark mane/tail and a contrasting muzzle/eye patch.
    ctx.fillStyle = '#24170f';
    ctx.fillRect(3, 8, 8, 36);
    ctx.fillRect(52, 8, 9, 18);
    ctx.fillStyle = '#3b261a';
    ctx.fillRect(20, 42, 24, 12);
    ctx.fillStyle = '#0b0d0f';
    ctx.fillRect(21, 25, 6, 5);
    ctx.fillRect(37, 25, 6, 5);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(23, 26, 2, 2);
    ctx.fillRect(39, 26, 2, 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  createNetherTexture(type) {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (type === 'ghast_plain' || type === 'ghast' || type === 'ghast_shooting') {
      // 1. Pale ethereal ghostly mottled base across 64x64 canvas (16x16 Minecraft pixels, 4x4 canvas pixels each)
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 64, 64);

      // Subtle ghost skin mottling and shading
      for (let gx = 0; gx < 16; gx++) {
        for (let gy = 0; gy < 16; gy++) {
          const n = (gx * 37 + gy * 73 + (gx ^ gy) * 11) % 19;
          if (n === 0) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(gx * 4, gy * 4, 4, 4);
          } else if (n === 1 || n === 2) {
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(gx * 4, gy * 4, 4, 4);
          } else if (n === 3) {
            ctx.fillStyle = '#e2e8f0';
            ctx.fillRect(gx * 4, gy * 4, 4, 4);
          } else if (n === 4 && gy > 7) {
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(gx * 4, gy * 4, 4, 4);
          }
        }
      }
      // Soft bottom seam gradient where body meets tentacles
      ctx.fillStyle = '#94a3b8';
      for (let gx = 0; gx < 16; gx += 2) {
        ctx.fillRect(gx * 4, 60, 4, 4);
      }

      if (type === 'ghast') {
        // 2. Iconic Crying Ghast Face: Closed sad drooping slit eyes, dark tear tracks, sad closed mouth
        // Left Eye Fold & Slit (cols 3..5, rows 4..5 -> x: 12..24, y: 16..24)
        ctx.fillStyle = '#64748b';
        ctx.fillRect(12, 16, 12, 4);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(12, 20, 12, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(14, 21, 8, 2);

        // Right Eye Fold & Slit (cols 10..12, rows 4..5 -> x: 40..52, y: 16..24)
        ctx.fillStyle = '#64748b';
        ctx.fillRect(40, 16, 12, 4);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(40, 20, 12, 4);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(42, 21, 8, 2);

        // Tear tracks running down cheeks from under eyes
        // Left Tear (col 4: x: 16..20, with col 3: x: 12..16 shadow)
        ctx.fillStyle = '#334155';
        ctx.fillRect(16, 24, 4, 16);
        ctx.fillStyle = '#475569';
        ctx.fillRect(16, 40, 4, 14);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(16, 54, 4, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(12, 28, 4, 16);

        // Right Tear (col 11: x: 44..48, with col 12: x: 48..52 shadow)
        ctx.fillStyle = '#334155';
        ctx.fillRect(44, 24, 4, 16);
        ctx.fillStyle = '#475569';
        ctx.fillRect(44, 40, 4, 14);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(44, 54, 4, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(48, 28, 4, 16);

        // Sad downturned closed mouth (cols 6..9, rows 10..11 -> x: 24..40, y: 44..49)
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(24, 44, 16, 4);
        ctx.fillStyle = '#334155';
        ctx.fillRect(24, 46, 4, 3);
        ctx.fillRect(36, 46, 4, 3);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(26, 45, 12, 2);
      } else if (type === 'ghast_shooting') {
        // 3. Charging/Shooting Face: Snapped wide open fiery eyes, weeping tear streaks, gaping flaming maw!
        // Left Open Fiery Eye (x: 12..24, y: 16..28)
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(12, 16, 12, 12);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(14, 18, 8, 8);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(16, 20, 4, 4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(17, 21, 2, 2);

        // Right Open Fiery Eye (x: 40..52, y: 16..28)
        ctx.fillStyle = '#1c1917';
        ctx.fillRect(40, 16, 12, 12);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(42, 18, 8, 8);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(44, 20, 4, 4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(45, 21, 2, 2);

        // Tear tracks running down
        ctx.fillStyle = '#334155';
        ctx.fillRect(16, 28, 4, 14);
        ctx.fillStyle = '#475569';
        ctx.fillRect(16, 42, 4, 12);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(16, 54, 4, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(12, 30, 4, 14);

        ctx.fillStyle = '#334155';
        ctx.fillRect(44, 28, 4, 14);
        ctx.fillStyle = '#475569';
        ctx.fillRect(44, 42, 4, 12);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(44, 54, 4, 6);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(48, 30, 4, 14);

        // Gaping Wide Open Mouth with charging fireball core (x: 20..44, y: 36..56)
        ctx.fillStyle = '#18181b';
        ctx.fillRect(20, 36, 24, 20);
        ctx.fillStyle = '#7f1d1d';
        ctx.fillRect(22, 38, 20, 16);
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(24, 40, 16, 12);
        // Blazing charging flame inside mouth
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(26, 42, 12, 8);
        ctx.fillStyle = '#f97316';
        ctx.fillRect(28, 44, 8, 4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(30, 45, 4, 2);
      }
    } else if (type === 'fireball') {
      // Blazing fireball texture: fiery white-hot core radiating outward to flame swirls
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#ea580c';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          const d = Math.hypot(x - 32, y - 32);
          if (d < 26) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#f59e0b';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          const d = Math.hypot(x - 32, y - 32);
          if (d < 18) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(24, 24, 16, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, 28, 8, 8);
    } else if (type === 'blaze_head') {
      // Dark smoky charcoal head with glowing yellow/gold eyes
      ctx.fillStyle = '#dba52d';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#b97e1d';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 11 + y * 7) % 3 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Glowing yellow/gold eyes
      ctx.fillStyle = '#fff09c';
      ctx.fillRect(14, 18, 8, 8);
      ctx.fillRect(42, 18, 8, 8);
      ctx.fillStyle = '#593416';
      ctx.fillRect(16, 20, 4, 4);
      ctx.fillRect(44, 20, 4, 4);
    } else if (type === 'blaze') {
      // Fiery orange/gold swirl texture
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#d97706';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 11 + y * 7) % 3 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#fbbf24';
      for (let x = 2; x < 62; x += 8) {
        ctx.fillRect(x, 0, 4, 64);
      }
    } else if (type === 'piglin') {
      // Warm peach-tan piglin hide per Minecraft Java texture
      ctx.fillStyle = '#d97757';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#c25838';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 9 + y * 5) % 4 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Brown leather harness / tunic
      ctx.fillStyle = '#543825';
      ctx.fillRect(16, 22, 32, 24);
      ctx.fillStyle = '#facc15'; // Golden belt buckle
      ctx.fillRect(28, 38, 8, 8);
      // Snout and tusks
      ctx.fillStyle = '#c25838';
      ctx.fillRect(18, 10, 28, 12);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(18, 16, 4, 8);
      ctx.fillRect(42, 16, 4, 8);
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 4, 7, 5);
      ctx.fillRect(43, 4, 7, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(17, 5, 4, 4);
      ctx.fillRect(43, 5, 4, 4);
    } else if (type === 'zombified_piglin') {
      // Left piglin (warm peach), right rotted olive-moss zombie flesh
      ctx.fillStyle = '#d97757';
      ctx.fillRect(0, 0, 32, 64);
      ctx.fillStyle = '#556b2f';
      ctx.fillRect(32, 0, 32, 64);
      ctx.fillStyle = '#414833';
      for (let x = 32; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 5 + y * 7) % 3 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Exposed white skull on right side
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(40, 4, 16, 14);
      // Exposed bone ribs on right side
      ctx.fillRect(36, 24, 18, 3);
      ctx.fillRect(36, 32, 16, 3);
      ctx.fillRect(36, 40, 18, 3);
      // Left ivory tusk
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(14, 14, 4, 7);
      // Red glowing zombie eye on right, white eye on left
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(46, 8, 5, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12, 6, 6, 5);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(15, 6, 3, 5);
    } else if (type === 'hoglin') {
      // Deep crimson hide
      ctx.fillStyle = '#831843';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#701a75';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 13 + y * 3) % 4 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Dark spine ridge
      ctx.fillStyle = '#500724';
      ctx.fillRect(24, 0, 16, 64);
      // Tusks
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, 44, 12, 16);
      ctx.fillRect(46, 44, 12, 16);
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12, 18, 4, 4);
      ctx.fillRect(48, 18, 4, 4);
    } else if (type === 'magma_cube') {
      // Obsidian crust
      ctx.fillStyle = '#1c1917';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#292524';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x + y) % 6 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#ea580c';
      for (let y = 8; y < 64; y += 16) {
        ctx.fillRect(0, y, 64, 3);
      }
      ctx.fillStyle = '#facc15';
      ctx.fillRect(10, 16, 8, 8);
      ctx.fillRect(46, 16, 8, 8);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(12, 18, 4, 4);
      ctx.fillRect(48, 18, 4, 4);
    } else if (type === 'magma_cube_core') {
      ctx.fillStyle = '#f97316';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#fde047';
      for (let x = 0; x < 64; x += 8) {
        for (let y = 0; y < 64; y += 8) {
          ctx.fillRect(x + 2, y + 2, 4, 4);
        }
      }
    } else if (type === 'strider') {
      // Warm crimson skin per Minecraft
      ctx.fillStyle = '#9e3232';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#7a2222';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 7 + y) % 3 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      // Bristly side hair roots
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(0, 20, 8, 4);
      ctx.fillRect(0, 32, 8, 4);
      ctx.fillRect(56, 20, 8, 4);
      ctx.fillRect(56, 32, 8, 4);
      // Squinting eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 22, 8, 8);
      ctx.fillRect(42, 22, 8, 8);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(16, 24, 4, 4);
      ctx.fillRect(44, 24, 4, 4);
    } else if (type === 'strider_cold') {
      // Cold purple-grey shivering skin
      ctx.fillStyle = '#5c5265';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#433c4a';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 7 + y) % 3 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#2f2735';
      ctx.fillRect(0, 20, 8, 4);
      ctx.fillRect(0, 32, 8, 4);
      ctx.fillRect(56, 20, 8, 4);
      ctx.fillRect(56, 32, 8, 4);
      // Chattering teeth & cold eyes
      ctx.fillStyle = '#d8b4e2';
      ctx.fillRect(14, 22, 8, 8);
      ctx.fillRect(42, 22, 8, 8);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(16, 24, 4, 4);
      ctx.fillRect(44, 24, 4, 4);
    } else if (type === 'wither_skeleton') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#27272a';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 9 + y * 5) % 4 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#09090b';
      ctx.fillRect(16, 24, 32, 3);
      ctx.fillRect(16, 32, 32, 3);
      ctx.fillRect(16, 40, 32, 3);
      ctx.fillStyle = '#f4f4f5';
      ctx.fillRect(16, 16, 6, 6);
      ctx.fillRect(42, 16, 6, 6);
    } else if (type === 'wither_skull') {
      // Dark wither skull with hollow glowing white eyes and jagged grim grin
      ctx.fillStyle = '#18181b';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#27272a';
      for (let x = 0; x < 64; x += 4) {
        for (let y = 0; y < 64; y += 4) {
          if ((x * 7 + y * 11) % 4 === 0) ctx.fillRect(x, y, 4, 4);
        }
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(14, 18, 8, 8);
      ctx.fillRect(42, 18, 8, 8);
      ctx.fillStyle = '#a1a1aa';
      ctx.fillRect(20, 40, 24, 6);
      ctx.fillStyle = '#18181b';
      for (let t = 22; t < 44; t += 6) ctx.fillRect(t, 40, 2, 6);
    }

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
    if (typeof document === 'undefined') return new THREE.Texture();
    const tex = this.textureLoader.load(path);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  isBlockSolid(x, y, z, mobType = null) {
    const b = this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b === BLOCKS.AIR || b === BLOCKS.WATER || b === BLOCKS.FIRE) return false;

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
      // Wiki: mooshrooms are 1.4 tall and 0.9 wide, like cows. They previously fell
      // through to the humanoid default of 0.6 x 1.95.
      case 'mooshroom': return { width: 0.9, height: 1.4 };
      case 'sheep': return { width: 0.9, height: 1.3 };
      case 'creeper': return { width: 0.6, height: 1.7 };
      case 'skeleton': return { width: 0.6, height: 1.98 };
      case 'zombie': return { width: 0.6, height: 1.95 };
      case 'pillager': return { width: 0.6, height: 1.95 };
      case 'salmon': return { width: 0.4, height: 0.35 };
      case 'cod': return { width: 0.35, height: 0.3 };
      case 'dolphin': return { width: 0.9, height: 0.65 };
      case 'octopus':
      case 'squid':
      case 'glow_squid': return { width: 0.8, height: 0.8 };
      case 'drowned': return { width: 0.6, height: 1.95 };
      case 'axolotl': return { width: 0.5, height: 0.35 };
      case 'horse': return { width: 1.4, height: 1.6 };
      case 'donkey': return { width: 1.3965, height: 1.5 };
      case 'mule': return { width: 1.3965, height: 1.6 };
      case 'wolf': return { width: 0.6, height: 0.85 };
      case 'cat':
      case 'ocelot': return { width: 0.6, height: 0.7 };
      case 'chicken': return { width: 0.4, height: 0.7 };
      case 'ravager': return { width: 1.95, height: 2.2 };
      case 'warden': return { width: 1.4, height: 2.9 };
      case 'ender_dragon': return { width: 3.5, height: 1.8 };
      case 'wither': return { width: 1.8, height: 2.4 };
      case 'ghast': return { width: 4.0, height: 4.0 };
      case 'blaze': return { width: 0.6, height: 1.8 };
      case 'piglin': return { width: 0.6, height: 1.95 };
      case 'zombified_piglin':
      case 'zombie_pigman': return { width: 0.6, height: 1.95 };
      case 'zoglin':
      case 'hoglin': return { width: 1.4, height: 1.4 };
      case 'magma_cube': return { width: 2.04, height: 2.04 };
      case 'strider': return { width: 0.9, height: 1.7 };
      case 'wither_skeleton': return { width: 0.7, height: 2.4 };
      case 'guardian': return { width: 0.85, height: 0.85 };
      case 'elder_guardian': return { width: 2.0, height: 2.0 };
      case 'tournament_host': return { width: 0.6, height: 1.95 };
      case 'site_manager': return { width: 0.6, height: 1.95 };
      case 'jackie_chun': return { width: 0.6, height: 1.85 };
      case 'enderman': return { width: 0.5, height: 2.85 };
      case 'villager':
      case 'zombie_villager':
      default:
        return { width: 0.6, height: 1.95 };
    }
  }

  checkMobCollision(mob, pos) {
    const dims = this.getMobDimensions(mob.type);
    const scale = mob.isBaby ? (isSquid(mob) ? .625 : mob.type==='horse' ? 0.7 : 0.5) : 1;
    const hw = (mob.width || dims.width) * scale / 2;
    const h = (mob.height || dims.height) * scale;

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
          if (this.isBlockSolid(x, y, z, mob?.type)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  applyMobCollisions(dt = 0.05) {
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

  // --- VILLAGER ---
  spawnVillager(x, y, z, profession = 'unemployed') {
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

    initVillagerEconomy(mob, profession);
    this.mobs.push(mob);
    return mob;
  }

  // --- ZOMBIE VILLAGER ---
  spawnZombieVillager(x, y, z) {
    const group = new THREE.Group();
    // Green tinted / zombie villager skin
    const zombieMat = new THREE.MeshLambertMaterial({
      color: 0x4d7c0f,
      transparent: true,
      alphaTest: 0.1
    });
    const clothesMat = new THREE.MeshLambertMaterial({
      color: 0x57534e
    });

    // Head (8x10x8) with villager brow and zombie tone
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.625, 0.5), zombieMat);
    head.position.y = 1.35;
    group.add(head);

    // Long Villager Nose (2x4x2)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.25, 0.125), zombieMat);
    nose.position.set(0, -0.15, 0.31);
    head.add(nose);

    // Torso (8x12x6)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.375), clothesMat);
    torso.position.y = 0.75;
    group.add(torso);

    // Outstretched Zombie Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const leftArm = new THREE.Mesh(armGeo, zombieMat);
    leftArm.position.set(-0.32, 0.95, 0.3);
    leftArm.rotation.x = Math.PI / 2; // outstretched forward
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, zombieMat);
    rightArm.position.set(0.32, 0.95, 0.3);
    rightArm.rotation.x = Math.PI / 2; // outstretched forward
    group.add(rightArm);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.24, 0.45, 0.24);
    const leftLeg = new THREE.Mesh(legGeo, clothesMat);
    leftLeg.position.set(-0.13, 0.22, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, clothesMat);
    rightLeg.position.set(0.13, 0.22, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'zombie_villager',
      name: 'Zombie Villager',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: zombieMat,
      health: 20,
      maxHealth: 20,
      hasWeakness: false,
      isCuring: false,
      cureTimer: 0,
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

    // Horns
    const hornGeo = createBoxWithUV(0.08, 0.18, 0.08, 22, 0, 64, 32);
    const hornL = new THREE.Mesh(hornGeo, mat); hornL.position.set(-0.25, 0.28, 0.05); head.add(hornL);
    const hornR = new THREE.Mesh(hornGeo, mat); hornR.position.set(0.25, 0.28, 0.05); head.add(hornR);

    // Udder
    const udderGeo = createBoxWithUV(0.25, 0.15, 0.35, 52, 0, 64, 32);
    const udder = new THREE.Mesh(udderGeo, mat); udder.position.set(0, 0.42, -0.2); group.add(udder);

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
      horns: [hornL, hornR],
      udder: udder,
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

  // --- PASSIVE SHEEP ---
  spawnSheep(x, y, z, options = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.sheep });
    // The wool layer is tinted per sheep instead of using sixteen textures. Colours
    // come from SHEEP_COLOR_HEX, so the wool block a sheep drops and the tint on its
    // back are derived from one source and cannot drift apart.
    const woolMat = new THREE.MeshLambertMaterial({ map: this.textures.sheep });

    const body = new THREE.Mesh(createBoxWithUV(0.7, 0.6, 1.0, 28, 8, 64, 32), mat);
    body.position.y = 0.65;
    group.add(body);

    // Wool shell, inflated slightly around the body so shearing reveals the skin cube
    // underneath rather than deleting geometry.
    const woolMesh = new THREE.Mesh(createBoxWithUV(0.79, 0.68, 1.09, 28, 8, 64, 32), woolMat);
    woolMesh.position.y = 0.68;
    group.add(woolMesh);

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
      woolMesh: woolMesh,
      woolMaterial: woolMat,
      woolColor: options.woolColor || 'white',
      isSheared: !!options.isSheared,
      legs: [fl, fr, bl, br],
      mat: mat,
      // Wiki: 8 HP.
      health: 8,
      maxHealth: 8,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    sheepApplyWool(mob);

    this.mobs.push(mob);
    return mob;
  }

  // --- PASSIVE CHICKEN ---
  spawnChicken(x, y, z) {
    const group = new THREE.Group();
    const tex = this.textures?.chicken || (this.createChickenTexture ? this.createChickenTexture() : null);
    const mat = new THREE.MeshLambertMaterial({ map: tex });

    // Torso / Body (6w, 6h, 8d in pixels)
    const bodyGeo = createBoxWithUV(0.38, 0.38, 0.5, 0, 9, 64, 32, 6, 6, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.35;
    group.add(body);

    // Head (4w, 6h, 3d in pixels)
    const headGeo = createBoxWithUV(0.25, 0.38, 0.2, 0, 0, 64, 32, 4, 6, 3);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 0.58, 0.22);
    group.add(head);

    // Bill / Beak (4w, 2h, 2d in pixels)
    const billGeo = createBoxWithUV(0.25, 0.12, 0.12, 14, 0, 64, 32, 4, 2, 2);
    const bill = new THREE.Mesh(billGeo, mat);
    bill.position.set(0, -0.04, 0.14);
    head.add(bill);

    // Wattle / Red chin flap (2w, 4h, 2d in pixels)
    const wattleGeo = createBoxWithUV(0.12, 0.22, 0.12, 14, 4, 64, 32, 2, 4, 2);
    const wattle = new THREE.Mesh(wattleGeo, mat);
    wattle.position.set(0, -0.16, 0.08);
    head.add(wattle);

    // Left Wing (1w, 4h, 6d in pixels)
    const wingGeo = createBoxWithUV(0.06, 0.25, 0.38, 24, 13, 64, 32, 1, 4, 6);
    const wingLGroup = new THREE.Group();
    wingLGroup.position.set(-0.21, 0.44, 0);
    const wingL = new THREE.Mesh(wingGeo, mat);
    wingL.position.set(-0.03, -0.1, 0);
    wingLGroup.add(wingL);
    group.add(wingLGroup);

    // Right Wing (1w, 4h, 6d in pixels)
    const wingRGroup = new THREE.Group();
    wingRGroup.position.set(0.21, 0.44, 0);
    const wingR = new THREE.Mesh(wingGeo, mat);
    wingR.position.set(0.03, -0.1, 0);
    wingRGroup.add(wingR);
    group.add(wingRGroup);

    // 2 Legs (3w, 5h, 3d in pixels)
    const legGeo = createBoxWithUV(0.16, 0.28, 0.16, 26, 0, 64, 32, 3, 5, 3);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.1, 0.14, 0.02);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.1, 0.14, 0.02);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'chicken',
      name: 'Chicken',
      mesh: group,
      head: head,
      bill: bill,
      wattle: wattle,
      body: body,
      wings: { left: wingLGroup, right: wingRGroup },
      wingL: wingLGroup,
      wingR: wingRGroup,
      legs: [leftLeg, rightLeg],
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 4,
      maxHealth: 4,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      maxFallSpeed: -1.5,
      gravity: 8.0,
      eggTimer: 300 + Math.random() * 300,
      flapTimer: Math.random() * 10
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
  spawnMooshroom(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: MOOSHROOM_COLORS.red });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

    const body = new THREE.Mesh(createBoxWithUV(0.8, 0.7, 1.1, 28, 8, 64, 32), bodyMat);
    body.position.y = 0.75;
    group.add(body);

    const head = new THREE.Mesh(createBoxWithUV(0.45, 0.45, 0.45, 0, 0, 64, 32), bodyMat);
    head.position.set(0, 1.05, 0.65);
    group.add(head);

    // Mushrooms on the back: five of them, as the wiki's "5 corresponding mushrooms"
    // implies. They are held so the variant can recolour them and the growth path can
    // hide them on babies.
    const shroomGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const mushroomMeshes = [
      [0.15, 1.25, 0.1], [-0.15, 1.25, -0.2], [0.2, 1.25, -0.35],
      [-0.2, 1.25, 0.35], [0.0, 1.25, 0.5]
    ].map(([mx, my, mz]) => {
      const mesh = new THREE.Mesh(shroomGeo, bodyMat);
      mesh.position.set(mx, my, mz);
      group.add(mesh);
      return mesh;
    });

    const legGeo = createBoxWithUV(0.22, 0.45, 0.22, 0, 16, 64, 32);
    const fl = new THREE.Mesh(legGeo, bodyMat); fl.position.set(-0.24, 0.22, 0.35); group.add(fl);
    const fr = new THREE.Mesh(legGeo, bodyMat); fr.position.set(0.24, 0.22, 0.35); group.add(fr);
    const bl = new THREE.Mesh(legGeo, bodyMat); bl.position.set(-0.24, 0.22, -0.35); group.add(bl);
    const br = new THREE.Mesh(legGeo, bodyMat); br.position.set(0.24, 0.22, -0.35); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'mooshroom',
      name: 'Mooshroom',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      variantMeshes: [body, head, ...mushroomMeshes, fl, fr, bl, br],
      mushroomMeshes,
      // 'red' spawns naturally; 'brown' only ever comes from lightning or breeding.
      variant: options.variant === 'brown' ? 'brown' : 'red',
      // Retained across a shear so the dropped mushrooms match the variant, mirroring
      // woolColor on sheep.
      mushroomType: options.variant === 'brown' ? 'brown' : 'red',
      isBaby: !!options.isBaby,
      // Wiki: 10 HP, not the 14 this used to report.
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    applyMooshroomVariant(mob);

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
    const headMat = new THREE.MeshLambertMaterial({
      map: this.textures?.blaze_head || this.textures?.blaze,
      color: 0xffffff
    });
    const rodMat = new THREE.MeshLambertMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.5
    });
    const smokeMat = new THREE.MeshLambertMaterial({
      color: 0x1f140e
    });

    const sideMat = new THREE.MeshLambertMaterial({color:0xd6a321, map:this.textures?.blaze});
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), [sideMat,sideMat,sideMat,sideMat,headMat,sideMat]);
    head.position.y = 1.35;
    group.add(head);

    const smoke = new THREE.Group();
    for (let i=0; i<10; i++) {
      const puff = new THREE.Mesh(new THREE.BoxGeometry(.13,.13,.13), new THREE.MeshBasicMaterial({color:0x34302b, transparent:true, opacity:.35, depthWrite:false}));
      puff.position.set(Math.sin(i*2.4)*.3, i*.18, Math.cos(i*2.4)*.3);
      smoke.add(puff);
    }
    group.add(smoke);
    const flames = new THREE.Group();
    for (let i=0;i<6;i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(.08,.45,5), new THREE.MeshBasicMaterial({color:0xffb52b,transparent:true,opacity:.75,depthWrite:false}));
      flame.position.set(Math.sin(i)*.35,.4+(i%3)*.35,Math.cos(i)*.35);
      flames.add(flame);
    }
    flames.visible=false; group.add(flames);

    // 12 orbiting rods arranged in 3 tiers
    const rodGeo = new THREE.BoxGeometry(0.12, 0.55, 0.12);
    const tiers = [];
    const tierConfigs = [
      { count: 4, radius: 0.5, y: 1.25 },
      { count: 4, radius: 0.65, y: 0.8 },
      { count: 4, radius: 0.45, y: 0.35 }
    ];

    for (let t = 0; t < 3; t++) {
      const cfg = tierConfigs[t];
      const tierGroup = new THREE.Group();
      tierGroup.position.y = cfg.y;
      for (let i = 0; i < cfg.count; i++) {
        const angle = (i / cfg.count) * Math.PI * 2;
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(Math.cos(angle) * cfg.radius, 0, Math.sin(angle) * cfg.radius);
        tierGroup.add(rod);
      }
      group.add(tierGroup);
      tiers.push(tierGroup);
    }

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'blaze',
      name: 'Blaze',
      mesh: group,
      head: head,
      tiers: tiers,
      smoke,
      flames,
      isFlying: true,
      fireImmune: true,
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
    const skinMat = new THREE.MeshLambertMaterial({
      map: this.textures.piglin_hide ||= piglinTexture(0xdca684),
      color: 0xffffff
    });
    const goldMat = new THREE.MeshLambertMaterial({
      color: 0xfacc15
    });
    const tuskMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });

    const clothesMat = new THREE.MeshLambertMaterial({ map: this.textures.piglin_clothes ||= piglinTexture(0x533a2b) });

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 0.58), skinMat);
    head.position.y = 1.6;
    group.add(head);

    // Snout
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.16), skinMat);
    snout.position.set(0, -0.1, 0.32);
    head.add(snout);

    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x291c18 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.025), eyeMat);
      eye.position.set(side * 0.19, 0.045, 0.3); head.add(eye);
      const nostril = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.04, 0.02), eyeMat);
      nostril.position.set(side * 0.09, -0.09, 0.41); head.add(nostril);
    }

    // Tusks
    const tuskL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), tuskMat);
    tuskL.position.set(-0.15, -0.04, 0.35);
    head.add(tuskL);
    const tuskR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.06), tuskMat);
    tuskR.position.set(0.15, -0.04, 0.35);
    head.add(tuskR);

    // Floppy ears
    const earGeo = new THREE.BoxGeometry(0.08, 0.32, 0.18);
    const earL = new THREE.Mesh(earGeo, skinMat);
    earL.position.set(-0.35, 0, 0);
    earL.rotation.z = -0.3;
    head.add(earL);
    const earR = new THREE.Mesh(earGeo, skinMat);
    earR.position.set(0.35, 0, 0);
    earR.rotation.z = 0.3;
    head.add(earR);

    // Brown leather tunic
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.75, 0.28), clothesMat);
    body.position.y = 0.95;
    group.add(body);

    const armGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftArm = new THREE.Mesh(armGeo, skinMat); leftArm.position.set(-0.36, 0.95, 0); group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, skinMat); rightArm.position.set(0.36, 0.95, 0); group.add(rightArm);

    const admiredGold = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.12), goldMat);
    admiredGold.position.set(0, -0.3, 0.14);
    admiredGold.visible = false;
    leftArm.add(admiredGold);
    const weapon = Math.random() < 0.5 ? 'golden_sword' : 'crossbow';
    // Golden Sword in hand
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.14), goldMat);
    sword.position.set(0, -0.3, 0.3);
    sword.rotation.x = Math.PI / 4;
    sword.userData.piglinWeapon = 'sword';
    rightArm.add(sword);
    sword.visible = weapon === 'golden_sword';
    if (weapon === 'crossbow') {
      const bow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.12), clothesMat);
      bow.userData.piglinWeapon = 'crossbow';
      bow.position.set(0, -0.3, 0.3); rightArm.add(bow);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.45), clothesMat);
      stock.userData.piglinWeapon = 'crossbow';
      stock.position.set(0, -0.3, 0.2); rightArm.add(stock);
    }

    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftLeg = new THREE.Mesh(legGeo, clothesMat); leftLeg.position.set(-0.13, 0.38, 0); group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, clothesMat); rightLeg.position.set(0.13, 0.38, 0); group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'piglin',
      weapon,
      admiredGold,
      name: 'Piglin',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      health: 16,
      maxHealth: 16,
      fireImmune: false,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    mob.equipment = {};
    for (const [slot, id] of Object.entries({ head: 'golden_helmet', chest: 'golden_chestplate', legs: 'golden_leggings', feet: 'golden_boots' })) {
      if (Math.random() < 0.1) mob.equipment[slot] = { id, isBlock: false, count: 1 };
    }
    syncPiglinEquipment(mob);
    this.mobs.push(mob);
    return mob;
  }

  spawnZombifiedPiglin(x, y, z, options = {}) {
    const model=createZombifiedPiglinModel(this.textures);
    const mob={type:'zombified_piglin',name:'Zombified Piglin',...model,health:20,maxHealth:20,velocity:new THREE.Vector3(),yaw:(this.random||Math.random)()*Math.PI*2,state:'idle',timer:0,hitCooldown:0};
    mob.mesh.position.set(x,y,z);this.scene.add(mob.mesh);this.mobs.push(mob);
    initializeZombified(this,mob,options);return mob;
  }

  spawnZombiePigman(x, y, z) {
    return this.spawnZombifiedPiglin(x, y, z);
  }

  spawnHoglin(x, y, z) {
    const group = new THREE.Group();
    const hideMat = new THREE.MeshLambertMaterial({
      map: this.textures.hoglin,
      color: 0xffffff
    });
    const tuskMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const hoofMat = new THREE.MeshLambertMaterial({ color: 0x3f3f46 });

    // Bulky quadruped body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.95, 1.5), hideMat);
    body.position.y = 1.0;
    group.add(body);

    // Large angled head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.8), hideMat);
    head.position.set(0, 1.15, 0.9);
    head.rotation.x = 0.2;
    group.add(head);

    // Curved Ivory Tusks
    const tuskGeo = new THREE.BoxGeometry(0.14, 0.5, 0.14);
    const tuskL = new THREE.Mesh(tuskGeo, tuskMat);
    tuskL.position.set(-0.48, -0.05, 0.35);
    tuskL.rotation.x = -0.4;
    tuskL.rotation.z = -0.2;
    head.add(tuskL);

    const tuskR = new THREE.Mesh(tuskGeo, tuskMat);
    tuskR.position.set(0.48, -0.05, 0.35);
    tuskR.rotation.x = -0.4;
    tuskR.rotation.z = 0.2;
    head.add(tuskR);

    // Floppy ears
    const earGeo = new THREE.BoxGeometry(0.08, 0.35, 0.18);
    const earL = new THREE.Mesh(earGeo, hideMat);
    earL.position.set(-0.5, 0.1, -0.1);
    earL.rotation.z = -0.5;
    head.add(earL);
    const earR = new THREE.Mesh(earGeo, hideMat);
    earR.position.set(0.5, 0.1, -0.1);
    earR.rotation.z = 0.5;
    head.add(earR);

    // 4 sturdy legs
    const legGeo = new THREE.BoxGeometry(0.32, 0.65, 0.32);
    const legFL = new THREE.Mesh(legGeo, hoofMat); legFL.position.set(-0.45, 0.33, 0.5); group.add(legFL);
    const legFR = new THREE.Mesh(legGeo, hoofMat); legFR.position.set(0.45, 0.33, 0.5); group.add(legFR);
    const legBL = new THREE.Mesh(legGeo, hoofMat); legBL.position.set(-0.45, 0.33, -0.5); group.add(legBL);
    const legBR = new THREE.Mesh(legGeo, hoofMat); legBR.position.set(0.45, 0.33, -0.5); group.add(legBR);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'hoglin',
      name: 'Hoglin',
      mesh: group,
      head: head,
      legFL: legFL,
      legFR: legFR,
      legBL: legBL,
      legBR: legBR,
      health: 40,
      maxHealth: 40,
      fireImmune: false,
      isQuadruped: true,
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
    const plainMat = new THREE.MeshLambertMaterial({
      map: this.textures?.ghast_plain || this.textures?.ghast,
      color: 0xffffff,
      emissive: 0x181820
    });
    const headMat = new THREE.MeshLambertMaterial({
      map: this.textures?.ghast,
      color: 0xffffff,
      emissive: 0x181820
    });

    // 4.0 x 4.0 x 4.0 white body cube with multi-materials [+X, -X, +Y, -Y, +Z, -Z]
    // Only the +Z front face displays the crying/shooting face; other 5 faces are plain white ghostly skin
    const bodyMaterials = [plainMat, plainMat, plainMat, plainMat, headMat, plainMat];
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 3.6), bodyMaterials);
    body.position.y = 2.8;
    group.add(body);

    // 9 dangling tentacles hanging below the body
    const tentacleMat = new THREE.MeshLambertMaterial({
      map: this.textures?.ghast_plain || this.textures?.ghast,
      color: 0xf8fafc,
      emissive: 0x121216
    });
    const tentacleGeo = new THREE.BoxGeometry(0.35, 1.8, 0.35);
    const tentacles = [];
    for (let i = 0; i < 9; i++) {
      const t = new THREE.Mesh(tentacleGeo, tentacleMat);
      const col = (i % 3) - 1;
      const row = Math.floor(i / 3) - 1;
      t.position.set(col * 1.1, 0.7, row * 1.1);
      group.add(t);
      tentacles.push(t);
    }

    group.position.set(x, y, z);

    // Initial orientation: face player if player exists, otherwise random yaw
    let initialYaw = Math.random() * Math.PI * 2;
    const playerObj = this.entities?.player || this.world?.game?.player;
    if (playerObj?.position) {
      const dx = playerObj.position.x - x;
      const dz = playerObj.position.z - z;
      if (Math.hypot(dx, dz) > 0.1) {
        initialYaw = Math.atan2(dx, dz);
      }
    }
    group.rotation.y = initialYaw;
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'ghast',
      name: 'Ghast',
      mesh: group,
      head: body,
      headMat: headMat,
      plainMat: plainMat,
      tentacles: tentacles,
      isFlying: true,
      fireImmune: true,
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: initialYaw,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      fireballCooldown: 3.0 + Math.random() * 2.0,
      isChargingFireball: false,
      isShooting: false
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnMagmaCube(x, y, z) {
    const group = new THREE.Group();
    const crustMat = new THREE.MeshLambertMaterial({
      map: this.textures.magma_cube,
      color: 0xffffff
    });
    const coreMat = new THREE.MeshBasicMaterial({
      map: this.textures.magma_cube_core,
      color: 0xffffff
    });

    // Glowing core
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.55), coreMat);
    core.position.y = 0.42;
    group.add(core);

    // 8 segmented crust layers for accordion jump animation
    const layers = [];
    const layerGeo = new THREE.BoxGeometry(0.8, 0.08, 0.8);
    for (let i = 0; i < 8; i++) {
      const geo = layerGeo.clone();
      const uv = geo.attributes.uv;
      for (let j=0;j<uv.count;j++) uv.setY(j,(i+uv.getY(j))/8);
      const sideMat = new THREE.MeshLambertMaterial({color:0x30211c, emissive:0x210600});
      const layer = new THREE.Mesh(geo, [sideMat,sideMat,sideMat,sideMat,crustMat,sideMat]);
      layer.position.y = 0.05 + i * 0.1;
      group.add(layer);
      layers.push(layer);
    }

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'magma_cube',
      name: 'Magma Cube',
      mesh: group,
      core: core,
      layers: layers,
      slimeSize: 4,
      fireImmune: true,
      health: 16,
      maxHealth: 16,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    setMagmaSize(mob, 4);
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

  // --- HORSE & DONKEY ---
  spawnHorse(x, y, z) {
    const r=this.random || Math.random;
    const coat=Math.floor(r()*7), marking=Math.floor(r()*5);
    const model=createHorseModel(coat,marking,this.textures);
    const stats=randomHorseStats(r);
    const mob={type:'horse',name:'Horse',...model,...stats,health:stats.maxHealth,coat,marking,
      velocity:new THREE.Vector3(),yaw:r()*Math.PI*2,state:'idle',timer:0,hitCooldown:0};
    mob.mesh.position.set(x,y,z);this.scene.add(mob.mesh);this.mobs.push(mob);return mob;
  }

  spawnMule(x,y,z) { return this.spawnPackEquine('mule',x,y,z); }
  spawnDonkey(x,y,z) { return this.spawnPackEquine('donkey',x,y,z); }
  spawnPackEquine(type,x,y,z) {
    const r=this.random || Math.random, stats=packEquineStats(r);
    const mob={type,name:type==='mule'?'Mule':'Donkey',...createPackEquineModel(type,this.textures),...stats,
      health:stats.maxHealth,isTamed:false,isSaddled:false,horseArmor:null,hasChest:false,chestInventory:[],
      velocity:new THREE.Vector3(),yaw:r()*Math.PI*2,state:'idle',timer:0,hitCooldown:0};
    mob.mesh.position.set(x,y,z);this.scene.add(mob.mesh);this.mobs.push(mob);return mob;
  }

  // --- WOLF ---
  spawnWolf(x, y, z) {
    const group = new THREE.Group();
    const wolfTex = this.textures?.wolf || this.createWolfTexture();
    const wolfMat = new THREE.MeshLambertMaterial({ map: wolfTex });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.8), wolfMat);
    body.position.y = 0.55;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), wolfMat);
    head.position.set(0, 0.75, 0.5);
    group.add(head);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.25), wolfMat);
    muzzle.position.set(0, 0.68, 0.75);
    group.add(muzzle);

    // Wolf triangular ears
    const earMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
    const earGeo = new THREE.BoxGeometry(0.1, 0.15, 0.08);
    const lEar = new THREE.Mesh(earGeo, earMat);
    lEar.position.set(-0.15, 0.25, -0.05);
    head.add(lEar);

    const rEar = new THREE.Mesh(earGeo, earMat);
    rEar.position.set(0.15, 0.25, -0.05);
    head.add(rEar);

    // Wolf black nose on muzzle
    const noseMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), noseMat);
    nose.position.set(0, 0.04, 0.13);
    muzzle.add(nose);

    // Wolf expressive eyes
    const eyeMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
    const lEye = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.position.set(-0.12, 0.05, 0.21);
    head.add(lEye);

    const rEye = new THREE.Mesh(eyeGeo, eyeMat);
    rEye.position.set(0.12, 0.05, 0.21);
    head.add(rEye);

    // Collar mesh (red default, hidden until tamed)
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), collarMat);
    collar.position.set(0, 0.65, 0.45);
    collar.visible = false;
    group.add(collar);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.16, 0.4, 0.16);
    const fl = new THREE.Mesh(legGeo, wolfMat); fl.position.set(-0.18, 0.2, 0.28); group.add(fl);
    const fr = new THREE.Mesh(legGeo, wolfMat); fr.position.set(0.18, 0.2, 0.28); group.add(fr);
    const bl = new THREE.Mesh(legGeo, wolfMat); bl.position.set(-0.18, 0.2, -0.28); group.add(bl);
    const br = new THREE.Mesh(legGeo, wolfMat); br.position.set(0.18, 0.2, -0.28); group.add(br);

    // Tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.35, 0.12), wolfMat);
    tail.position.set(0, 0.6, -0.45);
    tail.rotation.x = -Math.PI / 4;
    group.add(tail);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'wolf',
      name: 'Wolf',
      mesh: group,
      head: head,
      collarMesh: collar,
      tailMesh: tail,
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

  // --- CAT & OCELOT ---
  spawnCat(x, y, z, breed = null) {
    const group = new THREE.Group();
    const breeds = ['tuxedo', 'tabby', 'siamese', 'british'];
    const chosenBreed = breed || breeds[Math.floor(Math.random() * breeds.length)];
    const catTex = this.textures?.[`cat_${chosenBreed}`] || this.createCatTexture(chosenBreed);
    const catMat = new THREE.MeshLambertMaterial({ map: catTex });

    // Body (0.30 x 0.26 x 0.55) - sleek cat body
    const bodyGeo = createBoxWithUV(0.30, 0.26, 0.55, 20, 0, 64, 32, 5, 5, 12);
    const body = new THREE.Mesh(bodyGeo, catMat);
    body.position.set(0, 0.40, -0.05);
    group.add(body);

    // Head (0.28 x 0.24 x 0.28)
    const headGeo = createBoxWithUV(0.28, 0.24, 0.28, 0, 0, 64, 32, 5, 4, 5);
    const head = new THREE.Mesh(headGeo, catMat);
    head.position.set(0, 0.52, 0.32);
    group.add(head);

    // Snout / Muzzle (0.16 x 0.08 x 0.08) attached to head
    const snoutGeo = createBoxWithUV(0.16, 0.08, 0.08, 0, 24, 64, 32, 3, 2, 1);
    const snout = new THREE.Mesh(snoutGeo, catMat);
    snout.position.set(0, -0.06, 0.16);
    head.add(snout);

    // Left and Right Triangular Ears
    const earGeo = createBoxWithUV(0.06, 0.08, 0.06, 0, 10, 64, 32, 1, 2, 1);
    const earL = new THREE.Mesh(earGeo, catMat);
    earL.position.set(-0.08, 0.14, -0.02);
    head.add(earL);

    const earR = new THREE.Mesh(earGeo, catMat);
    earR.position.set(0.08, 0.14, -0.02);
    head.add(earR);

    // Collar mesh (red default, hidden until tamed) attached to head
    const collarMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.06, 0.30), collarMat);
    collar.position.set(0, -0.10, -0.02);
    collar.visible = false;
    head.add(collar);

    // 4 Legs: fl, fr, bl, br (0.10 x 0.32 x 0.10)
    const legGeoFL = createBoxWithUV(0.10, 0.32, 0.10, 40, 0, 64, 32, 2, 8, 2);
    const legGeoFR = createBoxWithUV(0.10, 0.32, 0.10, 40, 12, 64, 32, 2, 8, 2);
    const legGeoBL = createBoxWithUV(0.10, 0.32, 0.10, 48, 0, 64, 32, 2, 8, 2);
    const legGeoBR = createBoxWithUV(0.10, 0.32, 0.10, 48, 12, 64, 32, 2, 8, 2);

    const fl = new THREE.Mesh(legGeoFL, catMat); fl.position.set(-0.10, 0.16, 0.18); group.add(fl);
    const fr = new THREE.Mesh(legGeoFR, catMat); fr.position.set(0.10, 0.16, 0.18); group.add(fr);
    const bl = new THREE.Mesh(legGeoBL, catMat); bl.position.set(-0.10, 0.16, -0.22); group.add(bl);
    const br = new THREE.Mesh(legGeoBR, catMat); br.position.set(0.10, 0.16, -0.22); group.add(br);

    // Articulated Tail: Upper tail and Lower tail
    const tailUpperGeo = createBoxWithUV(0.06, 0.22, 0.06, 0, 15, 64, 32, 1, 6, 1);
    const tailUpper = new THREE.Mesh(tailUpperGeo, catMat);
    tailUpper.position.set(0, 0.44, -0.32);
    tailUpper.rotation.x = -0.55;
    group.add(tailUpper);

    const tailLowerGeo = createBoxWithUV(0.06, 0.20, 0.06, 0, 15, 64, 32, 1, 6, 1);
    const tailLower = new THREE.Mesh(tailLowerGeo, catMat);
    tailLower.position.set(0, -0.18, -0.06);
    tailLower.rotation.x = 0.35;
    tailUpper.add(tailLower);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'cat',
      name: 'Cat',
      breed: chosenBreed,
      mesh: group,
      body: body,
      head: head,
      snout: snout,
      ears: [earL, earR],
      collarMesh: collar,
      legs: [fl, fr, bl, br],
      tailUpper: tailUpper,
      tailLower: tailLower,
      tailMesh: tailUpper,
      health: 10,
      maxHealth: 10,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      isSitting: false,
      isTamed: false,
      width: 0.6,
      height: 0.7
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnOcelot(x, y, z) {
    const mob = this.spawnCat(x, y, z, 'ocelot');
    mob.type = 'ocelot';
    mob.name = 'Ocelot';
    return mob;
  }

  // --- SLIME ---
  spawnSlime(x, y, z, size = 4) {
    const group = new THREE.Group();
    const outerMat = new THREE.MeshLambertMaterial({ color: 0x22c55e, transparent: true, opacity: 0.65 });
    const innerMat = new THREE.MeshLambertMaterial({ color: 0x15803d });

    const outer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), outerMat);
    outer.position.y = 0.6;
    group.add(outer);

    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), innerMat);
    inner.position.y = 0.6;
    group.add(inner);

    const s = size / 4;
    group.scale.set(s, s, s);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'slime',
      name: 'Slime',
      mesh: group,
      slimeSize: size,
      health: size * 4,
      maxHealth: size * 4,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- WITCH ---
  spawnWitch(x, y, z) {
    const group = new THREE.Group();
    const robeMat = new THREE.MeshLambertMaterial({ color: 0x3b0764 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
    const hatMat = new THREE.MeshLambertMaterial({ color: 0x18181b });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), robeMat);
    body.position.y = 1.05;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.7;
    group.add(head);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.15), skinMat);
    nose.position.set(0, 1.6, 0.32);
    group.add(nose);

    // Witch Hat
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.85), hatMat);
    brim.position.y = 2.0;
    group.add(brim);

    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.35, 0.65, 6), hatMat);
    cone.position.set(0, 2.35, -0.05);
    cone.rotation.x = -Math.PI / 12;
    group.add(cone);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'witch',
      name: 'Witch',
      mesh: group,
      head: head,
      health: 26,
      maxHealth: 26,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- WITHER SKELETON ---
  // --- WITHER SKELETON ---
  spawnWitherSkeleton(x, y, z, options = {}) {
    const mob = { ...createWitherSkeletonModel(), type: 'wither_skeleton', name: 'Wither Skeleton',
      health: 20, maxHealth: 20, velocity: new THREE.Vector3(), yaw: (this.random || Math.random)() * Math.PI * 2,
      state: 'idle', timer: 0, hitCooldown: 0 };
    mob.mesh.position.set(x, y, z); initializeWitherSkeleton(this, mob, options);
    this.scene.add(mob.mesh); this.mobs.push(mob); return mob;
  }
  // --- STRIDER ---
  spawnStrider(x, y, z, options = {}) {
    const mob = { ...createStriderModel(), type: 'strider', name: 'Strider',
      health: 20, maxHealth: 20, fireImmune: true, movementSpeed: .175,
      velocity: new THREE.Vector3(), yaw: (this.random || Math.random)() * Math.PI * 2,
      state: 'idle', timer: 0, hitCooldown: 0, isBaby: !!options.isBaby,
      babyGrowthTimer: options.isBaby ? 1200 : undefined };
    mob.mesh.position.set(x,y,z);mob.mesh.scale.setScalar(mob.isBaby ? .5 : 1);
    this.scene.add(mob.mesh);this.mobs.push(mob);return mob;
  }

  // --- GUARDIAN & ELDER GUARDIAN ---
  spawnElderGuardian(x, y, z) {
    return this.spawnGuardian(x, y, z, true);
  }

  spawnGuardian(x, y, z, isElder = false) {
    const group = new THREE.Group();
    const texture = isElder ? this.textures.elder_guardian : this.textures.guardian;
    const mat = new THREE.MeshLambertMaterial({ map: texture });
    const spikeColor = isElder ? 0x9a3412 : 0xf97316;
    const spikeMat = new THREE.MeshLambertMaterial({ color: spikeColor });

    // Main Prismarine Body Box (0.85 x 0.85 x 0.85)
    const bodyGeo = new THREE.BoxGeometry(0.85, 0.85, 0.85);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.y = 0.5;
    group.add(body);

    // Dynamic cyclops eyeball & tracking pupil on front (+Z)
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(0, 0.5, 0.43);
    const eyeBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.26, 0.04),
      new THREE.MeshLambertMaterial({ color: isElder ? 0xf1f5f9 : 0xffffff })
    );
    eyeSocket.add(eyeBase);
    const pupil = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.06),
      new THREE.MeshBasicMaterial({ color: isElder ? 0x991b1b : 0xe11d48 })
    );
    pupil.position.set(0, 0, 0.01);
    eyeSocket.add(pupil);
    group.add(eyeSocket);

    // 12 Spikes on all sides (3 top, 3 bottom, 3 left, 3 right)
    const spikeGeo = new THREE.BoxGeometry(0.11, 0.36, 0.11);
    const spikes = [];
    const spikeConfigs = [
      // Top (pointing +Y)
      { pos: [0, 0.95, -0.2], rot: [0, 0, 0], dir: [0, 1, 0] },
      { pos: [0, 0.95, 0.2], rot: [0, 0, 0], dir: [0, 1, 0] },
      { pos: [0, 0.95, 0.0], rot: [0, 0, 0], dir: [0, 1, 0] },
      // Bottom (pointing -Y)
      { pos: [0, 0.05, -0.2], rot: [Math.PI, 0, 0], dir: [0, -1, 0] },
      { pos: [0, 0.05, 0.2], rot: [Math.PI, 0, 0], dir: [0, -1, 0] },
      { pos: [0, 0.05, 0.0], rot: [Math.PI, 0, 0], dir: [0, -1, 0] },
      // Left (pointing -X)
      { pos: [-0.45, 0.5, -0.2], rot: [0, 0, Math.PI / 2], dir: [-1, 0, 0] },
      { pos: [-0.45, 0.5, 0.2], rot: [0, 0, Math.PI / 2], dir: [-1, 0, 0] },
      { pos: [-0.45, 0.5, 0.0], rot: [0, 0, Math.PI / 2], dir: [-1, 0, 0] },
      // Right (pointing +X)
      { pos: [0.45, 0.5, -0.2], rot: [0, 0, -Math.PI / 2], dir: [1, 0, 0] },
      { pos: [0.45, 0.5, 0.2], rot: [0, 0, -Math.PI / 2], dir: [1, 0, 0] },
      { pos: [0.45, 0.5, 0.0], rot: [0, 0, -Math.PI / 2], dir: [1, 0, 0] }
    ];

    for (const sc of spikeConfigs) {
      const spikeMesh = new THREE.Mesh(spikeGeo, spikeMat);
      spikeMesh.position.set(...sc.pos);
      spikeMesh.rotation.set(...sc.rot);
      group.add(spikeMesh);
      spikes.push({
        mesh: spikeMesh,
        basePos: new THREE.Vector3(...sc.pos),
        dir: new THREE.Vector3(...sc.dir)
      });
    }

    // Articulated 2-segment tail with vertical tail fin at back (-Z)
    const tailGroup1 = new THREE.Group();
    tailGroup1.position.set(0, 0.5, -0.42);

    const tailMesh1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.35), mat);
    tailMesh1.position.set(0, 0, -0.17);
    tailGroup1.add(tailMesh1);

    const tailGroup2 = new THREE.Group();
    tailGroup2.position.set(0, 0, -0.34);

    const tailMesh2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.28), mat);
    tailMesh2.position.set(0, 0, -0.14);
    tailGroup2.add(tailMesh2);

    const finGeo = new THREE.BoxGeometry(0.04, 0.52, 0.38);
    const fin = new THREE.Mesh(finGeo, spikeMat);
    fin.position.set(0, 0, -0.38);
    tailGroup2.add(fin);

    tailGroup1.add(tailGroup2);
    group.add(tailGroup1);

    if (isElder) group.scale.set(2.4, 2.4, 2.4);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: isElder ? 'elder_guardian' : 'guardian',
      name: isElder ? 'Elder Guardian' : 'Guardian',
      mesh: group,
      isElder: isElder,
      isAquatic: true,
      inWater: true,
      isHostile: true,
      tail1: tailGroup1,
      tail2: tailGroup2,
      tailSegments: [tailGroup1, tailGroup2],
      pupil: pupil,
      spikes: spikes,
      spikeExtension: 1.0,
      laserLine: null,
      laserTimer: 0,
      laserCharging: false,
      attackCooldown: 0,
      health: isElder ? 80 : 30,
      maxHealth: isElder ? 80 : 30,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      swimCycle: Math.random() * 10,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- DROWNED ---
  spawnDrowned(x, y, z) {
    const group = new THREE.Group();
    const drownedMat = new THREE.MeshLambertMaterial({ map: this.textures.drowned });

    // Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), drownedMat);
    body.position.y = 1.0;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), drownedMat);
    head.position.y = 1.62;
    group.add(head);

    // Glowing cyan eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeMat);
    eyeL.position.set(-0.12, 1.62, 0.26);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeMat);
    eyeR.position.set(0.12, 1.62, 0.26);
    group.add(eyeR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftLeg = new THREE.Mesh(legGeo, drownedMat);
    leftLeg.position.set(-0.14, 0.38, 0);
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, drownedMat);
    rightLeg.position.set(0.14, 0.38, 0);
    group.add(rightLeg);

    // Left Arm
    const armGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    const leftArm = new THREE.Mesh(armGeo, drownedMat);
    leftArm.position.set(-0.35, 1.0, 0);
    group.add(leftArm);

    // Right Arm holding Trident
    const rightArmGroup = new THREE.Group();
    rightArmGroup.position.set(0.35, 1.35, 0);
    const rightArm = new THREE.Mesh(armGeo, drownedMat);
    rightArm.position.set(0, -0.35, 0);
    rightArmGroup.add(rightArm);

    // 3D Trident
    const tridentGroup = new THREE.Group();
    tridentGroup.position.set(0, -0.35, 0.25);
    tridentGroup.rotation.x = -Math.PI / 4;

    const tridentMat = new THREE.MeshLambertMaterial({ color: 0x0ea5e9 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), tridentMat);
    shaft.position.y = 0.2;
    tridentGroup.add(shaft);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.04), tridentMat);
    crossbar.position.y = 0.85;
    tridentGroup.add(crossbar);

    const prongCenter = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), tridentMat);
    prongCenter.position.set(0, 1.0, 0);
    tridentGroup.add(prongCenter);

    const prongLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), tridentMat);
    prongLeft.position.set(-0.11, 0.96, 0);
    tridentGroup.add(prongLeft);

    const prongRight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), tridentMat);
    prongRight.position.set(0.11, 0.96, 0);
    tridentGroup.add(prongRight);

    rightArmGroup.add(tridentGroup);
    group.add(rightArmGroup);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'drowned',
      name: 'Drowned',
      mesh: group,
      isDrowned: true,
      isAquatic: true,
      inWater: true,
      head: head,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      leftArm: leftArm,
      rightArm: rightArmGroup,
      trident: tridentGroup,
      isHostile: true,
      health: 20,
      maxHealth: 20,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      state: 'idle',
      swimCycle: Math.random() * 10,
      attackCooldown: 0,
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- GLOW SQUID ---
  spawnGlowSquid(x, y, z, options={}) { return spawnSquid(this,'glow_squid',x,y,z,options); }

  // --- AQUATIC: COD ---
  spawnCod(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.cod });

    // Main Body
    const bodyGeo = new THREE.BoxGeometry(0.14, 0.22, 0.42);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.position.set(0, 0.12, 0);
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.12, 0.18, 0.18);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.set(0, 0.11, 0.26);
    group.add(head);

    // Dorsal Fin
    const dorsalGeo = new THREE.BoxGeometry(0.03, 0.12, 0.18);
    const dorsal = new THREE.Mesh(dorsalGeo, mat);
    dorsal.position.set(0, 0.26, -0.04);
    group.add(dorsal);

    // Left and Right Pectoral Fins
    const finGeo = new THREE.BoxGeometry(0.12, 0.03, 0.1);
    const finL = new THREE.Mesh(finGeo, mat);
    finL.position.set(-0.1, 0.06, 0.12);
    finL.rotation.z = -0.3;
    group.add(finL);

    const finR = new THREE.Mesh(finGeo, mat);
    finR.position.set(0.1, 0.06, 0.12);
    finR.rotation.z = 0.3;
    group.add(finR);

    // Articulated Tail Section
    const tailGroup = new THREE.Group();
    tailGroup.position.set(0, 0.12, -0.21);

    const tailBodyGeo = new THREE.BoxGeometry(0.09, 0.15, 0.22);
    const tailBody = new THREE.Mesh(tailBodyGeo, mat);
    tailBody.position.set(0, 0, -0.11);
    tailGroup.add(tailBody);

    const tailFinGeo = new THREE.BoxGeometry(0.03, 0.28, 0.22);
    const tailFin = new THREE.Mesh(tailFinGeo, mat);
    tailFin.position.set(0, 0, -0.3);
    tailGroup.add(tailFin);

    group.add(tailGroup);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'cod',
      name: 'Cod',
      mesh: group,
      isAquatic: true,
      inWater: true,
      tail: tailGroup,
      finL: finL,
      finR: finR,
      mat: mat,
      health: 3,
      maxHealth: 3,
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

  // --- PHANTOM ---
  spawnPhantom(x, y, z) {
    const group = new THREE.Group();
    const phantomMat = new THREE.MeshLambertMaterial({ color: 0x1e1b4b });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x84cc16 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.8), phantomMat);
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.2, 0.35), phantomMat);
    head.position.set(0, 0, 0.5);
    group.add(head);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), eyeMat); eyeL.position.set(-0.12, 0.08, 0.65); group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), eyeMat); eyeR.position.set(0.12, 0.08, 0.65); group.add(eyeR);

    // Broad wings
    const wingGeo = new THREE.BoxGeometry(1.6, 0.06, 0.5);
    const wings = new THREE.Mesh(wingGeo, phantomMat);
    wings.position.set(0, 0.05, 0);
    group.add(wings);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'phantom',
      name: 'Phantom',
      mesh: group,
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

  // --- VINDICATOR & EVOKER & VEX & RAVAGER ---
  spawnVindicator(x, y, z) {
    const group = new THREE.Group();
    const illagerMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.35), illagerMat);
    body.position.y = 1.0;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.65;
    group.add(head);

    // Iron Axe in hand
    const axeMat = new THREE.MeshLambertMaterial({ color: 0xe2e8f0 });
    const axe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.25), axeMat);
    axe.position.set(0.45, 1.1, 0.2);
    group.add(axe);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'vindicator',
      name: 'Vindicator',
      mesh: group,
      head: head,
      health: 24,
      maxHealth: 24,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnEvoker(x, y, z) {
    const group = new THREE.Group();
    const robeMat = new THREE.MeshLambertMaterial({ color: 0x18181b });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.35), robeMat);
    body.position.y = 1.0;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.65;
    group.add(head);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'evoker',
      name: 'Evoker',
      mesh: group,
      head: head,
      health: 24,
      maxHealth: 24,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  spawnVex(x, y, z) {
    const group = new THREE.Group();
    const vexMat = new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.75 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.25), vexMat);
    body.position.y = 0.3;
    group.add(body);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.3), vexMat);
    wings.position.set(0, 0.45, -0.15);
    group.add(wings);

    group.position.set(x, y, z);
    this.scene.add(group);

    const mob = {
      type: 'vex',
      name: 'Vex',
      mesh: group,
      isFlying: true,
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

  spawnRavager(x, y, z) {
    const group = new THREE.Group();
    const ravagerMat = new THREE.MeshLambertMaterial({
      map: this.textures.ravager || this.createRavagerTexture(),
      color: 0xffffff
    });
    const hornMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const faceMat = new THREE.MeshLambertMaterial({ color: 0x1b2228 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe5e7eb });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 2.0), ravagerMat);
    body.position.y = 1.4;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), ravagerMat);
    head.position.set(0, 1.8, 1.3);
    group.add(head);

    // The texture provides the hide pattern; these small modeled details keep
    // the face readable from any camera angle instead of looking like a white
    // cube when the atlas is still loading.
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.12), faceMat);
    muzzle.position.set(0, 1.62, 1.76);
    group.add(muzzle);
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.05);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.23, 2.03, 1.74); group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.23, 2.03, 1.74); group.add(eyeR);

    // Horns
    const hornL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), hornMat); hornL.position.set(-0.55, 2.3, 1.2); group.add(hornL);
    const hornR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, 0.18), hornMat); hornR.position.set(0.55, 2.3, 1.2); group.add(hornR);

    // 4 Heavy Legs
    const legGeo = new THREE.BoxGeometry(0.45, 1.0, 0.45);
    const fl = new THREE.Mesh(legGeo, ravagerMat); fl.position.set(-0.5, 0.5, 0.7); group.add(fl);
    const fr = new THREE.Mesh(legGeo, ravagerMat); fr.position.set(0.5, 0.5, 0.7); group.add(fr);
    const bl = new THREE.Mesh(legGeo, ravagerMat); bl.position.set(-0.5, 0.5, -0.7); group.add(bl);
    const br = new THREE.Mesh(legGeo, ravagerMat); br.position.set(0.5, 0.5, -0.7); group.add(br);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'ravager',
      name: 'Ravager',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      health: 100,
      maxHealth: 100,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- ENDER DRAGON BOSS ---
  spawnEnderDragon(x, y, z) {
    const group = new THREE.Group();
    const dragonMat = new THREE.MeshLambertMaterial({ color: 0x111827 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd946ef });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 3.2), dragonMat);
    body.position.y = 1.0;
    group.add(body);

    // Long Neck
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.4), dragonMat);
    neck.position.set(0, 1.6, 2.0);
    group.add(neck);

    // Head with purple eyes
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.1), dragonMat);
    head.position.set(0, 1.8, 3.0);
    group.add(head);

    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), eyeMat); eyeL.position.set(-0.48, 1.9, 3.2); group.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), eyeMat); eyeR.position.set(0.48, 1.9, 3.2); group.add(eyeR);

    // Wings
    const wingGeo = new THREE.BoxGeometry(2.8, 0.08, 1.6);
    const wingL = new THREE.Mesh(wingGeo, dragonMat); wingL.position.set(-2.0, 1.5, 0.5); group.add(wingL);
    const wingR = new THREE.Mesh(wingGeo, dragonMat); wingR.position.set(2.0, 1.5, 0.5); group.add(wingR);

    // Segmented Tail
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 2.5), dragonMat);
    tail.position.set(0, 0.9, -2.5);
    group.add(tail);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'ender_dragon',
      name: 'Ender Dragon',
      mesh: group,
      head: head,
      wingL: wingL,
      wingR: wingR,
      isFlying: true,
      isBoss: true,
      health: 200,
      maxHealth: 200,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  // --- THE WITHER BOSS ---
  spawnWither(x, y, z) {
    const group = new THREE.Group();
    const witherMat = new THREE.MeshLambertMaterial({ color: 0x18181b });
    const skullMat = new THREE.MeshLambertMaterial({
      map: this.textures?.wither_skull || this.textures?.wither_skeleton,
      color: 0xffffff
    });
    const ribMat = new THREE.MeshLambertMaterial({ color: 0x27272a });

    // Central spine
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.3, 0.22), witherMat);
    spine.position.y = 1.0;
    group.add(spine);

    // 3 distinct horizontal rib bars
    for (let r = 0; r < 3; r++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.85 - r * 0.15, 0.12, 0.25), ribMat);
      rib.position.set(0, 1.3 - r * 0.22, 0);
      group.add(rib);
    }

    // 3 Skulls: Center main skull + Left & Right sub-skulls
    const centerHead = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), skullMat);
    centerHead.position.set(0, 1.85, 0);
    group.add(centerHead);

    const sideHeadGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    const leftHead = new THREE.Mesh(sideHeadGeo, skullMat);
    leftHead.position.set(-0.75, 1.7, 0);
    group.add(leftHead);

    const rightHead = new THREE.Mesh(sideHeadGeo, skullMat);
    rightHead.position.set(0.75, 1.7, 0);
    group.add(rightHead);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'wither',
      name: 'The Wither',
      mesh: group,
      head: centerHead,
      leftHead: leftHead,
      rightHead: rightHead,
      isFlying: true,
      isBoss: true,
      health: 300,
      maxHealth: 300,
      velocity: new THREE.Vector3(),
      yaw: 0,
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
  spawnSalmon(x, y, z, options = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ map: this.textures.salmon });

    // Wiki: salmon spawn in three sizes at 31.6% / 52.6% / 15.8%, with distinct hitboxes.
    const size = SALMON_SIZES[options.size] ? options.size : rollSalmonSize();
    const scale = SALMON_SIZES[size].scale;

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
    // The three sizes are one model at three scales, so every part stays proportional.
    group.scale.setScalar(scale);
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
      // Wiki: 3 HP. This previously reported 6, which was an early-1.13-era value.
      health: 3,
      maxHealth: 3,
      size,
      // Pinned so a scenario can force a size and the hitbox lookup agrees.
      width: SALMON_SIZES[size].width,
      height: SALMON_SIZES[size].height,
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

  spawnSquid(x, y, z, options={}) { return spawnSquid(this,'squid',x,y,z,options); }

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

  damageMob(mob, amount, knockbackOrigin, isPunch = false, attacker = null, bypassArmor = false) {
    if (mob.health <= 0 || mob.dying) return false;
    if (!isPunch && mob.hitCooldown > 0) return false;
    if ((mob.type === 'magma_cube' || mob.type === 'horse' || mob.type === 'wither_skeleton' || isZombifiedPiglin(mob)) && !bypassArmor) amount *= 1 - Math.min(20, Math.max((mob.armor || 0)/5, (mob.armor || 0)-amount/2))/25;
    if (attacker === this.game?.player || (!isZombifiedPiglin(mob) && !attacker && knockbackOrigin)) mob.playerDamaged = true;
    if(mob.type==='strider'){
      this.sounds?.playStrider?.(mob.health<=amount?'death':'retreat');mob.soundTimer=3;
      if(attacker?.type==='wolf'&&attacker.isTamed)mob.wolfKilled=true;
      if(attacker===this.game?.player){const e=attacker.inventory?.getActiveItem?.()?.enchantments;mob.lootingLevel=Math.max(0,Math.min(3,(Array.isArray(e)?e.find(v=>v.id==='looting')?.level:e?.looting)||0));}
    }
    if(isSquid(mob)&&attacker?.type==='wolf'&&attacker.isTamed)mob.wolfKilled=true;
    if(isSquid(mob)&&attacker===this.game?.player){mob.playerCreditSeconds=5;const e=attacker.inventory?.getActiveItem?.()?.enchantments;mob.lootingLevel=Math.max(0,Math.min(3,(Array.isArray(e)?e.find(v=>v.id==='looting')?.level:e?.looting)||0));}
    mob.health -= amount;
    if(isPackEquine(mob))hurtPackEquine(this,mob,attacker);
    if(mob.type==='wither_skeleton')hurtWitherSkeleton(this,mob,attacker);
    if (mob.type === 'hoglin') retaliateHoglins(this, mob, attacker || (knockbackOrigin ? (this.game?.player || { position: knockbackOrigin }) : null));
    mob.hitCooldown = isPunch ? 0.15 : 0.35;

    // Flash every visible material red. Ghasts (and several textured mobs) do
    // not expose the single `mob.mat` field used by older mobs, so only checking
    // that field made hits look completely invisible.
    // Preserve the first hit's originals when rapid melee hits refresh the flash.
    // Otherwise a second hit would save the already-red color and leave the mob red.
    const hurtMaterials = mob.hurtMaterials || [];
    mob.mesh?.traverse(child => {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (!material?.color || hurtMaterials.some(entry => entry.material === material)) continue;
        const entry = {
          material,
          color: material.color.clone(),
          emissive: material.emissive?.clone?.() || null,
          emissiveIntensity: material.emissiveIntensity
        };
        hurtMaterials.push(entry);
        material.color.setRGB(1.0, 0.16, 0.12);
        if (material.emissive?.setRGB) {
          material.emissive.setRGB(0.65, 0.03, 0.01);
          material.emissiveIntensity = Math.max(0.8, material.emissiveIntensity || 0);
        }
      }
    });
    if (mob.mat?.color && !hurtMaterials.some(entry => entry.material === mob.mat)) {
      hurtMaterials.push({ material: mob.mat, color: mob.mat.color.clone(), emissive: mob.mat.emissive?.clone?.() || null, emissiveIntensity: mob.mat.emissiveIntensity });
      mob.mat.color.setRGB(1.0, 0.16, 0.12);
    }
    mob.hurtMaterials = hurtMaterials;
    mob.hurtTime = 0.18;
    if (mob.mesh) {
      mob.hurtScaleBase = mob.hurtScaleBase || mob.mesh.scale.clone();
      mob.hurtScalePulse = 0.045;
    }

    if(isSquid(mob)) {
      hurtSquid(this,mob,attacker,knockbackOrigin);
    } else if (mob.type === 'glow_squid') {
      this.spawnParticleBurst(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x22d3ee, 10);
    } else if (mob.type === 'squid' || mob.type === 'octopus') {
      this.spawnParticleBurst(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x18181b, 10);
    }

    if (mob.type === 'zombified_piglin' || mob.type === 'zombie_pigman') {
      hurtZombified(this,mob,attacker);
    } else if (mob.type === 'piglin') {
      if ((!attacker && knockbackOrigin) || (attacker && attacker === this.game?.player)) angerPiglins(this, mob.mesh.position);
      else if (attacker) { mob.combatTarget = attacker; mob.retaliationTimer = 30; mob.isBartering = false; }
    }

    if (mob.health <= 0 && mob.laserLine && this.scene) {
      this.scene.remove(mob.laserLine);
      mob.laserLine.geometry?.dispose();
      mob.laserLine.material?.dispose();
      mob.laserLine = null;
    }

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
      const kbFactor = isSquid(mob) ? .15 : ['hoglin', 'zoglin'].includes(mob.type) ? 0.4 : isHeavyOrFlying ? 0.25 : 1.0;
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
    else if (mob.type === 'chicken') this.sounds?.playChicken?.();
    else if (mob.type === 'jackie_chun') {
      if (this.sounds?.playHit) this.sounds.playHit();
      // Clone death check
      if (mob.isClone && mob.health <= 0) {
        this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 18);
        this.entities?.spawnDeathParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
        this.scene.remove(mob.mesh);
        this.removeDebugLabel(mob);
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
            this.removeDebugLabel(cl);
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

  /**
   * Death loot for a mob, as `[itemId, isBlock, minCount, maxCount]` rows.
   *
   * Split out of updateDeath so the table can be asserted directly instead of being
   * inferred from dropped-item entities. That matters because `updateDeath` adds rows
   * from several specialized handlers (pack equines, squids, wither skeletons,
   * zombified piglins) *and* suppresses the whole table via `mob.noLoot`, so a
   * dropped-item count alone cannot tell a missing row from a suppressed one.
   *
   * Rows may also be conditional on mob state, which is how the two sheep-only rules
   * from the wiki are expressed: a sheared sheep drops no wool, and a burned sheep
   * drops cooked mutton.
   *
   * `random` is injectable so the flat independent chances (salmon bone meal) can be
   * asserted deterministically instead of sampled.
   */
  getMobDeathDrops(mob, random = Math.random) {
    const burned = mob.isOnFire || mob.fireTicks > 0;
    const sheepWool = BLOCKS[`${(mob.woolColor || 'white').toUpperCase()}_WOOL`] || BLOCKS.WHITE_WOOL;
    const base = {
      pig: [[burned ? 'cooked_porkchop' : 'porkchop', false, 1, 3]],
      cow: [[burned ? 'cooked_beef' : 'beef', false, 1, 3], ['leather', false, 0, 2]],
      // Wiki: mooshrooms drop the same beef and leather as cows, not mushrooms.
      mooshroom: [[burned ? 'cooked_beef' : 'beef', false, 1, 3], ['leather', false, 0, 2]],
      // A sheared sheep has no wool to drop. Mutton is unaffected by shearing.
      sheep: [...(mob.isSheared ? [] : [[sheepWool, true, 1, 1]]), [burned ? 'cooked_mutton' : 'mutton', false, 1, 2]],
      chicken: [[burned ? 'cooked_chicken' : 'chicken', false, 1, 1], ['feather', false, 1, 2]],
      horse: [['leather', false, 0, 2]],
      mule: [['leather', false, 0, 2]],
      donkey: [['leather', false, 1, 2]],
      salmon: [[burned ? 'cooked_salmon' : 'salmon', false, 1, 1]],
      cod: [[burned ? 'cooked_cod' : 'cod', false, 1, 1]],
      dolphin: [['salmon', false, 0, 1]],
      octopus: [['ink_sac', false, 1, 3]],
      squid: [['ink_sac', false, 1, 3]],
      glow_squid: [['glow_ink_sac', false, 1, 3]],
      skeleton: [['bone', false, 1, 2], ['arrow', false, 1, 2]],
      creeper: [['gunpowder', false, 1, 2]],
      zombie: [['rotten_flesh', false, 1, 2]],
      zombie_villager: [['rotten_flesh', false, 1, 2], ['iron_ingot', false, 0, 1]],
      iron_golem: [['iron_ingot', false, 3, 5], [BLOCKS.POPPY, true, 1, 1]],
      pillager: [['arrow', false, 1, 2]],
      vindicator: [['emerald', false, 0, 1]],
      evoker: [['totem_of_undying', false, 1, 1], ['emerald', false, 1, 1]],
      blaze: mob.playerDamaged ? [['blaze_rod', false, 0, 1]] : [],
      ghast: [['ghast_tear', false, 0, 1], ['gunpowder', false, 1, 2]],
      piglin: !mob.isBaby && !mob.equipment?.weapon && Math.random() < 0.085 ? [[mob.weapon || 'golden_sword', false, 1, 1]] : [],
      zoglin: [['rotten_flesh', false, 1, 3]],
      zombified_piglin: [['rotten_flesh', false, 0, 2], ['gold_nugget', false, 1, 3], ['gold_ingot', false, 0, 1], ['golden_sword', false, 0, 1]],
      zombie_pigman: [['rotten_flesh', false, 0, 2], ['gold_nugget', false, 1, 3], ['gold_ingot', false, 0, 1], ['golden_sword', false, 0, 1]],
      hoglin: [[burned ? 'cooked_porkchop' : 'porkchop', false, 2, 4], ['leather', false, 0, 1]],
      strider: [['string', false, 2, 5 + (mob.lootingLevel || 0)]],
      magma_cube: mob.playerDamaged && mob.slimeSize > 1 ? [['magma_cream', false, 0, 1]] : [],
      wither_skeleton: [['bone', false, 1, 2], ['coal', false, 1, 2], ['wither_skeleton_skull', false, 0, 1]],
      witch: [['glass_bottle', false, 1, 2], ['glowstone_dust', false, 1, 2], ['redstone', false, 1, 2], ['sugar', false, 1, 2]],
      guardian: [['prismarine_shard', false, 1, 2], ['prismarine_crystals', false, 0, 1]],
      elder_guardian: [[BLOCKS.WET_SPONGE, true, 1, 1], ['prismarine_shard', false, 2, 4], ['prismarine_crystals', false, 1, 2]],
      drowned: [['rotten_flesh', false, 1, 2]],
      phantom: [['phantom_membrane', false, 1, 2]],
      warden: [[BLOCKS.SCULK_CATALYST, true, 1, 1]],
      wither: [['nether_star', false, 1, 1]]
    }[mob.type] || [];
    // Wiki: salmon have a flat 5% chance of bone meal, independent of the raw salmon drop.
    return [...base, ...salmonBonusDrops(mob, random)];
  }
  updateDeath(mob, dt) {
    if (!mob.dying) {
      mob.dying = true;
      if (mob.laserLine && this.scene) {
        this.scene.remove(mob.laserLine);
        mob.laserLine.geometry?.dispose();
        mob.laserLine.material?.dispose();
        mob.laserLine = null;
      }
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
    const fall = isSquid(mob) ? 0 : THREE.MathUtils.smoothstep(mob.deathTime, 0, 0.5);
    mob.mesh.rotation.z = mob.deathRotation + fall * Math.PI / 2;
    mob.deathLift = Math.sin(fall * Math.PI / 2) * this.getMobDimensions(mob.type).width * 0.5;
    mob.mesh.position.y += mob.deathLift;
    if (mob.deathTime >= 0.65 && !mob.lootDropped) {
      mob.lootDropped = true;
      if (mob.type === 'slime' || mob.type === 'magma_cube') {
        this.hostileBehaviors?.handleMobDeathSplitting?.(mob);
      }
      const pos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0));
      if(isPackEquine(mob)){dropPackEquineLoot(this,mob,pos);mob.noLoot=true;}
      if(mob.type==='wither_skeleton'){dropWitherSkeletonLoot(this,mob,pos);mob.noLoot=true;}
      if(isSquid(mob)){dropSquidLoot(this,mob,pos);mob.noLoot=true;}
      if(isZombifiedPiglin(mob)){dropZombifiedLoot(this,mob,pos);mob.noLoot=true;}
      if (mob.isBaby) {
        mob.noLoot = true;
        if (['hoglin', 'piglin', 'zoglin'].includes(mob.type)) this.entities?.spawnXpOrbs?.(pos, 5);
      }
      const loot = this.getMobDeathDrops(mob);
      if (mob.isRaidCaptain && this.game?.player?.applyStatusEffect) {
        this.game.player.applyStatusEffect('bad_omen', 100);
      }
      if (mob.type === 'piglin') {
        for (const item of [...Object.values(mob.equipment || {}), ...(mob.piglinInventory || [])]) {
          if (item.pickedUp || mob.piglinInventory?.includes(item) || Math.random() < 0.085) this.entities?.spawnDroppedItem(pos, item.id, !!item.isBlock, item.count || 1, { enchantments: item.enchantments });
        }
        if (mob.admiredItem) this.entities?.spawnDroppedItem(pos, mob.admiredItem.id, !!mob.admiredItem.isBlock, 1, { enchantments: mob.admiredItem.enchantments });
      }
      if(mob.type==='strider'&&!mob.isBaby&&mob.isSaddled)this.entities?.spawnDroppedItem(pos,'saddle',false,1);
      if (mob.type==='horse' && !mob.isBaby) {
        for(const id of [mob.isSaddled && 'saddle',mob.horseArmor,mob.hasChest && 'chest'].filter(Boolean))this.entities?.spawnDroppedItem(pos,id,false,1);
      }
      if (!mob.noLoot) {
        for (const [id, isBlock, min, max] of loot) {
          const count = min + Math.floor(Math.random() * (max - min + 1));
          if (count > 0) {
            this.entities?.spawnDroppedItem(pos, id, isBlock, count, { pickupDelay: 1.2 });
          }
        }
        if (this.entities?.spawnXpOrbs) {
          const hostile = ['skeleton', 'creeper', 'pillager', 'zombie', 'spider', 'enderman', 'witch', 'blaze', 'piglin', 'hoglin', 'zoglin'].includes(mob.type);
          const xpVal = mob.type === 'blaze' ? (mob.playerDamaged ? 10 : 0) : (isEquine(mob)||mob.type==='strider') ? (mob.playerDamaged || mob.wolfKilled ? 1+Math.floor(Math.random()*3) : 0) : mob.type === 'magma_cube' ? (mob.playerDamaged ? mob.slimeSize : 0) : hostile ? 5 : (mob.type === 'iron_golem' ? 0 : (1 + Math.floor(Math.random() * 3)));
          if (xpVal > 0) this.entities.spawnXpOrbs(pos, xpVal);
        }
      }
      this.entities?.spawnDeathParticles(pos);
    }
    for (const mat of mob.deathMaterials) {
      mat.transparent = true;
      mat.opacity = 1 - THREE.MathUtils.smoothstep(mob.deathTime, 0.65, 0.95);
    }
    if (mob.deathTime >= 0.95) {
      this.scene.remove(mob.mesh);
      this.removeDebugLabel(mob);
      this.mobs.splice(this.mobs.indexOf(mob), 1);
      const geometries = new Set();
      mob.mesh.traverse(child => { if (child.geometry) geometries.add(child.geometry); });
      geometries.forEach(geo => geo.dispose());
      for(const texture of mob.ownedTextures || [])texture.dispose();
      if(isSquid(mob))for(const mat of mob.squidMaterials||[])mat.map?.dispose();
      mob.deathMaterials.forEach(mat => mat.dispose()); // texture maps are shared and stay cached
    }
  }

  /**
   * Lazily create the per-mob fault tracking.
   *
   * This cannot live only in the constructor: tests and other callers build a
   * MobManager with `Object.create(MobManager.prototype)`, which skips it. Creating
   * it on first use keeps those callers working. For the same reason this and
   * reportMobError are plain methods rather than `#private` — private members throw
   * "Receiver must be an instance of class" on those prototype-only stubs.
   */
  ensureFaultTracking() {
    if (!this.brokenMobs) this.brokenMobs = new WeakSet();
    if (!this.mobErrors) this.mobErrors = new Map();
  }

  /**
   * Show, refresh or hide a mob's overhead health bar.
   *
   * Only training-site and combat mobs show one; everything else has its sprite
   * hidden. Lifted out of the update loop unchanged so that loop reads as a sequence
   * of named steps rather than one long body.
   */
  updateMobHealthBar(mob) {
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
  }

  /**
   * Per-type cosmetic animation: ghast tentacles and face, blaze rods and smoke,
   * magma cube squash, strider shiver.
   *
   * Purely visual — no AI and no physics — which is what makes it safe to lift out of
   * the update loop. `vx`/`vz` are the mob's horizontal velocity, passed in so this
   * stays independent of locomotion.
   */
  updateMobAnimation(mob, dt, vx = 0, vz = 0) {
    if (mob.type === 'ghast') {
      mob.ghastAnimTimer = (mob.ghastAnimTimer || 0) + dt * 2.5;
      if (mob.tentacles) {
        const dragX = -Math.max(-0.35, Math.min(0.35, vx * 0.12));
        const dragZ = -Math.max(-0.35, Math.min(0.35, vz * 0.12));
        for (let tIdx = 0; tIdx < mob.tentacles.length; tIdx++) {
          const wave = Math.sin(mob.ghastAnimTimer + tIdx * 0.7) * 0.22;
          const sway = Math.cos(mob.ghastAnimTimer + tIdx * 0.5) * 0.14;
          mob.tentacles[tIdx].rotation.x = wave + dragZ;
          mob.tentacles[tIdx].rotation.z = sway - dragX;
        }
      }
      if (mob.headMat) {
        const isShooting = (mob.isChargingFireball || mob.isShooting || (mob.fireballCooldown !== undefined && mob.fireballCooldown > 4.2));
        const targetTex = isShooting ? this.textures.ghast_shooting : this.textures.ghast;
        if (mob.headMat.map !== targetTex && targetTex) {
          mob.headMat.map = targetTex;
          mob.headMat.needsUpdate = true;
        }
      }
    } else if (mob.type === 'blaze' && mob.tiers) {
      mob.flames.visible = !!mob.charging;
      mob.flames.rotation.y += dt*2;
      for (const puff of mob.smoke.children) { puff.position.y = (puff.position.y+dt*.6)%1.9; puff.material.opacity=.4*(1-puff.position.y/1.9); }
      if (mob.tiers[0]) mob.tiers[0].rotation.y += dt * 2.0;
      if (mob.tiers[1]) mob.tiers[1].rotation.y -= dt * 1.5;
      if (mob.tiers[2]) mob.tiers[2].rotation.y += dt * 2.5;
    } else if (mob.type === 'magma_cube' && mob.layers) {
      const isJumping = (mob.velocity && Math.abs(mob.velocity.y) > 0.5);
      const expand = isJumping ? Math.min(1.0, Math.abs(mob.velocity.y) / 4.0) : 0;
      for (let lIdx = 0; lIdx < mob.layers.length; lIdx++) {
        const baseY = 0.05 + lIdx * 0.1;
        const stretch = lIdx * 0.07 * expand;
        mob.layers[lIdx].position.y = baseY + stretch;
      }
      if (mob.core) {
        mob.core.scale.y = 1.0 + expand * 0.7;
      }
    } else if (mob.type === 'strider') {
      if (mob.isCold) {
        mob.shiverTimer = (mob.shiverTimer || 0) + dt * 35;
        if (mob.head) mob.head.position.x = Math.sin(mob.shiverTimer) * 0.04;
      } else if (mob.head) {
        mob.head.position.x = 0;
      }
    }
  }

  /**
   * Report a mob fault once per distinct error.
   *
   * A failing mob throws every frame, so logging each occurrence would flood the
   * console and bury the cause. Repeats are counted instead, and the player is told
   * once that something is wrong rather than dozens of times a second.
   *
   * @returns {string} a one-line summary, also used by tests
   */
  reportMobError(err, mob) {
    this.ensureFaultTracking();
    const kind = err?.constructor?.name || 'Error';
    const message = err?.message || String(err);
    const pos = mob?.mesh?.position;
    const at = pos ? `${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}` : 'unknown position';
    const where = `${mob?.type ?? 'unknown'} at ${at}`;
    const key = `${kind}: ${message}`;
    const summary = `${where}: ${message}`;

    const seen = this.mobErrors.get(key);
    if (seen) {
      seen.count++;
      seen.mobs.add(where);
      return summary;
    }
    this.mobErrors.set(key, { count: 1, mobs: new Set([where]) });
    console.error(`[Mobs] ${kind} while updating ${where}: ${message}`, err);
    this.game?.ui?.addChatMessage?.(
      `A ${mob?.type ?? 'mob'} hit an error and stopped updating: ${message}. Other mobs are unaffected - see the browser console for the trace.`,
      'error'
    );
    return summary;
  }

  update(dt, player) {
    dt = Math.min(dt, 0.1);
    this.ensureFaultTracking();
    for (const mob of this.mobs) if (mob.mesh) mob.contactStart = mob.mesh.position.clone();
    updateStriderSpawning(this, dt, player);
    updateSquidSpawning(this, dt, player);
    updateWitherSkeletonSpawning(this,dt,player);
    updateDonkeySpawning(this,dt,player);
    updateMobWither(this,dt);
    updateArrows(this, dt, player);
    updateSnowballs(this, dt);
    this.animalBehaviors?.update(dt, player, this.game?.controls || {});
    this.hostileBehaviors?.update(dt, player);
    updateBarterEffects(this, dt, player);

    // 2. Update Mobs AI & Physics
    // Each mob is updated in isolation. Previously a fault in one mob took the whole
    // loop down with it: every other mob froze mid-step and stopped reacting to hits,
    // and the only trace was a console line. A mob that faults is now reported once
    // and skipped, so the rest of the world keeps moving.
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      if (this.brokenMobs.has(mob)) continue;
      try {
        // A frozen mob is posed, not simulated: no AI, no physics, no animation. Mob
        // Studio sets this so a mob stands still while you look at it, and the debug
        // inspector sets it so a model can be examined without it wandering off.
        if (mob.vehicle?.type === 'strider') {
          if(mob.vehicle.health<=0){mob.vehicle.rider=null;mob.vehicle=null;}
          else if(mob.health<=0){mob.vehicle.rider=null;mob.vehicle=null;this.updateDeath(mob,dt);continue;}
          else if(mob.type==='zombified_piglin'&&this.game?.difficulty==='peaceful'){mob.vehicle.rider=null;this.scene.remove(mob.mesh);this.mobs.splice(i,1);continue;}
        }
        if (mob.frozen) {
          mob.velocity?.set(0, 0, 0);
          continue;
        }
        if(isPackEquine(mob)&&(mob.vehicle?.kind==='minecart'||mob.ridingBoat)){
          const vehicle=mob.vehicle||mob.ridingBoat;
          if(mob.health<=0){if(vehicle.rider===mob)vehicle.rider=null;if(vehicle.passenger===mob)vehicle.passenger=null;mob.vehicle=null;mob.ridingBoat=null;mob.isRiding=false;this.updateDeath(mob,dt);}
          else mob.velocity.set(0,0,0);
          continue;
        }

        // A mob standing in lava or fire is leaving before it does anything else. This runs
        // before the AI chain so the heading cannot be overwritten by a mob that wants to walk
        // somewhere else; movement itself still goes through the normal ground mover.
        {
          const escapingHazard = !isSquid(mob) && updateHazardEscape(this, mob, dt);
          if (escapingHazard) {
            moveGroundMob(this, mob, dt);
            continue;
          }
        }
        if (mob.hitCooldown > 0) mob.hitCooldown -= dt;

      mob.hurtTime = Math.max(0, (mob.hurtTime || 0) - dt);
      if (mob.hurtScaleBase && mob.mesh) {
        if (mob.hurtTime > 0 && !mob.dying) {
          const progress = 1 - mob.hurtTime / 0.18;
          const pulse = Math.sin(Math.min(1, progress) * Math.PI) * (mob.hurtScalePulse || 0.045);
          mob.mesh.scale.copy(mob.hurtScaleBase).multiplyScalar(1 + pulse);
        } else {
          mob.mesh.scale.copy(mob.hurtScaleBase);
          mob.hurtScaleBase = null;
        }
      }
      // Restore the mob's colour once its hurt flash ends. Not every mob type builds
      // a shared material — 28 of the 49 spawners leave `mat` undefined — and this
      // line used to throw for those. Because the whole mob update ran inside a
      // single try/catch, one such mob froze every mob in the world: nothing moved
      // and nothing reacted to being hit.
      if (mob.hurtTime === 0 && !mob.dying && mob.hurtMaterials) {
        for (const entry of mob.hurtMaterials) {
          if (!entry.material?.color) continue;
          entry.material.color.copy(entry.color);
          if (entry.emissive && entry.material.emissive?.copy) entry.material.emissive.copy(entry.emissive);
          if (entry.emissiveIntensity !== undefined) entry.material.emissiveIntensity = entry.emissiveIntensity;
        }
        mob.hurtMaterials = null;
      }

      // Overhead health bar for training & combat mobs
      this.updateMobHealthBar(mob);

      if (mob.health <= 0) {
        if(isEquine(mob)||mob.type==='strider')releaseHorseLead(this,mob);
        this.updateDeath(mob, dt);
        continue;
      }

      if (mob.isAquatic) {
        if (this.updateAquaticMob(mob, dt, player)) continue;
      }

      // Distance to player
      const distToPlayer = player?.position ? mob.mesh.position.distanceTo(player.position) : 999;

      if(mob.vehicle?.type==='strider'){if(mob.type==='strider')updateStriderExposure(this,mob,dt);continue;}
      // --- MOB SPECIFIC AI BEHAVIORS ---
      if (this.updateMobTypeBehavior(mob, dt, player, distToPlayer)) continue;

      // Tusk wind-up stays separate from locomotion.
      if (['hoglin', 'zoglin'].includes(mob.type) && mob.head) {
        mob.tuskAttackTime = Math.max(0, (mob.tuskAttackTime || 0) - dt);
        mob.head.rotation.x = -Math.sin(mob.tuskAttackTime / 0.3 * Math.PI) * 0.5;
      }
      const vx = mob.velocity ? mob.velocity.x : 0;
      const vz = mob.velocity ? mob.velocity.z : 0;
      this.updateMobAnimation(mob, dt, vx, vz);
      } catch (err) {
        // One broken mob must not stop the others. Report it once and skip it from
        // now on, rather than throwing every frame and burying the cause.
        this.brokenMobs.add(mob);
        this.reportMobError(err, mob);
      }
    }

    // Apply mob-to-mob soft collision separation so mobs never squeeze/collapse into one position
    this.applyMobCollisions(dt);
    separatePlayerFromMobs(this, player, dt);

    for(const mob of this.mobs){if(!mob.jockeyMount)continue;const mount=mob.jockeyMount;if(mob.health<=0||mount.health<=0){mount.rider=null;mob.jockeyMount=null;continue;}mob.mesh.position.copy(mount.mesh.position).y+=mount.type==='chicken'?.55:1.4;mob.velocity.set(0,0,0);}
    // Apply the final mount pose after the mob and separation passes. Animal
    // Behaviors sets the rider before locomotion, so syncing at the end avoids
    // a one-frame lag that looked like jitter behind a moving horse.
    const activeMount = this.animalBehaviors?.mount;
    if (activeMount?.mob?.rider === player && player?.position) {
      const mountOffset = isPackEquine(activeMount.mob) ? 1.4*activeMount.mob.rig.scale.y : isEquine(activeMount.type) ? 1.4 : activeMount.type==='strider' ? 1.7 : 0.8;
      player.position.copy(activeMount.mob.mesh.position).add(new THREE.Vector3(0, mountOffset, 0));
      player.velocity?.set?.(0, 0, 0);
      player.updateCameraAndModel?.(0);
    }

    // Update custom projectiles (fireballs, etc.)
    if (this.customProjectiles && this.customProjectiles.length > 0) {
      for (let pIdx = this.customProjectiles.length - 1; pIdx >= 0; pIdx--) {
        const p = this.customProjectiles[pIdx];
        if (p.isBlazeFireball) continue;
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
  /**
   * Per-type AI: one branch per mob family (drowned, villager, iron golem, pillager,
   * zombie, farm animals, creeper, skeleton, bosses, enderman, custom mobs).
   *
   * Lifted verbatim from the update loop. `distToPlayer` is passed in because the
   * loop computes it just above; everything else it touches is this mob, the
   * timestep, the player, or this manager.
   *
   * @returns {boolean} true when the caller should stop processing this mob
   */
  updateMobTypeBehavior(mob, dt, player, distToPlayer) {
    if(isPackEquine(mob)&&mob.panicSeconds>0&&!mob.rider){
      const speed=(mob.movementSpeed??.175)*20;mob.yaw=mob.panicYaw;mob.wanderGoal=null;
      mob.velocity.x=Math.sin(mob.yaw)*speed;mob.velocity.z=Math.cos(mob.yaw)*speed;
      this.updateMobAnimation(mob,dt,mob.velocity.x,mob.velocity.z);moveGroundMob(this,mob,dt);return true;
    }
    if(mob.type==='wither_skeleton'){updateWitherSkeleton(this,mob,dt,player);return true;}
    if(mob.type==='wolf'&&updateWolfWitherHunt(this,mob,dt))return true;
    if(isZombifiedPiglin(mob)) {
      if(!mob.jockeyMount){const speed=moveGroundMob(this,mob,dt);mob.walkCycle=(mob.walkCycle||0)+speed*dt*7;const swing=Math.sin(mob.walkCycle)*Math.min(.8,speed*.4);mob.leftLeg.rotation.x=swing;mob.rightLeg.rotation.x=-swing;}
      return false;
    }
    if(mob.type==='strider'){updateStrider(this,mob,dt,player);return true;}
    if (mob.type === 'drowned') {
      const bX = Math.floor(mob.mesh.position.x);
      const bY = Math.floor(mob.mesh.position.y + 0.5);
      const bZ = Math.floor(mob.mesh.position.z);
      const inWater = (this.world.getVoxel(bX, bY, bZ) === BLOCKS.WATER);

      mob.swimCycle = (mob.swimCycle || 0) + dt * (inWater ? 3.0 : 1.5);
      mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);

      if (player?.position && distToPlayer < 18) {
        const dir = player.position.clone().sub(mob.mesh.position);
        mob.yaw = Math.atan2(dir.x, dir.z);

        if (inWater) {
          const targetSpeed = 2.4;
          const normDir = dir.clone().normalize();
          mob.velocity.x = normDir.x * targetSpeed;
          mob.velocity.y = normDir.y * targetSpeed * 0.8;
          mob.velocity.z = normDir.z * targetSpeed;

          if (mob.leftLeg) mob.leftLeg.rotation.x = Math.sin(mob.swimCycle * 4.0) * 0.4;
          if (mob.rightLeg) mob.rightLeg.rotation.x = -Math.sin(mob.swimCycle * 4.0) * 0.4;
          if (mob.rightArm) mob.rightArm.rotation.x = -Math.PI / 3 + Math.sin(mob.swimCycle * 2.0) * 0.15;
          if (mob.leftArm) mob.leftArm.rotation.x = Math.sin(mob.swimCycle * 4.0) * 0.3;

          mob.mesh.position.addScaledVector(mob.velocity, dt);
          mob.mesh.rotation.y = mob.yaw;
        } else {
          moveGroundMob(this, mob, dt, 1.8);
          if (mob.leftLeg) mob.leftLeg.rotation.x = Math.sin((mob.timer || 0) * 5.0) * 0.6;
          if (mob.rightLeg) mob.rightLeg.rotation.x = -Math.sin((mob.timer || 0) * 5.0) * 0.6;
        }

        if (distToPlayer < 2.0 && mob.attackCooldown <= 0) {
          mob.attackCooldown = 1.2;
          const dmg = 5;
          if (typeof player.takeDamage === 'function') {
            player.takeDamage(dmg, 'Drowned');
          } else if (player.health !== undefined) {
            player.health = Math.max(0, player.health - dmg);
          }
          this.sounds?.playZombie?.();
          this.spawnParticleBurst(player.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 0x0ea5e9, 8);
        }
      } else {
        if (inWater) {
          mob.mesh.position.y += Math.sin(mob.swimCycle) * 0.01;
        } else {
          wanderMob(this, mob, dt, 1.0);
        }
      }
    } else if (mob.type === 'villager') {
      // Periodically check workstation claims and restocking
      mob.workstationCheckTimer = (mob.workstationCheckTimer || 0) - dt;
      if (mob.workstationCheckTimer <= 0) {
        mob.workstationCheckTimer = 2.0;
        updateVillagerWorkstation(mob, this.world, this.mobs);
      }

      // Flee from nearby zombies or zombie villagers
      let threat = null;
      let threatDist = 12;
      for (const other of this.mobs) {
        if (other.health > 0 && (other.type === 'zombie' || other.type === 'zombie_villager')) {
          const d = mob.mesh.position.distanceTo(other.mesh.position);
          if (d < threatDist) {
            threatDist = d;
            threat = other;
          }
        }
      }
      if (threat) {
        const fleeYaw = Math.atan2(mob.mesh.position.x - threat.mesh.position.x, mob.mesh.position.z - threat.mesh.position.z);
        mob.yaw = fleeYaw;
        mob.velocity.x = Math.sin(fleeYaw) * 3.2;
        mob.velocity.z = Math.cos(fleeYaw) * 3.2;
      } else if (distToPlayer < 2.5) {
        mob.yaw = Math.atan2(player.position.x - mob.mesh.position.x, player.position.z - mob.mesh.position.z);
        mob.velocity.x *= 0.5;
        mob.velocity.z *= 0.5;
      } else {
        wanderMob(this, mob, dt, 1.2);
      }
    } else if (mob.type === 'zombie_villager') {
      // Check curing progression
      updateZombieVillagerCuring(mob, dt, this);
      if (mob.isCuring) {
        mob.speed = 1.7;
      }
      if (distToPlayer < 16) {
        const targetYaw = Math.atan2(player.position.x - mob.mesh.position.x, player.position.z - mob.mesh.position.z);
        mob.yaw = targetYaw;
        mob.velocity.x = Math.sin(targetYaw) * (mob.speed || 1.4);
        mob.velocity.z = Math.cos(targetYaw) * (mob.speed || 1.4);
        if (distToPlayer < 1.4 && (!mob.hitCooldown || mob.hitCooldown <= 0)) {
          player.takeDamage?.(3);
          mob.hitCooldown = 1.0;
          this.sounds?.playZombie?.();
        }
      } else {
        wanderMob(this, mob, dt, 1.0);
      }
    } else if (mob.type === 'iron_golem') {
      // Find nearest hostile target (Pillager or Zombie)
      let nearestHostile = null;
      let minDist = 16;
      for (const other of this.mobs) {
        if (other.health > 0 && (other.type === 'pillager' || other.type === 'zombie' || other.type === 'wither_skeleton')) {
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
          player.takeDamage(3, mob.mesh.position, mob.type);
          mob.hitCooldown = 1.0;
        }
      } else {
        // Wander
        wanderMob(this, mob, dt, 1.0);
      }
    } else if (isEquine(mob) || mob.type === 'pig' || mob.type === 'cow' || mob.type === 'sheep' || mob.type === 'chicken' || mob.type === 'cat' || mob.type === 'ocelot' || mob.type === 'wolf') {
      let isFollowing = false;

      // A ridden pig is steered by AnimalBehaviors. Do not let its ambient
      // wander/follow AI overwrite the rider's velocity later in this loop.
      if (mob.rider || this.animalBehaviors?.mount?.mob === mob) {
        isFollowing = true;
        mob.wanderGoal = null;
        mob.wanderTimer = 0;
      }

      // If mob is sitting (tamed cat/wolf), freeze movement
      if (mob.isSitting || (isEquine(mob) && mob.grazeTime>0)) {
        isFollowing = true;
        mob.wanderGoal = null;
        mob.velocity.x = 0;
        mob.velocity.z = 0;
      }

      // If mob is in Love mode, preserve matchmaking velocity and prevent wander from hijacking it
      if (mob.inLove > 0) {
        isFollowing = true;
        mob.wanderGoal = null;
      }

      // Chicken / Animal following player holding seeds or breeding food (main hand or offhand)
      if (!mob.rider && player && player.inventory) {
        const heldItem = player.inventory.getActiveItem() || player.inventory.getOffhandItem?.();
        const cleanId = heldItem ? (typeof heldItem.id === 'string' ? heldItem.id : heldItem?.id?.id || '').toLowerCase().trim() : '';
        const isTempting = heldItem && (!mob.inLove || mob.inLove <= 0) && (
          this.animalBehaviors?.isBreedingFood(mob.type, cleanId) ||
          (isPackEquine(mob) && ['golden_carrot','golden_apple','enchanted_golden_apple'].includes(cleanId)) ||
          (mob.type === 'chicken' && (cleanId.includes('seed') || cleanId.includes('pod'))) ||
          (mob.type === 'cow' && cleanId.includes('wheat') && !cleanId.includes('seed'))
        );
        if (isTempting) {
          const dx = player.position.x - mob.mesh.position.x;
          const dy = Math.abs(player.position.y - mob.mesh.position.y);
          const dz = player.position.z - mob.mesh.position.z;
          const horizDist = Math.hypot(dx, dz);
          if (horizDist < 12.0 && dy < 6.0 && horizDist > 1.8) {
            isFollowing = true;
            mob.wanderGoal = null;
            mob.wanderTimer = 0;
            mob.avoidTime = 0;
            const followSpeed = mob.type === 'chicken' ? 2.2 : 2.0;
            mob.velocity.x = (dx / horizDist) * followSpeed;
            mob.velocity.z = (dz / horizDist) * followSpeed;
            mob.yaw = Math.atan2(dx, dz);
          } else if (horizDist <= 1.8 && dy < 6.0) {
            isFollowing = true;
            mob.wanderGoal = null;
            mob.velocity.x *= 0.2;
            mob.velocity.z *= 0.2;
            mob.yaw = Math.atan2(dx, dz);
          }

          // Head tracking: look attentively at player holding food
          if (mob.head && horizDist < 12.0 && dy < 6.0) {
            const lookYaw = Math.atan2(dx, dz) - mob.yaw;
            const normLookYaw = Math.atan2(Math.sin(lookYaw), Math.cos(lookYaw));
            mob.head.rotation.y = THREE.MathUtils.clamp(normLookYaw, -0.85, 0.85);
          }
        } else if (mob.head && !mob.isBaby) {
          mob.head.rotation.y = THREE.MathUtils.lerp(mob.head.rotation.y, 0, dt * 5.0);
        }
      }

      // Baby animal following parent or adult of same type
      if (!isFollowing && mob.isBaby) {
        let followTarget = mob.parent && mob.parent.health > 0 ? mob.parent : null;
        if (!followTarget) {
          let nearestDist = 14;
          for (const other of this.mobs) {
            if (other !== mob && other.type === mob.type && !other.isBaby && other.health > 0) {
              const dist = mob.mesh.position.distanceTo(other.mesh.position);
              if (dist < nearestDist) {
                nearestDist = dist;
                followTarget = other;
              }
            }
          }
        }
        if (followTarget) {
          const dist = mob.mesh.position.distanceTo(followTarget.mesh.position);
          if (dist > 1.6) {
            const dir = followTarget.mesh.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            if (dir.lengthSq() > 0.001) dir.normalize();
            mob.yaw = Math.atan2(dir.x, dir.z);
            mob.velocity.x = dir.x * 1.8;
            mob.velocity.z = dir.z * 1.8;
            isFollowing = true;
          } else {
            mob.velocity.x *= 0.5;
            mob.velocity.z *= 0.5;
            isFollowing = true;
          }
        }
      }

      if (!isFollowing) {
        const wanderSpeed = mob.type === 'chicken' ? (mob.isBaby ? 1.3 : 1.0) : (mob.isBaby ? 1.3 : 1.15);
        wanderMob(this, mob, dt, isEquine(mob) ? (mob.movementSpeed ?? .175)*8 : wanderSpeed);
      }

      if (mob.fleeTime > 0) {
        mob.fleeTime -= dt;
        const escape = mob.mesh.position.clone().sub(mob.fleeFrom); escape.y = 0; escape.normalize();
        mob.yaw = Math.atan2(escape.x, escape.z);
        mob.velocity.x = escape.x * 2.8; mob.velocity.z = escape.z * 2.8;
      }

      // Chicken specific animation: Slow glide in air, wing flapping, walking animation, ambient clucking
      if (mob.type === 'chicken') {
        mob.flapTimer = (mob.flapTimer || 0) + dt;
        const speedXZ = Math.hypot(mob.velocity.x, mob.velocity.z);

        // Cluck ambient sound occasionally
        mob.cluckTimer = (mob.cluckTimer || (15 + Math.random() * 30)) - dt;
        if (mob.cluckTimer <= 0) {
          mob.cluckTimer = 20 + Math.random() * 40;
          if (distToPlayer < 16 && this.sounds?.playChicken) {
            this.sounds.playChicken();
          }
        }

        if (!mob.onGround) {
          // Gliding down gently in the air: wings flap rapidly!
          mob.velocity.y = Math.max(-1.5, mob.velocity.y);
          const flap = Math.sin(mob.flapTimer * 28.0) * 0.75;
          if (mob.wingL) mob.wingL.rotation.z = flap;
          if (mob.wingR) mob.wingR.rotation.z = -flap;
          if (mob.leftLeg) mob.leftLeg.rotation.x = 0.2;
          if (mob.rightLeg) mob.rightLeg.rotation.x = 0.2;
        } else {
          // On ground: wings tucked, legs swing when walking
          if (mob.wingL) mob.wingL.rotation.z = THREE.MathUtils.lerp(mob.wingL.rotation.z, 0, dt * 10);
          if (mob.wingR) mob.wingR.rotation.z = THREE.MathUtils.lerp(mob.wingR.rotation.z, 0, dt * 10);

          if (speedXZ > 0.1) {
            mob.walkCycle = (mob.walkCycle || 0) + dt * 12.0;
            if (mob.leftLeg) mob.leftLeg.rotation.x = Math.sin(mob.walkCycle) * 0.5;
            if (mob.rightLeg) mob.rightLeg.rotation.x = -Math.sin(mob.walkCycle) * 0.5;
            if (mob.head) mob.head.position.z = 0.22 + Math.sin(mob.walkCycle) * 0.03;
          } else {
            if (mob.leftLeg) mob.leftLeg.rotation.x = 0;
            if (mob.rightLeg) mob.rightLeg.rotation.x = 0;
            if (mob.head) mob.head.position.z = 0.22;
          }
        }
      }

      // Quadruped specific animations (cow, pig, sheep): leg swinging & cow ambient moo
      if (mob.type === 'cow' || mob.type === 'pig' || mob.type === 'sheep') {
        const speedXZ = Math.hypot(mob.velocity.x, mob.velocity.z);

        if (mob.type === 'cow') {
          mob.mooTimer = (mob.mooTimer || (15 + Math.random() * 30)) - dt;
          if (mob.mooTimer <= 0) {
            mob.mooTimer = 20 + Math.random() * 40;
            if (distToPlayer < 16 && this.sounds?.playCow) {
              this.sounds.playCow();
            }
          }
        }

        if (mob.legs && mob.legs.length === 4) {
          const [fl, fr, bl, br] = mob.legs;
          if (speedXZ > 0.1) {
            mob.walkCycle = (mob.walkCycle || 0) + dt * 10.0;
            const swing = Math.sin(mob.walkCycle) * 0.4;
            if (fl) fl.rotation.x = swing;
            if (fr) fr.rotation.x = -swing;
            if (bl) bl.rotation.x = -swing;
            if (br) br.rotation.x = swing;
          } else {
            if (fl) fl.rotation.x = 0;
            if (fr) fr.rotation.x = 0;
            if (bl) bl.rotation.x = 0;
            if (br) br.rotation.x = 0;
          }
        }
      }

      // Cat & Ocelot animations: ambient meow, sitting posture vs walk & tail swish
      if (mob.type === 'cat' || mob.type === 'ocelot') {
        const speedXZ = Math.hypot(mob.velocity.x, mob.velocity.z);

        // Ambient meow
        mob.meowTimer = (mob.meowTimer || (20 + Math.random() * 35)) - dt;
        if (mob.meowTimer <= 0) {
          mob.meowTimer = 25 + Math.random() * 45;
          if (distToPlayer < 16 && this.sounds?.playCat) {
            this.sounds.playCat();
          }
        }

        if (mob.isSitting) {
          // Sitting posture
          if (mob.body) {
            mob.body.position.set(0, 0.30, -0.05);
            mob.body.rotation.x = -0.55;
          }
          if (mob.head) {
            mob.head.position.set(0, 0.48, 0.22);
          }
          if (mob.legs && mob.legs.length === 4) {
            const [fl, fr, bl, br] = mob.legs;
            if (fl) { fl.position.set(-0.10, 0.16, 0.18); fl.rotation.x = 0; }
            if (fr) { fr.position.set(0.10, 0.16, 0.18); fr.rotation.x = 0; }
            if (bl) { bl.position.set(-0.10, 0.08, -0.06); bl.rotation.x = -Math.PI / 2; }
            if (br) { br.position.set(0.10, 0.08, -0.06); br.rotation.x = -Math.PI / 2; }
          }
          if (mob.tailUpper) {
            mob.tailUpper.position.set(0, 0.20, -0.22);
            mob.tailUpper.rotation.x = 1.35;
          }
          if (mob.tailLower) {
            mob.tailLower.rotation.x = 0.5;
          }
        } else {
          // Standing posture
          if (mob.body) {
            mob.body.position.set(0, 0.40, -0.05);
            mob.body.rotation.x = 0;
          }
          if (mob.head) {
            mob.head.position.set(0, 0.52, 0.32);
          }
          if (mob.legs && mob.legs.length === 4) {
            const [fl, fr, bl, br] = mob.legs;
            if (fl) fl.position.set(-0.10, 0.16, 0.18);
            if (fr) fr.position.set(0.10, 0.16, 0.18);
            if (bl) bl.position.set(-0.10, 0.16, -0.22);
            if (br) br.position.set(0.10, 0.16, -0.22);

            if (speedXZ > 0.1) {
              mob.walkCycle = (mob.walkCycle || 0) + dt * 11.0;
              const swing = Math.sin(mob.walkCycle) * 0.45;
              if (fl) fl.rotation.x = swing;
              if (fr) fr.rotation.x = -swing;
              if (bl) bl.rotation.x = -swing;
              if (br) br.rotation.x = swing;
            } else {
              if (fl) fl.rotation.x = 0;
              if (fr) fr.rotation.x = 0;
              if (bl) bl.rotation.x = 0;
              if (br) br.rotation.x = 0;
            }
          }
          // Tail gentle sway
          mob.tailCycle = (mob.tailCycle || 0) + dt * 2.8;
          if (mob.tailUpper) {
            mob.tailUpper.position.set(0, 0.44, -0.32);
            mob.tailUpper.rotation.x = -0.55 + Math.sin(mob.tailCycle) * 0.1;
            mob.tailUpper.rotation.y = Math.cos(mob.tailCycle) * 0.15;
          }
          if (mob.tailLower) {
            mob.tailLower.rotation.x = 0.35;
            mob.tailLower.rotation.y = Math.cos(mob.tailCycle) * 0.2;
          }
        }
      }

      // Wolf animations: leg swing & sitting & tail wag
      if (mob.type === 'wolf') {
        const speedXZ = Math.hypot(mob.velocity.x, mob.velocity.z);
        if (mob.legs && mob.legs.length === 4) {
          const [fl, fr, bl, br] = mob.legs;
          if (mob.isSitting) {
            if (fl) fl.rotation.x = 0;
            if (fr) fr.rotation.x = 0;
            if (bl) bl.rotation.x = -Math.PI / 2;
            if (br) br.rotation.x = -Math.PI / 2;
            if (mob.tailMesh) mob.tailMesh.rotation.x = 0.2;
          } else {
            if (speedXZ > 0.1) {
              mob.walkCycle = (mob.walkCycle || 0) + dt * 10.0;
              const swing = Math.sin(mob.walkCycle) * 0.4;
              if (fl) fl.rotation.x = swing;
              if (fr) fr.rotation.x = -swing;
              if (bl) bl.rotation.x = -swing;
              if (br) br.rotation.x = swing;
            } else {
              if (fl) fl.rotation.x = 0;
              if (fr) fr.rotation.x = 0;
              if (bl) bl.rotation.x = 0;
              if (br) br.rotation.x = 0;
            }
            if (mob.tailMesh) {
              mob.tailCycle = (mob.tailCycle || 0) + dt * 4.0;
              mob.tailMesh.rotation.x = -Math.PI / 4;
              mob.tailMesh.rotation.y = (mob.isTamed ? Math.sin(mob.tailCycle) * 0.25 : 0);
            }
          }
        }
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
          player.takeDamage(10, mob.mesh.position, mob.type);
          this.sounds.playExplosion();
          mob.health = 0; // explode
          mob.noLoot = true;
      if (['hoglin', 'piglin', 'zoglin'].includes(mob.type)) this.entities?.spawnXpOrbs?.(pos, 5);
          return true;
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
          const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
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
              const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
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
            const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
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

            const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
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
        player.takeDamage(5, mob.mesh.position, mob.type);
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
        return true;
      }
      this.updateCustomMobAI(mob, dt, player);
    }

    if (mob.isFlying) {
      if (mob.type === 'ghast') {
        const baseHeight = (player ? player.position.y : 20) + 8.5;
        const bob = Math.sin((mob.ghastAnimTimer || 0) * 0.8) * 1.0;
        const targetY = baseHeight + bob;
        mob.velocity.y += (targetY - mob.mesh.position.y) * 1.8 * dt;
        mob.velocity.y = Math.max(-3, Math.min(3, mob.velocity.y));
      }
      moveFlyingMob(this, mob, dt);
    } else {
      if(isEquine(mob))updateHorseLead(this,mob);
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
      } else if (mob.isSitting) {
        // Sitting mob maintains tucked posture
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
      } else if (['hoglin', 'zoglin'].includes(mob.type) && mob.legFL && mob.legFR && mob.legBL && mob.legBR) {
        mob.legFL.rotation.x = legSwing;
        mob.legFR.rotation.x = -legSwing;
        mob.legBL.rotation.x = -legSwing;
        mob.legBR.rotation.x = legSwing;
      }
    }
    return false;
  }

  /**
   * Update an aquatic creature: fluid drag, swim-target seeking, steering, tentacle
   * and spike animation, and the checks that keep a fish inside its water.
   *
   * Lifted verbatim from the update loop. It reads and writes only this mob, so it
   * needs nothing from the loop but the mob, the timestep and the player.
   *
   * @returns {boolean} true when the caller should stop processing this mob
   */
  updateAquaticMob(mob, dt, player) {
      if(isSquid(mob)){updateSquid(this,mob,dt,player);return true;}
      if(updateSquidPredator(this,mob,dt))return true;
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
      let targetY;
      if (mob.type === 'ghast') {
        const baseHeight = player ? player.position.y + 8.5 : 32.0;
        const bob = Math.sin((mob.ghastAnimTimer || 0) * 0.8) * 1.0;
        targetY = baseHeight + bob;
      } else {
        targetY = (player ? player.position.y : 5) + 1.8;
      }
      mob.velocity.y += (targetY - mob.mesh.position.y) * 1.8 * dt;
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
          if (mob.skills?.includes('heal') && mob.health < mob.maxHealth * 0.7) {
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
        if (mob.skills?.includes('heal') && mob.health < mob.maxHealth * 0.7) {
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
          player.takeDamage(mob.attackDamage, mob.mesh.position, mob.type);
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
        player.takeDamage(mob.attackDamage || 15, mob.mesh.position, mob.type);
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

