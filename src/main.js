import { MonsterSpawners } from './monsterSpawner.js';
import { squidRayDistance } from './squidHitbox.js';
import { attackBonus, fireAspectSeconds } from './enchantmentEffects.js';
import { spendDurability } from './durability.js';
import { EXHAUSTION } from './hunger.js';
import { FOODS } from './foodData.js';
import { igniteActor } from './heat.js';
import { tieHorseLeads } from './horseLead.js';
import { updateHorseHud } from './horseInventory.js';
import { useSnowball } from './netherCombat.js';
import { useBarterPotion } from './barterItems.js';
import { launchFirework } from './fireworks.js';
import { applyGoldenApple, isGoldenApple } from './goldenApple.js';
import { isSplashPotion, throwSplashPotion } from './splashPotion.js';
import { POTION_DATA } from './brewing.js';
import { dragonEggDestination, makeEggPlacementCheck } from './dragonEgg.js';
import { createLifecycle, beginLoading, markReady, markFailed, allowsSimulationForPhase, clampDelta } from './worldLifecycle.js';
import { teardownWorld } from './worldTeardown.js';
import { createPackStore, allPacks, addPack, removePack, PACK_SOURCES } from './dataPackStore.js';
import { buildPresetPack } from './dataPackPresets.js';
import { PREFERRED_PACK_FORMAT } from './dataPack.js';
import { buildMobStatsReport } from './spawning/mobStatsReport.js';
import { biomeSpawnsFor } from './spawning/biomeSpawnResolver.js';
import { packBiomeSpawnSource } from './spawning/packBiomeSpawns.js';
import { isCreative, settingsWith } from './sessionSettings.js';
import { installBundledPack, BUNDLED_PACK_NAME } from './dataPackBundle.js';
import { applyStore, revertAll } from './dataPackApply.js';
import { revertDataPack } from './dataPackRuntime.js';
import { normaliseSettings, normaliseGameMode, DEFAULT_SETTINGS, DAY_LENGTH_SECONDS, startingTimeOfDay,
  allowsShowcasePopulation, allowsAgentTerminal } from './sessionSettings.js';
import { isFrame, insertEye, tryActivateAround, isEndPortal, portalDestination, portalArrival,
  isStandingInEndPortal, buildEndPlatform, buildEndPortalRoom, enderEyeThrowVelocity, bearingToPortal,
  bearingName, ENDER_EYE_LIFE } from './endPortal.js';
import { WaterSplashes } from './waterSplashes.js';
import * as THREE from 'three';
import { LightweightShader } from './lightweightShader.js';
import { BowController } from './bow.js';
import { FishingController } from './fishingRod.js';
import { buildRedstoneDemo } from './redstoneDemos.js';
import { buildRedstoneGame, listRedstoneGames } from './redstoneGames.js';
import { BLOCKS, BLOCK_DEFS, ITEMS, blockIdForPlacement } from './blocks.js';
import { drinkPotion, isDrinkablePotion } from './potionUse.js';
import { miningSpeedMultiplier } from './statusEffects.js';
import { breakTimeSeconds, harvestsNothing, harvestRequirementText } from './miningRules.js';
import { getBiomeDef } from './biomes.js';
import { TextureManager } from './textures.js';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './world.js';
import { locateNearestStructure, countStructures } from './worldStructures.js';
import { useOnArmorStand, armorStandPlacement } from './armorStand.js';
import { parseTeleport, structureArrival } from './teleport.js';
import { ChunkStreamer } from './chunkStreamer.js';
import { installHotkeys } from './hotkeys.js';
import { MobSpawnManager } from './spawning/mobSpawnManager.js';
import { ChunkMesher } from './mesher.js';
import { SoundEngine } from './audio.js';
import { Player } from './player.js';
import { MobManager } from './mobs.js';
import { EntityManager } from './entities.js';
import { RailSystem } from './rails.js';
import { Inventory } from './inventory.js';
import { UIManager } from './ui.js';
import { HeldItemRenderer } from './heldItem.js';
import { WeatherManager } from './weather.js';
import { WorldAgent } from './worldAgent.js';
import { encodeScreenshotDataUrl } from './agentProviders.js';
import { startZombieVillagerCure, tradeRefusal } from './villagerEconomy.js';
import {
  DEFAULT_BATCH_SIZE,
  ProgressOverlay,
  REQUIRED_UI_METHODS,
  findMissingMethods,
  loadChunksProgressively,
  yieldToBrowser
} from './progressOverlay.js';
import { placePlayerOnSurface } from './worldSpawn.js';
import { waterHeight } from './waterGeometry.js';
import { isBucket, traceBucket, useBucket } from './buckets.js';
import { catchFish, releaseFish } from './fishBuckets.js';
import { takeFromBundle } from './bundles.js';
import { brushSuspiciousBlock } from './archaeology.js';
import { isGlassBottle, useGlassBottle } from './bottles.js';
import { blockDrops } from './blockDrops.js';
import { BlockLighting, configureSunShadows, followSun, createEnvironmentLight, updateOutdoorLighting } from './lighting.js';
import { overworldFogRange } from './atmosphere.js';
import { snowDaylightStrength } from './snowShading.js';
import { Sky } from './sky.js';
import {
  saveMapToDefault,
  loadMapFromDefault,
  saveMapToCustomFile,
  loadMapFromCustomFile
} from './mapManager.js';
// Designed worlds are MODS. The core no longer imports any of them: the four managers that used to be
// imported here (tournament, dragonballSkills, trainingSites, dungeonMode) are attached by the mod that owns
// them, through `ModLoader`, when its world is opened.
import { ModLoader, resolveWorldMechanism } from './mods/loader.js';
import { WorldMechanismManager } from './worldMechanisms.js';
import { BuildingStudioManager } from './buildingStudio.js';
import { BuildingLibrary } from './buildingLibrary.js';
import { MobLibrary } from './mobLibrary.js';
import { FurnaceManager } from './furnace.js';
import { BedManager } from './bed.js';
import { PaintingManager, facingFromNormal } from './paintings.js';
import { ChestManager } from './chest.js';
import { angerPiglins } from './piglin.js';
import { DoorManager } from './door.js';
import { FarmingManager, isHoe, getSeedCrop, getCropInfo } from './farming.js';
import { BeaconManager } from './beaconManager.js';
import { HiveManager, isHive } from './hives.js';
import { EnchantingManager } from './enchanting.js';
import { buildCommandContext, runCommand, permissionRefusal } from './commandRunner.js';
import { NetherPortalManager } from './netherPortal.js';
import { RaidManager } from './raids.js';
import { DeepDarkWardenManager } from './deepDarkWarden.js';
import { BossFightManager } from './bossFights.js';
import { WorldSyncManager } from './multiplayer/worldSyncManager.js';
import { markWater, markOverWater } from './waterPass.js';
import { UNDERWATER_FOG_COLOR, underwaterVisibility, underwaterFogColor, underwaterMiningMultiplier } from './waterRules.js';


/**
 * The summon table: mob name -> [spawn method, block offset, display label].
 *
 * A table rather than the forty-branch chain this was, so the offset each mob uses is visible. Pillager
 * and Zombie spawn three blocks away where everything else spawns two -- an existing difference, now
 * stated rather than buried. `fish` and `host` are the aliases the old chain accepted.
 */
const SUMMONABLE_MOBS = {
  villager: ['spawnVillager', 2, 'Villager'],
  iron_golem: ['spawnIronGolem', 2, 'Iron Golem'],
  pillager: ['spawnPillager', 3, 'Pillager'],
  zombie: ['spawnZombie', 3, 'Zombie'],
  pig: ['spawnPig', 2, 'Pig'],
  chicken: ['spawnChicken', 2, 'Chicken'],
  cow: ['spawnCow', 2, 'Cow'],
  sheep: ['spawnSheep', 2, 'Sheep'],
  salmon: ['spawnSalmon', 2, 'Salmon'],
  fish: ['spawnSalmon', 2, 'Salmon'],
  cod: ['spawnCod', 2, 'Cod'],
  guardian: ['spawnGuardian', 2, 'Guardian'],
  elder_guardian: ['spawnElderGuardian', 2, 'Elder Guardian'],
  drowned: ['spawnDrowned', 2, 'Drowned'],
  glow_squid: ['spawnGlowSquid', 2, 'Glow Squid'],
  dolphin: ['spawnDolphin', 2, 'Dolphin'],
  squid: ['spawnSquid', 2, 'Squid'],
  octopus: ['spawnSquid', 2, 'Squid'],
  axolotl: ['spawnAxolotl', 2, 'Axolotl'],
  polar_bear: ['spawnPolarBear', 2, 'Polar Bear'],
  enderman: ['spawnEnderman', 2, 'Enderman Challenger Boss'],
};

class Game {
  constructor() {
    this.container = document.getElementById('canvas-container');
    this.underwaterOverlay = document.getElementById('underwater-overlay');

    // Three.js Core
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x78a7ff); // sky blue
    this.scene.fog = new THREE.Fog(0x78a7ff, 45, 95);

    // Underwater state
    this.isUnderwater = false;
    this.normalFogNear = 45;
    this.normalFogFar = 95;
    this.normalBgColor = new THREE.Color(0x78a7ff);
    // Underwater fog: the wiki's Java colour (#050533), dense on entering and clearing over 30 seconds
    // (src/waterRules.js). `underwaterSeconds` counts how long the eye has been under.
    this.underwaterFogColor = new THREE.Color(UNDERWATER_FOG_COLOR);
    this.underwaterFogNear = 0.1;
    this.underwaterFogFar = 24;
    this.underwaterSeconds = 0;
    this.underwaterSurfaceY = null;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    // A stencil buffer, because the water pass marks where the surface is drawn so that leaves, glass and rain in
    // front of it can be redrawn over it without tinting anything twice (src/waterPass.js).
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting & Celestial
    this.ambientLight = createEnvironmentLight();
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffaed, 0.85);
    this.sunLight.position.set(50, 80, 40);
    this.scene.add(this.sunLight);
    configureSunShadows(this.sunLight, this.scene);
    this.blockLighting = new BlockLighting(this.scene);
    this.sky = new Sky(this.scene);
    this.moonLight = new THREE.DirectionalLight(0x9db9ee, 0);
    this.scene.add(this.moonLight);

    // Day/Night Cycle State
    //
    // Dawn, not midday: Java starts a new world at time 0. Starting at 6000 put the player in at noon with
    // the sun already past its peak, which is a small thing on its own and a real one combined with the
    // showcase mobs -- the first thing a new player saw was a bright afternoon with a pillager patrol in it.
    this.worldTime = startingTimeOfDay(DEFAULT_SETTINGS); // 0 = dawn, 6000 = noon, 18000 = midnight
    // A full Java day is 24,000 ticks at 20 ticks/second: 1,200 seconds, not 600. The old figure ran the
    // clock at double speed, so a "day" was ten minutes and the first night arrived in five.
    this.dayLengthSeconds = DAY_LENGTH_SECONDS;

    /**
     * World difficulty.
     *
     * `mobs.js` and a dozen behaviour modules have read `game.difficulty` for a long time, defaulting
     * to 'normal' when it was absent -- so the property was never actually set anywhere and the
     * default was doing all the work. Setting it here makes it a real, changeable value, which the
     * spawning subsystem needs: hostile natural spawning is switched off entirely on PEACEFUL, and
     * the existing mob code was already branching on it.
     */
    this.difficulty = 'normal';

    // What the player asked for, before any terrain exists.
    //
    // Nothing recorded the mode, the difficulty or whether the scripted content should run, so `Player`
    // defaulted to Creative and `spawnVillageMobs` populated every world. The setup screen now fills this in
    // before generation; `normaliseSettings` turns a partial or missing object into an ordinary Survival
    // world rather than a Creative one.
    this.settings = normaliseSettings({ difficulty: this.difficulty });

    // Subsystems
    this.sounds = new SoundEngine();
    this.textures = new TextureManager();
    // The renderer, so an animated tile can be copied into the atlas on the GPU instead of re-uploading it all.
    this.textures.renderer = this.renderer;
    this.world = new World();
    this.world.game = this;
    this.weather = new WeatherManager(this.scene, this.sounds);
    this.weather.game=this;
    this.geminiAgent = new WorldAgent(this);
    this.mesher = null;
    this.player = null;
    this.mobs = null;
    this.entities = null;
    this.inventory = null;
    this.ui = null;
    this.heldItemRenderer = null;
    this.buildingStudio = null;
    this.portalManager = null;
    this.currentDimension = 'overworld';

    // Raycast & Mining state
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 5.2; // 5 block reach
    this.targetBlock = null; // { x, y, z, face, blockId }
    this.targetMob = null;
    this.targetBoxMesh = null;
    this.breakOverlayMesh = null;

    this.isMouseDown = false;
    this.miningTime = 0;
    this.digSoundTimer = 0;

    this.clock = new THREE.Clock();
    this.fpsHistory = [];
    /**
     * View distance in chunks.
     *
     * Raised from 4 to 8 on the strength of measurement rather than optimism. Streaming used to
     * generate the whole area synchronously on crossing a chunk border and never unload anything, and
     * meshing cost 44ms a chunk, so 4 was as far as it was safe to go. With the padded-border and
     * allocation-free mesher (44 -> 14ms/chunk), budgeted streaming with working unload, and a chunk
     * lookup that no longer builds a string per call, walking continuously now measures:
     *
     *   radius  4   143 chunks resident    3.3ms/frame average    p99 16.0ms    worst 25.7ms
     *   radius  8   399 chunks resident    9.2ms/frame average    p99 26.5ms    worst 37.7ms
     *   radius 12   689 chunks resident   14.6ms/frame average    p99 32.4ms    worst 47.5ms
     *
     * 8 is the largest radius whose AVERAGE stays inside a 60fps frame. It does not bound the tail:
     * p99 is still above one frame, because generation and meshing are atomic per chunk. See
     * docs/voxel-engine-plan.md -- time-slicing the mesh loop is the outstanding work, and the next
     * step up in distance should follow it rather than precede it.
     */
    this.renderDistance = 8;
    // Streaming owns generate / mesh / unload from here on. Created before any world exists, and
    // given the world when one is made, so it can be constructed once. The extra generate ring
    // keeps a chunk's border real while it is meshed; the wider unload radius stops a walk back
    // and forth across a chunk border from thrashing.
    this.streamer = new ChunkStreamer(this, {
      meshRadius: this.renderDistance,
      unloadRadius: this.renderDistance + 3,
    });

    // Created here rather than in start() so the start-overlay handlers can
    // always use it, even if start() is still awaiting textures.
    this.overlay = typeof document !== 'undefined' ? new ProgressOverlay(document) : null;
    this._worldStartInFlight = false;
    // Resolved once the UIManager exists. The start-overlay buttons are bound before the atlas loads,
    // and the handlers that need the UI await this rather than letting the click fall on the floor.
    this._uiReady = new Promise((resolve) => { this._resolveUiReady = resolve; });
    // Set once the initial chunks exist and it is safe to enter the world. Kept because several callers and
    // tests read it; `lifecycle` is the authority the animation loop gates on.
    this.worldReady = false;
    // `idle` -> `loading` -> `ready` (or `failed`). Only `ready` runs the simulation.
    this.lifecycle = createLifecycle();
    // The loaded data packs, and what the last apply did so it can be undone. Empty until something
    // adds one: the bundled vanilla pack is offered in the Agent Terminal rather than forced on.
    this.dataPacks = createPackStore();
    this.dataPackApplication = null;
  }

  /**
   * Install the bundled vanilla pack as the default content source.
   *
   * The bundle is about a megabyte, so this is kicked off rather than awaited: the game can decode its atlas
   * while the pack downloads. `applyDataPacks` awaits the same promise, so nothing reads the registries
   * before the default has landed.
   *
   * A missing bundle is NOT an error. It means the player gets the game's own built-in content, which is
   * exactly what happened before any of this existed -- and in Node, where `/datapacks/...` is not a URL
   * anything can fetch, that is always what happens, which is why every existing test is unaffected.
   */
  installDefaultDataPack() {
    if (!this.dataPacks) return Promise.resolve({ ok: false, reason: 'no pack store' });
    return installBundledPack(this.dataPacks, { name: BUNDLED_PACK_NAME })
      .catch(() => ({ ok: false, reason: 'the bundled pack could not be read' }));
  }

  async start() {
    console.log('Initializing Minecraft Web Edition...');

    // The default pack starts downloading now and is awaited before anything reads a biome or a recipe.
    this.dataPackReady = this.installDefaultDataPack();

    // Bind the start screen before anything slow: bindEvents() runs at the end of start(), after the
    // whole atlas has decoded, so until then every click landed on a button with no listener.
    this.bindStartScreen();

    // 1. Initialize Texture Atlas & Materials
    await this.textures.init();
    this.waterSplashes = new WaterSplashes(this.scene, this.world);
    this.shader = new LightweightShader(this);
    this.shader.bindButton(document.getElementById('btn-shader'));
    this.mesher = new ChunkMesher(this.textures);
    this.mesher.game = this;
    this.world.game = this;

    // 2. Initialize Player & Controls
    this.player = new Player(this.camera, this.renderer.domElement, this.world, this.sounds, this.settings);
    this.player.game = this;
    this.scene.add(this.player.model);
    this.player.model.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });

    // 3. Initialize Mobs & Entities
    this.entities = new EntityManager(this.scene, this.world, this.sounds, this.textures);
    this.mobs = new MobManager(this.scene, this.world, this.sounds, this.entities);
    this.mobs.game = this;

    // 3b. Natural mob spawning.
    //
    // Owns the continuous per-tick spawn cycle, the mob caps, biome spawn tables, the light-driven
    // hostile rules and natural despawning. It replaces nothing here: before it existed the only
    // ways to create a mob were a spawn egg, /summon, and four ad-hoc per-tick functions in
    // mobs.js -- which is why a world contained mobs near the start point and nowhere else.
    //
    // Constructed in start() rather than the constructor because it needs `this.mobs`, which does
    // not exist until textures have loaded. See src/spawning/mobSpawnManager.js.
    this.spawnManager = new MobSpawnManager({ game: this });
    // Structures may override the biome spawn table where they stand. The engine has a structure
    // index (see structureManager), so the override is wired when one is present rather than
    // assumed; with no index, `structureAt` stays null and no override applies.
    this.structureIdAt = (x, y, z) => this.world?.structures?.structureIdAt?.(x, y, z) ?? null;
    this.spawnManager.structureAt = (x, y, z) => this.structureIdAt?.(x, y, z) ?? null;

    // Thorns reflects damage on to whoever struck the player. Wired here rather than inside the player,
    // because damaging a mob is the mob manager's job -- the same reason onKiInterrupted exists as a hook.
    //
    // The attacker is identified from the source position when the caller did not name one, which is the
    // usual case: mobs.js passes `mob.mesh.position` rather than the mob. Looking it up here keeps the
    // change out of a file another agent is working in, and it covers every damage source with a position
    // rather than only the four call sites that happen to have the mob to hand.
    this.player.onThornsReflect = (attacker, damage, procs, sourcePos) => {
      if (!this.mobs) return;
      let target = attacker;
      if (!target && sourcePos) {
        // A mob's mesh position is its feet, and a hit lands from nearby, so the search radius is
        // generous enough to cover a mob's own width without reaching a second one.
        let best = null;
        let bestDist = 1.5;
        for (const mob of this.mobs.mobs || []) {
          if (!mob || mob.health <= 0 || !mob.mesh) continue;
          const d = mob.mesh.position.distanceTo(sourcePos);
          if (d < bestDist) { best = mob; bestDist = d; }
        }
        target = best;
      }
      if (!target) return;
      this.mobs.damageMob(target, damage, this.player.position, false, this.player);
      void procs;
    };

    // 4. Initialize Inventory & UI
    this.inventory = new Inventory(this.sounds);
    this.player.inventory = this.inventory;
    this.ui = new UIManager(this.inventory, this.player, this.world, this.mobs, this.sounds, this);
    this.ui.game = this;
    // A start-screen click that arrived while the atlas was loading is now free to act.
    this._resolveUiReady?.();
    this.entities.ui = this.ui;
    this.ui.onCommand = (cmd) => this.handleCommand(cmd);
    this.ui.initGemini(this.geminiAgent);
    // Let every agent request carry a live screenshot of the player's view.
    this.geminiAgent.viewCaptureProvider = () => this.captureCurrentView();
    this.entities.onItemPickup = () => this.ui.updateHotbar();
    this.world.water.onDisplace = (x,y,z,id) => {
      this.spawnBlockDrops(new THREE.Vector3(x+.5,y+.5,z+.5), id);
    };

    // 5. Initialize Held Item 3D Renderer
    this.heldItemRenderer = new HeldItemRenderer(this.camera, this.textures);
    this.bow = new BowController(this);
    // The fishing rod: another use-item feature with a state machine, so it sits with the bow.
    this.fishing = new FishingController(this);
    // Rails, minecarts and boats: real physics for carts and floating props.
    this.railSystem = new RailSystem(this.world, this);
    this.riding = null;

    // 5b. Designed worlds.
    //
    // These four used to be constructed here, from four imports of one designed world. They are now attached
    // by that world's MOD, through its entrypoint, when the world is opened -- so this file no longer imports
    // any of them and the game runs with the mod's directory deleted.
    //
    // `this.modLoader` discovers the mods and owns that lifetime. `this.mechanisms` is the registry they
    // register into; the core supplies only `default`.
    //
    // The loader is built here and the mechanism manager a few lines below; they are joined immediately after
    // that construction, so there is one mechanism registry rather than two.
    this.modLoader = new ModLoader({ log: (line) => console.log(line) });
    this.buildingStudio = new BuildingStudioManager(this);
    this.furnaceManager = new FurnaceManager(this);
    this.bedManager = new BedManager(this);
    // Wall paintings: placed from the painting item or by the Agent Terminal, saved with the world.
    this.paintings = new PaintingManager(this);
    this.chestManager = new ChestManager(this);
    this.world.chestManager = this.chestManager;
    this.doorManager = new DoorManager(this);
    this.world.doorManager = this.doorManager;
    this.farmingManager = new FarmingManager(this);
    // Beacons and conduits: what remembers where they are and applies what they grant. Registered on
    // placement and unregistered on break, like a crop, rather than scanned for.
    this.beaconManager = new BeaconManager(this);
    // Bee nests and beehives: the only source of honeycomb, and so of every waxed copper block.
    this.hiveManager = new HiveManager(this);
    this.enchantingManager = new EnchantingManager(this);
    this.portalManager = new NetherPortalManager(this);
    this.raidManager = new RaidManager(this.mobs, this.world, this.sounds, this.ui, this.entities);
    this.raidManager.game = this;
    this.deepDarkManager = new DeepDarkWardenManager(this.mobs, this.world, this.sounds, this.ui);
    this.deepDarkManager.game = this;
    this.bossManager = new BossFightManager(this.mobs, this.world, this.sounds, this.ui, this.entities);
    this.bossManager.game = this;
    this.currentDimension = 'overworld';

    // 5c. Initialize World Mechanism System (Generated worlds default to pure vanilla)
    this.worldType = 'generated';
    this.mechanisms = new WorldMechanismManager(this);
    // The loader and the mechanism manager share ONE registry. A mod's `registerMechanism` lands in the same
    // map the core reads from, so `setMechanism('dragonball_tournament')` works without the core knowing the
    // name -- it only ever passes through whatever id the world's map asked for.
    this.modLoader.mechanisms = this.mechanisms.mechanisms;

    // 5d. Initialize Multiplayer World Synchronization & Hosting
    this.worldSync = new WorldSyncManager(this);

    // 6. Build Target Highlighting Box & Break Crack Mesh
    this.buildTargetHighlightMeshes();

    // 7. Initial World State: World is NOT generated until user clicks Generate New World or loads a world
    this.worldGenerated = false;

    // 8. Bind Mouse Interaction & Click-to-play
    this.bindEvents();

    // 8b. A shared-world link (?join=<code>) joins that world as soon as the page is ready: one click for the guest.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('join')) {
      this.worldSync.joinFromLink(window.location.search);
    }

    // 9. Start Animation Loop
    this.animate();

    console.log('Minecraft Web Edition Loaded Successfully!');
  }

  async generateNewWorld() {
    // The lifecycle replaces the old `worldGenerated` boolean, which was set on the FIRST line of this method
    // and then gated the whole simulation -- physics, hazards, mob AI, spawning and the clock -- for the
    // entire several seconds of terrain loading. `beginLoading` refuses a second call while one is in flight
    // or once the world is ready, so a double-clicked "Create World" cannot run this twice.
    if (!beginLoading(this.lifecycle)) return;
    // Apply the data packs BEFORE any terrain is built. Biomes and recipes are read while the world loads, so
    // applying afterwards would generate terrain from one content set and then claim another was in effect.
    await this.applyDataPacks();
    // The packs are in force only now, and the structure engine captures them when it is built, so build it
    // again. The setup screen reseeds before this point, which is too early to see the chosen preset.
    this.world.rebuildStructures?.();
    this.worldGenerated = true;
    this.worldType = 'generated';
    this.world.isFlatWorld = false;
    this.world.generationMode = 'procedural';
    this.buildingStudio?.exitStudio();
    this.paintings?.clear();
    // Catch a missing UI method up front: previously such a call threw late in
    // this method and silently aborted the start flow.
    const missingUi = findMissingMethods(this.ui, REQUIRED_UI_METHODS);
    if (missingUi.length) {
      console.warn(`[World] UIManager is missing: ${missingUi.join(', ')}. Skipping those updates.`);
    }
    this.modLoader?.closeWorld();
    if (this.mechanisms) this.mechanisms.setMechanism('default', this);

    // Apply atmospheric sky & fog colors matching the biome
    const def = getBiomeDef(this.world.selectedBiome);
    if (def && def.skyColor !== undefined) {
      this.normalBgColor = new THREE.Color(def.skyColor);
      this.scene.background.copy(this.normalBgColor);
    } else {
      this.normalBgColor = new THREE.Color(0x78a7ff);
      this.scene.background.copy(this.normalBgColor);
    }
    if (def && def.fogColor !== undefined) {
      this.scene.fog.color = new THREE.Color(def.fogColor);
      if (def.isNether || def.isCavern) {
        this.normalFogNear = 20;
        this.normalFogFar = 65;
      } else {
        this.normalFogNear = 45;
        this.normalFogFar = 95;
      }
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
    }

    if (def && (def.isNether || this.world.isNether || def.dimension === 'nether')) {
      this.currentDimension = 'nether';
      this.world.dimension = 'nether';
      this.world.isNether = true;
      if (this.sky) {
        this.sky.disabled = true;
        if (this.sky.mesh) this.sky.mesh.visible = false;
      }
      this.normalBgColor = new THREE.Color(def.skyColor !== undefined ? def.skyColor : 0x330808);
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color = new THREE.Color(def.fogColor !== undefined ? def.fogColor : 0x471010);
      this.normalFogNear = 15;
      this.normalFogFar = 55;
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
      if (this.dirLight) this.dirLight.intensity = 0.2;
      if (this.ambientLight) {
        this.ambientLight.color.setHex(def.fogColor || 0x330808);
        this.ambientLight.groundColor.copy(this.ambientLight.color);
        this.ambientLight.intensity = 0.7;
      }
      if (this.sunLight) this.sunLight.intensity = 0;
      if (this.moonLight) this.moonLight.intensity = 0;
    } else if (this.sky) {
      this.sky.disabled = false;
      if (this.sky.mesh) this.sky.mesh.visible = true;
    }

    // The spawn point is chosen BEFORE the chunks are built. Building them first meant the spawn's own chunks were
    // generated afterwards, by `placePlayerOnSurface`, and never meshed: the player started in a half-empty world
    // that filled in over the first seconds. The overlay goes up first, because finding the surface generates terrain.
    if (this.overlay) {
      this.overlay.show('Generating World');
      await yieldToBrowser();
    }
    const spawn = placePlayerOnSurface(this);
    await this.loadWorldProgressively();

    if (spawn?.found) {
      console.log(`[World] Spawned the player on the surface at (${spawn.x}, ${spawn.y}, ${spawn.z}); ${spawn.reason}.`);
    } else {
      console.warn(`[World] Could not place the player on the surface: ${spawn?.reason || 'unknown'}.`);
    }

    this.spawnVillageMobs();
    // The End portal chamber. Its frames are the first link of the route to the End, and without a room
    // there is nowhere to put an Eye of Ender at all.
    this.placeEndPortalRoom(spawn);
    if (this.ui) {
      if (typeof this.ui.updateHotbar === 'function') this.ui.updateHotbar();
      if (typeof this.ui.updateStats === 'function') this.ui.updateStats();
    }
    // Only now is it safe to leave the start screen. Pointer lock is requested on
    // the player's next canvas click, because user activation does not survive the
    // awaits above and a pointer-lock request here would be rejected.
    //
    // `markReady` is what actually starts the simulation. Until this line the phase has been `loading`, and
    // `animate()` has been rendering only: no physics, no hazards, no mob AI, no spawning and no clock.
    // The camera follows the player only inside the player's own update, which has not run yet. Until it does the
    // view is taken from wherever the camera last was -- the origin, inside the ground, for a new world -- which is
    // the odd half-empty first frames. Place the camera at the spawn now, so the first frame is the player's view.
    this.player.updateCameraAndModel?.(0);
    this.camera.updateMatrixWorld?.();
    markReady(this.lifecycle);
    this.worldReady = true;
  }

  async startBuildingStudio() {
    if (this._worldStartInFlight) return;
    this._worldStartInFlight = true;
    this.sounds.init();
    const btnStudio = document.getElementById('btn-start-building-studio');
    if (btnStudio) btnStudio.disabled = true;

    try {
      // Building Studio is not a world: no terrain is generated and nothing spawns. There is only an invisible
      // ground marked by a grid (buildingStudio.js), and everything is built on or above it. Anything left over
      // from a previous world is released first.
      teardownWorld(this);
      if (!beginLoading(this.lifecycle)) throw new Error('a world is already loading');
      this.worldGenerated = true;
      this.worldType = 'building_studio';
      this.world.isFlatWorld = false;
      // 'authored' is the mode in which a missing chunk is empty air rather than generated terrain, chunks keep
      // their blocks when streamed out, and natural spawning is off.
      this.world.generationMode = 'authored';
      this.paintings?.clear();

      this.modLoader?.closeWorld();
      if (this.mechanisms) this.mechanisms.setMechanism('default', this);

      // Creative, so the player can fly; the ground (set by enterStudio below) is what they stand on.
      // Creative, with cheats on, through the same settings path a Creative world uses.
      this.applyWorldSettings({ gameMode: 'creative', cheats: true });
      this.player.position.set(0.5, 5, 0.5);
      this.loadChunksAroundPlayer?.();
      markReady(this.lifecycle);

      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay) startOverlay.style.display = 'none';

      if (this.ui) {
        if (typeof this.ui.updateHotbar === 'function') this.ui.updateHotbar();
        if (typeof this.ui.updateStats === 'function') this.ui.updateStats();
      }

      this.worldReady = true;
      this.buildingStudio?.enterStudio();
    } catch (err) {
      console.error('[Building Studio] Failed to enter Building Studio:', err);
      this.failWorldStart(err);
    } finally {
      if (btnStudio) btnStudio.disabled = false;
      this._worldStartInFlight = false;
      if (this.worldReady) this.overlay?.hide();
    }
  }

  /**
   * Roll back a failed world start so the player is never stranded on a full
   * progress bar: hide the overlay, restore the start screen and say what broke.
   */
  failWorldStart(err) {
    const message = err && err.message ? err.message : String(err);
    this.worldReady = false;
    // A failure is its own phase rather than a return to `idle`, so it is visible and a retry is deliberate.
    markFailed(this.lifecycle, err);
    if (this.overlay) this.overlay.hide();
    else if (typeof document !== 'undefined') document.getElementById('world-progress-overlay')?.classList.add('hidden');

    if (typeof document !== 'undefined') {
      const startOverlay = document.getElementById('start-overlay');
      if (startOverlay) startOverlay.style.display = 'flex';
    }

    if (this.ui?.addChatMessage) {
      this.ui.addChatMessage(`Could not start the world: ${message}`, 'error');
    }
    return message;
  }

  /**
   * Build the initial chunks with a visible progress bar.
   *
   * This is the fix for the frozen start screen: the synchronous version of this
   * work could not repaint, because the whole job ran in one task. The overlay is
   * shown first, revealed to the browser with one yield, and the chunk work is
   * then done in batches with a yield between each so the bar actually moves.
   */
  async loadWorldProgressively(options = {}) {
    if (!this.overlay) {
      // No overlay available: fall back to the original synchronous behaviour.
      this.loadChunksAroundPlayer();
      return { chunks: this.world.chunks.size };
    }

    this.overlay.show(options.title || 'Generating World');
    // Let the browser paint the overlay before any heavy synchronous work.
    await yieldToBrowser();

    return loadChunksProgressively(this, {
      overlay: this.overlay,
      batchSize: options.batchSize || DEFAULT_BATCH_SIZE,
      label: options.label || 'Generating terrain',
      chunkSizeX: CHUNK_SIZE_X,
      chunkSizeZ: CHUNK_SIZE_Z
    });
  }

  /**
   * Wrap a synchronous map load so the user sees progress.
   *
   * deserializeWorld must stay synchronous (its callers and tests depend on it),
   * so the overlay is shown and painted first, then updated between the phases
   * that function reports through its progress callback.
   */
  async loadMapWithProgress(work, options = {}) {
    if (this.lifecycle) {
      this.lifecycle.phase = 'loading';
      this.lifecycle.startedAt = Date.now();
      this.lifecycle.finishedAt = 0;
      this.lifecycle.error = null;
    }
    if (!this.overlay) {
      const res = await work();
      if (this.ui?.closeAllModals) this.ui.closeAllModals();
      if (this.ui?.startOverlay) this.ui.startOverlay.style.display = 'none';
      if (this.player) {
        this.player.controlsDisabled = Boolean(this.modRuntime?.exclusiveSimulation);
        this.player.isSleeping = false;
        this.player.keys = {};
      }
      if (typeof document !== 'undefined' && document.activeElement?.blur) {
        document.activeElement.blur();
      }
      if (this.ui?.requestGamePointerLock) {
        this.ui.requestGamePointerLock();
      }
      return res;
    }

    this.overlay.show(options.title || 'Loading Map');
    // One yield so the overlay is on screen before the blocking work starts.
    await yieldToBrowser();

    const onProgress = (percent, stage) => this.overlay.set(percent, stage);
    const result = await work(onProgress);

    this.overlay.set(100, 'Map loaded');
    await yieldToBrowser();
    this.overlay.hide();

    this.worldReady = true;
    this.worldGenerated = true;
    if (this.lifecycle) {
      this.lifecycle.phase = 'ready';
      this.lifecycle.finishedAt = Date.now();
      this.lifecycle.error = null;
    }

    if (this.ui?.closeAllModals) this.ui.closeAllModals();
    if (this.ui?.startOverlay) this.ui.startOverlay.style.display = 'none';
    if (this.player) {
      this.player.controlsDisabled = Boolean(this.modRuntime?.exclusiveSimulation);
      this.player.isSleeping = false;
      this.player.keys = {};
    }
    if (typeof document !== 'undefined' && document.activeElement?.blur) {
      document.activeElement.blur();
    }
    if (this.ui?.requestGamePointerLock) {
      this.ui.requestGamePointerLock();
    }

    return result;
  }

  buildTargetHighlightMeshes() {
    // 1.002x wireframe box around targeted block
    const wireGeo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
    this.targetBoxMesh = new THREE.LineSegments(new THREE.EdgesGeometry(wireGeo), new THREE.LineBasicMaterial({ color: 0x202020 }));
    wireGeo.dispose();
    this.targetBoxMesh.visible = false;
    this.scene.add(this.targetBoxMesh);

    // Destroy stage cracking mesh
    const crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.breakOverlayMesh = new THREE.Mesh(crackGeo, this.textures.destroyMaterials[0] || wireMat);
    this.breakOverlayMesh.visible = false;
    this.scene.add(this.breakOverlayMesh);
  }

  loadChunksAroundPlayer() {
    // Streaming now owns this. Kept as the entry point that the nether portal, the bed, the
    // building studio and the world-start path all call, but it no longer generates and meshes
    // the whole view area in one synchronous loop -- that was the source of the multi-second
    // freeze when the view distance grew.
    if (!this.streamer || !this.world) return;
    this.streamer.loadAllSynchronously(this.player.position.x, this.player.position.z);
  }

  /**
   * Throw an Eye of Ender.
   *
   * Before this the item had exactly one use, and without a locator the chamber is a hole in the ground the
   * player has no way to find. The eye arcs toward the portal and the player reads the bearing from it, which
   * is what it is for in vanilla.
   */
  throwEnderEye() {
    if (!this.world || !this.player) return null;
    const target = this.endPortalRoom ?? { x: 0, z: 0 };
    const from = { x: this.player.position.x, z: this.player.position.z };
    const v = enderEyeThrowVelocity(from, target);

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x86efac }),
    );
    mesh.position.copy(this.player.position).add(new THREE.Vector3(0, this.player.eyeHeight ?? 1.62, 0));
    this.scene?.add(mesh);
    if (!this.enderEyes) this.enderEyes = [];
    this.enderEyes.push({ mesh, velocity: new THREE.Vector3(v.x, v.y, v.z), life: ENDER_EYE_LIFE });

    const bearing = bearingToPortal(from, target);
    this.ui?.addChatMessage?.(
      bearing === null
        ? 'The Eye of Ender rises.'
        : `The Eye of Ender drifts ${bearingName(bearing)} (${Math.round(bearing)}\u00b0).`,
      'system');
    this.sounds?.playLevelUp?.();
    if (this.player.gamemode !== 'creative') {
      this.inventory.consumeActiveItem(1);
      this.ui?.updateHotbar?.();
    }
    return { bearing, target };
  }

  /** Advance the thrown eyes: they arc, and they fade rather than piling up. */
  updateEnderEyes(dt) {
    if (!this.enderEyes?.length) return;
    const remaining = [];
    for (const eye of this.enderEyes) {
      eye.life -= dt;
      if (eye.life <= 0) {
        this.scene?.remove(eye.mesh);
        eye.mesh.geometry?.dispose();
        eye.mesh.material?.dispose();
        continue;
      }
      eye.velocity.y -= 14 * dt;
      eye.mesh.position.addScaledVector(eye.velocity, dt);
      remaining.push(eye);
    }
    this.enderEyes = remaining;
  }

  /**
   * Carry the player through an End portal, in either direction.
   *
   * A delay rather than an instant hop, matching the Nether portal, so stepping into the frame is a
   * deliberate act and not something a stray pixel triggers.
   */
  updateEndPortalTravel(dt) {
    this.endPortalTravelCooldown = Math.max(0, (this.endPortalTravelCooldown || 0) - dt);
    if (this.endPortalTravelCooldown > 0) return;
    if (!this.world || !this.player || this.player.isDead) return;
    if (!isStandingInEndPortal(this.world, this.player)) return;

    const from = this.currentDimension || 'overworld';
    const dest = portalDestination(from);
    if (!dest) return;

    this.endPortalTravelCooldown = 3.0;
    // Remember where the player came from, so the return trip is not a one-way door. Vanilla sends you to
    // the world spawn; coming back to where you left is kinder and needs no spawn bookkeeping.
    if (dest === 'the_end') {
      this.endReturnPosition = this.player.position.clone();
    }
    const arrival = dest === 'the_end'
      ? portalArrival('the_end')
      : (this.endReturnPosition ? { x: this.endReturnPosition.x, y: this.endReturnPosition.y, z: this.endReturnPosition.z } : portalArrival('overworld'));

    // The arena has crystals, pillars and a dragon but NO ground, and the End's chunks are generated from
    // whichever biome was selected, so the player would arrive in whatever that happened to be. Vanilla drops
    // you on a central island; this is that island.
    if (dest === 'the_end') {
      buildEndPlatform(this.world, Math.floor(arrival.x), Math.floor(arrival.y) - 1, Math.floor(arrival.z), 12);
      for (const chunk of this.world.chunks.values()) {
        this.rebuildChunkMesh?.(chunk);
      }
    }

    if (this.switchDimension) this.switchDimension(dest, arrival);
    this.sounds?.playLevelUp?.();
    this.ui?.addChatMessage?.(
      dest === 'the_end' ? 'You step through the End portal.' : 'You return from the End.', 'system');
  }

  /**
   * Apply every enabled data pack to the running world.
   *
   * The whole point of the loader: this is the one place a pack reaches the game. It reverts whatever was
   * applied before and applies the store afresh, because a toggle can turn a pack off and a partial re-apply
   * would leave the disabled pack's content in place with nothing to blame.
   *
   * Called when the panel asks, and after a save is loaded. NOT called during world generation: biome and
   * recipe registries are read while loading, so applying mid-generation would give a world built from a
   * mixture of two content sets.
   */
  async applyDataPacks() {
    if (!this.dataPacks) return null;
    // Wait for the bundled default to land. Without this the first apply would race the download and the
    // world would be built from the built-in content while the store said the vanilla pack was enabled.
    if (this.dataPackReady) {
      try { await this.dataPackReady; } catch { /* a missing bundle is not fatal */ }
      this.dataPackReady = null;
    }
    this.revertDataPacks();
    const result = applyStore(this.dataPacks);
    this.dataPackApplication = result;
    for (const failure of result.failed) {
      console.warn(`[DataPacks] ${failure.name}: ${failure.reason}`);
    }
    for (const line of result.summary) console.log(`[DataPacks] ${line}`);
    return result;
  }

  /** Take every applied pack back out of the world. */
  revertDataPacks() {
    if (!this.dataPackApplication) return 0;
    const count = revertAll(this.dataPackApplication);
    this.dataPackApplication = null;
    return count;
  }

  /**
   * Mark the store as changed, so a reload applies the new set.
   *
   * A flag rather than an immediate apply: toggling four packs should not apply four times, and a pack that
   * is switched on mid-world cannot change terrain that has already been generated anyway.
   */
  markDataPacksDirty() {
    this.dataPacksDirty = true;
  }

  /** Remove a pack from the world if it is applied, then let the caller drop it from the store. */
  removeDataPack(name) {
    if (!this.dataPackApplication) return false;
    const applied = this.dataPackApplication.applied.find(a => a.pack?.name === name);
    if (!applied) return false;
    revertDataPack(applied.record);
    this.dataPackApplication.applied = this.dataPackApplication.applied.filter(a => a !== applied);
    this.dataPackApplication.records = this.dataPackApplication.records.filter(r => r !== applied.record);
    return true;
  }

  /**
   * Put an End portal chamber underground near the spawn, with a shaft to the surface above it.
   *
   * Chosen rather than generated: this project has no stronghold system, and adding one would be a
   * world-generation feature rather than the route this exists to complete. A fixed chamber near the spawn
   * means the route can actually be walked, and the shaft is what makes it findable.
   *
   * Placed once, guarded, because the world-start path can be re-entered.
   */
  placeEndPortalRoom(spawn) {
    if (this.endPortalRoomPlaced) return null;
    this.endPortalRoomPlaced = true;
    if (!this.world) return null;

    const sx = Math.floor(spawn?.x ?? this.player?.position?.x ?? 0);
    const sz = Math.floor(spawn?.z ?? this.player?.position?.z ?? 0);
    const surfaceY = Math.floor(spawn?.y ?? this.player?.position?.y ?? 30);
    // Offset from the spawn so the player does not start standing on the shaft, and never so shallow that the
    // chamber breaks through the surface.
    const cx = sx + 48;
    const cz = sz + 48;
    const floorY = Math.max(5, Math.min(surfaceY - 14, 30));

    const result = buildEndPortalRoom(this.world, cx, floorY, cz, {
      filledEyes: 2,
      radius: 7,
      surfaceY,
    });
    this.endPortalRoom = { x: cx, y: floorY, z: cz };

    // The chamber was written into chunks that may already be meshed, so they have to be rebuilt or the
    // room is invisible until something else forces a remesh.
    for (const chunk of this.world.chunks.values()) this.rebuildChunkMesh?.(chunk);
    console.log(`[World] End portal chamber at (${cx}, ${floorY}, ${cz}); ${result.placed} blocks placed, `
      + `${result.filled} eyes, shaft to y=${result.surfaceY}.`);
    return this.endPortalRoom;
  }

  switchDimension(newDim, targetPos = null) {    if (!this.world) return;

    // 1. Remove all active chunk meshes from scene
    for (const chunk of this.world.chunks.values()) {
      for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
        if (chunk[key]) {
          this.scene.remove(chunk[key]);
          chunk[key].geometry.dispose();
          chunk[key] = null;
        }
      }
    }

    // 2. Clear mobs in current dimension
    if (this.mobs?.mobs) {
      for (const mob of this.mobs.mobs) {
        if (mob.mesh) this.scene.remove(mob.mesh);
      }
      this.mobs.mobs = [];
    }

    // 3. Switch world dimension
    this.world.switchDimension(newDim);
    this.currentDimension = newDim;
    // The streamer's sets describe the chunks of the dimension just left. Without this it would
    // think the new dimension's chunks were already loaded, mesh nothing, and never unload the old
    // ones.
    if (this.streamer) {
      this.streamer.loaded.clear();
      this.streamer.pending.clear();
      this.streamer.centerX = null;
    }

    // 4. Update atmosphere (sky, fog, lighting)
    if (newDim === 'nether') {
      if (this.sky?.mesh) this.sky.mesh.visible = false;
      this.normalBgColor = new THREE.Color(0x330808);
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color.copy(new THREE.Color(0x471010));
      this.normalFogNear = 15;
      this.normalFogFar = 55;
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
      this.ambientLight.color.setHex(0x662222);
      this.ambientLight.groundColor.copy(this.ambientLight.color);
      this.ambientLight.intensity = 0.55;
      this.sunLight.intensity = 0;
      this.moonLight.intensity = 0;
    } else if (newDim === 'the_end') {
      if (this.sky?.mesh) this.sky.mesh.visible = false;
      this.normalBgColor = new THREE.Color(0x0a0515);
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color.copy(new THREE.Color(0x100820));
      this.normalFogNear = 20;
      this.normalFogFar = 75;
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
      this.ambientLight.color.setHex(0x3b1d54);
      this.ambientLight.groundColor.copy(this.ambientLight.color);
      this.ambientLight.intensity = 0.45;
      this.sunLight.intensity = 0;
      this.moonLight.intensity = 0;
      // Built ONCE per session. `initEndArena` spawns a dragon and six end crystals, so leaving the End and
      // coming back would otherwise spawn a second of each -- two dragons, one boss bar, and a fight that
      // never ends because defeating one leaves the other.
      if (!this.endArenaBuilt) {
        this.endArenaBuilt = true;
        this.bossManager?.initEndArena();
      }
    } else {
      if (this.sky?.mesh) this.sky.mesh.visible = true;
      this.normalBgColor = new THREE.Color(0x78a7ff);
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color.copy(this.normalBgColor);
      this.normalFogNear = 45;
      this.normalFogFar = 95;
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.65;
    }

    // 5. Position player
    if (targetPos && this.player?.position) {
      this.player.position.set(targetPos.x, targetPos.y, targetPos.z);
      if (this.player.velocity) this.player.velocity.set(0, 0, 0);
    }

    // 6. Immediately load chunks around destination
    this.loadChunksAroundPlayer();
    this.spawnVillageMobs();
    if (this.ui?.updateStats) this.ui.updateStats();
  }

  /**
   * Flush dirty chunks. Kept as the public hook that block edits, doors, chests, farming and the
   * building studio all call.
   *
   * The body used to be `[...world.chunks.values()].filter(c => c.dirty).sort(...)` on every call,
   * and it was called from the render loop -- so every frame allocated and sorted an array of all
   * loaded chunks in order to mesh at most a handful. It now asks the streamer, which keeps a
   * persistent dirty set and a distance order, and never rescans the world.
   */
  refreshDirtyChunks(budget = 4) {
    if (!this.streamer || !this.world) return;
    this.streamer.flush(this.player.position.x, this.player.position.z, Math.max(1, budget) * 2);
  }

  rebuildChunkMesh(chunk) {
    const geometry = this.mesher.meshChunk(chunk, this.world);
    this.applyChunkGeometry(chunk, geometry);
  }

  /**
   * Attach already-built geometry to a chunk and mark it clean.
   *
   * Split out from rebuildChunkMesh so the streamer can mesh a chunk across several frames: the
   * generator returns the geometry when it finally completes, and this swaps it into the scene.
   * The old meshes are removed first so a resumed mesh replaces rather than duplicates.
   */
  applyChunkGeometry(chunk, geometry) {
    for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
      if (chunk[key]) { this.scene.remove(chunk[key]); chunk[key].geometry.dispose(); chunk[key] = null; }
    }

    const { opaqueGeo, transparentGeo, waterGeo, lightGeo } = geometry;
    // Chunk meshes sit at the origin and never move, so their matrices are computed once rather than recomposed
    // on every frame's scene walk -- over a thousand of them in a normal view distance.
    const settle = (mesh) => { mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.updateMatrixWorld(true); return mesh; };

    this.blockLighting.setChunk(chunk.cx, chunk.cz, lightGeo?.userData.sources || []);
    if (lightGeo) {
      chunk.lightMesh = settle(new THREE.Mesh(lightGeo, this.textures.lightMaterial));
      chunk.lightMesh.castShadow = chunk.lightMesh.receiveShadow = true;
      chunk.lightMesh.customDistanceMaterial = this.textures.lightDistanceMaterial;
      this.scene.add(chunk.lightMesh);
    }
    if (opaqueGeo) {
      chunk.opaqueMesh = settle(new THREE.Mesh(opaqueGeo, this.textures.opaqueMaterial));
      chunk.opaqueMesh.castShadow = chunk.opaqueMesh.receiveShadow = true;
      this.scene.add(chunk.opaqueMesh);
    }
    if (waterGeo) {
      chunk.waterMesh = markWater(settle(new THREE.Mesh(waterGeo, this.textures.waterMaterial)));
      chunk.waterMesh.renderOrder = 1;
      chunk.waterMesh.receiveShadow = true;
      this.scene.add(chunk.waterMesh);
    }
    if (transparentGeo) {
      // Leaves, glass and plants: part of what the water refracts, and redrawn over it where they are in front.
      chunk.transparentMesh = markOverWater(settle(new THREE.Mesh(transparentGeo, this.textures.transparentMaterial)));
      chunk.transparentMesh.renderOrder = 2;
      chunk.transparentMesh.castShadow = chunk.transparentMesh.receiveShadow = true;
      this.scene.add(chunk.transparentMesh);
    }

    chunk.dirty = false;
  }

  /**
   * The one place the world's settings are applied.
   *
   * Called by the setup screen before generation, and by anything else that creates a world. The plan's rule
   * is that ordinary Survival selects its settings *before* terrain generation and ticking -- not that a
   * Creative player is built and then toggled, which is what used to happen and what left flight on.
   */
  applyWorldSettings(raw = {}) {
    // settingsWith: a Creative world starts with cheats ON unless the setup screen said otherwise.
    this.settings = settingsWith(this.settings, raw);
    this.difficulty = this.settings.difficulty;
    this.player?.setGameMode?.(this.settings.gameMode);
    if (this.player) this.player.difficulty = this.settings.difficulty;
    // A changed pack choice is a changed world: put the new preset in the store now, so the apply that runs
    // at the start of generation uses it. `installDataPackPreset` is idempotent for an unchanged id.
    if (Object.prototype.hasOwnProperty.call(raw, 'dataPackPreset')) {
      this.installDataPackPreset(this.settings.dataPackPreset);
    }
    return this.settings;
  }

  /**
   * Put the chosen world-generation preset into the pack store.
   *
   * The preset STACKS on top of the bundled vanilla pack rather than replacing it: it overrides the biomes,
   * spawners and structures it names and leaves everything else vanilla. `applyStore` applies in store order
   * and a later pack wins, so the preset is added last and therefore wins.
   *
   * Changing the choice removes the previous preset first. Leaving it would keep its terrain, because a pack
   * that is no longer in the store is still installed in the registries until something reverts it -- and the
   * next apply would then lay the new preset over the old one's biomes.
   *
   * An unknown id removes any preset and installs nothing, which is what a stale value in an old save means:
   * no preset, not a crash.
   */
  installDataPackPreset(id) {
    if (!this.dataPacks) return { ok: false, reason: 'no pack store' };
    // Remove whatever preset is loaded, so a change is a change and not an addition.
    for (const pack of allPacks(this.dataPacks)) {
      if (pack.source === PACK_SOURCES.PRESET) this.removeDataPack(pack.name);
    }
    for (const pack of allPacks(this.dataPacks)) {
      if (pack.source === PACK_SOURCES.PRESET) removePack(this.dataPacks, pack.name);
    }
    if (!id) return { ok: true, removed: true };

    const built = buildPresetPack(id);
    if (!built) return { ok: false, reason: `unknown generation preset "${id}"` };
    const added = addPack(this.dataPacks, {
      name: built.name,
      files: built.files,
      source: PACK_SOURCES.PRESET,
      format: PREFERRED_PACK_FORMAT,
    });
    if (added.ok) this.markDataPacksDirty();
    return added;
  }

  /**
   * The scripted population: villagers, an iron golem, a pillager patrol and a meadow of animals, all at
   * fixed coordinates around the origin.
   *
   * It runs **only for the showcase preset**. It used to run for every world, which is where the daytime
   * hostiles came from: the first thing a new Survival player met was a raid captain with a banner, on a
   * bright afternoon, a dozen blocks from spawn. Ordinary worlds populate themselves through natural
   * spawning, structures and spawn eggs, as the plan requires.
   */
  spawnVillageMobs() {
    if (!allowsShowcasePopulation(this.settings)) return false;
    return this.populateShowcaseVillage();
  }

  populateShowcaseVillage() {
    const getGround = (x, z) => {
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      for (let y = 50; y >= 1; y--) {
        const v = this.world.getVoxel(ix, y, iz);
        if (v !== BLOCKS.AIR && v !== BLOCKS.WATER && v !== BLOCKS.LAVA) {
          return y + 1.01;
        }
      }
      return 26;
    };

    const biomeId = this.world.selectedBiome;
    const def = getBiomeDef(biomeId);

    if (biomeId && biomeId !== 'all') {
      if (biomeId === 'mushroom_fields') {
        this.mobs.spawnMooshroom?.(3.5, getGround(3.5, 3.5), 3.5);
        this.mobs.spawnMooshroom?.(6.5, getGround(6.5, -2.5), -2.5);
        this.mobs.spawnMooshroom?.(8.5, getGround(8.5, 2.5), 2.5);
        return;
      }
      if (biomeId === 'deep_dark') {
        this.mobs.spawnWarden?.(5.0, getGround(5.0, 5.0), 5.0);
        return;
      }
      if (def?.isNether || this.world.isNether) {
        const sea = this.world.seaLevel || 14;
        if (biomeId === 'crimson_forest') {
          this.mobs.spawnPiglin?.(4.0, getGround(4.0, 4.0), 4.0);
          this.mobs.spawnPiglin?.(6.0, getGround(6.0, 2.0), 2.0);
          this.mobs.spawnHoglin?.(8.0, getGround(8.0, -3.0), -3.0);
          this.mobs.spawnZombifiedPiglin?.(2.0, getGround(2.0, -4.0), -4.0);
          this.mobs.spawnStrider?.(0.0, sea + 1.01, 10.0);
          return;
        }
        if (biomeId === 'warped_forest') {
          this.mobs.spawnEnderman?.(4.0, getGround(4.0, 4.0), 4.0);
          this.mobs.spawnEnderman?.(8.0, getGround(8.0, -3.0), -3.0);
          this.mobs.spawnEnderman?.(2.0, getGround(2.0, -5.0), -5.0);
          this.mobs.spawnStrider?.(0.0, sea + 1.01, 10.0);
          return;
        }
        if (biomeId === 'soul_sand_valley') {
          this.mobs.spawnSkeleton?.(4.0, getGround(4.0, 4.0), 4.0);
          this.mobs.spawnGhast?.(10.0, getGround(10.0, 8.0) + 4, 8.0);
          this.mobs.spawnEnderman?.(2.0, getGround(2.0, -4.0), -4.0);
          this.mobs.spawnStrider?.(0.0, sea + 1.01, 10.0);
          return;
        }
        if (biomeId === 'basalt_deltas') {
          this.mobs.spawnMagmaCube?.(4.0, getGround(4.0, 4.0), 4.0);
          this.mobs.spawnMagmaCube?.(7.0, getGround(7.0, 2.0), 2.0);
          this.mobs.spawnGhast?.(10.0, getGround(10.0, 8.0) + 4, 8.0);
          this.mobs.spawnStrider?.(0.0, sea + 1.01, 10.0);
          return;
        }
        // nether_wastes & general dynamic nether
        this.mobs.spawnZombifiedPiglin?.(4.0, getGround(4.0, 4.0), 4.0);
        this.mobs.spawnPiglin?.(7.0, getGround(7.0, 2.0), 2.0);
        this.mobs.spawnHoglin?.(2.0, getGround(2.0, 6.0), 6.0);
        this.mobs.spawnGhast?.(10.0, getGround(10.0, 8.0) + 4, 8.0);
        this.mobs.spawnMagmaCube?.(2.0, getGround(2.0, -4.0), -4.0);
        this.mobs.spawnBlaze?.(5.0, getGround(5.0, -2.0) + 1, -2.0);
        this.mobs.spawnWitherSkeleton?.(-4.0, getGround(-4.0, -2.0), -2.0);
        this.mobs.spawnStrider?.(0.0, sea + 1.01, 10.0);
        return;
      }
      if (def?.isOcean || ['ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'deep_lukewarm_ocean', 'cold_ocean', 'deep_cold_ocean', 'frozen_ocean', 'deep_frozen_ocean'].includes(biomeId)) {
        const sea = this.world.seaLevel || 24;
        const groundY = (x, z) => getGround(x, z);

        if (biomeId === 'frozen_ocean' || biomeId === 'deep_frozen_ocean') {
          // Polar bears roaming on the ice surface
          this.mobs.spawnPolarBear?.(4.0, sea + 1.01, 4.0);
          this.mobs.spawnPolarBear?.(8.0, sea + 1.01, -2.0);
          // Underwater underneath ice sheet
          const midY = Math.max(10, Math.floor((sea + groundY(2.0, 5.0)) / 2));
          this.mobs.spawnSalmon?.(2.0, midY, 5.0);
          this.mobs.spawnGlowSquid?.(6.0, Math.max(8, midY - 2), 2.0);
          this.mobs.spawnDrowned?.(5.0, groundY(5.0, -4.0), -4.0);
          if (biomeId === 'deep_frozen_ocean') {
            this.mobs.spawnGuardian?.(0.0, Math.max(8, sea - 6), 0.0);
          }
          return;
        }

        if (biomeId === 'warm_ocean') {
          this.mobs.spawnDolphin?.(6.0, sea - 0.5, 3.0);
          const midY = Math.max(8, Math.floor((sea + groundY(3.0, 4.0)) / 2));
          this.mobs.spawnSalmon?.(3.0, midY + 2, 4.0);
          this.mobs.spawnSalmon?.(4.5, midY + 1, 5.0);
          this.mobs.spawnSquid?.(2.0, midY, 2.0);
          this.mobs.spawnDrowned?.(5.0, groundY(5.0, -3.0), -3.0);
          return;
        }

        if (biomeId.startsWith('deep_')) {
          this.mobs.spawnGuardian?.(4.0, Math.max(10, sea - 6), 4.0);
          this.mobs.spawnGlowSquid?.(2.0, Math.max(8, sea - 8), 5.0);
          this.mobs.spawnDolphin?.(7.0, sea - 0.5, 2.0);
          this.mobs.spawnCod?.(1.0, sea - 3, 3.0);
          this.mobs.spawnSalmon?.(5.0, sea - 4, -2.0);
          this.mobs.spawnDrowned?.(6.0, groundY(6.0, -2.0), -2.0);
          return;
        }

        // Standard Ocean, Lukewarm Ocean, Cold Ocean
        this.mobs.spawnDolphin?.(7.0, sea - 0.5, 2.0);
        const midY = Math.max(8, Math.floor((sea + groundY(3.0, 3.0)) / 2));
        this.mobs.spawnCod?.(2.0, midY + 2, 4.0);
        this.mobs.spawnSalmon?.(4.0, midY + 1, -2.0);
        this.mobs.spawnSquid?.(1.0, midY, 2.0);
        this.mobs.spawnGlowSquid?.(-2.0, Math.max(8, midY - 1), 3.0);
        this.mobs.spawnDrowned?.(5.0, groundY(5.0, -2.0), -2.0);
        return;
      }
      if (def?.isEnd) {
        this.mobs.spawnEnderman?.(4.0, getGround(4.0, 4.0), 4.0);
        this.mobs.spawnEnderman?.(7.0, getGround(7.0, -2.0), -2.0);
        this.mobs.spawnShulker?.(2.0, getGround(2.0, 6.0), 6.0);
        this.mobs.spawnShulker?.(8.0, getGround(8.0, 8.0), 8.0);
        return;
      }
      if (biomeId === 'bamboo_jungle' || biomeId === 'sparse_jungle') {
        this.mobs.spawnPanda?.(4.0, getGround(4.0, 4.0), 4.0);
        this.mobs.spawnPanda?.(8.0, getGround(8.0, -3.0), -3.0);
        this.mobs.spawnPig?.(6.5, getGround(6.5, 2.5), 2.5);
        this.mobs.spawnOcelot?.(2.0, getGround(2.0, 1.0), 1.0);
        return;
      }
      if (['snowy_plains', 'ice_spikes', 'frozen_ocean', 'frozen_peaks', 'grove'].includes(biomeId)) {
        this.mobs.spawnPolarBear?.(5.0, getGround(5.0, 4.0), 4.0);
        this.mobs.spawnPolarBear?.(8.0, getGround(8.0, -2.0), -2.0);
        return;
      }
    }

    // Villagers near path and house
    this.mobs.spawnVillager?.(2.0, getGround(2.0, 3.5), 3.5);
    this.mobs.spawnVillager?.(5.5, getGround(5.5, 5.5), 5.5);
    this.mobs.spawnVillager?.(7.5, getGround(7.5, 3.5), 3.5);

    // Iron Golem village guardian in front of cottage!
    this.mobs.spawnIronGolem?.(3.8, getGround(3.8, 1.5), 1.5);

    // Pillager patrol on the meadow outskirts (one is Raid Captain with banner)
    const captain = this.mobs.spawnPillager?.(14.5, getGround(14.5, 12.5), 12.5);
    if (captain) {
      captain.isRaidCaptain = true;
      captain.hasBanner = true;
    }
    this.mobs.spawnPillager?.(12.5, getGround(12.5, 14.5), 14.5);

    // Passive animals in meadow
    this.mobs.spawnPig?.(6.5, getGround(6.5, -2.5), -2.5);
    this.mobs.spawnCow?.(8.5, getGround(8.5, 2.5), 2.5);
    this.mobs.spawnSheep?.(9.5, getGround(9.5, -1.5), -1.5);
    this.mobs.spawnChicken?.(4.5, getGround(4.5, -3.5), -3.5);
    this.mobs.spawnHorse?.(11.5, getGround(11.5, 4.5), 4.5);
    this.mobs.spawnWolf?.(5.0, getGround(5.0, -5.0), -5.0);
    this.mobs.spawnCat?.(3.0, getGround(3.0, 1.0), 1.0);
    return true;
  }

  /**
   * Resolves once the UIManager exists, so a start-screen click during loading is honoured rather than
   * dropped. Resolved at the point the UI is constructed in start().
   */
  whenUiReady() {
    return this._uiReady ?? Promise.resolve();
  }

  /**
   * Bind the start screen's buttons now instead of at the end of start().
   *
   * bindEvents() runs after `await this.textures.init()`, which decodes the whole block atlas; until it
   * returns the overlay is on screen but its buttons have no listeners, so clicks were silently dropped
   * and "Generate New World" appeared to need several attempts. The handlers that need the game wait for
   * `whenUiReady()` instead, and the three Inspector buttons only navigate, so they work immediately.
   */
  bindStartScreen() {
    const bind = (id, handler) => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', handler);
    };

    /**
     * Run an action that needs the game, showing that the click was taken while the game is still loading.
     * A click with no visible answer reads as a dead button, which is what invited the second and third one.
     */
    const afterUi = async (button, action) => {
      const waiting = !this.ui;
      if (waiting && button) {
        button.disabled = true;
        button.classList.add('is-waiting');
      }
      await this.whenUiReady();
      if (waiting && button) {
        button.disabled = false;
        button.classList.remove('is-waiting');
      }
      return action();
    };

    // Looked up by name and bound directly: tests/progressOverlay.test.js slices this handler out of the file
    // from `btnNewWorld.addEventListener` to the design-mode branch and asserts on its catch and finally.
    const btnNewWorld = document.getElementById('btn-start-new-world');
    if (btnNewWorld) btnNewWorld.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.init();
      const button = e.currentTarget;
      afterUi(button, async () => {
        // The biome menu belongs to the UI, so wait for it before choosing a path: falling through to the
        // legacy generation path while the UI was still loading would skip the menu entirely.
        if (this.ui?.openBiomeModal) {
          this.ui.openBiomeModal();
          return;
        }
        if (this._worldStartInFlight) return;
        this._worldStartInFlight = true;
        if (button) button.disabled = true;
        try {
          // Await so the start screen stays up (with the progress bar) until the terrain and meshes are
          // actually ready, then hand over the pointer.
          await this.generateNewWorld();
          const startOverlay = document.getElementById('start-overlay');
          if (startOverlay) startOverlay.style.display = 'none';
        } catch (err) {
          // Never strand the player on a full progress bar: undo the start and report what happened.
          console.error('[World] Failed to start a new world:', err);
          this.failWorldStart(err);
        } finally {
          if (button) button.disabled = false;
          this._worldStartInFlight = false;
          if (this.worldReady) this.overlay?.hide();
        }
      });
    });

    // Named explicitly as well: tests/progressOverlay.test.js ends its slice of the start handler at this
    // line, so the pointer-lock scan stops before the canvas handler further down the file.
    const btnDesignedWorld = document.getElementById('btn-start-designed-world');
    if (btnDesignedWorld) btnDesignedWorld.addEventListener('click', (e) => {
      e.stopPropagation();
      this.sounds.init();
      afterUi(e.currentTarget, () => this.ui?.openDesignedWorldsModal());
    });

    bind('btn-start-load-world', (e) => {
      e.stopPropagation();
      this.sounds.init();
      afterUi(e.currentTarget, () => this.ui?.openMapModal('load'));
    });

    bind('btn-start-building-studio', (e) => {
      e.stopPropagation();
      afterUi(e.currentTarget, () => this.startBuildingStudio());
    });

    // One Inspector button and a picker, rather than four buttons crowding the start screen. Each choice
    // navigates to the page that owns it, so none of them needs anything from the game. Every element is
    // looked up and bound explicitly, which is the shape the inspector entry tests scan for; binding them
    // through the `bind` helper above hid the lookup from those tests even though the wiring was the same.
    const btnInspector = document.getElementById('btn-start-inspector');
    if (btnInspector) {
      btnInspector.addEventListener('click', (e) => { e.stopPropagation(); this.openInspectorPicker(); });
    }
    const btnCloseInspectorPicker = document.getElementById('btn-close-inspector-picker');
    if (btnCloseInspectorPicker) {
      btnCloseInspectorPicker.addEventListener('click', (e) => { e.stopPropagation(); this.closeInspectorPicker(); });
    }
    // Structure, Item, Block, Mob -- the four destinations behind the one button. Looked up one by one rather
    // than through a table, so each choice's wiring is visible to the entry tests that scan this file.
    const btnPickInspectorStructure = document.getElementById('btn-pick-inspector-structure');
    if (btnPickInspectorStructure) {
      btnPickInspectorStructure.addEventListener('click', (e) => { e.stopPropagation(); this.openInspector('structure'); });
    }
    const btnPickInspectorItem = document.getElementById('btn-pick-inspector-item');
    if (btnPickInspectorItem) {
      btnPickInspectorItem.addEventListener('click', (e) => { e.stopPropagation(); this.openInspector('item'); });
    }
    const btnPickInspectorBlock = document.getElementById('btn-pick-inspector-block');
    if (btnPickInspectorBlock) {
      btnPickInspectorBlock.addEventListener('click', (e) => { e.stopPropagation(); this.openInspector('block'); });
    }
    const btnPickInspectorMob = document.getElementById('btn-pick-inspector-mob');
    if (btnPickInspectorMob) {
      btnPickInspectorMob.addEventListener('click', (e) => { e.stopPropagation(); this.openInspector('mob'); });
    }
  }

  // ------------------------------------------------------------------------------------------------
  // Java Edition hotkeys. src/hotkeys.js is only a table of key -> method name; the behaviour lives here
  // with the system it affects, and each action reports what it did in chat, because a debug key that
  // silently toggles a renderer is indistinguishable from a key that does nothing.
  // ------------------------------------------------------------------------------------------------

  /** F1: hide the HUD, as vanilla's `key.toggleGui` does. Chat stays, so you can still see what happened. */
  toggleHud() {
    const hidden = document.body.classList.toggle('hud-hidden');
    this.ui?.addChatMessage(`HUD ${hidden ? 'hidden' : 'shown'} (F1)`, 'system');
    return hidden;
  }

  /** F2: write the current frame to a PNG download, the browser's equivalent of the screenshots folder. */
  captureScreenshot() {
    try {
      // Draw and read in the same task: the canvas is created without preserveDrawingBuffer, so the buffer
      // is only guaranteed to hold the frame until the browser composites it.
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `minecraft-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      this.ui?.addChatMessage('Saved screenshot (F2)', 'system');
      return url;
    } catch (err) {
      console.error('[Hotkeys] Screenshot failed:', err);
      this.ui?.addChatMessage('Could not save the screenshot', 'error');
      return null;
    }
  }

  /** F11: fullscreen via the Fullscreen API, which is the browser's `key.fullscreen`. */
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      return Boolean(document.fullscreenElement);
    } catch (err) {
      // Browsers only grant this from a user gesture, and some refuse outright.
      console.warn('[Hotkeys] Fullscreen refused:', err);
      this.ui?.addChatMessage('Fullscreen was refused by the browser', 'error');
      return false;
    }
  }

  /** Control+B: the narrator. Chat is spoken through the Web Speech API, the browser's text to speech. */
  toggleNarrator() {
    const enabled = this.ui?.toggleNarrator?.() ?? false;
    this.ui?.addChatMessage(`Narrator ${enabled ? 'enabled' : 'disabled'} (Control+B)`, 'system');
    return enabled;
  }

  /** F3+A: throw every loaded chunk mesh away and build it again. */
  reloadChunks() {
    let rebuilt = 0;
    const chunks = this.world?.chunks;
    if (chunks && typeof chunks.values === 'function') {
      for (const chunk of chunks.values()) {
        this.rebuildChunkMesh(chunk);
        rebuilt++;
      }
    }
    this.world?.invalidateChunkCache?.();
    this.ui?.addChatMessage(`Reloaded ${rebuilt} chunk${rebuilt === 1 ? '' : 's'} (F3+A)`, 'system');
    return rebuilt;
  }

  /** F3+T: reload the texture atlas, then rebuild the world with it. */
  async reloadResources() {
    this.ui?.addChatMessage('Reloading resources… (F3+T)', 'system');
    try {
      await this.textures.init();
      this.reloadChunks();
      this.ui?.updateHotbar?.();
      this.ui?.addChatMessage('Resources reloaded', 'system');
      return true;
    } catch (err) {
      console.error('[Hotkeys] Resource reload failed:', err);
      this.ui?.addChatMessage('Could not reload the resources', 'error');
      return false;
    }
  }

  /** F3+D: clear the chat, history included. */
  clearChat() {
    this.ui?.clearChat?.();
    return true;
  }

  /** F3+H: advanced tooltips, which name the item id and its exact durability. */
  toggleAdvancedTooltips() {
    const on = this.ui?.toggleAdvancedTooltips?.() ?? false;
    this.ui?.addChatMessage(`Advanced tooltips ${on ? 'shown' : 'hidden'} (F3+H)`, 'system');
    return on;
  }

  /** F3+N: the game mode switcher. This build has Survival and Creative, so it alternates between them. */
  cycleGameMode() {
    if (this.modRuntime?.canChangeGameMode?.() === false) return null;
    const next = this.player?.gamemode === 'creative' ? 'survival' : 'creative';
    this.setGameMode(next);
    this.ui?.addChatMessage(`Set game mode to ${next === 'creative' ? 'Creative' : 'Survival'} Mode (F3+N)`, 'system');
    return next;
  }

  /** F3+P: pause on lost focus. Nothing pauses the game when the window loses focus unless this is on. */
  toggleFocusPause() {
    this.pauseOnLostFocus = !this.pauseOnLostFocus;
    this.ui?.addChatMessage(`Pause on lost focus: ${this.pauseOnLostFocus ? 'enabled' : 'disabled'} (F3+P)`, 'system');
    return this.pauseOnLostFocus;
  }

  /** F3+C: copy the player's position as a teleport command, as vanilla does. */
  copyLocation() {
    const p = this.player?.position;
    if (!p) return null;
    const toDegrees = (radians) => ((radians ?? 0) * 180) / Math.PI;
    const text = `/execute in minecraft:overworld run tp @s ${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)} `
      + `${toDegrees(this.player.yaw).toFixed(2)} ${toDegrees(this.player.pitch).toFixed(2)}`;
    this.writeClipboard(text, 'Copied location (F3+C)');
    return text;
  }

  /** F3+I: copy the targeted block as a /setblock command that this game's command handler accepts. */
  copyBlockData() {
    const target = this.targetBlock;
    if (!target) {
      this.ui?.addChatMessage('No block targeted (F3+I)', 'error');
      return null;
    }
    const name = Object.keys(BLOCKS).find((key) => BLOCKS[key] === target.blockId) || String(target.blockId);
    const text = `/setblock ${target.x} ${target.y} ${target.z} ${name}`;
    this.writeClipboard(text, `Copied ${text} (F3+I)`);
    return text;
  }

  /** F3+V: the version information the browser build can honestly report. */
  dumpVersionInfo() {
    const gl = this.renderer?.getContext?.();
    const info = [
      'id = 1.20.2-browser',
      'name = Minecraft Web Edition (three.js voxel build)',
      `renderer = ${gl ? gl.getParameter(gl.RENDERER) : 'unknown'}`,
      `webgl = ${gl ? gl.getParameter(gl.VERSION) : 'unknown'}`,
    ];
    for (const line of info) this.ui?.addChatMessage(line, 'system');
    return info;
  }

  /** Put text on the clipboard, with a fallback for browsers that refuse the async API. */
  writeClipboard(text, message) {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => this.writeClipboardFallback(text));
      } else {
        this.writeClipboardFallback(text);
      }
      if (message) this.ui?.addChatMessage(message, 'system');
      return true;
    } catch (err) {
      console.warn('[Hotkeys] Clipboard write failed:', err);
      if (message) this.ui?.addChatMessage('Could not reach the clipboard', 'error');
      return false;
    }
  }

  writeClipboardFallback(text) {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    } catch (err) {
      console.warn('[Hotkeys] Clipboard fallback failed:', err);
    }
  }

  /** F3+B: entity hitboxes. */
  toggleHitboxes() {
    this.showHitboxes = !this.showHitboxes;
    if (!this.showHitboxes && this.hitboxGroup) this.hitboxGroup.visible = false;
    this.ui?.addChatMessage(`Hitboxes ${this.showHitboxes ? 'shown' : 'hidden'} (F3+B)`, 'system');
    return this.showHitboxes;
  }

  /** F3+G: chunk borders. */
  toggleChunkBorders() {
    this.showChunkBorders = !this.showChunkBorders;
    if (this.showChunkBorders) this.updateDebugOverlays();
    else if (this.chunkBorderLines) this.chunkBorderLines.visible = false;
    this.ui?.addChatMessage(`Chunk borders ${this.showChunkBorders ? 'shown' : 'hidden'} (F3+G)`, 'system');
    return this.showChunkBorders;
  }

  /** Called from the frame loop; both debug renderers are off until switched on, so this costs nothing. */
  updateDebugOverlays() {
    if (this.showHitboxes) this.updateHitboxLines();
    if (this.showChunkBorders) this.updateChunkBorderLines();
  }

  /** One wireframe box per mob, sized from that mob's own width and height. */
  updateHitboxLines() {
    if (!this.hitboxGroup) {
      this.hitboxGroup = new THREE.Group();
      this.hitboxGroup.name = 'debug-hitboxes';
      this.scene.add(this.hitboxGroup);
      this.hitboxGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
      this.hitboxMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
    }
    this.hitboxGroup.visible = true;

    const mobs = this.mobs?.mobs ?? [];
    while (this.hitboxGroup.children.length < mobs.length) {
      this.hitboxGroup.add(new THREE.LineSegments(this.hitboxGeometry, this.hitboxMaterial));
    }
    for (let i = 0; i < this.hitboxGroup.children.length; i++) {
      const lines = this.hitboxGroup.children[i];
      const mob = mobs[i];
      if (!mob?.position) {
        lines.visible = false;
        continue;
      }
      const meshScale = mob.mesh?.scale;
      const width = (mob.width || 0.6) * (meshScale?.x ?? 1);
      const height = (mob.height || 1.8) * (meshScale?.y ?? 1);
      lines.visible = true;
      lines.scale.set(width, height, width);
      // A mob's position is at its feet, so the box sits half its height above that.
      lines.position.set(mob.position.x, mob.position.y + height / 2, mob.position.z);
    }
  }

  /** The vertical grid at chunk boundaries, over every loaded chunk. */
  updateChunkBorderLines() {
    const loaded = this.world?.chunks?.size ?? 0;
    if (!this.chunkBorderLines || this.chunkBorderChunks !== loaded) this.rebuildChunkBorderLines();
    if (this.chunkBorderLines) this.chunkBorderLines.visible = true;
  }

  rebuildChunkBorderLines() {
    const CHUNK_SIZE = 16;
    const TOP = 96;
    this.chunkBorderChunks = this.world?.chunks?.size ?? 0;
    if (this.chunkBorderLines) {
      this.scene.remove(this.chunkBorderLines);
      this.chunkBorderLines.geometry?.dispose?.();
      this.chunkBorderLines = null;
    }
    const points = [];
    const chunks = this.world?.chunks;
    if (chunks && typeof chunks.entries === 'function') {
      for (const [key, chunk] of chunks.entries()) {
        let cx = chunk?.cx ?? chunk?.x;
        let cz = chunk?.cz ?? chunk?.z;
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) {
          const [fromKeyX, fromKeyZ] = String(key).split(',').map(Number);
          cx = fromKeyX;
          cz = fromKeyZ;
        }
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
        const x0 = cx * CHUNK_SIZE;
        const z0 = cz * CHUNK_SIZE;
        for (const [x, z] of [[x0, z0], [x0 + CHUNK_SIZE, z0], [x0 + CHUNK_SIZE, z0 + CHUNK_SIZE], [x0, z0 + CHUNK_SIZE]]) {
          points.push(x, 0, z, x, TOP, z);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.chunkBorderLines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0x101010, transparent: true, opacity: 0.65 })
    );
    this.chunkBorderLines.name = 'debug-chunk-borders';
    this.scene.add(this.chunkBorderLines);
  }

  bindEvents() {
    // Java Edition interface hotkeys: F1, F2, F11, Control+B and the F3 debug combinations.
    installHotkeys(this);
    // The start-overlay buttons are bound in bindStartScreen(), which start() calls before the atlas
    // loads. They used to be bound here, at the end of start(), so a click during loading reached a
    // button with no listener and was dropped.

    const requestLockOnClick = () => {
      if (this.modRuntime?.exclusiveSimulation) return;
      if (this.player?.isDead) return;
      if (this.player?.isDungeonMode) return;
      const isLocked = document.pointerLockElement && (
        document.pointerLockElement === this.renderer?.domElement ||
        document.pointerLockElement === this.container ||
        document.pointerLockElement === this.renderer?.domElement?.parentElement
      );
      if (this.worldGenerated && !this.ui?.isModalOpen?.() && !this.ui?.isChatOpen && !isLocked) {
        try {
          (this.renderer?.domElement || this.container)?.requestPointerLock?.();
        } catch (e) {}
      }
    };

    this.renderer.domElement.addEventListener('click', (e) => {
      requestLockOnClick();
      if (!this.modRuntime?.exclusiveSimulation && this.worldGenerated && !this.ui?.isModalOpen?.() && !this.ui?.isChatOpen) {
        try { this.renderer.domElement.requestPointerLock(); } catch (e) {}
      }
    });
    if (this.container && this.container !== this.renderer.domElement) {
      this.container.addEventListener('click', requestLockOnClick);
    }

    // Mouse Down (Left click mine/attack, Right click place/interact)
    window.addEventListener('mousedown', (e) => {
      if (this.player?.isDead) return;
      if (this.player?.isDungeonMode) {
        if (e.button === 0 && !this.ui.isModalOpen() && !this.ui.isChatOpen) {
          this.player.triggerPunch();
        }
        return;
      }

      const isLocked = document.pointerLockElement && (
        document.pointerLockElement === this.renderer.domElement ||
        document.pointerLockElement === this.container ||
        document.pointerLockElement === this.renderer.domElement?.parentElement ||
        (this.renderer?.domElement && document.pointerLockElement?.contains?.(this.renderer.domElement))
      );
      if (!isLocked) return;

      if (e.button === 0) {
        // Left Click: Mine / Attack
        this.isMouseDown = true;
        this.miningTime = 0;
        this.heldItemRenderer.swing();
        this.handleLeftClick();
      } else if (e.button === 2) {
        // Shield blocking check: if holding shield in off-hand or main hand
        const hasShield = (this.inventory.getOffhandItem()?.id === 'shield') ||
                          (this.inventory.getActiveItem()?.id === 'shield');
        if (hasShield) {
          this.player.isBlocking = true;
        }

        // Fishing comes first: with a bobber already out, right-click is a REEL rather than a cast, and
        // `cast()` reports which of the two it did. It returns false when the held item is not a rod, so a
        // rod in the hotbar does not stop the click reaching the bow or the block placement below.
        if (this.fishing.cast()) return;
        // Hold right click to draw the bow; release to fire.
        if (this.bow.start()) return;
        // Right Click: Place / Interact
        this.heldItemRenderer.recoil();
        this.handleRightClick();
      } else if (e.button === 1) {
        // Middle Click: Pick Block
        this.handleMiddleClick();
      }
    });

    window.addEventListener('blur', () => {
      this.bow?.cancel();
      this.fishing?.cancel();
      this.player.isBlocking = false;
      // F3+P: vanilla pauses singleplayer when the window loses focus. This build never did, so the world
      // kept running while the tab was in the background; it only does it once the toggle is on.
      if (this.pauseOnLostFocus && this.worldReady && this.player && !this.player.isDead
        && !this.ui?.isModalOpen?.() && !this.ui?.isChatOpen && !this.ui?.isGeminiOpen?.()) {
        this.ui?.togglePauseMenu?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.bow?.cancel();
        // Losing pointer lock reels the line in, which is the same as the player looking away: no durability
        // and no catch, matching the wiki's rule that abandoning the rod costs nothing.
        this.fishing?.cancel();
        this.player.isBlocking = false;
        // Escape releases the lock without a keydown reaching the page. That first Escape only detaches the
        // mouse; a second Escape (handled in ui.js) opens the pause menu, and a click re-attaches the mouse.
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) {
        this.bow.release();
        this.player.isBlocking = false;
      }
      if (e.button === 0) {
        this.isMouseDown = false;
        this.miningTime = 0;
        this.breakOverlayMesh.visible = false;
      }
    });

    // Drop item key (Q, or Control+Q for the whole stack)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !this.ui.isModalOpen() && !this.ui.isChatOpen) {
        this.dropHeldItem(e.ctrlKey || e.metaKey);
      }
    });

    // Window Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.heldItemRenderer.resize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * Lead the player to the Mob Inspector.
   *
   * The Inspector is its own page (mob-debug.html) with its own 3D preview and controls, so
   * this navigates rather than starting a mode of the running game. Mob Studio used to spin
   * up a private flat world here; nothing needs generating now.
   *
   * @returns {string} the URL that was navigated to, so it can be asserted in tests
   */
  openMobInspector() {
    // Carry the mob the player was last examining, when one is known.
    const mob = this.mobInspectorTarget || '';
    const url = mob ? `/mob-debug.html?mob=${encodeURIComponent(mob)}` : '/mob-debug.html';
    if (typeof window !== 'undefined') window.location.href = url;
    return url;
  }

  /**
   * Show the Inspector picker: Structure, Item, Block or Mob.
   *
   * The start screen has one Inspector button instead of four, so this is what it opens.
   *
   * @returns {boolean} whether the picker exists in the document
   */
  openInspectorPicker() {
    const modal = document.getElementById('inspector-picker-modal');
    if (modal) modal.classList.remove('hidden');
    return modal !== null;
  }

  /** Hide the Inspector picker without choosing anything. */
  closeInspectorPicker() {
    const modal = document.getElementById('inspector-picker-modal');
    if (modal) modal.classList.add('hidden');
    return modal !== null;
  }

  /**
   * Open the Inspector page for one picker choice.
   *
   * Four choices, three pages: Structure and Mob each have their own, and Item and Block are two filters of
   * the Resource Inspector -- the page's own Kind selector, which `?kind=` preselects. Item means items,
   * Block means the blocks the page lists on their own.
   *
   * @param {'structure'|'item'|'block'|'mob'|string} choice
   * @returns {string|null} the URL navigated to, or null for an unknown choice
   */
  openInspector(choice) {
    const kind = String(choice || '').toLowerCase();
    this.closeInspectorPicker();
    if (kind === 'structure') return this.openStructureInspector();
    if (kind === 'mob') return this.openMobInspector();
    if (kind === 'item' || kind === 'block') return this.openResourceInspector({ kind });
    return null;
  }

  /**
   * Open the Item or Block Inspector, the block and item counterparts to the Mob Inspector.
   *
   * They are two separate pages with their own preview, so this navigates rather than starting a world.
   * `kind` picks the page: `block` opens block-debug.html, anything else opens item-debug.html. Carries the
   * resource the player was examining when one is known.
   *
   * @param {{resource?: string|null, kind?: 'item'|'block'|null}} [options]
   * @returns {string} the URL that was navigated to, so it can be asserted in tests
   */
  openResourceInspector({ resource = null, kind = null } = {}) {
    const target = resource || this.resourceInspectorTarget || '';
    const page = kind === 'block' ? '/block-debug.html' : '/item-debug.html';
    const params = new URLSearchParams();
    if (target) params.set('resource', target);
    const query = params.toString();
    const url = query ? `${page}?${query}` : page;
    if (typeof window !== 'undefined') window.location.href = url;
    return url;
  }

  /**
   * Open the Structure Inspector, the structure counterpart to the Mob and Resource Inspectors.
   *
   * Like them it is a standalone page with its own preview, so this navigates rather than starting a world: the
   * point of the page is to plan and realize one structure at a time at any seed WITHOUT generating a world.
   * The structure and the seed can be carried in the query string, which is what makes a particular
   * structure-and-seed combination linkable.
   *
   * @param {{structure?: string, seed?: string|number}} [options]
   * @returns {string} the URL that was navigated to, so it can be asserted in tests
   */
  openStructureInspector({ structure = null, seed = null } = {}) {
    const target = structure || this.structureInspectorTarget || '';
    const params = new URLSearchParams();
    if (target) params.set('structure', target);
    if (seed !== null && seed !== undefined && seed !== '') params.set('seed', String(seed));
    const query = params.toString();
    const url = query ? `/structure-inspector.html?${query}` : '/structure-inspector.html';
    if (typeof window !== 'undefined') window.location.href = url;
    return url;
  }

  handleLeftClick() {
    const lookDir = this.camera?.getWorldDirection(new THREE.Vector3()) || new THREE.Vector3(0, 0, -1);

    // 1. Deflect hostile projectiles (e.g. Ghast fireballs)
    if (this.mobs?.hostileBehaviors?.handlePlayerAttackProjectile(this.player.position, lookDir)) {
      if (this.sounds?.playPunch) this.sounds.playPunch();
      return;
    }

    // 2. Check End Crystal hit
    if (this.bossManager?.checkCrystalHit(this.camera.position, lookDir)) {
      return;
    }

    // A painting breaks with one hit (the wiki: attack it), and is nearer than the wall it hangs on. Stop the
    // press there, or holding the button would go on to mine the wall behind it.
    const paintingHit = this.paintings?.raycast(this.camera.position, lookDir, 5.2);
    if (paintingHit && (!this.targetMob || paintingHit.distance < this.camera.position.distanceTo(this.targetMob.mesh.position))) {
      this.paintings.breakByPlayer(paintingHit.painting, this.player);
      this.isMouseDown = false;
      return;
    }

    // Attack mob if target mob is looked at
    if (this.targetMob) {
      const activeItem = this.inventory.getActiveItem();
      let damage = 2; // hand damage
      if (activeItem && !activeItem.isBlock) {
        const it = ITEMS[activeItem.id];
        if (it && it.attack) damage = it.attack;
        // The enchantment bonuses used to be inline here, with the undead list spelled out as a literal
        // array. They live in enchantmentEffects.js now so bane of arthropods and the durability effects
        // have somewhere to go, and so the numbers can be asserted directly.
        damage += attackBonus(activeItem.enchantments, this.targetMob.type);
      }
      // Strength and weakness change what this hit deals by a flat amount per level, as vanilla does --
      // "+3 HP x level" -- so a hit is adjusted rather than scaled. Asked of the player rather than
      // computed here, so the effect rules stay in one module and this call site needs no import.
      const effectBonus = this.player?.attackDamageBonus?.() ?? 0;
      if (effectBonus !== 0) damage = Math.max(0, damage + effectBonus);
      this.mobs.damageMob(this.targetMob, damage, this.player.position, false, this.player);
      // Fire aspect sets the target alight after the hit lands, so a killing blow still burns the corpse
      // rather than skipping the effect.
      if (activeItem && Array.isArray(activeItem.enchantments)) {
        for (const ench of activeItem.enchantments) {
          if (ench?.id !== 'fire_aspect') continue;
          const seconds = fireAspectSeconds(ench.level);
          if (seconds > 0) igniteActor(this.targetMob, seconds);
        }
      }
      return;
    }

    // Creative mode instant block breaking
    if (this.player.gamemode === 'creative' && this.targetBlock) {
      this.breakTargetBlock();
    }
  }

  handleRightClick() {
    const interaction = this.mobs?.getMobProvider(this.targetMob)?.interact;
    if (interaction) { interaction(this.targetMob); return; }

    // Piglin bartering
    if (this.targetMob && this.targetMob.type === 'piglin') {
      if (this.mobs?.hostileBehaviors?.interactPiglin(this.targetMob, this.player)) {
        return;
      }
    }

    // Animal breeding, taming, milking, shearing, dyeing, sitting, mounting
    const canInteractWith = (m) => this.mobs?.animalBehaviors?.canInteract ? this.mobs.animalBehaviors.canInteract(m, this.player, this.inventory) : true;
    let interactMob = (this.targetMob && canInteractWith(this.targetMob)) ? this.targetMob : null;

    if (!interactMob && this.mobs?.mobs) {
      // Proximity & look cone fallback for interactable animals within reach
      const camPos = this.camera.position;
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      let closestDist = 3.8;
      for (const m of this.mobs.mobs) {
        if (m.health <= 0 || m.dying) continue;
        if (!canInteractWith(m)) continue;
        const dims = this.mobs?.getMobDimensions ? this.mobs.getMobDimensions(m.type) : { width: 0.9, height: 1.4 };
        const scale = m.isBaby ? 0.5 : 1.0;
        const center = m.mesh.position.clone().add(new THREE.Vector3(0, (dims.height || 1.2) * scale * 0.5, 0));
        const toMob = center.clone().sub(camPos);
        const dist = toMob.length();
        if (dist < closestDist) {
          toMob.normalize();
          if (toMob.dot(camDir) > 0.45) {
            closestDist = dist;
            interactMob = m;
          }
        }
      }
    }
    if (!interactMob) interactMob = this.targetMob;

    if (interactMob) {
      // A water bucket on a fish catches it, which is how every fish bucket is obtained. The mob-side
      // behaviours module owns breeding, taming and shearing; this is the bucket, and it is an item action.
      const caught = catchFish(this.inventory.getActiveItem(), interactMob.type);
      if (caught) {
        const index = this.mobs?.mobs ? this.mobs.mobs.indexOf(interactMob) : -1;
        if (index >= 0) this.mobs.mobs.splice(index, 1);
        if (interactMob.mesh) this.scene.remove(interactMob.mesh);
        const active = this.inventory.getActiveItem();
        if (this.player.gamemode !== 'creative') {
          if (active.count === 1) this.inventory.hotbar[this.inventory.activeSlot] = { id: caught, isBlock: false, count: 1 };
          else {
            this.inventory.consumeActiveItem();
            if (!this.inventory.addItem(caught, false, 1)) {
              this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), caught, false);
            }
          }
        } else if (![...this.inventory.hotbar, ...this.inventory.storage].some((item) => item?.id === caught)) {
          this.inventory.addItem(caught, false, 1);
        }
        this.sounds.playWater(); this.ui.updateHotbar();
        return;
      }
      // Armour stands: put armour on, swap it, or take it back with an empty hand.
      if (interactMob.type === 'armor_stand') {
        if (useOnArmorStand(interactMob, this.inventory, this.player.gamemode === 'creative')) this.ui?.updateHotbar?.();
        return;
      }
      if (this.mobs?.animalBehaviors?.interact(interactMob, this.player)) {
        this.ui?.updateHotbar?.();
        return;
      }
    }

    // An armour stand goes on top of the block under the crosshair, turned to face the player.
    const standItem = this.inventory.getActiveItem();
    if (standItem && !standItem.isBlock && standItem.id === 'armor_stand' && this.targetBlock) {
      const at = armorStandPlacement(this.targetBlock, this.player.position);
      if (at) {
        this.mobs.spawnMob('armor_stand', at.x, at.y, at.z, { yaw: at.yaw });
        if (this.player.gamemode !== 'creative') { this.inventory.consumeActiveItem(1); this.ui.updateHotbar(); }
        return;
      }
    }

    // A painting goes on the side of the block under the crosshair, never on a floor or a ceiling, and picks the
    // largest canvas that fits there (paintings.js). One that cannot hang is not consumed.
    const paintingItem = this.inventory.getActiveItem();
    if (paintingItem && !paintingItem.isBlock && paintingItem.id === 'painting' && this.targetBlock) {
      const facing = facingFromNormal(this.targetBlock.normal);
      const n = this.targetBlock.normal;
      const hung = facing && this.paintings.place({ x: this.targetBlock.x + n.x, y: this.targetBlock.y, z: this.targetBlock.z + n.z }, facing);
      if (hung && this.player.gamemode !== 'creative') {
        this.inventory.consumeActiveItem(1);
        this.ui.updateHotbar();
      }
      return;
    }

    // Active item action (throwing egg, boosting pig/strider with carrot/fungus on stick)
    if (this.mobs?.animalBehaviors?.handleActiveItemUse(this.player, this.inventory)) {
      return;
    }

    if (useSnowball(this)) return;
    if (useBarterPotion(this)) return;

    // Splash potions. This block was hard-coded to `splash_potion_of_weakness` -- plus `potion_weakness`,
    // which is not an item that exists -- so 39 splash potion items did nothing at all when used, and any
    // other one fell through to block placement. The effect now comes from POTION_DATA via the item id, the
    // radius is one rule rather than inline arithmetic, and the thrower is a target like anything else,
    // which is how a self-splash of Fire Resistance is meant to work.
    const splashItem = this.inventory.getActiveItem();
    if (isSplashPotion(splashItem?.id)) {
      if (this.player.gamemode !== 'creative') {
        this.inventory.consumeActiveItem(1);
        this.ui.updateHotbar();
      }
      this.sounds?.playBow?.();
      const splashPos = this.player.position.clone()
        .add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));
      throwSplashPotion(this, splashPos, splashItem.id);
      const tint = POTION_DATA[splashItem.id.slice('splash_'.length)]?.color;
      this.mobs?.spawnParticleBurst?.(splashPos, tint ? parseInt(tint.slice(1), 16) : 0x4a044e, 16);
      this.sounds?.playPotionSplash?.();
      return;
    }

    // Potion drinking. `potionUse.js` owns what a potion does; this only decides that the player is
    // using one. A splash or lingering potion is refused there rather than consumed with no effect.
    const potionItem = this.inventory.getActiveItem();
    if (potionItem && isDrinkablePotion(potionItem.id)) {
      const result = drinkPotion(potionItem.id, this.player, this.inventory, { gamemode: this.player.gamemode });
      if (result.drunk) {
        // There is no dedicated potion sound, so the milk-drink one is the fallback; picking the first
        // that exists rather than chaining `??` avoids calling both when the first returns undefined.
        (this.sounds?.playPotionDrink ?? this.sounds?.playMilk)?.();
        this.ui?.updateHotbar?.();
        this.ui?.updateStats?.();
        return;
      }
    }

    const bucketItem = this.inventory.getActiveItem();
    // Milk bucket drinking (clears status effects)
    if (bucketItem && bucketItem.id === 'milk_bucket') {
      if (this.player.gamemode !== 'creative') {
        this.inventory.consumeActiveItem(1);
        this.inventory.addItem('bucket', 1, false);
      }
      this.player.clearStatusEffect?.('poison');
      this.player.clearStatusEffect?.('wither');
      this.player.clearStatusEffect?.('mining_fatigue');
      this.player.clearStatusEffect?.('bad_omen');
      this.player.clearStatusEffect?.('darkness');
      this.player.clearStatusEffect?.('slowness');
      if (this.sounds?.playMilk) this.sounds.playMilk();
      this.ui?.updateHotbar?.();
      this.ui?.updateStats?.();
      return;
    }
    // Using an empty map fills it. Vanilla's gesture is a right-click anywhere, with no target: the map is
    // drawn from the world at that moment. This game's filled map is an inert item -- the cartographer already
    // sells explorer maps as `filled_map` -- so the honest version of the gesture is the conversion itself,
    // which is what makes the crafted map worth crafting.
    if (bucketItem && !bucketItem.isBlock && bucketItem.id === 'map') {
      this.inventory.consumeActiveItem?.();
      if (!this.inventory.addItem('filled_map', false, 1)) {
        this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), 'filled_map', false);
      }
      this.sounds.playClick?.();
      this.ui.updateHotbar();
      return;
    }
    // A bundle in hand gives one item back, into the world: that is how a full bundle empties, and it is the
    // only gesture vanilla gives it. The item goes where the player is looking, like any other drop.
    const held = takeFromBundle(bucketItem);
    if (held) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      const at = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).add(direction.multiplyScalar(0.6));
      this.inventory.hotbar[this.inventory.activeSlot] = { ...bucketItem, contents: held.contents };
      this.entities.spawnDroppedItem(at, held.item.id, Boolean(held.item.isBlock), held.item.count);
      this.sounds.playClick?.(); this.ui.updateHotbar();
      return;
    }
    // A fish bucket used on water releases the mob, which is the only way a caught fish gets back out. The
    // bucket is spent into an empty one; vanilla's rule is asymmetric, which is why this is not `isBucket`.
    const release = releaseFish(bucketItem);
    if (release) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      const hit = traceBucket(this.world, this.camera.position, direction, true);
      const intoWater = hit && hit.blockId === BLOCKS.WATER && this.world.getWaterLevel(hit.x, hit.y, hit.z) === 0;
      if (intoWater && this.mobs?.spawnMob) {
        this.mobs.spawnMob(release.mob, hit.x + 0.5, hit.y, hit.z + 0.5);
        const active = this.inventory.getActiveItem();
        if (this.player.gamemode !== 'creative') {
          if (active.count === 1) this.inventory.hotbar[this.inventory.activeSlot] = { id: release.replacement, isBlock: false, count: 1 };
          else {
            this.inventory.consumeActiveItem();
            if (!this.inventory.addItem(release.replacement, false, 1)) {
              this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0, 1, 0)), release.replacement, false);
            }
          }
        } else if (![...this.inventory.hotbar, ...this.inventory.storage].some((item) => item?.id === release.replacement)) {
          this.inventory.addItem(release.replacement, false, 1);
        }
        this.sounds.playWater(); this.ui.updateHotbar();
        this.refreshDirtyChunks();
      }
      // Nothing else a fish bucket can do: vanilla spends the click either way rather than placing a block.
      return;
    }
    if (isBucket(bucketItem)) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      const hit = traceBucket(this.world, this.camera.position, direction, bucketItem.id === 'bucket');
      const result = useBucket(this.world, this.inventory, this.player.gamemode, hit,
        id => this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0,1,0)), id, false),
        { dimension: this.world?.isNether || this.currentDimension === 'nether' ? 'nether' : this.currentDimension });
      if (result) {
        if (result.evaporated) {
          // Water poured in the Nether boils away (Water: "disappears if placed there with a bucket").
          this.sounds.playFizz?.() ?? this.sounds.playExtinguish?.();
          this.ui.addChatMessage?.('The water evaporated.', 'system');
        } else this.sounds.playWater();
        this.ui.updateHotbar();
        this.refreshDirtyChunks();
      }
      return;
    }
    // A glass bottle on water. This is the only way to get a water bottle, and a water bottle is the root of
    // every brewing recipe, so without it the brewing stand is furniture.
    if (isGlassBottle(bucketItem)) {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      // `true` for "empty": the trace stops at a water source block, which is what a bottle needs. The same
      // trace the bucket uses, because the reach and the source-only rule are identical.
      const hit = traceBucket(this.world, this.camera.position, direction, true);
      const filled = useGlassBottle(this.world, this.inventory, this.player.gamemode, hit,
        id => this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0,1,0)), id, false));
      if (filled) {
        this.sounds.playWater?.();
        this.ui.updateHotbar();
      }
      return;
    }
    // A brush on suspicious sand or gravel: vanilla's archaeology, and the only way a pottery sherd is found.
    // The block is *emptied* rather than mined, which is why the suspicious blocks themselves yield nothing.
    if (bucketItem && !bucketItem.isBlock && bucketItem.id === 'brush') {
      const direction = this.camera.getWorldDirection(new THREE.Vector3());
      const hit = traceBucket(this.world, this.camera.position, direction, true);
      const target = hit ? BLOCK_DEFS[hit.blockId] : null;
      const blockName = target?.name ? String(target.name).toLowerCase().replace(/[^a-z0-9]+/g, '_') : null;
      const found = blockName ? brushSuspiciousBlock(bucketItem, blockName, Math.random) : null;
      if (found) {
        // Vanilla leaves plain sand or gravel behind, never the suspicious block.
        this.world.setVoxel(hit.x, hit.y, hit.z,
          hit.blockId === BLOCKS.SUSPICIOUS_GRAVEL ? BLOCKS.GRAVEL : BLOCKS.SAND);
        if (!this.inventory.addItem(found.sherd, false, 1)) {
          this.entities.spawnDroppedItem(new THREE.Vector3(hit.x + 0.5, hit.y + 1, hit.z + 0.5), found.sherd, false);
        }
        if (this.player.gamemode === 'survival') {
          const wear = spendDurability(bucketItem, found.durabilityUsed);
          if (wear?.broke) {
            this.inventory.consumeActiveItem?.(1);
            this.ui?.addChatMessage?.('<span style="color:#ef4444;">Your Brush broke.</span>');
          }
        }
        this.sounds.playBrush?.() ?? this.sounds.playWater?.();
        this.ui.updateHotbar();
        this.refreshDirtyChunks();
      }
      return;
    }
    // Interacting with Villager / Wandering Trader
    if (this.targetMob && (this.targetMob.type === 'villager' || this.targetMob.type === 'wandering_trader')) {
      // Wiki: "Interacting with an employed villager or wandering trader opens the menu for trading with
      // them", and a nitwit, an unemployed villager or a baby cannot trade at all -- "it grunts and bobs
      // its head". Opening an empty window for one of those was the old behaviour.
      const refusal = tradeRefusal(this.targetMob);
      if (refusal) {
        this.sounds.playVillager();
        this.targetMob.refuseHeadBobTimer = 1.2;
        this.ui?.addChatMessage?.(refusal.reason === 'unemployed'
          ? 'This villager has no job site block, so it has nothing to trade.'
          : refusal.reason === 'nitwit'
            ? 'The nitwit grunts and shakes its head.'
            : refusal.reason === 'baby'
              ? 'Baby villagers cannot trade.'
              : 'This villager has no offers.', 'system');
        return;
      }
      this.sounds.playVillager();
      this.ui.openVillagerTrade(this.targetMob);
      return;
    }

    // Interacting with Zombie Villager (Curing Ritual)
    if (this.targetMob && this.targetMob.type === 'zombie_villager') {
      const activeItem = this.inventory.getActiveItem();
      if ((activeItem?.id === 'golden_apple' || activeItem?.id === 'enchanted_golden_apple') && (this.targetMob.hasWeakness || (this.targetMob.statusEffects && this.targetMob.statusEffects.weakness > 0))) {
        if (startZombieVillagerCure(this.targetMob, activeItem, this.sounds)) {
          if (this.player.gamemode !== 'creative') {
            this.inventory.consumeActiveItem(1);
            this.ui.updateHotbar();
          }
          this.sounds?.playLevelUp?.();
          this.ui?.addChatMessage?.('Zombie Villager began curing ritual!', 'system');
          return;
        }
      }
    }

    // Mount or interact with a nearby minecart or boat before anything block-related
    if (this.railSystem) {
      if (this.riding) {
        this.dismount();
        this.sounds.playClick();
        return;
      }
      const look = new THREE.Vector3();
      this.camera.getWorldDirection(look);
      const reach = this.player.position.clone().addScaledVector(look, 3);
      const vehicle = this.railSystem.nearestVehicle(reach, 3);
      if (vehicle) {
        let activeItem = this.inventory.getActiveItem();
        // Fueling furnace minecart with coal/charcoal
        if (vehicle.subType === 'furnace_minecart' && activeItem && (activeItem.id === 'coal' || activeItem.id === 'charcoal')) {
          this.railSystem.addFuel(vehicle, 3600);
          this.sounds.playPlace('stone');
          if (this.player.gamemode !== 'creative') {
            this.inventory.consumeActiveItem();
            this.ui.updateHotbar();
          }
          this.ui?.addChatMessage?.('Furnace Minecart fueled with coal.', 'system');
          return;
        }
        // Opening container on Chest Boat or Chest Minecart
        if ((vehicle.hasChest || vehicle.subType === 'chest_minecart') && (this.player.isSneaking || vehicle.subType === 'chest_minecart')) {
          this.sounds.playChestOpen?.();
          this.ui?.openVehicleChestModal?.(vehicle);
          return;
        }
        // Mounting
        this.riding = vehicle;
        if (!vehicle.rider) {
          vehicle.rider = this.player;
        } else if (!vehicle.passenger && !vehicle.hasChest) {
          vehicle.passenger = this.player;
        }
        this.sounds.playClick();
        this.ui?.addChatMessage?.(vehicle.kind === 'boat'
          ? 'Boarded the boat — W/S to row, A/D to steer, sneak to step off.'
          : 'Boarded the minecart — sneak to step off.', 'system');
        return;
      }
    }

    let activeItem = this.inventory.getActiveItem();
    // Auto-equip armor when right clicking in hand
    if (activeItem && this.inventory.getItemMeta(activeItem)?.armorSlot) {
      if (this.inventory.equipArmorItem(true)) {
        this.ui.updateHotbar();
        this.ui.updateStats();
        return;
      }
    }

    if (!this.targetBlock) return;

    const bX = this.targetBlock.x;
    const bY = this.targetBlock.y;
    const bZ = this.targetBlock.z;
    const clickedBlock = this.world.getVoxel(bX, bY, bZ);
    const clickedDef = BLOCK_DEFS[clickedBlock];
    if(clickedDef?.fence && tieHorseLeads(this.mobs,this.player,bX,bY,bZ))return;

    // Door interaction (swing open/close)
    if (clickedDef?.door) {
      if (this.doorManager) {
        const res = this.doorManager.toggleDoor(bX, bY, bZ);
        if (!res.success && res.reason) {
          this.ui?.addChatMessage?.(res.reason, 'system');
        }
      }
      return;
    }

    // Trapdoor interaction (swing open/close)
    if (clickedDef?.trapdoor) {
      if (this.doorManager) {
        const res = this.doorManager.toggleTrapdoor(bX, bY, bZ);
        if (!res.success && res.reason) {
          this.ui?.addChatMessage?.(res.reason, 'system');
        }
      }
      return;
    }

    const control=this.world.redstone.interact([bX,bY,bZ],this.player.isSneaking,this.inventory.getActiveItem());
    if(control){for(const slots of [this.inventory.hotbar,this.inventory.storage])for(let i=0;i<slots.length;i++)if(slots[i]?.count<=0)slots[i]=null;this.sounds.playClick();this.ui.addChatMessage(control,'system');this.ui.updateHotbar();this.refreshDirtyChunks();return;}

    // End Portal Frame: an Eye of Ender goes in, and the twelfth one lights the portal.
    //
    // `ender_eye` had zero references anywhere in `src/` before this, and `END_PORTAL_FRAME` was not a block
    // at all -- so the item could be brewed, held, and never used, and there was no way into the End.
    if (isFrame(clickedBlock)) {
      const heldForFrame = this.inventory.getActiveItem();
      if (heldForFrame?.id === 'ender_eye' && clickedBlock === BLOCKS.END_PORTAL_FRAME) {
        if (insertEye(this.world, bX, bY, bZ)) {
          if (this.player.gamemode !== 'creative') this.inventory.consumeActiveItem(1);
          this.sounds?.playClick?.();
          this.ui?.updateHotbar?.();
          this.refreshDirtyChunks();
          // The ring decides whether this was the last eye, so the interaction code does no layout maths.
          if (tryActivateAround(this.world, bX, bY, bZ)) {
            this.sounds?.playLevelUp?.();
            this.ui?.addChatMessage?.('The End portal awakens.', 'system');
          }
        }
      }
      // A filled frame, or a frame clicked with anything else, must not fall through to block placement.
      return;
    }

    // An Eye of Ender thrown in the open, rather than clicked onto a frame, is the locator. It sits after
    // the frame branch, so aiming at a frame still fills it.
    if (this.inventory.getActiveItem()?.id === 'ender_eye' && !this.targetBlock) {
      this.throwEnderEye();
      return true;
    }

    // Crafting Table interaction
    if (clickedBlock === BLOCKS.CRAFTING_TABLE) {
      this.sounds.playClick();
      this.ui.openCraftingTable();
      return;
    }

    // Furnace interaction
    if (clickedBlock === BLOCKS.FURNACE || clickedBlock === BLOCKS.LIT_FURNACE) {
      this.sounds.playClick();
      this.ui.openFurnace(bX, bY, bZ);
      return;
    }

    // Bed interaction (Sleep or explode in Nether)
    if (clickedBlock === BLOCKS.RED_BED_FOOT || clickedBlock === BLOCKS.RED_BED_HEAD) {
      if (this.bedManager) {
        this.bedManager.interact(bX, bY, bZ, this.player);
      }
      return;
    }

    // Chest interaction (Open Single or Double Chest GUI)
    // Sneaking while holding a placeable block places against the chest instead of opening it
    if (clickedBlock === BLOCKS.CHEST) {
      const isSneaking = Boolean(this.player.isSneaking || this.player.keys?.['ShiftLeft'] || this.player.keys?.['ShiftRight']);
      const isHoldingPlaceable = Boolean(
        activeItem && (
          activeItem.isBlock ||
          activeItem.id === BLOCKS.CHEST ||
          activeItem.id === 'chest' ||
          activeItem.id === 'red_bed' ||
          activeItem.id === 'bed' ||
          ITEMS[activeItem.id]?.isBlock ||
          BLOCK_DEFS[activeItem.id]
        )
      );
      if (!isSneaking || !isHoldingPlaceable) {
        if (this.chestManager) {
          this.chestManager.interact(bX, bY, bZ, this.player);
        }
        return;
      }
    }

    // Enchanting Table interaction (Open Enchanting Table GUI)
    if (clickedBlock === BLOCKS.ENCHANTING_TABLE) {
      if (this.enchantingManager) {
        this.enchantingManager.interact(bX, bY, bZ, this.player);
      } else if (this.ui?.openEnchantingTable) {
        this.ui.openEnchantingTable(bX, bY, bZ);
      }
      return;
    }

    // Brewing Stand interaction (Open Brewing GUI)
    if (clickedBlock === BLOCKS.BREWING_STAND) {
      this.sounds.playClick?.();
      this.ui.openBrewingStand(bX, bY, bZ);
      return;
    }

    // Anvil interaction (Open Anvil GUI)
    if (clickedBlock === BLOCKS.ANVIL || clickedBlock === BLOCKS.CHIPPED_ANVIL || clickedBlock === BLOCKS.DAMAGED_ANVIL) {
      this.sounds.playAnvil?.();
      this.ui.openAnvil(bX, bY, bZ);
      return;
    }

    // Grindstone interaction (Open Grindstone GUI)
    if (clickedBlock === BLOCKS.GRINDSTONE) {
      this.sounds.playClick?.();
      this.ui.openGrindstone(bX, bY, bZ);
      return;
    }

    // A bee nest or beehive, harvested with shears or a bottle. This is the only way to get honeycomb, and
    // honeycomb is what waxes copper, so without it seventy-seven recipes had no ingredient at all.
    if (isHive(clickedBlock)) {
      const outcome = this.hiveManager?.harvest(bX, bY, bZ, this.player);
      if (outcome?.ok) {
        this.sounds.playShears?.();
        this.ui?.updateHotbar?.();
        const name = ITEMS[outcome.product.id]?.name ?? outcome.product.id;
        this.ui?.addChatMessage?.(`Collected ${outcome.product.count} ${name}`, 'system');
      } else if (outcome?.reason) {
        // Worth saying out loud: "not full yet" and "use shears" are different problems, and a silent
        // refusal reads as a broken block.
        this.ui?.addChatMessage?.(outcome.reason, 'system');
      }
      return;
    }

    // Smithing Table interaction. The block had a `workstation` field and no interaction at all, so the
    // nine pieces of netherite gear had no way to exist outside the creative menu.
    if (clickedBlock === BLOCKS.SMITHING_TABLE) {
      this.sounds.playClick?.();
      this.ui.openSmithing(bX, bY, bZ);
      return;
    }

    // Beacon interaction (Open Beacon GUI)
    if (clickedBlock === BLOCKS.BEACON) {
      this.sounds.playClick?.();
      this.ui.openBeacon(bX, bY, bZ);
      return;
    }

    // TNT ignition on right click
    if (clickedBlock === BLOCKS.TNT) {
      this.world.setVoxel(bX, bY, bZ, BLOCKS.AIR);
      this.entities.spawnPrimedTNT(new THREE.Vector3(bX, bY, bZ), () => {
        this.loadChunksAroundPlayer();
      });
      const chunk = this.world.getChunk(Math.floor(bX / 16), Math.floor(bZ / 16));
      if (chunk) this.rebuildChunkMesh(chunk);
      return;
    }

    // Mature crop right-click harvest & replant
    if (this.farmingManager && this.farmingManager.harvest(bX, bY, bZ, this.player)) {
      return;
    }

    // Flint and steel ignition (Nether Portal activation or fire placement)
    if (activeItem && activeItem.id === 'flint_and_steel') {
      const norm = this.targetBlock.normal || { x: 0, y: 1, z: 0 };
      if (this.portalManager?.ignitePortal(this.world, bX, bY, bZ, norm, this.player)) {
        return;
      }
      const placeX = bX + (norm.x || 0);
      const placeY = bY + (norm.y !== undefined ? norm.y : 1);
      const placeZ = bZ + (norm.z || 0);
      if (this.world.getVoxel(placeX, placeY, placeZ) === BLOCKS.AIR) {
        this.world.setVoxel(placeX, placeY, placeZ, BLOCKS.FIRE);
        if (this.sounds?.playPortalIgnite) this.sounds.playPortalIgnite();
        else this.sounds.playPlace('grass');
        const cx = Math.floor(placeX / 16);
        const cz = Math.floor(placeZ / 16);
        const chunk = this.world.getChunk(cx, cz);
        if (chunk) this.rebuildChunkMesh(chunk);
        return;
      }
    }

    // Eating Food, Buckets, and Spawn Eggs
    activeItem = this.inventory.getActiveItem();

    // Farming: Hoe tilling on tillable ground (grass, dirt, podzol, mycelium, moss)
    if (activeItem && isHoe(activeItem.id) && this.farmingManager) {
      if (this.farmingManager.till(bX, bY, bZ, this.player)) {
        return;
      }
    }

    // Farming: Bone Meal fertilization on crops or grass
    if (activeItem && activeItem.id === 'bone_meal' && this.farmingManager) {
      if (this.farmingManager.applyBoneMeal(bX, bY, bZ, this.player)) {
        return;
      }
    }

    // Farming: Planting seeds and vegetable crops (wheat_seeds, carrot, potato)
    if (activeItem && getSeedCrop(activeItem.id) && this.farmingManager) {
      if (this.farmingManager.plant(bX, bY, bZ, activeItem.id, this.player)) {
        return;
      }
    }

    // Place building from Building Library
    if (activeItem && (activeItem.isBuilding || (typeof activeItem.id === 'string' && activeItem.id.startsWith('building_')))) {
      const norm = this.targetBlock.normal || { x: 0, y: 1, z: 0 };
      const placeX = bX + (norm.x || 0);
      const placeY = bY + (norm.y !== undefined ? (norm.y > 0 ? 1 : (norm.y < 0 ? -1 : 0)) : 1);
      const placeZ = bZ + (norm.z || 0);

      const buildingId = activeItem.buildingId || (typeof activeItem.id === 'string' && activeItem.id.startsWith('building_') ? activeItem.id.replace('building_', '') : activeItem.id);
      const struct = BuildingLibrary.getBuilding(buildingId);
      if (struct) {
        const defaultParams = {};
        if (Array.isArray(struct.parameters)) {
          for (const p of struct.parameters) {
            defaultParams[p.id || p.name] = p.default ?? p.defaultValue ?? 10;
          }
        }
        BuildingLibrary.executeBuildingBuild(struct, { x: placeX, y: placeY, z: placeZ }, defaultParams, this.world);
        this.sounds.playPlace('stone');
        this.loadChunksAroundPlayer();
        this.refreshDirtyChunks();
        this.ui?.addChatMessage?.(`Placed building "${struct.name}"`, 'system');
      }
      return;
    }
    if (activeItem?.id === 'redstone' && !activeItem.isBlock) activeItem = { ...activeItem, id: BLOCKS.REDSTONE_WIRE, isBlock: true };
    if ((activeItem?.id === 'chest' || activeItem?.id === BLOCKS.CHEST || ITEMS[activeItem?.id]?.blockId === BLOCKS.CHEST) && !activeItem.isBlock) {
      activeItem = { ...activeItem, id: BLOCKS.CHEST, isBlock: true };
    }
    if (activeItem && !activeItem.isBlock) {
      // Experience Bottle throw & shatter
      if (activeItem.id === 'experience_bottle') {
        const look = new THREE.Vector3();
        this.camera.getWorldDirection(look);
        const spawnPos = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(look, 2.0);
        const xpPoints = 3 + Math.floor(Math.random() * 9); // 3-11 XP points (Minecraft wiki)
        if (this.entities?.spawnXpOrbs) {
          this.entities.spawnXpOrbs(spawnPos, xpPoints);
        }
        this.sounds.playBowShoot?.();
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
        return;
      }

      const it = ITEMS[activeItem.id];
      if (it && it.type === 'food') {
        // A golden apple is the classic emergency item, and its effects were missing entirely: eating one
        // gave nothing but food. Applied before the hunger restore so the two cannot diverge.
        if (isGoldenApple(activeItem.id)) applyGoldenApple(this.player, activeItem.id);
        if (this.player.hunger < this.player.maxHunger || this.player.health < this.player.maxHealth || this.player.gamemode === 'creative') {
          this.sounds.playEat();
          // `Player.eatFood` owns this: it calls the model in `hunger.js` and keeps the player's own fields in
          // sync with it, which is the arrangement the rest of the player already uses for exhaustion and the
          // per-tick model. Doing the arithmetic here instead -- which this path did originally, adding hunger
          // and two health and never touching saturation -- left the hunger system spending something eating
          // never granted.
          //
          // The item's own saturation is preferred and `foodData.js` answers for the items that do not declare
          // one; that table is generated from vanilla's data and is the same source the Inspector checks.
          const saturation = it.saturation ?? FOODS[activeItem.id]?.saturation ?? 0;
          this.player.eatFood?.(it.food || 4, saturation);
          // Vanilla grants no instant health for eating: health comes back from the saturation boost, which
          // `hunger.js` regenerates at 1.5 saturation per point, the wiki's own figure.
          // Some foods carry effects. `golden_apple` and `enchanted_golden_apple` are the two in vanilla,
          // and without this their Absorption, Regeneration, Resistance and Fire Resistance did nothing:
          // an enchanted apple was a slightly worse cooked porkchop.
          if (Array.isArray(it.effects)) {
            for (const [effect, duration, level] of it.effects) {
              this.player.applyStatusEffect?.(effect, duration, level ?? 1);
            }
          }
          if (this.player.gamemode !== 'creative') {
            this.inventory.consumeActiveItem();
            this.ui.updateHotbar();
          }
          return;
        }
      }


      // A firework rocket is launched. `spawnFireworkRocket` was already fully built -- mesh, rising trail,
      // burst and launch sound -- and was called from exactly one place, a tournament celebration, so the
      // item itself did nothing at all when used.
      if (launchFirework(this, activeItem?.id)) return;

      if (!activeItem?.isBlock && activeItem && ['minecart', 'chest_minecart', 'furnace_minecart', 'hopper_minecart', 'tnt_minecart', 'oak_boat', 'chest_boat'].includes(activeItem.id)) {
      const norm = this.targetBlock.normal || { x: 0, y: 1, z: 0 };
      const px = bX + norm.x + 0.5;
      const py = bY + norm.y + 0.05;
      const pz = bZ + norm.z + 0.5;

      if (activeItem.id === 'oak_boat' || activeItem.id === 'chest_boat') {
        this.railSystem.spawnBoat([px, py, pz], { subType: activeItem.id, hasChest: activeItem.id === 'chest_boat' });
        this.ui?.addChatMessage?.(activeItem.id === 'chest_boat' ? 'Boat with Chest placed.' : 'Boat placed. Right-click it to ride.', 'system');
      } else {
        // A cart needs rail under it; offer to lay one if there is none.
        if (!this.railSystem.nearestRail([bX, bY, bZ], 1)) {
          this.world.setVoxel(bX, bY, bZ, BLOCKS.RAIL);
          this.world.redstone.configure([bX, bY, bZ], 0);
          this.refreshDirtyChunks();
        }
        this.railSystem.spawnCart([px, py, pz], { subType: activeItem.id });
        const name = ITEMS[activeItem.id]?.name || 'Minecart';
        this.ui?.addChatMessage?.(`${name} placed. Right-click to interact.`, 'system');
      }
      this.sounds.playPlace('stone');
      if (this.player.gamemode !== 'creative') {
        this.inventory.consumeActiveItem();
        this.ui.updateHotbar();
      }
      return;
    }

    // Spawn Eggs
      if ((it && it.type === 'spawn_egg') || activeItem.isSpawnEgg || activeItem.customMobId || (typeof activeItem.id === 'string' && activeItem.id.startsWith('spawn_egg_'))) {
        const customMobId = activeItem.customMobId || (typeof activeItem.id === 'string' && activeItem.id.startsWith('spawn_egg_') ? activeItem.id.replace('spawn_egg_', '') : null);
        const customDef = activeItem.mobDef || (customMobId ? MobLibrary.getMob(customMobId) : null);
        const mobType = it?.mob || (typeof activeItem.id === 'string' ? activeItem.id.replace('_spawn_egg', '') : 'zombie');
        const norm = this.targetBlock.normal || { x: 0, y: 1, z: 0 };
        const sx = bX + norm.x + 0.5;
        const sy = bY + norm.y + 0.05;
        const sz = bZ + norm.z + 0.5;

        if (customDef) {
          this.mobs.spawnCustomMob(customDef, sx, sy, sz);
          this.entities?.spawnEndermanParticles(new THREE.Vector3(sx, sy + 0.5, sz), 10);
        } else if (mobType === 'villager') this.mobs.spawnVillager(sx, sy, sz);
        else if (mobType === 'iron_golem') this.mobs.spawnIronGolem(sx, sy, sz);
        else if (mobType === 'pillager') this.mobs.spawnPillager(sx, sy, sz);
        else if (mobType === 'zombie') this.mobs.spawnZombie(sx, sy, sz);
        else if (mobType === 'skeleton') this.mobs.spawnSkeleton(sx, sy, sz);
        else if (mobType === 'creeper') this.mobs.spawnCreeper(sx, sy, sz);
        else if (mobType === 'pig') this.mobs.spawnPig(sx, sy, sz);
        else if (mobType === 'chicken') this.mobs.spawnChicken(sx, sy, sz);
        else if (mobType === 'cow') this.mobs.spawnCow(sx, sy, sz);
        else if (mobType === 'sheep') this.mobs.spawnSheep(sx, sy, sz);
        else if (mobType === 'salmon') this.mobs.spawnSalmon(sx, sy, sz);
        else if (mobType === 'dolphin') this.mobs.spawnDolphin(sx, sy, sz);
        else if (mobType === 'octopus') this.mobs.spawnOctopus(sx, sy, sz);
        else if (mobType === 'axolotl') this.mobs.spawnAxolotl(sx, sy, sz);
        else if(mobType==='mule'){const mob=this.mobs.spawnMule(sx,sy,sz);if(Math.random()<.2){mob.isBaby=true;mob.babyGrowthTimer=1200;mob.mesh.scale.setScalar(.5);}}
        else this.mobs.spawnMob(mobType, sx, sy, sz);

        this.sounds.playPop();
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
        return;
      }
    }

    // Place Bed (occupies 2 blocks: foot and head)
    if (activeItem && (String(activeItem.id).endsWith('_bed') || activeItem.id === 'bed' || activeItem.id === BLOCKS.RED_BED_FOOT) && this.targetBlock.normal) {
      const placeX = bX + this.targetBlock.normal.x;
      const placeY = bY + this.targetBlock.normal.y;
      const placeZ = bZ + this.targetBlock.normal.z;

      // Determine horizontal facing direction (0: East +X, 1: West -X, 2: South +Z, 3: North -Z)
      const look = new THREE.Vector3();
      this.camera.getWorldDirection(look);
      let dir = 3;
      if (Math.abs(look.x) > Math.abs(look.z)) {
        dir = look.x > 0 ? 0 : 1;
      } else {
        dir = look.z > 0 ? 2 : 3;
      }

      const res = this.bedManager.placeBed(this.world, [placeX, placeY, placeZ], dir);
      if (res.success) {
        this.sounds.playPlace('wood');
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
      } else {
        this.ui?.addChatMessage?.(res.reason || 'Bed cannot be placed here', 'error');
      }
      return;
    }

    // Place Door (occupies 2 blocks tall: bottom and top)
    const isDoorToPlace = Boolean(
      activeItem && (
        activeItem.id === 'oak_door' ||
        activeItem.id === 'iron_door' ||
        activeItem.id === BLOCKS.OAK_DOOR ||
        activeItem.id === BLOCKS.IRON_DOOR ||
        activeItem.blockId === BLOCKS.OAK_DOOR ||
        activeItem.blockId === BLOCKS.IRON_DOOR ||
        ITEMS[activeItem.id]?.blockId === BLOCKS.OAK_DOOR ||
        ITEMS[activeItem.id]?.blockId === BLOCKS.IRON_DOOR
      )
    );

    if (isDoorToPlace && this.targetBlock.normal) {
      const placeX = bX + this.targetBlock.normal.x;
      const placeY = bY + this.targetBlock.normal.y;
      const placeZ = bZ + this.targetBlock.normal.z;

      const look = new THREE.Vector3();
      this.camera.getWorldDirection(look);
      let dir = 3;
      if (Math.abs(look.x) > Math.abs(look.z)) {
        dir = look.x > 0 ? 0 : 1;
      } else {
        dir = look.z > 0 ? 2 : 3;
      }

      const isIron = Boolean(
        activeItem.id === 'iron_door' ||
        activeItem.id === BLOCKS.IRON_DOOR ||
        activeItem.blockId === BLOCKS.IRON_DOOR ||
        ITEMS[activeItem.id]?.blockId === BLOCKS.IRON_DOOR
      );

      const res = this.doorManager.placeDoor(this.world, [placeX, placeY, placeZ], dir, isIron);
      if (res.success) {
        this.sounds.playPlace(isIron ? 'metal' : 'wood');
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
      } else {
        this.ui?.addChatMessage?.(res.reason || 'Door cannot be placed here', 'error');
      }
      return;
    }

    // Place Chest (Single or Double Chest)
    const isChestToPlace = Boolean(
      activeItem && (
        activeItem.id === BLOCKS.CHEST ||
        activeItem.id === 'chest' ||
        activeItem.blockId === BLOCKS.CHEST ||
        ITEMS[activeItem.id]?.blockId === BLOCKS.CHEST
      )
    );

    if (isChestToPlace && this.targetBlock.normal) {
      const placeX = bX + this.targetBlock.normal.x;
      const placeY = bY + this.targetBlock.normal.y;
      const placeZ = bZ + this.targetBlock.normal.z;

      // Check player bounding box collision before placing
      const playerPos = this.player.position;
      const hw = this.player.width / 2;
      const pMinX = playerPos.x - hw;
      const pMaxX = playerPos.x + hw;
      const pMinY = playerPos.y;
      const pMaxY = playerPos.y + this.player.height;
      const pMinZ = playerPos.z - hw;
      const pMaxZ = playerPos.z + hw;

      const collidesWithPlayer = (
        placeX + 1 > pMinX && placeX < pMaxX &&
        placeY + 1 > pMinY && placeY < pMaxY &&
        placeZ + 1 > pMinZ && placeZ < pMaxZ
      );

      if (!collidesWithPlayer) {
        const facing = this.chestManager ? this.chestManager.getFacingFromCamera(this.camera) : 0;
        if (this.chestManager) {
          this.chestManager.placeChest(this.world, [placeX, placeY, placeZ], facing);
        } else {
          this.world.setVoxel(placeX, placeY, placeZ, BLOCKS.CHEST);
        }
        this.sounds.playPlace('wood');
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
        const cx = Math.floor(placeX / 16);
        const cz = Math.floor(placeZ / 16);
        const chunk = this.world.getChunk(cx, cz);
        if (chunk) this.rebuildChunkMesh(chunk);
        this.refreshDirtyChunks();
        return;
      }
      return;
    }

    // Place Block on adjacent targeted face
    if (activeItem && (activeItem.isBlock || BLOCK_DEFS[activeItem.id] || ITEMS[activeItem.id]?.isBlock) && this.targetBlock.normal) {
      const placeX = bX + this.targetBlock.normal.x;
      const placeY = bY + this.targetBlock.normal.y;
      const placeZ = bZ + this.targetBlock.normal.z;

      // Check player bounding box collision before placing
      const playerPos = this.player.position;
      const hw = this.player.width / 2;
      const pMinX = playerPos.x - hw;
      const pMaxX = playerPos.x + hw;
      const pMinY = playerPos.y;
      const pMaxY = playerPos.y + this.player.height;
      const pMinZ = playerPos.z - hw;
      const pMaxZ = playerPos.z + hw;

      const collidesWithPlayer = (
        placeX + 1 > pMinX && placeX < pMaxX &&
        placeY + 1 > pMinY && placeY < pMaxY &&
        placeZ + 1 > pMinZ && placeZ < pMaxZ
      );

      if (!collidesWithPlayer) {
        // Name- or id-keyed, whichever this game used for the item: see lockIdForPlacement.
        const blockIdToPlace = blockIdForPlacement(activeItem);

        this.world.setVoxel(placeX, placeY, placeZ, blockIdToPlace);
        this.worldSync?.onBlockPlaced(placeX, placeY, placeZ, blockIdToPlace);
        this.beaconManager?.onBlockPlaced(placeX, placeY, placeZ, blockIdToPlace);
        this.hiveManager?.onBlockPlaced(placeX, placeY, placeZ, blockIdToPlace);
        const look=this.camera.getWorldDirection(new THREE.Vector3());
        const dir=Math.abs(look.y)>.65?(look.y>0?2:3):Math.abs(look.x)>Math.abs(look.z)?(look.x>0?0:1):(look.z>0?4:5);
        this.world.redstone.configure([placeX,placeY,placeZ],dir);

        const def = BLOCK_DEFS[blockIdToPlace];
        this.sounds.playPlace(def ? def.sound : 'wood');

        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }

        // Check Wither summon building
        this.bossManager?.checkWitherSummon(placeX, placeY, placeZ);

        // Sculk vibration check on block place
        this.deepDarkManager?.onPlayerVibration(this.player.position, 1.0);

        // Rebuild impacted chunks
        const cx = Math.floor(placeX / 16);
        const cz = Math.floor(placeZ / 16);
        const chunk = this.world.getChunk(cx, cz);
        if (chunk) this.rebuildChunkMesh(chunk);
      }
    }
  }

  /**
   * Pick block.
   *
   * In Creative this conjures a stack of whatever you are looking at. In Survival it may only **select**
   * something you already own -- vanilla's pick-block moves a matching stack to the active slot, and creates
   * nothing. This used to write `count: 64` unconditionally, so middle-clicking a diamond block in Survival
   * produced 64 diamonds out of nothing.
   */
  handleMiddleClick() {
    if (!this.targetBlock || this.targetBlock.blockId === BLOCKS.AIR) return false;
    const wanted = this.targetBlock.blockId;

    if (this.player.hasCreativeAbilities?.() ?? this.player.gamemode === 'creative') {
      this.inventory.hotbar[this.inventory.activeSlot] = { id: wanted, isBlock: true, count: 64 };
      this.sounds.playClick();
      this.ui.updateHotbar();
      return true;
    }

    // Survival: find an owned stack of the same block and move it to the active slot. Nothing new is made.
    const slots = [this.inventory.hotbar, this.inventory.storage];
    const active = this.inventory.activeSlot;
    for (const list of slots) {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item) continue;
        if (item.id !== wanted) continue;
        if (list === this.inventory.hotbar && i === active) return true;
        const swap = this.inventory.hotbar[active];
        if (list === this.inventory.hotbar) {
          this.inventory.hotbar[active] = item;
          this.inventory.hotbar[i] = swap;
        } else {
          // From storage into the hotbar: the storage slot takes whatever was in the hand.
          this.inventory.hotbar[active] = item;
          list[i] = swap;
        }
        this.sounds.playClick();
        this.ui.updateHotbar();
        return true;
      }
    }
    // Not owned. Vanilla does nothing, and so does this.
    return false;
  }

  /**
   * The one place the game mode changes.
   *
   * Both the pause-menu button and `/gamemode` come through here, so they cannot disagree. The inventory is
   * deliberately untouched: Minecraft preserves items across a mode change.
   */
  setGameMode(mode) {
    const next = normaliseGameMode(mode);
    const result = this.player.setGameMode?.(next) ?? { previous: this.player.gamemode, mode: next, changed: true };
    // Switching to Creative turns cheats on too (settingsWith); switching back leaves them as they are.
    this.settings = settingsWith(this.settings, { gameMode: next });
    this.ui?.refreshPauseMenuLabels?.();
    if (next === 'creative' && this.ui?.openCreativeInventory) this.ui.openCreativeInventory();
    return result;
  }

  /** May the Agent Terminal be opened, and may the item-granting commands run? */
  allowsAgentTerminal() {
    return allowsAgentTerminal(this.settings);
  }

  /**
   * Throw the held item out in front of the player.
   *
   * `wholeStack` is Control+Q, which throws the stack as one drop, exactly as vanilla does; plain Q throws a
   * single item and leaves the rest.
   *
   * @returns {number} how many items were dropped
   */
  dropHeldItem(wholeStack = false) {
    const active = this.inventory.getActiveItem();
    if (!active) return 0;
    const requested = wholeStack ? Math.max(1, active.count ?? 1) : 1;

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const spawnPos = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(dir, 0.8);

    this.entities.spawnDroppedItem(spawnPos, active.id, active.isBlock, requested);
    this.sounds.playClick();

    for (let i = 0; i < requested; i++) this.inventory.consumeActiveItem();
    this.ui.updateHotbar();
    return requested;
  }

  /**
   * Spawn what a broken block yields.
   *
   * One call rather than one drop, because a block can give more than one thing: an oak leaf gives an
   * apple, a stick and a sapling on separate rolls, and a grass plant gives a seed. The list comes from
   * `blockDrops`, which owns both the always-drop and the probabilistic table.
   *
   * The argument order is the part worth being careful about. This used to pass the drop's `count` field
   * as the third argument -- where `isBlock` belongs -- so it was always `undefined` and every drop
   * defaulted to `isBlock: true`. For the 56 blocks whose drop is an item rather than a block, which is
   * every ore and every door, breaking one by hand put an item in the inventory that claimed to be a
   * block. The explosion path in `entities.js` passed the right field and was correct, so the same
   * diamond was a block when mined and an item when blown up.
   */
  spawnBlockDrops(pos, blockId) {
    for (const drop of blockDrops(blockId)) {
      this.entities.spawnDroppedItem(pos, drop.id, drop.isBlock, drop.count ?? 1);
    }
  }

  breakTargetBlock() {
    if (!this.targetBlock) return;
    const { x, y, z, blockId } = this.targetBlock;
    if (blockId === BLOCKS.AIR || blockId === BLOCKS.BEDROCK) return;
    // Building Studio's invisible ground can be aimed at (to build on) but not broken.
    if (y < this.world.floorY) return;

    // Mining a block costs 0.005 exhaustion in vanilla. Charged after the guards, so breaking air
    // or bedrock -- neither of which is a real break -- does not tire the player.
    this.player.addExhaustion?.(0.005);
    if (this.player.gamemode === 'survival' && [BLOCKS.GOLD_BLOCK, BLOCKS.GOLD_ORE, BLOCKS.CHEST].includes(blockId)) {
      angerPiglins(this.mobs, this.player.position);
    }

    const def = BLOCK_DEFS[blockId];

    // The dragon egg teleports instead of breaking. `BLOCK_DEFS` has declared `dragonEgg: true` since the
    // block was added and nothing read it, so the egg could be mined like any other block -- vanilla's egg
    // is the one block in the game that jumps away when you hit it, which is what makes it awkward to
    // collect rather than merely rare.
    if (blockId === BLOCKS.DRAGON_EGG) {
      const isSolid = (id) => id !== BLOCKS.AIR && BLOCK_DEFS[id]?.solid !== false;
      const isValid = makeEggPlacementCheck((vx, vy, vz) => this.world.getVoxel(vx, vy, vz), BLOCKS.AIR, isSolid);
      const to = dragonEggDestination({ origin: { x, y, z }, random: this.player.random ?? Math.random, isValid });
      if (to) {
        this.world.setVoxel(x, y, z, BLOCKS.AIR);
        this.world.setVoxel(to.x, to.y, to.z, BLOCKS.DRAGON_EGG);
        this.sounds?.playTeleport?.() ?? this.sounds?.playClick?.();
        return;
      }
      // No valid spot after a thousand attempts: fall through and let it break, rather than making the block
      // permanently unbreakable.
    }

    this.sounds.playBreak(def ? def.sound : 'stone');

    // Recompute here rather than trusting a flag from updateMining: a block can also be
    // broken by paths that never went through the mining loop.
    const heldAtBreak = this.inventory.getActiveItem();
    const heldIdAtBreak = heldAtBreak && !heldAtBreak.isBlock ? heldAtBreak.id : null;
    const heldDefAtBreak = heldIdAtBreak ? ITEMS[heldIdAtBreak] : null;
    const wrongTool = this.player.gamemode === 'survival'
      && harvestsNothing(blockId, heldDefAtBreak, heldIdAtBreak);
    if (wrongTool) {
      const need = harvestRequirementText(blockId);
      this.ui?.addChatMessage?.(`<span style="color:#f59e0b;">You need ${need || 'the right tool'} to collect that.</span>`);
    }

    // Spawn block debris particles
    this.entities.spawnBlockParticles(new THREE.Vector3(x, y, z), blockId);

    // In survival, drop item
    if (this.player.gamemode === 'survival') {
      const cropInfo = getCropInfo(blockId);
      if (cropInfo) {
        if (this.farmingManager) {
          this.farmingManager.handleCropBreak(x, y, z, blockId, this.player.gamemode);
        }
      } else {
        // A block broken with the wrong tool yields nothing. This is the harvest table's
        // verdict rather than a per-block special case.
        if (!wrongTool) {
          this.spawnBlockDrops(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), blockId);
        }
      }

      // An infested block releases its silverfish where it stood. The block definitions mark which
      // ones with `silverfish: true` rather than this being an id list, so a new infested variant is
      // data only. It spawns regardless of tool and gamemode, as in vanilla: the silverfish is the
      // block's contents, not its drop.
      if (BLOCK_DEFS[blockId]?.silverfish && this.mobs?.spawnSilverfish) {
        this.mobs.spawnSilverfish(x + 0.5, y, z + 0.5);
      }

      // Ore experience drops matching Minecraft wiki
      const dropPos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
      if (this.entities?.spawnXpOrbs) {
        let oreXp = 0;
        if (blockId === BLOCKS.COAL_ORE) oreXp = Math.floor(Math.random() * 3); // 0-2 XP
        else if (blockId === BLOCKS.DIAMOND_ORE) oreXp = 3 + Math.floor(Math.random() * 5); // 3-7 XP
        else if (blockId === BLOCKS.EMERALD_ORE) oreXp = 3 + Math.floor(Math.random() * 5); // 3-7 XP
        else if (blockId === BLOCKS.REDSTONE_ORE || blockId === BLOCKS.LIT_REDSTONE_ORE) oreXp = 1 + Math.floor(Math.random() * 5); // 1-5 XP
        else if (blockId === BLOCKS.LAPIS_ORE) oreXp = 2 + Math.floor(Math.random() * 4); // 2-5 XP
        else if (blockId === BLOCKS.NETHER_QUARTZ_ORE) oreXp = 2 + Math.floor(Math.random() * 4); // 2-5 XP
        if (oreXp > 0) this.entities.spawnXpOrbs(dropPos, oreXp);
      }
    } else {
      if (this.farmingManager) {
        this.farmingManager.unregisterCrop(x, y, z);
      }
    }

    // Wear the tool. A block was broken -- the guards above already rejected air and bedrock -- so the
    // held tool spends a point whether or not it was the right tool for the job, which is vanilla's
    // behaviour: mining stone with a sword still damages the sword.
    //
    // Charged in creative too would be wrong, so it is gated on survival along with the drops. The
    // durability module handles unbreaking and reports whether the tool broke; clearing the slot is this
    // layer's job, because breaking a stack is an inventory event.
    if (heldAtBreak && !heldAtBreak.isBlock && this.player.gamemode === 'survival') {
      const wear = spendDurability(heldAtBreak, 1);
      if (wear.broke) {
        const name = heldDefAtBreak?.name || heldIdAtBreak || 'Tool';
        this.inventory.consumeActiveItem?.(1);
        this.ui?.addChatMessage?.(`<span style="color:#ef4444;">Your ${name} broke.</span>`);
        this.sounds?.playBreak?.('wood');
      }
    }

    if (blockId === BLOCKS.OBSIDIAN || blockId === BLOCKS.NETHER_PORTAL) {
      if (this.portalManager?.onBlockBroken(x, y, z, blockId)) {
        // Contiguous portal blocks shattered
      }
    }

    if (blockId === BLOCKS.FARMLAND || blockId === BLOCKS.FARMLAND_MOIST) {
      if (this.farmingManager) this.farmingManager.unregisterFarmland(x, y, z);
    }

    if (blockId === BLOCKS.FURNACE || blockId === BLOCKS.LIT_FURNACE) {
      if (this.furnaceManager) this.furnaceManager.onBlockBroken(x, y, z);
    }

    // A broken brewing stand drops what it was holding, as its block entity does in vanilla. The stand
    // itself is already a block drop; this is the bottles, the ingredient and any charges left.
    if (blockId === BLOCKS.BREWING_STAND) {
      this.dropBrewingStandContents(x, y, z);
    }

    // A broken beacon or conduit stops granting anything. Checked before the door, bed and chest branches
    // below, because those return early and a beacon must unregister whichever branch handles the break.
    this.beaconManager?.onBlockBroken(x, y, z);
    this.hiveManager?.onBlockBroken(x, y, z);

    if (blockId === BLOCKS.CHEST) {
      if (this.chestManager) this.chestManager.onBlockBroken(x, y, z);
    }

    if (BLOCK_DEFS[blockId]?.door || BLOCK_DEFS[blockId]?.trapdoor) {
      if (this.doorManager) this.doorManager.onBlockBroken(x, y, z);
      this.world.setVoxel(x, y, z, BLOCKS.AIR);
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const chunk = this.world.getChunk(cx, cz);
      if (chunk) this.rebuildChunkMesh(chunk);
      this.targetBlock = null;
      this.targetBoxMesh.visible = false;
      this.breakOverlayMesh.visible = false;
      return;
    }

    if (blockId === BLOCKS.RED_BED_FOOT || blockId === BLOCKS.RED_BED_HEAD) {
      if (this.bedManager) this.bedManager.onBlockBroken(x, y, z);
      this.world.setVoxel(x, y, z, BLOCKS.AIR);
      const cx = Math.floor(x / 16);
      const cz = Math.floor(z / 16);
      const chunk = this.world.getChunk(cx, cz);
      if (chunk) this.rebuildChunkMesh(chunk);
      this.targetBlock = null;
      this.targetBoxMesh.visible = false;
      this.breakOverlayMesh.visible = false;
      return;
    }

    // Set air in world (or restore water if breaking a water plant underwater)
    const replacement = (def?.waterPlant && y < this.world.seaLevel) ? BLOCKS.WATER : BLOCKS.AIR;
    this.world.setVoxel(x, y, z, replacement);
    this.worldSync?.onBlockBroken(x, y, z);

    // Sculk vibration check on block break
    this.deepDarkManager?.onPlayerVibration(this.player.position, 1.0);

    // Rebuild chunk mesh
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const chunk = this.world.getChunk(cx, cz);
    if (chunk) this.rebuildChunkMesh(chunk);

    this.targetBlock = null;
    this.targetBoxMesh.visible = false;
    this.breakOverlayMesh.visible = false;
  }

  /**
   * Drop everything a broken brewing stand was holding.
   *
   * Vanilla: "When broken, it also drops all of its contents." Without this the stand was the one
   * container in the game that ate what was inside it -- the furnace, the chest and the bed all drop
   * theirs. Bottles, the ingredient stack and one blaze powder per remaining charge are spawned at the
   * block, and the stand is removed from the manager so reopening the position starts empty.
   *
   * @param {number} x @param {number} y @param {number} z
   */
  dropBrewingStandContents(x, y, z) {
    const stand = this.ui?.brewingManager?.removeStand(x, y, z);
    if (!stand) return;
    const at = this.player.position.clone().add(new THREE.Vector3(0, 1, 0));
    const drop = (id, count) => {
      if (id && count > 0) this.entities.spawnDroppedItem(at, id, false, count);
    };
    for (const bottle of stand.bottles) drop(bottle?.id, bottle?.count ?? 0);
    drop(stand.ingredient?.id, stand.ingredient?.count ?? 0);
    // Charges become whole pieces of blaze powder, which is what vanilla drops: the stand's fuel is a
    // burn-time counter, and a partly spent piece comes back as a piece.
    if (stand.fuel > 0) drop('blaze_powder', Math.ceil(stand.fuel / stand.maxFuel));
    // The open window was showing this stand, so it must stop showing it.
    if (this.ui?.brewingStand === stand) this.ui.closeBrewingModal?.();
  }

  updateRaycast() {
    const camPos = this.camera.position;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    // 1. Raycast against Mobs first
    this.targetMob = null;
    let closestMobDist = Infinity;
    for (const mob of this.mobs.mobs) {
      if (mob.health <= 0 || mob.dying) continue;
      if(['squid','glow_squid'].includes(mob.type)){const distance=squidRayDistance(mob,camPos,camDir);if(distance<closestMobDist){closestMobDist=distance;this.targetMob=mob;}continue;}
      const dims = this.mobs?.getMobDimensions ? this.mobs.getMobDimensions(mob.type) : { width: 0.9, height: 1.4 };
      const scale = mob.isBaby ? (['squid','glow_squid'].includes(mob.type)?.625:.5) : 1.0;
      const width = (dims.width || 0.8) * scale;
      const height = (dims.height || 1.4) * scale;
      const center = mob.mesh.position.clone().add(new THREE.Vector3(0, height * 0.5, 0));
      const toMob = center.clone().sub(camPos);
      const proj = toMob.dot(camDir);
      if (proj > 0 && proj < 4.5) {
        const perpDist = toMob.clone().sub(camDir.clone().multiplyScalar(proj)).length();
        const hitRadius = Math.max(0.85, (width * 0.5) + 0.4);
        if (perpDist < hitRadius && proj < closestMobDist) {
          closestMobDist = proj;
          this.targetMob = mob;
        }
      }
    }

    // 2. Fast Voxel DDA Raycast for blocks
    let px = camPos.x;
    let py = camPos.y;
    let pz = camPos.z;

    let x = Math.floor(px);
    let y = Math.floor(py);
    let z = Math.floor(pz);

    const stepX = camDir.x > 0 ? 1 : -1;
    const stepY = camDir.y > 0 ? 1 : -1;
    const stepZ = camDir.z > 0 ? 1 : -1;

    const tDeltaX = Math.abs(1.0 / camDir.x);
    const tDeltaY = Math.abs(1.0 / camDir.y);
    const tDeltaZ = Math.abs(1.0 / camDir.z);

    let tMaxX = (stepX > 0) ? (x + 1 - px) * tDeltaX : (px - x) * tDeltaX;
    let tMaxY = (stepY > 0) ? (y + 1 - py) * tDeltaY : (py - y) * tDeltaY;
    let tMaxZ = (stepZ > 0) ? (z + 1 - pz) * tDeltaZ : (pz - z) * tDeltaZ;

    let normal = new THREE.Vector3();
    let hit = false;
    const maxDist = 5.2;
    let distTraveled = 0;

    for (let step = 0; step < 24; step++) {
      const blockId = this.world.getVoxel(x, y, z);
      if (blockId !== BLOCKS.AIR && blockId !== BLOCKS.WATER) {
        hit = true;
        break;
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          distTraveled = tMaxX;
          tMaxX += tDeltaX;
          normal.set(-stepX, 0, 0);
        } else {
          z += stepZ;
          distTraveled = tMaxZ;
          tMaxZ += tDeltaZ;
          normal.set(0, 0, -stepZ);
        }
      } else {
        if (tMaxY < tMaxZ) {
          y += stepY;
          distTraveled = tMaxY;
          tMaxY += tDeltaY;
          normal.set(0, -stepY, 0);
        } else {
          z += stepZ;
          distTraveled = tMaxZ;
          tMaxZ += tDeltaZ;
          normal.set(0, 0, -stepZ);
        }
      }

      if (distTraveled > maxDist) break;
    }

    if (hit && !this.targetMob) {
      const bId = this.world.getVoxel(x, y, z);
      this.targetBlock = { x, y, z, normal, blockId: bId };
      const torchTarget = BLOCK_DEFS[this.world.getVoxel(x, y, z)]?.shape === 'torch';
      this.targetBoxMesh.scale.set(torchTarget ? 0.125 : 1, torchTarget ? 0.625 : 1, torchTarget ? 0.125 : 1);
      this.targetBoxMesh.position.set(x + 0.5, y + (torchTarget ? 0.3125 : 0.5), z + 0.5);
      this.targetBoxMesh.visible = true;
    } else {
      this.targetBlock = null;
      this.targetBoxMesh.visible = false;
      this.breakOverlayMesh.visible = false;
    }
  }

  updateMining(dt) {
    if (!this.isMouseDown || !this.targetBlock || this.player.gamemode === 'creative') {
      this.breakOverlayMesh.visible = false;
      this.miningTime = 0;
      return;
    }

    const blockIdOfTarget = this.targetBlock.blockId;
    const def = BLOCK_DEFS[this.targetBlock.blockId];
    if (!def || def.hardness >= 99999) return; // bedrock

    // Break time comes from the real model: the tool must be the right class, its tier
    // must be sufficient, and hardness sets the base. A wrong tool falls back to hand
    // speed and yields nothing (see the harvest check in breakTargetBlock).
    const activeItem = this.inventory.getActiveItem();
    const heldId = activeItem && !activeItem.isBlock ? activeItem.id : null;
    const heldDef = heldId ? ITEMS[heldId] : null;
    let efficiencyLevel = 0;
    if (Array.isArray(activeItem?.enchantments)) {
      const eff = activeItem.enchantments.find(e => e.id === 'efficiency');
      if (eff) efficiencyLevel = eff.level;
    }

    // Haste and Mining Fatigue scale this. The Elder Guardian has been applying Mining Fatigue III to the
    // player since it was written and nothing read it, so its curse -- the reason mining near an ocean
    // monument is hopeless in vanilla -- did nothing at all. At level III the multiplier is 0.027, which
    // turns a quarter-second block into ten seconds.
    // Under water, mining is five times slower with the head submerged unless the helmet has Aqua Affinity, and
    // five times slower again off the ground (Water: "5x slower ... on the ground and 25x slower when not on the
    // ground"). The off-ground factor is applied only in water, which is where the wiki states it.
    const inWater = this.player.inWater || this.player.headInWater;
    const waterFactor = inWater ? underwaterMiningMultiplier({
      headInWater: this.player.headInWater,
      onGround: this.player.onGround || this.player.isFlying,
      aquaAffinity: (this.player.armourEnchantmentLevel?.('aqua_affinity') ?? 0) > 0,
    }) : 1;
    const effectMultiplier = miningSpeedMultiplier(this.player.statusEffects) * waterFactor;
    const breakDuration = Math.max(0.05, breakTimeSeconds(blockIdOfTarget, heldDef, heldId, efficiencyLevel, effectMultiplier));
    this.miningTime += dt;

    // Digging periodic sound
    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      this.digSoundTimer = 0.22;
      this.sounds.playDig(def.sound || 'grass');
      this.heldItemRenderer.swing();
    }

    // Update destroy stage 0-9 cracking texture
    const progress = Math.min(0.99, this.miningTime / breakDuration);
    const stage = Math.floor(progress * 10);

    if (this.textures.destroyMaterials[stage]) {
      this.breakOverlayMesh.material = this.textures.destroyMaterials[stage];
      this.breakOverlayMesh.position.copy(this.targetBoxMesh.position);
      this.breakOverlayMesh.scale.copy(this.targetBoxMesh.scale);
      this.breakOverlayMesh.visible = true;
    }

    if (this.miningTime >= breakDuration) {
      this.breakTargetBlock();
      this.miningTime = 0;
    }
  }

  updateDayNightCycle(dt) {
    // The brighter overworld fill must not replace the End's purple atmosphere.
    if (this.currentDimension === 'the_end' || this.world?.dimension === 'the_end') {
      this.textures?.setSnowDaylight(0);
      this.ambientLight.color.setHex(0x3b1d54);
      this.ambientLight.groundColor.copy(this.ambientLight.color);
      this.ambientLight.intensity = 0.45;
      this.sunLight.intensity = this.moonLight.intensity = 0;
      if (this.sky) {
        this.sky.disabled = true;
        this.sky.mesh.visible = false;
      }
      return;
    }
    const isNether = this.currentDimension === 'nether' || this.world?.isNether;
    if (isNether) {
      this.textures?.setSnowDaylight(0);
      const def = getBiomeDef(this.world?.selectedBiome);
      const bgHex = def?.skyColor !== undefined ? def.skyColor : 0x330808;
      const fogHex = def?.fogColor !== undefined ? def.fogColor : 0x471010;
      this.normalBgColor.setHex(bgHex);
      this.scene.background.setHex(bgHex);
      this.scene.fog.color.setHex(fogHex);
      this.scene.fog.near = this.normalFogNear || 15;
      this.scene.fog.far = this.normalFogFar || 55;
      if (this.sky) {
        this.sky.disabled = true;
        if (this.sky.mesh) this.sky.mesh.visible = false;
      }
      return;
    }

    // The day counter advances when the sky wraps, because several mechanics are counted in days rather than
    // in ticks -- a villager may restock "up to twice per day" -- and `worldTime` alone cannot express that,
    // since it resets to zero every 24000 ticks.
    // doDaylightCycle stops the clock (Building Studio turns it off so the light holds). Nothing read the rule
    // before, so the terminal's "Daylight cycle" switch did nothing.
    const clockRuns = this.gamerules?.doDaylightCycle !== false;
    const advancedTime = this.worldTime + (clockRuns ? (24000 / this.dayLengthSeconds) * dt : 0);
    if (advancedTime >= 24000) this.dayCount = (this.dayCount ?? 0) + Math.floor(advancedTime / 24000);
    this.worldTime = advancedTime % 24000;
    this.sky.disabled = false;
    this.sky.setTime(this.worldTime);
    followSun(this.sunLight, this.sky.sunDirection, this.camera.position);
    this.moonLight.position.copy(this.sky.sunDirection).multiplyScalar(-100);
    this.normalBgColor.copy(this.sky.horizonColor);
    updateOutdoorLighting(this.ambientLight, this.sunLight, this.moonLight, this.sky, this.shader?.enabled, this.weather.rainIntensity);
    this.textures.setSnowDaylight(snowDaylightStrength(this.sky.sunDirection.y, this.weather.rainIntensity));
    const fogRange = overworldFogRange(this.renderDistance);
    this.normalFogNear = fogRange.near;
    this.normalFogFar = fogRange.far;

    // Apply fog based on underwater state
    if (!this.isUnderwater) {
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color.copy(this.normalBgColor);
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;
    }
  }

  updateUnderwaterState() {
    // Check if camera eye position is inside a water block
    const camPos = this.camera.position;
    const blockAtCamera = this.world.getVoxel(
      Math.floor(camPos.x),
      Math.floor(camPos.y),
      Math.floor(camPos.z)
    );
    const isWaterBlock = blockAtCamera === BLOCKS.WATER || BLOCK_DEFS[blockAtCamera]?.waterPlant;
    this.isUnderwater = isWaterBlock && (BLOCK_DEFS[blockAtCamera]?.waterPlant || camPos.y % 1 < waterHeight(this.world, Math.floor(camPos.x), Math.floor(camPos.y), Math.floor(camPos.z)));

    if (this.isUnderwater) {
      // The surface above the eye: the composite pass draws caustics and light shafts below it.
      const cx = Math.floor(camPos.x), cz = Math.floor(camPos.z);
      let top = Math.floor(camPos.y);
      for (let i = 0; i < 48 && (this.world.getVoxel(cx, top + 1, cz) === BLOCKS.WATER || BLOCK_DEFS[this.world.getVoxel(cx, top + 1, cz)]?.waterPlant); i++) top++;
      this.underwaterSurfaceY = top + waterHeight(this.world, cx, top, cz);

      // Dense on entering, clearing over 30 seconds; Night Vision and Conduit Power clear it at once.
      const now = performance.now();
      const dt = this.lastUnderwaterCheck ? Math.min(0.25, (now - this.lastUnderwaterCheck) / 1000) : 0;
      this.underwaterSeconds += dt;
      const effects = this.player?.statusEffects;
      const has = (name) => Boolean(effects && (effects instanceof Map ? effects.has(name) : effects[name]));
      const view = underwaterVisibility(this.underwaterSeconds, { nightVision: has('night_vision'), conduitPower: has('conduit_power') });
      const daylight = this.sky?.uniforms?.uDay?.value ?? 1;
      const [r, g, b] = underwaterFogColor(daylight, this.underwaterSurfaceY - camPos.y);
      this.underwaterFogColor.setRGB(r, g, b);
      this.underwaterFogFar = view.far;
      this.underwaterClarity = view.clarity;

      this.scene.background.copy(this.underwaterFogColor);
      this.scene.fog.color.copy(this.underwaterFogColor);
      this.scene.fog.near = this.underwaterFogNear;
      this.scene.fog.far = this.underwaterFogFar;

      // Show CSS overlay
      if (this.underwaterOverlay) {
        this.underwaterOverlay.classList.add('active');
      }
    } else {
      this.underwaterSeconds = 0;
      this.underwaterSurfaceY = null;
      // Restore normal fog
      const isNether = this.currentDimension === 'nether' || this.world?.isNether;
      if (isNether) {
        const def = getBiomeDef(this.world?.selectedBiome);
        const bgHex = def?.skyColor !== undefined ? def.skyColor : 0x330808;
        const fogHex = def?.fogColor !== undefined ? def.fogColor : 0x471010;
        this.scene.background.setHex(bgHex);
        this.scene.fog.color.setHex(fogHex);
        this.scene.fog.near = this.normalFogNear || 15;
        this.scene.fog.far = this.normalFogFar || 55;
      } else {
        this.scene.background.copy(this.normalBgColor);
        this.scene.fog.color.copy(this.normalBgColor);
        this.scene.fog.near = this.normalFogNear;
        this.scene.fog.far = this.normalFogFar;
      }

      // Hide CSS overlay
      if (this.underwaterOverlay) {
        this.underwaterOverlay.classList.remove('active');
      }
    }

    this.lastUnderwaterCheck = performance.now();

    // Update water shader uniform
    if (this.textures.waterUniforms) {
      this.textures.waterUniforms.uIsUnderwater.value = this.isUnderwater ? 1.0 : 0.0;
    }
  }

  /**
   * Open a designed world: load the mod that owns it.
   *
   * This is what makes a designed world self-contained at runtime. The map file names a world; the loader
   * finds the mod whose manifest claims that file, imports its entrypoint, and lets it register its content
   * and its mechanism. Nothing here names a world.
   *
   * Returns the mechanism id the world should run, so the caller can `setMechanism` it.
   */
  async openDesignedWorld(mapData = {}) {
    if (!this.modLoader) return { mechanismId: 'default', modId: null };
    const resolved = resolveWorldMechanism(this.modLoader, mapData);
    if (resolved.modId) {
      const result = await this.modLoader.openWorld(mapData, { game: this });
      if (!result.ok) {
        console.warn(`mod '${resolved.modId}' failed to load: ${result.reason ?? 'unknown'}`);
        // The world still opens; it simply runs on the core's mechanics without the mod's.
        return { mechanismId: 'default', modId: null, failed: resolved.modId };
      }
    } else {
      // A plain world: close whatever designed world was open, so its content leaves with it.
      this.modLoader.closeWorld();
      this.mechanisms?.setMechanism?.('default', this);
    }
    return resolved;
  }

  /**
   * Gather the live state `/show_mobs` reports on.
   *
   * Kept separate from the report itself: this part touches the running game, and the report is a pure
   * function of what this returns, so every answer it can give is tested without a world.
   */
  buildMobStatsReport() {
    const player = this.player?.position ?? null;
    const biomeId = this.world?.getBiome
      ? this.world.getBiome(Math.floor(player?.x ?? 0), Math.floor(player?.z ?? 0))
      : null;
    const spawnManager = this.spawnManager;
    const snapshot = spawnManager?.debugSnapshot ? spawnManager.debugSnapshot() : {};

    // The mobs the game actually holds, in the shape the report wants. `mobs.mobs` is the live array.
    const loaded = (this.mobs?.mobs ?? []).map(m => ({
      type: m.type ?? m.mobType ?? m.kind ?? 'unknown',
      category: m.category ?? null,
      position: m.mesh?.position ?? m.position ?? null,
    }));

    // The biome's spawn table, through the SAME resolver natural spawning uses, so the report cannot
    // disagree with what the spawner is actually working from.
    const tableFor = (category) => biomeSpawnsFor(biomeId, category);

    // The light at the player, which is the number the hostile rule is applied against.
    let lightLevel = null;
    try {
      lightLevel = this.world?.getLightLevel
        ? this.world.getLightLevel(
          Math.floor(player?.x ?? 0), Math.floor(player?.y ?? 0), Math.floor(player?.z ?? 0),
          spawnManager?.skyDarken ?? 0)
        : null;
    } catch { lightLevel = null; }

    return buildMobStatsReport({
      mobs: loaded,
      snapshot,
      player,
      biomeId,
      tableFor,
      lightLevel,
      gamemode: this.player?.gamemode ?? this.settings?.gameMode ?? null,
      peaceful: spawnManager?.peacefulMode === true,
      chunkGeneration: spawnManager?.chunkGenerationSpawner?.stats ?? null,
      packName: packBiomeSpawnSource(biomeId),
    });
  }

  /**
   * Run a chat command.
   *
   * Most commands live in `commandRunner.js`, which takes a context rather than reaching into this
   * class, so a test can execute them. This method assembles that context and falls back to the six
   * commands that genuinely need a manager this class owns: /redstone, /locate, /show_mobs, /save,
   * /load and /maps.
   */
  handleCommand(cmd) {
    if (typeof cmd !== 'string') return;
    const parts = cmd.trim().split(/\s+/);
    const root = parts[0].toLowerCase();

    // 0. The cheats gate, once, ahead of BOTH dispatchers.
    //
    // It has to be here rather than only inside `runCommand`: `/summon`, `/locate`, `/redstone` and
    // `/show_mobs` are dispatched by the switch below, and `runCommand` returns false for them before it ever
    // reaches its own check -- so marking those commands as gated did nothing at all until this call existed.
    const refusal = permissionRefusal(this.settings, root);
    if (refusal) {
      this.ui.addChatMessage(refusal, 'error');
      return;
    }

    // 1. The portable commands. runCommand returns false for anything it does not own, so the two chains
    //    cannot both claim a command.
    if (runCommand(buildCommandContext(this), cmd)) return;

    // 2. The manager-backed commands.
    switch (root) {
      case '/redstone': return this.runRedstoneCommand(parts);
      case '/locate': return this.runLocateCommand(parts);
      case '/teleport':
      case '/tp': return this.runTeleportCommand(parts);
      case '/show_mobs': return this.runShowMobsCommand();
      case '/save': return this.runSaveCommand(parts);
      case '/load': return this.runLoadCommand(parts);
      case '/maps':
      case '/saves':
        this.ui.openMapModal('load');
        return;
      case '/summon':
        if(parts[1]?.replace('minecraft:','')==='lightning_bolt'){
          const origin=this.player.position,values=parts.slice(2),position=origin.clone();
          if(values.length&&values.length!==3){this.ui.addChatMessage('Usage: /summon lightning_bolt [x y z]','error');return;}
          for(const [i,axis] of ['x','y','z'].entries())if(values[i]!==undefined){const raw=values[i];position[axis]=raw.startsWith('~')?origin[axis]+Number(raw.slice(1)||0):Number(raw);}
          if(!position.toArray().every(Number.isFinite)){this.ui.addChatMessage('Invalid lightning coordinates','error');return;}
          if(this.weather.triggerLightning(null,null,position))this.ui.addChatMessage('Summoned lightning bolt','system');
          else this.ui.addChatMessage('Lightning is only available in the Overworld','error');
          return;
        }
        this.runSummonCommand(parts[1]);
        return;
      default:
        this.ui.addChatMessage('Unknown command: ' + cmd + '. Type /help for help.', 'error');
    }
  }

  /** /redstone <demo|game|list> [...] -- builds from redstoneDemos.js, which this class owns. */
  runRedstoneCommand(parts) {
    try {
      const p = this.player.position;
      const at = [Math.floor(p.x) + 4, Math.floor(p.y), Math.floor(p.z)];
      if (parts[1] === 'demo') {
        buildRedstoneDemo(this.world, parts[2], at);
        this.refreshDirtyChunks();
        this.ui.addChatMessage(
          parts[2] === 'flyer'
            ? 'Flying engine started. Place obsidian ahead to stop it.'
            : 'Elevator built. Right-click its lever to raise/lower the slime platform.',
          'system',
        );
      } else if (parts[1] === 'game') {
        const built = buildRedstoneGame(this.world, parts[2], at);
        this.refreshDirtyChunks();
        this.ui.addChatMessage(built.name + ' built. ' + built.probe, 'system');
      } else if (parts[1] === 'list' || !parts[1]) {
        this.ui.addChatMessage('Redstone games you can build:', 'help');
        for (const g of listRedstoneGames()) {
          this.ui.addChatMessage('  /redstone game ' + g.key + ' - ' + g.name + ': ' + g.blurb, 'help');
        }
      } else {
        throw new Error('Use /redstone demo <elevator|flyer>, /redstone game <name>, or /redstone list');
      }
    } catch (error) {
      this.ui.addChatMessage(error.message, 'error');
    }
  }

  /**
   * /locate [structure] [id].
   *
   * The structures ARE generated (see src/worldStructures.js) and a player still sees none at spawn: the
   * placement sets use vanilla spacing, so the nearest is hundreds of blocks away. This is the command
   * that makes "far away" distinguishable from "broken", and it is vanilla's own answer to the same
   * problem.
   */
  runLocateCommand(parts) {
    try {
      const wanted = parts[1] === 'structure' ? parts[2] : parts[1];
      const p = this.player.position;
      const ids = wanted ? [wanted] : (this.world.structures?.enabledIds || []);
      if (ids.length === 0) throw new Error('this world generates no structures');
      for (const id of ids) {
        try {
          const found = locateNearestStructure(this.world, id, p.x, p.z, { maxRadiusChunks: 4096 });
          this.ui.addChatMessage(
            found.structureId + ': x ' + found.centre.x + ', z ' + found.centre.z
              + ' (y ~' + found.centre.y + ') in the ' + found.biome + ' biome, ' + found.distance
              + ' blocks away, chunk ' + found.chunk[0] + ',' + found.chunk[1],
            'system',
          );
        } catch (error) {
          this.ui.addChatMessage(id + ': ' + error.message, 'error');
        }
      }
      // The count closes the listing: how many structures this world really has around the player.
      const counted = countStructures(this.world, p.x, p.z, { radiusChunks: 32 });
      const kinds = Object.entries(counted.byType).sort((a, b) => b[1] - a[1]).map(([type, n]) => type + ' ' + n).join(', ');
      this.ui.addChatMessage(
        'Total: ' + counted.total + ' structures within ' + counted.radiusChunks * 16 + ' blocks'
          + (kinds ? ' (' + kinds + ')' : ''),
        'system',
      );
    } catch (error) {
      this.ui.addChatMessage(error.message, 'error');
    }
  }

  /**
   * /teleport <x> <y> <z> | <structure>. A structure name goes to the nearest one this world generates, landing on
   * dry ground outside it and facing it (see src/teleport.js), after generating the chunks it covers.
   */
  runTeleportCommand(parts) {
    try {
      const p = this.player.position;
      const parsed = parseTeleport(parts.slice(1), p);
      if (!parsed.ok) throw new Error(parsed.reason);
      let target;
      if (parsed.kind === 'coords') {
        target = { x: parsed.x, y: parsed.y, z: parsed.z, say: 'Teleported to ' + parsed.x.toFixed(1) + ', ' + parsed.y.toFixed(1) + ', ' + parsed.z.toFixed(1) };
      } else {
        const found = locateNearestStructure(this.world, parsed.id, p.x, p.z, { maxRadiusChunks: 4096 });
        const arrival = structureArrival(this.world, found);
        target = {
          ...arrival,
          say: 'Teleported to the nearest ' + found.structureId + ' at x ' + found.centre.x + ', z ' + found.centre.z
            + ' (' + found.distance + ' blocks away, ' + arrival.note + ')'
        };
      }
      this.player.position.set(target.x, target.y, target.z);
      if (this.player.velocity) this.player.velocity.set(0, 0, 0);
      if (this.player.fallDistance !== undefined) this.player.fallDistance = 0;
      if (target.yaw !== undefined) { this.player.yaw = target.yaw; this.player.pitch = target.pitch; }
      this.loadChunksAroundPlayer?.();
      this.ui.addChatMessage(target.say, 'system');
    } catch (error) {
      this.ui.addChatMessage(error.message, 'error');
    }
  }

  /**
   * /show_mobs -- "why can I see no mobs", which has five causes that look identical from a screenshot:
   * an empty biome table, a full category cap, a spawner that has not ticked, hostiles refused for light,
   * or animals never placed at chunk generation.
   *
   * Gated to Creative / cheats, because it reports internals rather than doing anything a player needs,
   * and the refusal says how to get it rather than merely declining.
   */
  runShowMobsCommand() {
    if (!isCreative(this.settings) && !this.settings?.cheats) {
      this.ui.addChatMessage(
        '/show_mobs is a Creative diagnostic. It is available in Creative mode, or with cheats on.',
        'error',
      );
      return;
    }
    try {
      const report = this.buildMobStatsReport();
      for (const line of report.lines) this.ui.addChatMessage(line.text, line.kind);
    } catch (error) {
      this.ui.addChatMessage('/show_mobs failed: ' + error.message, 'error');
    }
  }

  /** /save [name] -- the default name is the date, so a player who types nothing still gets a file. */
  runSaveCommand(parts) {
    const now = new Date();
    const stamp = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0')
      + '-' + String(now.getDate()).padStart(2, '0');
    const name = parts.slice(1).join(' ') || ('World_' + stamp);
    this.ui.addChatMessage('Saving map "' + name + '" to local computer...', 'system');
    saveMapToDefault(this, name).then((res) => {
      this.ui.addChatMessage('Saved map successfully! Location: ' + res.path, 'system');
    }).catch((err) => {
      this.ui.addChatMessage('Save failed: ' + err.message, 'error');
    });
  }

  /** /load <name> -- the .json suffix and the progress dialog are the caller's business. */
  runLoadCommand(parts) {
    const name = parts.slice(1).join(' ');
    if (!name) {
      this.ui.addChatMessage('Usage: /load <filename> (or type /maps to browse)', 'error');
      return;
    }
    const filename = name.endsWith('.json') ? name : (name + '.json');
    this.ui.addChatMessage('Loading map "' + filename + '"...', 'system');
    this.loadMapWithProgress((progress) => loadMapFromDefault(this, filename, { progress }), {
      title: 'Loading Map',
    }).then((res) => {
      this.ui.addChatMessage('Map "' + res.name + '" loaded successfully!', 'system');
    }).catch((err) => {
      this.ui.addChatMessage('Load failed: ' + err.message, 'error');
    });
  }

  /**
   * /summon <entity>.
   *
   * Reads SUMMONABLE_MOBS; the offsets are per-entry rather than repeated, so the existing difference
   * that Pillager and Zombie spawn three blocks away where everything else spawns two is stated rather
   * than buried in forty branches.
   */
  runSummonCommand(rawType) {
    const type = String(rawType ?? '').toLowerCase();
    const entry = SUMMONABLE_MOBS[type];
    if (!entry) {
      const names = Object.keys(SUMMONABLE_MOBS).sort().join(', ');
      this.ui.addChatMessage('Unknown mob. Try: ' + names, 'error');
      return;
    }
    const [method, distance, label] = entry;
    const spawn = this.mobs?.[method];
    if (typeof spawn !== 'function') {
      this.ui.addChatMessage('This build has no ' + method + '; ' + label + ' cannot be summoned.', 'error');
      return;
    }
    const p = this.player.position;
    spawn.call(this.mobs, p.x + distance, p.y + 1, p.z + distance);
    this.ui.addChatMessage('Summoned new ' + label, 'system');
  }

  /**
   * `/summon <entity>`.
   *
   * A table rather than a forty-branch `if/else` chain. The spawn methods take the offsets now instead of
   * each branch repeating `p.x + 2, p.y + 1, p.z + 2`, which is what made the chain unreadable and hid
   * that three mobs were summoned three blocks away rather than two for no stated reason.
   */

  /**
   * Step off whatever vehicle the player is riding.
   */
  dismount() {
    const vehicle = this.riding;
    if (!vehicle) return;
    vehicle.rider = null;
    this.player.position.set(vehicle.position.x, vehicle.position.y + 1.2, vehicle.position.z);
    this.player.velocity?.set?.(0, 0, 0);
    this.riding = null;
    this.ui?.addChatMessage?.('Stepped off.', 'system');
  }

  /**
   * Keep the player attached to their vehicle, and let a boat be steered.
   *
   * Steering reuses the player's yaw so the same WASD handling as the rest of the
   * game drives the boat.
   */
  updateRiding(dt = 0.016) {
    const vehicle = this.riding;
    if (!vehicle) return;
    if (vehicle.kind === 'boat') {
      const fX = -Math.sin(vehicle.yaw), fZ = -Math.cos(vehicle.yaw);
      const isDriver = vehicle.rider === this.player || !vehicle.rider;
      if (isDriver) {
        vehicle.rider = this.player;
        this.player.position.set(vehicle.position.x + fX * 0.2, vehicle.position.y + 0.55, vehicle.position.z + fZ * 0.2);
        const input = this.input || this.controls;
        if (input && (input.forward || input.backward)) vehicle.yaw = this.player.yaw;
      } else {
        vehicle.passenger = this.player;
        this.player.position.set(vehicle.position.x - fX * 0.4, vehicle.position.y + 0.45, vehicle.position.z - fZ * 0.4);
      }
    } else {
      this.player.position.set(vehicle.position.x, vehicle.position.y + 0.55, vehicle.position.z);
      vehicle.rider = this.player;
    }
    this.player.velocity?.set?.(0, 0, 0);
    if (this.player.isSneaking) this.dismount();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Rendering and the progress UI continue while loading; the SIMULATION does not.
    //
    // This gate was `!this.worldGenerated`, a flag set on the first line of `generateNewWorld` -- so the whole
    // simulation ran for the entire terrain load. `allowsSimulation` is true only in the `ready` phase.
    if (this.worldReady && this.lifecycle && this.lifecycle.phase === 'idle') {
      this.lifecycle.phase = 'ready';
    }
    if (!allowsSimulationForPhase(this.lifecycle?.phase ?? (this.worldReady ? 'ready' : 'idle'))) {
      if (this.playerBot?.active) this.playerBot.stop('The world simulation paused or changed; player controls were released.');
      this.clock.getDelta();
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Bounded, because a hidden tab or a slow frame hands back a delta of seconds. Passing that straight into
    // physics and the spawner is how a player returns to a tab already dead.
    const dt = clampDelta(this.clock.getDelta());
    // Game packages may supply their own authoritative controllers and policies. The engine still
    // owns voxel meshing and the renderer; base Survival systems must not run alongside that game.
    if (this.modRuntime?.exclusiveSimulation) {
      this.modRuntime.update?.(dt);
      if(this.modRuntime.render)this.modRuntime.render(dt);
      else {this.renderer.clear();this.renderer.render(this.scene,this.modRuntime.camera||this.camera);}
      return;
    }
    const fps = 1.0 / Math.max(0.0001, dt);

    // 1. Update Player Physics & Camera
    this.world.redstone.game=this;
    this.world.redstone.daylight=Math.max(0,Math.sin((this.worldTime/24000)*Math.PI*2));
    this.world.redstone.update(dt,[this.player,...this.mobs.mobs.filter(m=>m.health>0)]);
    // Carts and boats move on their own clock, after redstone so powered rails have
    // their signal for this frame.
    this.railSystem?.update(dt);
    if (this.riding) this.updateRiding();
    this.bow.update(dt);
    this.fishing.update(dt);
    this.playerBot?.tick(dt);
    this.player.update(dt);
    this.waterSplashes.update(dt, this.player.position);
    this.worldSync?.update(dt);

    // 2. Update Held Item in Player Hand
    const activeItem = this.inventory.getActiveItem();
    this.heldItemRenderer.setItem(activeItem);
    const speed = Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.z ** 2);
    this.heldItemRenderer.update(dt, speed);

    // 3. Update Voxel Raycasting & Mining
    this.updateRaycast();
    this.playerBot?.afterRaycast();
    this.updateMining(dt);

    // 4. Update Mobs AI & Projectiles
    // A fault inside a single mob is now contained by the loop itself, which reports
    // and skips just that mob. This catch is the backstop for the shared work around
    // it (arrows, animal and hostile behaviour passes, collision separation), where a
    // throw would still stop every mob. It used to log to the console alone, so when
    // one mob type threw — 28 of them did, on an unguarded `mob.mat.color` — every mob
    // in the world stopped moving and hitting them did nothing, with no indication why.
    // A painting whose wall is gone breaks a second later and drops.
    this.paintings?.update(dt);
    // Building Studio's ground grid follows the player.
    this.buildingStudio?.update?.();

    // Monster spawners placed by structures (monster rooms, mineshafts, fortresses, strongholds, bastions).
    this.monsterSpawners ??= new MonsterSpawners({ world: this.world, mobs: this.mobs });
    this.monsterSpawnerClock = Math.min(40, (this.monsterSpawnerClock ?? 0) + dt * 20);
    while (this.monsterSpawnerClock >= 1) {
      this.monsterSpawnerClock -= 1;
      try { this.monsterSpawners.tick({ position: this.player.position, gamemode: this.player.gamemode }, { difficulty: this.difficulty }); } catch (err) { console.error('monster spawner:', err); break; }
    }

    try {
      this.mobs.update(dt, this.player);
      this.mobUpdateError = null;
    } catch (err) {
      const summary = `${err?.constructor?.name || 'Error'}: ${err?.message}`;
      if (this.mobUpdateError !== summary) {
        this.mobUpdateError = summary;
        console.error('Error updating mobs:', err);
        this.ui?.addChatMessage?.(
          `⚠ The mob system hit an error: ${summary}. Mobs may stop moving until it clears. See the browser console for the full trace.`,
          'error'
        );
      }
    }
    // Keep optional mob inspection labels in sync with movement and damage.
    this.mobs.updateDebugLabels?.();

    // 4a. Natural mob spawning.
    //
    // Runs AFTER the mob update so a mob spawned this frame is not also simulated for a tick it was
    // never alive for, and so the despawn pass sees this frame's positions. The manager converts the
    // frame delta into game ticks internally: spawning is a 20 Hz process, not a 60 Hz one, and
    // running it per frame would triple every spawn rate.
    //
    // Contained in its own try/catch like the mob update: a fault in the spawner must not stop the
    // world from rendering, and a fault in the world must not leave the spawner half-run.
    if (this.worldGenerated) this.world.structures?.flushSpawns?.();
    if (this.spawnManager && this.worldGenerated && this.world.generationMode !== 'authored') {
      try {
        this.spawnManager.update(dt);
        this.mobSpawnError = null;
      } catch (err) {
        const summary = `${err?.constructor?.name || 'Error'}: ${err?.message}`;
        if (this.mobSpawnError !== summary) {
          this.mobSpawnError = summary;
          console.error('Error in the mob spawning system:', err);
          this.ui?.addChatMessage?.(
            `⚠ The mob spawning system hit an error: ${summary}. New mobs may stop appearing until it clears. See the browser console for the full trace.`,
            'error'
          );
        }
      }
    }

    // 4b. Update Mob Expansion Managers (Raids, Deep Dark Warden, Bosses)
    if (this.raidManager) {
      this.raidManager.update(dt, this.player);
      // Village entry with Bad Omen triggers Raid
      if (this.player.hasStatusEffect?.('bad_omen') && !this.raidManager.isRaidActive) {
        const villager = this.mobs?.mobs?.find(m => m.type === 'villager' && m.mesh?.position?.distanceTo(this.player.position) < 32);
        if (villager) {
          this.raidManager.startRaid(this.player, villager.mesh.position);
        }
      }
    }
    if (this.deepDarkManager) {
      this.deepDarkManager.update(dt, this.player);
      if (speed > 4.2 || this.player.velocity.y > 1.0) {
        this.deepDarkManager.onPlayerVibration(this.player.position, 0.4);
      }
    }
    if (this.bossManager) {
      this.bossManager.update(dt, this.player);
    }

    // Dismount when sneaking
    if (this.player.ridingMob && this.player.isSneaking) {
      this.mobs?.animalBehaviors?.dismount(this.player);
    }

    updateHorseHud(['horse','donkey','mule'].includes(this.player.ridingMob?.type)?this.player.ridingMob:null);
    // Horse jump meter
    if (this.player.ridingMob && ['horse', 'donkey', 'mule'].includes(this.player.ridingMob.type)) {
      this.ui?.setHorseJumpMeter?.(this.player.ridingMob.jumpCharge || 0);
    } else {
      this.ui?.setHorseJumpMeter?.(0);
    }

    // 5. Update Dropped Items, TNT, & Particles
    this.entities.update(dt, this.player, this.inventory);

    // Wiki: "If the merchant takes damage or leaves the player's reach, the trading menu closes." The check
    // lives here because neither the merchant nor the player knows about the other's window.
    if (this.tradingOpen) {
      const merchant = this.ui?.activeVillager;
      const gone = !merchant || merchant.health <= 0 || merchant.dying || !merchant.mesh;
      const far = merchant?.mesh && merchant.mesh.position.distanceTo(this.player.position) > 8;
      if (gone || far) this.ui?.closeAllModals?.();
    }

    // 5a. Update Furnaces (cooking progress, fuel consumption, lighting & particles)
    if (this.furnaceManager) {
      this.furnaceManager.update(dt);
    }

    // 5a1. Update brewing stands. A stage takes 20 seconds in vanilla and the stand keeps working while
    // its window is closed, so this ticks every stand in the world rather than only the open one.
    // Nothing called `BrewingStand.update` before this, which meant the timer never ran at all: a brew
    // had no duration and the progress bar in the GUI was decorative.
    if (this.ui?.tickBrewing) {
      this.ui.tickBrewing(dt);
    }

    // 5a2. Update Beds (sleeping timer, transitions, wake-up)
    if (this.bedManager) {
      this.bedManager.update(dt);
    }

    // 5a3. Update Agriculture (crop growth ticks, farmland hydration)
    if (this.farmingManager) {
      this.farmingManager.update(dt, this.player.position);
    }

    // 5a3b. Update beacons and conduits: re-check the structure and apply what it grants.
    if (this.beaconManager) {
      this.beaconManager.update(dt, this.player);
    }
    if (this.hiveManager) {
      this.hiveManager.update(dt);
    }

    // 5a4. Update Nether Portal & Dimensional Travel
    if (this.portalManager) {
      this.portalManager.update(dt, this.player, this);
    }

    // 5a5. Update End Portal travel. The last link of the route: before this, an activated End portal was a
    // floor pattern the player could stand on and nothing more.
    this.updateEndPortalTravel(dt);
    this.updateEnderEyes(dt);

    // 5b. Update World Mechanism System & Active World Mechanics
    if (this.mechanisms) {
      this.mechanisms.update(dt, this.player);
    }
    this.modRuntime?.update?.(dt);

    this.world.water.update(dt);

    // Chunk streaming: generate what the player is walking toward, mesh what is ready, and unload
    // what is now far away -- all bounded by a time budget so this cannot itself cause a spike.
    // This replaces the previous arrangement, where generation happened in one synchronous burst
    // when the player crossed a chunk border, and `refreshDirtyChunks` allocated and sorted a list
    // of every loaded chunk on every frame.
    if (this.streamer && this.worldReady) {
      this.streamer.update(this.player.position.x, this.player.position.z);
    }

    // Pick up chunks that an edit marked dirty directly on the world.
    this.refreshDirtyChunks();

    // 6. Day/Night Cycle, Weather, Underwater & Dynamic Water Shader
    this.updateDayNightCycle(dt);
    this.updateUnderwaterState();
    this.weather.update(dt, this.player.position, this.ambientLight, this.sunLight, this.scene.fog, this.scene.background);
    this.sky.update(dt, this.camera, this.weather, this.isUnderwater);
    this.blockLighting.update(dt, this.camera.position);
    // Propagated sky/block light, on a time budget. Spawn predicates read it, so it must be current
    // before the next spawn pass; one or two chunks a frame is enough because a chunk is only dirty
    // when it is generated or edited.
    this.world.light?.update?.();
    this.textures.update(dt, this.sunLight, this.scene.background, this.scene.fog);

    // 7. Update UI Stats & Debug Overlay
    this.ui.updateStats();
    this.ui.updateDebug(fps, this.renderer.info);
    // The debug renderers (F3+B hitboxes, F3+G chunk borders) draw nothing until they are switched on.
    this.updateDebugOverlays();

    // 8. Render Main World Scene (held items and DOM UI remain sharp).
    this.shader.render(dt);

    // 9. Render 1st person held item overlay (Hidden in Dungeon Mode)
    if (this.player.perspective === 0 && !this.player.isDungeonMode && !this.player?.isDungeonMode) {
      this.heldItemRenderer.render(this.renderer);
    }
  }

  /**
   * Snapshot what the player is currently looking at, for the agent terminal.
   * The held item is hidden for the capture so the image matches the player's
   * unobstructed view, and it is restored immediately afterwards.
   */
  captureCurrentView(options = {}) {
    const showHeldItem = this.player?.perspective === 0 && !this.player?.isDungeonMode;
    const container = this.heldItemRenderer?.container;

    try {
      if (showHeldItem && container) container.visible = false;
      this.shader.render(0);
      return encodeScreenshotDataUrl(this.renderer.domElement, options);
    } catch (err) {
      console.warn('Current-view capture failed:', err);
      return null;
    } finally {
      if (container) container.visible = true;
    }
  }
}

// Start Game
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window.game = game;
  game.start();
});
