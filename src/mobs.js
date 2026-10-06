import { createWitherSkeletonModel } from './witherSkeletonModel.js';
import { initializeWitherSkeleton, updateWitherSkeleton, hurtWitherSkeleton, dropWitherSkeletonLoot, updateWitherSkeletonSpawning, updateWolfWitherHunt } from './witherSkeleton.js';
import { updateMobWither } from './witherEffect.js';
import { isSquid, spawnSquid, updateSquid, hurtSquid, dropSquidLoot, updateSquidSpawning, updateSquidPredator } from './squidBehavior.js';
import {createZombifiedPiglinModel} from './zombifiedPiglinModel.js';
import {initializeZombified,isZombifiedPiglin,hurtZombified,dropZombifiedLoot,mountZombified,updateZombified} from './zombifiedPiglin.js';
import { createStriderModel } from './striderModel.js';
import { updateStrider, updateStriderSpawning, updateStriderExposure } from './striderBehavior.js';
import { updateHorseLead, releaseHorseLead } from './horseLead.js';
import { createHorseModel } from './horseModel.js';
import { createPackEquineModel, isPackEquine } from './packEquineModel.js';
import { packEquineStats, hurtPackEquine, dropPackEquineLoot, updateDonkeySpawning } from './packEquine.js';
import { isEquine, randomHorseStats } from './horseBehavior.js';
import { createBlazeModel, animateBlaze } from './blazeModel.js';
import { alertBlazes, setMagmaSize, updateSnowballs } from './netherCombat.js';
import { updateBarterEffects } from './barterItems.js';
import { retaliateHoglins } from './netherMobAI.js';
import { separatePlayerFromMobs } from './mobPlayerCollision.js';
import { piglinTexture, angerPiglins, syncPiglinEquipment } from './piglin.js';
import { PIGLIN_BRUTE_HEALTH, PIGLIN_BRUTE_DIMENSIONS, PIGLIN_BRUTE_DAMAGE, PIGLIN_BRUTE_WEAPON, PIGLIN_BRUTE_DIFFERENCES, PIGLIN_BRUTE_SHARED, PIGLIN_BRUTE_COLORS, isPiglinBrute, piglinBruteHealth, piglinBruteDimensions, piglinBruteDamageFor, piglinBruteBarters, piglinBruteRetreats, piglinBruteDistractedByGold, piglinBrutePursues, makePiglinBrute, piglinBruteDrops, piglinBruteXp } from './piglinBruteBehavior.js';
import * as THREE from 'three';
import { spawnArrow, updateArrows, removeArrow } from './arrows.js';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';

/**
 * Reverse lookup from a block id to its registry name, built on first use by `blockNameAt`.
 *
 * The goat's horn rule is defined against block names, and this is the only place that needs to
 * resolve an id back to one.
 */
const BLOCK_NAMES_BY_ID = new Map();
import { steerGround } from './netherMobAI.js';
import { wanderMob, moveGroundMob, moveFlyingMob, updateHazardEscape } from './mobMotion.js';
import { locomotionFor, updateAmbientLocomotion } from './ambientLocomotion.js';
import { shulkerBulletData, steerShulkerBullet } from './shulkerBullet.js';
import { createWildEndermanState, isProvoked, provoke, tickAnger, gazeProvokes,
  ENDERMAN_ATTACK_DAMAGE, ENDERMAN_ATTACK_REACH, ENDERMAN_ATTACK_COOLDOWN,
  ENDERMAN_CHASE_SPEED, pickTeleportDestination, isValidTeleportDestination } from './endermanBehavior.js';
import { MobLibrary } from './mobLibrary.js';
import { AnimalBehaviors } from './animalBehaviors.js';
import { sheepApplyWool, SHEEP_COLOR_HEX } from './sheepBehavior.js';
import { applyMooshroomVariant, MOOSHROOM_COLORS } from './mooshroomBehavior.js';
import { SALMON_SIZES, rollSalmonSize, salmonBonusDrops } from './salmonBehavior.js';
import { creeperDiscDrop } from './musicDiscs.js';
import { DOLPHIN_HEALTH, DOLPHIN_DIMENSIONS, DOLPHIN_BABY_SCALE, DOLPHIN_MOISTNESS_TICKS, updateDolphinMoistness } from './dolphinBehavior.js';
import { cubeHealth, cubeSide, updateCubeHop, cubeSquashOnLand } from './cubeMobBehavior.js';
import { WOLF_WILD_HEALTH, WOLF_DIMENSIONS, WOLF_DEFAULT_COLLAR } from './wolfBehavior.js';
import { createSpiderModel, poseSpiderLegs } from './spiderModel.js';
import { SPIDER_HEALTH, SPIDER_DIMENSIONS, SPIDER_XP, spiderDrops, angerSpider, updateSpiderAnger, updateSpiderClimbing, spiderWantsTarget, CAVE_SPIDER_HEALTH, CAVE_SPIDER_DIMENSIONS, CAVE_SPIDER_SCALE, applyCaveSpiderPoison, updateSpiderHunt, moveSpider } from './spiderBehavior.js';
import { SILVERFISH_HEALTH, SILVERFISH_DIMENSIONS, SILVERFISH_XP, silverfishDrops, createSilverfishModel, poseSilverfishLegs, alertSilverfish, angerSilverfish, updateSilverfishAnger, updateSilverfishHunt } from './silverfishBehavior.js';
import { ENDERMITE_HEALTH, ENDERMITE_DIMENSIONS, ENDERMITE_XP, endermiteDrops, createEndermiteModel, poseEndermiteLegs, updateEndermiteLifetime, updateEndermiteHunt, updateEndermanEndermiteAggression } from './endermiteBehavior.js';
import { RABBIT_HEALTH, RABBIT_DIMENSIONS, RABBIT_BABY_DIMENSIONS, RABBIT_BABY_SCALE, RABBIT_XP, RABBIT_COATS, RABBIT_COAT_COLORS, RABBIT_PLAYER_AVOID_RANGE, KILLER_BUNNY_TYPE, KILLER_BUNNY_ARMOR, createRabbitModel, poseRabbitHop, applyRabbitCoat, applyRabbitName, isRabbit, isKillerBunny, rollRabbitCoat, rabbitDrops, updateKillerBunnyHunt, onKillerBunnyHurt } from './rabbitBehavior.js';
import { BAT_HEALTH, BAT_DIMENSIONS, batDrops, createBatModel, poseBatWings, updateBatFlight, updateBatDespawn } from './batBehavior.js';
import { FOX_HEALTH, FOX_DIMENSIONS, FOX_BABY_DIMENSIONS, FOX_BABY_SCALE, FOX_COAT_COLORS, FOX_PREY, FOX_POUNCE, FOX_SAFE_FALL_BLOCKS, createFoxModel, poseFoxLegs, applyFoxCoat, rollFoxCoat, rollFoxHeldItem, foxDrops, foxDamageFor, foxHasTotem, consumeFoxTotem, foxTrusts, foxShouldFlee, foxCanSleep, startFoxPounce, updateFoxPounce, lightAt as foxLightAt } from './foxBehavior.js';
import { BEE_HEALTH, BEE_DIMENSIONS, BEE_BABY_DIMENSIONS, BEE_BABY_SCALE, BEE_COLORS, BEE_XP, BEE_HIVE_RANGE, createBeeModel, poseBee, beeDrops, beeSting, beeIsAngry, angerBees, updateBeeAnger, updateBeeStingerless, updateBeeWater, updateBeeNectar, isBee, isBeeFlower } from './beeBehavior.js';
import { GOAT_HEALTH, GOAT_DIMENSIONS, GOAT_BABY_DIMENSIONS, GOAT_BABY_SCALE, GOAT_JUMP_DIMENSIONS, GOAT_COLORS, GOAT_RAM, GOAT_FOLLOW_RANGE, GOAT_FALL_DAMAGE_REDUCTION, createGoatModel, poseGoat, poseGoatLegs, isGoat, goatDrops, goatXp, goatRamDamage, goatRamKnockback, rollGoatRamCooldown, rollGoatJumpCooldown, rollScreamingGoat, inheritScreamingGoat, rollGoatHorns, rollGoatHornVariant, goatHasHorn, snapGoatHorn, blockSnapsGoatHorn, isValidGoatTarget, isUnmovingTarget, startGoatRam, updateGoatRam, endGoatRam, startGoatJump, landGoatJump } from './goatBehavior.js';
import { LLAMA_HEALTH, LLAMA_DIMENSIONS, LLAMA_BABY_DIMENSIONS, LLAMA_BABY_SCALE, LLAMA_VARIANTS, LLAMA_STRENGTH, LLAMA_TEMPER, LLAMA_FOOD, LLAMA_SPIT, llamaHealthFor, llamaSlotsFor, llamaSpitDamage, rollLlamaStrength, rollLlamaVariant, inheritLlamaVariant, inheritLlamaStrength, llamaWantsToSpit, llamaCoatColors, createLlamaModel, applyLlamaCoat, applyLlamaEquipment, poseLlamaLegs, spawnLlamaSpit, updateLlamaSpit, removeLlamaSpit } from './llamaBehavior.js';
import { HAPPY_GHAST_HEALTH, HAPPY_GHAST_DIMENSIONS, GHASTLING_DIMENSIONS, HAPPY_GHAST_SPEED, HAPPY_GHAST_RIDDEN_SPEED, HAPPY_GHAST_SEATS, HAPPY_GHAST_SEAT_ORDER, HAPPY_GHAST_ROAM, GHASTLING_GROWTH_SECONDS, GHASTLING_SNOWBALL_SPEEDUP, GHASTLING_BEDROCK_SNOWBALLS, GHASTLING_FOLLOW_RANGE, GHASTLING_FOLLOW_SPEED_BOOST, GHASTLING_STOP_DISTANCE, GHASTLING_FOLLOWABLE, GHASTLING_NEVER_FOLLOWS, HAPPY_GHAST_BULKY_CARGO, HAPPY_GHAST_STANDING_FACING, DRIED_GHAST_REHYDRATION, HAPPY_GHAST_COLORS, HAPPY_GHAST_REHOME_EVENTS, isHappyGhast, isGhastling, happyGhastDimensions, happyGhastRoamRadius, setHappyGhastHome, onHappyGhastEvent, clampToHome, equipHappyGhastHarness, removeHappyGhastHarness, mountHappyGhast, dismountHappyGhast, happyGhastSeatOf, happyGhastIsStationary, happyGhastStationaryFacing, attachHappyGhastCargo, releaseHappyGhastCargo, temptHappyGhast, endHappyGhastTemptation, feedGhastlingSnowball, updateGhastlingGrowth, ghastlingFollows, findGhastlingTarget, ghastlingShouldStop, rehydrateDriedGhast, happyGhastWanderTarget, steerHappyGhast, happyGhastDrops, happyGhastXp, createHappyGhastModel, poseHappyGhast } from './happyGhastBehavior.js';
import { COPPER_GOLEM_HEALTH, COPPER_GOLEM_DIMENSIONS, COPPER_GOLEM_SPEED, COPPER_OXIDATION_STAGES, COPPER_OXIDATION_SECONDS, COPPER_GOLEM_COLORS, isCopperGolem, copperGolemDimensions, copperGolemCanPlaceIn, copperGolemCanTakeFrom, copperGolemCanStoreIn, findCopperGolemSource, findCopperGolemDestination, copperGolemTake, copperGolemPlace, updateCopperGolemOxidation, waxCopperGolem, scrapeCopperGolem, reanimateCopperGolemStatue, shearCopperGolem, giveCopperGolemPoppy, copperGolemDrops, copperGolemXp, copperGolemColor, createCopperGolemModel, poseCopperGolem } from './copperGolemBehavior.js';
import { CAMEL_HUSK_HEALTH, CAMEL_HUSK_DIMENSIONS, CAMEL_HUSK_SITTING_DIMENSIONS, CAMEL_HUSK_STAND_CLEARANCE, CAMEL_HUSK_SPEED, CAMEL_HUSK_CAMEL_SPEED, CAMEL_HUSK_UNDEAD_TRAITS, CAMEL_HUSK_JOCKEY, CAMEL_HUSK_SPAWN, CAMEL_HUSK_EQUIPMENT, CAMEL_HUSK_DROPS, CAMEL_HUSK_COLORS, isCamelHusk, camelHuskDimensions, camelHuskBurnsInDaylight, camelHuskCanStand, camelHuskSit, camelHuskStand, updateCamelHuskSitting, camelHuskIsHostile, separateCamelHuskRiders, mountCamelHuskJockey, camelHuskDrops, camelHuskXp, equipCamelHuskSaddle, shearCamelHuskSaddle, createCamelHuskModel, poseCamelHusk } from './camelHuskBehavior.js';
import { GIANT_HEALTH, GIANT_DIMENSIONS, ZOMBIE_DIMENSIONS, GIANT_SCALE, GIANT_DAMAGE, GIANT_UNDEAD_PROPERTIES, GIANT_DROWNING, GIANT_FACING_YAW, GIANT_HAS_AI, GIANT_COLORS, isGiant, giantDimensions, giantDamageFor, giantBurnsInDaylight, giantFacing, giantMoves, giantReactionToDamage, giantAcceptsEffect, giantPotionOutcome, giantScaresArmadillos, giantUnderwaterOutcome, giantDrops, giantXp, giantAttack, createGiantModel, poseGiant } from './giantBehavior.js';
import { PUFFERFISH_HEALTH, TROPICAL_FISH_HEALTH, PUFFERFISH_DIMENSIONS, TROPICAL_FISH_DIMENSIONS, FISH_SPEED, PUFFERFISH_CONTACT, PUFFERFISH_POISON, PUFFERFISH_TRIGGER, AQUATIC_TYPES, TROPICAL_FISH_VARIANTS, TROPICAL_FISH_SHAPES, TROPICAL_FISH_COLORS, TROPICAL_FISH_PATTERNS, FISH_COLORS, isPufferfish, isTropicalFish, isSmallFish, pufferfishDimensions, pufferfishStage, pufferfishDamageFor, pufferfishPoisonFor, pufferfishReactsTo, findPufferfishThreat, updatePufferfishPuff, pufferfishContact, rollTropicalFishVariant, tropicalFishVariantName, fishDrops, fishXp, createPufferfishModel, posePufferfish, createTropicalFishModel, poseTropicalFish } from './fishBehavior.js';
import { UNDEAD_HORSE_HEALTH, UNDEAD_HORSE_DIMENSIONS, UNDEAD_HORSE_BABY_DIMENSIONS, UNDEAD_HORSE_BABY_SCALE, UNDEAD_HORSE_SPEED, SKELETON_TRAP, UNDEAD_HORSE_SUN, UNDEAD_HORSE_TRAITS, UNDEAD_HORSE_TRANSPORT, UNDEAD_HORSE_EQUIPMENT, UNDEAD_HORSE_COLORS, isUndeadHorse, isSkeletonHorse, isZombieHorse, undeadHorseHealth, undeadHorseDimensions, undeadHorseBurnsInDaylight, undeadHorseIsHostile, undeadHorseSeparateFromRider, equipUndeadHorse, shearUndeadHorse, skeletonTrapReady, springSkeletonTrap, zombieHorseWantsRider, undeadHorseCanBreed, undeadHorseXp, createUndeadHorseModel, poseUndeadHorse } from './undeadHorseBehavior.js';
import { ILLUSIONER_HEALTH, ILLUSIONER_DIMENSIONS, ILLUSIONER_SPEED, ILLUSIONER_DAMAGE, ILLUSIONER_SHOOT_SECONDS, SKELETON_SHOOT_SECONDS, ILLUSIONER_TARGET_BOX, ILLUSIONER_SEES_THROUGH_WALLS, ILLUSIONER_BLINDNESS, ILLUSIONER_INVISIBILITY, ILLUSIONER_DUPLICATES, ILLUSIONER_SPELL_SETTLE_SECONDS, ILLUSIONER_STRAFE, ILLUSIONER_COLORS, isIllusioner, illusionerDimensions, illusionerDamageRange, rollIllusionerDamage, isIllusionerTarget, findIllusionerTarget, illusionerIsInvisible, castIllusionerInvisibility, spawnIllusionerDuplicates, updateIllusionerDuplicates, onIllusionerHurt, castIllusionerBlindness, switchIllusionerTarget, updateIllusionerCooldowns, illusionerMovement, illusionerCanShoot, illusionerShoot, illusionerDrops, illusionerXp, createIllusionerModel, poseIllusioner } from './illusionerBehavior.js';
import { SNOW_GOLEM_HEALTH, SNOW_GOLEM_DIMENSIONS, SNOW_GOLEM_SPEED, SNOW_GOLEM_RANGE, SNOW_GOLEM_THROW_SECONDS, SNOWBALL_DAMAGE, SNOW_GOLEM_HEAT, SNOW_GOLEM_HOT_BIOMES, SNOW_GOLEM_TRAITS, SNOW_GOLEM_TRAIL, SNOW_GOLEM_SHEAR_DROP, SNOW_GOLEM_PUMPKIN, SNOW_GOLEM_COLORS, isSnowGolem, snowGolemDimensions, isHotBiome, snowGolemTakesHeatDamage, updateSnowGolemHeat, snowballDamageFor, snowGolemTargets, SNOW_GOLEM_HOSTILES, SNOW_GOLEM_NEVER_TARGETS, findSnowGolemTarget, snowGolemThrow, updateSnowGolemThrow, snowGolemTrailAt, shearSnowGolem, snowGolemXp, createSnowGolemModel, poseSnowGolem } from './snowGolemBehavior.js';
import { CREAKING_HEALTH, CREAKING_DIMENSIONS, CREAKING_SPEED, CREAKING_DAMAGE, CREAKING_VIEW, CREAKING_ALERT_RANGE, CREAKING_DETECT_RANGE, CREAKING_HEART_RADIUS, CREAKING_SOFTLOCK_SECONDS, CREAKING_DESPAWN_AT_DAY, CREAKING_FLEEING_MOBS, CREAKING_TERROR_RANGE, CREAKING_IGNORED_BLOCKS, CREAKING_FIRE_RESISTANT, CREAKING_DROPS, CREAKING_COLORS, isCreaking, creakingDimensions, creakingDamageFor, creakingInView, creakingFrozenBy, creakingIsInvulnerable, creakingIsLinked, updateCreakingAlert, creakingCanMove, creakingAttack, updateCreakingHeartLink, creakingClampToHeart, updateCreakingDespawn, creakingIsNight, mobFleesFromCreaking, createCreakingModel, poseCreaking } from './creakingBehavior.js';
import { CAMEL_HEALTH, CAMEL_DIMENSIONS, CAMEL_SITTING_DIMENSIONS, CAMEL_BABY_DIMENSIONS, CAMEL_BABY_SCALE, CAMEL_STEP_HEIGHT, CAMEL_FALL, CAMEL_DASH, CAMEL_SPEED, CAMEL_SIT, CAMEL_STAND_CLEARANCE, CAMEL_CACTUS_HEAL, CAMEL_REGEN_CHANCE, CAMEL_BABY_GROWTH_SECONDS, CAMEL_CACTUS_GROWTH_SECONDS, CAMEL_FOLLOW_RANGE, CAMEL_BREEDING_FOOD, CAMEL_SEATS, CAMEL_EQUIPMENT, CAMEL_COLORS, isCamel, camelDimensions, camelCanBeRidden, camelCanBeControlled, camelCanSeat, equipCamelSaddle, removeCamelSaddle, camelCanStand, camelSit, camelStand, updateCamelSitting, rollCamelStandDelay, camelDash, updateCamelDash, camelFallDamage, updateCamelRegen, feedCamelCactus, updateCamelGrowth, accelerateCamelGrowth, camelFollows, isCamelBreedingFood, camelDrops, camelXp, camelBreedingXp, createCamelModel, poseCamel } from './camelBehavior.js';
import { WANDERING_TRADER_HEALTH, WANDERING_TRADER_DIMENSIONS, WANDERING_TRADER_SPEED, WANDERING_TRADER_DESPAWN_SECONDS, WANDERING_TRADER_WANDER_RANGE, WANDERING_TRADER_SPAWN_RANGE, WANDERING_TRADER_LLAMAS, WANDERING_TRADER_INVISIBILITY, WANDERING_TRADER_AVOIDED, WANDERING_TRADER_AVOID_RANGE, WANDERING_TRADER_DROP_CHANCE, WANDERING_TRADER_DROP_LOOTING_BONUS, WANDERING_TRADER_COLORS, TRADES, TRADE_LAYOUT, isWanderingTrader, wanderingTraderHasBabyForm, isResolvableTradeItem, availableTrades, rollTrades, tradeLocked, useTrade, usableTradeCount, updateTraderDespawn, traderWantsInvisibility, updateTraderInvisibility, findTraderHazard, wanderingTraderDrops, wanderingTraderXp, spawnTraderWithLlamas, traderLlamaRetaliates, createWanderingTraderModel, poseWanderingTrader } from './wanderingTraderBehavior.js';
import { ALLAY_HEALTH, ALLAY_DIMENSIONS, ALLAY_SPEED, ALLAY_FALL_IMMUNE, ALLAY_FOLLOW_RANGE, ALLAY_SEEK_RANGE, ALLAY_PICKUP_RANGE, ALLAY_DROP_RANGE, ALLAY_DELIVER_DELAY, ALLAY_INVENTORY_SLOTS, ALLAY_STACK_SIZE, ALLAY_NOTE_FOCUS, ALLAY_DANCE_RANGE, ALLAY_DUPLICATION, ALLAY_REGEN_PER_SECOND, ALLAY_OWNER_IMMUNE, ALLAY_COLORS, isAllay, allayHasBabyForm, allayHeldItem, giveAllayItem, takeAllayItem, allaySeeksItem, allayCanPickUp, allayDeliveryTarget, hearNoteBlock, allayDances, duplicateAllay, findSeekableItem, updateAllayJob, updateAllayRegen, allayRefusesDamage, allayDrops, allayXp, createAllayModel, poseAllay } from './allayBehavior.js';
import { SNIFFER_HEALTH, SNIFFER_DIMENSIONS, SNIFFLET_DIMENSIONS, SNIFFLET_SCALE, SNIFFER_SPEED, SNIFFER_HEAD_OFFSET, SNIFFER_DIG_MEMORY, SNIFFER_SEARCH_COOLDOWN, SNIFFER_DIG, SNIFFER_DIG_DROPS, SNIFFER_DIGGABLE_NAMES, SNIFFER_BREEDING_FOOD, SNIFFLET_GROWTH_SECONDS, SNIFFLET_FEED_ACCELERATION, SNIFFER_EGG_HATCH, SNIFFER_BREEDING, SNIFFER_COLORS, diggableBlockIds, isSniffer, isSnifflet, snifferDimensions, snifferHeadPosition, isDiggableBlock, snifferDigRefusal, wasDugRecently, rememberDig, findDiggableSpot, updateSnifferDig, isSnifferBreedingFood, updateSniffletGrowth, accelerateSniffletGrowth, snifferEggHatchSeconds, snifferDrops, snifferXp, snifferBreedingXp, createSnifferModel, poseSniffer } from './snifferBehavior.js';
import { BREEZE_HEALTH, BREEZE_DIMENSIONS, WIND_CHARGE_DAMAGE, BREEZE_JUMP, BREEZE_ATTACK, BREEZE_JUMP_COOLDOWN, WIND_CHARGE_SPEED, WIND_CHARGE_BURST, BREEZE_TRAITS, BREEZE_NON_RETALIATION, BREEZE_PREFERRED_PREY, BREEZE_ROD_DROP, BREEZE_ALWAYS_VISIBLE, BREEZE_COLORS, isBreeze, windChargeDamageFor, rollBreezeJumpDelay, breezeJumpVelocity, canBreezeLeap, findBreezeTarget, breezeRetaliates, shouldDeflect, deflectVelocity, updateBreezeLeap, fireWindCharge, windChargeBurst, breezeDrops, breezeXp, createBreezeModel, poseBreeze } from './breezeBehavior.js';
import { PARCHED_ATTACK_COOLDOWN, PARCHED_WEAKNESS_SECONDS, PARCHED_WEAKNESS_IMMUNE, PARCHED_CONVERSIONS, PARCHED_PICKUP, PARCHED_EQUIPPED_IS_PERSISTENT, VARIANT_HEALTH, VARIANT_DIMENSIONS, HUSK_BABY_DIMENSIONS, HUSK_BABY_SCALE, HUSK_ARMOR, HUSK_SPEED, HUSK_HUNGER_SECONDS, HUSK_DROWNING, STRAY_SLOWNESS_SECONDS, BOGGED_POISON_SECONDS, BOGGED_ATTACK_COOLDOWN, BOGGED_SHEAR_DROPS, VARIANT_UNDEAD_TRAITS, VARIANT_ATTACK_EFFECT, VARIANT_TINTS, isUndeadVariant, variantHealth, variantDimensions, variantBurnsInDaylight, variantAvoidsWater, variantAttackEffect, updateHuskDrowning, boggedAttackCooldown, shearBogged, variantBonusDrops, variantXp, huskDamageFor, variantTint, variantProfile } from './undeadVariants.js';
import { ARMADILLO_HEALTH, ARMADILLO_DIMENSIONS, ARMADILLO_BABY_DIMENSIONS, ARMADILLO_BABY_SCALE, ARMADILLO_SPEED, ARMADILLO_GROWTH_SECONDS, ARMADILLO_COLORS, ARMADILLO_BREEDING_FOOD, ARMADILLO_SPIDER_TYPES, ARMADILLO_SPIDER_FEAR_RANGE, ARMADILLO_UNDEAD, isArmadillo, armadilloDamageReduction, canRollUp, isArmadilloThreat, findArmadilloThreat, updateArmadilloRoll, isRolledUp, onArmadilloHurt, armadilloDimensions, updateArmadilloScutes, rollScuteDelay, brushArmadillo, spidersFleeFrom, repelsMob, updateArmadilloGrowth, accelerateArmadilloGrowth, armadilloFollows, isArmadilloBreedingFood, armadilloDrops, armadilloXp, armadilloBreedingXp, poseArmadillo } from './armadilloBehavior.js';
import { applyPandaColors, PANDA_HEALTH, PANDA_DIMENSIONS, PANDA_BABY_DIMENSIONS, PANDA_BABY_SCALE, PANDA_DAMAGE, PANDA_SPEED, PANDA_GENES, PANDA_DOMINANT_GENES, PANDA_RECESSIVE_GENES, PANDA_PERSONALITY_CHANCE, PANDA_MUTATION_WEIGHTS, PANDA_MUTATION_CHANCE, PANDA_SNEEZE_SLIMEBALL_CHANCE, PANDA_BREEDING_BAMBOO, isPanda, pandaPersonality, rollMutatedGene, rollPandaGenes, breedPandaGenes, applyPandaPersonality, pandaDamageFor, pandaDimensions, pandaStance, aggressivePandaKeepsHunting, alertAggressivePandas, updatePandaSneeze, pandaCanBreed, pandaDrops, pandaXp, pandaFollowsBamboo, pandaColors, posePanda } from './pandaBehavior.js';
import { POLAR_BEAR_HEALTH, POLAR_BEAR_DIMENSIONS, POLAR_BEAR_BABY_DIMENSIONS, POLAR_BEAR_BABY_SCALE, POLAR_BEAR_DAMAGE, POLAR_BEAR_KNOCKBACK_RESISTANCE, POLAR_BEAR_SPEED, POLAR_BEAR_GROWTH_SECONDS, POLAR_BEAR_PREY, isPolarBear, polarBearDamageFor, polarBearDimensions, polarBearStance, cubsNear, defendCub, provokeNearbyAdults, onPolarBearHurt, findPolarBearTarget, updatePolarBearGrowth, polarBearDrops, polarBearXp, canBreedPolarBear, posePolarBear, startPolarBearMaul, updatePolarBearMaul } from './polarBearBehavior.js';
import { PHANTOM_HEALTH, PHANTOM_DIMENSIONS, PHANTOM_DAMAGE, PHANTOM_SWOOP, PHANTOM_CAT_AVOID_RANGE, PHANTOM_TARGET_RANGE, isPhantom, phantomDamageFor, rollPhantomSwoopDelay, phantomAnchorFor, phantomCirclePosition, phantomBurnsInSunlight, findPhantomTarget, isSwooping, startPhantomSwoop, updatePhantomFlight, onPhantomHurt, phantomDrops, phantomXp, createPhantomWings, posePhantom } from './phantomBehavior.js';
import { PARROT_HEALTH, PARROT_DIMENSIONS, PARROT_VARIANTS, PARROT_COLORS, PARROT_TAMING_FOODS, PARROT_TAME_CHANCE, PARROT_FOLLOW_RANGE, PARROT_IMITATE_RANGE, PARROT_DANCE_RANGE, PARROT_IMITATED_MOBS, PARROT_FLIGHT, PARROT_FLY_HEIGHT, isParrot, rollParrotVariant, parrotVariantName, parrotColors, isParrotTamingFood, isParrotLethalFood, rollParrotTaming, isPerched, perchOnShoulder, dismountShoulder, shouldDismountForPlayerState, findImitateTarget, canDance, parrotDrops, parrotXp, updateParrotFlight, createParrotModel, applyParrotVariant, poseParrot } from './parrotBehavior.js';
import { TADPOLE_HEALTH, TADPOLE_DIMENSIONS, TADPOLE_SPEED, TADPOLE_DRY_SECONDS, TADPOLE_GROWTH_SECONDS, TADPOLE_HATCH_GROUP, TADPOLE_COLORS, TADPOLE_FOLLOW_RANGE, TADPOLE_WATER_SEARCH, isTadpole, tadpoleVariantForBiome, rollTadpoleHatchCount, updateTadpoleDryness, updateTadpoleGrowth, accelerateTadpoleGrowth, createTadpoleModel, poseTadpole, tadpoleDrops, tadpoleXp } from './tadpoleBehavior.js';
import { FROG_HEALTH, FROG_DIMENSIONS, FROG_JUMP, FROG_SPEED, FROG_FOLLOW_RANGE, FROG_TONGUE, FROG_COLORS, FROG_VARIANTS, FROG_BREEDING_FOOD, isFrog, frogVariantForBiome, froglightForVariant, frogCanEat, frogEatingDrops, frogDrops, frogXp, startFrogTongue, updateFrogTongue, eatFrogPrey, createFrogModel, applyFrogVariant, poseFrog, startFrogJump } from './frogBehavior.js';
import { TURTLE_HEALTH, TURTLE_DIMENSIONS, TURTLE_BABY_DIMENSIONS, TURTLE_BABY_SCALE, TURTLE_EGG, TURTLE_EGG_CLUSTER, TURTLE_DIG_SECONDS, TURTLE_BREED_COOLDOWN_SECONDS, isTurtle, turtleDimensions, turtleDrops, turtleXp, turtleMaturationDrops, findWaterNear, isSandBlock, setTurtleHome, applyTurtlePregnancy, tryLayTurtleEggs, updateTurtleMovement, createTurtleModel, poseTurtle } from './turtleBehavior.js';
import { HostileMobBehaviors } from './hostileMobBehaviors.js';
import { initVillagerEconomy, updateVillagerWorkstation, updateZombieVillagerCuring } from './villagerEconomy.js';

// Helper to create box with UV mapping on a specific texture sheet
function createBoxWithUV(w, h, d, u, v, texW = 64, texH = 64, pw, ph, pd) {  const geo = new THREE.BoxGeometry(w, h, d);
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

/**
 * A box that shows DIFFERENT parts of one sheet on different faces.
 *
 * `faces` is three.js's own face order -- +X, -X, +Y, -Y, +Z, -Z -- and each entry is either a material or
 * `[material, { u, v, w, h }]` giving the atlas rectangle to sample, in texture pixels.
 *
 * This exists because a single material cannot put a picture on one specific face of a cube, and a box that
 * samples a whole 16x16 block tile on every face shows the same picture six times. Both mistakes were live:
 * the snow golem's pumpkin was a plain orange box with an unrelated dark rectangle stuck on the front, so it had
 * no carved face at all.
 */
export function createTexturedBox(w, h, d, faces, texW = 64, texH = 64) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uvs = geo.attributes.uv;
  const materials = [];
  for (let face = 0; face < 6; face++) {
    const spec = faces[face];
    const material = Array.isArray(spec) ? spec[0] : spec;
    // With no explicit rectangle a face still has to be mapped somewhere sane; the whole sheet would smear the
    // atlas across it, so an unmapped face falls back to the full 0..1 range of its own material, which is what
    // an ordinary single-material box does.
    const rect = Array.isArray(spec) && spec[1] ? spec[1] : null;
    materials.push(material);
    if (!rect) continue;
    const u0 = rect.u / texW;
    const u1 = (rect.u + rect.w) / texW;
    const v1 = 1 - rect.v / texH;
    const v0 = 1 - (rect.v + rect.h) / texH;
    const base = face * 4;
    uvs.setXY(base + 0, u0, v1);
    uvs.setXY(base + 1, u1, v1);
    uvs.setXY(base + 2, u0, v0);
    uvs.setXY(base + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return { geometry: geo, materials };
}

/**
 * Rewrite a base zombie or skeleton into one of its variants.
 *
 * The base spawners build the geometry and the shared undead state; this applies everything that makes
 * a husk, stray or bogged different. Centralised deliberately: the three variants differ from their base
 * mob in the same five ways (identity, health, hitbox, tint, traits), and spreading that across three
 * near-copies is how they drift apart.
 */
/** Wiki: the zombie family, which the husk belongs to. */
export const ZOMBIE_FAMILY = ['zombie', 'husk', 'zombie_villager', 'drowned'];

/** Wiki: the skeleton family, which the stray and bogged belong to. */
export const SKELETON_FAMILY = ['skeleton', 'stray', 'bogged', 'parched', 'wither_skeleton'];

/** True for any member of the zombie family. */
export function inZombieFamily(type) {
  return ZOMBIE_FAMILY.includes(type);
}

/** True for any member of the skeleton family. */
export function inSkeletonFamily(type) {
  return SKELETON_FAMILY.includes(type);
}

/**
 * True for a llama OR a trader llama.
 *
 * A trader llama is a llama variant, so every llama code path must accept it. Matching only the literal
 * 'llama' broke the trader llama's update branch the moment its type was renamed.
 */
/**
 * Blocks that do not break a creaking's gaze.
 *
 * Wiki: the "visual box block obstructs the view", so only blocks that actually block sight count.
 * Glass, ice, water and every non-colliding decoration are excluded.
 */
const CREAKING_VIEW_TRANSPARENT = new Set([
  BLOCKS.GLASS, BLOCKS.ICE, BLOCKS.WATER, BLOCKS.LAVA,
  BLOCKS.GLASS_PANE, BLOCKS.TORCH, BLOCKS.RAIL, BLOCKS.LEVER, BLOCKS.SNOW
].filter(id => id !== undefined));

function isLlamaLike(mob) {
  return mob?.type === 'llama' || mob?.type === 'trader_llama';
}

/**
 * Point a material at a texture that may not have decoded yet.
 *
 * Every skin in this file is fetched with `loadTexture`, which is asynchronous, so a material built during page
 * load is built before its image exists. Assigning `map` up front is not enough: three renders a mapped material
 * whose image is still missing as BLACK, which looks exactly like a broken model. So the flat `fallbackColor` is
 * kept until the bitmap actually arrives, and the map is adopted at that moment.
 *
 * The adoption must NOT depend on the mob ticking. The Mob Inspector spawns its mob and then sits PAUSED, so a
 * "finish this on the next update" approach never runs there -- which is exactly how the snow golem stayed a flat
 * orange box in the Inspector while looking right in a page that did tick.
 *
 * The rule is simply "is there a real bitmap behind this texture". A loaded texture has an image with a
 * non-zero width; one that is still in flight has no image, or an `<img>` that has not decoded yet. Only the
 * second case needs the flat colour and a deferred binding, and it is the only case where binding now would draw
 * black.
 */
export function adoptTexture(material, texture, fallbackColor = 0xffffff) {
  // Any real texture will do. An earlier guard required `assetPath`, which is only set by `loadTexture`, so a
  // generated or hand-built texture was silently ignored and its material left without a map.
  if (!material || texture?.isTexture !== true || material.map === texture) return material;
  const adopt = () => {
    if (material.map === texture) return;
    material.map = texture;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
  };
  // Is there a live `<img>` that is merely still decoding?
  //
  // Only that case needs the flat colour and a deferred binding: binding now would draw BLACK. Everything else --
  // a texture that already has its bitmap, and a texture with no image at all (a headless build, where there is
  // no renderer to draw black either) -- can be bound straight away. Treating "no image" as "waiting" was wrong
  // and left mobs looking unskinned in any non-browser build.
  const imageInFlight = Boolean(texture.image)
    && typeof texture.image.addEventListener === 'function'
    && !texture.image.width;
  if (!imageInFlight) {
    adopt();
    return material;
  }
  // Keep the flat colour until the bitmap is really there.
  material.color.setHex(fallbackColor);
  // Bind as soon as the bitmap exists, by as many routes as are available, because none of them may be relied on
  // alone: the loader's readiness hook (what actually fires in the browser), the image's own event, and a
  // per-frame poll from `update` for a browser that fires neither.
  MobManager.onTextureReady(texture, adopt);
  try { texture.image?.addEventListener?.('load', adopt); } catch { /* not an event target */ }
  deferredSkins.push({ material, texture, adopt });
  return material;
}

/**
 * Bindings waiting for their bitmap.
 *
 * The image listener above is the primary mechanism, because it works even when the mob never ticks. This list is
 * the safety net for a browser that fires neither event, and it empties itself as soon as everything has decoded,
 * so the steady-state cost is one `length` check per frame.
 */
const deferredSkins = [];

/** Finish any skin binding whose texture has now decoded. Called once per frame from `update`. */
export function syncDeferredSkins() {
  if (deferredSkins.length === 0) return;
  for (let i = deferredSkins.length - 1; i >= 0; i--) {
    const binding = deferredSkins[i];
    // Readiness is a non-zero width, not the presence of an image object: three's loader creates the `<img>`
    // immediately, so an object that merely exists is still undecoded.
    if (!binding.texture.image?.width) continue;
    binding.adopt();
    deferredSkins.splice(i, 1);
  }
}

/**
 * Where each variant's ORIGINAL vanilla skin is served from, if it has one.
 * These paths are the contract between `scripts/mob-visual/fetch-assets.mjs` and the spawners: the fetch script
 * writes them and the spawner compares against them to decide whether a skin is the real one (leave the model
 * alone) or a generated stand-in (apply the tint). Keeping the string in one place stops the two drifting.
 */
const HUSK_SKIN_PATH = '/assets/entity/zombie/husk.png';
const STRAY_SKIN_PATH = '/assets/entity/skeleton/stray.png';
const BOGGED_SKIN_PATH = '/assets/entity/skeleton/bogged.png';
const SNOW_GOLEM_SKIN_PATH = '/assets/entity/snow_golem.png';
const CARVED_PUMPKIN_PATH = '/assets/block/carved_pumpkin.png';
const PUMPKIN_SIDE_PATH = '/assets/block/pumpkin_side.png';
const PUMPKIN_TOP_PATH = '/assets/block/pumpkin_top.png';

function applyVariantIdentity(mob, variant, options = {}) {
  if (!mob || !variantHealth(variant)) return mob;
  mob.type = variant;
  mob.name = variant.charAt(0).toUpperCase() + variant.slice(1);
  mob.variant = variant;
  // Wiki: husk 20 HP, stray 20, bogged 16.
  mob.health = variantHealth(variant);
  mob.maxHealth = variantHealth(variant);
  // Wiki: the husk has a natural armour rating of 2.
  if (variant === 'husk') mob.armor = HUSK_ARMOR;
  const dims = variantDimensions(variant, !!options.isBaby);
  mob.width = dims.width;
  mob.height = dims.height;
  if (variant === 'husk') {
    mob.isBaby = !!options.isBaby;
    mob.speed = options.isBaby ? HUSK_SPEED.baby : HUSK_SPEED.adult;
    if (options.isBaby) mob.mesh?.scale?.setScalar?.(HUSK_BABY_SCALE);
  }
  // The shared undead traits, so a variant is a threat to an armadillo like any other undead mob.
  Object.assign(mob, VARIANT_UNDEAD_TRAITS);
  // Wiki: the husk is immune to burning in sunlight; the stray and bogged are not.
  mob.burnsInDaylight = variantBurnsInDaylight(variant);
  // Initialised to false rather than left undefined: 'is it on fire?' must be answerable for a husk,
  // which never burns, exactly as it is for a zombie that simply has not caught fire yet.
  mob.isBurning = false;
  mob.burnTimer = 0;
  // Wiki: a husk avoids water; a stray and bogged walk into it.
  mob.avoidsWater = variantAvoidsWater(variant);
  // The attack effect, which is the reason each variant exists rather than being a recolour.
  mob.attackEffect = VARIANT_ATTACK_EFFECT[variant]?.effect ?? null;
  mob.huskSubmergedSeconds = 0;
  mob.isSheared = false;
  // Tint every material so the variant is visually distinct from its base mob.
  //
  // This is only correct when the variant has NO original skin and is instead a generated tint of its relative.
  // When the real vanilla skin is present the recolour must be SKIPPED: setting one colour on every material
  // flattens the entire model -- clothing, boots and any equipped item -- into a single hue, which is exactly
  // what made the husk read as "a browner zombie" instead of a husk. Its skin already carries the husk's
  // desiccated detail and torn clothing.
  const tint = variantTint(variant);
  if (tint !== null && !mob.hasOriginalSkin) {
    mob.mesh?.traverse?.((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const material of materials) {
        if (material?.color) material.color.setHex(tint);
      }
    });
  }
  return mob;
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
      spider: this.createSpiderTexture(),
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

    // Derived skins, built AFTER the literal above is assigned.
    //
    // This ordering is the whole point. `this.textures` only comes into existence once the entire literal has
    // finished evaluating, so a variant built INSIDE it reads `this.textures` as undefined, gets no base at all,
    // and ends up with a texture that has no image -- which renders as a SOLID BLACK mob. The husk, stray and
    // bogged were all built that way and were all black in the Inspector.
    //
    // Wiki: a husk is a desert zombie, a stray is a snow skeleton and a bogged is a mushroom-covered one.
    //
    // Where an ORIGINAL vanilla skin exists it is used instead of tinting a relative. A husk has its own skin
    // texture with its own desiccated detail and torn clothing; recolouring a zombie made the whole model --
    // clothing and equipment included -- one flat hue, which is exactly what was wrong with it. The tint stays
    // only as the fallback for a checkout with no downloaded assets.
    this.textures.husk = this.loadTexture(HUSK_SKIN_PATH,
      () => this.createVariantTexture('zombie', VARIANT_TINTS.husk));
    this.textures.stray = this.loadTexture(STRAY_SKIN_PATH,
      () => this.createVariantTexture('skeleton', VARIANT_TINTS.stray));
    this.textures.bogged = this.loadTexture(BOGGED_SKIN_PATH,
      () => this.createVariantTexture('skeleton', VARIANT_TINTS.bogged));

    // The snow golem's own skin, and the carved-pumpkin block faces for its head. Loaded after the literal for
    // the same reason as the variants above.
    this.textures.snow_golem = this.loadTexture(SNOW_GOLEM_SKIN_PATH);
    this.textures.carved_pumpkin = this.loadTexture(CARVED_PUMPKIN_PATH);
    this.textures.pumpkin_side = this.loadTexture(PUMPKIN_SIDE_PATH);
    this.textures.pumpkin_top = this.loadTexture(PUMPKIN_TOP_PATH);

    this.animalBehaviors = new AnimalBehaviors(this, world, sounds, entities);
    this.hostileBehaviors = new HostileMobBehaviors(this, world, sounds, entities);
  }

  /**
   * Remove one mob from the world, with no death, no loot and no XP.
   *
   * This is what natural despawning calls. The engine had no such method: `wanderingTraderBehavior`
   * already called `this.removeMob?.(mob)` behind an optional-chain, so a wandering trader that timed
   * out was never actually removed -- the optional call silently did nothing. Every other removal
   * path in the codebase open-codes the scene teardown, which is why there were five subtly different
   * versions of it.
   *
   * The teardown mirrors `clearMobs` for a single mob: owned textures, the squid's per-instance
   * materials, the laser and leash lines, the glow outline, then the mesh and its geometries. Debug
   * labels are dropped through `removeDebugLabel`, which keeps its own bookkeeping honest.
   *
   * @param {object} mob
   * @param {string} [reason] recorded on the mob as `despawnReason`, for telemetry and tests
   * @returns {boolean} whether the mob was present and has been removed
   */
  removeMob(mob, reason = 'removed') {
    if (!mob) return false;
    const index = this.mobs.indexOf(mob);
    if (index === -1) return false;

    for (const texture of mob.ownedTextures || []) texture.dispose?.();
    if (isSquid(mob)) {
      for (const mat of mob.squidMaterials || []) mat.map?.dispose();
    }
    for (const slot of ['laserLine', 'leashLine']) {
      const line = mob[slot];
      if (!line) continue;
      line.removeFromParent();
      line.geometry?.dispose();
      line.material?.dispose();
      mob[slot] = null;
    }
    if (mob.glowOutline) {
      mob.glowOutline.removeFromParent();
      mob.glowOutline.geometry?.dispose();
      mob.glowOutline.material?.dispose();
      mob.glowOutline = null;
    }
    // A rider must not be left pointing at a mob that no longer exists.
    if (mob.rider) {
      mob.rider.vehicle = null;
      mob.rider = null;
    }
    if (mob.vehicle?.rider === mob) mob.vehicle.rider = null;
    mob.leashHolder = null;

    this.removeDebugLabel?.(mob);
    if (mob.mesh) {
      mob.mesh.removeFromParent();
      mob.mesh.traverse(obj => { obj.geometry?.dispose(); });
    }

    this.mobs.splice(index, 1);
    mob.despawned = true;
    mob.despawnReason = reason;
    return true;
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

  /**
   * Spawn a mob by type.
   *
   * The optional `options` bag is forwarded to every handler, which is what lets a caller ask for a
   * specific variant through the generic entry point. It used to be dropped silently, so a snow fox
   * spawned as a red fox and a brown panda as black and white; variant-aware spawners take it and the
   * rest simply ignore the extra argument.
   */
  spawnMob(type, x, y, z, options = {}) {
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
      case 'jackie_chun': return this.spawnJackieChun(x, y, z, options);
      case 'enderman': return this.spawnEnderman(x, y, z, options);
      case 'iron_golem': return this.spawnIronGolem(x, y, z);
      case 'pillager': return this.spawnPillager(x, y, z);
      case 'zombie': return this.spawnZombie(x, y, z);
      case 'giant': return this.spawnGiant(x, y, z, options);
      case 'zombie_villager': return this.spawnZombieVillager(x, y, z);
      case 'skeleton': return this.spawnSkeleton(x, y, z);
      case 'creeper': return this.spawnCreeper(x, y, z);
      case 'spider': return this.spawnSpider(x, y, z, options);
      case 'cave_spider': return this.spawnCaveSpider(x, y, z, options);
      case 'silverfish': return this.spawnSilverfish(x, y, z, options);
      case 'endermite': return this.spawnEndermite(x, y, z, options);
      case 'rabbit': return this.spawnRabbit(x, y, z, options);
      // Wiki: The Killer Bunny "can only be spawned using commands", so it is a named entry that maps
      // onto the rabbit spawner's killer flag rather than a separate mob. That keeps the hunt, the
      // armour and the coat in one place.
      case 'killer_bunny': return this.spawnRabbit(x, y, z, { ...options, killer: true });
      case 'bat': return this.spawnBat(x, y, z, options);
      case 'fox': return this.spawnFox(x, y, z, options);
      case 'bee': return this.spawnBee(x, y, z, options);
      case 'goat': return this.spawnGoat(x, y, z, options);
      case 'llama': return this.spawnLlama(x, y, z, options);
      case 'turtle': return this.spawnTurtle(x, y, z, options);
      case 'frog': return this.spawnFrog(x, y, z, options);
      case 'tadpole': return this.spawnTadpole(x, y, z, options);
      case 'parrot': return this.spawnParrot(x, y, z, options);
      case 'pig': return this.spawnPig(x, y, z);
      case 'cow': return this.spawnCow(x, y, z);
      case 'sheep': return this.spawnSheep(x, y, z, options);
      case 'chicken': return this.spawnChicken(x, y, z);
      case 'cod': return this.spawnCod(x, y, z);
      case 'pufferfish': return this.spawnPufferfish(x, y, z, options);
      case 'tropical_fish': return this.spawnTropicalFish(x, y, z, options);
      case 'salmon': return this.spawnSalmon(x, y, z, options);
      case 'dolphin': return this.spawnDolphin(x, y, z, options);
      case 'octopus':
      case 'squid': return this.spawnSquid(x, y, z);
      case 'axolotl': return this.spawnAxolotl(x, y, z);
      case 'mooshroom': return this.spawnMooshroom(x, y, z, options);
      case 'polar_bear': return this.spawnPolarBear(x, y, z, options);
      case 'panda': return this.spawnPanda(x, y, z, options);
      case 'armadillo': return this.spawnArmadillo(x, y, z, options);
      case 'breeze': return this.spawnBreeze(x, y, z, options);
      case 'sniffer': return this.spawnSniffer(x, y, z, options);
      case 'allay': return this.spawnAllay(x, y, z, options);
      case 'wandering_trader': return this.spawnWanderingTrader(x, y, z, options);
      case 'trader_llama': return this.spawnTraderLlama(x, y, z, options);
      case 'camel': return this.spawnCamel(x, y, z, options);
      case 'camel_husk': return this.spawnCamelHusk(x, y, z, options);
      case 'copper_golem': return this.spawnCopperGolem(x, y, z, options);
      case 'happy_ghast': return this.spawnHappyGhast(x, y, z, options);
      case 'creaking': return this.spawnCreaking(x, y, z, options);
      case 'snow_golem': return this.spawnSnowGolem(x, y, z, options);
      case 'illusioner': return this.spawnIllusioner(x, y, z, options);
      case 'skeleton_horse': return this.spawnUndeadHorse(x, y, z, 'skeleton_horse', options);
      case 'zombie_horse': return this.spawnUndeadHorse(x, y, z, 'zombie_horse', options);
      // Wiki: husk, stray and bogged are zombie and skeleton variants, so they reuse those models.
      case 'husk': return this.spawnZombieVariant(x, y, z, 'husk', options);
      case 'stray': return this.spawnSkeletonVariant(x, y, z, 'stray', options);
      case 'bogged': return this.spawnSkeletonVariant(x, y, z, 'bogged', options);
      case 'parched': return this.spawnSkeletonVariant(x, y, z, 'parched', options);
      case 'warden': return this.spawnWarden(x, y, z);
      case 'blaze': return this.spawnBlaze(x, y, z);
      case 'piglin': return this.spawnPiglin(x, y, z);
      // Wiki: a brute is a stronger PIGLIN, so it is built by the piglin spawner and then given the
      // brute's numbers rather than duplicating the model and the whole AI.
      case 'piglin_brute': return this.spawnPiglinBrute(x, y, z, options);
      case 'zombified_piglin':
      case 'zombie_pigman': return this.spawnZombifiedPiglin(x, y, z, options);
      case 'hoglin': return this.spawnHoglin(x, y, z);
      case 'zoglin': { const mob = this.spawnHoglin(x, y, z); mob.type = 'zoglin'; mob.name = 'Zoglin'; mob.fireImmune = true; return mob; }
      case 'ghast': return this.spawnGhast(x, y, z);
      case 'magma_cube': return this.spawnMagmaCube(x, y, z);
      case 'shulker': return this.spawnShulker(x, y, z);
      case 'horse': return this.spawnHorse(x, y, z);
      case 'mule': return this.spawnMule(x,y,z);
      case 'donkey': return this.spawnDonkey(x, y, z);
      case 'wolf': return this.spawnWolf(x, y, z, options);
      case 'cat': return this.spawnCat(x, y, z);
      case 'ocelot': return this.spawnOcelot(x, y, z);
      case 'slime': return this.spawnSlime(x, y, z);
      case 'witch': return this.spawnWitch(x, y, z);
      case 'wither_skeleton': return this.spawnWitherSkeleton(x, y, z, options);
      case 'strider': return this.spawnStrider(x, y, z, options);
      case 'guardian': return this.spawnGuardian(x, y, z, false, options);
      case 'elder_guardian': return this.spawnGuardian(x, y, z, true, options);
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
        // An unknown type used to fall through to a villager.
        //
        // That made every typo and every unported mob look like a villager instead of failing. It hid
        // five mobs from scripts/mob-drop-live.mjs -- spawning 'pufferfish' returned a villager, so the
        // harness measured a villager's drops and reported a drop gap that could not be fixed by adding a
        // row. The same substitution would hide a typo in a spawn egg.
        //
        // Returning null lets the caller notice. The callers in this repository all handle it: raids.js
        // checks `if (mob)`, and the spawn-egg chain in main.js does not dereference the result.
        console.warn('[mobs] unknown mob type "' + type + '"; nothing spawned');
        return null;
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

  /**
   * Spider body texture: near-black body with a lighter underside, matching the wiki's
   * dark spider with bright red eyes.
   */
  createSpiderTexture(createCanvas = null) {
    const makeCanvas = createCanvas
      || (typeof document !== 'undefined' ? () => document.createElement('canvas') : null);
    if (!makeCanvas) return new THREE.Texture();
    const canvas = makeCanvas();
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Base near-black body.
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, 64, 32);

    // Fuzz shading, so the flat body still reads as texture rather than a solid blob.
    ctx.fillStyle = '#111827';
    for (let x = 0; x < 64; x += 3) {
      for (let y = 0; y < 32; y += 3) {
        if ((x * 2 + y) % 6 === 0) ctx.fillRect(x, y, 1, 2);
      }
    }
    // Lighter abdomen markings.
    ctx.fillStyle = '#374151';
    ctx.fillRect(24, 18, 14, 8);
    ctx.fillRect(28, 10, 6, 4);

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

  /**
   * A variant skin: the base mob's texture multiplied by a tint.
   *
   * Wiki: a husk is a sand-dry zombie, a stray a pale frozen skeleton and a bogged a moss-covered one.
   * Multiplying keeps the base shading and detail, so the variant reads as the same creature in a
   * different climate rather than as a flat recolour.
   *
   * Returns a texture that falls back to the base image when there is no canvas (headless tests), so a
   * caller never has to check.
   */
  createVariantTexture(baseKey, color) {
    const base = this.textures?.[baseKey] ?? null;
    if (typeof document === 'undefined') return base ?? new THREE.Texture();
    // Accept either a 0xRRGGBB number (as VARIANT_TINTS holds) or a CSS string.
    const css = typeof color === 'number' ? `#${color.toString(16).padStart(6, '0')}` : String(color ?? '#ffffff');

    // An empty PLACEHOLDER, returned immediately so a mob can be spawned before the base has decoded. Once the
    // base arrives the SAME object is filled in from a freshly painted image -- see `finish` and `onReady`.
    const target = new THREE.Texture();
    target.magFilter = THREE.NearestFilter;
    target.minFilter = THREE.NearestFilter;
    target.colorSpace = THREE.SRGBColorSpace;

    // Subscribers told when the real skin exists. The mob spawners register here and point their material at the
    // finished texture, because the base PNG has not finished loading when the mob is constructed.
    target.readyCallbacks = [];
    target.onReady = (fn) => {
      if (target.ready === true) fn(target);
      else target.readyCallbacks.push(fn);
    };

    // A scratch canvas, used only to read the base image's pixels and tint them. It is never handed to the GPU.
    const scratch = document.createElement('canvas');

    const paint = (source) => {
      if (!source?.width) return false;
      try {
        scratch.width = source.width;
        scratch.height = source.height;
        const ctx = scratch.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, source.width, source.height);
        ctx.drawImage(source, 0, 0);

        // Tint with plain pixel arithmetic, NOT `globalCompositeOperation = 'multiply'`.
        //
        // The canvas `multiply` blend mode proved unreliable here: measured in the live Inspector page the
        // "tinted" texture came back with exactly the base's average (129), i.e. the composite silently did
        // nothing, so the husk/stray/bogged skins were left untinted in some environments. Reading the pixels
        // and multiplying them channel-by-channel is deterministic everywhere and is also directly testable.
        const data = ctx.getImageData(0, 0, source.width, source.height);
        const px = data.data;
        const tint = [1, 3, 5].map(i => parseInt(css.slice(i, i + 2), 16));
        const targetAvg = (tint[0] + tint[1] + tint[2]) / 3 || 1;

        // Multiply in place, tracking the result's average as we go.
        //
        // Every texel is made FULLY OPAQUE. The base PNGs carry an alpha channel (zombie.png is only 1184 opaque
        // texels of 4096 -- the rest is padding around the UV islands), but the mobs that use them are drawn with
        // an OPAQUE material, so that padding is never sampled. A derived skin that keeps zero alpha instead
        // renders those texels as pure black, which is exactly the solid black silhouette the husk became. The
        // skeleton variants are the exception: skeleton.png is a genuine cut-out, so stray and bogged keep the
        // alpha they inherit and rely on their material's `alphaTest`.
        const keepAlpha = baseKey === 'skeleton';
        let sum = 0, count = 0;
        for (let i = 0; i < px.length; i += 4) {
          if (!keepAlpha) px[i + 3] = 255;
          px[i] = (px[i] * tint[0]) / 255;
          px[i + 1] = (px[i + 1] * tint[1]) / 255;
          px[i + 2] = (px[i + 2] * tint[2]) / 255;
          sum += (px[i] + px[i + 1] + px[i + 2]) / 3;
          count++;
        }
        const baseAvg = count ? sum / count : 0;

        // A plain multiply of two dark things is nearly black -- measured with the real renderer the husk came
        // out at avgRGB 26 against the zombie's 77, which is the black blob the Inspector was showing. So after
        // tinting, scale the whole image uniformly so its average matches the tint's own average. Shading is
        // preserved because it is a single uniform gain.
        if (baseAvg > 4 && targetAvg > 4) {
          // Clamped so a pathological pair cannot blow the texture out to white.
          const gain = Math.min(6, targetAvg / baseAvg);
          if (Math.abs(gain - 1) > 0.001) {
            for (let i = 0; i < px.length; i += 4) {
              if (px[i + 3] === 0) continue;
              px[i] = Math.min(255, px[i] * gain);
              px[i + 1] = Math.min(255, px[i + 1] * gain);
              px[i + 2] = Math.min(255, px[i + 2] * gain);
            }
          }
        }
        // Finish the skin as an ORDINARY IMAGE texture.
        //
        // Everything else was tried here and each failed for a different reason: a CanvasTexture whose canvas is
        // painted or resized after the renderer uploaded it renders black; and a DataTexture built from the same
        // pixels uploaded but sampled the wrong rows, because a DataTexture defaults to `flipY = false` while
        // `textureLoader` produces image textures with `flipY = true` and the mob UVs are authored against that.
        //
        // Going through an Image keeps the mob on exactly the same texture path as every other mob in the game:
        // the painted canvas is encoded once and decoded into an immutable bitmap, so orientation, colour space
        // and upload all behave the way they already do for zombie.png.
        return finish(scratch);
      } catch {
        // A tainted canvas or a stub without a real 2D context must not break spawning.
        return false;
      }
    };

    /** Encode the painted canvas and adopt the decoded bitmap as this texture's image. */
    const finish = (canvas) => {
      const payload = canvas.toDataURL('image/png');
      if (typeof Image !== 'function') return false;
      const image = new Image();
      image.onload = () => {
        target.image = image;
        target.flipY = true;
        target.needsUpdate = true;
        target.ready = true;
        for (const fn of target.readyCallbacks) {
          try { fn(target); } catch { /* a bad subscriber must not break the skin */ }
        }
        target.readyCallbacks.length = 0;
      };
      image.src = payload;
      return true;
    };

    if (paint(base?.image)) return target;

    // Not decoded yet. `base.image` is a getter onto `base.source.data`, which `TextureLoader` leaves NULL until
    // the bitmap arrives, so there is nothing to attach a listener to yet.
    //
    // Two things were wrong with the first attempt at this: `image.complete` is false both for an image that is
    // still downloading and for one that has not started, so `!complete` could never identify the retry case;
    // and a short poll simply expired before the image arrived. So: listen on the texture (which DOES receive a
    // `load` event) for the common case, and poll as a backstop with a budget generous enough to outlast a slow
    // first load. `decode()` is used when available because it resolves once the bitmap is genuinely paintable.
    let attempts = 0;
    const attach = () => {
      const image = base?.image ?? base?.source?.data;
      if (image?.addEventListener) {
        if (paint(image)) return;
        image.addEventListener('load', () => paint(image), { once: true });
        image.decode?.().then(() => paint(image)).catch(() => {});
        return;
      }
      // 1200 x 25ms = 30s, which comfortably outlasts a cold texture load.
      if (attempts++ < 1200) setTimeout(attach, 25);
    };
    base?.addEventListener?.('load', () => paint(base?.image ?? base?.source?.data), { once: true });
    attach();
    return target;
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

  /**
   * Load a skin from disk, falling back to a generated texture if the asset is not present.
   *
   * The originals under `public/assets/` are downloaded by `scripts/mob-visual/fetch-assets.mjs` and are NOT
   * committed as part of the source tree's build inputs everywhere, so a checkout without them must still run.
   * `fallback` is a thunk rather than a value so the (sometimes expensive) generation only happens when the real
   * asset is genuinely unavailable, detected by the loader's error event.
   */
  loadTexture(path, fallback = null) {
    if (typeof document === 'undefined') return fallback ? fallback() : new THREE.Texture();
    const tex = this.textureLoader.load(path, () => {
      // The bitmap is really here. Anything waiting on this texture -- a material that had to keep its flat
      // colour in the meantime -- can now bind for real.
      //
      // This callback is the reliable hook, and it is why `loadTexture` passes one at all: supplying an explicit
      // onLoad SUPPRESSES three's default listener, so relying on the texture's own 'load' event never fires.
      // That is what left the Inspector's snow golem as a flat orange box.
      const waiting = tex.__onReady ?? [];
      tex.__onReady = [];
      for (const fn of waiting) {
        try { fn(); } catch { /* one failed listener must not stop the others */ }
      }
    }, undefined, () => {
      // The asset is missing. Swap in the generated stand-in on the same texture object, so anything already
      // holding a reference (a mob's material) picks it up without a re-assignment.
      if (!fallback) return;
      try {
        const substitute = fallback();
        if (substitute?.image) {
          tex.image = substitute.image;
          tex.needsUpdate = true;
        }
      } catch { /* a failed fallback must not break spawning */ }
      // A generated substitute is just as much "ready" as a downloaded file.
      const waiting = tex.__onReady ?? [];
      tex.__onReady = [];
      for (const fn of waiting) {
        try { fn(); } catch { /* ignore */ }
      }
    });
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.assetPath = path;
    return tex;
  }

  /**
   * Run `fn` once a texture's bitmap is available: now if it already is, otherwise as soon as it is.
   *
   * Needed because the Mob Inspector builds its mob and then sits paused, so nothing per-frame can be relied on.
   */
  static onTextureReady(texture, fn) {
    if (!texture) return;
    if (texture.image?.width) {
      fn();
      return;
    }
    (texture.__onReady ??= []).push(fn);
  }

  /**
   * The three materials that make a pumpkin look like a pumpkin.
   *
   * A pumpkin block is a cube with a DIFFERENT texture per face: the carved grin on the front, plain rind on the
   * sides and back, and the stem end on top. One flat colour can never show a face, which is why the snow golem
   * had none.
   *
   * Each material starts on the flat colour and picks up its texture once that texture has actually decoded. The
   * block textures are requested with `loadTexture` and arrive asynchronously, so assigning the map up front
   * would leave a material whose map has no image yet -- which three renders as BLACK, not as the fallback.
   */
  createPumpkinMaterials() {
    // One set per manager, shared by every golem. Building fresh materials per spawn would both leak and, worse,
    // freeze the flat colour in place: the block textures decode asynchronously, so a material built before they
    // arrive has no image and three renders it BLACK rather than falling back.
    this._pumpkinMaterials ??= {
      pumpkinFace: new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.pumpkin }),
      pumpkinSide: new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.pumpkin }),
      pumpkinTop: new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.pumpkin })
    };
    adoptTexture(this._pumpkinMaterials.pumpkinFace, this.textures.carved_pumpkin, SNOW_GOLEM_COLORS.pumpkin);
    adoptTexture(this._pumpkinMaterials.pumpkinSide, this.textures.pumpkin_side, SNOW_GOLEM_COLORS.pumpkin);
    adoptTexture(this._pumpkinMaterials.pumpkinTop, this.textures.pumpkin_top, SNOW_GOLEM_COLORS.pumpkin);
    return this._pumpkinMaterials;
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
      // Wiki: cube hitbox side is size * 0.52, so a large cube (size 4) is 2.08 blocks.
      // A spawned cube also carries its own width/height, so this entry is the large
      // default and babies/smaller cubes resolve through the instance values.
      case 'slime': return { width: 2.08, height: 2.08 };
      case 'pig': return { width: 0.9, height: 0.9 };
      case 'cow': return { width: 0.9, height: 1.4 };
      // Wiki: mooshrooms are 1.4 tall and 0.9 wide, like cows. They previously fell
      // through to the humanoid default of 0.6 x 1.95.
      case 'mooshroom': return { width: 0.9, height: 1.4 };
      case 'sheep': return { width: 0.9, height: 1.3 };
      case 'creeper': return { width: 0.6, height: 1.7 };
      // Wiki: spiders are wider than they are tall.
      case 'spider': return SPIDER_DIMENSIONS;
      // Wiki: cave spiders are 0.7 x 0.5, exactly half the spider model.
      case 'cave_spider': return CAVE_SPIDER_DIMENSIONS;
      // Wiki: silverfish are 0.4 x 0.3, among the smallest mobs.
      case 'silverfish': return SILVERFISH_DIMENSIONS;
      // Wiki: endermites are also 0.4 x 0.3, and the smallest hostile hitbox.
      case 'endermite': return ENDERMITE_DIMENSIONS;
      // Wiki: rabbits are 0.4 x 0.5. A spawned rabbit carries its own size, so babies
      // resolve through the instance values.
      // Wiki: The Killer Bunny shares the rabbit hitbox: 0.4 x 0.5 adult, 0.2 x 0.25 baby. Spawned by
      // name it has no options object, so the adult rabbit box is the right answer here.
      case 'killer_bunny': return RABBIT_DIMENSIONS;
      case 'rabbit': return RABBIT_DIMENSIONS;
      // Wiki: bats are 0.5 x 0.9.
      case 'bat': return BAT_DIMENSIONS;
      // Wiki: foxes are 0.6 x 0.7. A spawned fox carries its own size, so babies resolve
      // through the instance values.
      case 'fox': return FOX_DIMENSIONS;
      // Wiki: bees are 0.55 x 0.5.
      case 'bee': return BEE_DIMENSIONS;
      // Wiki: goats are 0.9 x 1.3, and shrink to 0.63 x 0.91 mid-jump.
      case 'goat': return GOAT_DIMENSIONS;
      // Wiki: llamas are 0.9 x 1.87.
      case 'llama': return LLAMA_DIMENSIONS;
      // Wiki: turtles are 1.2 x 0.4, and a pregnant one is 0.2 taller.
      case 'turtle': return TURTLE_DIMENSIONS;
      // Wiki: frogs are 0.5 x 0.5.
      case 'frog': return FROG_DIMENSIONS;
      // Wiki: tadpoles are 0.4 x 0.3.
      case 'tadpole': return TADPOLE_DIMENSIONS;
      // Wiki: parrots are 0.5 x 0.9 in Java.
      case 'parrot': return PARROT_DIMENSIONS;
      // Wiki: phantoms are 0.9 x 0.5. Without this row the collision fell back to the humanoid
      // default of 0.6 x 1.95, which made a phantom a tall thin box instead of a flat wide one.
      case 'phantom': return PHANTOM_DIMENSIONS;
      // Wiki: polar bears are 1.4 x 1.4, and a cub is 0.7 x 0.7. Without these rows the collision
      // fell back to the humanoid default of 0.6 x 1.95.
      case 'polar_bear': return POLAR_BEAR_DIMENSIONS;
      // Wiki: pandas are 1.3 x 1.25, and a baby is 0.65 x 0.625.
      case 'panda': return PANDA_DIMENSIONS;
      // Wiki: armadillos are 0.7 x 0.65, and a baby is 0.42 x 0.39.
      case 'armadillo': return ARMADILLO_DIMENSIONS;
      // Wiki: a breeze is 0.6 wide x 1.77 tall.
      case 'breeze': return BREEZE_DIMENSIONS;
      // Wiki: a sniffer is 1.9 x 1.75, and a snifflet 0.95 x 0.875.
      case 'sniffer': return SNIFFER_DIMENSIONS;
      // Wiki: an allay is 0.35 wide x 0.6 tall, and has no baby form.
      case 'allay': return ALLAY_DIMENSIONS;
      // Wiki: a wandering trader is 0.6 x 1.95, and the Age tag cannot make it a baby.
      case 'wandering_trader': return WANDERING_TRADER_DIMENSIONS;
      // Wiki: a trader llama is a llama, so it shares the llama hitbox.
      case 'trader_llama': return LLAMA_DIMENSIONS;
      // Wiki: a camel is 1.7 x 2.375 standing, 1.7 x 0.945 sitting, and 0.85 x 1.1875 as a baby.
      case 'camel': return CAMEL_DIMENSIONS;
      // Wiki: a camel husk is 1.7 x 2.375 standing and 1.7 x 0.945 sitting -- the camel box exactly.
      case 'camel_husk': return CAMEL_HUSK_DIMENSIONS;
      // Wiki: a copper golem is 0.49 x 0.98 in Java.
      case 'copper_golem': return COPPER_GOLEM_DIMENSIONS;
      // Wiki: a creaking is 0.9 x 2.7.
      case 'creaking': return CREAKING_DIMENSIONS;
      // Wiki: a snow golem is 0.7 x 1.9 in Java. Its loot table already existed while it had no
      // dimension row, so it was silently using the humanoid box.
      case 'snow_golem': return SNOW_GOLEM_DIMENSIONS;
      // Wiki: an illusioner is 0.6 x 1.95, the standard illager box.
      case 'illusioner': return ILLUSIONER_DIMENSIONS;
      // Wiki: both undead horses are 1.3965 x 1.6, the same box as a living horse.
      case 'skeleton_horse':
      case 'zombie_horse': return UNDEAD_HORSE_DIMENSIONS;
      // Wiki: husk 0.6 x 1.95, stray and bogged 0.6 x 1.99. The tiny height difference is real.
      case 'husk': return VARIANT_DIMENSIONS.husk;
      case 'stray': return VARIANT_DIMENSIONS.stray;
      case 'bogged': return VARIANT_DIMENSIONS.bogged;
      // Wiki: a parched is 0.6 x 1.99, the same as the other skeleton variants.
      case 'parched': return VARIANT_DIMENSIONS.parched;
      case 'skeleton': return { width: 0.6, height: 1.98 };
      case 'zombie': return { width: 0.6, height: 1.95 };
      // Wiki: a giant is 3.6 x 12 -- a six-times-enlarged zombie.
      case 'giant': return GIANT_DIMENSIONS;
      case 'pillager': return { width: 0.6, height: 1.95 };
      case 'salmon': return { width: 0.4, height: 0.35 };
      case 'cod': return { width: 0.35, height: 0.3 };
      // Wiki: a pufferfish has THREE hitboxes, 0.35 unpuffed, 0.49 semi-puffed and 0.7 fully puffed. The
      // unpuffed one is reported here; the mob's own width/height track the live stage.
      case 'pufferfish': return PUFFERFISH_DIMENSIONS.unpuffed;
      // Wiki: a tropical fish is 0.5 x 0.4.
      case 'tropical_fish': return TROPICAL_FISH_DIMENSIONS;
      // Wiki: adult 0.9 x 0.6. A spawned dolphin also carries its own size, so babies
      // resolve through the instance values rather than this adult table entry.
      case 'dolphin': return DOLPHIN_DIMENSIONS.adult;
      case 'octopus':
      case 'squid':
      case 'glow_squid': return { width: 0.8, height: 0.8 };
      case 'drowned': return { width: 0.6, height: 1.95 };
      case 'axolotl': return { width: 0.5, height: 0.35 };
      case 'horse': return { width: 1.4, height: 1.6 };
      case 'donkey': return { width: 1.3965, height: 1.5 };
      case 'mule': return { width: 1.3965, height: 1.6 };
      case 'wolf': return { width: WOLF_DIMENSIONS.adult.width, height: WOLF_DIMENSIONS.adult.height };
      case 'cat':
      case 'ocelot': return { width: 0.6, height: 0.7 };
      case 'chicken': return { width: 0.4, height: 0.7 };
      case 'ravager': return { width: 1.95, height: 2.2 };
      case 'warden': return { width: 1.4, height: 2.9 };
      case 'ender_dragon': return { width: 3.5, height: 1.8 };
      case 'wither': return { width: 1.8, height: 2.4 };
      case 'ghast': return { width: 4.0, height: 4.0 };
      // Wiki: a happy ghast is 4.0 x 4.0, and a ghastling 0.95.
      case 'happy_ghast': return HAPPY_GHAST_DIMENSIONS;
      case 'blaze': return { width: 0.6, height: 1.8 };
      case 'piglin': return { width: 0.6, height: 1.95 };
      // Wiki: a piglin brute shares the piglin box, 0.6 x 1.95.
      case 'piglin_brute': return PIGLIN_BRUTE_DIMENSIONS;
      case 'zombified_piglin':
      case 'zombie_pigman': return { width: 0.6, height: 1.95 };
      case 'zoglin':
      case 'hoglin': return { width: 1.4, height: 1.4 };
      // Wiki: a large magma cube is also 2.08 blocks per side (size 4 * 0.52).
      case 'magma_cube': return { width: 2.08, height: 2.08 };
      case 'strider': return { width: 0.9, height: 1.7 };
      case 'wither_skeleton': return { width: 0.7, height: 2.4 };
      case 'guardian': return { width: 0.85, height: 0.85 };
      case 'elder_guardian': return { width: 2.0, height: 2.0 };
      case 'tournament_host': return { width: 0.6, height: 1.95 };
      case 'site_manager': return { width: 0.6, height: 1.95 };
      case 'jackie_chun': return { width: 0.6, height: 1.85 };
      // Wiki: 0.6 wide, 2.9 tall.
      case 'enderman': return { width: 0.6, height: 2.9 };
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
  spawnZombie(x, y, z, options = {}) {
    const group = new THREE.Group();
    // Wiki: a husk is a desert zombie, so it shares the zombie model.
    //
    // It does NOT share the zombie's skin. A husk has its own vanilla skin, and when that is the texture in use
    // the model is left untinted so the skin's desiccated detail and torn clothing survive; `hasOriginalSkin`
    // records which case applies, and `applyVariantIdentity` reads it before flattening the model to one colour.
    //
    // The test is on the TEXTURE'S SOURCE PATH, not on whether the bitmap has decoded yet: the asset is requested
    // at construction and arrives asynchronously, so an image-presence check would be a race.
    const hasOriginalSkin = options.variant === 'husk' && this.textures.husk?.assetPath === HUSK_SKIN_PATH;
    const baseTex = options.variant === 'husk' ? (this.textures.husk ?? this.textures.zombie) : this.textures.zombie;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    // Bind through `adoptTexture` rather than handing the texture to the constructor. A mapped material whose
    // bitmap has not decoded yet renders as BLACK, and the Inspector builds its mob while paused -- so a session
    // that spawns a husk was one slow request away from a black figure, the exact symptom reported. This keeps the
    // zombie's own white until the husk's skin is really there, and works whether or not the mob ever ticks.
    adoptTexture(mat, baseTex, 0xffffff);
    // A derived skin is a PLACEHOLDER object that fills ITSELF in when the base PNG decodes, so the material
    // needs no swap: it holds the same texture object for the mob's whole life.

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
      // True when the variant is wearing its own vanilla skin rather than a generated tint, so
      // `applyVariantIdentity` knows not to flatten the model to a single colour.
      hasOriginalSkin,
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

  /**
   * Spider.
   *
   * Wiki: 16 HP, 1.4 x 0.9, neutral while the local light level is above 11. Spiders are
   * arthropods, drop string plus a player-credited spider eye, and flip onto their backs
   * when they die.
   */
  spawnSpider(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
    const { group, head, thorax, abdomen, legs, eyes } = createSpiderModel(bodyMat, eyeMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'spider',
      name: 'Spider',
      mesh: group,
      head,
      thorax,
      abdomen,
      legs,
      eyes,
      bodyMat,
      eyeMat,
      isArthropod: true,
      // Wiki: spiders are immune to poison and to cobweb slowing.
      poisonImmune: true,
      // Wiki: 16 HP (lowered from 20 in Beta 1.9-pre2).
      health: SPIDER_HEALTH,
      maxHealth: SPIDER_HEALTH,
      width: SPIDER_DIMENSIONS.width,
      height: SPIDER_DIMENSIONS.height,
      // Wiki: no normal-difficulty damage scaling beyond 2; see the adapt note about
      // contact damage. Stored so the value is inspectable and testable.
      attackDamage: 2,
      // Wiki: 1% chance of a skeleton rider, forming a spider jockey.
      isJockey: !!options.isJockey,
      // Retaliation window, set when the spider is attacked.
      angerTimer: 0,
      isClimbing: false,
      climbTimer: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Cave spider.
   *
   * Wiki: a smaller spider variant — 12 HP, 0.7 x 0.5, exactly half the model scale — that
   * shares the spider's model, light-based neutrality and drops, and additionally poisons on
   * Normal and Hard difficulty.
   */
  spawnCaveSpider(x, y, z, options = {}) {
    const mob = this.spawnSpider(x, y, z, options);
    mob.type = 'cave_spider';
    mob.name = 'Cave Spider';
    // Wiki: 12 HP, a third less than a spider's 16.
    mob.health = CAVE_SPIDER_HEALTH;
    mob.maxHealth = CAVE_SPIDER_HEALTH;
    // Wiki: 0.7 x 0.5 against the spider's 1.4 x 0.9.
    mob.width = CAVE_SPIDER_DIMENSIONS.width;
    mob.height = CAVE_SPIDER_DIMENSIONS.height;
    // Wiki: the model is half the size of a spider's.
    mob.mesh.scale.setScalar(CAVE_SPIDER_SCALE);
    // Distinguishing flags rather than shared ones, so the two variants stay separable.
    mob.isCaveSpider = true;
    return mob;
  }

  /**
   * Silverfish.
   *
   * Wiki: 8 HP, 0.4 x 0.3, hostile arthropod, no item drops and 5 XP, whose defining
   * behaviour is calling other silverfish to help when it is hit.
   */
  spawnSilverfish(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1f2937 });
    const { group, head, body, mid, tail, legs, eyes } = createSilverfishModel(bodyMat, eyeMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'silverfish',
      name: 'Silverfish',
      mesh: group,
      head,
      body,
      mid,
      tail,
      legs,
      eyes,
      bodyMat,
      eyeMat,
      isArthropod: true,
      // Wiki: silverfish are immune to the Infested status effect.
      infestedImmune: true,
      // Wiki: 8 HP.
      health: SILVERFISH_HEALTH,
      maxHealth: SILVERFISH_HEALTH,
      width: SILVERFISH_DIMENSIONS.width,
      height: SILVERFISH_DIMENSIONS.height,
      // Retaliation window, refreshed when it is hit or called by another silverfish.
      angerTimer: 0,
      attacker: null,
      silverfishPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Endermite.
   *
   * Wiki: 8 HP, 0.4 x 0.3 (the smallest hostile hitbox), 2/2/3 damage, 3 XP and no items. It
   * spawns from a thrown ender pearl, despawns after two minutes unless named, and endermen
   * hunt it.
   */
  spawnEndermite(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2e1065 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
    const { group, head, body, legs, eyes } = createEndermiteModel(bodyMat, eyeMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'endermite',
      name: 'Endermite',
      mesh: group,
      head,
      body,
      legs,
      eyes,
      bodyMat,
      eyeMat,
      isArthropod: true,
      // Wiki: 8 HP.
      health: ENDERMITE_HEALTH,
      maxHealth: ENDERMITE_HEALTH,
      width: ENDERMITE_DIMENSIONS.width,
      height: ENDERMITE_DIMENSIONS.height,
      // Wiki `Lifetime`: despawns at around 2400 ticks unless named.
      lifetime: 0,
      despawned: false,
      fromEnderPearl: !!options.fromEnderPearl,
      // Targets, set by the enderman/endermite aggression pass and the player chase.
      endermanTarget: null,
      endermitePhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Rabbit.
   *
   * Wiki: 3 HP, 0.4 x 0.5, six natural coat variants chosen by biome, breeding with
   * carrots/golden carrots/dandelions, and a hop gait rather than a walk. The Killer Bunny
   * (`RabbitType: 99`) is the hostile variant, spawnable only by command.
   */
  spawnRabbit(x, y, z, options = {}) {
    const coat = options.coat || (options.killer ? 'killer' : rollRabbitCoat(options.biome));
    const colors = RABBIT_COAT_COLORS[coat] || RABBIT_COAT_COLORS.brown;
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.base });
    const patchMat = new THREE.MeshLambertMaterial({ color: colors.patch });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group, head, body, patchMesh, tail, ears, legs, eyes } = createRabbitModel(bodyMat, patchMat, eyeMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(RABBIT_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? RABBIT_BABY_DIMENSIONS : RABBIT_DIMENSIONS;
    const mob = {
      type: 'rabbit',
      name: options.killer ? 'The Killer Bunny' : 'Rabbit',
      mesh: group,
      head,
      body,
      patchMesh,
      tail,
      ears,
      legs,
      eyes,
      bodyMat,
      patchMat,
      eyeMat,
      // Wiki: 3 HP.
      health: RABBIT_HEALTH,
      maxHealth: RABBIT_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      // Wiki: `RabbitType`. 99 is The Killer Bunny.
      rabbitType: options.killer ? KILLER_BUNNY_TYPE : RABBIT_COATS.indexOf(coat),
      coat,
      isHostile: !!options.killer,
      // Wiki: the killer bunny has 8 armour points.
      armor: options.killer ? KILLER_BUNNY_ARMOR : (options.armor ?? 0),
      retreatTimer: 0,
      hopTimer: Math.random() * 0.5,
      rabbitPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    applyRabbitCoat(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Bat.
   *
   * Wiki: 6 HP, 0.5 x 0.9, passive, the game's only ambient mob. It hangs upside down from the
   * underside of a solid block, flees when a player comes near even while hanging, and despawns
   * past 32 blocks. It drops no items and no experience.
   */
  spawnBat(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4b3a2f });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0x3a2c24 });
    const earMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const { group, body, head, ears, eyes, wings } = createBatModel(bodyMat, wingMat, earMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'bat',
      name: 'Bat',
      mesh: group,
      body,
      head,
      ears,
      eyes,
      wings,
      bodyMat,
      wingMat,
      earMat,
      isFlying: true,
      // Wiki: bats are ambient and do not count toward the passive mob cap.
      isAmbient: true,
      // Wiki: bats are immune to fall damage (the `fall_damage_immune` entity tag).
      fallDamageImmune: true,
      // Wiki: 6 HP.
      health: BAT_HEALTH,
      maxHealth: BAT_HEALTH,
      width: BAT_DIMENSIONS.width,
      height: BAT_DIMENSIONS.height,
      // Wiki `BatFlags`: true while hanging upside down.
      isHanging: false,
      hangTimer: 0,
      flyTimer: 0,
      isFleeing: false,
      batPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      targetPitch: 0,
      wanderTimer: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Fox.
   *
   * Wiki: 10 HP, 0.6 x 0.7, red and snow variants chosen by biome, hunts chickens/rabbits/fish
   * by pouncing, carries an item in its mouth which it always drops, sleeps during the day under
   * cover, and *trusts* the player who bred it rather than being tamed.
   */
  spawnFox(x, y, z, options = {}) {
    const coat = options.coat || rollFoxCoat(options.biome);
    const colors = FOX_COAT_COLORS[coat] || FOX_COAT_COLORS.red;
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.base });
    const bellyMat = new THREE.MeshLambertMaterial({ color: colors.belly });
    const earMat = new THREE.MeshLambertMaterial({ color: colors.ear });
    const { group, body, belly, head, muzzle, tail, ears, eyes, legs, mouth } = createFoxModel(bodyMat, bellyMat, earMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(FOX_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? FOX_BABY_DIMENSIONS : FOX_DIMENSIONS;
    // Wiki: 20% of foxes spawn holding an item. An explicit option wins, so a caller can force
    // an empty or a specific mouth.
    const spawnedWithItem = options.heldItem !== undefined
      ? options.heldItem
      : rollFoxHeldItem(options.random || Math.random);

    const mob = {
      type: 'fox',
      name: 'Fox',
      mesh: group,
      body,
      belly,
      head,
      muzzle,
      tail,
      ears,
      eyes,
      legs,
      mouth,
      bodyMat,
      bellyMat,
      earMat,
      // Wiki: 10 HP.
      health: FOX_HEALTH,
      maxHealth: FOX_HEALTH,
      isBaby: !!options.isBaby,
      coat,
      width: dims.width,
      height: dims.height,
      // Wiki: the item in its mouth, which always drops on death.
      heldItem: spawnedWithItem,
      spawnedWithItem,
      heldItemMesh: null,
      // Wiki: trust comes from breeding, not from feeding.
      trustedPlayer: options.trustedPlayer ?? null,
      isSleeping: false,
      sleepingHeadTimer: 0,
      pouncePhase: null,
      pounceTimer: 0,
      isPouncing: false,
      // Wiki: a fox can safely fall 5 blocks rather than the usual 3.
      safeFallBlocks: FOX_SAFE_FALL_BLOCKS,
      // Wiki: sweet berry bushes neither damage nor slow a fox.
      sweetBerryImmune: true,
      // Wiki: a fox can walk on powder snow without falling in.
      powderSnowWalkable: true,
      eatTimer: 0,
      foxPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      attackCooldown: 0
    };
    this.attachFoxHeldItem(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Show or clear the mesh for whatever the fox is holding in its mouth.
   *
   * Kept on the manager because it needs the item-visual machinery, which the behaviour module
   * has no business importing.
   */
  attachFoxHeldItem(mob) {
    if (!mob?.mouth) return null;
    if (mob.heldItemMesh) {
      mob.mouth.remove(mob.heldItemMesh);
      mob.heldItemMesh.geometry?.dispose?.();
      mob.heldItemMesh.material?.dispose?.();
      mob.heldItemMesh = null;
    }
    if (!mob.heldItem) return null;
    // A small stand-in marker: the inspector logs loot rather than rendering it, so the mouth
    // mesh only has to read as "this fox is carrying something".
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.12),
      new THREE.MeshLambertMaterial({ color: 0xfacc15 })
    );
    mesh.name = 'fox-held-item';
    mob.mouth.add(mesh);
    mob.heldItemMesh = mesh;
    return mesh;
  }

  /**
   * Bee.
   *
   * Wiki: 10 HP, 0.55 x 0.5, neutral flying arthropod. Its defining mechanic is that stinging is
   * fatal to the bee: it loses its stinger, can never attack again, and dies about a minute
   * later. It pollinates flowers, carries nectar to a hive, and answers anger as a colony.
   */
  spawnBee(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: BEE_COLORS.body });
    const stripeMat = new THREE.MeshLambertMaterial({ color: BEE_COLORS.stripe });
    const wingMat = new THREE.MeshLambertMaterial({ color: BEE_COLORS.wing, transparent: true, opacity: 0.75 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: BEE_COLORS.eye });
    const { group, body, head, eyes, stinger, wings } = createBeeModel(bodyMat, stripeMat, wingMat, eyeMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(BEE_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? BEE_BABY_DIMENSIONS : BEE_DIMENSIONS;
    const mob = {
      type: 'bee',
      name: 'Bee',
      mesh: group,
      body,
      head,
      eyes,
      stinger,
      wings,
      bodyMat,
      stripeMat,
      wingMat,
      eyeMat,
      isFlying: true,
      isArthropod: true,
      // Wiki: bees are immune to poison (they inflict it), and take no fall damage.
      poisonImmune: true,
      fallDamageImmune: true,
      // Wiki: 10 HP.
      health: BEE_HEALTH,
      maxHealth: BEE_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      // Anger and the sting.
      angerTimer: 0,
      angryAt: null,
      hasStung: false,
      stingerless: false,
      deathTimer: 0,
      // Nectar and pollination.
      hasNectar: !!options.hasNectar,
      nectarTicks: 0,
      cropsGrownSincePollination: 0,
      // Water exposure.
      waterTicks: 0,
      waterDamageTimer: 0,
      // Wiki: a bee's home, which it refuses to stray more than 22 blocks from.
      hive: options.hive ?? null,
      // Wiki: affected by the Poison effect only in the sense that it inflicts it; recorded so
      // the state is inspectable.
      isBee: true,
      beePhase: 0,
      wanderTimer: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      targetPitch: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Goat.
   *
   * Wiki: 10 HP, 0.9 x 1.3, neutral mountain animal. Leaps up to 10 blocks high and 5 across on a
   * 30-60 second cooldown, rams an unmoving target every 30s-5min, snaps a horn off against a hard
   * block, and is milkable. A screaming goat rams every 5-15 seconds.
   */
  spawnGoat(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: GOAT_COLORS.body });
    const darkMat = new THREE.MeshLambertMaterial({ color: GOAT_COLORS.dark });
    const hornMat = new THREE.MeshLambertMaterial({ color: GOAT_COLORS.horn });
    const eyeMat = new THREE.MeshBasicMaterial({ color: GOAT_COLORS.eye });
    const { group, body, head, muzzle, beard, tail, eyes, horns, hornSides, legs } = createGoatModel(bodyMat, darkMat, hornMat, eyeMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(GOAT_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const random = options.random || Math.random;
    const dims = options.isBaby ? GOAT_BABY_DIMENSIONS : GOAT_DIMENSIONS;
    const isScreamingGoat = options.isScreamingGoat ?? rollScreamingGoat(random);
    // Wiki: 10% of adults are missing one horn; babies have both and never drop them.
    const hornsPresent = options.horns || rollGoatHorns(!!options.isBaby, random);

    const mob = {
      type: 'goat',
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Goat',
      mesh: group,
      body,
      head,
      muzzle,
      beard,
      tail,
      eyes,
      horns,
      hornSides,
      legs,
      bodyMat,
      darkMat,
      hornMat,
      eyeMat,
      // Wiki: 10 HP.
      health: GOAT_HEALTH,
      maxHealth: GOAT_HEALTH,
      isBaby: !!options.isBaby,
      version: 'java',
      width: dims.width,
      height: dims.height,
      // Screaming goats are visually identical; only their ramming cadence and sounds differ.
      isScreamingGoat,
      hasLeftHorn: hornsPresent.left,
      hasRightHorn: hornsPresent.right,
      hornVariant: options.hornVariant || rollGoatHornVariant(isScreamingGoat, random),
      // Wiki: goats take 10 less fall damage and avoid walking into powder snow.
      fallDamageReduction: GOAT_FALL_DAMAGE_REDUCTION,
      avoidsPowderSnow: true,
      // Wiki: milkable with a bucket, breedable with wheat.
      isMilkable: true,
      ramState: null,
      ramTarget: null,
      ramLockedPosition: null,
      ramPrepareTimer: 0,
      ramTimer: 0,
      ramCooldown: rollGoatRamCooldown(isScreamingGoat, random),
      jumpCooldown: rollGoatJumpCooldown(random),
      isGoatJumping: false,
      goatJumpHeight: 0,
      goatPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    poseGoat(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Pick something for a panda to maul.
   *
   * Wiki: a panda attacks whatever hurt it, and an aggressive one keeps attacking until the target
   * dies or leaves its detection range. Aggressive pandas near an attacked panda join in.
   */
  findPandaTarget(panda, player) {
    const candidates = [];
    if (player?.position) candidates.push(player);
    for (const other of this.mobs) {
      if (other === panda) continue;
      if (other.type !== 'panda' || !other.isHostile) continue;
      candidates.push(other);
    }
    let best = null;
    let bestDist = 16;
    for (const candidate of candidates) {
      if (!candidate || candidate === panda) continue;
      if (candidate.health !== undefined && candidate.health <= 0) continue;
      const pos = candidate.position ?? candidate.mesh?.position;
      if (!pos) continue;
      const dist = panda.mesh.position.distanceTo(pos);
      if (dist < bestDist) { bestDist = dist; best = candidate; }
    }
    return best;
  }

  /**
   * Pick something for a goat to ram.
   *
   * Wiki: it targets players, armor stands and any mob except ghasts and other goats, within 4-16
   * blocks, and only if the target is not moving. Players in Creative or on Peaceful are excluded.
   */
  findGoatRamTarget(goat, player) {
    const difficulty = this.game?.difficulty ?? 'normal';
    const candidates = [];
    if (player?.position) candidates.push(player);
    for (const other of this.mobs) {
      if (other === goat) continue;
      candidates.push(other);
    }

    let best = null;
    let bestDist = GOAT_RAM.maxRange;
    for (const candidate of candidates) {
      if (!isValidGoatTarget(goat, candidate, { difficulty })) continue;
      if (!isUnmovingTarget(candidate)) continue;
      const pos = candidate.position ?? candidate.mesh?.position;
      if (!pos) continue;
      const dist = goat.mesh.position.distanceTo(pos);
      // Wiki: the range is 4 to 16 blocks, so something right on top of the goat is not a target.
      if (dist < GOAT_RAM.minRange || dist > bestDist) continue;
      bestDist = dist;
      best = candidate;
    }
    return best;
  }

  /**
   * Llama.
   *
   * Wiki: 15-30 HP scaling with strength, 0.9 x 1.87, neutral. Retaliates with spit, has a strength
   * 1-5 that sets both health and its 3-to-15 inventory slots, carries a chest and a carpet, can be
   * tamed by repeated riding, and takes only half fall damage after six safe blocks.
   */
  spawnLlama(x, y, z, options = {}) {
    const random = options.random || Math.random;
    const variant = options.variant || rollLlamaVariant(random);
    const strength = options.strength ?? rollLlamaStrength(random);
    const colors = llamaCoatColors(variant);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.base });
    const darkMat = new THREE.MeshLambertMaterial({ color: colors.dark });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1c1917 });
    const { group, body, neck, head, muzzle, ears, eyes, tail, legs, chestMesh, carpetMesh } = createLlamaModel(bodyMat, darkMat, eyeMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(LLAMA_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? LLAMA_BABY_DIMENSIONS : LLAMA_DIMENSIONS;
    const health = llamaHealthFor(strength);
    const mob = {
      type: 'llama',
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Llama',
      mesh: group,
      body,
      neck,
      head,
      muzzle,
      ears,
      eyes,
      tail,
      legs,
      chestMesh,
      carpetMesh,
      bodyMat,
      darkMat,
      eyeMat,
      health,
      maxHealth: health,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      // Wiki: the four coat colours.
      variant,
      variantId: LLAMA_VARIANTS[variant],
      // Wiki: strength 1-5 sets both health and how much it can carry.
      strength,
      chestSlots: llamaSlotsFor(strength),
      hasChest: false,
      chestInventory: new Array(llamaSlotsFor(strength)).fill(null),
      carpetColor: null,
      // Wiki: taming is by repeated riding; Temper starts at 0 and caps at 30.
      isTamed: false,
      temper: LLAMA_TEMPER.start,
      // Wiki: llamas take only half fall damage, after six safe blocks.
      safeFallBlocks: 6,
      halfFallDamage: true,
      // Combat.
      recentAttacker: null,
      spitCooldown: 0,
      spitCharge: 0,
      llamaPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    applyLlamaEquipment(mob);
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Turtle.
   *
   * Wiki: 30 HP, 1.2 x 0.4, passive aquatic. Slow on land and fast in water, remembers its spawn
   * block as home and returns there to lay a cluster of 1-4 eggs, and a baby drops a turtle scute
   * when it matures. Bred and led with seagrass.
   */
  spawnTurtle(x, y, z, options = {}) {
    const shellMat = new THREE.MeshLambertMaterial({ color: 0x2f6b3a });
    const skinMat = new THREE.MeshLambertMaterial({ color: 0x4a8a52 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1f4527 });
    const { group, shell, rim, neck, head, eyes, flippers, tail } = createTurtleModel(shellMat, skinMat, darkMat);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(TURTLE_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? TURTLE_BABY_DIMENSIONS : TURTLE_DIMENSIONS;
    const mob = {
      type: 'turtle',
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Turtle',
      mesh: group,
      shell,
      rim,
      neck,
      head,
      eyes,
      flippers,
      tail,
      shellMat,
      skinMat,
      darkMat,
      // Wiki: turtles are aquatic, breathe under water, and are not scared of pufferfish.
      isAquatic: true,
      canBreatheUnderwater: true,
      // Wiki: 30 HP.
      health: TURTLE_HEALTH,
      maxHealth: TURTLE_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      // Wiki: it remembers where it spawned.
      homePosition: null,
      // Wiki: breeding makes one turtle pregnant, and a pregnant turtle is taller.
      hasEgg: !!options.hasEgg,
      digTimer: 0,
      waterSearchTimer: 0,
      waterTarget: null,
      swimTarget: null,
      inWater: false,
      swimCycle: 0,
      turtlePhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    // Wiki: a turtle spawned from an egg, a spawn egg or a command remembers the spawn location.
    setTurtleHome(mob, x, y, z);
    applyTurtlePregnancy(mob);
    this.mobs.push(mob);
    return mob;
  }

  /** True when the block at a position is water. */
  isWaterAt(x, y, z) {
    return this.world?.getVoxel?.(Math.floor(x), Math.floor(y), Math.floor(z)) === BLOCKS.WATER;
  }

  /**
   * Place a cluster of turtle eggs.
   *
   * Wiki: eggs are laid "as a single block" holding 1-4 eggs, and there is no turtle-egg block in
   * this project's registry, so the cluster is tracked here and its position recorded. The crack
   * stage is tracked alongside, because a block id alone could not carry it either.
   *
   * Returns the cluster size placed.
   */
  placeTurtleEggs(x, y, z, count) {
    const size = Math.max(TURTLE_EGG_CLUSTER.min, Math.min(TURTLE_EGG.maxCluster, count));
    if (!this.turtleEggs) this.turtleEggs = new Map();
    const key = `${x},${y},${z}`;
    const existing = this.turtleEggs.get(key);
    // Wiki: an existing cluster merges up to the four-egg cap rather than replacing.
    const total = Math.min(TURTLE_EGG.maxCluster, (existing?.count ?? 0) + size);
    this.turtleEggs.set(key, { x, y, z, count: total, cracks: existing?.cracks ?? 0 });
    return total;
  }

  /**
   * Frog.
   *
   * Wiki: 10 HP, 0.5 x 0.5, passive. Makes long jumps of up to 8 blocks, swims fast and cannot
   * drown, takes 5 less fall damage, has three biome-determined variants, and eats small slimes and
   * magma cubes with its tongue — producing a froglight whose colour its variant decides.
   */
  spawnFrog(x, y, z, options = {}) {
    const variant = options.variant || frogVariantForBiome(options.biome);
    const colors = FROG_COLORS[variant] || FROG_COLORS.temperate;
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.base });
    const bellyMat = new THREE.MeshLambertMaterial({ color: colors.belly });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group, body, belly, head, eyes, tongue, legs } = createFrogModel(bodyMat, bellyMat, eyeMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'frog',
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Frog',
      mesh: group,
      body,
      belly,
      head,
      eyes,
      tongue,
      legs,
      bodyMat,
      bellyMat,
      eyeMat,
      // Wiki: 10 HP.
      health: FROG_HEALTH,
      maxHealth: FROG_HEALTH,
      isBaby: false,
      width: FROG_DIMENSIONS.width,
      height: FROG_DIMENSIONS.height,
      // Wiki: three variants, set by the biome.
      variant,
      // Wiki: a frog cannot drown.
      canBreatheUnderwater: true,
      // Wiki: 5 less fall damage than most mobs.
      fallDamageReduction: FROG_JUMP.fallDamageReduction,
      // Wiki: it prefers jumping onto lily pads and dripleaves, and to higher ground.
      prefersLilyPads: true,
      // Tongue state.
      tongueTimer: 0,
      tongueCooldown: 0,
      tongueTarget: null,
      eatTimer: 0,
      // Movement.
      inWater: false,
      isFrogJumping: false,
      frogJumpHeight: 0,
      hopTimer: 0.4 + Math.random() * 0.6,
      croakTimer: 0,
      frogPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Tadpole.
   *
   * Wiki: 6 HP, 0.4 x 0.3, a bucketable aquatic passive mob. It hatches from frogspawn, drowns
   * after under 20 seconds out of water, is hunted by axolotls, and matures into whichever frog
   * variant its *current biome* dictates — the game's only case of the environment, rather than the
   * parents, deciding a baby's adult form.
   */
  spawnTadpole(x, y, z, options = {}) {
    const bodyMat = new THREE.MeshLambertMaterial({ color: TADPOLE_COLORS.body });
    const bellyMat = new THREE.MeshLambertMaterial({ color: TADPOLE_COLORS.belly });
    const eyeMat = new THREE.MeshBasicMaterial({ color: TADPOLE_COLORS.eye });
    const { group, body, belly, head, eyes, tail } = createTadpoleModel(bodyMat, bellyMat, eyeMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'tadpole',
      name: 'Tadpole',
      mesh: group,
      body,
      belly,
      head,
      eyes,
      tail,
      bodyMat,
      bellyMat,
      eyeMat,
      // Wiki: 6 HP.
      health: TADPOLE_HEALTH,
      maxHealth: TADPOLE_HEALTH,
      // Wiki: a tadpole is not a baby variant of the frog — it is its own mob — but it does mature,
      // so the shared `isBaby` flag is deliberately NOT set. Growth is tracked by `growthTimer`.
      isBaby: false,
      width: TADPOLE_DIMENSIONS.width,
      height: TADPOLE_DIMENSIONS.height,
      // Wiki: aquatic, breathes under water, and is an axolotl hunt target.
      isAquatic: true,
      canBreatheUnderwater: true,
      isAxolotlPrey: true,
      // Wiki: bucketable with a water bucket, preserving health, age and name.
      isBucketable: true,
      inWater: false,
      drySeconds: 0,
      growthTimer: TADPOLE_GROWTH_SECONDS,
      readyToMature: false,
      // Wiki: golden dandelions stop it aging.
      ageLocked: false,
      waterTarget: null,
      waterSearchTimer: 0,
      swimCycle: 0,
      tadpolePhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      pitch: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * The nearest water for a beached tadpole.
   *
   * Same expanding-square search the turtle uses, on a smaller radius, because a tadpole's whole
   * land behaviour is "get back to water".
   */
  findWaterNearTadpole(mob) {
    return findWaterNear(this, mob, TADPOLE_WATER_SEARCH.radius);
  }

  /**
   * Mature a tadpole into the frog its current biome dictates.
   *
   * Wiki: "A tadpole grows up into one of the variants of a frog depending on the tadpole's
   * location", which is the game's only case of the *environment* rather than the parents deciding a
   * baby's adult form. The tadpole is replaced by a frog rather than mutated, because the wiki is
   * explicit that "the tadpole is treated by the game as a completely different mob from the frog".
   *
   * Returns the new frog, or null.
   */
  matureTadpole(tadpole) {
    if (!isTadpole(tadpole)) return null;
    const pos = tadpole.mesh.position;
    const biome = this.world?.getBiome?.(Math.floor(pos.x), Math.floor(pos.z)) ?? null;
    const variant = tadpoleVariantForBiome(biome);

    // Remove the tadpole without running the death path: it grew up, it did not die.
    tadpole.mesh.removeFromParent?.();
    const index = this.mobs.indexOf(tadpole);
    if (index >= 0) this.mobs.splice(index, 1);
    tadpole.maturedInto = 'frog';

    const frog = this.spawnFrog(pos.x, pos.y, pos.z, { variant });
    // Wiki: a name survives the change, as it does for a bucketed tadpole.
    if (tadpole.name && tadpole.name !== 'Tadpole') frog.name = tadpole.name;
    return frog;
  }

  /**
   * Parrot.
   *
   * Wiki: 6 HP, 0.5 x 0.9, tameable flying passive. Five colour variants, tamed with seed at a
   * 1-in-10 chance, perches on the player's shoulder (left first), imitates nearby hostile mobs
   * within 20 blocks, dances by a jukebox playing a disc, and is killed by a cookie.
   */
  spawnParrot(x, y, z, options = {}) {
    const variant = options.variant ?? rollParrotVariant(options.random || Math.random);
    const colors = parrotColors(variant);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.body });
    const wingMat = new THREE.MeshLambertMaterial({ color: colors.wing });
    const headMat = new THREE.MeshLambertMaterial({ color: colors.head });
    const beakMat = new THREE.MeshLambertMaterial({ color: colors.beak });
    const { group, body, head, beakUpper, beakLower, eyes, wings, tail } = createParrotModel(bodyMat, wingMat, headMat, beakMat);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'parrot',
      name: 'Parrot',
      mesh: group,
      body,
      head,
      beakUpper,
      beakLower,
      eyes,
      wings,
      tail,
      bodyMat,
      wingMat,
      headMat,
      beakMat,
      isFlying: true,
      // Wiki: 6 HP.
      health: PARROT_HEALTH,
      maxHealth: PARROT_HEALTH,
      width: PARROT_DIMENSIONS.width,
      height: PARROT_DIMENSIONS.height,
      // Wiki: five variants with numeric ids 0-4.
      variant,
      variantName: parrotVariantName(variant),
      // Wiki: parrots carry the fall_damage_immune tag, because they flap to slow their falls.
      fallDamageImmune: true,
      // Taming, sitting and perching.
      isTamed: false,
      isSitting: false,
      perchedOn: null,
      owner: null,
      // Behaviour timers.
      flightTimer: 0,
      resting: false,
      flyTargetY: y + 3,
      isDancing: false,
      imitateCooldown: 0,
      imitating: null,
      parrotPhase: 0,
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
  spawnSkeleton(x, y, z, options = {}) {
    const group = new THREE.Group();
    // Wiki: a stray is a frozen skeleton and a bogged a moss-covered one; both are tinted skins.
    const baseTex = options.variant === 'stray' ? (this.textures.stray ?? this.textures.skeleton)
      : options.variant === 'bogged' ? (this.textures.bogged ?? this.textures.skeleton)
      : this.textures.skeleton;
    const mat = new THREE.MeshLambertMaterial({ map: baseTex, transparent: true, alphaTest: 0.5 });
    // A derived skin is a PLACEHOLDER object that fills ITSELF in when the base PNG decodes, so the material needs
    // no swap: it holds the same texture object for the mob's whole life.

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

  /**
   * Convert a mob in place to another type.
   *
   * Used by the husk's drowning conversion. Wiki: the zombie it becomes "has full health even if the
   * husk has been damaged", so health is reset rather than carried over.
   */
  replaceMobType(mob, type) {
    if (!mob) return null;
    const index = this.mobs.indexOf(mob);
    const dims = this.getMobDimensions(type);
    const spawner = { zombie: () => this.spawnZombie(mob.mesh.position.x, mob.mesh.position.y, mob.mesh.position.z) }[type];
    if (!spawner) return null;
    const replacement = spawner();
    if (!replacement) return null;
    replacement.mesh.position.copy(mob.mesh.position);
    replacement.yaw = mob.yaw;
    replacement.width = dims.width;
    replacement.height = dims.height;
    replacement.health = replacement.maxHealth;
    // Remove the original, including from the scene, so it does not linger as a ghost mesh.
    if (index >= 0) this.mobs.splice(index, 1);
    this.scene?.remove?.(mob.mesh);
    return replacement;
  }

  /**
   * Place a sniffer egg, which hatches into a snifflet.
   *
   * Wiki: "Once placed by a player, a sniffer egg hatches after 10 minutes if placed on a moss block or
   * 20 minutes otherwise." Eggs are tracked in `manager.snifferEggs` because this codebase has no block
   * entity system; each entry carries its own hatch timer.
   */
  placeSnifferEgg(x, y, z, { blockName = null } = {}) {
    if (!this.snifferEggs) this.snifferEggs = [];
    const egg = {
      position: new THREE.Vector3(x, y, z),
      // Wiki: the moss block halves the hatch time.
      hatchTimer: snifferEggHatchSeconds(blockName),
      blockName: blockName
    };
    this.snifferEggs.push(egg);
    return egg;
  }

  /**
   * Advance every placed sniffer egg, hatching one into a snifflet when its timer runs out.
   *
   * Returns the snifflets that hatched, which is what the tests assert on.
   */
  updateSnifferEggs(dt) {
    if (!this.snifferEggs?.length) return [];
    const hatched = [];
    for (let i = this.snifferEggs.length - 1; i >= 0; i--) {
      const egg = this.snifferEggs[i];
      egg.hatchTimer -= dt;
      if (egg.hatchTimer > 0) continue;
      const baby = this.spawnSniffer(egg.position.x, egg.position.y, egg.position.z, { isBaby: true });
      if (baby) {
        baby.isBaby = true;
        baby.growthTimer = SNIFFLET_GROWTH_SECONDS;
        hatched.push(baby);
      }
      this.snifferEggs.splice(i, 1);
    }
    return hatched;
  }

  /**
   * Skeleton horse and zombie horse.
   *
   * Wiki: both are undead HORSES at 1.3965 x 1.6 with speed 0.2 -- the skeleton horse 15 HP and the
   * zombie horse 25 HP. Neither is bred. Both are passive alone and hostile only as a jockey, because
   * the rider controls the pathfinding, and both become passive once separated so a player can saddle
   * and ride them. The skeleton horse does not burn in sunlight; the zombie horse does.
   */
  spawnUndeadHorse(x, y, z, type, options = {}) {
    if (!isUndeadHorse(type)) return null;
    const colors = UNDEAD_HORSE_COLORS[type];
    const group = new THREE.Group();
    const coatMat = new THREE.MeshLambertMaterial({ color: colors.coat });
    const maneMat = new THREE.MeshLambertMaterial({ color: colors.mane });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const hoofMat = new THREE.MeshLambertMaterial({ color: 0x2b2b26 });
    const { group: model, body, neck, head, eyes, mane, legs, tail, saddle } =
      createUndeadHorseModel(type, coatMat, maneMat, eyeMat, hoofMat);
    group.add(model);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(UNDEAD_HORSE_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? UNDEAD_HORSE_BABY_DIMENSIONS : UNDEAD_HORSE_DIMENSIONS;
    const mob = {
      type,
      name: type === 'skeleton_horse' ? 'Skeleton Horse' : 'Zombie Horse',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, neck, head, eyes, mane, legs, tail, saddle,
      health: undeadHorseHealth(type),
      maxHealth: undeadHorseHealth(type),
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      speed: UNDEAD_HORSE_SPEED,
      // Wiki: passive alone; hostile only as a jockey, because the rider steers.
      isHostile: false,
      // Wiki: undead traits, shared by both.
      undead: UNDEAD_HORSE_TRAITS.undead,
      poisonImmune: UNDEAD_HORSE_TRAITS.poisonImmune,
      invertedHealing: UNDEAD_HORSE_TRAITS.invertedHealing,
      canBreatheUnderwater: UNDEAD_HORSE_TRAITS.canBreatheUnderwater,
      sensitiveToSmite: UNDEAD_HORSE_TRAITS.sensitiveToSmite,
      // Wiki: the skeleton horse does not burn in sunlight; the zombie horse does.
      burnsInDaylight: undeadHorseBurnsInDaylight(type),
      // Wiki: neither is bred.
      canBreed: undeadHorseCanBreed(),
      // Wiki: the skeleton horse is the trap form and carries a saddle; the zombie horse can also wear
      // horse armour.
      isTrap: options.isTrap ?? (type === 'skeleton_horse' && options.trap !== false),
      hasSaddle: options.hasSaddle ?? (type === 'skeleton_horse' && options.isTrap !== false),
      horseArmor: options.horseArmor ?? null,
      rider: null,
      riderCount: 0,
      // Wiki: a zombie horse spawns RIDDEN in the dark; that is opt-in so the dispatcher does not mount one.
      wantsRider: options.wantsRider ?? false,
      tame: !!options.tame,
      horsePhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (saddle) saddle.visible = mob.hasSaddle;
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Illusioner.
   *
   * Wiki: 32 HP, 0.6 x 1.95, speed 0.5. A Java-exclusive illager that spawns only by command, fires an
   * arrow a second (three times a skeleton), sees its target through walls, strafes at a fixed distance,
   * and fights with two spells: Blindness on its opponent and Invisibility on itself behind four mirror
   * duplicates.
   */
  spawnIllusioner(x, y, z, options = {}) {
    const group = new THREE.Group();
    const robeMat = new THREE.MeshLambertMaterial({ color: ILLUSIONER_COLORS.robe });
    const trimMat = new THREE.MeshLambertMaterial({ color: ILLUSIONER_COLORS.trim });
    const skinMat = new THREE.MeshLambertMaterial({ color: ILLUSIONER_COLORS.skin });
    const eyeMat = new THREE.MeshBasicMaterial({ color: ILLUSIONER_COLORS.eye });
    const bowMat = new THREE.MeshLambertMaterial({ color: ILLUSIONER_COLORS.bow });
    const { group: model, body, sash, head, nose, eyes, legs, arms, bow } =
      createIllusionerModel(robeMat, trimMat, skinMat, eyeMat, bowMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'illusioner',
      name: 'Illusioner',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, sash, head, nose, eyes, legs, arms, bow,
      // Wiki: 32 HP.
      health: ILLUSIONER_HEALTH,
      maxHealth: ILLUSIONER_HEALTH,
      width: ILLUSIONER_DIMENSIONS.width,
      height: ILLUSIONER_DIMENSIONS.height,
      speed: ILLUSIONER_SPEED,
      isHostile: true,
      attackDamage: ILLUSIONER_DAMAGE.normal.min,
      // Wiki: it is the only illager that can see its target through walls.
      seesThroughWalls: ILLUSIONER_SEES_THROUGH_WALLS,
      // The spells. `casting` drives the shared arm-raise animation.
      invisibleTimer: 0,
      invisibilityCooldown: 0,
      blindnessCooldown: 0,
      spellCooldown: 0,
      castTimer: 0,
      casting: null,
      blindedTarget: null,
      duplicates: [],
      duplicatesTriggered: false,
      // The archer and the strafing.
      shootCooldown: 0,
      target: null,
      strafeTimer: 1.5,
      strafeSign: 1,
      illusionerPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Snow golem.
   *
   * Wiki: 4 HP, 0.7 x 1.9, speed 0.2. A buildable passive mob that throws snowballs at monsters to
   * provoke them, leaves a trail of snow, dies in hot biomes unless fire resistant, is immune to powder
   * snow and fall damage, and wears a sheareable carved pumpkin as a helmet.
   */
  spawnSnowGolem(x, y, z, options = {}) {
    const group = new THREE.Group();
    // The golem's own skin is the real vanilla snow-golem texture, which already carries the carved eyes and the
    // little smile. The flat colours are the fallback for a build without the downloaded asset.
    const hasSkin = this.textures.snow_golem?.assetPath === SNOW_GOLEM_SKIN_PATH;
    const snowMat = new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.snow });
    if (hasSkin) {
      snowMat.transparent = true;
      snowMat.alphaTest = 0.5;
      adoptTexture(snowMat, this.textures.snow_golem, SNOW_GOLEM_COLORS.snow);
    }
    const snowFaceMat = new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.snow });
    const shadowMat = new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.shadow });
    const faceMat = new THREE.MeshBasicMaterial({ color: SNOW_GOLEM_COLORS.face });
    // The pumpkin is a real carved-pumpkin block: the grin on the front, rind on the sides, stem end on top.
    const pumpkinMat = this.createPumpkinMaterials();
    const { group: model, lower, middle, head, face, pumpkin, arms } =
      createSnowGolemModel(snowMat, shadowMat, pumpkinMat, faceMat, { snowFace: snowFaceMat }, { createTexturedBox });
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'snow_golem',
      name: 'Snow Golem',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      lower, middle, head, faceMesh: face, pumpkinMesh: pumpkin, arms,
      // Wiki: 4 HP.
      health: SNOW_GOLEM_HEALTH,
      maxHealth: SNOW_GOLEM_HEALTH,
      width: SNOW_GOLEM_DIMENSIONS.width,
      height: SNOW_GOLEM_DIMENSIONS.height,
      speed: SNOW_GOLEM_SPEED,
      // Wiki: it is passive and never intentionally attacks the player.
      isHostile: false,
      // Wiki: immune to powder snow and to fall damage, and it avoids water.
      powderSnowImmune: SNOW_GOLEM_TRAITS.powderSnowImmune,
      fallDamageImmune: SNOW_GOLEM_TRAITS.fallDamageImmune,
      avoidsWater: SNOW_GOLEM_TRAITS.avoidsWater,
      // Wiki: it wears its carved pumpkin "like a helmet", hidden until sheared.
      hasPumpkin: options.hasPumpkin !== false,
      // The biome it stands in, which decides whether it takes heat damage.
      biome: options.biome ?? null,
      hasFireResistance: !!options.hasFireResistance,
      heatDamageTaken: 0,
      throwCooldown: 0,
      target: null,
      golemPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (face) face.visible = !mob.hasPumpkin;
    if (pumpkin) pumpkin.visible = mob.hasPumpkin;
    // Wiki: snowballs are its own projectiles, so they get their own array rather than sharing one owned
    // by another behaviour.
    this.snowballs = this.snowballs || [];
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Creaking.
   *
   * Wiki: 1 HP, 0.9 x 2.7, speed 0.3, spawned at night by an activated creaking heart. It attacks with
   * melee headbutts but "cannot move at all while any players in Survival or Adventure mode can see it",
   * and one linked to a heart "becomes completely invulnerable to all sources of damage".
   */
  spawnCreaking(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: CREAKING_COLORS.body });
    const limbMat = new THREE.MeshLambertMaterial({ color: CREAKING_COLORS.limb });
    const eyeMat = new THREE.MeshBasicMaterial({ color: CREAKING_COLORS.eyeDim });
    const { group: model, body, head, eyes, arms, legs } =
      createCreakingModel(bodyMat, limbMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'creaking',
      name: 'Creaking',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, head, eyes, arms, legs,
      // Wiki: 1 HP.
      health: CREAKING_HEALTH,
      maxHealth: CREAKING_HEALTH,
      width: CREAKING_DIMENSIONS.width,
      height: CREAKING_DIMENSIONS.height,
      speed: CREAKING_SPEED,
      attackDamage: CREAKING_DAMAGE.normal,
      isHostile: true,
      // Wiki: it is fire resistant as of 24w44a.
      fireResistant: CREAKING_FIRE_RESISTANT,
      // The heart link. Options let a caller link it explicitly, which is what a heart would do.
      linkedHeart: options.linkedHeart ?? null,
      // Wiki: an egg- or command-spawned creaking is unlinked, CAN take damage, and does not despawn by
      // day. A heart-spawned one is the inverse on all three.
      natural: options.natural ?? !!options.linkedHeart,
      // Wiki: it ignores cacti, sweet berry bushes and powder snow while walking.
      ignoredBlocks: CREAKING_IGNORED_BLOCKS,
      // The gaze state.
      alerted: false,
      frozen: false,
      frozenBy: null,
      target: null,
      softlockTimer: 0,
      dying: false,
      twitchTimer: 0,
      creakPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Camel.
   *
   * Wiki: a tall passive mob, 32 HP, that sits on a timer, can be saddled and ridden by two players,
   * dashes 12 blocks with the jump control, steps up 1.5 blocks so it walks over fences, and falls six
   * blocks safely at half damage.
   */
  spawnCamel(x, y, z, options = {}) {
    const group = new THREE.Group();
    const coatMat = new THREE.MeshLambertMaterial({ color: CAMEL_COLORS.coat });
    const humpMat = new THREE.MeshLambertMaterial({ color: CAMEL_COLORS.hump });
    const bellyMat = new THREE.MeshLambertMaterial({ color: CAMEL_COLORS.belly });
    const hoofMat = new THREE.MeshLambertMaterial({ color: CAMEL_COLORS.hoof });
    const eyeMat = new THREE.MeshBasicMaterial({ color: CAMEL_COLORS.eye });
    const { group: model, body, belly, hump, neck, head, muzzle, eyes, legs, tail, saddle } =
      createCamelModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(CAMEL_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? CAMEL_BABY_DIMENSIONS : CAMEL_DIMENSIONS;
    const mob = {
      type: 'camel',
      name: 'Camel',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, belly, hump, neck, head, muzzle, eyes, legs, tail, saddleMesh: saddle,
      // Wiki: 32 HP.
      health: CAMEL_HEALTH,
      maxHealth: CAMEL_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      speed: CAMEL_SPEED.walk,
      // Wiki: it steps up 1.5 blocks, which is what lets it surmount fences and walls. No other mob
      // here declares a step height, so this is the camel's signature traversal trait.
      stepHeight: CAMEL_STEP_HEIGHT,
      // Wiki: six safe blocks and half damage per block beyond.
      fallDamageReduction: CAMEL_FALL.safeBlocks,
      fallDamageMultiplier: CAMEL_FALL.damagePerBlock,
      // The sit cycle.
      isSitting: false,
      sitTimer: 0,
      standTimer: rollCamelStandDelay(options.random || Math.random),
      // Riding and the dash.
      hasSaddle: !!options.hasSaddle,
      riderCount: 0,
      seats: CAMEL_SEATS,
      dashCooldown: 0,
      camelPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (saddle) saddle.visible = mob.hasSaddle;
    // Wiki: a baby camel grows in 20 minutes.
    if (options.isBaby) mob.growthTimer = CAMEL_BABY_GROWTH_SECONDS;
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Wandering trader.
   *
   * Wiki: a passive villager-like mob, 20 HP, that appears near a player with two leashed trader llamas,
   * offers a randomized set of nine trades, drinks Invisibility at dusk and milk at dawn, avoids zombies
   * and illagers, and despawns after 40 minutes.
   */
  spawnWanderingTrader(x, y, z, options = {}) {
    const group = new THREE.Group();
    const robeMat = new THREE.MeshLambertMaterial({ color: WANDERING_TRADER_COLORS.robe });
    const trimMat = new THREE.MeshLambertMaterial({ color: WANDERING_TRADER_COLORS.trim });
    const skinMat = new THREE.MeshLambertMaterial({ color: WANDERING_TRADER_COLORS.skin });
    const hatMat = new THREE.MeshLambertMaterial({ color: WANDERING_TRADER_COLORS.hat });
    const { group: model, body, sash, head, brim, crown, eyes, legs, arms, pack } =
      createWanderingTraderModel(robeMat, trimMat, skinMat, hatMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'wandering_trader',
      name: 'Wandering Trader',
      // A definite groundedness, so a branch reading it never sees undefined.
      onGround: true,
      mesh: group,
      body, sash, head, brim, crown, eyes, legs, arms, pack,
      // Wiki: 20 HP.
      health: WANDERING_TRADER_HEALTH,
      maxHealth: WANDERING_TRADER_HEALTH,
      width: WANDERING_TRADER_DIMENSIONS.width,
      height: WANDERING_TRADER_DIMENSIONS.height,
      speed: WANDERING_TRADER_SPEED,
      // Wiki: it despawns after 40 minutes unless it came from a command, egg or spawner.
      despawnTimer: options.persistent ? 0 : WANDERING_TRADER_DESPAWN_SECONDS,
      persistent: !!options.persistent,
      // The trade table, rolled on spawn and locked per offer as it is used.
      offers: [],
      tradesRolled: false,
      // Wiki: it drinks Invisibility at dusk and milk at dawn.
      isInvisible: false,
      drinking: false,
      drinkingItem: null,
      drinkCooldown: 0,
      // Wiki: "prefers to wander within 16 blocks of the initial spawning target location".
      homeX: x, homeZ: z,
      llamaCount: 0,
      traderPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    // Wiki: it spawns alongside two leashed trader llamas.
    if (options.withLlamas !== false) {
      mob.llamaCount = spawnTraderWithLlamas(this, mob, options.random || Math.random).length;
    }
    return mob;
  }

  /**
   * Trader llama.
   *
   * Wiki: a trader llama is a llama variant that travels with a wandering trader, tied to it with a
   * lead, and spits at whoever hurts it or its master, except on Peaceful.
   */
  spawnTraderLlama(x, y, z, options = {}) {
    // Reuse the llama model, then mark it as a trader llama.
    const llama = this.spawnLlama(x, y, z, options);
    if (!llama) return llama;
    llama.type = 'trader_llama';
    llama.name = 'Trader Llama';
    llama.isTraderLlama = true;
    // Wiki: a trader llama has the trader llama carpet, which is its only visual difference.
    llama.hasTraderCarpet = true;
    return llama;
  }

  /**
   * Allay.
   *
   * Wiki: a small flying passive mob, 20 HP, that follows the player who gave it an item and fetches
   * dropped copies of that item. It is fall-damage immune, regenerates 2 HP a second, cannot be harmed
   * by its owner, and has no baby form.
   */
  spawnAllay(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: ALLAY_COLORS.body });
    const wingMat = new THREE.MeshLambertMaterial({
      color: ALLAY_COLORS.wing, transparent: true, opacity: 0.85
    });
    const trimMat = new THREE.MeshBasicMaterial({
      color: ALLAY_COLORS.trim, transparent: true, opacity: 0.7
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: ALLAY_COLORS.eye });
    const { group: model, body, head, eyes, wings, trim, arms } =
      createAllayModel(bodyMat, wingMat, trimMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'allay',
      name: 'Allay',
      mesh: group,
      body, head, eyes, wings, trim, arms,
      // Wiki: 20 HP, raised from 10 in 22w16a.
      health: ALLAY_HEALTH,
      maxHealth: ALLAY_HEALTH,
      width: ALLAY_DIMENSIONS.width,
      height: ALLAY_DIMENSIONS.height,
      speed: ALLAY_SPEED,
      isFlying: true,
      // Wiki entity tag: fall_damage_immune.
      fallDamageImmune: ALLAY_FALL_IMMUNE,
      // Wiki: allays cannot enter water, although it tries to gather underwater items.
      avoidsWater: true,
      // The job. Wiki: it flies aimlessly until a player gives it an item.
      heldItem: options.heldItem ?? null,
      owner: options.owner ?? null,
      carriedCount: 0,
      seekCooldown: 0,
      // Wiki: delivers to a note block it heard within 16 blocks for the next 30 seconds.
      noteFocus: null,
      noteFocusTimer: 0,
      // Wiki: a five-minute cooldown after duplicating.
      duplicationCooldown: 0,
      isDancing: false,
      allayPhase: 0,
      baseY: y,
      // Wiki: allays cannot be harmed by their interacting owner.
      ownerImmune: ALLAY_OWNER_IMMUNE,
      // Flying, but set so the shared groundedness readers have a definite value.
      onGround: false,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Sniffer.
   *
   * Wiki: a passive ancient mob, 14 HP, that spawns only by hatching from a sniffer egg. It wanders,
   * scents the ground, sploots and digs up a torchflower seed or a pitcher pod. A baby is a snifflet,
   * which cannot dig and takes twice as long as a normal baby to grow up.
   */
  spawnSniffer(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: SNIFFER_COLORS.body });
    const bellyMat = new THREE.MeshLambertMaterial({ color: SNIFFER_COLORS.belly });
    const shellMat = new THREE.MeshLambertMaterial({ color: SNIFFER_COLORS.shell });
    const snoutMat = new THREE.MeshLambertMaterial({ color: SNIFFER_COLORS.snout });
    const legMat = new THREE.MeshLambertMaterial({ color: SNIFFER_COLORS.leg });
    const { group: model, body, belly, shell, bands, neck, head, snout, eyes, legs, tail } =
      createSnifferModel(bodyMat, bellyMat, shellMat, snoutMat, legMat);
    group.add(model);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(SNIFFLET_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? SNIFFLET_DIMENSIONS : SNIFFER_DIMENSIONS;
    const mob = {
      type: 'sniffer',
      name: 'Sniffer',
      mesh: group,
      body, belly, shell, bands, neck, head, snout, eyes, legs, tail,
      // Wiki: 14 HP.
      health: SNIFFER_HEALTH,
      maxHealth: SNIFFER_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      speed: SNIFFER_SPEED,
      // The dig state machine.
      digState: 'idle',
      digTimer: 0,
      digTarget: null,
      // Wiki: it starts on an 8-minute cooldown, which is also the "initial lag" a new adult has.
      digCooldown: SNIFFER_SEARCH_COOLDOWN,
      // Wiki: it stores its prior 20 digging locations.
      dugLocations: [],
      // Set explicitly. updateSnifferDig refuses unless the sniffer is on the ground, and an undefined
      // value read as not-on-the-ground, so a sniffer spawned standing on the ground never dug -- and the
      // shared mover never settled it either, so it fell forever. The same defect as the breeze's, found
      // the same way.
      onGround: true,
      snifferPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    // Wiki: a snifflet grows in 2400 s, twice the shared baby-growth constant.
    if (options.isBaby) mob.growthTimer = SNIFFLET_GROWTH_SECONDS;
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Breeze.
   *
   * Wiki: 30 HP hostile mob that leaps up to 15 blocks instead of walking, fires wind charges, and
   * deflects every projectile except another wind charge. It is fall-damage immune and the only
   * source of breeze rods.
   */
  spawnBreeze(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: BREEZE_COLORS.body });
    const rodMat = new THREE.MeshLambertMaterial({ color: BREEZE_COLORS.rod });
    const windMat = new THREE.MeshBasicMaterial({
      color: BREEZE_COLORS.wind, transparent: true, opacity: 0.45, depthWrite: false
    });
    const eyeMat = new THREE.MeshBasicMaterial({ color: BREEZE_COLORS.eye });
    const { group: model, body, head, eyes, eyebrows, rods, wind } =
      createBreezeModel(bodyMat, rodMat, windMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(0.6);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'breeze',
      name: 'Breeze',
      mesh: group,
      body, head, eyes, eyebrows, rods, wind,
      // Wiki: 30 HP.
      health: BREEZE_HEALTH,
      maxHealth: BREEZE_HEALTH,
      width: BREEZE_DIMENSIONS.width,
      height: BREEZE_DIMENSIONS.height,
      isFlying: false,
      // Wiki entity tags: deflects_arrows, deflects_tridents, fall_damage_immune, can_turn_in_boats.
      ...BREEZE_TRAITS,
      // The leap cycle.
      leapState: 'idle',
      // Set explicitly: updateBreezeLeap reads onGround to decide whether the leap cycle may start,
      // and an undefined value took the airborne path, so a breezed spawned standing on the ground
      // skipped its compression and never entered the cycle at all.
      onGround: true,
      jumpCooldown: rollBreezeJumpDelay(options.random || Math.random),
      compressTimer: 0,
      slideTimer: 0,
      chargeCooldown: 0,
      breezePhase: 0,
      isHostile: false,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Build a zombie variant by reusing the zombie model.
   *
   * Wiki: a husk is "a variant of the zombie that spawn in deserts". It shares the geometry and
   * differs in appearance, in not burning in sunlight, and in inflicting Hunger with an unarmed
   * attack. Delegating here means the model cannot drift away from the zombie's.
   */
  spawnZombieVariant(x, y, z, variant, options = {}) {
    const mob = this.spawnZombie(x, y, z, { variant, ...options });
    if (!mob) return mob;
    applyVariantIdentity(mob, variant, options);
    return mob;
  }

  /**
   * Build a skeleton variant (stray or bogged) by reusing the skeleton model.
   *
   * Wiki: a stray is "a skeleton variant that spawns in various snow-covered biomes" and a bogged is
   * "a mushroom-covered skeleton variant". Both are archers differing in health, appearance and the
   * status effect on their arrow.
   */
  spawnSkeletonVariant(x, y, z, variant, options = {}) {
    const mob = this.spawnSkeleton(x, y, z, { variant, ...options });
    if (!mob) return mob;
    applyVariantIdentity(mob, variant, options);
    return mob;
  }

  /**
   * Armadillo.
   *
   * Wiki: 12 HP passive mob. It rolls into a ball when hurt or when it detects a threat (undead mobs,
   * or players who are sprinting or mounted), takes `(damage - 1) / 2` while rolled, repels spiders and
   * cave spiders while NOT rolled, and sheds an armadillo scute every 5-10 minutes. It is the only
   * source of scutes, and it drops no items at all on death.
   */
  spawnArmadillo(x, y, z, options = {}) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: ARMADILLO_COLORS.body });
    const shellMat = new THREE.MeshLambertMaterial({ color: ARMADILLO_COLORS.shell });
    const bandMat = new THREE.MeshLambertMaterial({ color: ARMADILLO_COLORS.band });
    const darkMat = new THREE.MeshLambertMaterial({ color: ARMADILLO_COLORS.dark });

    // A low, long body with a domed banded shell on top.
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.7), bodyMat);
    body.position.y = 0.3;
    group.add(body);

    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.26, 0.66), shellMat);
    shell.position.y = 0.5;
    group.add(shell);

    // Three darker bands across the shell, which is what makes it read as an armadillo.
    const bands = [];
    for (const z0 of [-0.2, 0, 0.2]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.28, 0.06), bandMat);
      band.position.set(0, 0.5, z0);
      group.add(band);
      bands.push(band);
    }

    // A pointed snout on a small head, held low.
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), bodyMat);
    head.position.set(0, 0.34, 0.44);
    group.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.16), darkMat);
    snout.position.set(0, -0.02, 0.18);
    head.add(snout);

    // Ears, small and rounded.
    const ears = [];
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.04), darkMat);
      ear.position.set(side * 0.1, 0.12, -0.02);
      head.add(ear);
      ears.push(ear);
    }

    // Four short legs and a tapering tail.
    const legGeo = new THREE.BoxGeometry(0.12, 0.2, 0.12);
    const legs = [];
    for (const [lx, lz] of [[-0.18, 0.22], [0.18, 0.22], [-0.18, -0.22], [0.18, -0.22]]) {
      const leg = new THREE.Mesh(legGeo, darkMat);
      leg.position.set(lx, 0.1, lz);
      group.add(leg);
      legs.push(leg);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26), bandMat);
    tail.position.set(0, 0.28, -0.44);
    group.add(tail);

    group.position.set(x, y, z);
    if (options.isBaby) group.scale.setScalar(ARMADILLO_BABY_SCALE);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? ARMADILLO_BABY_DIMENSIONS : ARMADILLO_DIMENSIONS;
    const mob = {
      type: 'armadillo',
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Armadillo',
      mesh: group,
      head,
      legs,
      ears,
      bands,
      bodyMat, shellMat, bandMat, darkMat,
      // Wiki: 12 HP.
      health: ARMADILLO_HEALTH,
      maxHealth: ARMADILLO_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      speed: ARMADILLO_SPEED,
      // The rolling state machine. Wiki: `state` is idle, scared or unrolling.
      rollState: 'idle',
      noThreatSeconds: 0,
      peekTimer: 0,
      peekHold: 0,
      lastAttacker: null,
      threatTimer: 0,
      // Wiki: a scute drops every 5-10 minutes, on a timer reset to a fresh 6000-12000 ticks.
      scuteTimer: rollScuteDelay(options.random || Math.random),
      armadilloPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (options.isBaby) mob.growthTimer = ARMADILLO_GROWTH_SECONDS;
    this.mobs.push(mob);
    return mob;
  }

  spawnPolarBear(x, y, z, options = {}) {
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
      // Wiki: 30 HP.
      health: POLAR_BEAR_HEALTH,
      maxHealth: POLAR_BEAR_HEALTH,
      isBaby: !!options.isBaby,
      // Wiki: adult 1.4 x 1.4, baby 0.7 x 0.7. Without these the collision fell back to the
      // humanoid default of 0.6 x 1.95, which is both too narrow and too tall for a bear.
      width: (options.isBaby ? POLAR_BEAR_BABY_DIMENSIONS : POLAR_BEAR_DIMENSIONS).width,
      height: (options.isBaby ? POLAR_BEAR_BABY_DIMENSIONS : POLAR_BEAR_DIMENSIONS).height,
      // Wiki: 60% knockback resistance, and immune to freezing damage from powder snow.
      knockbackResistance: POLAR_BEAR_KNOCKBACK_RESISTANCE,
      freezeImmune: true,
      // Wiki: immune to freezing, but NOT to fall damage.
      fallDamageImmune: false,
      // Stance: a cub is passive, an adult is neutral until provoked or a cub is threatened.
      stance: options.isBaby ? 'passive' : 'neutral',
      isHostile: false,
      angryAt: null,
      isMauling: false,
      maulTimer: 0,
      polarPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (options.isBaby) {
      group.scale.setScalar(POLAR_BEAR_BABY_SCALE);
      mob.growthTimer = POLAR_BEAR_GROWTH_SECONDS;
    }
    this.mobs.push(mob);
    return mob;
  }

  spawnPanda(x, y, z, options = {}) {
    const group = new THREE.Group();
    // Wiki: the mutation table also applies to naturally spawned pandas, for both genes.
    const genes = options.mainGene !== undefined
      ? { mainGene: options.mainGene, hiddenGene: options.hiddenGene ?? options.mainGene }
      : rollPandaGenes(options.random || Math.random);
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
      // A definite groundedness. A branch reads this to decide whether the mob may act, and leaving it
      // undefined made a mob standing on solid ground behave as though it were airborne.
      onGround: true,
      name: 'Panda',
      mesh: group,
      head: head,
      legs: [fl, fr, bl, br],
      // The two materials the model is built from, so `applyPandaColors` can recolour a brown panda
      // without traversing for them.
      darkMat: blackMat,
      lightMat: whiteMat,
      // Wiki: a panda has a MainGene and a HiddenGene, and the personality follows from them.
      mainGene: genes.mainGene,
      hiddenGene: genes.hiddenGene,
      isBaby: !!options.isBaby,
      // Wiki: 1.3 x 1.25, and half that for a baby. Without these the collision fell back to
      // the humanoid default of 0.6 x 1.95.
      width: (options.isBaby ? PANDA_BABY_DIMENSIONS : PANDA_DIMENSIONS).width,
      height: (options.isBaby ? PANDA_BABY_DIMENSIONS : PANDA_DIMENSIONS).height,
      // Wiki: neutral, and passive on Peaceful. An aggressive panda hunts continuously and does
      // not panic when harmed.
      isHostile: false,
      angryAt: null,
      isLyingDown: false,
      isRolling: false,
      isThundering: false,
      sneezeTimer: 0,
      pandaPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    applyPandaPersonality(mob);
    // Wiki: a brown panda is brown and white. The other six personalities share the normal palette.
    applyPandaColors(mob);
    if (options.isBaby) group.scale.setScalar(PANDA_BABY_SCALE);
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
    const { mesh: group, head, tiers, smoke, flames } = createBlazeModel(this.textures);

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

  /**
   * Piglin brute.
   *
   * Wiki: 50 HP, the piglin box, wielding a golden axe for 7.5/13/19.5 damage, and hostile. "Unlike
   * piglins, piglin brutes do not barter, retreat, or get distracted by gold" -- those three differences
   * are gated inside the piglin AI, so this builds a piglin and then applies the brute identity.
   */
  spawnPiglinBrute(x, y, z, options = {}) {
    const mob = this.spawnPiglin(x, y, z);
    if (!mob) return mob;
    makePiglinBrute(mob);
    // Wiki: a brute always wields its axe, unlike a piglin which sometimes spawns unarmed.
    mob.weapon = PIGLIN_BRUTE_WEAPON;
    mob.hasGoldenAxe = true;
    // Wiki: "do not barter, retreat, or get distracted by gold", recorded on the mob so the flags travel
    // with it and a save/reload keeps the identity.
    mob.barters = PIGLIN_BRUTE_DIFFERENCES.barters;
    mob.retreats = PIGLIN_BRUTE_DIFFERENCES.retreats;
    mob.distractedByGold = PIGLIN_BRUTE_DIFFERENCES.distractedByGold;
    mob.isBrute = true;
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

  /**
   * Fire a shulker bullet at the player.
   *
   * The shulker carried `range: 16` and `damage: 4` in `ambientLocomotion.js` and could never use either: the
   * stationary branch returned before any attack logic, so a shulker was a turret that never fired. Its
   * bullet is also the only source of `levitation` in vanilla.
   */
  fireShulkerBullet(mob, player, spec) {
    const data = shulkerBulletData(mob, player, spec);
    if (!data) return null;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x9333ea }),
    );
    mesh.position.copy(mob.mesh.position);
    mesh.position.y += 0.5;
    this.scene.add(mesh);
    if (!this.customProjectiles) this.customProjectiles = [];
    this.customProjectiles.push({ mesh, ...data, isShulkerBullet: true });
    this.sounds?.playShulkerShoot?.();
    return data;
  }

  spawnShulker(x, y, z) {    const group = new THREE.Group();
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
  spawnWolf(x, y, z, options = {}) {
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

    // Collar mesh (hidden until tamed). Wiki: the default collar colour is red, but a caller can ask
    // for another one; this used to be hardcoded, so `options.collarColor` was ignored at spawn even
    // though dying a collar later worked.
    const requestedCollar = options.collarColor ?? WOLF_DEFAULT_COLLAR;
    const collarMat = new THREE.MeshLambertMaterial({
      color: SHEEP_COLOR_HEX[requestedCollar] ?? SHEEP_COLOR_HEX[WOLF_DEFAULT_COLLAR]
    });
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
    if (options.isBaby) group.scale.setScalar(0.5);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const wolfDims = options.isBaby ? WOLF_DIMENSIONS.baby : WOLF_DIMENSIONS.adult;
    const mob = {
      type: 'wolf',
      name: 'Wolf',
      mesh: group,
      head: head,
      collarMesh: collar,
      tailMesh: tail,
      legs: [fl, fr, bl, br],
      // Wiki: a wild wolf has 8 HP. The 20 previously here is neither the wild value nor
      // the tamed value, and taming did not change it.
      health: WOLF_WILD_HEALTH,
      maxHealth: WOLF_WILD_HEALTH,
      isBaby: !!options.isBaby,
      isTamed: false,
      width: wolfDims.width,
      height: wolfDims.height,
      collarColor: requestedCollar,
      // Wiki: wolf armor is dropped when the wolf dies.
      wolfArmor: options.wolfArmor ?? null,
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
      // Wiki: maximum health is the size squared, and the hitbox side is size * 0.52.
      // This previously used `size * 4`, which was wrong for every size but large.
      health: cubeHealth(size),
      maxHealth: cubeHealth(size),
      width: cubeSide(size),
      height: cubeSide(size),
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0,
      // Wiki: a cube hops every 0.5-1.5s, and turns every 2-5s while it has no target.
      hopTimer: 0,
      cubeTurnTimer: 0,
      cubeAttackCooldown: 0
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

    // Broad wings, split into two pivots. The shared `moveFlyingMob` helper writes
    // `mob.wings.left.rotation.z`, so a single undivided wing mesh freezes the mob -- the trap the
    // bat fell into.
    const wings = createPhantomWings(phantomMat, group);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'phantom',
      name: 'Phantom',
      mesh: group,
      isFlying: true,
      // Wiki: 20 HP, and a phantom always has 20 regardless of its size.
      health: PHANTOM_HEALTH,
      maxHealth: PHANTOM_HEALTH,
      width: PHANTOM_DIMENSIONS.width,
      height: PHANTOM_DIMENSIONS.height,
      wings,
      eyeMeshes: [eyeL, eyeR],
      // Wiki entity tags: undead, burn_in_daylight, fall_damage_immune, can_breathe_under_water,
      // ignores_poison_and_regen, inverted_healing_and_harm, sensitive_to_smite.
      isUndead: true,
      burnsInDaylight: true,
      fallDamageImmune: true,
      canBreatheUnderwater: true,
      poisonImmune: true,
      // Undead are healed by Instant Damage and hurt by Instant Health, which the shared status
      // system reads.
      invertedHealing: true,
      // Wiki: a phantom "tries to stay at least 16 blocks away" from cats.
      fearsCats: true,
      // Sunlight burning, and the swoop state.
      isBurning: false,
      burnTimer: 0,
      inSunlight: false,
      swoopState: null,
      swoopTimer: 0,
      anchorPos: null,
      circlePhase: 0,
      pitch: 0,
      target: null,
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
  spawnEnderman(x, y, z, options = {}) {
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
      // This is a wild enderman; the tournament alias belongs to the arena, not the species.
      name: 'Enderman',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      eyeMat: eyeMat,
      // Wiki: 0.6 wide, 2.9 tall.
      width: 0.6,
      height: 2.9,
      // Wiki: 40 HP. The 60 previously here matches no release.
      health: 40,
      maxHealth: 40,
      // Wiki: neutral, not a boss. Marking it a boss halved its knockback through the
      // generic `isBoss` factor, which is a boss-only rule it never had.
      isBoss: false,
      velocity: new THREE.Vector3(),
      yaw: 0,
      // Wild endermen are NEUTRAL. This was `state: 'combat'` with `teleportCooldown: 4.5`, which is the
      // tournament arena's behaviour: it teleported toward the player within five seconds of the world
      // loading and then chased and hit them, without ever having been provoked. See src/endermanBehavior.js.
      ...createWildEndermanState(),
      attackCooldown: 0,
      hitCooldown: 0,
      // Set when this enderman is the tournament challenger, so the scripted behaviour stays available where
      // it belongs rather than applying to the species.
      arenaChallenger: options.arenaChallenger === true,
      // Wiki: the block it is carrying drops on death. Not yet implemented; the slot
      // exists so the drop path and telemetry can report it.
      carriedBlock: options.carriedBlock ?? null
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
        // A validated destination, or none.
        //
        // This used to pick a spot 6-16 blocks from **the player 60% of the time**, which is why an enderman
        // kept reappearing beside whoever it was following, and to fall back to
        // `mob.position + random jitter` with no check at all when it found nowhere -- so a failed search
        // could leave it inside rock. A wild enderman now teleports near itself, only to somewhere it fits,
        // and stays put when there is nowhere. Teleporting is not spawning: the natural-spawn distance rules
        // do not apply to a destination, but the destination still has to be able to hold it.
        const origin = mob.mesh.position;
        const destination = pickTeleportDestination({
          origin: { x: origin.x, y: origin.y, z: origin.z },
          random: Math.random,
          isValid: (x, y, z) => isValidTeleportDestination(
            this.game?.world ?? this.world,
            x, y, z,
            {
              isSolid: (id) => this.isBlockSolid(Math.floor(x), Math.floor(y), Math.floor(z))
                || (id !== 0 && id !== undefined && this.game?.world?.isSolidBlock?.(id) === true),
              isFluid: (id) => this.game?.world?.isFluidBlock?.(id) === true,
              width: mob.width,
            }),
        });
        if (!destination) {
          // Nowhere to go. Reported rather than moved somewhere invalid.
          return false;
        }
        newX = destination.x;
        newY = destination.y;
        newZ = destination.z;
      }
    }

    mob.mesh.position.set(newX, newY, newZ);
    mob.velocity.set(0, 0, 0);

    this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), 22);
    if (this.sounds?.playEndermanTeleport) {
      this.sounds.playEndermanTeleport();
    }
  }

  /**
   * Happy ghast.
   *
   * Wiki: 20 HP, 4.0 x 4.0 (a ghastling 0.95), speed 0.05, passive. It is a FLYING MOUNT: "Up to four
   * players can ride a happy ghast", it is bound to a home it roams around, and it can airlift leashed
   * entities. It spawns when a dried ghast is rehydrated in water, as a ghastling.
   */
  spawnHappyGhast(x, y, z, options = {}) {
    const group = new THREE.Group();
    const colors = HAPPY_GHAST_COLORS;
    const skinMat = new THREE.MeshLambertMaterial({ color: colors.skin });
    const tentacleMat = new THREE.MeshLambertMaterial({ color: colors.tentacle });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const mouthMat = new THREE.MeshLambertMaterial({ color: colors.mouth });
    const { group: model, body, face, eyes, mouth, tentacles, harness, goggles } =
      createHappyGhastModel(skinMat, tentacleMat, eyeMat, mouthMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const isBaby = !!options.isBaby;
    const mob = {
      type: 'happy_ghast',
      name: isBaby ? 'Ghastling' : 'Happy Ghast',
      isBaby,
      // Wiki: the ghastling is 0.95 and the adult 4.0.
      width: isBaby ? GHASTLING_DIMENSIONS.width : HAPPY_GHAST_DIMENSIONS.width,
      height: isBaby ? GHASTLING_DIMENSIONS.height : HAPPY_GHAST_DIMENSIONS.height,
      mesh: group,
      body, face, eyes, mouth, tentacles, harness, goggles,
      // Wiki: 20 HP, the same for both ages.
      health: HAPPY_GHAST_HEALTH,
      maxHealth: HAPPY_GHAST_HEALTH,
      // Wiki: speed 0.05, and 3.6 m/s when ridden.
      speed: HAPPY_GHAST_SPEED,
      riddenSpeed: HAPPY_GHAST_RIDDEN_SPEED,
      // Wiki: passive, and a flying mob.
      isHostile: false,
      isPassive: true,
      isFlying: true,
      flying: true,
      // Wiki: it does not burn and is not undead.
      undead: false,
      burnsInDaylight: false,
      fireImmune: false,
      // Wiki: ghastlings, unlike adults, do NOT drown when submerged.
      canBreatheUnderwater: isBaby,
      // A flying mount, so it needs a hover altitude and no gravity.
      homeAltitude: y,
      // Wiki: the home is set where it spawns.
      home: new THREE.Vector3(x, y, z),
      // Wiki: only an adult can be harnessed and ridden.
      hasHarness: isBaby ? false : !!options.hasHarness,
      riders: [],
      seats: {},
      pilot: null,
      cargo: [],
      tempted: false,
      // The ghastling growth clock.
      growthRemaining: isBaby ? GHASTLING_GROWTH_SECONDS : 0,
      snowballsFed: 0,
      target: null,
      bobPhase: Math.random() * Math.PI * 2,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Copper golem.
   *
   * Wiki: 12 HP, 0.49 x 0.98, speed 0.2, passive. It "takes items out of copper chests, and attempts to
   * store them in nearby wooden chests and trapped chests", and if it is not waxed it oxidizes through four
   * stages until it becomes a statue, dropping whatever it was holding.
   */
  spawnCopperGolem(x, y, z, options = {}) {
    const group = new THREE.Group();
    const stage = options.oxidationStage ?? 'unoxidized';
    const color = copperGolemColor(stage);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0xd98d63 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1d2b1a });
    const { group: model, body, head, eyes, antenna, bulb, arms, legs, held } =
      createCopperGolemModel(bodyMat, trimMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'copper_golem',
      name: 'Copper Golem',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, head, eyes, antenna, bulb, arms, legs, held,
      bodyMat, trimMat,
      // Wiki: 12 HP.
      health: COPPER_GOLEM_HEALTH,
      maxHealth: COPPER_GOLEM_HEALTH,
      width: COPPER_GOLEM_DIMENSIONS.width,
      height: COPPER_GOLEM_DIMENSIONS.height,
      // Wiki: speed 0.2.
      speed: COPPER_GOLEM_SPEED,
      // Wiki: passive.
      isHostile: false,
      isPassive: true,
      // The oxidation ladder.
      oxidationStage: stage,
      oxidationTimer: 0,
      waxed: !!options.waxed,
      isStatue: false,
      // The hauling job.
      heldItem: null,
      heldCount: 0,
      hasPoppy: false,
      // It is NOT undead, and it does not burn.
      undead: false,
      burnsInDaylight: false,
      copperGolemPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Camel husk.
   *
   * Wiki: 32 HP, the camel box, speed 0.09. The camel's UNDEAD variant: passive alone but hostile as a
   * jockey, ridden by an iron-spear husk with a parched passenger; it does not burn in sunlight, and it is
   * passive again once separated from its riders.
   */
  spawnCamelHusk(x, y, z, options = {}) {
    // The camel model is reused rather than duplicated: the wiki calls this a VARIANT and gives the same
    // hitbox, so only the palette differs.
    const group = new THREE.Group();
    const colors = CAMEL_HUSK_COLORS;
    const coatMat = new THREE.MeshLambertMaterial({ color: colors.coat });
    const humpMat = new THREE.MeshLambertMaterial({ color: colors.hump });
    const bellyMat = new THREE.MeshLambertMaterial({ color: colors.belly });
    const hoofMat = new THREE.MeshLambertMaterial({ color: colors.hoof });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group: model, body, belly, hump, neck, head, muzzle, eyes, legs, tail, saddle } =
      createCamelHuskModel(coatMat, humpMat, bellyMat, hoofMat, eyeMat, createCamelModel);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'camel_husk',
      name: 'Camel Husk',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, belly, hump, neck, head, muzzle, eyes, legs, tail, saddleMesh: saddle,
      // Wiki: 32 HP.
      health: CAMEL_HUSK_HEALTH,
      maxHealth: CAMEL_HUSK_HEALTH,
      width: CAMEL_HUSK_DIMENSIONS.width,
      height: CAMEL_HUSK_DIMENSIONS.height,
      // Wiki: speed 0.09.
      speed: CAMEL_HUSK_SPEED,
      // Wiki: undead, and it does not burn in sunlight.
      undead: CAMEL_HUSK_UNDEAD_TRAITS.undead,
      poisonImmune: CAMEL_HUSK_UNDEAD_TRAITS.poisonImmune,
      invertedHealing: CAMEL_HUSK_UNDEAD_TRAITS.invertedHealing,
      canBreatheUnderwater: CAMEL_HUSK_UNDEAD_TRAITS.canBreatheUnderwater,
      sensitiveToSmite: CAMEL_HUSK_UNDEAD_TRAITS.sensitiveToSmite,
      burnsInDaylight: camelHuskBurnsInDaylight(),
      // Wiki: passive alone, hostile as a jockey. The flag tracks the riders.
      isHostile: false,
      riders: [],
      riderCount: 0,
      isJockey: false,
      // It shares the camel's step and fall traits, since the wiki gives it the camel body.
      stepHeight: CAMEL_STEP_HEIGHT,
      fallDamageReduction: CAMEL_FALL.safeBlocks,
      fallDamageMultiplier: CAMEL_FALL.damagePerBlock,
      // The sit cycle, shared with the camel.
      isSitting: false,
      sitTimer: 0,
      standTimer: rollCamelStandDelay(options.random || Math.random),
      hasSaddle: !!options.hasSaddle,
      tame: !!options.tame,
      camelHuskPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    if (saddle) saddle.visible = mob.hasSaddle;
    this.mobs.push(mob);
    // Wiki: it arrives as a jockey, ridden by a husk with a parched passenger. Opt-out so a test or a bare
    // spawn does not have to build three mobs.
    if (options.withJockey) mountCamelHuskJockey(this, mob);
    return mob;
  }

  /**
   * Giant.
   *
   * Wiki: 100 HP, 3.6 x 12 -- a six-times-enlarged zombie model -- dealing 26/50/75 by difficulty, and
   * spawnable only by command. It is NOT undead, so it does not burn in sunlight and is neither harmed by
   * Smite nor healed by Harming. Most importantly it "currently ha[s] no AI": it always faces south, never
   * wanders, cannot turn its head, chase, or respond to damage.
   */
  spawnGiant(x, y, z, options = {}) {
    const group = new THREE.Group();
    const colors = GIANT_COLORS;
    const skinMat = new THREE.MeshLambertMaterial({ color: colors.skin });
    const shirtMat = new THREE.MeshLambertMaterial({ color: colors.shirt });
    const trousersMat = new THREE.MeshLambertMaterial({ color: colors.trousers });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group: model, body, head, eyes, arms, legs } =
      createGiantModel(skinMat, shirtMat, trousersMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    // Wiki: "they always face south when summoned, and they always stay that way".
    group.rotation.y = GIANT_FACING_YAW;
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'giant',
      name: 'Giant',
      // A definite groundedness, so no branch reads undefined.
      onGround: true,
      mesh: group,
      body, head, eyes, arms, legs,
      // Wiki: 100 HP.
      health: GIANT_HEALTH,
      maxHealth: GIANT_HEALTH,
      width: GIANT_DIMENSIONS.width,
      height: GIANT_DIMENSIONS.height,
      // Wiki: the giant has no speed listed and no AI to use one with.
      speed: 0,
      isHostile: true,
      attackDamage: GIANT_DAMAGE.normal,
      // Wiki: "Giants are not undead mobs." Every one of these follows from that sentence.
      undead: GIANT_UNDEAD_PROPERTIES.undead,
      burnsInDaylight: GIANT_UNDEAD_PROPERTIES.burnsInDaylight,
      immuneToSmite: GIANT_UNDEAD_PROPERTIES.harmedBySmite === false,
      // Wiki: no AI at all.
      hasAI: GIANT_HAS_AI,
      immobile: true,
      giantPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: GIANT_FACING_YAW,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Pufferfish.
   *
   * Wiki: 3 HP, neutral, speed 0.7. It never seeks a fight and instead inflates through two stages as a
   * player, an axolotl or a NON-AQUATIC mob approaches, dealing contact damage TOGETHER WITH Poison that
   * scales with how puffed it is. Its hitbox grows from 0.35 to 0.7 with the puff.
   */
  spawnPufferfish(x, y, z, options = {}) {
    const group = new THREE.Group();
    const colors = FISH_COLORS.pufferfish;
    const bodyMat = new THREE.MeshLambertMaterial({ color: colors.body });
    const bellyMat = new THREE.MeshLambertMaterial({ color: colors.belly });
    const spineMat = new THREE.MeshLambertMaterial({ color: colors.spine });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group: model, body, belly, eyes, tail, spines } =
      createPufferfishModel(bodyMat, bellyMat, spineMat, eyeMat);
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'pufferfish',
      name: 'Pufferfish',
      mesh: group,
      body, belly, eyes, tail, spines,
      health: PUFFERFISH_HEALTH,
      maxHealth: PUFFERFISH_HEALTH,
      width: PUFFERFISH_DIMENSIONS.unpuffed.width,
      height: PUFFERFISH_DIMENSIONS.unpuffed.height,
      speed: FISH_SPEED,
      // Wiki: neutral, not hostile. It never seeks a fight.
      isHostile: false,
      isNeutral: true,
      // `updateAquaticMob` keys off `isAquatic`, not `aquatic`, and it needs the swim state below.
      isAquatic: true,
      aquatic: true,
      inWater: true,
      // The shared aquatic handler reads these; without them `swimCycle` becomes NaN and the fish never
      // chooses a swim target, so it spawns and then never moves.
      swimCycle: Math.random() * 10,
      targetPos: null,
      pitch: 0,
      // `updateAquaticMob`'s out-of-water branch does `flopTimer -= dt`, and on `undefined` that is NaN --
      // and `NaN <= 0` is always false, so the flop impulse never fired and the fish never moved at all.
      flopTimer: 0,
      // The puff state.
      puffStage: 'unpuffed',
      puffProgress: 0,
      puffed: false,
      threat: null,
      puffDamageCooldown: 0,
      fishPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
  }

  /**
   * Tropical fish.
   *
   * Wiki: 3 HP, passive, speed 0.7, 0.5 x 0.4, with 3,072 naturally occurring variants in Java drawn
   * from two body shapes, a pattern, and three colours from a palette of 16.
   */
  spawnTropicalFish(x, y, z, options = {}) {
    const variant = options.variant ?? rollTropicalFishVariant(options.random || Math.random);
    const group = new THREE.Group();
    const colors = FISH_COLORS.tropical_fish;
    // The variant colours drive the materials, which is the only visual difference between the 3,072.
    const bodyMat = new THREE.MeshLambertMaterial({ color: options.baseHex ?? colors.body });
    const finMat = new THREE.MeshLambertMaterial({ color: options.finHex ?? colors.fin });
    const eyeMat = new THREE.MeshBasicMaterial({ color: colors.eye });
    const { group: model, body, tail, fins, dorsal, eyes } =
      createTropicalFishModel(bodyMat, finMat, eyeMat);
    if (variant.shape === 'large') {
      // The large shapes are taller, which the wiki contrasts with the small ones.
      model.scale.set(1, 1.25, 1);
    }
    group.add(model);
    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'tropical_fish',
      name: 'Tropical Fish',
      mesh: group,
      body, tail, fins, dorsal, eyes,
      variant,
      variantName: tropicalFishVariantName(variant),
      health: TROPICAL_FISH_HEALTH,
      maxHealth: TROPICAL_FISH_HEALTH,
      width: TROPICAL_FISH_DIMENSIONS.width,
      height: TROPICAL_FISH_DIMENSIONS.height,
      speed: FISH_SPEED,
      // Wiki: passive.
      isHostile: false,
      isAquatic: true,
      aquatic: true,
      inWater: true,
      // The same swim state the pufferfish needs, for the same reason.
      swimCycle: Math.random() * 10,
      targetPos: null,
      pitch: 0,
      // `updateAquaticMob`'s out-of-water branch does `flopTimer -= dt`, and on `undefined` that is NaN --
      // and `NaN <= 0` is always false, so the flop impulse never fired and the fish never moved at all.
      flopTimer: 0,
      fishPhase: 0,
      velocity: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle',
      timer: 0,
      hitCooldown: 0
    };
    this.mobs.push(mob);
    return mob;
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
  spawnDolphin(x, y, z, options = {}) {
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
    // Wiki: babies are 0.65 of the adult model.
    group.scale.setScalar(options.isBaby ? DOLPHIN_BABY_SCALE : 1);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const dims = options.isBaby ? DOLPHIN_DIMENSIONS.baby : DOLPHIN_DIMENSIONS.adult;
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
      // Wiki: 10 HP. The 20 previously here matches no release.
      health: DOLPHIN_HEALTH,
      maxHealth: DOLPHIN_HEALTH,
      isBaby: !!options.isBaby,
      width: dims.width,
      height: dims.height,
      // Wiki `Moistness`: 2400 ticks of air before a dry dolphin starts suffocating.
      moistness: DOLPHIN_MOISTNESS_TICKS,
      suffocationTimer: 0,
      // Wiki: a dolphin that has been fed a fish leads the player to a shipwreck or ruins.
      gotFish: false,
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
    const hostileTypes = ['zombie', 'husk', 'skeleton', 'stray', 'bogged', 'parched', 'pillager', 'creeper', 'enderman'];
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
    if (attacker === this.game?.player || (mob.type !== 'blaze' && !isZombifiedPiglin(mob) && !attacker && knockbackOrigin)) mob.playerDamaged = true;
    if (mob.type === 'blaze') {
      if (attacker === this.game?.player || (attacker?.type === 'wolf' && attacker.isTamed)) {
        mob.playerDamaged = true;
      }
      if (attacker === this.game?.player) {
        const enchantments = attacker.inventory?.getActiveItem?.()?.enchantments;
        const level = Array.isArray(enchantments) ? enchantments.find(e => e.id === 'looting')?.level : enchantments?.looting;
        mob.blazeLooting = Math.max(0, Math.min(3, level || 0));
      }
      if (attacker) alertBlazes(this, mob, attacker);
    }
    if(mob.type==='strider'){
      this.sounds?.playStrider?.(mob.health<=amount?'death':'retreat');mob.soundTimer=3;
      if(attacker?.type==='wolf'&&attacker.isTamed)mob.wolfKilled=true;
      if(attacker===this.game?.player){const e=attacker.inventory?.getActiveItem?.()?.enchantments;mob.lootingLevel=Math.max(0,Math.min(3,(Array.isArray(e)?e.find(v=>v.id==='looting')?.level:e?.looting)||0));}
    }
    // Wiki: a creeper killed by a skeleton's or stray's arrow drops a music disc, at random from the
    // twelve a creeper can give. The flag has to be set here rather than at death because `attacker` is
    // only known at damage time, which is the same reason `wolfKilled` and `playerDamaged` exist.
    // `isPunch` is what separates an arrow from a melee hit, which vanilla does not count -- and an
    // exploded creeper sets `noLoot`, so shooting one and then letting it blow up still gives nothing.
    if(mob.type==='creeper'&&!isPunch&&(attacker?.type==='skeleton'||attacker?.type==='stray'))mob.shotBySkeleton=true;
    if(isSquid(mob)&&attacker?.type==='wolf'&&attacker.isTamed)mob.wolfKilled=true;
    if(isSquid(mob)&&attacker===this.game?.player){mob.playerCreditSeconds=5;const e=attacker.inventory?.getActiveItem?.()?.enchantments;mob.lootingLevel=Math.max(0,Math.min(3,(Array.isArray(e)?e.find(v=>v.id==='looting')?.level:e?.looting)||0));}
    // Wiki: a rolled armadillo "takes a reduced amount of damage given by (original damage-1)/2", and
    // self-destruct damage is exempt. Applied before the subtraction so the hurt flash and cooldown
    // still fire for an attack that lands for zero.
    if (isArmadillo(mob) && isRolledUp(mob)) {
      amount = armadilloDamageReduction(amount, { rolled: true });
    }
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
    } else if (mob.type === 'spider' || mob.type === 'cave_spider') {
      // Wiki: both variants pursue whatever attacked them regardless of the light level,
      // even if they had returned to neutral in bright light.
      angerSpider(mob, attacker);
    } else if (mob.type === 'silverfish') {
      // Wiki: hitting one calls other silverfish in a 21x11x21 area to help.
      angerSilverfish(mob, attacker);
      alertSilverfish(this, mob, attacker);
    } else if (mob.type === 'goat') {
      // A goat never retaliates; the wiki is explicit that it cannot be provoked.
      return;
    } else if (mob.type === 'armadillo') {
      // Wiki: an armadillo hides in its shell when it is hurt, and remembers the attacker as a threat.
      onArmadilloHurt(mob, attacker ?? (knockbackOrigin ? this.game?.player : null));
    } else if (mob.type === 'panda') {
      // Wiki: when a panda is attacked, aggressive pandas nearby turn hostile unless it was killed
      // in one hit. A non-aggressive panda retaliates only once, which the branch enforces.
      if (!mob.isBaby) {
        mob.isHostile = true;
        mob.angryAt = attacker ?? null;
      }
      alertAggressivePandas(this, mob, attacker, { lethal: mob.health <= 0 });
    } else if (mob.type === 'polar_bear') {
      // Wiki: a surviving cub makes every adult in a 41x21x41 area hostile; an adult near a cub
      // provokes the adults around it.
      onPolarBearHurt(this, mob, attacker, {
        lethal: mob.health <= 0,
        difficulty: this.game?.difficulty ?? 'normal'
      });
    } else if (mob.type === 'phantom') {
      // Wiki: hurt mid-swoop makes it retreat to its anchor instead of pressing the attack.
      onPhantomHurt(mob);
    } else if (mob.type === 'parrot') {
      // Wiki: taking damage is one of the states that forces a parrot off a shoulder.
      if (mob.perchedOn) { dismountShoulder(mob, this.game?.player); mob.velocity.set(0, 1.5, 0); }
    } else if (isLlamaLike(mob)) {
      // Wiki: a llama retaliates when attacked by a player or another mob, and is hostile toward
      // wolves without provocation.
      mob.recentAttacker = attacker || null;
      mob.spitCooldown = 0;
    } else if (isKillerBunny(mob)) {
      // Wiki: the killer bunny retreats briefly when struck, then returns to lunging.
      onKillerBunnyHurt(mob);
    } else if (mob.type === 'bee') {
      // Wiki: "All bees nearby are angered when an individual bee is attacked, unless the bee
      // attacked is killed in one hit."
      angerBees(this, mob, attacker, { lethal: mob.health <= 0 });
    }

    if (mob.health <= 0 && mob.type === 'fox' && !mob.totemChecked) {
      // Wiki: "If a fox is killed while holding a totem of undying, then the fox consumes the
      // totem and revives itself instead of dropping the totem."
      mob.totemChecked = true;
      if (consumeFoxTotem(mob)) {
        mob.health = Math.max(1, Math.ceil(mob.maxHealth * 0.5));
        mob.dying = false;
        this.attachFoxHeldItem(mob);
      }
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
      // Being hit is the other way to anger one, and the only one that works through a pumpkin.
      provoke(mob, 'damage');
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
      // Wiki: 0-1 ender pearl.
      enderman: [['ender_pearl', false, 0, 1]],
      // Wiki: 0-1 raw cod (cooked cod if burning), not salmon.
      dolphin: [[burned ? 'cooked_cod' : 'cod', false, 0, 1]],
      octopus: [['ink_sac', false, 1, 3]],
      squid: [['ink_sac', false, 1, 3]],
      glow_squid: [['glow_ink_sac', false, 1, 3]],
      skeleton: [['bone', false, 1, 2], ['arrow', false, 1, 2]],      // Wiki: a stray and a bogged drop bones and arrows like a skeleton, plus their tipped arrow.
      stray: [['bone', false, 0, 2], ['arrow', false, 0, 2]],
      bogged: [['bone', false, 0, 2], ['arrow', false, 0, 2]],
      // Wiki: a parched drops bones and arrows like a skeleton, plus its Arrow of Weakness.
      parched: [['bone', false, 0, 2], ['arrow', false, 0, 2]],
      creeper: [['gunpowder', false, 1, 2]],
      zombie: [['rotten_flesh', false, 1, 2], ['iron_ingot', false, 1, 1, 0.008333333333333333], ['carrot', false, 1, 1, 0.008333333333333333], ['potato', false, 1, 1, 0.008333333333333333]],
      // Wiki: a husk drops rotten flesh like a zombie.
      husk: [['rotten_flesh', false, 0, 2], ['iron_ingot', false, 1, 1, 0.008333333333333333], ['carrot', false, 1, 1, 0.008333333333333333], ['potato', false, 1, 1, 0.008333333333333333]],
      zombie_villager: [['rotten_flesh', false, 1, 2], ['iron_ingot', false, 0, 1], ['carrot', false, 1, 1, 0.008333333333333333], ['potato', false, 1, 1, 0.008333333333333333]],
      iron_golem: [['iron_ingot', false, 3, 5], [BLOCKS.POPPY, true, 1, 1]],
      pillager: [['arrow', false, 1, 2]],
      vindicator: [['emerald', false, 0, 1]],
      evoker: [['totem_of_undying', false, 1, 1], ['emerald', false, 1, 1]],
      blaze: mob.playerDamaged ? [['blaze_rod', false, 0, 1 + (mob.blazeLooting || 0)]] : [],
      ghast: [['ghast_tear', false, 0, 1], ['gunpowder', false, 1, 2]],
      piglin: !mob.isBaby && !mob.equipment?.weapon && Math.random() < 0.085 ? [[mob.weapon || 'golden_sword', false, 1, 1]] : [],
      zoglin: [['rotten_flesh', false, 1, 3]],
      zombified_piglin: [['rotten_flesh', false, 0, 2], ['gold_nugget', false, 1, 3], ['gold_ingot', false, 0, 1], ['golden_sword', false, 0, 1]],
      zombie_pigman: [['rotten_flesh', false, 0, 2], ['gold_nugget', false, 1, 3], ['gold_ingot', false, 0, 1], ['golden_sword', false, 0, 1]],
      hoglin: [[burned ? 'cooked_porkchop' : 'porkchop', false, 2, 4], ['leather', false, 0, 1]],
      strider: [['string', false, 2, 5 + (mob.lootingLevel || 0)]],
      // Wiki: only small slimes drop slimeballs. 0-2, and none when killed by a frog.
      // Slimes previously had no loot row at all, so they dropped nothing.
      slime: mob.playerDamaged && mob.slimeSize === 1 ? [['slime_ball', false, 0, 2]] : [],
      magma_cube: mob.playerDamaged && mob.slimeSize > 1 ? [['magma_cream', false, 0, 1]] : [],
      wither_skeleton: [['bone', false, 1, 2], ['coal', false, 1, 2], ['wither_skeleton_skull', false, 0, 1]],
      witch: [['glass_bottle', false, 1, 2], ['glowstone_dust', false, 1, 2], ['redstone', false, 1, 2], ['sugar', false, 1, 2]],
      guardian: [['prismarine_shard', false, 1, 2], ['prismarine_crystals', false, 0, 1]],
      elder_guardian: [[BLOCKS.WET_SPONGE, true, 1, 1], ['prismarine_shard', false, 2, 4], ['prismarine_crystals', false, 1, 2]],
      drowned: [['rotten_flesh', false, 1, 2], ['copper_ingot', false, 1, 1, 0.11],
        // Wiki: a drowned drops a nautilus shell 3% of the time, and the trident it was carrying 8.5% of
        // the time. Neither row existed, so a nautilus shell -- which is what a conduit is made of -- and a
        // trident had no source in the game at all. `mobLootData.js` carries the same two rows, and its
        // generator has them written down; see `MOB_LOOT_ADDITIONS` there, because that file is regenerated.
        ['nautilus_shell', false, 1, 1, 0.03], ['trident', false, 1, 1, 0.085]],
      warden: [[BLOCKS.SCULK_CATALYST, true, 1, 1]],
      wither: [['nether_star', false, 1, 1]],

      // Seven mobs that dropped nothing at all.
      //
      // Found by scripts/mob-drop-live.mjs, which spawns every vanilla loot-bearing mob and compares the
      // roll against vanilla's data. Each of these had neither a row here nor a per-mob helper, and each
      // drops something in vanilla. The counts are vanilla's own ranges rather than the simplified [1,1]
      // that minecraft-data publishes, because the rows around them follow the real ranges.
      //
      // The three near-misses that script also reports are deliberately NOT fixed here, because they are
      // not missing drops: the stray drops a named tipped-arrow variant, the turtle drops the seagrass
      // vanilla gives it, and the elder guardian's listed trim template is structure loot rather than a
      // mob drop.
      cat: [['string', false, 0, 2]],
      pufferfish: [['pufferfish', false, 1, 1]],
      ravager: [['saddle', false, 1, 1]],
      skeleton_horse: [['bone', false, 0, 2]],
      snow_golem: [['snowball', false, 0, 15]],
      tropical_fish: [['tropical_fish', false, 1, 1]],
      // Wiki: 2-3 rotten flesh, not 0-2. Its page gives a tighter floor than the zombie's own row.
      zombie_horse: [['rotten_flesh', false, 2, 3]]
    }[mob.type] || [];
    // Wiki: salmon have a flat 5% chance of bone meal, independent of the raw salmon drop.
    // Wiki: an enderman always drops the block it was carrying, in addition to its loot.
    const carried = mob.type === 'enderman' && mob.carriedBlock
      ? [[mob.carriedBlock, true, 1, 1]]
      : [];
    // Wiki: spiders drop string, plus a spider eye only with player kill credit.
    const foxRows = mob.type === 'fox' && !mob.isBaby ? foxDrops(mob) : [];
    // Wiki: a bee that died of its own sting was not killed, so it awards nothing.
    const beeRows = mob.type === 'bee' && !mob.diedOfSting ? beeDrops(mob) : [];
    // Wiki: a goat drops no items on death; its horns only come off against a hard block.
    const goatRows = isGoat(mob) ? goatDrops(mob) : [];
    // Wiki: a llama drops 0-2 leather, anything it is wearing, and everything it was carrying.
    const llamaRows = isLlamaLike(mob)
      ? [...(mob.playerDamaged || mob.wolfKilled ? [['leather', false, 0, 2]] : []),
         ...(mob.carpetColor ? [[mob.carpetColor, false, 1, 1]] : []),
         ...(mob.hasChest ? (mob.chestInventory || []).filter(Boolean).map(item => [item.id, !!item.isBlock, item.count || 1]) : [])]
      : [];
    const turtleRows = isTurtle(mob) ? turtleDrops(mob) : [];
    // Wiki: a frog drops no items; its loot is what it leaves when it eats something.
    const frogRows = isFrog(mob) ? frogDrops(mob) : [];
    // Wiki: a tadpole drops nothing at all, and awards no experience.
    const tadpoleRows = isTadpole(mob) ? tadpoleDrops(mob) : [];
    // Wiki: a parrot drops 1-2 feathers.
    const parrotRows = isParrot(mob) ? parrotDrops(mob) : [];
    // Wiki: a phantom drops 0-1 phantom membrane, with Looting adding 0-1 more, and a flat 5 XP.
    // The drop is produced by phantomDrops rather than a row here: the row this replaced hardcoded
    // 1-2, which is neither the wiki's base count nor its Looting behaviour.
    const phantomRows = isPhantom(mob) && (mob.playerDamaged || mob.wolfKilled) ? phantomDrops(mob, random) : [];
    // Wiki: Java picks one of cod or salmon on a 3/4 and 1/4 split, 0-2 of it, cooked if the bear
    // died on fire. A cub drops nothing.
    const polarRows = isPolarBear(mob) && (mob.playerDamaged || mob.wolfKilled) ? polarBearDrops(mob, random) : [];
    // Wiki: Java pandas drop exactly one bamboo, and a baby drops nothing.
    const pandaRows = isPanda(mob) ? pandaDrops(mob) : [];
    // Wiki: an armadillo drops no items on death -- the scute comes from shedding and brushing.
    const armadilloRows = isArmadillo(mob) ? armadilloDrops(mob) : [];
    // Wiki: a stray can drop an Arrow of Slowness and a bogged an Arrow of Poison, with player credit.
    const variantRows = variantBonusDrops(mob, random);
    // Wiki: a breeze drops 1-2 breeze rods, with Looting adding more, and a flat 10 XP.
    const breezeRows = isBreeze(mob) && (mob.playerDamaged || mob.wolfKilled) ? breezeDrops(mob, random) : [];
    // Wiki: a sniffer drops no items at all -- the seeds come from digging and the egg from breeding.
    const snifferRows = isSniffer(mob) ? snifferDrops(mob) : [];
    // Wiki: an allay drops the item it is holding and nothing else, and no experience at all.
    const allayRows = isAllay(mob) ? allayDrops(mob) : [];
    // Wiki: a wandering trader drops nothing and no experience, except the consumable it was holding.
    const traderRows = isWanderingTrader(mob) ? wanderingTraderDrops(mob, random) : [];
    // Wiki: a camel drops its saddle if it had one, and a baby camel drops nothing.
    const camelRows = isCamel(mob) ? camelDrops(mob) : [];
    // Wiki: a creaking drops no items at all.
    const creakingRows = isCreaking(mob) ? [] : [];
    // Wiki: the happy ghast's page has NO 'On death' section and its infobox lists only USABLE items, so it
    // drops nothing. That is deliberate rather than an omission, and the base table has no row for it.
    // Wiki: a copper golem drops 1-3 copper ingots. The row does not exist in the base table, so the manager
    // has to be told about it.
    const copperGolemRows = isCopperGolem(mob) ? copperGolemDrops(mob, random) : [];
    // Wiki: a camel husk drops 2-3 rotten flesh. This row does NOT exist in the base table yet, so unlike
    // the other mobs here the manager has to be told about it.
    const camelHuskRows = isCamelHusk(mob) ? camelHuskDrops(mob, random) : [];
    // Wiki: a creeper drops one gunpowder from the base table, and a music disc if a skeleton or a stray
    // killed it. `shotBySkeleton` is set in `damageMob`, where the attacker is still known.
    const creeperRows = mob.type === 'creeper' && mob.shotBySkeleton ? creeperDiscDrop(random) : [];
    // Wiki: a piglin brute drops its golden axe on an 8.5% roll.
    const piglinBruteRows = isPiglinBrute(mob) ? piglinBruteDrops(mob, random) : [];
    // Wiki: the giant's page gives no drop table and no experience value.
    // It is routed through the base table like every other mob, so nothing is added here.
    // Wiki: each fish drops its own item. That row ALREADY EXISTS in the base table below, so it is
    // deliberately not recomputed here: adding a second roll produced each drop twice.
    // Wiki: BOTH undead horses have their own rows in the base table below -- 0-2 bones for the skeleton
    // horse and 2-3 rotten flesh for the zombie horse -- so they are deliberately NOT recomputed here.
    // Wiki: an illusioner drops its bow on an 8.5% roll.
    const illusionerRows = isIllusioner(mob) ? illusionerDrops(mob, random) : [];
    // Wiki: a snow golem drops 0-15 snowballs. That row ALREADY EXISTS in the base table below, so it is
    // deliberately not recomputed here: adding a second roll produced two snowball drops instead of one.
    return [...base, ...salmonBonusDrops(mob, random), ...carried, ...spiderDrops(mob, random), ...silverfishDrops(mob), ...endermiteDrops(mob), ...rabbitDrops(mob, random), ...batDrops(mob), ...foxRows, ...beeRows, ...goatRows, ...llamaRows, ...turtleRows, ...frogRows, ...tadpoleRows, ...parrotRows, ...phantomRows, ...polarRows, ...pandaRows, ...armadilloRows, ...variantRows, ...breezeRows, ...snifferRows, ...allayRows, ...traderRows, ...camelRows, ...creakingRows, ...illusionerRows, ...piglinBruteRows, ...camelHuskRows, ...copperGolemRows, ...creeperRows];
  }

  /**
   * The registry name of the block at a position, lower case, or null.
   *
   * Needed by the goat's horn rule, which the wiki defines against a list of block *names* rather
   * than ids. The reverse lookup is built once on first use, because block ids are registry values
   * and this is the only place that needs to go backwards.
   */
  blockNameAt(x, y, z) {
    const id = this.world?.getVoxel?.(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id === undefined || id === null || id === 0) return null;
    if (!BLOCK_NAMES_BY_ID.size) {
      for (const [name, value] of Object.entries(BLOCKS)) {
        // Several aliases can share an id; the first name wins, which is the canonical one.
        if (typeof value === 'number' && !BLOCK_NAMES_BY_ID.has(value)) {
          BLOCK_NAMES_BY_ID.set(value, name.toLowerCase());
        }
      }
    }
    return BLOCK_NAMES_BY_ID.get(id) ?? null;
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
      // Wiki: a wolf wearing wolf armor always drops it, regardless of what killed it.
      if(mob.type==='wolf'&&mob.wolfArmor)this.entities?.spawnDroppedItem(pos,mob.wolfArmor,false,1);
      if (mob.type==='horse' && !mob.isBaby) {
        for(const id of [mob.isSaddled && 'saddle',mob.horseArmor,mob.hasChest && 'chest'].filter(Boolean))this.entities?.spawnDroppedItem(pos,id,false,1);
      }
      if (!mob.noLoot) {
        // A row is `[id, isBlock, min, max]`, or `[id, isBlock, min, max, chance]` for a drop that
        // only sometimes happens. The optional fifth field is what let the rare equipment drops be
        // added at all: an iron ingot from a zombie is about one in a hundred and twenty, and a range
        // with no probability has no way to express that, so those drops were simply absent.
        //
        // Looting applies to these rows the way vanilla does, `chance + 0.01 * level` capped at 1,
        // read from `mob.lootingLevel` which the kill path already sets from the killer's weapon.
        for (const [id, isBlock, min, max, chance] of loot) {
          if (chance !== undefined) {
            const looting = Math.max(0, Math.floor(mob.lootingLevel || 0));
            const effective = Math.min(1, chance + 0.01 * looting);
            // `this.random` is the manager's injectable seam, used by the rest of the mob code.
            // Calling `Math.random` here would make the rare drops impossible to exercise.
            const roll = typeof this.random === 'function' ? this.random : Math.random;
            if (roll() >= effective) continue;
          }
          const rollCount = typeof this.random === 'function' ? this.random : Math.random;
          const count = min + Math.floor(rollCount() * (max - min + 1));
          if (count > 0) {
            this.entities?.spawnDroppedItem(pos, id, isBlock, count, { pickupDelay: 1.2 });
          }
        }
        if (this.entities?.spawnXpOrbs) {
          const hostile = ['skeleton', 'stray', 'bogged', 'parched', 'creeper', 'pillager', 'zombie', 'husk', 'spider', 'enderman', 'witch', 'blaze', 'piglin', 'hoglin', 'zoglin'].includes(mob.type);
          // Wiki: a slime drops XP equal to its size (large 4, medium 2, small 1), not the
          // flat hostile value. Magma cubes keep their existing size-valued drop.
          const xpVal = mob.type === 'blaze' ? (mob.playerDamaged ? 10 : 0) : (isEquine(mob)||mob.type==='strider') ? (mob.playerDamaged || mob.wolfKilled ? 1+Math.floor(Math.random()*3) : 0) : mob.type === 'slime' ? (mob.playerDamaged ? mob.slimeSize : 0) : isHappyGhast(mob) ? 0
          : isCopperGolem(mob) ? 0
          : isCamelHusk(mob) ? (mob.playerDamaged || mob.killedByTamedWolf || mob.wolfKilled ? camelHuskXp(mob) : 0)
          : isPiglinBrute(mob) ? (mob.playerDamaged || mob.killedByTamedWolf ? piglinBruteXp(mob) : 0)
          : isGiant(mob) ? 0
          : isSmallFish(mob) ? (mob.playerDamaged || mob.wolfKilled ? fishXp(mob) : 0)
          : isUndeadHorse(mob) ? (mob.playerDamaged || mob.wolfKilled ? undeadHorseXp(mob) : 0)
          : mob.type === 'illusioner' ? (mob.playerDamaged || mob.wolfKilled ? illusionerXp(mob) : 0)
          : mob.type === 'snow_golem' ? 0
          : mob.type === 'creaking' ? 0
          : mob.type === 'camel' ? (mob.playerDamaged || mob.wolfKilled ? camelXp(mob) : 0)
          : mob.type === 'wandering_trader' ? 0
          : mob.type === 'allay' ? 0
          : mob.type === 'sniffer' ? (mob.playerDamaged || mob.wolfKilled ? snifferXp(mob) : 0)
          : mob.type === 'breeze' ? (mob.playerDamaged || mob.wolfKilled ? breezeXp(mob) : 0)
          : mob.type === 'parched' ? (mob.playerDamaged || mob.wolfKilled ? variantXp(mob) + (mob.armor ? 1 + Math.floor(Math.random() * 3) : 0) : 0)
          : mob.type === 'husk' || mob.type === 'stray' || mob.type === 'bogged' ? (mob.playerDamaged || mob.wolfKilled ? variantXp(mob) : 0)
          : mob.type === 'armadillo' ? (mob.playerDamaged || mob.wolfKilled ? armadilloXp(mob) : 0)
          : mob.type === 'panda' ? (mob.playerDamaged || mob.wolfKilled ? pandaXp(mob) : 0)
          : mob.type === 'polar_bear' ? (mob.playerDamaged || mob.wolfKilled ? polarBearXp(mob) : 0)
          : mob.type === 'phantom' ? (mob.playerDamaged || mob.wolfKilled ? phantomXp(mob) : 0)
          : mob.type === 'parrot' ? (mob.playerDamaged || mob.wolfKilled ? parrotXp(mob) : 0)
          : mob.type === 'tadpole' ? 0
          : mob.type === 'phantom' ? (mob.playerDamaged || mob.wolfKilled ? phantomXp(mob) : 0)
          : mob.type === 'parrot' ? (mob.playerDamaged || mob.wolfKilled ? parrotXp(mob) : 0)
          : mob.type === 'tadpole' ? 0
          : mob.type === 'frog' ? (mob.playerDamaged || mob.wolfKilled ? frogXp(mob) : 0)
          : mob.type === 'turtle' ? (mob.playerDamaged || mob.wolfKilled ? turtleXp(mob) : 0)
          : isLlamaLike(mob) ? (mob.playerDamaged || mob.wolfKilled ? (mob.isBaby ? 0 : 1 + Math.floor(Math.random() * 3)) : 0)
          : mob.type === 'goat' ? (mob.playerDamaged || mob.wolfKilled ? goatXp(mob) : 0)
          : mob.type === 'bee' ? (mob.playerDamaged || mob.wolfKilled ? (mob.isBaby ? 0 : 1 + Math.floor(Math.random() * 3)) : 0)
          : mob.type === 'fox' ? (mob.playerDamaged || mob.wolfKilled ? (mob.isBaby ? 0 : 1 + Math.floor(Math.random() * 3)) : 0)
          : mob.type === 'bat' ? 0
          : mob.type === 'rabbit' ? (mob.playerDamaged || mob.wolfKilled ? (mob.isBaby ? 0 : RABBIT_XP) : 0)
          : mob.type === 'endermite' ? (mob.playerDamaged || mob.wolfKilled ? ENDERMITE_XP : 0)
          : mob.type === 'silverfish' ? (mob.playerDamaged || mob.wolfKilled ? SILVERFISH_XP : 0)
          : mob.type === 'spider' || mob.type === 'cave_spider' ? (mob.playerDamaged || mob.wolfKilled ? SPIDER_XP : 0) : mob.type === 'magma_cube' ? (mob.playerDamaged ? mob.slimeSize : 0) : hostile ? 5 : (mob.type === 'iron_golem' ? 0 : (1 + Math.floor(Math.random() * 3)));
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
    } else if ((mob.type === 'spider' || mob.type === 'cave_spider') && mob.legs) {
      // Eight legs in two alternating tripods, driven by the same swim cycle the other
      // models use so it advances with movement rather than on a separate clock.
      mob.spiderPhase = (mob.spiderPhase || 0) + dt * (Math.hypot(vx, vz) > 0.05 ? 6.5 : 1.2);
      poseSpiderLegs(mob, mob.spiderPhase);
    } else if (mob.type === 'blaze' && mob.tiers) {
      animateBlaze(mob, dt);
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

  /**
   * Deflect any projectile sitting on a breeze.
   *
   * Wiki: "Breezes automatically deflect all projectiles that hit them except wind charges. Unlike
   * shields, deflected projectiles maintain the same velocity, and can potentially harm the attacker."
   * So the speed is preserved and only the direction is reversed back toward the shooter.
   *
   * Returns the number deflected, which is what the tests assert on.
   */
  deflectBreezeProjectiles() {
    const breezes = this.mobs.filter(isBreeze);
    if (!breezes.length) return 0;
    let deflected = 0;
    for (const arrow of this.arrows ?? []) {
      if (!arrow?.mesh || !arrow.velocity || arrow.deflectedByBreeze) continue;
      for (const breeze of breezes) {
        if (!shouldDeflect(arrow)) continue;
        // A hit is the arrow's position inside the breeze's box, inflated slightly so a fast arrow
        // cannot tunnel through in one frame.
        const dx = Math.abs(arrow.mesh.position.x - breeze.mesh.position.x);
        const dz = Math.abs(arrow.mesh.position.z - breeze.mesh.position.z);
        const dy = Math.abs(arrow.mesh.position.y - (breeze.mesh.position.y + breeze.height * 0.5));
        if (dx > breeze.width * 0.5 + 0.35) continue;
        if (dz > breeze.width * 0.5 + 0.35) continue;
        if (dy > breeze.height * 0.5 + 0.35) continue;
        const reflected = deflectVelocity(arrow, breeze);
        if (!reflected) continue;
        arrow.velocity.copy(reflected);
        arrow.deflectedByBreeze = true;
        arrow.shooter = null; // A deflected arrow is nobody's any more, so it can hit its firer.
        // The arrow's own trail follows its velocity, so the mesh is re-aimed to match.
        if (arrow.mesh.quaternion?.setFromUnitVectors) {
          arrow.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), arrow.velocity.clone().normalize());
        }
        deflected++;
        break;
      }
    }
    return deflected;
  }

  /**
   * Advance the breeze wind charges and burst them on impact.
   *
   * Wiki: "When a breeze's wind charge attack directly hits an entity, the entity takes damage, and a
   * burst of wind appears. If a wind charge hits a block, only a burst of wind appears. This wind burst
   * deals knockback but does not deal any damage by itself."
   */
  updateWindCharges(dt) {
    if (!this.windCharges?.length) return;
    for (let i = this.windCharges.length - 1; i >= 0; i--) {
      const charge = this.windCharges[i];
      charge.age += dt;
      charge.velocity.y -= 6 * dt;
      charge.position.addScaledVector(charge.velocity, dt);
      charge.mesh?.position.copy(charge.position);

      let burst = charge.age > WIND_CHARGE_BURST.lifetime;
      if (!burst) {
        const block = this.world.getVoxel(
          Math.floor(charge.position.x),
          Math.floor(charge.position.y),
          Math.floor(charge.position.z)
        );
        if (block && block !== BLOCKS.AIR && block !== BLOCKS.WATER) {
          burst = true;
        } else {
          // A direct hit on an entity: damage, then the burst.
          const hit = this.findWindChargeHit(charge);
          if (hit) {
            charge.target = hit.target;
            charge.hitBlock = false;
            const damage = charge.damage ?? windChargeDamageFor(this.game?.difficulty ?? 'normal');
            if (damage > 0 && typeof hit.target.takeDamage === 'function') {
              hit.target.takeDamage(damage, charge.position.clone(), 'breeze');
            } else if (damage > 0) {
              this.damageMob(hit.target, damage, charge.position.clone(), false, charge.shooter);
            }
            burst = true;
          }
        }
      }

      if (burst) {
        windChargeBurst(this, charge, { hitBlock: charge.hitBlock === true });
        charge.mesh?.removeFromParent?.();
        charge.mesh?.geometry?.dispose?.();
        charge.mesh?.material?.dispose?.();
        this.windCharges.splice(i, 1);
      }
    }
  }

  /** The first mob or player a wind charge is inside. */
  findWindChargeHit(charge) {
    const player = this.game?.player;
    if (player?.position && player.health > 0) {
      const dims = { width: 0.6, height: 1.8 };
      if (Math.abs(charge.position.x - player.position.x) < dims.width * 0.5 + 0.3
        && Math.abs(charge.position.z - player.position.z) < dims.width * 0.5 + 0.3
        && charge.position.y > player.position.y - 0.3
        && charge.position.y < player.position.y + dims.height + 0.3) {
        return { target: player };
      }
    }
    for (const mob of this.mobs) {
      if (mob === charge.shooter || mob.health <= 0) continue;
      const dims = this.getMobDimensions(mob.type);
      if (Math.abs(charge.position.x - mob.mesh.position.x) < dims.width * 0.5 + 0.3
        && Math.abs(charge.position.z - mob.mesh.position.z) < dims.width * 0.5 + 0.3
        && charge.position.y > mob.mesh.position.y - 0.3
        && charge.position.y < mob.mesh.position.y + dims.height + 0.3) {
        return { target: mob };
      }
    }
    return null;
  }

  update(dt, player) {
    dt = Math.min(dt, 0.1);
    this.ensureFaultTracking();
    // Finish any skin whose texture finished downloading after its mob was built. Cheap once everything has
    // decoded, because the pending list empties itself.
    syncDeferredSkins();
    for (const mob of this.mobs) if (mob.mesh) mob.contactStart = mob.mesh.position.clone();
    // The four ad-hoc natural spawners that used to live here have been retired.
    //
    // `updateStriderSpawning`, `updateSquidSpawning`, `updateWitherSkeletonSpawning` and
    // `updateDonkeySpawning` each created mobs on their own timer with a hard-coded cap and their own
    // search pattern near the player. They are now covered by the natural spawn cycle, which reads
    // the same biomes' real spawn tables, works against the mob caps and the category system, and
    // applies the same placement and light rules as every other mob.
    //
    // They are not merely superseded, they were the bug: they only searched within 40-90 blocks of
    // the player and only for four species, so everywhere else in the world had nothing that could
    // create a mob at all. Leaving them running alongside the new system would also double the spawn
    // rate for exactly those four species. Their exported functions remain (tests and inspectors
    // still call `spawnSquid`, `spawnNaturalStrider`, `spawnWitherSkeleton` directly), but nothing
    // drives them from the tick loop any more.
    updateMobWither(this,dt);
    updateArrows(this, dt, player);
    // Wiki: breezes deflect every projectile that hits them except another wind charge, and their own
    // wind charges burst on impact. Both run here so they see the arrows after the arrow pass moved
    // them, which is what makes the deflection happen on the frame of contact.
    this.updateSnifferEggs(dt);
    this.deflectBreezeProjectiles();
    this.updateWindCharges(dt);
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

      if (mob.isAquatic && !isTurtle(mob) && !isTadpole(mob)) {
        // Turtles and tadpoles are aquatic but not fish. A turtle walks on land and swims; a tadpole
        // flops on land, seeks water, and drowns out of it, then grows into a frog. Both own their
        // locomotion in their own branch. This path ends in an unconditional `return true`, so it
        // claims *any* aquatic mob that reaches it — which is why each had to be excluded
        // explicitly, and why the symptom was a mob that silently did nothing.
        // Wiki: the pufferfish is NEUTRAL and inflates at non-aquatic things; it needs its own step before the
    // shared aquatic handler, which would otherwise treat it as an ordinary fish.
    if (isPufferfish(mob)) {
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.puffDamageCooldown = Math.max(0, (mob.puffDamageCooldown || 0) - dt);
      updatePufferfishPuff(this, mob, player);
      const stage = pufferfishStage(mob);
      // Wiki: contact deals damage AND Poison, and only while puffed.
      if (stage !== 'unpuffed' && mob.threat && mob.puffDamageCooldown <= 0) {
        const hit = pufferfishContact(mob, mob.threat, this.game?.difficulty ?? 'normal');
        if (hit) {
          const target = mob.threat;
          if (target.type === 'player') {
            target.takeDamage?.(hit.damage, mob.mesh.position, mob.type);
            target.applyStatusEffect?.('poison', hit.poison);
          } else {
            this.damageMob?.(target, hit.damage, mob.mesh.position, false, mob);
            target.applyStatusEffect?.('poison', hit.poison);
          }
          mob.puffDamageCooldown = 1;
        }
      }
      posePufferfish(mob, (mob.fishPhase = (mob.fishPhase || 0) + dt));
      if (this.updateAquaticMob(mob, dt, player)) continue;
    }
    if (isTropicalFish(mob)) {
      poseTropicalFish(mob, (mob.fishPhase = (mob.fishPhase || 0) + dt));
      if (this.updateAquaticMob(mob, dt, player)) continue;
    }
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
    // Wiki: endermen attack endermites in line of sight within 64 blocks, and endermites
    // fight back. This pairs them once per frame rather than per mob.
    updateEndermanEndermiteAggression(this);
    // Llama spit flies as its own projectile list, separate from the hostile-mob queue.
    if (!this.llamaSpits) this.llamaSpits = [];
    updateLlamaSpit(this, dt, player);

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
        // A homing projectile steers before it moves, so it tracks rather than flying a fixed line.
        if (p.homing) steerShulkerBullet(p, player, dt);
        p.mesh.position.addScaledVector(p.velocity, dt);

        let hit = false;
        const hitThreshold = p.isDragonFireball ? 1.8 : 1.0;
        if (player && p.mesh.position.distanceTo(player.position) < hitThreshold) {
          player.takeDamage(p.damage);
          // A projectile that carries an effect applies it on hit. Generic rather than special-cased to the
          // shulker, so a future bullet with a different effect needs no change here.
          if (p.effect?.id) {
            player.applyStatusEffect?.(p.effect.id, p.effect.seconds, p.effect.level ?? 1);
          }
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
    // Wiki: undead burn in sunlight, and "the husk is one of the few undead mobs that are immune to
    // burning in sunlight, which allows them to stay around during the day". Whether a mob burns is
    // read from `burnsInDaylight`, which the husk sets false and the stray and bogged set true, so the
    // exemption is data rather than a special case here. This is a standalone block near the top rather
    // than a clause deep in the if/else chain below: the chain is entered by whichever branch matches
    // first, and a behaviour that every undead mob shares should not depend on that ordering.
    if (mob.isUndead || mob.burnsInDaylight !== undefined) {
      const ux = Math.floor(mob.mesh.position.x);
      const uy = Math.floor(mob.mesh.position.y);
      const uz = Math.floor(mob.mesh.position.z);
      const skyLight = this.world.getLightLevel?.(ux, uy, uz) ?? 15;
      const isDaytime = (this.game?.worldTime ?? 6000) % 24000 < 12000;
      const exposed = mob.burnsInDaylight === true && isDaytime && skyLight > 11;
      if (exposed && !mob.isBurning) { mob.isBurning = true; mob.burnTimer = 8; }
      if (!exposed && mob.isBurning && mob.burnTimer <= 0) { mob.isBurning = false; mob.burnTick = undefined; }
      if (mob.isBurning && mob.type !== 'phantom') {
        // The phantom owns its own burning branch, so this skips it rather than double-ticking.
        mob.burnTimer -= dt;
        if (mob.burnTimer <= 0) { mob.isBurning = false; mob.burnTick = undefined; }
        else {
          mob.burnTick = (mob.burnTick ?? 1) - dt;
          if (mob.burnTick <= 0) { mob.burnTick = 1; this.damageMob(mob, 1, null, false, null, true); }
        }
      }
    }
    // Wiki: a husk that is fully submerged for 30 s begins converting to a zombie, which takes 15 s
    // more and cannot be stopped. The replacement has full health.
    if (mob.type === 'husk') {
      const submerged = this.world.getVoxel(
        Math.floor(mob.mesh.position.x),
        Math.floor(mob.mesh.position.y + (mob.height ?? 1.95) * 0.5),
        Math.floor(mob.mesh.position.z)
      ) === BLOCKS.WATER;
      const phase = updateHuskDrowning(mob, dt, { submerged, manager: this });
      if (phase === 'converted') return true;
      if (phase === 'converting') mob.state = 'converting';
    }

    if(isPackEquine(mob)&&mob.panicSeconds>0&&!mob.rider){
      const speed=(mob.movementSpeed??.175)*20;mob.yaw=mob.panicYaw;mob.wanderGoal=null;
      mob.velocity.x=Math.sin(mob.yaw)*speed;mob.velocity.z=Math.cos(mob.yaw)*speed;
      this.updateMobAnimation(mob,dt,mob.velocity.x,mob.velocity.z);moveGroundMob(this,mob,dt);return true;
    }
    if(mob.type==='wither_skeleton'){updateWitherSkeleton(this,mob,dt,player);return true;}
    if(mob.type==='slime'||mob.type==='magma_cube'){
      // Wiki: cubes move by hopping every 0.5-1.5s, three times as often when they have a target,
      // always jump one block high, do not pathfind, and damage whatever they land on. Neither had
      // any locomotion before, so both stood in one place forever while the renderer read a
      // vertical velocity that nothing ever set.
      const hopTarget = updateCubeHop(this, mob, dt, player, {
        findTarget: (mgr, cube, range) => {
          // Wiki: the cube looks for a player within 16 blocks, or failing that an iron golem.
          if (player?.position && cube.mesh.position.distanceTo(player.position) < range) return player;
          let best = null;
          let bestDist = range;
          for (const other of mgr.mobs) {
            if (other === cube || other.type !== 'iron_golem' || other.health <= 0) continue;
            const d = cube.mesh.position.distanceTo(other.mesh.position);
            if (d < bestDist) { bestDist = d; best = other; }
          }
          return best;
        }
      });

      moveGroundMob(this, mob, dt);

      // Contact damage on landing. Wiki: the damage equals the cube's size and the smallest deals
      // none, and damage immunity limits it to one hit per half second.
      if (mob.onGround && mob.cubeSquashPending) {
        mob.cubeSquashPending = false;
        if (mob.cubeTarget) cubeSquashOnLand(this, mob, mob.cubeTarget, dt);
      }
      mob.cubeAttackCooldown = Math.max(0, (mob.cubeAttackCooldown || 0) - dt);

      // A cube squash: the model flattens on landing and stretches during the jump, which is what
      // makes the hop read rather than slide.
      const airborne = !mob.onGround;
      const stretch = airborne ? 1 + Math.min(0.25, Math.abs(mob.velocity.y) * 0.04) : 0.88;
      const base = mob.slimeSize / 4;
      mob.mesh.scale.set(base / stretch, base * stretch, base / stretch);
      mob.state = hopTarget === 'hopping' ? 'hopping' : 'idle';
      return true;
    }
    // Wiki: spiders and cave spiders flee from an armadillo within 6 blocks, but only while it is NOT
    // rolled up. This runs before the armadillo's own branch so the spider's own update sees the flee.
    if (ARMADILLO_SPIDER_TYPES.includes(mob.type)) {
      for (const other of this.mobs) {
        if (!repelsMob(other, mob.type)) continue;
        if (other.mesh.position.distanceTo(mob.mesh.position) > ARMADILLO_SPIDER_FEAR_RANGE) continue;
        const away = mob.mesh.position.clone().sub(other.mesh.position);
        away.y = 0;
        if (away.lengthSq() > 1e-6) away.normalize();
        mob.yaw = Math.atan2(away.x, away.z);
        mob.velocity.x = away.x * 3.2;
        mob.velocity.z = away.z * 3.2;
        mob.state = 'fleeing-armadillo';
        moveGroundMob(this, mob, dt);
        return true;
      }
    }
    if(mob.type==='armadillo'){
      // Wiki: passive. It rolls into a ball when hurt or threatened, takes (damage-1)/2 while rolled,
      // repels spiders while NOT rolled, and sheds a scute every 5-10 minutes.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      const ax = Math.floor(mob.mesh.position.x);
      const ay = Math.floor(mob.mesh.position.y);
      const az = Math.floor(mob.mesh.position.z);
      const here = this.world.getVoxel(ax, ay, az);
      const feet = this.world.getVoxel(ax, ay - 1, az);
      updateArmadilloRoll(this, mob, dt, player, {
        inWater: here === BLOCKS.WATER,
        onFire: !!mob.isBurning,
        inAir: !mob.onGround && mob.mesh.position.y > (feet === BLOCKS.AIR ? -1 : 0) + 0.2,
        onLead: !!mob.leashHolder,
        fleeing: mob.fleeing === true
      });

      // Wiki: a baby grows in 20 minutes, accelerated by spider eyes.
      if (mob.isBaby && updateArmadilloGrowth(mob, dt)) {
        // The adult hitbox is restored by the growth step.
      }

      // Wiki: it sheds one scute every 5-10 minutes, like a chicken laying an egg.
      if (updateArmadilloScutes(mob, dt)) {
        this.entities?.spawnDroppedItem?.(mob.mesh.position.clone(), 'armadillo_scute', false, 1);
      }

      // Wiki: a rolled armadillo does not walk, and is not tempted by food.
      if (isRolledUp(mob)) {
        mob.velocity.x *= 0.2;
        mob.velocity.z *= 0.2;
        mob.state = 'rolled';
      } else {
        // Wiki: they follow a player holding a spider eye within 10 blocks, and a baby follows adults.
        const held = player?.inventory?.getActiveItem?.();
        const heldId = typeof held?.id === 'string' ? held.id : '';
        const parent = mob.isBaby ? this.mobs.find(o => o.type === 'armadillo' && !o.isBaby) : null;
        if (armadilloFollows(mob, player, heldId, parent)) {
          const target = mob.isBaby && parent ? parent.mesh.position : player.position;
          const dir = target.clone().sub(mob.mesh.position);
          dir.y = 0;
          const dist = dir.length();
          if (dist > 1.6) {
            dir.normalize();
            mob.yaw = Math.atan2(dir.x, dir.z);
            mob.velocity.x = dir.x * 1.6;
            mob.velocity.z = dir.z * 1.6;
          } else { mob.velocity.x *= 0.6; mob.velocity.z *= 0.6; }
        } else {
          wanderMob(this, mob, dt, 0.8);
        }
        mob.state = 'idle';
      }

      moveGroundMob(this, mob, dt);
      mob.armadilloPhase = (mob.armadilloPhase || 0) + dt;
      poseArmadillo(mob, mob.armadilloPhase);
      return true;
    }
    if(mob.type==='panda'){
      // Wiki: neutral, with seven personalities. Aggressive pandas hunt continuously; lazy ones
      // are the slowest land mob; worried ones shake in thunderstorms; playful ones roll; weak
      // ones have half health and sneeze far more; brown is only a colour.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.isThundering = this.game?.weather?.weatherType === 'thunder';
      mob.stance = pandaStance(mob, {
        difficulty: this.game?.difficulty ?? 'normal',
        provoked: mob.isHostile
      });

      // Wiki: a baby sneezes, which makes adults nearby jump and can drop a slimeball.
      updatePandaSneeze(this, mob, dt);

      // Wiki: a lazy panda lies on its back much of the time, and a playful one rolls.
      mob.pandaPhase = (mob.pandaPhase || 0) + dt;
      if (mob.isLazy && mob.onGround) {
        mob.timer = (mob.timer || 0) - dt;
        if (mob.timer <= 0) {
          mob.timer = 6 + Math.random() * 8;
          mob.isLyingDown = !mob.isLyingDown;
        }
      } else {
        mob.isLyingDown = false;
      }
      if (mob.isPlayful && mob.onGround) {
        mob.rollTimer = (mob.rollTimer || 0) - dt;
        if (mob.rollTimer <= 0) {
          mob.rollTimer = 4 + Math.random() * 6;
          mob.isRolling = true;
          mob.rollEnd = mob.pandaPhase + 1.2;
        }
        if (mob.isRolling && mob.pandaPhase > mob.rollEnd) mob.isRolling = false;
      }

      // Wiki: only a hostile panda hunts, and an aggressive one keeps going until the target is
      // dead or out of range. A non-aggressive panda attacks only once.
      const target = mob.stance === 'hostile'
        ? this.findPandaTarget(mob, player)
        : null;
      if (target) {
        const pos = target.position ?? target.mesh?.position;
        const dir = pos.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 1e-6) dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        // Wiki: a lazy panda ambles at 0.07, the slowest land speed in the game.
        const speed = mob.speed ?? (mob.isLazy ? PANDA_SPEED.lazy : PANDA_SPEED.normal);
        mob.velocity.x = dir.x * speed * 8;
        mob.velocity.z = dir.z * speed * 8;
        if (dist < 1.9 && mob.hitCooldown <= 0) {
          const damage = pandaDamageFor(mob, this.game?.difficulty ?? 'normal');
          if (damage > 0) target.takeDamage?.(damage, mob.mesh.position, 'panda');
          mob.hitCooldown = 1.0;
          // Wiki: a non-aggressive panda attacks only once, so it calms after landing the blow.
          if (!aggressivePandaKeepsHunting(mob)) { mob.isHostile = false; mob.angryAt = null; }
        }
        mob.state = 'hostile';
      } else {
        // Wiki: pandas follow a player carrying bamboo, within about 16 blocks.
        const heldItem = player?.inventory?.getActiveItem?.();
        const heldId = typeof heldItem?.id === 'string' ? heldItem.id : '';
        if (pandaFollowsBamboo(mob, player, heldId)) {
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          const dist = dir.length();
          if (dist > 2) {
            dir.normalize();
            mob.yaw = Math.atan2(dir.x, dir.z);
            mob.velocity.x = dir.x * 2.0;
            mob.velocity.z = dir.z * 2.0;
          } else { mob.velocity.x *= 0.6; mob.velocity.z *= 0.6; }
        } else if (!mob.isLyingDown) {
          wanderMob(this, mob, dt, 1.0);
        } else {
          mob.velocity.x = 0;
          mob.velocity.z = 0;
        }
        mob.state = 'idle';
      }

      moveGroundMob(this, mob, dt);
      posePanda(mob, mob.pandaPhase);
      return true;
    }
    if(mob.type==='polar_bear'){
      // Wiki: a cub is passive, an adult is neutral, and an adult turns hostile to protect any cub
      // near it. Adults also attack foxes. Growth cannot be sped up, only stopped.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.stance = polarBearStance(mob, {
        difficulty: this.game?.difficulty ?? 'normal',
        provoked: mob.isHostile,
        cubThreatened: false
      });

      // Wiki: a cub matures after 20 minutes and its growth cannot be accelerated.
      if (mob.isBaby && updatePolarBearGrowth(mob, dt)) {
        const dims = polarBearDimensions(mob);
        mob.mesh.position.y += dims.height - POLAR_BEAR_BABY_DIMENSIONS.height;
      }

      // The rearing maul, once begun, has to land before anything else happens.
      if (mob.isMauling) {
        const target = mob.maulTarget ?? null;
        updatePolarBearMaul(this, mob, target, dt);
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        moveGroundMob(this, mob, dt);
        posePolarBear(mob, mob.polarPhase || 0);
        return true;
      }

      // Wiki: only a hostile bear hunts.
      const target = findPolarBearTarget(this, mob, player, { difficulty: this.game?.difficulty ?? 'normal' });
      if (target) {
        const pos = target.position ?? target.mesh?.position;
        const dir = pos.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 1e-6) dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        // Wiki: its swim speed equals the player's, which is what makes water no escape.
        const inWater = this.world.getVoxel(Math.floor(mob.mesh.position.x), Math.floor(mob.mesh.position.y), Math.floor(mob.mesh.position.z)) === BLOCKS.WATER;
        const speed = inWater ? POLAR_BEAR_SPEED.water : POLAR_BEAR_SPEED.land;
        mob.velocity.x = dir.x * speed;
        mob.velocity.z = dir.z * speed;
        // Wiki: it attacks by rearing on its back legs and mauling down.
        if (dist < 2.2 && mob.hitCooldown <= 0) {
          startPolarBearMaul(mob);
          mob.maulTarget = target;
          mob.hitCooldown = 1.2;
        }
        mob.state = 'hostile';
      } else {
        wanderMob(this, mob, dt, 1.2);
        mob.state = 'idle';
      }

      moveGroundMob(this, mob, dt);
      posePolarBear(mob, mob.polarPhase || 0);
      mob.polarPhase = (mob.polarPhase || 0) + dt * 6;
      return true;
    }
    if(isHappyGhast(mob)){
      // Wiki: a passive FLYING mob that is ridden by up to four players and roams around a home it is
      // bound to. It never uses the ground mover.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      // Wiki: a ghastling grows up in 20 minutes, sped up by snowballs.
      if (updateGhastlingGrowth(mob, dt) === 'grown') {
        mob.name = 'Happy Ghast';
        // Wiki: an adult is 4.0 and a ghastling 0.95, so the hover altitude has to be raised or the newly
        // grown body would spawn inside the ground.
        mob.mesh.position.y = Math.max(mob.mesh.position.y, mob.home.y + 2);
        mob.homeAltitude = mob.mesh.position.y;
      }

      // Wiki: "Players can stand on top of a happy ghast ... While players are standing on it, the happy ghast
      // becomes stationary". So the standers are counted by geometry: anything close above it is on top.
      const top = mob.mesh.position.y + mob.height;
      const standers = this.mobs.filter(other => other !== mob && other.health > 0 &&
        Math.abs(other.mesh.position.y - top) < 1.5 &&
        Math.abs(other.mesh.position.x - mob.mesh.position.x) < mob.width * 0.6 &&
        Math.abs(other.mesh.position.z - mob.mesh.position.z) < mob.width * 0.6).length
        + (this.game?.player && Math.abs(this.game.player.position.y - top) < 1.5 &&
          Math.abs(this.game.player.position.x - mob.mesh.position.x) < mob.width * 0.6 &&
          Math.abs(this.game.player.position.z - mob.mesh.position.z) < mob.width * 0.6 ? 1 : 0);
      const stationary = happyGhastIsStationary(mob, { standers });
      if (stationary) {
        // Wiki: "While players are standing on it, the happy ghast becomes stationary and aligns to one of the
        // cardinal directions", and south after a chunk reload.
        mob.velocity.set(0, 0, 0);
        mob.yaw = happyGhastStationaryFacing();
        mob.mesh.rotation.y = mob.yaw;
        mob.state = 'stood-on';
      } else if ((mob.riders?.length ?? 0) > 0) {
        // Wiki: "A ridden happy ghast moves at about 3.6 m/s", flown by the pilot, with no gravity.
        const pilot = mob.pilot ?? mob.riders[0];
        const dir = new THREE.Vector3(0, 0, 1).applyEuler(pilot.mesh?.rotation ?? pilot.rotation ?? new THREE.Euler());
        if (pilot.keys?.forward) mob.velocity.set(dir.x * HAPPY_GHAST_RIDDEN_SPEED, dir.y * HAPPY_GHAST_RIDDEN_SPEED, dir.z * HAPPY_GHAST_RIDDEN_SPEED);
        else mob.velocity.set(0, 0, 0);
        // Wiki: jump moves it straight up, and there is no dedicated downward control.
        if (pilot.keys?.jump || pilot.keys?.space) mob.velocity.y = HAPPY_GHAST_RIDDEN_SPEED;
        else if (!pilot.keys?.forward) mob.velocity.y = 0;
        mob.yaw = Math.atan2(dir.x, dir.z);
        mob.mesh.rotation.y = mob.yaw;
        mob.state = 'ridden';
      } else {
        // Unridden: a ghastling follows a nearby target, and an adult hovers around its home.
        if (isGhastling(mob)) {
          const candidates = [this.game?.player, ...this.mobs].filter(Boolean);
          const target = findGhastlingTarget(mob, candidates);
          mob.target = target;
          if (target && !ghastlingShouldStop(mob, target)) {
            const pos = target.position ?? target.mesh?.position;
            const dir = pos.clone().sub(mob.mesh.position);
            const length = dir.length() || 1;
            const speed = HAPPY_GHAST_SPEED * 20 * GHASTLING_FOLLOW_SPEED_BOOST;
            mob.velocity.copy(dir.multiplyScalar(speed / length));
            mob.yaw = Math.atan2(dir.x, dir.z);
            mob.mesh.rotation.y = mob.yaw;
            mob.state = 'following';
          } else {
            mob.velocity.set(0, 0, 0);
            mob.state = 'idle';
          }
        } else {
          // Wiki: "Unharnessed happy ghasts roam within a 64-block radius of their home". It picks a point
          // inside that radius and drifts to it, which is what keeps an idle one from hanging motionless.
          if (!mob.wanderTarget || mob.mesh.position.distanceTo(mob.wanderTarget) < 1) {
            mob.wanderTarget = happyGhastWanderTarget(mob, this.random ?? Math.random);
          }
          steerHappyGhast(mob, mob.wanderTarget, dt, HAPPY_GHAST_SPEED * 20);
          mob.mesh.rotation.y = mob.yaw;
          mob.state = 'roaming';
        }
        // Wiki: it roams within a radius of its home, and holds its altitude.
        const wanted = mob.mesh.position.clone().add(mob.velocity);
        const clamped = clampToHome(mob, wanted);
        if (clamped && wanted.distanceTo(clamped) > 1e-6) {
          mob.velocity.copy(clamped.sub(mob.mesh.position));
        }
        // A hover bob, so an idle one breathes rather than hanging perfectly still. It is added to the vertical
        // velocity rather than REPLACING it, which would cancel the roamer's climb whenever it drifted below its
        // altitude.
        mob.bobPhase = (mob.bobPhase || 0) + dt;
        mob.velocity.y += Math.sin(mob.bobPhase * 1.1) * 0.25;
      }

      // It is not undead, so it never burns.
      mob.isBurning = false;
      mob.mesh.position.addScaledVector(mob.velocity, dt);
      // Keep it above the ground, since it has no gravity model of its own.
      const groundY = (this.world.surfaceHeightAt?.(mob.mesh.position.x, mob.mesh.position.z) ?? 1) + 2;
      if (mob.mesh.position.y < groundY) mob.mesh.position.y = groundY;
      if (mob.onGround === undefined) mob.onGround = false;
      poseHappyGhast(mob, mob.bobPhase || 0);
      return true;
    }
    if(isCopperGolem(mob)){
      // Wiki: a passive mob whose job is hauling items, and which oxidizes into a statue over time.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      // Wiki: "If not waxed, a copper golem oxidizes over time and eventually turns into a copper golem
      // statue, dropping its currently held items."
      const oxidized = updateCopperGolemOxidation(mob, dt);
      if (oxidized) {
        // The palette follows the stage, so the change is visible as well as mechanical.
        const color = copperGolemColor(mob.oxidationStage);
        if (mob.bodyMat) mob.bodyMat.color.setHex(color);
        if (mob.droppedOnOxidizing) {
          this.entities?.spawnDroppedItem?.(mob.mesh.position.clone(), mob.droppedOnOxidizing.id, false, mob.droppedOnOxidizing.count);
          mob.droppedOnOxidizing = null;
        }
        if (oxidized === 'statue') {
          mob.state = 'statue';
          mob.velocity.set(0, 0, 0);
          poseCopperGolem(mob, mob.copperGolemPhase || 0);
          return true;
        }
      }

      if (mob.isStatue) {
        mob.velocity.set(0, 0, 0);
        return true;
      }

      // The hauling job: take from a copper chest, carry one type, put it in a wooden chest that is empty
      // or already holds that type.
      if (!mob.heldItem) {
        const source = findCopperGolemSource(this, mob);
        if (source) {
          const pos = source.position ?? source.mesh?.position;
          if (pos && mob.mesh.position.distanceTo(pos) < 1.5) {
            copperGolemTake(mob, source);
            mob.state = 'taking';
          } else if (pos) {
            steerGround(this, mob, pos, dt, 2);
            mob.state = 'hauling-to-source';
          }
        } else {
          wanderMob(this, mob, dt, 0.6);
        }
      } else {
        const destination = findCopperGolemDestination(this, mob, mob.heldItem);
        if (destination) {
          const pos = destination.position ?? destination.mesh?.position;
          if (pos && mob.mesh.position.distanceTo(pos) < 1.5) {
            copperGolemPlace(mob, destination);
            mob.state = 'storing';
          } else if (pos) {
            steerGround(this, mob, pos, dt, 2);
            mob.state = 'hauling-to-chest';
          }
        } else {
          wanderMob(this, mob, dt, 0.6);
        }
      }

      // It is not undead, so it never burns.
      mob.isBurning = false;
      if (mob.held && mob.held.visible !== !!mob.heldItem) mob.held.visible = !!mob.heldItem;

      moveGroundMob(this, mob, dt);
      if (mob.onGround) mob.groundY = mob.mesh.position.y;
      mob.copperGolemPhase = (mob.copperGolemPhase || 0) + dt;
      poseCopperGolem(mob, mob.copperGolemPhase);
      return true;
    }
    if(isCamelHusk(mob)){
      // Wiki: passive alone, hostile as a jockey; it does not burn in sunlight; and it shares the camel's
      // sit cycle, including the headroom guard.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      const hx = Math.floor(mob.mesh.position.x);
      const hy = Math.floor(mob.mesh.position.y);
      const hz = Math.floor(mob.mesh.position.z);
      let clearance = 0;
      for (let dy = 0; dy < 4; dy++) {
        const id = this.world.getVoxel(hx, hy + dy, hz);
        if (id === undefined || id === null || id === BLOCKS.AIR) clearance += 1; else break;
      }
      const sit = updateCamelHuskSitting(mob, dt, {
        clearance,
        random: this.random ?? Math.random,
        fleeing: mob.fleeing === true
      });
      if (sit === 'stood') mob.state = 'standing';
      else if (sit === 'sat') mob.state = 'sitting';
      else if (sit === 'blocked') mob.state = 'sitting-blocked';

      // Wiki: hostile only because its RIDERS control the pathfinding.
      mob.isHostile = camelHuskIsHostile(mob);
      if (mob.isSitting) {
        mob.velocity.x = 0;
        mob.velocity.z = 0;
      } else {
        wanderMob(this, mob, dt, 0.5);
        mob.state = mob.isHostile ? 'ridden' : mob.state;
      }
      // Wiki: "It does not burn in sunlight", stated on its own page.
      mob.isBurning = false;

      moveGroundMob(this, mob, dt);
      if (mob.onGround) mob.groundY = mob.mesh.position.y;
      mob.camelHuskPhase = (mob.camelHuskPhase || 0) + dt;
      if (mob.saddleMesh) mob.saddleMesh.visible = mob.hasSaddle === true;
      poseCamelHusk(mob, mob.camelHuskPhase, poseCamel);
      return true;
    }
    if(isGiant(mob)){
      // Wiki: "Giants currently have no AI. The consequence of this is that they always face south when
      // summoned, and they always stay that way, never wandering. They cannot turn their head, chase the
      // player, or respond to damage."
      //
      // So this branch deliberately does almost nothing: it holds the mob still and pins its facing. The
      // absence IS the behaviour, and a test asserts it rather than treating it as unfinished.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.velocity.set(0, 0, 0);
      mob.mesh.rotation.y = GIANT_FACING_YAW;
      mob.yaw = GIANT_FACING_YAW;
      // Wiki: it does not burn in sunlight, unlike the zombie it is modelled on.
      mob.isBurning = false;
      // Wiki: it suffocates underwater rather than converting to a drowned.
      mob.giantPhase = (mob.giantPhase || 0) + dt;
      poseGiant(mob, mob.giantPhase);
      return true;
    }
    if(isUndeadHorse(mob)){
      // Wiki: it is passive alone, hostile only as a jockey, becomes passive once separated, and the
      // skeleton horse's trap springs into four skeleton horsemen.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      // Wiki: a skeleton trap horse transforms when approached, during a thunderstorm.
      if (mob.isTrap) {
        const distance = player?.position ? mob.mesh.position.distanceTo(player.position) : Infinity;
        if (skeletonTrapReady(mob, {
          weatherType: this.game?.weather?.weatherType ?? 'clear',
          distanceToPlayer: distance
        })) {
          springSkeletonTrap(this, mob, this.random ?? Math.random);
        }
      }

      // Wiki: a zombie horse "rarely spawns in dark areas as a hostile mob being ridden and controlled by a
      // zombie horseman". That is a SPAWN-TIME property, so it is opt-in via the spawner rather than automatic
      // on every update: doing it here meant a horse spawned by the generic dispatcher acquired a rider on its
      // first frame, became 'ridden', and therefore never moved -- which the frozen-mob guard caught. The
      // preference query is kept so the rule stays testable.
      if (isZombieHorse(mob) && mob.wantsRider === true && !mob.rider && zombieHorseWantsRider(mob, {
        lightLevel: this.world.getLightLevel?.(Math.floor(mob.mesh.position.x), Math.floor(mob.mesh.position.y), Math.floor(mob.mesh.position.z)) ?? 15,
        night: (this.game?.worldTime ?? 6000) >= 13000
      })) {
        const zombie = this.spawnMob('zombie', mob.mesh.position.x, mob.mesh.position.y, mob.mesh.position.z);
        if (zombie) { zombie.rider = mob; zombie.mount = mob; mob.rider = zombie; mob.riderCount = 1; }
      }

      // Wiki: a ridden one is steered by its rider, so the horse does not wander on its own.
      if (mob.riderCount > 0) {
        mob.velocity.x *= 0.85;
        mob.velocity.z *= 0.85;
        mob.state = 'ridden';
      } else {
        wanderMob(this, mob, dt, 0.4);
        mob.state = mob.tame ? 'tame' : 'idle';
      }

      // Wiki: the zombie horse burns in sunlight; the skeleton horse explicitly does not.
      if (mob.burnsInDaylight && this.game?.worldTime !== undefined) {
        const time = ((this.game.worldTime % 24000) + 24000) % 24000;
        const day = time < 12000;
        if (day) { mob.isBurning = true; mob.health -= 1 * dt; }
        else mob.isBurning = false;
      } else {
        mob.isBurning = false;
      }

      moveGroundMob(this, mob, dt);
      mob.horsePhase = (mob.horsePhase || 0) + dt;
      poseUndeadHorse(mob, mob.horsePhase);
      return true;
    }
    if(mob.type==='illusioner'){
      // Wiki: it fires an arrow a second (three times a skeleton), strafes at a fixed distance, can see
      // through walls, and fights with two spells behind four mirror duplicates.
      updateIllusionerCooldowns(this, mob, dt);

      const found = findIllusionerTarget(this, mob, player);
      if (found !== mob.target) switchIllusionerTarget(mob, found);

      if (mob.target) {
        // Wiki: while engaged it keeps Invisibility up, refreshing when it lapses.
        if (!illusionerIsInvisible(mob) && (mob.invisibilityCooldown || 0) <= 0) {
          castIllusionerInvisibility(this, mob);
        }
        // Wiki: Blindness only for a player opponent, only above regional difficulty 2, and not twice on
        // the same opponent without looking away and back.
        if (!mob.blindedTarget && (mob.spellCooldown || 0) <= 0) {
          castIllusionerBlindness(mob, mob.target, {
            regionalDifficulty: mob.regionalDifficulty ?? 3,
            dt
          });
        }

        mob.state = illusionerMovement(mob, mob.target, dt) ?? 'idle';

        // Wiki: it shoots through walls, so no line-of-sight check here -- that is its distinguishing
        // trait, and adding one would silently make it an ordinary skeleton.
        const shot = illusionerShoot(mob, mob.target, this.game?.difficulty ?? 'normal', this.random ?? Math.random);
        if (shot) {
          // `spawnArrow(origin, direction, shooter, options)` is an INSTANCE method, so it takes no manager.
          this.spawnArrow(
            mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)),
            shot.direction,
            mob,
            { damage: shot.damage }
          );
          mob.state = 'shooting';
        }
      } else {
        wanderMob(this, mob, dt, 0.5);
        mob.state = 'idle';
      }

      // Wiki: only the real illusioner can shoot and be damaged; the clones are purely visual.
      updateIllusionerDuplicates(mob, dt, {
        triggered: mob.duplicatesTriggered === true,
        ownerPosition: mob.mesh.position,
        ownerYaw: mob.mesh.rotation.y
      });

      moveGroundMob(this, mob, dt);
      mob.illusionerPhase = (mob.illusionerPhase || 0) + dt;
      poseIllusioner(mob, mob.illusionerPhase);
      return true;
    }
    if(mob.type==='snow_golem'){
      // Wiki: it wanders, throws a snowball a second at monsters to provoke them, leaves a snow trail,
      // and dies in hot biomes unless it has Fire Resistance.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      updateSnowGolemThrow(mob, dt);

      // Wiki: 1 damage per tick in contact with rain or water in a biome above temperature 1.0.
      const gy = Math.floor(mob.mesh.position.y);
      const inWater = this.world.getVoxel(
        Math.floor(mob.mesh.position.x), gy, Math.floor(mob.mesh.position.z)) === BLOCKS.WATER;
      const raining = this.game?.weather?.weatherType === 'rain' || this.game?.weather?.weatherType === 'thunder';
      const heat = updateSnowGolemHeat(mob, dt, { biome: mob.biome, inWater, raining });
      if (heat > 0 && mob.health <= 0) {
        // It died of heat, which is the wiki's whole point for hot biomes.
        return true;
      }

      // Wiki: it throws at monsters within 10 blocks, up to 16 when tethered.
      if (!mob.target || mob.target.health <= 0
        || mob.mesh.position.distanceTo(mob.target.mesh.position) > SNOW_GOLEM_RANGE.roam * 1.5) {
        mob.target = findSnowGolemTarget(this, mob);
      }
      const throwInfo = mob.target ? snowGolemThrow(mob, mob.target, { dt }) : null;
      if (throwInfo) {
        // Wiki: snowballs knock back and PROVOKE whatever they hit, and only damage blazes.
        // The shared `updateSnowballs` walks `p.mesh.position`, disposes `p.mesh.geometry`, and uses
        // `p.owner.position` as the damage origin, so all three have to be real. It is spawned just
        // outside the golem's own hitbox, because the updater damages the first mob it overlaps and
        // would otherwise have the golem shoot itself.
        const shot = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 6, 5),
          new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.snow })
        );
        shot.castShadow = true;
        const launch = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        launch.addScaledVector(throwInfo.direction, 0.45);
        shot.position.copy(launch);
        this.scene.add(shot);
        this.snowballs.push({
          mesh: shot,
          position: launch,
          velocity: throwInfo.direction.clone().multiplyScalar(12),
          damage: throwInfo.damage,
          provokes: true,
          // `owner` is the field the shared updater credits the hit to.
          owner: mob,
          shooter: mob,
          life: 3
        });
        mob.state = 'throwing';
      } else if (mob.target) {
        // Close the distance while reloading.
        const dir = mob.target.mesh.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        if (dir.lengthSq() > 1e-6) {
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * SNOW_GOLEM_SPEED * 4;
          mob.velocity.z = dir.z * SNOW_GOLEM_SPEED * 4;
        }
        mob.state = 'approaching';
      } else {
        wanderMob(this, mob, dt, 0.5);
        mob.state = 'idle';
      }

      // Wiki: it leaves a trail of snow as it moves, suppressed by mobGriefing. `snow_block` is not a
      // registered block here, so the trail is reported rather than written; the guard is explicit so
      // the mechanic is not silently missing.
      const moved = mob.velocity.lengthSq() > 0.01;
      if (moved && (this.game?.mobGriefing !== false) && mob.mesh.position.y > 1) {
        const trail = snowGolemTrailAt(mob, {
          mobGriefing: this.game?.mobGriefing !== false,
          canPlace: false
        });
        if (trail) mob.trail = trail;
      }

      moveGroundMob(this, mob, dt);
      mob.golemPhase = (mob.golemPhase || 0) + dt;
      poseSnowGolem(mob, mob.golemPhase);
      return true;
    }
    if(mob.type==='creaking'){
      // Wiki: it attacks by melee headbutt, but "cannot move at all while any players in Survival or
      // Adventure mode can see it". Its gaze logic is the whole mob, so it runs first and gates the rest.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      const watchers = this.getWatchers ? this.getWatchers() : (player ? [player] : []);
      // There is no shared line-of-sight helper in this codebase, so the creaking samples voxels along the
      // segment. Wiki: the "visual box block obstructs the view", so a solid block breaks the gaze.
      const hasLineOfSight = (m, p) => {
        const from = p?.position ?? p;
        const to = m?.mesh?.position ?? m?.position;
        if (!from || !to) return false;
        const toEye = to.clone();
        toEye.y += (m.height ?? 2.7) * 0.5;
        const delta = toEye.clone().sub(from);
        const distance = delta.length();
        if (distance < 1e-3) return true;
        const steps = Math.ceil(distance * 2);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const x = Math.floor(from.x + delta.x * t);
          const y = Math.floor(from.y + delta.y * t);
          const z = Math.floor(from.z + delta.z * t);
          const id = this.world?.getVoxel?.(x, y, z);
          if (id === undefined || id === null || id === BLOCKS.AIR) continue;
          // Wiki: glass, ice and the like do not break the view, and neither do blocks with no collision.
          if (CREAKING_VIEW_TRANSPARENT.has(id)) continue;
          return false;
        }
        return true;
      };

      updateCreakingAlert(mob, watchers, { hasLineOfSight });
      const observer = creakingFrozenBy(mob, watchers, { hasLineOfSight });
      mob.frozen = !!observer;
      mob.frozenBy = observer;

      // Wiki: while dying from its heart being destroyed it twitches, then dies.
      if (mob.dying) {
        mob.twitchTimer -= dt;
        mob.velocity.set(0, 0, 0);
        if (mob.twitchTimer <= 0) { mob.health = 0; }
        poseCreaking(mob, (mob.creakPhase = (mob.creakPhase || 0) + dt));
        return true;
      }

      // Wiki: naturally-spawned creakings despawn by day, out of heart range, or after 5 s sharing a
      // block with a player.
      let sameBlock = false;
      for (const w of watchers) {
        if (!w?.position) continue;
        if (Math.floor(w.position.x) === Math.floor(mob.mesh.position.x)
          && Math.floor(w.position.y) === Math.floor(mob.mesh.position.y)
          && Math.floor(w.position.z) === Math.floor(mob.mesh.position.z)) { sameBlock = true; break; }
      }
      if (updateCreakingDespawn(mob, dt, {
        worldTime: this.game?.worldTime ?? 6000,
        inSameBlockAsPlayer: sameBlock
      }) === 'despawned') {
        mob.health = 0;
        return true;
      }
      if (updateCreakingHeartLink(mob) === 'out-of-range') {
        // Wiki: pushed out of the 32-block radius, it dies.
        mob.health = 0;
        return true;
      }

      if (mob.frozen) {
        // Wiki: immobile, cannot attack, and cannot be pushed or knocked back.
        mob.velocity.set(0, 0, 0);
        mob.state = 'frozen';
      } else {
        const attack = creakingAttack(mob, watchers, { hasLineOfSight });
        if (attack && mob.hitCooldown <= 0) {
          player.takeDamage(attack.damage, mob.mesh.position, 'Creaking');
          mob.hitCooldown = 1;
          mob.state = 'attacking';
        } else if (mob.alerted && mob.target?.position) {
          // Wiki: alerted it "moves quickly, faster than an attacking vindicator". It only moves while
          // unobserved, which the frozen check above already guarantees.
          const dir = mob.target.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 1e-6) {
            dir.normalize();
            mob.yaw = Math.atan2(dir.x, dir.z);
            // Wiki: it never intentionally moves beyond 32 blocks from its heart.
            const step = mob.mesh.position.clone().add(dir.multiplyScalar(1));
            const clamped = creakingClampToHeart(mob, step);
            const toward = clamped.clone().sub(mob.mesh.position);
            toward.y = 0;
            if (toward.lengthSq() > 1e-6) {
              toward.normalize();
              mob.velocity.x = toward.x * CREAKING_SPEED * 6;
              mob.velocity.z = toward.z * CREAKING_SPEED * 6;
            }
          }
          mob.state = 'pursuing';
        } else {
          wanderMob(this, mob, dt, 0.6);
          mob.state = 'idle';
        }
      }

      moveGroundMob(this, mob, dt);
      mob.creakPhase = (mob.creakPhase || 0) + dt;
      poseCreaking(mob, mob.creakPhase);
      return true;
    }
    if(mob.type==='camel'){
      // Wiki: it wanders, sits for 2-7 seconds at a time, stands if there is headroom, flees when harmed
      // even while sitting, and follows a cactus-holding player within 10 blocks.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      updateCamelDash(mob, dt);

      // The headroom above is what decides whether it may stand: the wiki refuses when there are solid
      // blocks overhead, because standing would suffocate it.
      const cx = Math.floor(mob.mesh.position.x);
      const cy = Math.floor(mob.mesh.position.y);
      const cz = Math.floor(mob.mesh.position.z);
      let clearance = 0;
      for (let dy = 0; dy < 4; dy++) {
        const id = this.world.getVoxel(cx, cy + dy, cz);
        if (id === undefined || id === null || id === BLOCKS.AIR) clearance += 1;
        else break;
      }

      const held = player?.inventory?.getActiveItem?.();
      const heldId = typeof held?.id === 'string' ? held.id : '';
      const tempted = isCamelBreedingFood(heldId);

      // Wiki: a baby camel grows in 20 minutes and cannot be ridden or equipped.
      if (mob.isBaby && updateCamelGrowth(mob, dt)) {
        // The adult hitbox is restored by the growth step.
      }

      const sit = updateCamelSitting(mob, dt, {
        clearance,
        random: this.random ?? Math.random,
        alerted: mob.fleeing === true,
        fleeing: mob.fleeing === true,
        tempted
      });
      if (sit === 'stood') mob.state = 'standing';
      else if (sit === 'sat') mob.state = 'sitting';
      else if (sit === 'blocked') mob.state = 'sitting-blocked';

      // Wiki: a sitting camel does not move, and cannot be pushed by players or mobs.
      if (mob.isSitting) {
        mob.velocity.x = 0;
        mob.velocity.z = 0;
      } else if (tempted && player?.position) {
        // Wiki: a cactus-tempted camel follows within 10 blocks.
        const dir = player.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const distance = dir.length();
        if (distance > 2) {
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * 2.2;
          mob.velocity.z = dir.z * 2.2;
        } else { mob.velocity.x *= 0.6; mob.velocity.z *= 0.6; }
        mob.state = 'following';
      } else {
        wanderMob(this, mob, dt, 0.9);
        mob.state = 'idle';
      }

      // Wiki: it heals slowly on its own, at 1/900 per tick.
      updateCamelRegen(mob, dt, this.random ?? Math.random);

      moveGroundMob(this, mob, dt);
      if (mob.onGround) mob.groundY = mob.mesh.position.y;
      mob.camelPhase = (mob.camelPhase || 0) + dt;
      if (mob.saddleMesh) mob.saddleMesh.visible = mob.hasSaddle === true;
      poseCamel(mob, mob.camelPhase);
      return true;
    }
    if(mob.type==='wandering_trader'){
      // Wiki: it wanders within 16 blocks of where it appeared, drinks Invisibility at dusk and milk at
      // dawn, avoids zombies and illagers, and despawns after 40 minutes.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      // Roll the offers once, which the wiki defers until the trading UI is first opened.
      if (!mob.tradesRolled) {
        mob.offers = rollTrades(ITEMS, BLOCKS, this.random ?? Math.random);
        mob.tradesRolled = true;
      }

      // Wiki: the despawn timer does not run while the trading UI is open.
      if (updateTraderDespawn(mob, dt, { tradingOpen: this.game?.tradingOpen === true }) === 'despawned') {
        // Wiki: a wandering trader that despawns leaves nothing behind.
        this.removeMob?.(mob);
        mob.health = 0;
        return true;
      }

      // Wiki: Invisibility from dusk through the night, milk at dawn.
      const drink = updateTraderInvisibility(mob, dt, this.game?.worldTime ?? 6000);
      if (drink) {
        mob.drinking = true;
        mob.drinkingItem = drink === 'drank_potion' ? 'potion_of_invisibility' : 'milk_bucket';
        mob.drinkTimer = 1.2;
      }
      if (mob.drinking) {
        mob.drinkTimer -= dt;
        if (mob.drinkTimer <= 0) { mob.drinking = false; mob.drinkingItem = null; }
      }
      // The invisible state is a visibility toggle, not a status effect, because the wiki describes it
      // as the trader drinking a potion rather than being affected by one.
      if (mob.mesh) mob.mesh.visible = !mob.isInvisible || mob.drinking;

      // Wiki: it flees hazards, staying at least 8 blocks away.
      const hazard = findTraderHazard(this, mob);
      if (hazard) {
        const away = mob.mesh.position.clone().sub(hazard.mesh.position);
        away.y = 0;
        if (away.lengthSq() > 1e-6) away.normalize();
        mob.yaw = Math.atan2(away.x, away.z);
        mob.velocity.x = away.x * 2.4;
        mob.velocity.z = away.z * 2.4;
        mob.state = 'fleeing';
      } else {
        // Wiki: it prefers to wander within 16 blocks of its spawn point rather than following a player.
        wanderMob(this, mob, dt, 0.7);
        const fromHome = Math.hypot(mob.mesh.position.x - (mob.homeX ?? mob.mesh.position.x), mob.mesh.position.z - (mob.homeZ ?? mob.mesh.position.z));
        if (fromHome > WANDERING_TRADER_WANDER_RANGE) {
          const home = new THREE.Vector3(mob.homeX ?? mob.mesh.position.x, mob.mesh.position.y, mob.homeZ ?? mob.mesh.position.z);
          const back = home.sub(mob.mesh.position);
          back.y = 0;
          if (back.lengthSq() > 1e-6) back.normalize();
          mob.yaw = Math.atan2(back.x, back.z);
          mob.velocity.x = back.x * 1.6;
          mob.velocity.z = back.z * 1.6;
        }
        mob.state = 'wandering';
      }

      moveGroundMob(this, mob, dt);
      mob.traderPhase = (mob.traderPhase || 0) + dt;
      poseWanderingTrader(mob, mob.traderPhase);
      return true;
    }
    if(mob.type==='allay'){
      // Wiki: it flies aimlessly until given an item, then follows that player and fetches dropped
      // copies of it. It also dances by a playing jukebox, focuses on a note block it hears, and
      // regenerates 2 HP a second.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      updateAllayRegen(mob, dt);
      mob.allayPhase = (mob.allayPhase || 0) + dt;

      // Wiki: it cannot enter water, so a water tile is treated as a wall.
      const ax = Math.floor(mob.mesh.position.x);
      const ay = Math.floor(mob.mesh.position.y);
      const az = Math.floor(mob.mesh.position.z);
      const inWater = this.world.getVoxel(ax, ay, az) === BLOCKS.WATER;

      const outcome = updateAllayJob(this, mob, dt, player, {
        mobGriefing: this.game?.mobGriefing !== false,
        // `random` is not in scope in this branch; the manager's own source is what the neighbouring
        // branches use, and the helper defaults to Math.random.
        random: this.random ?? Math.random
      });

      // Wiki: it cannot enter water, so a planned move into water is cancelled.
      if (inWater) {
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        mob.mesh.position.y += 1.5 * dt;
      }

      moveFlyingMob(this, mob, dt);
      // The dance uses the resting height as its baseline, so it bobs instead of drifting upward.
      if (outcome !== 'dancing') mob.baseY = mob.mesh.position.y;
      poseAllay(mob, mob.allayPhase);
      mob.state = outcome ?? 'idle';
      return true;
    }
    if(mob.type==='sniffer'){
      // Wiki: passive. It wanders, scents the ground and digs up a torchflower seed or a pitcher pod,
      // but only under a long list of conditions -- which `updateSnifferDig` owns.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      const sx = Math.floor(mob.mesh.position.x);
      const sy = Math.floor(mob.mesh.position.y);
      const sz = Math.floor(mob.mesh.position.z);
      // sy is the floor of the mob's y, so its FEET are one below that. Using sy - 1 for the ground
      // was an off-by-one that made the sniffer treat the block under the floor as its footing.
      const feetY = sy - 1;
      const feetId = this.world.getVoxel(sx, feetY, sz);
      // The block under the snout, 2.25 blocks ahead.
      const headPos = snifferHeadPosition(mob);
      const headGroundId = this.world.getVoxel(
        Math.floor(headPos.x), feetY, Math.floor(headPos.z)
      );
      const held = player?.inventory?.getActiveItem?.();
      const heldId = typeof held?.id === 'string' ? held.id : '';

      // Wiki: a snifflet takes 2400 s and cannot dig.
      if (mob.isBaby && updateSniffletGrowth(mob, dt)) {
        // The adult hitbox is restored by the growth step, and the initial dig lag is set there.
      }

      // Groundedness is tested against the world rather than read from `mob.onGround`. Wiki: "A sniffer
      // can only dig if it is on the ground", and the shared mover only sets `onGround` through the
      // collision path, which a headless arena does not exercise -- so relying on it meant a sniffer
      // standing on grass refused to dig forever. The block under its feet is the durable answer.
      const solidBelow = (x, y, z) => {
        const id = this.world.getVoxel(x, y, z);
        if (id === undefined || id === null) return false;
        return id !== BLOCKS.AIR && id !== BLOCKS.WATER && id !== BLOCKS.LAVA;
      };
      const standingOnSolid = solidBelow(sx, feetY, sz);
      // The sniffer is heavy and wide, and the shared mover settles a mob on the floor only through the
      // collision path, which a headless arena does not exercise. Pinning it to the surface directly is
      // what keeps a 1.9-wide mob on the ground instead of sinking through it; a mob that fell forever
      // could never satisfy "a sniffer can only dig if it is on the ground".
      if (standingOnSolid && mob.mesh.position.y < feetY + 1) {
        mob.mesh.position.y = feetY + 1;
        mob.velocity.y = 0;
        mob.onGround = true;
      }
      const digOutcome = updateSnifferDig(this, mob, dt, {
        onGround: standingOnSolid,
        leashed: !!mob.leashHolder,
        inWater: this.world.getVoxel(sx, sy, sz) === BLOCKS.WATER,
        tempted: isSnifferBreedingFood(heldId),
        panicking: mob.fleeing === true,
        inVehicle: !!mob.vehicle,
        headBlockId: headGroundId,
        groundBlockId: feetId
      });

      if (digOutcome === 'searching') {
        // `updateSnifferDig` set the velocity toward the spot; the mover below applies it.
        mob.state = 'searching';
      } else if (digOutcome === 'splooting') {
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        mob.state = 'splooting';
      } else if (digOutcome === 'dug') {
        mob.state = 'idle';
      } else {
        // Wiki: a sniffer is tempted by torchflower seeds like other breedable animals, and otherwise
        // wanders aimlessly.
        if (isSnifferBreedingFood(heldId) && player?.position) {
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          const distance = dir.length();
          if (distance > 2) {
            dir.normalize();
            mob.yaw = Math.atan2(dir.x, dir.z);
            mob.velocity.x = dir.x * 1.2;
            mob.velocity.z = dir.z * 1.2;
          } else { mob.velocity.x *= 0.6; mob.velocity.z *= 0.6; }
        } else {
          wanderMob(this, mob, dt, 0.5);
        }
        mob.state = 'idle';
      }

      moveGroundMob(this, mob, dt);
      // `poseSniffer` needs to know the ground height, because the sploot drops the whole model.
      if (mob.onGround) mob.groundY = mob.mesh.position.y;
      mob.snifferPhase = (mob.snifferPhase || 0) + dt;
      poseSniffer(mob, mob.snifferPhase);
      return true;
    }
    if(mob.type==='breeze'){
      // Wiki: it leaps around between firing wind charges at its target, and does not retaliate
      // against the trial-spawner mobs.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.inLava = this.world.getVoxel(
        Math.floor(mob.mesh.position.x),
        Math.floor(mob.mesh.position.y),
        Math.floor(mob.mesh.position.z)
      ) === BLOCKS.LAVA;

      const target = findBreezeTarget(this, mob, player, {
        difficulty: this.game?.difficulty ?? 'normal'
      });

      // Wiki: it shoots a wind charge at a target within 16 blocks on a 1.6 s cooldown.
      const charge = fireWindCharge(this, mob, dt, target);
      if (charge) {
        if (!this.windCharges) this.windCharges = [];
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 6, 6),
          new THREE.MeshBasicMaterial({ color: BREEZE_COLORS.wind, transparent: true, opacity: 0.8 })
        );
        mesh.position.copy(charge.position);
        this.scene.add(mesh);
        charge.mesh = mesh;
        this.windCharges.push(charge);
      }

      // The leap, which is this mob's locomotion. Wiki: it can leap up to 15 blocks horizontally
      // and 5 vertically, compressing first and sliding on landing.
      updateBreezeLeap(this, mob, dt, target);
      if (target) {
        const pos = target.position ?? target.mesh?.position;
        if (pos) {
          const dir = pos.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 1e-6) mob.yaw = Math.atan2(dir.x, dir.z);
        }
      } else {
        // Wiki: it leaps around even with no target.
        mob.yaw += Math.sin((mob.breezePhase || 0) * 0.4) * dt * 0.8;
        if (mob.leapState === 'idle') {
          mob.velocity.x = Math.sin(mob.yaw) * 1.6;
          mob.velocity.z = Math.cos(mob.yaw) * 1.6;
        }
      }

      moveGroundMob(this, mob, dt);
      mob.breezePhase = (mob.breezePhase || 0) + dt;
      poseBreeze(mob, mob.breezePhase);
      mob.state = mob.leapState;
      return true;
    }
    if(mob.type==='phantom'){
      // Wiki: hostile undead flyer. It circles above its target, swoops every 8-12s to bite, retreats
      // to its anchor when hurt mid-swoop, keeps 16 blocks from cats, burns in sunlight, and is
      // fall-damage immune.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.target = findPhantomTarget(this, mob, player, { difficulty: this.game?.difficulty ?? 'normal' });

      // Wiki: like other undead, it burns in sunlight.
      const phX = Math.floor(mob.mesh.position.x);
      const phY = Math.floor(mob.mesh.position.y);
      const phZ = Math.floor(mob.mesh.position.z);
      const skyLight = this.world.getLightLevel?.(phX, phY, phZ) ?? 15;
      const isDaytime = (this.game?.worldTime ?? 6000) % 24000 < 12000;
      mob.inSunlight = phantomBurnsInSunlight(mob, skyLight, isDaytime);
      // `isBurning` is set in both directions. Leaving it undefined when the phantom is not on fire
      // made "is it burning?" unanswerable rather than false, which telemetry and tests both care
      // about.
      if (mob.inSunlight && !mob.isBurning) { mob.isBurning = true; mob.burnTimer = 8; }
      if (!mob.inSunlight && mob.isBurning && mob.burnTimer <= 0) { mob.isBurning = false; }
      if (mob.isBurning) {
        mob.burnTimer -= dt;
        if (mob.burnTimer <= 0) { mob.isBurning = false; mob.burnTick = undefined; }
        else {
          mob.burnTick = (mob.burnTick ?? 1) - dt;
          if (mob.burnTick <= 0) { mob.burnTick = 1; this.damageMob(mob, 1, null, false, null, true); }
        }
      }

      updatePhantomFlight(this, mob, dt, player, { move: moveFlyingMob });
      posePhantom(mob);
      return true;
    }
    if(mob.type==='parrot'){
      // Wiki: 6 HP tameable flying passive. It flies idly and rests often, follows its owner and
      // teleports at 12 blocks, perches on a shoulder, imitates nearby hostile mobs, and dances by a
      // jukebox that is playing a disc.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.imitateCooldown = Math.max(0, (mob.imitateCooldown || 0) - dt);

      // 1. Perched: drawn on the player's shoulder, and it takes no part in the world.
      if (mob.perchedOn) {
        updateParrotFlight(this, mob, dt, player, { move: moveFlyingMob });
        // Wiki lists the states that force a dismount; the previous height is what the rise and drop
        // thresholds are measured against.
        const previous = { y: mob.lastOwnerY ?? player?.position?.y };
        if (shouldDismountForPlayerState(player, previous)) {
          dismountShoulder(mob, player);
          mob.velocity.set(0, 1.5, 0);
        }
        mob.lastOwnerY = player?.position?.y;
        poseParrot(mob, mob.parrotPhase || 0);
        return true;
      }

      // 2. Dancing, when a jukebox nearby is playing.
      mob.isDancing = canDance(this, mob);
      if (mob.isDancing) {
        mob.velocity.set(0, 0, 0);
        const groundY = this.world.surfaceHeightAt?.(mob.mesh.position.x, mob.mesh.position.z);
        if (typeof groundY === 'number' && mob.mesh.position.y > groundY + 1.5) mob.velocity.y = -1.5;
        moveFlyingMob(this, mob, dt);
        mob.parrotPhase = (mob.parrotPhase || 0) + dt * 6;
        poseParrot(mob, mob.parrotPhase);
        return true;
      }

      // 3. Imitating a nearby hostile mob. Wiki: within 20 blocks, and never on Peaceful.
      if (mob.imitateCooldown <= 0) {
        mob.imitateCooldown = 4 + Math.random() * 6;
        const target = findImitateTarget(this, mob, { difficulty: this.game?.difficulty ?? 'normal' });
        mob.imitating = target ? target.type : null;
      }

      // 4. Flight, or following the owner.
      updateParrotFlight(this, mob, dt, player, { move: moveFlyingMob });

      mob.parrotPhase = (mob.parrotPhase || 0) + dt * 8;
      poseParrot(mob, mob.parrotPhase);
      return true;
    }
    if(mob.type==='tadpole'){
      // Wiki: 6 HP aquatic passive. It swims aimlessly in water, flops on land and seeks the nearest
      // water, dies in under 20 seconds out of water, and matures into whichever frog variant its
      // current biome dictates.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      const tX = Math.floor(mob.mesh.position.x);
      const tY = Math.floor(mob.mesh.position.y + 0.05);
      const tZ = Math.floor(mob.mesh.position.z);
      const inWater = this.world.getVoxel(tX, tY, tZ) === BLOCKS.WATER;
      const remaining = updateTadpoleDryness(mob, dt, inWater);
      mob.inWater = inWater;

      // Wiki: "They die in less than 20 seconds after being out of water." It dies of exposure, not
      // of a kill, so there is no loot and no XP either way.
      if (remaining <= 0 && mob.health > 0) {
        mob.health = 0;
        mob.diedOfDryness = true;
        this.updateDeath(mob, dt);
        return true;
      }

      // Wiki: one Minecraft day to grow, 10% faster per slimeball, and the *biome it is in* decides
      // the frog variant — the game's only case of the environment deciding a baby's adult form.
      if (updateTadpoleGrowth(mob, dt)) {
        this.matureTadpole(mob);
        return true;
      }

      if (inWater) {
        // Swim aimlessly, as the wiki describes.
        mob.timer = (mob.timer || 0) - dt;
        if (mob.timer <= 0) {
          mob.timer = 1.5 + Math.random() * 2.5;
          mob.yaw = Math.random() * Math.PI * 2;
          mob.pitch = (Math.random() - 0.5) * 0.4;
        }
        mob.velocity.x = Math.sin(mob.yaw) * Math.cos(mob.pitch) * TADPOLE_SPEED.water;
        mob.velocity.z = Math.cos(mob.yaw) * Math.cos(mob.pitch) * TADPOLE_SPEED.water;
        mob.velocity.y = -Math.sin(mob.pitch) * TADPOLE_SPEED.water;
        mob.mesh.position.addScaledVector(mob.velocity, dt);
      } else {
        // Wiki: on land it flops and seeks the nearest water.
        mob.waterSearchTimer = (mob.waterSearchTimer || 0) + dt;
        if (!mob.waterTarget || mob.mesh.position.distanceTo(mob.waterTarget) < 1.0) {
          mob.waterTarget = this.findWaterNearTadpole(mob);
        }
        if (mob.waterTarget) {
          const dir = mob.waterTarget.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 1e-6) { dir.normalize(); mob.yaw = Math.atan2(dir.x, dir.z); }
        }
        mob.flopTimer = (mob.flopTimer || 0) - dt;
        if (mob.flopTimer <= 0) {
          mob.flopTimer = 0.5 + Math.random() * 0.6;
          mob.velocity.y = 2.4 + Math.random();
          mob.velocity.x = Math.sin(mob.yaw) * TADPOLE_SPEED.land * 2;
          mob.velocity.z = Math.cos(mob.yaw) * TADPOLE_SPEED.land * 2;
        }
        moveGroundMob(this, mob, dt);
      }

      mob.tadpolePhase = (mob.tadpolePhase || 0) + dt * (inWater ? 8 : 14);
      poseTadpole(mob, mob.tadpolePhase);
      return true;
    }
    if(mob.type==='frog'){
      // Wiki: passive. It makes long jumps of up to 8 blocks, swims fast without drowning, and eats
      // small slimes and magma cubes with its tongue.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.tongueCooldown = Math.max(0, (mob.tongueCooldown || 0) - dt);
      mob.eatTimer = Math.max(0, (mob.eatTimer || 0) - dt);
      mob.croakTimer = Math.max(0, (mob.croakTimer || 0) - dt);

      const fX = Math.floor(mob.mesh.position.x);
      const fY = Math.floor(mob.mesh.position.y + 0.1);
      const fZ = Math.floor(mob.mesh.position.z);
      mob.inWater = this.world.getVoxel(fX, fY, fZ) === BLOCKS.WATER;

      // 1. A tongue flick in progress: drag the prey in and eat it.
      if (mob.tongueTimer > 0) {
        updateFrogTongue(this, mob, dt);
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        if (mob.inWater) mob.mesh.position.addScaledVector(mob.velocity, dt);
        else moveGroundMob(this, mob, dt);
        poseFrog(mob, mob.frogPhase || 0);
        return true;
      }

      // 2. Look for something edible: only size-1 slimes and magma cubes.
      if (mob.tongueCooldown <= 0 && !mob.isFrogJumping) {
        let prey = null;
        let bestDist = FROG_TONGUE.range;
        for (const other of this.mobs) {
          if (!frogCanEat(mob, other)) continue;
          const d = mob.mesh.position.distanceTo(other.mesh.position);
          if (d < bestDist) { bestDist = d; prey = other; }
        }
        if (prey) {
          const dir = prey.mesh.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 1e-6) { dir.normalize(); mob.yaw = Math.atan2(dir.x, dir.z); }
          startFrogTongue(mob, prey);
          poseFrog(mob, mob.frogPhase || 0);
          return true;
        }
      }

      // 3. Movement: swim in water, otherwise a slow wander punctuated by long jumps.
      if (mob.inWater) {
        // Wiki: it swims upward and stays at the surface, and cannot drown.
        mob.velocity.x = Math.sin(mob.yaw) * FROG_SPEED.water;
        mob.velocity.z = Math.cos(mob.yaw) * FROG_SPEED.water;
        mob.velocity.y = mob.mesh.position.y < (this.world.surfaceHeightAt?.(fX, fZ) ?? 0) + 1 ? 1.6 : 0;
        mob.mesh.position.addScaledVector(mob.velocity, dt);
        mob.swimCycle = (mob.swimCycle || 0) + dt * 4;
        mob.isFrogJumping = false;
      } else {
        if (mob.isFrogJumping && mob.onGround) mob.isFrogJumping = false;
        mob.hopTimer = (mob.hopTimer || 0) - dt;
        mob.timer = (mob.timer || 0) - dt;
        if (mob.timer <= 0) {
          mob.timer = 2 + Math.random() * 3;
          mob.yaw = Math.random() * Math.PI * 2;
          // Wiki: it occasionally croaks and inflates its vocal sac.
          if (Math.random() < 0.3) mob.croakTimer = 0.6;
        }
        if (mob.hopTimer <= 0 && mob.onGround) {
          // Wiki: a frog prefers jumping to higher ground, so each hop aims a little upward.
          mob.hopTimer = 0.8 + Math.random() * 1.2;
          startFrogJump(mob, { height: 2.2 + Math.random() * 1.5, forward: 1.5 + Math.random() });
        }
        moveGroundMob(this, mob, dt);
      }

      mob.frogPhase = (mob.frogPhase || 0) + dt * (mob.inWater ? 4 : 6);
      poseFrog(mob, mob.frogPhase);
      return true;
    }
    if(mob.type==='turtle'){
      // Wiki: passive. Slow on land, fast in water, heads for water while on land, flees when
      // attacked, and returns to its home block to lay a cluster of eggs after breeding.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      const movement = updateTurtleMovement(this, mob, dt, player, { wander: wanderMob });

      // Wiki: the turtle digs for a few seconds, then lays 1-4 eggs on nearby sand at home.
      if (mob.hasEgg && movement === 'returning-home' && mob.state === 'digging') {
        const laid = tryLayTurtleEggs(this, mob, dt);
        if (laid > 0) mob.breedCooldown = TURTLE_BREED_COOLDOWN_SECONDS;
      } else if (mob.hasEgg) {
        mob.digTimer = 0;
      }

      // Fleeing when hurt, like other passive mobs.
      if (mob.hurtTime > 0 && player?.position) {
        const away = mob.mesh.position.clone().sub(player.position);
        away.y = 0;
        if (away.lengthSq() > 1e-6) {
          away.normalize();
          mob.yaw = Math.atan2(away.x, away.z);
          const speed = mob.inWater ? 2.6 : 1.6;
          mob.velocity.x = away.x * speed;
          mob.velocity.z = away.z * speed;
        }
      }

      // A turtle in water floats rather than falling, so gravity is skipped there.
      if (mob.inWater) {
        mob.mesh.position.addScaledVector(mob.velocity, dt);
      } else {
        moveGroundMob(this, mob, dt);
      }

      mob.turtlePhase = (mob.turtlePhase || 0) + dt * (mob.inWater ? 6 : 4);
      poseTurtle(mob, mob.turtlePhase);
      return true;
    }
    if(isLlamaLike(mob)){
      // Wiki: neutral. It spits at whatever attacked it and at wolves without provocation, is
      // completely passive on Peaceful, and has a 1/900 chance per tick to regenerate 1 HP.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.spitCooldown = Math.max(0, (mob.spitCooldown || 0) - dt);

      if (mob.health < mob.maxHealth && Math.random() < dt * 20 / 900) {
        mob.health = Math.min(mob.maxHealth, mob.health + 1);
      }

      // The head comes up, then it fires. The charge is on a timer so the pose is visible.
      mob.spitCharge = Math.max(0, (mob.spitCharge || 0) - dt);
      if (mob.pendingSpitTarget && mob.spitCharge <= 0) {
        spawnLlamaSpit(this, mob, mob.pendingSpitTarget);
        mob.pendingSpitTarget = null;
        mob.spitCooldown = 1.5;
      }

      // Pick something to spit at: its attacker, or a wolf without provocation.
      if (!mob.pendingSpitTarget && mob.spitCooldown <= 0) {
        let target = null;
        let bestDist = 16;
        const candidates = [];
        if (player?.position) candidates.push(player);
        for (const other of this.mobs) if (other !== mob) candidates.push(other);
        for (const candidate of candidates) {
          if (!llamaWantsToSpit(mob, candidate, {
            difficulty: this.game?.difficulty ?? 'normal',
            recentAttacker: mob.recentAttacker
          })) continue;
          const pos = candidate.position ?? candidate.mesh?.position;
          if (!pos) continue;
          const dist = mob.mesh.position.distanceTo(pos);
          if (dist < bestDist) { bestDist = dist; target = candidate; }
        }
        if (target) {
          mob.pendingSpitTarget = target;
          mob.spitCharge = 0.5;
          const pos = target.position ?? target.mesh?.position;
          const dir = pos.clone().sub(mob.mesh.position);
          dir.y = 0;
          if (dir.lengthSq() > 1e-6) { dir.normalize(); mob.yaw = Math.atan2(dir.x, dir.z); }
          mob.velocity.x = 0;
          mob.velocity.z = 0;
          moveGroundMob(this, mob, dt);
          poseLlamaLegs(mob, mob.llamaPhase || 0, false);
          return true;
        }
      }

      // Firing, or wandering.
      if (mob.pendingSpitTarget) {
        mob.velocity.x = 0;
        mob.velocity.z = 0;
      } else {
        wanderMob(this, mob, dt, 1.0);
      }
      moveGroundMob(this, mob, dt);
      mob.llamaPhase = (mob.llamaPhase || 0) + dt * 7;
      poseLlamaLegs(mob, mob.llamaPhase, !mob.pendingSpitTarget && Math.hypot(mob.velocity.x, mob.velocity.z) > 0.1);
      return true;
    }
    if(mob.type==='goat'){
      // Wiki: neutral. It leaps up to 10 blocks high and 5 across on a 30-60s cooldown, and every
      // 30s-5min (5-15s for a screaming goat) tries to ram an unmoving target it can see 4-16 blocks
      // away. A goat does not retaliate when harmed.
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);
      mob.jumpCooldown = Math.max(0, (mob.jumpCooldown || 0) - dt);
      mob.ramCooldown = Math.max(0, (mob.ramCooldown || 0) - dt);

      // 1. A ram already in progress: the head is down and the goat is committed.
      if (mob.ramState) {
        updateGoatRam(this, mob, dt, { move: moveGroundMob });
        poseGoat(mob);
        mob.goatPhase = (mob.goatPhase || 0) + dt * 10;
        poseGoatLegs(mob, mob.goatPhase, mob.ramState !== 'preparing');
        return true;
      }

      // 2. Land a long jump, restoring the walking hitbox.
      if (mob.isGoatJumping && mob.onGround) {
        landGoatJump(mob);
        mob.height = mob.isBaby ? GOAT_BABY_DIMENSIONS.height : GOAT_DIMENSIONS.height;
      }

      // 3. Wiki: holding wheat makes a goat that was preparing to ram stop and walk to the player.
      const heldItem = player?.inventory?.getActiveItem?.();
      const heldId = typeof heldItem?.id === 'string' ? heldItem.id.toLowerCase() : '';
      const tempted = heldId.includes('wheat') && !heldId.includes('seed');

      // 4. Look for something to ram. Wiki: it must be unmoving, within 4-16 blocks, and not a
      // ghast or another goat.
      if (mob.ramCooldown <= 0 && !tempted) {
        const target = this.findGoatRamTarget(mob, player);
        if (target) {
          startGoatRam(mob, target);
          mob.ramCooldown = rollGoatRamCooldown(mob.isScreamingGoat);
        } else {
          // Nothing worth charging right now; wait before looking again.
          mob.ramCooldown = 1 + Math.random() * 2;
        }
      }

      // 5. Wander, but a goat prefers to climb rather than keep to the low ground.
      if (tempted && player?.position) {
        const dir = player.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist <= GOAT_FOLLOW_RANGE && dist > 1.6) {
          dir.normalize();
          mob.yaw = Math.atan2(dir.x, dir.z);
          mob.velocity.x = dir.x * 1.8;
          mob.velocity.z = dir.z * 1.8;
        } else {
          mob.velocity.x *= 0.6;
          mob.velocity.z *= 0.6;
        }
      } else {
        wanderMob(this, mob, dt, 1.0);
        // Wiki: a goat jumps when trying to cross an obstacle, and it tends to ascend hills.
        if (mob.jumpCooldown <= 0 && mob.onGround && Math.random() < dt * 0.8) {
          // Aim at the next waypoint so the leap carries it up the slope.
          if (mob.wanderGoal) {
            const dir = mob.wanderGoal.clone().sub(mob.mesh.position);
            dir.y = 0;
            if (dir.lengthSq() > 1e-6) { dir.normalize(); mob.yaw = Math.atan2(dir.x, dir.z); }
          }
          const ahead = new THREE.Vector3(
            mob.mesh.position.x + Math.sin(mob.yaw) * 1.5,
            mob.mesh.position.y,
            mob.mesh.position.z + Math.cos(mob.yaw) * 1.5
          );
          // Only jump when the ground ahead is a step up, which is the obstacle case.
          const stepUp = this.world?.getVoxel?.(Math.floor(ahead.x), Math.floor(ahead.y) + 1, Math.floor(ahead.z));
          if (typeof stepUp === 'number' && stepUp !== 0) {
            startGoatJump(mob, { height: 2.5, distance: 3 });
            mob.width = GOAT_JUMP_DIMENSIONS.width;
            mob.height = GOAT_JUMP_DIMENSIONS.height;
          }
        }
      }

      moveGroundMob(this, mob, dt);
      poseGoat(mob);
      mob.goatPhase = (mob.goatPhase || 0) + dt * (mob.isGoatJumping ? 4 : 8);
      poseGoatLegs(mob, mob.goatPhase, Math.hypot(mob.velocity.x, mob.velocity.z) > 0.1);
      return true;
    }
    if(mob.type==='bee'){
      // Wiki: a bee that has stung loses its stinger, cannot attack again, does not return home,
      // and dies about a minute later. It also drowns in water.
      updateBeeAnger(mob, dt);
      if (updateBeeStingerless(mob, dt)) {
        // It dies of its injuries rather than being killed, so this goes through the normal
        // death path with no loot or XP.
        if (mob.health <= 0) this.updateDeath(mob, dt);
        return true;
      }

      const bX = Math.floor(mob.mesh.position.x);
      const bY = Math.floor(mob.mesh.position.y + 0.15);
      const bZ = Math.floor(mob.mesh.position.z);
      const inWater = this.world.getVoxel(bX, bY, bZ) === BLOCKS.WATER;
      updateBeeWater(this, mob, dt, inWater);

      // Nectar: gathered while circling a flower, delivered at the hive.
      const flowerBelow = this.world.getVoxel(bX, bY - 1, bZ);
      const atFlower = isBeeFlower(flowerBelow);
      if (!mob.hasNectar && atFlower) updateBeeNectar(mob, dt, { atFlower: true });

      // A stung bee cannot sting again, so it flees instead of attacking.
      if (mob.stingerless) {
        if (player?.position) {
          const away = mob.mesh.position.clone().sub(player.position);
          away.y = 0;
          if (away.lengthSq() > 1e-6) {
            away.normalize();
            mob.yaw = Math.atan2(away.x, away.z);
            mob.velocity.set(away.x * 2.4, 1.0, away.z * 2.4);
          }
        }
        poseBee(mob);
        moveFlyingMob(this, mob, dt);
        mob.beePhase = (mob.beePhase || 0) + dt * 24;
        return true;
      }

      // Anger: chase and sting.
      if (beeIsAngry(mob) && mob.angryAt?.position) {
        const target = mob.angryAt;
        const dir = target.position.clone().sub(mob.mesh.position);
        const dist = dir.length();
        if (dist > 0.001) dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        mob.pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y))) * 0.6;
        mob.velocity.set(
          Math.sin(mob.yaw) * Math.cos(mob.pitch) * 3.4,
          dir.y * 3.4,
          Math.cos(mob.yaw) * Math.cos(mob.pitch) * 3.4
        );
        // Wiki: the sting lands on contact, and is what kills the bee.
        if (dist < 1.2) beeSting(this, mob, target);
        poseBee(mob);
        moveFlyingMob(this, mob, dt);
        mob.beePhase = (mob.beePhase || 0) + dt * 28;
        return true;
      }

      // Calm flight: wander, and return toward the hive when carrying nectar.
      if (mob.hasNectar && mob.hive?.mesh?.position) {
        const toHive = mob.hive.mesh.position.clone().sub(mob.mesh.position);
        const dist = toHive.length();
        if (dist > 0.001) toHive.normalize();
        mob.yaw = Math.atan2(toHive.x, toHive.z);
        mob.velocity.set(toHive.x * 2.2, toHive.y * 2.2, toHive.z * 2.2);
      } else {
        mob.wanderTimer = (mob.wanderTimer || 0) - dt;
        if (mob.wanderTimer <= 0) {
          mob.wanderTimer = 1 + Math.random() * 2;
          mob.yaw += (Math.random() - 0.5) * 2.2;
          mob.targetPitch = (Math.random() - 0.5) * 0.5;
        }
        mob.pitch = (mob.pitch || 0) + ((mob.targetPitch ?? 0) - (mob.pitch || 0)) * Math.min(1, dt * 3);
        mob.velocity.set(
          Math.sin(mob.yaw) * Math.cos(mob.pitch) * 1.8,
          -Math.sin(mob.pitch) * 1.8,
          Math.cos(mob.yaw) * Math.cos(mob.pitch) * 1.8
        );
      }
      poseBee(mob);
      moveFlyingMob(this, mob, dt);
      mob.beePhase = (mob.beePhase || 0) + dt * 22;
      return true;
    }
    if(mob.type==='fox'){
      // Wiki: hunts small animals by pouncing, flees untrusted non-sneaking players, sleeps
      // during the day under cover, and drops whatever it is holding when it dies.
      mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
      mob.hitCooldown = Math.max(0, (mob.hitCooldown || 0) - dt);

      // 1. Sleeping. Wiki: daytime, no thunderstorm, sky light 14 or less.
      const isDaytime = (this.game?.worldTime ?? 6000) % 24000 < 12000;
      const thundering = this.game?.weather?.weatherType === 'thunder';
      const canSleep = foxCanSleep(this, mob, isDaytime, thundering);
      if (canSleep) {
        mob.isSleeping = true;
        mob.velocity.set(0, 0, 0);
        // Wiki: while asleep it slowly moves its head up and down.
        mob.sleepingHeadTimer = (mob.sleepingHeadTimer || 0) + dt;
        if (mob.head) mob.head.rotation.x = Math.sin(mob.sleepingHeadTimer * 1.5) * 0.12;
        // Wiki: it wakes if a player or mob approaches.
        const near = this.mobs.some(m => m !== mob && m.health > 0
          && m.mesh.position.distanceTo(mob.mesh.position) < 3);
        const playerNear = player?.position && mob.mesh.position.distanceTo(player.position) < 4;
        if (!near && !playerNear) return true;
        mob.isSleeping = false;
      } else {
        mob.isSleeping = false;
      }

      // 2. Pouncing, once started.
      if (mob.pouncePhase) {
        updateFoxPounce(mob, dt, mob.pounceTarget?.mesh?.position || mob.pounceTarget?.position || null);
        moveGroundMob(this, mob, dt);
        mob.foxPhase = (mob.foxPhase || 0) + dt * 8;
        poseFoxLegs(mob, mob.foxPhase, false);
        return true;
      }

      // 3. Choose a target: prey first, as the wiki says a fox prefers attacking over looting.
      let target = null;
      let bestDist = 16;
      for (const other of this.mobs) {
        if (other === mob || other.health <= 0) continue;
        if (!FOX_PREY.includes(other.type)) continue;
        if (other.isBaby && other.type !== 'chicken' && other.type !== 'rabbit') continue;
        const d = mob.mesh.position.distanceTo(other.mesh.position);
        if (d < bestDist) { bestDist = d; target = other; }
      }

      if (target) {
        const dir = target.mesh.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 0.001) dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        // Wiki: it attacks by running against the target or by pouncing, and pounces from range.
        // The guard matters: without it the fox re-triggers the crouch every frame while it is in
        // range, resetting the timer forever, so it crouches and never actually leaps.
        if (dist < FOX_POUNCE.reach && mob.onGround && !mob.pouncePhase) {
          startFoxPounce(mob);
          mob.pounceTarget = target;
        } else {
          mob.velocity.x = dir.x * 2.6;
          mob.velocity.z = dir.z * 2.6;
        }
        // Bite when close enough.
        if (dist < 1.2 && mob.attackCooldown <= 0) {
          this.damageMob(target, foxDamageFor(this.game?.difficulty), mob.mesh.position, false, mob);
          mob.attackCooldown = 1.0;
        }
        moveGroundMob(this, mob, dt);
        mob.foxPhase = (mob.foxPhase || 0) + dt * 9;
        poseFoxLegs(mob, mob.foxPhase, true);
        return true;
      }

      // 4. Flee an untrusted player who is not sneaking.
      // Wiki: it flees players "unless the player is trusted or approaches them while sneaking".
      const sneaking = !!player?.keys?.ShiftLeft || !!player?.keys?.ShiftRight || !!player?.isSneaking;
      if (foxShouldFlee(mob, player, { sneaking })) {
        const away = mob.mesh.position.clone().sub(player.position);
        away.y = 0;
        if (away.lengthSq() > 1e-6) {
          away.normalize();
          mob.yaw = Math.atan2(away.x, away.z);
          mob.velocity.x = away.x * 3.0;
          mob.velocity.z = away.z * 3.0;
        }
        moveGroundMob(this, mob, dt);
        mob.foxPhase = (mob.foxPhase || 0) + dt * 10;
        poseFoxLegs(mob, mob.foxPhase, true);
        return true;
      }

      // 5. Idle wander.
      // `wanderMob` picks a goal and sets velocity; the fox still has to move itself, so the
      // hazards are handled by the shared escape pass and locomotion by moveGroundMob.
      wanderMob(this, mob, dt, 1.1);
      moveGroundMob(this, mob, dt);
      mob.foxPhase = (mob.foxPhase || 0) + dt * 6;
      poseFoxLegs(mob, mob.foxPhase, Math.hypot(mob.velocity.x, mob.velocity.z) > 0.1);
      return true;
    }
    if(mob.type==='bat'){
      // Wiki: flies around aimlessly, hangs under solid blocks, flees nearby players, and
      // despawns past 32 blocks.
      if (updateBatDespawn(this, mob, player)) return true;
      updateBatFlight(this, mob, dt, player);
      moveFlyingMob(this, mob, dt);
      mob.batPhase = (mob.batPhase || 0) + dt * (mob.isHanging ? 1.5 : 22);
      poseBatWings(mob, mob.batPhase);
      return true;
    }
    if(mob.type==='rabbit'){
      // Wiki: normal rabbits hop around aimlessly and flee players; the killer bunny hunts.
      if (isKillerBunny(mob)) {
        updateKillerBunnyHunt(this, mob, dt, player);
        moveGroundMob(this, mob, dt);
        mob.rabbitPhase = (mob.rabbitPhase || 0) + dt * 9;
        poseRabbitHop(mob, mob.rabbitPhase, !mob.onGround);
        return true;
      }
      // Passive: hop in a wander direction and take a new one periodically.
      mob.hopTimer = (mob.hopTimer || 0) - dt;
      mob.timer = (mob.timer || 0) - dt;
      if (mob.timer <= 0) {
        mob.timer = 2 + Math.random() * 4;
        mob.yaw = Math.random() * Math.PI * 2;
      }
      // Wiki: normal rabbits avoid players within 8 blocks.
      if (player?.position && mob.mesh.position.distanceTo(player.position) < RABBIT_PLAYER_AVOID_RANGE) {
        const away = mob.mesh.position.clone().sub(player.position);
        away.y = 0;
        if (away.lengthSq() > 1e-6) {
          away.normalize();
          mob.yaw = Math.atan2(away.x, away.z);
          mob.timer = 2;
        }
      }
      if (mob.hopTimer <= 0) {
        // Wiki: rabbits hop rather than walk. Each hop is a short burst of velocity.
        mob.hopTimer = 0.45 + Math.random() * 0.4;
        if (mob.onGround) {
          mob.velocity.x = Math.sin(mob.yaw) * 2.4;
          mob.velocity.z = Math.cos(mob.yaw) * 2.4;
          mob.velocity.y = 3.0;
          mob.onGround = false;
        }
      } else {
        // Between hops it settles, so the movement reads as a hop and not a glide.
        mob.velocity.x *= 0.9;
        mob.velocity.z *= 0.9;
      }
      moveGroundMob(this, mob, dt);
      mob.rabbitPhase = (mob.rabbitPhase || 0) + dt * 8;
      poseRabbitHop(mob, mob.rabbitPhase, !mob.onGround);
      return true;
    }
    if(mob.type==='endermite'){
      // Wiki: endermites chase players, fight endermen, and despawn after two minutes
      // unless named. The enderman/endermite pairing is refreshed elsewhere in the update.
      if (updateEndermiteLifetime(this, mob, dt)) return true;
      updateEndermiteHunt(this, mob, dt, player);
      moveGroundMob(this, mob, dt);
      mob.endermitePhase = (mob.endermitePhase || 0) + dt * (Math.hypot(mob.velocity.x, mob.velocity.z) > 0.05 ? 14 : 3);
      poseEndermiteLegs(mob, mob.endermitePhase);
      return true;
    }
    if(mob.type==='silverfish'){
      // Wiki: always hostile, pathfinds to the player, and sees through walls.
      updateSilverfishAnger(mob, dt);
      updateSilverfishHunt(this, mob, dt, player);
      // Mob types own their locomotion here, so the silverfish must move itself.
      moveGroundMob(this, mob, dt);
      mob.silverfishPhase = (mob.silverfishPhase || 0) + dt * (Math.hypot(mob.velocity.x, mob.velocity.z) > 0.05 ? 14 : 3);
      poseSilverfishLegs(mob, mob.silverfishPhase);
      return true;
    }
    if(mob.type==='spider'||mob.type==='cave_spider'){
      // Wiki: both spider variants are neutral above light level 11 and climb walls when
      // blocked; cave spiders additionally poison on Normal and Hard. The hunt is gated by
      // the same light rule, so a spider in bright light stops chasing.
      updateSpiderAnger(mob, dt);
      updateSpiderClimbing(this, mob, dt);
      updateSpiderHunt(this, mob, dt, player);
      // Mob types own their locomotion here, so the spider must move itself.
      moveSpider(this, mob, dt);
      // The walk cycle is driven here because returning `true` skips the shared animation
      // step at the end of the mob update loop.
      this.updateMobAnimation(mob, dt, mob.velocity.x, mob.velocity.z);
      return true;
    }
    if(mob.type==='wolf'&&updateWolfWitherHunt(this,mob,dt))return true;
    if(isZombifiedPiglin(mob)) {
      // This branch used to call moveGroundMob without anything having set a velocity, so the
      // zombified piglin stood at zero velocity forever: inert, error-free and invisible as a bug.
      // `updateZombified` owns its targeting, anger and equipment, and applies its steering through
      // the shared pathfinder, so it is what gives this mob something to move with. It also runs
      // the arm and head animation, which is why the walk cycle below is left alone.
      if(!mob.jockeyMount){
        updateZombified(this, mob, dt);
        const speed=moveGroundMob(this,mob,dt);
        mob.walkCycle=(mob.walkCycle||0)+speed*dt*7;
        const swing=Math.sin(mob.walkCycle)*Math.min(.8,speed*.4);
        mob.leftLeg.rotation.x=swing;mob.rightLeg.rotation.x=-swing;
      }
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
        if (other.health > 0 && (other.type === 'zombie' || other.type === 'zombie_villager' || other.type === 'husk')) {
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
        if (other.health > 0 && (other.type === 'pillager' || other.type === 'zombie' || other.type === 'husk' || other.type === 'wither_skeleton')) {
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
    } else if (mob.type === 'zombie' || mob.type === 'husk') {
      // Wiki: a husk that is fully submerged for 30 s begins converting to a zombie, which takes 15 s
      // more and cannot be stopped. The replacement has full health.
      if (mob.type === 'husk') {
        const submerged = this.world.getVoxel(
          Math.floor(mob.mesh.position.x),
          Math.floor(mob.mesh.position.y + mob.height * 0.5),
          Math.floor(mob.mesh.position.z)
        ) === BLOCKS.WATER;
        const before = mob.convertTimer;
        const phase = updateHuskDrowning(mob, dt, { submerged, manager: this });
        if (phase === 'converted') return true;
        if (before === undefined && mob.convertTimer !== undefined) mob.state = 'converting';
        }
      // Chase player or villagers. Wiki: a husk is a zombie variant, so it shares this AI; its own
      // differences (no sunlight burning, Hunger on an unarmed hit, avoiding water) are applied below.
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
      // The branch did not return, so control fell through to the passive-animal chain below: a husk --
      // and a plain zombie -- ran the cow/sheep follow code, and the method reported `false`, which let
      // the shared fallback locomotion run on top of the velocity just set here. Returning true claims
      // the mob, which is what every neighbouring branch does.
      moveGroundMob(this, mob, dt);
      return true;
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
    } else if (mob.type === 'skeleton' || mob.type === 'stray' || mob.type === 'bogged' || mob.type === 'parched') {
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
        // Wiki: a bogged and a parched both fire more slowly than a skeleton -- 4.5 s normally and 3.5 s
        // on Hard, against the skeleton's 2.5 s here. A stray is as fast as a skeleton.
        const slowArcher = mob.type === 'bogged' || mob.type === 'parched';
        mob.shootCooldown = slowArcher
          ? (mob.type === 'parched'
            ? (this.game?.difficulty === 'hard' ? PARCHED_ATTACK_COOLDOWN.hard : PARCHED_ATTACK_COOLDOWN.normal)
            : boggedAttackCooldown(this.game?.difficulty ?? 'normal'))
          : 2.5;
          const shootOrigin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
          const shootDir = player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(shootOrigin).normalize();
          this.spawnArrow(shootOrigin, shootDir, mob);
        // Wiki: a stray's arrow carries Slowness for 30 s and a bogged's Poison for 4 s. The effect is
        // applied here because it is the only reason the variant exists rather than being a recolour.
        const effect = variantAttackEffect(mob.type, { unarmed: true });
        if (effect && player?.applyStatusEffect) {
          player.applyStatusEffect(effect.effect, effect.seconds);
        }
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
      // Neutral until provoked, or an explicit arena challenger.
      //
      // This branch was the arena rule applied to the species: it teleported toward the player every four to
      // seven seconds and "aggressively pursue[d] player" from the moment it spawned. A wild enderman now
      // ignores the player entirely, which is what neutral means, and the arena keeps the old behaviour.
      const hostile = mob.arenaChallenger === true || isProvoked(mob);
      tickAnger(mob, dt);

      mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
      mob.particleTimer = (mob.particleTimer || 0) - dt;

      // Subtle ambient purple portal particles
      if (mob.particleTimer <= 0) {
        mob.particleTimer = 0.35;
        this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 2);
      }

      // Gaze provocation. Standing near one is not enough, and neither is looking at it through a pumpkin.
      if (!hostile && player && gazeProvokes({
        viewDir: this.game?.camera ? this.game.camera.getWorldDirection(new THREE.Vector3()) : null,
        playerPos: player.position,
        mobPos: mob.mesh.position,
        hasLineOfSight: mob.endermanHasLineOfSight !== false,
        wearingPumpkin: player.wearingPumpkin === true
          || player.inventory?.armor?.head?.id === 'carved_pumpkin',
        playerGameMode: player.gamemode,
      })) {
        provoke(mob, 'gaze');
        if (this.sounds?.playEndermanStare) this.sounds.playEndermanStare();
      }

      if (!hostile) {
        // Idle: wander a little, and do not think about the player at all.
        if (updateAmbientLocomotion) updateAmbientLocomotion(this, mob, dt, player, { wander: wanderMob });
        // No periodic teleport while neutral. The arena teleport was the reason an untouched enderman
        // appeared next to a new player's spawn.
      } else {
        // Periodic arena teleportation, now only for an enderman that is actually hostile.
        if (mob.teleportCooldown <= 0) {
          mob.teleportCooldown = 4.0 + Math.random() * 3.5;
          this.teleportEnderman(mob);
        }

        const dir = player.position.clone().sub(mob.mesh.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist > 1.2) {
          dir.normalize();
          const targetYaw = Math.atan2(dir.x, dir.z);
          const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
          mob.yaw += turn * Math.min(1.0, 9 * dt);
          if (!mob.avoidTime || mob.avoidTime <= 0) {
            mob.velocity.x = Math.sin(mob.yaw) * ENDERMAN_CHASE_SPEED;
            mob.velocity.z = Math.cos(mob.yaw) * ENDERMAN_CHASE_SPEED;
          }
        } else {
          mob.velocity.x *= 0.5;
          mob.velocity.z *= 0.5;
          const targetYaw = Math.atan2(dir.x, dir.z);
          mob.yaw = targetYaw;
        }

        // Melee attack
        if (dist < ENDERMAN_ATTACK_REACH && mob.attackCooldown <= 0) {
          player.takeDamage(ENDERMAN_ATTACK_DAMAGE, mob.mesh.position, mob.type);
          if (this.sounds?.playZombie) this.sounds.playZombie();
          mob.attackCooldown = ENDERMAN_ATTACK_COOLDOWN;
          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.x = -Math.PI / 2.2;
            mob.rightArm.rotation.x = -Math.PI / 2.2;
          }
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
      } else {
        // A flyer with no branch of its own reaches here with a zero velocity, exactly like a ground
        // mob with no branch reaches the fallback below, and for the same reason: nothing sets one.
        // The declared role gives it a heading and an approach altitude.
        const flySpec = locomotionFor(mob.type);
        if (flySpec?.flying) updateAmbientLocomotion(this, mob, dt, player, { wander: wanderMob });
      }
      moveFlyingMob(this, mob, dt);
    } else {
      if(isEquine(mob))updateHorseLead(this,mob);
      // A mob with no branch of its own used to arrive here with a zero velocity and simply stand
      // still forever. Hostile and passive roles that were never wired up are declared in
      // ambientLocomotion.js, which gives them a target or a wander goal before the mover runs.
      const ambientSpec = locomotionFor(mob.type);
      if (ambientSpec) {
        // `fire` is injected rather than imported so `ambientLocomotion.js` can decide WHEN a turret shoots
        // without knowing how a projectile is built. A stationary spec with `ranged` and no hook fired
        // nothing at all, which is what the shulker did.
        updateAmbientLocomotion(this, mob, dt, player,
          { wander: wanderMob, fire: (shooter, target, spec) => this.fireShulkerBullet(shooter, target, spec) });
        // A declared stationary mob still gets the leg pose, so it does not look frozen mid-stride.
        if (ambientSpec.speed <= 0) {
          mob.walkCycle = (mob.walkCycle || 0);
        }
      }
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

      // Wiki: a dry dolphin suffocates after two minutes, and rain refills its moistness.
      if (mob.type === 'dolphin') {
        const raining = this.game?.weather?.isRaining?.() ?? false;
        updateDolphinMoistness(this, mob, dt, raining);
      }

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
        if (m !== mob && !m.isCustomMob && (m.type === 'zombie' || m.type === 'husk' || m.type === 'skeleton' || m.type === 'stray' || m.type === 'bogged' || m.type === 'parched' || m.type === 'creeper' || m.type === 'enderman')) {
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

