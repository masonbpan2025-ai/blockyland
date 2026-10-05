import { isSquid, canInteractSquid, interactSquid, updateSquidAge } from './squidBehavior.js';
import { canInteractStrider, interactStrider, boostStrider, steerStrider, safeStriderDismount } from './striderBehavior.js';
import { isPackEquine, syncPackEquineAppearance } from './packEquineModel.js';
import { isEquine, canInteractHorse, interactHorse, inheritHorse, horseJumpHeight, updateHorse } from './horseBehavior.js';
import { SHEEP_COLORS, SHEEP_COLOR_HEX, sheepApplyWool, inheritSheepColor, rollSheepWoolCount } from './sheepBehavior.js';
import { isMooshroom, isBrownMooshroom, convertMooshroomToCow, MOOSHROOM_SHEAR_DROPS, MOOSHROOM_MUSHROOM_BLOCK, applyMooshroomVariant, isSmallFlower, STEW_EFFECTS } from './mooshroomBehavior.js';
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';

// Re-exported so existing importers (mobShowcase, tests) keep working now that the
// canonical sheep tables live in sheepBehavior.js.
export { SHEEP_COLORS, SHEEP_COLOR_HEX };

export const BREEDING_FOODS = {
  cow: ['wheat'],
  // Wiki: mooshrooms breed with wheat, and the pair check below requires matching types,
  // so a mooshroom and a cow cannot breed with each other.
  mooshroom: ['wheat'],
  strider: ['warped_fungus', BLOCKS.WARPED_FUNGUS],
  hoglin: [BLOCKS.CRIMSON_FUNGUS, 'crimson_fungus'],
  sheep: ['wheat'],
  pig: ['carrot', 'potato', 'beetroot'],
  chicken: [
    'wheat_seeds', 'wheat_seed', 'seeds', 'seed',
    'pumpkin_seeds', 'pumpkin_seed',
    'melon_seeds', 'melon_seed',
    'beetroot_seeds', 'beetroot_seed',
    'torchflower_seeds', 'torchflower_seed',
    'pitcher_pod'
  ],
  wolf: ['beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'chicken', 'cooked_chicken', 'mutton', 'cooked_mutton', 'rabbit', 'cooked_rabbit'],
  cat: ['salmon', 'cod', 'cooked_salmon', 'cooked_cod', 'raw_fish'],
  horse: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple'],
  donkey: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple']
};

export class AnimalBehaviors {
  constructor(mobManager, world, sounds, entities) {
    this.mobManager = mobManager;
    this.world = world;
    this.sounds = sounds;
    this.entities = entities;
    this.mount = null; // currently ridden mob: { mob, type, boostTimer }
    this.jumpCharge = 0; // 0 to 1 for horse jump
    this.isChargingJump = false;
  }

  /**
   * Check if player can interact with this mob given their active item
   */
  canInteract(mob, player, inventory = player?.inventory) {
    if (!mob || !player || !inventory) return false;
    const activeItem = inventory.getActiveItem();
    const itemId = activeItem?.id;

    if(mob.type==='wither_skeleton')return mob.health>0&&itemId==='name_tag'&&!!activeItem.customName;

    if(isSquid(mob))return canInteractSquid(mob,itemId);
    if(mob.type==='strider')return canInteractStrider(mob,itemId);
    if (isEquine(mob)) return canInteractHorse(mob,itemId);
    if (!itemId) {
      if ((mob.type === 'wolf' || mob.type === 'cat' || mob.type === 'ocelot') && mob.isTamed && mob.owner === player) return true;
      if ((mob.type === 'horse' || mob.type === 'donkey') && (mob.isTamed || !mob.isBaby)) return true;
      if ((mob.type === 'pig' || mob.type === 'strider') && (mob.isSaddled || mob.hasSaddle)) return true;
      return false;
    }

    // Milking cow
    if ((mob.type === 'cow' || mob.type === 'mooshroom') && itemId === 'bucket' && !mob.isBaby) return true;

    // Mooshroom stew and shearing. Wiki: a bowl yields mushroom stew, or suspicious stew
    // from a brown mooshroom that has been fed a small flower; shears convert it to a cow.
    // A baby cannot be milked, and shearing a baby would destroy the mob for no mushrooms.
    if (isMooshroom(mob) && !mob.isBaby) {
      if (itemId === 'bowl') return !isBrownMooshroom(mob) || !!mob.stewEffect;
      if (itemId === 'shears') return true;
    }

    // Shearing sheep
    if (mob.type === 'sheep' && itemId === 'shears' && !mob.isSheared) return true;

    // Dyeing sheep. Wiki: a sheared sheep cannot be dyed until its wool regrows by
    // grazing, so holding dye must not advertise a usable interaction.
    if (mob.type === 'sheep' && itemId.endsWith('_dye')) return !mob.isSheared;

    // Wolf taming or healing or sitting
    if (mob.type === 'wolf') {
      if (!mob.isTamed && itemId === 'bone') return true;
      if (mob.isTamed && mob.owner === player) {
        if (itemId.endsWith('_dye')) return true;
        if (this.isBreedingFood('wolf', itemId) && mob.health < mob.maxHealth) return true;
        return true;
      }
    }

    // Cat taming or sitting
    if (mob.type === 'cat' || mob.type === 'ocelot') {
      if (!mob.isTamed && (itemId === 'salmon' || itemId === 'cod' || itemId === 'raw_fish')) return true;
      if (mob.isTamed && mob.owner === player) return true;
    }

    // Horse / donkey
    if (mob.type === 'horse' || mob.type === 'donkey') {
      if (mob.type === 'donkey' && mob.isTamed && itemId === 'chest' && !mob.hasChest) return true;
      if (mob.type === 'horse' && mob.isTamed && itemId.endsWith('_horse_armor') && !mob.horseArmor) return true;
      if (mob.isTamed && itemId === 'saddle' && !mob.isSaddled) return true;
      return true;
    }

    // Pig / strider
    if (mob.type === 'pig' || mob.type === 'strider') {
      if (itemId === 'saddle' && !mob.isSaddled) return true;
      if (mob.isSaddled || mob.hasSaddle) return true;
    }

    // Breeding food
    if (this.isBreedingFood(mob.type, itemId)) {
      if (mob.isBaby) return true; // growth acceleration
      if ((!mob.breedingCooldown || mob.breedingCooldown <= 0) && (!mob.inLove || mob.inLove <= 0)) return true;
    }

    return false;
  }

  /**
   * Main entry point when player right-clicks an animal or interactive mob.
   * Returns true if interaction was handled.
   */
  interact(mob, player, inventory = player?.inventory) {
    if (!mob || !player || !inventory) return false;
    const activeItem = inventory.getActiveItem();
    const itemId = activeItem?.id;

    if(mob.type==='wither_skeleton'){
      if(mob.health<=0||itemId!=='name_tag'||!activeItem.customName)return false;
      mob.name=activeItem.customName;mob.persistent=true;
      if(player.gamemode!=='creative')inventory.consumeActiveItem(1);
      return true;
    }

    if(isSquid(mob))return interactSquid(this,mob,player,inventory,itemId);
    if(mob.type==='strider')return interactStrider(this,mob,player,inventory,itemId);
    if (isEquine(mob)) return interactHorse(this,mob,player,inventory,itemId);

    // 1. Milking a Cow
    if ((mob.type === 'cow' || mob.type === 'mooshroom') && itemId === 'bucket') {
      if (mob.isBaby) return false;
      if (player.gamemode !== 'creative') {
        inventory.consumeActiveItem(1);
        inventory.addItem('milk_bucket', false, 1);
      }
      if (this.sounds?.playMilk) this.sounds.playMilk();
      this.mobManager.spawnParticleBurst?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffffff, 8);
      return true;
    }

    // 2. Mooshroom: stew from a bowl, and shearing into a plain cow.
    if (isMooshroom(mob) && !mob.isBaby) {
      // Wiki: a bowl yields mushroom stew, or suspicious stew when a brown mooshroom has
      // been fed a small flower. A brown mooshroom without a flower gives mushroom stew.
      if (itemId === 'bowl') {
        const suspicious = isBrownMooshroom(mob) && !!mob.stewEffect;
        if (player.gamemode !== 'creative') {
          inventory.consumeActiveItem(1);
          inventory.addItem(suspicious ? 'suspicious_stew' : 'mushroom_stew', false, 1);
        }
        // The flower effect is spent once it has been milked out.
        if (suspicious) mob.stewEffect = null;
        if (this.sounds?.playMilk) this.sounds.playMilk();
        this.mobManager.spawnParticleBurst?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffffff, 8);
        return true;
      }

      // Wiki: feeding a small flower to a brown mooshroom sets the effect of the next
      // suspicious stew it gives. Red mooshrooms do not produce suspicious stew.
      if (isBrownMooshroom(mob) && isSmallFlower(itemId)) {
        mob.stewEffect = STEW_EFFECTS[itemId];
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }

      // Wiki: shearing drops 5 corresponding mushrooms and turns the mooshroom into a
      // temperate cow. The mushrooms do not grow back, so this is a one-way conversion.
      if (itemId === 'shears') {
        const dropPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        const mushroom = BLOCKS[MOOSHROOM_MUSHROOM_BLOCK[mob.mushroomType] || MOOSHROOM_MUSHROOM_BLOCK.red];
        for (let i = 0; i < MOOSHROOM_SHEAR_DROPS; i++) {
          this.entities?.spawnDroppedItem(dropPos, mushroom, true);
        }
        if (player.gamemode !== 'creative' && activeItem && typeof activeItem.durability === 'number') {
          activeItem.durability = Math.max(0, activeItem.durability - 1);
          if (activeItem.durability === 0) inventory.consumeActiveItem(1);
        }
        if (this.sounds?.playShears) this.sounds.playShears();
        this.mobManager.spawnParticleBurst?.(dropPos, 0xf43f5e, 8);
        convertMooshroomToCow(this.mobManager, mob);
        return true;
      }
    }

    // 2. Shearing a Sheep
    if (mob.type === 'sheep' && itemId === 'shears') {      if (!mob.isSheared) {
        mob.isSheared = true;
        // Hide the wool layer through the shared helper so the mesh and the flag stay
        // in step. A sheared sheep keeps its colour and regrows it by grazing.
        sheepApplyWool(mob);
        if (this.sounds?.playShears) this.sounds.playShears();

        const colorName = mob.woolColor || 'white';
        const woolBlockId = BLOCKS[`${colorName.toUpperCase()}_WOOL`] || BLOCKS.WHITE_WOOL;
        const dropPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0));
        // Wiki: 1-3 wool, not affected by Fortune or Looting.
        const count = rollSheepWoolCount();
        for (let i = 0; i < count; i++) {
          this.entities?.spawnDroppedItem(dropPos, woolBlockId, true);
        }
        // Shears lose one durability per sheep, like any other shearable block.
        if (player.gamemode !== 'creative' && activeItem && typeof activeItem.durability === 'number') {
          activeItem.durability = Math.max(0, activeItem.durability - 1);
          if (activeItem.durability === 0) inventory.consumeActiveItem(1);
        }
        return true;
      }
    }

    // 3. Dyeing a Sheep. Wiki: a sheared sheep cannot be dyed until the wool grows
    // back by grazing, so this comes after the shearing branch that sets isSheared.
    if (mob.type === 'sheep' && itemId && itemId.endsWith('_dye')) {
      if (mob.isSheared) return false;
      const dyeColor = itemId.replace('_dye', '');
      if (SHEEP_COLOR_HEX[dyeColor]) {
        mob.woolColor = dyeColor;
        sheepApplyWool(mob);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }
    }

    // 4. Wolf: Taming with bones, collar dyeing, sitting toggle
    if (mob.type === 'wolf') {
      if (!mob.isTamed && itemId === 'bone') {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (Math.random() < 0.35) {
          mob.isTamed = true;
          mob.owner = player;
          mob.collarColor = 'red';
          if (mob.collarMesh) {
            mob.collarMesh.visible = true;
            mob.collarMesh.material.color.setHex(SHEEP_COLOR_HEX.red);
          }
          this.spawnHeartParticles(mob.mesh.position);
          if (this.sounds?.playWolf) this.sounds.playWolf();
        } else {
          this.spawnSmokeParticles(mob.mesh.position);
        }
        return true;
      }

      if (mob.isTamed && mob.owner === player) {
        // Dye collar
        if (itemId && itemId.endsWith('_dye')) {
          const dyeColor = itemId.replace('_dye', '');
          if (SHEEP_COLOR_HEX[dyeColor]) {
            mob.collarColor = dyeColor;
            if (mob.collarMesh?.material) {
              mob.collarMesh.material.color.setHex(SHEEP_COLOR_HEX[dyeColor]);
            }
            if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
            return true;
          }
        }
        // Heal with meat
        if (this.isBreedingFood('wolf', itemId) && mob.health < mob.maxHealth) {
          mob.health = Math.min(mob.maxHealth, mob.health + 4);
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          this.spawnHeartParticles(mob.mesh.position);
          return true;
        }
        // Toggle sitting
        mob.isSitting = !mob.isSitting;
        if (this.sounds?.playClick) this.sounds.playClick();
        return true;
      }
    }

    // 5. Cat / Ocelot: Taming with raw fish & sitting toggle
    if (mob.type === 'cat' || mob.type === 'ocelot') {
      if (!mob.isTamed && (itemId === 'salmon' || itemId === 'cod' || itemId === 'raw_fish')) {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (Math.random() < 0.4) {
          mob.isTamed = true;
          mob.type = 'cat';
          mob.owner = player;
          mob.collarColor = 'red';
          if (mob.collarMesh) {
            mob.collarMesh.visible = true;
            mob.collarMesh.material.color.setHex(SHEEP_COLOR_HEX.red);
          }
          this.spawnHeartParticles(mob.mesh.position);
          if (this.sounds?.playCat) this.sounds.playCat();
        } else {
          this.spawnSmokeParticles(mob.mesh.position);
        }
        return true;
      }

      if (mob.isTamed && mob.owner === player) {
        mob.isSitting = !mob.isSitting;
        if (this.sounds?.playCat) this.sounds.playCat();
        return true;
      }
    }

    // 7. Pig & Strider: Saddling & Mounting
    if (mob.type === 'pig' || mob.type === 'strider') {
      if (itemId === 'saddle' && !mob.isSaddled) {
        mob.isSaddled = true;
        mob.hasSaddle = true;
        if (mob.saddleMesh) mob.saddleMesh.visible = true;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playArmorEquip) this.sounds.playArmorEquip();
        return true;
      }
      if (mob.isSaddled || mob.hasSaddle) {
        this.mountMob(mob, player);
        return true;
      }
    }

    // 8. Animal Breeding (Love mode with food) & Baby growth acceleration
    if (this.isBreedingFood(mob.type, itemId)) {
      if (mob.isBaby) {
        // Accelerate baby growth by 10%
        mob.babyGrowthTimer = mob.type === 'hoglin' ? (mob.babyGrowthTimer ?? 1200) * 0.9 : (mob.babyGrowthTimer ?? 120) - 12;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.mobManager?.spawnParticleBurst) {
          this.mobManager.spawnParticleBurst(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0x22c55e, 6);
        }
        if (this.sounds?.playEat) this.sounds.playEat();
        if (mob.babyGrowthTimer <= 0) {
          mob.isBaby = false;
          mob.mesh.scale.set(1, 1, 1);
          if (mob.head) mob.head.scale.set(1, 1, 1);
          if(isPackEquine(mob))syncPackEquineAppearance(mob);
          if (mob.horns) mob.horns.forEach(h => h.visible = true);
          if (mob.udder) mob.udder.visible = true;
          if (mob.wattle) mob.wattle.visible = true;
        }
        return true;
      } else if ((!mob.breedingCooldown || mob.breedingCooldown <= 0) && (!mob.inLove || mob.inLove <= 0)) {
        mob.inLove = 30.0; // 30 seconds love mode
        mob.inLoveTimer = 30.0;
        mob.matingTimer = 0;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        this.spawnHeartParticles(mob.mesh.position);
        if (this.sounds?.playEat) this.sounds.playEat();
        return true;
      }
    }

    return false;
  }

  isBreedingFood(type, itemId) {
    if (!type || !itemId) return false;
    if (type === 'hoglin' && (itemId === BLOCKS.CRIMSON_FUNGUS || itemId?.id === BLOCKS.CRIMSON_FUNGUS)) return true;
    const cleanId = String(typeof itemId === 'string' ? itemId : itemId?.id || '').toLowerCase().trim();
    const foods = BREEDING_FOODS[type];
    if (Array.isArray(foods) && foods.includes(cleanId)) return true;
    if (type === 'chicken' && (cleanId.includes('seed') || cleanId.includes('pod'))) return true;
    if (type === 'cow' && cleanId.includes('wheat') && !cleanId.includes('seed')) return true;
    return false;
  }

  mountMob(mob, player) {
    if(mob.rider&&mob.rider!==player)return false;
    if ((isEquine(mob)||mob.type==='strider') && mob.isBaby) return false;
    if(mob.type==='strider'&&(!mob.isSaddled||mob.rider))return false;
    if(this.mount)this.dismount(player);
    this.jumpCharge=0;this.isChargingJump=false;
    this.mount = {
      mob,
      type: mob.type,
      boostTimer: 0,
      tameAttempts: mob.tameAttempts || 0
    };
    player.ridingMob = mob;
    mob.rider = player;
  }

  dismount(player) {
    this.jumpCharge=0;this.isChargingJump=false;
    if(this.mount?.type==='strider'&&player)safeStriderDismount(this,this.mount.mob,player);
    if(this.mount?.mob)this.mount.mob.jumpCharge=0;
    if (this.mount) {
      if (this.mount.mob) this.mount.mob.rider = null;
      this.mount = null;
    }
    if (player) player.ridingMob = null;
  }

  /**
   * Called on player right click into air / active action.
   * Handles:
   * - Throwing egg -> hatches baby chick
   * - Boosting pig / strider with carrot / fungus on stick
   */
  handleActiveItemUse(player, inventory) {
    const activeItem = inventory.getActiveItem();
    if (!activeItem) return false;

    // 1. Throwing Egg
    if (activeItem.id === 'egg') {
      if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
      if (this.sounds?.playBowShoot) this.sounds.playBowShoot();

      const look = new THREE.Vector3();
      player.camera?.getWorldDirection(look);
      if (!look.lengthSq()) look.set(0, 0, -1);

      const spawnPos = player.position.clone().add(new THREE.Vector3(0, 1.4, 0));
      const eggProj = {
        position: spawnPos.clone(),
        velocity: look.clone().multiplyScalar(22),
        isEgg: true,
        age: 0
      };

      if (!this.mobManager.customProjectiles) this.mobManager.customProjectiles = [];
      const eggMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0xf5f5dc })
      );
      eggMesh.position.copy(spawnPos);
      this.mobManager.scene.add(eggMesh);
      eggProj.mesh = eggMesh;
      this.mobManager.customProjectiles.push(eggProj);
      return true;
    }

    if(this.mount?.type==='strider')return boostStrider(this,player,activeItem);
    // 2. Carrot on a Stick / Warped Fungus on a Stick speed boost
    if (this.mount) {
      if ((this.mount.type === 'pig' && activeItem.id === 'carrot_on_a_stick') ||
          (this.mount.type === 'strider' && activeItem.id === 'warped_fungus_on_a_stick')) {
        this.mount.boostTimer = 4.0; // 4 second speed boost
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }
    }

    return false;
  }

  /**
   * Per-frame update for animal behaviors:
   * - Sheep grazing & wool regrowth
   * - Chicken egg laying
   * - Breeding matchmaking & baby spawning
   * - Mount physics & steering
   * - Untamed horse bucking & taming
   * - Wolf defending & following
   * - Cat creeper / phantom repelling
   */
  update(dt, player, controls = {}) {
    this._currentUpdateTick = (this._currentUpdateTick || 0) + 1;
    const mobs = this.mobManager.mobs;

    // Update thrown egg projectiles
    if (this.mobManager.customProjectiles) {
      for (let i = this.mobManager.customProjectiles.length - 1; i >= 0; i--) {
        const p = this.mobManager.customProjectiles[i];
        if (p.isEgg) {
          p.age = (p.age || 0) + dt;
          p.velocity.y -= 18.0 * dt;
          p.position.addScaledVector(p.velocity, dt);
          if (p.mesh) p.mesh.position.copy(p.position);

          const block = this.world?.getVoxel(p.position.x, p.position.y, p.position.z);
          if (p.position.y <= 0 || p.age > 4.0 || (block && block !== BLOCKS.AIR && block !== BLOCKS.WATER)) {
            if (this.sounds?.playPop) this.sounds.playPop();
            this.mobManager.spawnParticleBurst?.(p.position, 0xf5f5dc, 6);
            if (p.mesh) this.mobManager.scene.remove(p.mesh);
            this.mobManager.customProjectiles.splice(i, 1);

            // 12.5% chance (1 in 8) to hatch baby chick; 1/32 chance of that (1 in 256) to spawn 4 chicks
            if (Math.random() < 0.125) {
              const count = Math.random() < (1 / 32) ? 4 : 1;
              for (let c = 0; c < count; c++) {
                const ox = c > 0 ? (Math.random() - 0.5) * 0.4 : 0;
                const oz = c > 0 ? (Math.random() - 0.5) * 0.4 : 0;
                const baby = this.mobManager.spawnMob('chicken', p.position.x + ox, Math.max(1, p.position.y), p.position.z + oz);
                if (baby) {
                  baby.isBaby = true;
                  baby.babyGrowthTimer = 120;
                  baby.mesh?.scale?.setScalar?.(baby.type==='horse'?.7:.5);
                }
              }
            }
          }
        }
      }
    }

    // A. Mount Update
    if (this.mount && this.mount.mob) {
      const mob = this.mount.mob;
      if (mob.health <= 0 || !player) {
        this.dismount(player);
      } else {
        this.updateMountSteering(dt, player, controls);
      }
    }

    // B. Individual Animal Behaviors
    for (let i = 0; i < mobs.length; i++) {
      const mob = mobs[i];
      if (mob.health <= 0) continue;

      if(isSquid(mob)){updateSquidAge(mob,dt);continue;}
      if(isEquine(mob))updateHorse(mob,dt,this.mobManager.random || Math.random,this.sounds,player,this.mobManager);
      // 1. Breeding cooldown & Love mode
      if (mob.breedingCooldown > 0) {
        mob.breedingCooldown -= dt;
      }
      if (mob.inLove > 0) {
        mob.inLove -= dt;
        mob.heartTimer = (mob.heartTimer || 0) - dt;
        if (mob.heartTimer <= 0) {
          mob.heartTimer = 0.4 + Math.random() * 0.2;
          this.spawnHeartParticles(mob.mesh.position);
        }
        // Matchmake with nearest in-love mob of same type
        this.checkBreedingPair(mob, dt);
      }

      if (isEquine(mob)||mob.type==='strider') mob.ageLockCooldown = Math.max(0, (mob.ageLockCooldown || 0) - dt);
      // 2. Baby growth timer
      if (mob.isBaby && !mob.ageLocked && !['piglin', 'zombified_piglin', 'zoglin'].includes(mob.type)) {
        mob.babyGrowthTimer = (mob.babyGrowthTimer ?? ((mob.type === 'hoglin' || mob.type==='strider' || isEquine(mob)) ? 1200 : 120)) - dt;
        if (mob.babyGrowthTimer <= 0) {
          mob.isBaby = false;
          mob.mesh.scale.set(1, 1, 1);
          if (mob.head) mob.head.scale.set(1, 1, 1);
          if (mob.horns) mob.horns.forEach(h => h.visible = true);
          if (mob.udder) mob.udder.visible = true;
          if (mob.wattle) mob.wattle.visible = true;
          // Wiki: a baby mooshroom has no mushrooms; they appear once it grows up.
          applyMooshroomVariant(mob);
        }
      }

      // 3. Chicken Egg Laying Timer
      if (mob.type === 'chicken' && !mob.isBaby && !mob.isJockey) {
        mob.eggTimer = (mob.eggTimer || (180 + Math.random() * 180)) - dt;
        if (mob.eggTimer <= 0) {
          mob.eggTimer = 180 + Math.random() * 180;
          this.entities?.spawnDroppedItem(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 'egg', false);
          if (this.sounds?.playPop) this.sounds.playPop();
        }
      }

      // 4. Sheep Grazing to Regrow Wool
      if (mob.type === 'sheep') {
        mob.grazeTimer = (mob.grazeTimer !== undefined ? mob.grazeTimer : (mob.eatGrassTimer !== undefined ? mob.eatGrassTimer : (15 + Math.random() * 25))) - dt;
        if (mob.grazeTimer <= 0) {
          mob.grazeTimer = 20 + Math.random() * 30;
          const bx = Math.round(mob.mesh.position.x);
          const by = Math.round(mob.mesh.position.y) - 1;
          const bz = Math.round(mob.mesh.position.z);
          const blockBelow = this.world?.getVoxel(bx, by, bz);
          if (blockBelow === BLOCKS.GRASS || blockBelow === BLOCKS.GRASS_BLOCK) {
            this.world?.setVoxel(bx, by, bz, BLOCKS.DIRT);
            mob.isSheared = false;
            // Regrowing the wool restores the sheep's retained colour, so a dyed sheep
            // is still that colour after it is sheared and regrows.
            sheepApplyWool(mob);
            if (this.sounds?.playStep) this.sounds.playStep('grass');
          }
        }
      }

      // 5. Wolf AI: Sitting, Following owner, Defending
      if (mob.type === 'wolf' && mob.isTamed && mob.owner) {
        if (mob.isSitting) {
          mob.velocity?.set(0, mob.velocity.y, 0);
        } else {
          const distToOwner = mob.mesh.position.distanceTo(mob.owner.position);
          if (distToOwner > 20) {
            // Teleport to owner
            mob.mesh.position.copy(mob.owner.position).add(new THREE.Vector3(1, 0, 1));
          } else if (mob.target && mob.target.health > 0) {
            // Attack target
            const dir = mob.target.mesh.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            if (dir.length() > 1.2) {
              dir.normalize();
              mob.velocity.x = dir.x * 3.5;
              mob.velocity.z = dir.z * 3.5;
              mob.yaw = Math.atan2(dir.x, dir.z);
            } else {
              // Melee attack
              mob.attackCooldown = (mob.attackCooldown || 0) - dt;
              if (mob.attackCooldown <= 0) {
                this.mobManager.damageMob(mob.target, 4, mob.mesh.position);
                mob.attackCooldown = 1.0;
                if (this.sounds?.playWolf) this.sounds.playWolf();
              }
            }
          } else if (distToOwner > 3.5) {
            // Follow owner
            const dir = mob.owner.position.clone().sub(mob.mesh.position);
            dir.y = 0;
            dir.normalize();
            mob.velocity.x = dir.x * 2.8;
            mob.velocity.z = dir.z * 2.8;
            mob.yaw = Math.atan2(dir.x, dir.z);
          }
        }
      }

      // 6. Cat Repelling Creepers and Phantoms
      if (mob.type === 'cat' || mob.type === 'ocelot') {
        for (let j = 0; j < mobs.length; j++) {
          const other = mobs[j];
          if ((other.type === 'creeper' || other.type === 'phantom') && other.health > 0) {
            const dist = other.mesh.position.distanceTo(mob.mesh.position);
            if (dist < 14) {
              const fleeDir = other.mesh.position.clone().sub(mob.mesh.position);
              fleeDir.y = 0;
              fleeDir.normalize();
              if (!other.velocity) other.velocity = new THREE.Vector3();
              other.velocity.x = fleeDir.x * 4.0;
              other.velocity.z = fleeDir.z * 4.0;
              other.mesh.position.addScaledVector(other.velocity, dt);
              other.yaw = Math.atan2(fleeDir.x, fleeDir.z);
            }
          }
        }
      }
    }
  }

  /**
   * Handle riding locomotion for horses, donkeys, pigs, and striders
   */
  updateMountSteering(dt, player, controls = {}) {
    const mob = this.mount.mob;
    const type = this.mount.type;
    if(type==='strider'){steerStrider(this,mob,player,dt,controls);return;}
    if(!mob.velocity)mob.velocity=new THREE.Vector3();

    // MobManager historically passed an empty controls object because the
    // player owns keyboard state. Read that state as the fallback so mounts
    // respond to the same WASD/Space input as on-foot movement. Explicit
    // control values still win, which keeps this method easy to drive in tests
    // and by alternate controllers.
    const keys = player?.keys || {};
    const movement = {
      forward: controls.forward !== undefined ? controls.forward : Boolean(keys.KeyW),
      backward: controls.backward !== undefined ? controls.backward : Boolean(keys.KeyS),
      left: controls.left !== undefined ? controls.left : Boolean(keys.KeyA),
      right: controls.right !== undefined ? controls.right : Boolean(keys.KeyD),
      jump: controls.jump !== undefined ? controls.jump : Boolean(keys.Space),
      space: controls.space !== undefined ? controls.space : Boolean(keys.Space)
    };

    // If horse is untamed, chance to buck player off
    if (isEquine(type) && !mob.isTamed) {
      mob.tameTimer = (mob.tameTimer ?? 3.0) - dt;
      if (mob.tameTimer <= 0) {
        mob.tameAttempts = (mob.tameAttempts || 0) + 1;
        if ((mob.temper || 0) > Math.floor((this.mobManager.random || Math.random)()*100)) {
          mob.owner=player;
          mob.isTamed = true;
          this.spawnHeartParticles(mob.mesh.position);
          if(isPackEquine(mob))this.sounds?.playDonkey?.('ambient',mob.isBaby);else this.sounds?.playHorse?.();
        } else {
          mob.temper=Math.min(100,(mob.temper || 0)+5);
          mob.rearTime=1;
          // Buck off
          this.spawnSmokeParticles(mob.mesh.position);
          this.dismount(player);
          player.velocity.y = 5.0;
          return;
        }
      }
    }

    if(isEquine(type)) {
      if(player.keys?.ShiftLeft || player.keys?.ShiftRight || controls.dismount || this.world?.getVoxel(mob.mesh.position.x,mob.mesh.position.y+(isPackEquine(mob)?this.mobManager.getMobDimensions(type).height+.1:1.4),mob.mesh.position.z)===BLOCKS.WATER){this.dismount(player);return;}
      if(!mob.isTamed || !mob.isSaddled){mob.velocity.x=mob.velocity.z=0;this.jumpCharge=0;this.isChargingJump=false;mob.jumpCharge=0;return;}
    }
    // Camera sync: Player position sits on top of mob
    const mountOffset = isPackEquine(mob) ? 1.4*mob.rig.scale.y : isEquine(type) ? 1.4 : 0.8;
    player.position.copy(mob.mesh.position).add(new THREE.Vector3(0, mountOffset, 0));

    // Direction from camera
    const lookDir = new THREE.Vector3();
    player.camera?.getWorldDirection(lookDir);
    if(!lookDir.lengthSq())lookDir.set(-Math.sin(player.yaw || 0),0,-Math.cos(player.yaw || 0));
    lookDir.y = 0;
    lookDir.normalize();

    // Side vector
    const rightDir = new THREE.Vector3(-lookDir.z, 0, lookDir.x);

    let moveX = 0, moveZ = 0;
    if (movement.forward) { moveX += lookDir.x; moveZ += lookDir.z; }
    if (movement.backward) { moveX -= lookDir.x; moveZ -= lookDir.z; }
    if (movement.left) { moveX -= rightDir.x; moveZ -= rightDir.z; }
    if (movement.right) { moveX += rightDir.x; moveZ += rightDir.z; }

    const inputLen = Math.hypot(moveX, moveZ);
    let speed = (isEquine(type) ? (mob.movementSpeed ?? .175)*43.17 : 3.5);

    if(isEquine(type)){if(movement.backward)speed*=.25;else if(!movement.forward&&(movement.left||movement.right))speed*=.5;}
    // Boost timer for carrot / fungus on stick
    if (this.mount.boostTimer > 0) {
      this.mount.boostTimer -= dt;
      speed *= 1.8;
    }

    if (inputLen > 0.01) {
      moveX = (moveX / inputLen) * speed;
      moveZ = (moveZ / inputLen) * speed;
      mob.yaw = isEquine(type) ? Math.atan2(lookDir.x,lookDir.z) : Math.atan2(moveX, moveZ);
      mob.mesh.rotation.y = mob.yaw;
    } else {
      moveX = 0;
      moveZ = 0;
    }

    if (!mob.velocity) mob.velocity = new THREE.Vector3();
    mob.velocity.x = moveX;
    mob.velocity.z = moveZ;

    // Jump charging for equines
    if (isEquine(type)) {
      if (movement.jump || movement.space) {
        this.isChargingJump = true;
        this.jumpCharge = Math.min(1.0, this.jumpCharge + dt * 1.5);
        mob.jumpCharge = this.jumpCharge;
      } else if (this.isChargingJump) {
        // Unleash jump!
        if (mob.onGround) {
          const jumpPower = Math.sqrt(2*(mob.gravity ?? 24)*horseJumpHeight(mob.jumpStrength ?? .5))*(.4+.6*this.jumpCharge);
          mob.velocity.y = jumpPower;mob.onGround=false;
          if(isPackEquine(mob))this.sounds?.playDonkey?.('jump',mob.isBaby);else this.sounds?.playHorse?.();
        }
        this.isChargingJump = false;
        this.jumpCharge = 0;
        mob.jumpCharge = 0;
      }
    }
  }

  updateBreeding(dt) {
    for (const mob of this.mobManager.mobs) {
      if (mob.inLove > 0) this.checkBreedingPair(mob, dt);
    }
  }

  handleMobAttacked(aggressor, player) {
    for (const mob of this.mobManager.mobs) {
      if (mob.type === 'wolf' && mob.isTamed && mob.owner === player && !mob.isSitting) {
        mob.target = aggressor;
      }
    }
  }

  /**
   * Breeding matchmaking between two in-love animals
   */
  checkBreedingPair(mob, dt = 2.0) {
    if(mob.isBaby || mob.health<=0 || mob.breedingCooldown>0 || (isEquine(mob)&&(!mob.isTamed||mob.type==='mule')))return;
    const mobs = this.mobManager.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const other = mobs[i];
      if (other !== mob && other.health>0 && (other.type === mob.type || (isEquine(mob)&&isEquine(other)&&other.type!=='mule')) && (!isEquine(other)||other.isTamed) && other.inLove > 0 && !other.isBaby && (!other.breedingCooldown || other.breedingCooldown <= 0)) {
        const dist = mob.mesh.position.distanceTo(other.mesh.position);
        // Scale with the bodies: a horse is 1.4 wide, so a flat 1.2 threshold was below the
        // distance two horses can physically reach and they could never mate.
        const base = mob.type === 'hoglin' ? 1.6 : 1.2;
        // Width lives in the manager dimension table, not on the mob instance.
        const dims = (m) => this.mobManager?.getMobDimensions?.(m.type)?.width ?? m.width ?? 0.6;
        const bodyWidth = (dims(mob) + dims(other)) * 0.5;
        const courtshipRange = Math.max(base, bodyWidth + 0.5);
        if (dist < 10.0 && dist >= courtshipRange) {
          // Approach each other actively
          const dir = other.mesh.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 0.001) dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          if (mob.velocity) {
            mob.velocity.x = dir.x * 2.0;
            mob.velocity.z = dir.z * 2.0;
          }
          mob.wanderGoal = null;

          other.yaw = Math.atan2(-dir.x, -dir.z);
          if (other.velocity) {
            other.velocity.x = -dir.x * 2.0;
            other.velocity.z = -dir.z * 2.0;
          }
          other.wanderGoal = null;
          mob.matingTimer = 0;
          other.matingTimer = 0;
        } else if (dist < courtshipRange) {
          // Courtship / Mating mode: face each other, stay close, continuously emit red love hearts
          const dir = other.mesh.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 0.001) dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          if (mob.velocity) {
            mob.velocity.x *= 0.1;
            mob.velocity.z *= 0.1;
          }
          mob.wanderGoal = null;

          other.yaw = Math.atan2(-dir.x, -dir.z);
          if (other.velocity) {
            other.velocity.x *= 0.1;
            other.velocity.z *= 0.1;
          }
          other.wanderGoal = null;

          // Prevent double accumulation in same tick if both animals are iterated
          if (!this._currentUpdateTick || (mob._lastCourtshipTick !== this._currentUpdateTick && other._lastCourtshipTick !== this._currentUpdateTick)) {
            if (this._currentUpdateTick) {
              mob._lastCourtshipTick = this._currentUpdateTick;
              other._lastCourtshipTick = this._currentUpdateTick;
            }
            mob.matingTimer = (mob.matingTimer || 0) + dt;
            other.matingTimer = mob.matingTimer;
          }

          // Rapid red love hearts over both chickens during courtship
          mob.courtshipHeartTimer = (mob.courtshipHeartTimer || 0) - dt;
          if (mob.courtshipHeartTimer <= 0) {
            mob.courtshipHeartTimer = 0.35;
            this.spawnHeartParticles(mob.mesh.position);
            this.spawnHeartParticles(other.mesh.position);
          }

          // After courtship duration (2.0s), birth the baby chick!
          if (mob.matingTimer >= 2.0) {
            mob.inLove = 0;
            other.inLove = 0;
            mob.matingTimer = 0;
            other.matingTimer = 0;
            mob.breedingCooldown = 300.0;
            other.breedingCooldown = 300.0;

            // Spawn baby
            const babyPos = mob.mesh.position.clone().lerp(other.mesh.position, 0.5);
            const baby = this.mobManager.spawnMob(isEquine(mob)&&mob.type!==other.type?'mule':mob.type, babyPos.x, babyPos.y, babyPos.z);
            if (baby) {
              baby.isBaby = true;
              if(isEquine(mob))inheritHorse(baby,mob,other,this.mobManager);
              baby.babyGrowthTimer = isEquine(mob) || mob.type==='hoglin' || mob.type==='strider' ? 1200 : 120;
              baby.parent = mob;
              baby.mesh?.scale?.setScalar?.(baby.type==='horse' ? .7 : .5);
              if(isPackEquine(baby))syncPackEquineAppearance(baby);
              if (baby.head && !isEquine(baby) && baby.type!=='strider') baby.head.scale.set(1.5, 1.5, 1.5);
              if (baby.horns) baby.horns.forEach(h => h.visible = false);
              if (baby.udder) baby.udder.visible = false;
              if (baby.wattle) baby.wattle.visible = false;
              // Colour genetics for sheep. Wiki: compatible parent colours mix (blue +
              // white = light blue); incompatible pairs give the lamb one parent's
              // colour at random.
              if (mob.type === 'sheep') {
                baby.woolColor = inheritSheepColor(mob.woolColor, other.woolColor);
                sheepApplyWool(baby);
              }
            }

            // Drop XP
            const xp=1+Math.floor(Math.random()*7);
            if(this.mobManager.spawnXpOrbs)this.mobManager.spawnXpOrbs(babyPos,xp);
            else this.entities?.spawnXpOrbs?.(babyPos,xp);
            this.spawnHeartParticles(babyPos);
            if (this.sounds?.playPop) this.sounds.playPop();
            if (mob.type === 'cow' && this.sounds?.playCow) this.sounds.playCow();
            if (mob.type === 'chicken' && this.sounds?.playChicken) this.sounds.playChicken();
          }
          break;
        }
      }
    }
  }

  spawnHeartParticles(pos) {
    if (this.mobManager?.spawnParticleBurst) {
      this.mobManager.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xf43f5e, 10);
    }
  }

  spawnSmokeParticles(pos) {
    if (this.mobManager?.spawnParticleBurst) {
      this.mobManager.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0x64748b, 8);
    }
  }
}
