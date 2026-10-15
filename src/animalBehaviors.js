import { makeFrogPregnant } from './frogspawn.js';
import { IRON_INGOT_REPAIR } from './mobEnvironment.js';
import { isSquid, canInteractSquid, interactSquid, updateSquidAge } from './squidBehavior.js';
import { canInteractStrider, interactStrider, boostStrider, steerStrider, safeStriderDismount } from './striderBehavior.js';
import { isPackEquine, syncPackEquineAppearance } from './packEquineModel.js';
import { isEquine, canInteractHorse, interactHorse, inheritHorse, horseJumpHeight, updateHorse } from './horseBehavior.js';
import { SHEEP_COLORS, SHEEP_COLOR_HEX, sheepApplyWool, inheritSheepColor, rollSheepWoolCount } from './sheepBehavior.js';
import { isMooshroom, isBrownMooshroom, convertMooshroomToCow, MOOSHROOM_SHEAR_DROPS, MOOSHROOM_MUSHROOM_BLOCK, applyMooshroomVariant, isSmallFlower, STEW_EFFECTS } from './mooshroomBehavior.js';
import { applyWolfTamed, WOLF_TAME_CHANCE, WOLF_DEFAULT_COLLAR, canEquipWolfArmor, equipWolfArmor, removeWolfArmor, repairWolfArmor, WOLF_ARMOR_DURABILITY } from './wolfBehavior.js';
import { isParrotTamingFood, isParrotLethalFood, rollParrotTaming, parrotVariantName, applyParrotVariant } from './parrotBehavior.js';
import { breedPandaGenes, applyPandaPersonality, pandaCanBreed } from './pandaBehavior.js';
import { inheritFoxCoat } from './foxBehavior.js';
// Wiki: a killer bunny can breed with any rabbit, so the offspring rule lives with the mob.
import { inheritKillerBunny, makeKillerBunny, applyRabbitCoat } from './rabbitBehavior.js';
import { SNIFFER_BREEDING } from './snifferBehavior.js';
import { turtleDimensions, turtleMaturationDrops } from './turtleBehavior.js';
import { BABY_GROWTH_SECONDS, babyGrowthSecondsFor, accelerateBabyGrowth, startBabyGrowth, updateBabyGrowth } from './babyGrowth.js';
import { BEE_BREEDING_FLOWERS, isBeeBreedingFood, BEE_WITHER_ROSE, BEE_EYEBLOSSOM } from './beeBehavior.js';
import { isLlama, isTraderLlama, LLAMA_FOOD, LLAMA_TEMPER, LLAMA_BABY_FEED_ACCELERATION, llamaSlotsFor, llamaHealthFor, inheritLlamaVariant, inheritLlamaStrength, applyLlamaCoat, applyLlamaEquipment, equipLlamaChest, equipLlamaCarpet } from './llamaBehavior.js';
import { isCamel, camelCanBeRidden, camelCanBeControlled, camelCanSeat, equipCamelSaddle, removeCamelSaddle, feedCamelCactus, accelerateCamelGrowth, isCamelBreedingFood, camelDash, camelStand, CAMEL_SPEED } from './camelBehavior.js';
import { isUndeadHorse, isSkeletonHorse, isZombieHorse, equipUndeadHorse, shearUndeadHorse } from './undeadHorseBehavior.js';
import { isJebSheep } from './sheepBehavior.js';
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
  // Wiki: goats breed with wheat, and follow a wheat-holding player within ten blocks.
  goat: ['wheat'],
  // Wiki: turtles breed when fed seagrass, and follow a player holding it within ten blocks.
  turtle: ['seagrass'],
  // Wiki: frogs are tempted and bred with slimeballs, and follow a slimeball-holding player.
  frog: ['slime_ball'],
  // Wiki: rabbits breed with carrots, golden carrots or dandelions. The dandelion is a block
  // id here, so it is listed as the block constant rather than a string.
  rabbit: ['carrot', 'golden_carrot', BLOCKS.DANDELION],
  // Wiki: bees breed with any flower, flowering azalea, mangrove propagule, pink petals, etc.
  bee: BEE_BREEDING_FLOWERS,
  strider: ['warped_fungus', BLOCKS.WARPED_FUNGUS],
  hoglin: [BLOCKS.CRIMSON_FUNGUS, 'crimson_fungus'],
  sheep: ['wheat'],
  // Wiki: pandas "are bred using bamboo". Bamboo is not a shared food, and on Java the pair only
  // actually breeds with a plant within 7x7x3, which `checkBreedingPair` enforces below.
  panda: ['bamboo'],
  // Wiki: armadillos are bred with spider eyes, and follow a spider-eye-holding player within 10 blocks.
  armadillo: ['spider_eye'],
  // Wiki: sniffers are bred with torchflower seeds, which also accelerate a snifflet's growth.
  sniffer: ['torchflower_seeds'],
  // Wiki: camels are bred with cactus, which also takes 10 s off a baby's growth.
  camel: ['cactus'],
  pig: ['carrot', 'potato', 'beetroot'],
  chicken: [
    'wheat_seeds',
    'pumpkin_seeds',
    'melon_seeds',
    'beetroot_seeds',
    'torchflower_seeds',
    'pitcher_pod'
  ],
  wolf: ['beef', 'cooked_beef', 'porkchop', 'cooked_porkchop', 'chicken', 'cooked_chicken', 'mutton', 'cooked_mutton', 'rabbit', 'cooked_rabbit'],
  cat: ['salmon', 'cod', 'cooked_salmon', 'cooked_cod'],
  horse: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple'],
  donkey: ['golden_apple', 'golden_carrot', 'enchanted_golden_apple'],
  llama: ['hay_block'],
  trader_llama: ['hay_block']
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
    // Item ids are item NAMES, except for blocks, which carry their numeric id. Only a name can go
    // through a string operation, and `itemId.endsWith('_dye')` on a number threw: handleRightClick
    // asks this for every mob in the world before it reaches block placement, so with a sheep, wolf
    // or horse anywhere on the map, holding any block and right-clicking aborted the whole click and
    // no block could be placed. Every string test below reads `itemName`; the numeric id is passed on
    // unchanged so the comparisons that already mix the two forms keep behaving exactly as they did.
    const itemName = typeof itemId === 'string' ? itemId : '';

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
    if (mob.type === 'sheep' && itemName.endsWith('_dye')) return !mob.isSheared;

    // Naming sheep with name tag (e.g., jeb_)
    if (mob.type === 'sheep' && itemId === 'name_tag') return true;

    // Wolf taming or healing or sitting
    if (mob.type === 'wolf') {
      if (!mob.isTamed && itemId === 'bone') return true;
      if (mob.isTamed && mob.owner === player) {
        if (itemName.endsWith('_dye')) return true;
        if (this.isBreedingFood('wolf', itemId) && mob.health < mob.maxHealth) return true;
        return true;
      }
    }

    // Cat taming or sitting
    if (mob.type === 'cat' || mob.type === 'ocelot') {
      if (!mob.isTamed && (itemId === 'salmon' || itemId === 'cod')) return true;
      if (mob.isTamed && mob.owner === player) return true;
    }

    // Horse / donkey
    if (mob.type === 'horse' || mob.type === 'donkey') {
      if (mob.type === 'donkey' && mob.isTamed && itemId === 'chest' && !mob.hasChest) return true;
      if (mob.type === 'horse' && mob.isTamed && itemName.endsWith('_horse_armor') && !mob.horseArmor) return true;
      if (mob.isTamed && itemId === 'saddle' && !mob.isSaddled) return true;
      return true;
    }

    // Undead horse (skeleton horse & zombie horse): saddling, armor (zombie), shears, riding
    if (isUndeadHorse(mob)) {
      if (!itemId) return !mob.rider && !mob.isBaby;
      if (itemId === 'saddle') return !mob.isBaby && !mob.hasSaddle;
      if (isZombieHorse(mob) && itemName.endsWith('_horse_armor')) return !mob.isBaby && !mob.horseArmor;
      if (itemId === 'shears') return !!(mob.hasSaddle || mob.horseArmor);
      if (itemId === 'lead' || itemId === 'name_tag') return true;
      return false;
    }

    // Camel: saddling, shears, cactus feeding/breeding, golden dandelion, riding
    if (isCamel(mob)) {
      if (!itemId) return camelCanSeat(mob);
      if (itemId === 'saddle') return !mob.isBaby && !mob.hasSaddle;
      if (itemId === 'shears') return !!mob.hasSaddle;
      if (itemId === 'cactus') return mob.health < mob.maxHealth || (mob.isBaby && !mob.ageLocked) || (!mob.isBaby && mob.health === mob.maxHealth && !(mob.breedingCooldown > 0) && !(mob.inLove > 0));
      if (itemId === 'golden_dandelion') return !!mob.isBaby && !(mob.ageLockCooldown > 0);
      if (itemId === 'lead' || itemId === 'name_tag') return true;
      return false;
    }

    // Pig / strider
    if (mob.type === 'pig' || mob.type === 'strider') {
      if (itemId === 'saddle' && !mob.isSaddled) return true;
      if (mob.isSaddled || mob.hasSaddle) return true;
    }

    // Bee age lock with golden dandelion
    if (mob.type === 'bee' && mob.isBaby && (itemId === 'golden_dandelion' || itemName === 'golden_dandelion')) return true;

    // Llama & Trader Llama: empty hand ride/tame, wheat/hay feeding, chest/carpet/shears equipping
    if (isLlama(mob)) {
      if (!itemId) {
        return !mob.isBaby;
      }
      if (itemId === 'wheat') {
        return mob.isBaby || mob.health < mob.maxHealth || !mob.isTamed;
      }
      if (itemId === 'hay_block') {
        if (mob.isBaby || mob.health < mob.maxHealth || !mob.isTamed) return true;
        if (mob.isTamed && (!mob.breedingCooldown || mob.breedingCooldown <= 0) && (!mob.inLove || mob.inLove <= 0)) return true;
        return false;
      }
      if (mob.isTamed) {
        if (itemId === 'chest' && !mob.hasChest) return true;
        if (itemName.endsWith('_carpet')) return true;
        if (itemId === 'shears' && (mob.carpetColor || mob.carpetItem)) return true;
      }
      return false;
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
    // Same split as `canInteract`: string tests read the name form, which is empty for a held block,
    // so right-clicking a sheep or a wolf while holding one no longer throws before it is handled.
    const itemName = typeof itemId === 'string' ? itemId : '';

    // --- Iron golems -------------------------------------------------------------
    // Wiki: an iron ingot heals a damaged iron golem by 25 HP (one deterioration level) and is consumed.
    if (mob.type === 'iron_golem' && itemId === 'iron_ingot' && mob.health > 0) {
      if (mob.health >= mob.maxHealth) return false;
      mob.health = Math.min(mob.maxHealth, mob.health + IRON_INGOT_REPAIR);
      if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
      return true;
    }

    // --- Parrots ---------------------------------------------------------------
    // Wiki: tamed with any seed at a 1-in-10 chance, sitting toggled by interacting with a tamed
    // one, and killed outright by a cookie because chocolate is toxic to real parrots.
    if (mob.type === 'parrot' && mob.health > 0) {
      if (!itemId) {
        // An empty hand toggles sitting on a tamed parrot; on a wild one it does nothing.
        if (mob.isTamed) { mob.isSitting = !mob.isSitting; return true; }
        return false;
      }
      if (isParrotLethalFood(itemId)) {
        // It dies, and the player who fed it gets the credit: the wiki says that affects the death
        // message and the loot.
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        mob.health = 0;
        mob.playerDamaged = true;
        return true;
      }
      if (isParrotTamingFood(itemId)) {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (!mob.isTamed && rollParrotTaming()) {
          mob.isTamed = true;
          mob.owner = player;
        }
        return true;
      }
      return false;
    }

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
    if (mob.type === 'sheep' && itemName.endsWith('_dye')) {
      if (mob.isSheared) return false;
      const dyeColor = itemName.replace('_dye', '');
      if (SHEEP_COLOR_HEX[dyeColor]) {
        mob.woolColor = dyeColor;
        sheepApplyWool(mob);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }
    }

    // Naming a Sheep with Name Tag (e.g., jeb_ easter egg)
    if (mob.type === 'sheep' && itemId === 'name_tag') {
      const item = inventory.getActiveItem();
      const name = item?.customName || item?.name;
      if (!name || name === 'Name Tag') return false;
      mob.name = String(name).slice(0, 64);
      mob.customName = mob.name;
      sheepApplyWool(mob);
      if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
      return true;
    }

    // 4. Wolf: Taming with bones, collar dyeing, sitting toggle
    if (mob.type === 'wolf') {
      if (!mob.isTamed && itemId === 'bone') {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (Math.random() < WOLF_TAME_CHANCE) {
          // Wiki: taming raises the maximum health from 8 to 40, keeping any existing
          // injuries relative to the new maximum.
          applyWolfTamed(mob);
          mob.owner = player;
          mob.collarColor = WOLF_DEFAULT_COLLAR;
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
        // Wolf armour: put on (an adult only), taken off with shears, repaired with a scute (wiki, Wolf Armor).
        if (itemId === 'wolf_armor' && canEquipWolfArmor(mob, player)) {
          // A worn piece keeps its wear: `durability` on a stack is what it has left (durability.js).
          const held = inventory.getActiveItem?.();
          equipWolfArmor(mob, typeof held?.durability === 'number' ? held.durability : WOLF_ARMOR_DURABILITY);
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          this.sounds?.playClick?.();
          return true;
        }
        if (itemId === 'shears' && mob.wolfArmor) {
          const removed = removeWolfArmor(mob);
          this.entities?.spawnDroppedItem?.(mob.mesh.position.clone(), 'wolf_armor', false, 1, { durability: removed.durability });
          return true;
        }
        if (itemId === 'armadillo_scute' && repairWolfArmor(mob)) {
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          return true;
        }
        // Dye collar
        if (itemName.endsWith('_dye')) {
          const dyeColor = itemName.replace('_dye', '');
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
      if (!mob.isTamed && (itemId === 'salmon' || itemId === 'cod')) {
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

    // Bee: golden dandelion locks / unlocks baby bee age
    if (mob.type === 'bee' && mob.isBaby && (itemId === 'golden_dandelion' || itemName === 'golden_dandelion')) {
      mob.ageLocked = !mob.ageLocked;
      if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
      if (this.sounds?.playPop) this.sounds.playPop();
      if (this.mobManager?.spawnParticleBurst) {
        this.mobManager.spawnParticleBurst(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0xfacc15, 6);
      }
      return true;
    }

    // Bee: feeding hazards (wither rose gives Wither for 2s, open eyeblossom gives Poison for 1.25s)
    if (mob.type === 'bee' && this.isBreedingFood(mob.type, itemId)) {
      if (itemId === 'wither_rose' || itemName === 'wither_rose') {
        if (!mob.statusEffects) mob.statusEffects = {};
        mob.statusEffects.wither = { seconds: BEE_WITHER_ROSE.seconds, level: 1 };
        if (mob.applyStatusEffect) mob.applyStatusEffect(BEE_WITHER_ROSE.effect, BEE_WITHER_ROSE.seconds, 1);
        mob.witherTimer = BEE_WITHER_ROSE.seconds;
      } else if (itemId === 'open_eyeblossom' || itemName === 'open_eyeblossom') {
        if (!mob.statusEffects) mob.statusEffects = {};
        mob.statusEffects.poison = { seconds: BEE_EYEBLOSSOM.seconds, level: 1 };
        if (mob.applyStatusEffect) mob.applyStatusEffect(BEE_EYEBLOSSOM.effect, BEE_EYEBLOSSOM.seconds, 1);
        mob.poisonTimer = BEE_EYEBLOSSOM.seconds;
      }
    }

    // 7.5. Llama & Trader Llama: wheat/hay feeding, equipping chest/carpet, shears, empty-hand taming/riding
    if (isLlama(mob) && mob.health > 0) {
      if (itemId === 'wheat') {
        let fed = false;
        if (mob.isBaby) {
          accelerateBabyGrowth(mob, LLAMA_BABY_FEED_ACCELERATION);
          mob.health = Math.min(mob.maxHealth, mob.health + LLAMA_FOOD.wheat.heal);
          fed = true;
        } else if (mob.health < mob.maxHealth || !mob.isTamed) {
          mob.health = Math.min(mob.maxHealth, mob.health + LLAMA_FOOD.wheat.heal);
          mob.temper = Math.min(LLAMA_TEMPER.max, (mob.temper || 0) + LLAMA_FOOD.wheat.temper);
          fed = true;
        }
        if (fed) {
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          if (this.sounds?.playPop) this.sounds.playPop();
          this.spawnGreenParticles(mob.mesh.position);
          return true;
        }
        return false;
      }

      if (itemId === 'hay_block') {
        let fed = false;
        if (mob.isBaby) {
          accelerateBabyGrowth(mob, 90 / BABY_GROWTH_SECONDS);
          mob.health = Math.min(mob.maxHealth, mob.health + LLAMA_FOOD.hay_block.heal);
          fed = true;
        } else {
          if (mob.health < mob.maxHealth || !mob.isTamed) {
            mob.health = Math.min(mob.maxHealth, mob.health + LLAMA_FOOD.hay_block.heal);
            mob.temper = Math.min(LLAMA_TEMPER.max, (mob.temper || 0) + LLAMA_FOOD.hay_block.temper);
            fed = true;
          }
          if (mob.isTamed && (!mob.breedingCooldown || mob.breedingCooldown <= 0) && (!mob.inLove || mob.inLove <= 0)) {
            mob.inLove = 30.0;
            this.spawnHeartParticles(mob.mesh.position);
            fed = true;
          }
        }
        if (fed) {
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          if (this.sounds?.playPop) this.sounds.playPop();
          return true;
        }
        return false;
      }

      if (mob.isTamed && itemId === 'chest' && !mob.hasChest) {
        equipLlamaChest(mob);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }

      if (mob.isTamed && itemName.endsWith('_carpet')) {
        equipLlamaCarpet(mob, itemName);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playPop) this.sounds.playPop();
        return true;
      }

      if (mob.isTamed && itemId === 'shears' && (mob.carpetColor || mob.carpetItem)) {
        const drop = mob.carpetItem || (typeof mob.carpetColor === 'string' ? (mob.carpetColor.endsWith('_carpet') ? mob.carpetColor : `${mob.carpetColor}_carpet`) : 'white_carpet');
        this.entities?.spawnDroppedItem?.(mob.mesh.position, drop, false, 1);
        mob.carpetColor = null;
        mob.carpetItem = null;
        if (isTraderLlama(mob)) mob.hasTraderCarpet = true;
        applyLlamaEquipment(mob);
        if (this.sounds?.playShears) this.sounds.playShears();
        return true;
      }

      if (!itemId && !mob.isBaby) {
        if (!mob.isTamed) {
          return this.tameLlama(mob, player);
        } else {
          this.mount = { mob, type: mob.type };
          mob.rider = player;
          player.ridingMob = mob;
          return true;
        }
      }
    }

    // Camel: saddling, shears, cactus feeding/breeding, golden dandelion, riding
    if (isCamel(mob)) {
      if (mob.health <= 0) return false;
      if (itemId === 'saddle') {
        if (!equipCamelSaddle(mob, 'saddle')) return false;
        if (mob.saddle) mob.saddle.visible = true;
        if (mob.saddleMesh) mob.saddleMesh.visible = true;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playArmorEquip) this.sounds.playArmorEquip();
        return true;
      }
      if (itemId === 'shears') {
        if (!removeCamelSaddle(mob, 'shears')) return false;
        if (mob.saddle) mob.saddle.visible = false;
        if (mob.saddleMesh) mob.saddleMesh.visible = false;
        this.entities?.spawnDroppedItem?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), 'saddle', false, 1);
        if (player.gamemode !== 'creative' && activeItem && typeof activeItem.durability === 'number') {
          activeItem.durability = Math.max(0, activeItem.durability - 1);
          if (activeItem.durability === 0) inventory.consumeActiveItem(1);
        }
        if (this.sounds?.playShears) this.sounds.playShears();
        return true;
      }
      if (itemId === 'cactus') {
        let fed = false;
        if (mob.isSitting) camelStand(mob);
        if (mob.isBaby) {
          if (!mob.ageLocked) accelerateCamelGrowth(mob, 10);
          feedCamelCactus(mob);
          fed = true;
        } else {
          if (mob.health < mob.maxHealth) {
            feedCamelCactus(mob);
            fed = true;
          } else if (mob.health === mob.maxHealth && (!mob.breedingCooldown || mob.breedingCooldown <= 0) && (!mob.inLove || mob.inLove <= 0)) {
            mob.inLove = 30;
            this.spawnHeartParticles(mob.mesh.position);
            fed = true;
          }
        }
        if (fed) {
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          if (this.sounds?.playEat) this.sounds.playEat();
          return true;
        }
        return false;
      }
      if (itemId === 'golden_dandelion') {
        if (!mob.isBaby || mob.ageLockCooldown > 0) return false;
        mob.ageLocked = !mob.ageLocked;
        mob.ageLockCooldown = 2;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        return true;
      }
      if (itemId === 'lead') {
        if (mob.leashHolder || mob.leashAnchor) {
          this.entities?.spawnDroppedItem?.(mob.mesh.position, 'lead', false, 1);
          mob.leashHolder = null;
          mob.leashAnchor = null;
          return true;
        }
        mob.leashHolder = player;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        return true;
      }
      if (itemId === 'name_tag') {
        const item = inventory.getActiveItem();
        const name = item?.customName || item?.name;
        if (!name || name === 'Name Tag') return false;
        mob.name = String(name).slice(0, 64);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        return true;
      }
      if (!itemId && !mob.isBaby && camelCanSeat(mob)) {
        if (mob.isSitting) camelStand(mob);
        this.mountMob(mob, player);
        return true;
      }
      return false;
    }

    // Undead horse (skeleton horse & zombie horse): saddling, armor (zombie), shears, riding
    if (isUndeadHorse(mob)) {
      if (mob.health <= 0) return false;
      if (itemId === 'saddle') {
        if (!equipUndeadHorse(mob, 'saddle')) return false;
        if (mob.saddle) mob.saddle.visible = true;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playArmorEquip) this.sounds.playArmorEquip();
        return true;
      }
      if (isZombieHorse(mob) && itemName.endsWith('_horse_armor')) {
        if (!equipUndeadHorse(mob, itemName)) return false;
        if (mob.armorMesh) mob.armorMesh.visible = true;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        if (this.sounds?.playArmorEquip) this.sounds.playArmorEquip();
        return true;
      }
      if (itemId === 'shears') {
        const removed = shearUndeadHorse(mob, 'shears');
        if (!removed) return false;
        if (removed === 'saddle' && mob.saddle) mob.saddle.visible = false;
        if (removed.endsWith('_horse_armor') && mob.armorMesh) mob.armorMesh.visible = false;
        this.entities?.spawnDroppedItem?.(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), removed, false, 1);
        if (player.gamemode !== 'creative' && activeItem && typeof activeItem.durability === 'number') {
          activeItem.durability = Math.max(0, activeItem.durability - 1);
          if (activeItem.durability === 0) inventory.consumeActiveItem(1);
        }
        if (this.sounds?.playShears) this.sounds.playShears();
        return true;
      }
      if (itemId === 'lead') {
        if (mob.leashHolder || mob.leashAnchor) {
          this.entities?.spawnDroppedItem?.(mob.mesh.position, 'lead', false, 1);
          mob.leashHolder = null;
          mob.leashAnchor = null;
          return true;
        }
        mob.leashHolder = player;
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        return true;
      }
      if (itemId === 'name_tag') {
        const item = inventory.getActiveItem();
        const name = item?.customName || item?.name;
        if (!name || name === 'Name Tag') return false;
        mob.name = String(name).slice(0, 64);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
        return true;
      }
      if (!itemId && !mob.isBaby && !mob.rider) {
        this.mountMob(mob, player);
        return true;
      }
      return false;
    }

    // 8. Animal Breeding (Love mode with food) & Baby growth acceleration
    if (this.isBreedingFood(mob.type, itemId)) {
      if (mob.isBaby) {
        // Wiki: each feeding removes 10% of the remaining growth time, with no effect below
        // 9 seconds. This used to be a flat "- 12" seconds for ordinary animals, which
        // happened to equal 10% of the wrong 120-second timer.
        accelerateBabyGrowth(mob);
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
    if (type === 'bee') return isBeeBreedingFood(itemId);
    if (type === 'hoglin' && (itemId === BLOCKS.CRIMSON_FUNGUS || itemId?.id === BLOCKS.CRIMSON_FUNGUS)) return true;
    const cleanId = String(typeof itemId === 'string' ? itemId : itemId?.id || '').toLowerCase().trim();
    const foods = BREEDING_FOODS[type];
    if (Array.isArray(foods) && foods.includes(cleanId)) return true;
    if (type === 'chicken' && (cleanId.includes('seed') || cleanId.includes('pod'))) return true;
    if (type === 'cow' && cleanId.includes('wheat') && !cleanId.includes('seed')) return true;
    return false;
  }

  mountMob(mob, player) {
    if(mob.rider&&mob.rider!==player && !isCamel(mob))return false;
    if ((isEquine(mob)||mob.type==='strider'||isCamel(mob)||isUndeadHorse(mob)) && mob.isBaby) return false;
    if(mob.type==='strider'&&(!mob.isSaddled||mob.rider))return false;
    if(isCamel(mob) && (mob.riderCount || 0) >= 2) return false;
    if(player?.ridingMob) this.dismount(player);
    else if(this.mount && !isCamel(mob)) this.dismount(player);
    this.jumpCharge=0;this.isChargingJump=false;
    if (!this.mount || this.mount.mob !== mob) {
      this.mount = {
        mob,
        type: mob.type,
        boostTimer: 0,
        tameAttempts: mob.tameAttempts || 0
      };
    }
    player.ridingMob = mob;
    if (!mob.rider) mob.rider = player;
    else if (!mob.passenger) mob.passenger = player;
    if (isCamel(mob)) {
      mob.riderCount = Math.min(2, (mob.riderCount || 0) + 1);
    }
    return true;
  }

  dismount(player) {
    this.jumpCharge=0;this.isChargingJump=false;
    const targetMount = player?.ridingMob || this.mount?.mob;
    if(this.mount?.type==='strider'&&player)safeStriderDismount(this,this.mount.mob,player);
    if(targetMount) {
      targetMount.jumpCharge=0;
      if (isCamel(targetMount)) {
        targetMount.riderCount = Math.max(0, (targetMount.riderCount || 1) - 1);
      }
      if (targetMount.passenger === player) {
        targetMount.passenger = null;
      } else if (targetMount.rider === player) {
        targetMount.rider = targetMount.passenger || null;
        targetMount.passenger = null;
      }
      if (targetMount.riderCount === 0 || (!targetMount.rider && !targetMount.passenger)) {
        if (this.mount?.mob === targetMount) this.mount = null;
      }
    } else if (this.mount) {
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
                  // Wiki: a hatched chick gets the full 20-minute growth time.
                  startBabyGrowth(baby);
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
      // A snifflet's growth is owned by its own branch: the wiki gives it 2400 s, twice the shared
      // constant, so the shared pass must not also tick it and halve the time.
      if (mob.isBaby && !mob.ageLocked && !['piglin', 'zombified_piglin', 'zoglin', 'sniffer'].includes(mob.type)) {
        // Wiki: 20 minutes, not the 120 seconds ordinary animals used to get.
        if (updateBabyGrowth(mob, dt)) {
          if(isPackEquine(mob))syncPackEquineAppearance(mob);
          // Wiki: a baby mooshroom has no mushrooms; they appear once it grows up.
          applyMooshroomVariant(mob);
          // Wiki: "When a baby turtle matures into an adult, it drops 1 turtle scute."
          if (mob.type === 'turtle') {
            const dims = turtleDimensions(mob);
            mob.width = dims.width;
            mob.height = dims.height;
            // `matured` is passed because the shared growth step has already cleared `isBaby`.
            for (const [id, isBlock, min, max] of turtleMaturationDrops(mob, { matured: true })) {
              const count = min + Math.floor(Math.random() * (max - min + 1));
              if (count > 0) this.entities?.spawnDroppedItem(mob.mesh.position.clone(), id, isBlock, count);
            }
          }
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

      // 4. Sheep Grazing to Regrow Wool & jeb_ rainbow wool animation
      if (mob.type === 'sheep') {
        if (isJebSheep(mob)) {
          mob.jebTime = (mob.jebTime || 0) + dt;
          sheepApplyWool(mob);
        }
        // Sheep: an adult tries to eat grass with a 1-in-1000 chance each tick, a lamb 1 in 50 -- on average every 50 s
        // and 2.5 s. The wait was an invented 15-50 s timer, and a second grazing pass (mobEnvironment.js) ran on top
        // of it, so a sheared sheep had its wool back within seconds (The second day play-test).
        mob.grazeTimer = (mob.grazeTimer !== undefined ? mob.grazeTimer : (mob.eatGrassTimer !== undefined ? mob.eatGrassTimer : sheepGrazeWait(mob, this.mobManager?.random ?? Math.random))) - dt;
        if (mob.grazeTimer <= 0) {
          mob.grazeTimer = sheepGrazeWait(mob, this.mobManager?.random ?? Math.random);
          // The block under its feet: floored, not rounded (a sheep at x = 10.5 stands on block 10).
          const bx = Math.floor(mob.mesh.position.x);
          const by = Math.floor(mob.mesh.position.y - 0.1);
          const bz = Math.floor(mob.mesh.position.z);
          const blockBelow = this.world?.getVoxel(bx, by, bz);
          if (blockBelow === BLOCKS.GRASS || blockBelow === BLOCKS.GRASS_BLOCK) {
            this.world?.setVoxel(bx, by, bz, BLOCKS.DIRT);
            mob.isSheared = false;
            // Regrowing the wool restores the sheep's retained colour, so a dyed sheep
            // is still that colour after it is sheared and regrows.
            sheepApplyWool(mob);
            // Wiki: eating grass accelerates a baby sheep's growth by 10% (60 seconds)
            if (mob.isBaby && !mob.ageLocked) {
              mob.babyGrowthTimer = Math.max(0, (mob.babyGrowthTimer ?? 1200) - 60);
            }
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

    if(isEquine(type) || isUndeadHorse(type)) {
      if(player.keys?.ShiftLeft || player.keys?.ShiftRight || controls.dismount) {
        this.dismount(player);
        return;
      }
      // Water dismount: Skeleton horse CAN be ridden underwater!
      if(!isSkeletonHorse(type) && this.world?.getVoxel(mob.mesh.position.x,mob.mesh.position.y+(isPackEquine(mob)?this.mobManager.getMobDimensions(type).height+.1:1.4),mob.mesh.position.z)===BLOCKS.WATER){
        this.dismount(player);
        return;
      }
      if((isEquine(type) && !mob.isTamed) || (!mob.isSaddled && !mob.hasSaddle)){
        mob.velocity.x=mob.velocity.z=0;
        this.jumpCharge=0;
        this.isChargingJump=false;
        mob.jumpCharge=0;
        return;
      }
    }

    if(isCamel(type)) {
      if(player.keys?.ShiftLeft || player.keys?.ShiftRight || controls.dismount) {
        this.dismount(player);
        return;
      }
      if(!mob.hasSaddle) {
        mob.velocity.x=mob.velocity.z=0;
        return;
      }
    }

    // Camera sync: Player position sits on top of mob
    const mountOffset = isCamel(type) ? 2.1 : (isPackEquine(mob) ? 1.4*mob.rig.scale.y : (isEquine(type) || isUndeadHorse(type)) ? 1.4 : 0.8);
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
    let speed = 3.5;
    if (isCamel(type)) {
      speed = (movement.sprint || controls.sprint) ? CAMEL_SPEED.sprint : CAMEL_SPEED.walk;
      mob.stepHeight = 1.5;
      mob.isSitting = false;
    } else if (isEquine(type) || isUndeadHorse(type)) {
      speed = (mob.movementSpeed ?? (isUndeadHorse(type) ? 0.2 : 0.175)) * 43.17;
      if (movement.backward) speed *= .25;
      else if (!movement.forward && (movement.left || movement.right)) speed *= .5;
    }

    // Boost timer for carrot / fungus on stick
    if (this.mount.boostTimer > 0) {
      this.mount.boostTimer -= dt;
      speed *= 1.8;
    }

    if (inputLen > 0.01) {
      moveX = (moveX / inputLen) * speed;
      moveZ = (moveZ / inputLen) * speed;
      mob.yaw = (isEquine(type) || isUndeadHorse(type) || isCamel(type)) ? Math.atan2(lookDir.x,lookDir.z) : Math.atan2(moveX, moveZ);
      mob.mesh.rotation.y = mob.yaw;
    } else {
      moveX = 0;
      moveZ = 0;
    }

    if (!mob.velocity) mob.velocity = new THREE.Vector3();
    mob.velocity.x = moveX;
    mob.velocity.z = moveZ;

    // Jump charging for equines & undead horses
    if (isEquine(type) || isUndeadHorse(type)) {
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
    } else if (isCamel(type)) {
      if (movement.jump || movement.space) {
        this.isChargingJump = true;
        this.jumpCharge = Math.min(1.0, this.jumpCharge + dt * 1.5);
        mob.jumpCharge = this.jumpCharge;
      } else if (this.isChargingJump) {
        if (mob.onGround && (mob.dashCooldown || 0) <= 0) {
          const dashVel = camelDash(mob, { charged: this.jumpCharge >= 0.5 });
          if (dashVel) {
            mob.velocity.copy(dashVel);
            mob.onGround = false;
            mob.isDashing = true;
          }
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
  /**
   * Copy the per-type traits a baby should inherit from its parents.
   *
   * The baby is built by `spawnMob(type, ...)`, so it starts as a plain member of the species;
   * everything that varies between individuals is applied here. Each mob that has a variant system
   * and can breed has a branch, so the rule lives with the mob rather than being patched in at the
   * call site.
   *
   * Returns the trait name that was applied, for telemetry and tests.
   */
  inheritBabyTraits(baby, parentA, parentB) {
    if (!baby || !parentA || !parentB) return null;
    const random = this.mobManager?.random || Math.random;

    // Wiki: pandas inherit one gene from each parent, randomly ordered, with an independent 1/32
    // mutation chance per gene. This is the most involved inheritance here, because the
    // personality of the child follows from the two genes rather than from either parent directly.
    if (baby.type === 'panda') {
      const genes = breedPandaGenes(parentA, parentB, random);
      baby.mainGene = genes.mainGene;
      baby.hiddenGene = genes.hiddenGene;
      applyPandaPersonality(baby);
      return 'pandaGenes';
    }

    // Wiki: a baby rabbit inherits one parent's coat at random, or -- unusually -- becomes a killer
    // bunny when a parent is one. The earlier note here claimed the killer bunny could not be bred
    // at all, which the wiki contradicts: a killer bunny "can breed with other rabbits and with each
    // other, having the unusual chance of creating a baby killer bunny".
    if (baby.type === 'rabbit') {
      if (inheritKillerBunny(parentA, parentB, random)) {
        // The killer identity wins over the coat, because it is a RabbitType and not a coat.
        makeKillerBunny(baby);
        return 'killerBunny';
      }
      const coats = [parentA.coat, parentB.coat].filter(c => c !== undefined && c !== null && c !== 'killer');
      if (coats.length) {
        baby.coat = coats[Math.floor(random() * coats.length)];
        applyRabbitCoat(baby);
        return 'rabbitCoat';
      }
      // Neither parent carried an inheritable coat -- both were killers and the roll failed, or the coat
      // was never set at all. `null` is the honest answer: a bare mob stays bare rather than being
      // silently re-coloured, and the caller can decide what to do.
      return null;
    }

    // Wiki: a fox cub inherits one parent's type, and a red x snow pairing is a 50/50. The rule
    // lives in `inheritFoxCoat` so the mob owns it.
    if (baby.type === 'fox') {
      const inherited = inheritFoxCoat(
        parentA.coat ?? parentA.variant,
        parentB.coat ?? parentB.variant,
        random
      );
      if (inherited !== undefined) {
        baby.coat = inherited;
        baby.variant = inherited;
        return 'foxCoat';
      }
      return null;
    }

    // Wiki: a baby cat inherits one parent's coat at random.
    if (baby.type === 'cat') {
      const coats = ['tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico',
        'persian', 'ragdoll', 'white', 'jellie', 'all_black'];
      // Only coats the parents actually have are candidates, which is what the wiki says.
      const candidates = [parentA.catVariant, parentB.catVariant].filter(v => coats.includes(v));
      if (candidates.length) {
        baby.catVariant = candidates[Math.floor(random() * candidates.length)];
        return 'catVariant';
      }
      return null;
    }

    // Wiki: a baby parrot inherits one parent's colour at random.
    if (baby.type === 'parrot') {
      const variants = [parentA.variant, parentB.variant].filter(v => typeof v === 'number');
      if (variants.length) {
        const chosen = variants[Math.floor(random() * variants.length)];
        baby.variant = chosen;
        baby.variantName = parrotVariantName(chosen);
        applyParrotVariant(baby);
        return 'parrotVariant';
      }
      return null;
    }

    // Wiki: a baby goat inherits its horns from one parent, and a screaming goat
    // (a 1-in-1000 birth) is separate from that. The screaming roll is the wiki's own rare event.
    if (baby.type === 'goat') {
      const from = random() < 0.5 ? parentA : parentB;
      if (from.horns && baby.horns) {
        // `horns` is an object keyed left/right in this codebase, not an array.
        baby.hasLeftHorn = from.hasLeftHorn !== false;
        baby.hasRightHorn = from.hasRightHorn !== false;
      }
      baby.isScreamingGoat = random() < 0.002;
      // Wiki: the screaming trait is 1 in 1000, and it is inherited by 50% of offspring when one
      // parent is a screaming goat, so the inherited roll is checked first.
      if (parentA.isScreamingGoat || parentB.isScreamingGoat) baby.isScreamingGoat = random() < 0.5;
      return 'goatTraits';
    }

    // Wiki: a wolf pup inherits a random collar colour from its parents when tamed.
    if (baby.type === 'wolf') {
      const colors = [parentA.collarColor, parentB.collarColor].filter(c => c !== undefined && c !== null);
      if (colors.length) {
        baby.collarColor = colors[Math.floor(random() * colors.length)];
        return 'wolfCollar';
      }
      return null;
    }

    // Wiki: a mooshroom is brown or red, and a baby takes one parent's variant.
    if (baby.type === 'mooshroom') {
      const variants = [parentA.variant, parentB.variant].filter(v => v !== undefined);
      if (variants.length) {
        baby.variant = variants[Math.floor(random() * variants.length)];
        applyMooshroomVariant(baby);
        return 'mooshroomVariant';
      }
      return null;
    }

    if (baby.type === 'bee') {
      baby.width = 0.275;
      baby.height = 0.25;
      return 'beeTraits';
    }

    if (baby.type === 'llama') {
      baby.variant = inheritLlamaVariant(parentA.variant, parentB.variant, random);
      baby.strength = inheritLlamaStrength(parentA.strength, parentB.strength, random);
      baby.health = llamaHealthFor(baby.strength);
      baby.maxHealth = baby.health;
      baby.chestSlots = llamaSlotsFor(baby.strength);
      baby.chestInventory = new Array(baby.chestSlots).fill(null);
      applyLlamaCoat(baby);
      return 'llamaTraits';
    }

    return null;
  }


  checkBreedingPair(mob, dt = 2.0) {
    // Wiki: Java pandas "breed only if there is at least one bamboo plant (not including shoots)
    // within a 7x7x3 area", and otherwise shake their heads and do not breed. This is checked
    // before anything else, so two pandas full of bamboo in a stone room never produce a cub.
    if (mob.type === 'panda' && mob.inLove > 0 && !pandaCanBreed(this.mobManager, mob)) return;
    if(mob.isBaby || mob.health<=0 || mob.breedingCooldown>0 || (isEquine(mob)&&(!mob.isTamed||mob.type==='mule')) || (isLlama(mob)&&!mob.isTamed))return;
    const mobs = this.mobManager.mobs;
    for (let i = 0; i < mobs.length; i++) {
      const other = mobs[i];
      if (other !== mob && other.health>0 && (other.type === mob.type || (isEquine(mob)&&isEquine(other)&&other.type!=='mule')) && (!isEquine(other)||other.isTamed) && (!isLlama(other)||other.isTamed) && other.inLove > 0 && !other.isBaby && (!other.breedingCooldown || other.breedingCooldown <= 0)) {
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
            // Wiki: breeding frogs produces no baby. One of the pair becomes pregnant and lays frogspawn on water, which
            // hatches into tadpoles; the pair still earns 1-7 experience.
            if (mob.type === 'frog') {
              makeFrogPregnant(mob);
              const frogXpGain = 1 + Math.floor(Math.random() * 7);
              if (this.mobManager.spawnXpOrbs) this.mobManager.spawnXpOrbs(babyPos, frogXpGain);
              else this.entities?.spawnXpOrbs?.(babyPos, frogXpGain);
              this.spawnHeartParticles(babyPos);
              break;
            }
            // Wiki: "Breeding two sniffers now causes a sniffer egg to drop as an item." A sniffer pair
        // therefore produces an egg rather than a baby, which is the only way a sniffer is ever created.
        if (mob.type === 'sniffer') {
          this.entities?.spawnDroppedItem?.(babyPos, SNIFFER_BREEDING.eggItem, false, 1);
          const snifferXpGain = 1 + Math.floor(Math.random() * 7);
          if (this.mobManager.spawnXpOrbs) this.mobManager.spawnXpOrbs(babyPos, snifferXpGain);
          else this.entities?.spawnXpOrbs?.(babyPos, snifferXpGain);
          this.spawnHeartParticles(babyPos);
          break;
        }
        const babyType = (mob.type === 'trader_llama' && other.type === 'trader_llama')
          ? 'llama'
          : (isEquine(mob) && mob.type !== other.type ? 'mule' : mob.type);
        const baby = this.mobManager.spawnMob(babyType, babyPos.x, babyPos.y, babyPos.z);
            if (baby) {
              baby.isBaby = true;
              if(isEquine(mob))inheritHorse(baby,mob,other,this.mobManager);
        // Everything that varies between individuals of a species: genes, variants, coat colours.
        this.inheritBabyTraits(baby, mob, other);
              // Wiki: every breedable mob's baby gets the same 20-minute growth timer.
              startBabyGrowth(baby);
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

  spawnGreenParticles(pos) {
    if (this.mobManager?.spawnParticleBurst) {
      this.mobManager.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0x22c55e, 8);
    }
  }

  tameLlama(mob, player) {
    const randomRoll = Math.floor(Math.random() * 100);
    if ((mob.temper || 0) > randomRoll) {
      mob.isTamed = true;
      mob.owner = player;
      this.spawnHeartParticles(mob.mesh.position);
      if (this.sounds?.playPop) this.sounds.playPop();
    } else {
      mob.temper = Math.min(LLAMA_TEMPER.max, (mob.temper || 0) + LLAMA_TEMPER.perAttempt);
      this.spawnSmokeParticles(mob.mesh.position);
      if (player?.position) {
        player.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8));
      }
    }
    return true;
  }
}

/** Seconds until a sheep next tries to graze: geometric in ticks with p = 1/1000 (adult) or 1/50 (lamb). */
export function sheepGrazeWait(mob, random = Math.random) {
  const ticksMean = mob?.isBaby ? 50 : 1000;
  return -Math.log(1 - random()) * ticksMean / 20;
}
