import { squidRayDistance } from './squidHitbox.js';
import { attackBonus, fireAspectSeconds } from './enchantmentEffects.js';
import { spendDurability } from './durability.js';
import { igniteActor } from './heat.js';
import { tieHorseLeads } from './horseLead.js';
import { updateHorseHud } from './horseInventory.js';
import { useSnowball } from './netherCombat.js';
import { useBarterPotion } from './barterItems.js';
import { launchFirework } from './fireworks.js';
import { WaterSplashes } from './waterSplashes.js';
import * as THREE from 'three';
import { LightweightShader } from './lightweightShader.js';
import { BowController } from './bow.js';
import { buildRedstoneDemo } from './redstoneDemos.js';
import { buildRedstoneGame, listRedstoneGames } from './redstoneGames.js';
import { BLOCKS, BLOCK_DEFS, ITEMS, blockIdForPlacement } from './blocks.js';
import { drinkPotion, isDrinkablePotion } from './potionUse.js';
import { miningSpeedMultiplier } from './statusEffects.js';
import { breakTimeSeconds, harvestsNothing, harvestRequirementText } from './miningRules.js';
import { getBiomeDef } from './biomes.js';
import { TextureManager } from './textures.js';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './world.js';
import { ChunkStreamer } from './chunkStreamer.js';
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
import { startZombieVillagerCure } from './villagerEconomy.js';
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
import { isGlassBottle, useGlassBottle } from './bottles.js';
import { blockDrops } from './blockDrops.js';
import { BlockLighting, configureSunShadows, followSun } from './lighting.js';
import { Sky } from './sky.js';
import {
  saveMapToDefault,
  loadMapFromDefault,
  saveMapToCustomFile,
  loadMapFromCustomFile
} from './mapManager.js';
import { TournamentManager } from './tournament.js';
import { DragonballSkillsManager } from './dragonballSkills.js';
import { TrainingSitesManager } from './trainingSites.js';
import { DungeonModeManager } from './dungeonMode.js';
import { WorldMechanismManager } from './worldMechanisms.js';
import { BuildingStudioManager } from './buildingStudio.js';
import { BuildingLibrary } from './buildingLibrary.js';
import { MobLibrary } from './mobLibrary.js';
import { FurnaceManager } from './furnace.js';
import { BedManager } from './bed.js';
import { ChestManager } from './chest.js';
import { angerPiglins } from './piglin.js';
import { DoorManager } from './door.js';
import { FarmingManager, isHoe, getSeedCrop, getCropInfo } from './farming.js';
import { BeaconManager } from './beaconManager.js';
import { HiveManager, isHive } from './hives.js';
import { EnchantingManager } from './enchanting.js';
import { NetherPortalManager } from './netherPortal.js';
import { RaidManager } from './raids.js';
import { DeepDarkWardenManager } from './deepDarkWarden.js';
import { BossFightManager } from './bossFights.js';


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
    // Minecraft underwater fog colors
    this.underwaterFogColor = new THREE.Color(0x050e33);
    this.underwaterFogNear = 0.1;
    this.underwaterFogFar = 24;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Lighting & Celestial
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
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
    this.worldTime = 6000; // 0..24000 (6000 = midday, 18000 = midnight)
    this.dayLengthSeconds = 600; // 10 minutes full day/night cycle

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

    // Subsystems
    this.sounds = new SoundEngine();
    this.textures = new TextureManager();
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
    this.tournament = null;
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
    // Set once the initial chunks exist and it is safe to enter the world.
    this.worldReady = false;
  }

  async start() {
    console.log('Initializing Minecraft Web Edition...');

    // 1. Initialize Texture Atlas & Materials
    await this.textures.init();
    this.waterSplashes = new WaterSplashes(this.scene, this.world);
    this.shader = new LightweightShader(this);
    this.shader.bindButton(document.getElementById('btn-shader'));
    this.mesher = new ChunkMesher(this.textures);
    this.mesher.game = this;
    this.world.game = this;

    // 2. Initialize Player & Controls
    this.player = new Player(this.camera, this.renderer.domElement, this.world, this.sounds);
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
    // Rails, minecarts and boats: real physics for carts and floating props.
    this.railSystem = new RailSystem(this.world, this);
    this.riding = null;

    // 5b. Initialize Tournament & Dragon Ball Skills
    this.tournament = new TournamentManager(this);    this.dragonballSkills = new DragonballSkillsManager(this);
    this.skills = this.dragonballSkills;
    this.trainingSites = new TrainingSitesManager(this);
    this.dungeonMode = new DungeonModeManager(this);
    this.buildingStudio = new BuildingStudioManager(this);
    this.furnaceManager = new FurnaceManager(this);
    this.bedManager = new BedManager(this);
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

    // 6. Build Target Highlighting Box & Break Crack Mesh
    this.buildTargetHighlightMeshes();

    // 7. Initial World State: World is NOT generated until user clicks Generate New World or loads a world
    this.worldGenerated = false;

    // 8. Bind Mouse Interaction & Click-to-play
    this.bindEvents();

    // 9. Start Animation Loop
    this.animate();

    console.log('Minecraft Web Edition Loaded Successfully!');
  }

  async generateNewWorld() {
    if (this.worldGenerated) return;
    this.worldGenerated = true;
    this.worldType = 'generated';
    this.world.isFlatWorld = false;
    this.buildingStudio?.exitStudio();
    // Catch a missing UI method up front: previously such a call threw late in
    // this method and silently aborted the start flow.
    const missingUi = findMissingMethods(this.ui, REQUIRED_UI_METHODS);
    if (missingUi.length) {
      console.warn(`[World] UIManager is missing: ${missingUi.join(', ')}. Skipping those updates.`);
    }
    if (this.mechanisms) {
      this.mechanisms.setMechanism('default', this);
    } else {
      if (this.tournament) {
        this.tournament.isTournamentMap = false;
        this.tournament.cleanup?.();
        this.tournament.reset?.();
      }
      if (this.trainingSites) {
        this.trainingSites.cleanup?.();
        this.trainingSites.reset?.();
      }
      if (this.dungeonMode) {
        this.dungeonMode.reset?.();
      }
    }

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
        this.ambientLight.intensity = 0.7;
      }
      if (this.sunLight) this.sunLight.intensity = 0;
      if (this.moonLight) this.moonLight.intensity = 0;
    } else if (this.sky) {
      this.sky.disabled = false;
      if (this.sky.mesh) this.sky.mesh.visible = true;
    }

    await this.loadWorldProgressively();

    // Terrain now exists, so put the player on its surface. Placing them before
    // generation left them at a hardcoded height that could be inside rock.
    const spawn = placePlayerOnSurface(this);
    if (spawn?.found) {
      console.log(`[World] Spawned the player on the surface at (${spawn.x}, ${spawn.y}, ${spawn.z}); ${spawn.reason}.`);
    } else {
      console.warn(`[World] Could not place the player on the surface: ${spawn?.reason || 'unknown'}.`);
    }

    this.spawnVillageMobs();
    if (this.ui) {
      if (typeof this.ui.updateHotbar === 'function') this.ui.updateHotbar();
      if (typeof this.ui.updateStats === 'function') this.ui.updateStats();
    }
    // Only now is it safe to leave the start screen. Pointer lock is requested on
    // the player's next canvas click, because user activation does not survive the
    // awaits above and a pointer-lock request here would be rejected.
    this.worldReady = true;
  }

  async startBuildingStudio() {
    if (this._worldStartInFlight) return;
    this._worldStartInFlight = true;
    this.sounds.init();
    const btnStudio = document.getElementById('btn-start-building-studio');
    if (btnStudio) btnStudio.disabled = true;

    try {
      this.worldGenerated = true;
      this.worldType = 'building_studio';
      this.world.isFlatWorld = true;

      if (this.mechanisms) {
        this.mechanisms.setMechanism('default', this);
      } else {
        if (this.tournament) {
          this.tournament.isTournamentMap = false;
          this.tournament.cleanup?.();
          this.tournament.reset?.();
        }
        if (this.trainingSites) {
          this.trainingSites.cleanup?.();
          this.trainingSites.reset?.();
        }
        if (this.dungeonMode) {
          this.dungeonMode.reset?.();
        }
      }

      await this.loadWorldProgressively();

      // Put player on surface in creative mode facing the build origin
      this.player.position.set(0, 5, 0);
      this.player.gamemode = 'creative';
      this.player.yaw = 0; // facing +Z towards (0, 5, 8)
      this.player.pitch = 0;
      if (this.player.velocity) this.player.velocity.set(0, 0, 0);

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
    if (!this.overlay) return work();

    this.overlay.show(options.title || 'Loading Map');
    // One yield so the overlay is on screen before the blocking work starts.
    await yieldToBrowser();

    const onProgress = (percent, stage) => this.overlay.set(percent, stage);
    const result = await work(onProgress);

    this.overlay.set(100, 'Map loaded');
    await yieldToBrowser();
    this.overlay.hide();
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

  switchDimension(newDim, targetPos = null) {
    if (!this.world) return;

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
      this.ambientLight.intensity = 0.45;
      this.sunLight.intensity = 0;
      this.moonLight.intensity = 0;
      this.bossManager?.initEndArena();
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

    this.blockLighting.setChunk(chunk.cx, chunk.cz, lightGeo?.userData.sources || []);
    if (lightGeo) {
      chunk.lightMesh = new THREE.Mesh(lightGeo, this.textures.lightMaterial);
      chunk.lightMesh.castShadow = chunk.lightMesh.receiveShadow = true;
      chunk.lightMesh.customDistanceMaterial = this.textures.lightDistanceMaterial;
      this.scene.add(chunk.lightMesh);
    }
    if (opaqueGeo) {
      chunk.opaqueMesh = new THREE.Mesh(opaqueGeo, this.textures.opaqueMaterial);
      chunk.opaqueMesh.castShadow = chunk.opaqueMesh.receiveShadow = true;
      this.scene.add(chunk.opaqueMesh);
    }
    if (waterGeo) {
      chunk.waterMesh = new THREE.Mesh(waterGeo, this.textures.waterMaterial);
      chunk.waterMesh.renderOrder = 1;
      chunk.waterMesh.receiveShadow = true;
      this.scene.add(chunk.waterMesh);
    }
    if (transparentGeo) {
      chunk.transparentMesh = new THREE.Mesh(transparentGeo, this.textures.transparentMaterial);
      chunk.transparentMesh.renderOrder = 2;
      chunk.transparentMesh.castShadow = chunk.transparentMesh.receiveShadow = true;
      this.scene.add(chunk.transparentMesh);
    }

    chunk.dirty = false;
  }

  spawnVillageMobs() {
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
  }

  bindEvents() {
    // Start Overlay Action Buttons
    const startOverlay = document.getElementById('start-overlay');
    const btnNewWorld = document.getElementById('btn-start-new-world');
    const btnDesignedWorld = document.getElementById('btn-start-designed-world');
    const btnLoadWorld = document.getElementById('btn-start-load-world');

    if (btnNewWorld) {
      btnNewWorld.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.sounds.init();
        if (this.ui?.openBiomeModal) {
          this.ui.openBiomeModal();
          return;
        }
        if (this._worldStartInFlight) return;
        this._worldStartInFlight = true;
        btnNewWorld.disabled = true;
        try {
          // Await so the start screen stays up (with the progress bar) until the
          // terrain and meshes are actually ready, then hand over the pointer.
          await this.generateNewWorld();
          if (startOverlay) startOverlay.style.display = 'none';
        } catch (err) {
          // Never strand the player on a full progress bar: undo the start and
          // report what happened.
          console.error('[World] Failed to start a new world:', err);
          this.failWorldStart(err);
        } finally {
          btnNewWorld.disabled = false;
          this._worldStartInFlight = false;
          // The overlay only hides once the world is really running; on failure
          // failWorldStart() has already taken it down.
          if (this.worldReady) this.overlay?.hide();
        }
      });
    }

    if (btnDesignedWorld) {
      btnDesignedWorld.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sounds.init();
        if (this.ui) {
          this.ui.openDesignedWorldsModal();
        }
      });
    }

    if (btnLoadWorld) {
      btnLoadWorld.addEventListener('click', (e) => {
        e.stopPropagation();
        this.sounds.init();
        if (this.ui) {
          this.ui.openMapModal('load');
        }
      });
    }

    const btnBuildingStudio = document.getElementById('btn-start-building-studio');
    if (btnBuildingStudio) {
      btnBuildingStudio.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.startBuildingStudio();
      });
    }

    const btnMobInspector = document.getElementById('btn-start-mob-inspector');
    if (btnMobInspector) {
      btnMobInspector.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openMobInspector();
      });
    }

    const btnResourceInspector = document.getElementById('btn-start-resource-inspector');
    if (btnResourceInspector) {
      btnResourceInspector.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openResourceInspector();
      });
    }

    const btnStructureInspector = document.getElementById('btn-start-structure-inspector');
    if (btnStructureInspector) {
      btnStructureInspector.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openStructureInspector();
      });
    }

    this.renderer.domElement.addEventListener('click', () => {
      if (this.player?.isDead) return;
      if (this.worldGenerated && !this.ui.isModalOpen() && !this.ui.isChatOpen && document.pointerLockElement !== this.renderer.domElement) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    // Mouse Down (Left click mine/attack, Right click place/interact)
    window.addEventListener('mousedown', (e) => {
      if (this.player?.isDead) return;
      if (this.dungeonMode?.isActive) {
        if (e.button === 0 && !this.ui.isModalOpen() && !this.ui.isChatOpen) {
          this.player.triggerPunch();
        }
        return;
      }

      if (document.pointerLockElement !== this.renderer.domElement) return;

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
      this.player.isBlocking = false;
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== this.renderer.domElement) {
        this.bow?.cancel();
        this.player.isBlocking = false;
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

    // Drop item key (Q)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !this.ui.isModalOpen() && !this.ui.isChatOpen) {
        this.dropHeldItem();
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
   * Open the Resource Inspector, the block and item counterpart to the Mob Inspector.
   *
   * Like the Mob Inspector it is a separate page with its own preview, so this navigates rather than
   * starting a world. Carries the item the player was examining when one is known.
   *
   * @returns {string} the URL that was navigated to, so it can be asserted in tests
   */
  openResourceInspector() {
    const resource = this.resourceInspectorTarget || '';
    const url = resource
      ? `/resource-debug.html?resource=${encodeURIComponent(resource)}`
      : '/resource-debug.html';
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
      // Strength and weakness scale what this hit deals. Asked of the player rather than computed here,
      // so the effect rules stay in one module and this call site needs no import.
      const effectScale = this.player?.attackDamageMultiplier?.() ?? 1;
      if (effectScale !== 1) damage *= effectScale;
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
    // Interacting with Tournament Host
    if (this.targetMob && this.targetMob.type === 'tournament_host') {
      if (this.tournament) {
        this.tournament.talkToHost();
      }
      return;
    }

    // Interacting with Training Site Manager
    if (this.targetMob && this.targetMob.type === 'site_manager') {
      if (this.trainingSites) {
        const site = this.trainingSites.sites.find(s => s.id === this.targetMob.siteId);
        if (site) {
          this.trainingSites.triggerSiteIntroduction(site);
        }
      }
      return;
    }

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
      if (this.mobs?.animalBehaviors?.interact(interactMob, this.player)) {
        this.ui?.updateHotbar?.();
        return;
      }
    }

    // Active item action (throwing egg, boosting pig/strider with carrot/fungus on stick)
    if (this.mobs?.animalBehaviors?.handleActiveItemUse(this.player, this.inventory)) {
      return;
    }

    if (useSnowball(this)) return;
    if (useBarterPotion(this)) return;

    // Splash Potion of Weakness throwing
    const splashItem = this.inventory.getActiveItem();
    if (splashItem && (splashItem.id === 'splash_potion_of_weakness' || splashItem.id === 'potion_weakness')) {
      if (this.player.gamemode !== 'creative') {
        this.inventory.consumeActiveItem(1);
        this.ui.updateHotbar();
      }
      this.sounds?.playBow?.();
      const splashPos = this.player.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(3));
      for (const m of this.mobs?.mobs || []) {
        if (m.health > 0 && m.mesh && m.mesh.position.distanceTo(splashPos) < 5.0) {
          if(m.applyStatusEffect){m.applyStatusEffect('weakness',60,1,this.player);continue;}
          m.hasWeakness = true;
          m.statusEffects = m.statusEffects || {};
          m.statusEffects.weakness = 60.0;
        }
      }
      this.mobs?.spawnParticleBurst?.(splashPos, 0x4a044e, 16);
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
        id => this.entities.spawnDroppedItem(this.player.position.clone().add(new THREE.Vector3(0,1,0)), id, false));
      if (result) {
        this.sounds.playWater(); this.ui.updateHotbar();
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
    // Interacting with Villager
    if (this.targetMob && this.targetMob.type === 'villager') {
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
        if (this.player.hunger < this.player.maxHunger || this.player.health < this.player.maxHealth || this.player.gamemode === 'creative') {
          this.sounds.playEat();
          this.player.hunger = Math.min(this.player.maxHunger, this.player.hunger + (it.food || 4));
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 2);
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
    if (activeItem && (activeItem.id === 'red_bed' || activeItem.id === 'bed' || activeItem.id === BLOCKS.RED_BED_FOOT) && this.targetBlock.normal) {
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

  handleMiddleClick() {
    if (this.targetBlock && this.targetBlock.blockId !== BLOCKS.AIR) {
      // Pick block into active hotbar slot
      this.inventory.hotbar[this.inventory.activeSlot] = {
        id: this.targetBlock.blockId,
        isBlock: true,
        count: 64
      };
      this.sounds.playClick();
      this.ui.updateHotbar();
    }
  }

  dropHeldItem() {
    const active = this.inventory.getActiveItem();
    if (!active) return;

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const spawnPos = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(dir, 0.8);

    this.entities.spawnDroppedItem(spawnPos, active.id, active.isBlock, 1);
    this.sounds.playClick();

    this.inventory.consumeActiveItem();
    this.ui.updateHotbar();
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

    // Mining a block costs 0.005 exhaustion in vanilla. Charged after the guards, so breaking air
    // or bedrock -- neither of which is a real break -- does not tire the player.
    this.player.addExhaustion?.(0.005);
    if (this.player.gamemode === 'survival' && [BLOCKS.GOLD_BLOCK, BLOCKS.GOLD_ORE, BLOCKS.CHEST].includes(blockId)) {
      angerPiglins(this.mobs, this.player.position);
    }

    const def = BLOCK_DEFS[blockId];
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

    // Set air in world
    this.world.setVoxel(x, y, z, BLOCKS.AIR);

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
    const effectMultiplier = miningSpeedMultiplier(this.player.statusEffects);
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
    const isNether = this.currentDimension === 'nether' || this.world?.isNether;
    if (isNether) {
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

    this.worldTime = (this.worldTime + (24000 / this.dayLengthSeconds) * dt) % 24000;
    this.sky.setTime(this.worldTime);
    followSun(this.sunLight, this.sky.sunDirection, this.camera.position);
    this.moonLight.position.copy(this.sky.sunDirection).multiplyScalar(-100);
    const sunHeight = this.sky.sunDirection.y;
    const day = this.sky.uniforms.uDay.value;
    this.normalBgColor.copy(this.sky.horizonColor);
    this.ambientLight.intensity = this.shader?.enabled ? 0.08 + day * 0.34 : 0.10 + day * 0.48;
    this.sunLight.intensity = (this.shader?.enabled ? 1.12 : 0.85) * THREE.MathUtils.smoothstep(sunHeight, -0.025, 0.5);
    this.sunLight.color.setRGB(1, 0.65 + 0.27 * day, 0.28 + 0.44 * day);
    this.moonLight.intensity = 0.17 * Math.max(0, -sunHeight) * (1 - this.weather.rainIntensity * 0.8);

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
    const wasUnderwater = this.isUnderwater;
    this.isUnderwater = blockAtCamera === BLOCKS.WATER && camPos.y % 1 < waterHeight(this.world, Math.floor(camPos.x), Math.floor(camPos.y), Math.floor(camPos.z));

    if (this.isUnderwater) {
      // Switch to Minecraft underwater fog: dense blue fog with short range
      this.scene.background.copy(this.underwaterFogColor);
      this.scene.fog.color.copy(this.underwaterFogColor);
      this.scene.fog.near = this.underwaterFogNear;
      this.scene.fog.far = this.underwaterFogFar;

      // Show CSS overlay
      if (this.underwaterOverlay) {
        this.underwaterOverlay.classList.add('active');
      }
    } else {
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

    // Update water shader uniform
    if (this.textures.waterUniforms) {
      this.textures.waterUniforms.uIsUnderwater.value = this.isUnderwater ? 1.0 : 0.0;
    }
  }

  handleCommand(cmd) {
    const parts = cmd.trim().split(/\s+/);
    const root = parts[0].toLowerCase();

    if(root==='/redstone'){
      try{
        if(parts[1]==='demo'){
          const p=this.player.position;buildRedstoneDemo(this.world,parts[2],[Math.floor(p.x)+4,Math.floor(p.y),Math.floor(p.z)]);this.refreshDirtyChunks();
          this.ui.addChatMessage(parts[2]==='flyer'?'Flying engine started. Place obsidian ahead to stop it.':'Elevator built. Right-click its lever to raise/lower the slime platform.','system');
        }else if(parts[1]==='game'){
          const p=this.player.position;
          const built=buildRedstoneGame(this.world,parts[2],[Math.floor(p.x)+4,Math.floor(p.y),Math.floor(p.z)]);
          this.refreshDirtyChunks();
          this.ui.addChatMessage(`${built.name} built. ${built.probe}`,'system');
        }else if(parts[1]==='list'||!parts[1]){
          this.ui.addChatMessage('Redstone games you can build:','help');
          for(const g of listRedstoneGames())this.ui.addChatMessage(`  /redstone game ${g.key} - ${g.name}: ${g.blurb}`,'help');
        }else throw new Error('Use /redstone demo <elevator|flyer>, /redstone game <name>, or /redstone list');
      }catch(error){this.ui.addChatMessage(error.message,'error');}
      return;
    }
    if (root === '/help') {
      this.ui.addChatMessage('/redstone demo <elevator|flyer> - Build a working redstone example; sneak-right-click components to rotate','help');
      this.ui.addChatMessage('/redstone game <name> - Build a playable redstone machine; /redstone list to see them','help');
      this.ui.addChatMessage('Available Commands:', 'help');
      this.ui.addChatMessage('Press [C] for the AI World Agent terminal (build, weather, summon mobs!)', 'help');
      this.ui.addChatMessage('/save [name] - Save map to local computer default path', 'help');
      this.ui.addChatMessage('/load <name> - Load map from local computer', 'help');
      this.ui.addChatMessage('/maps - Open World Map Manager GUI', 'help');
      this.ui.addChatMessage('/weather <clear|rain|thunder> - Change weather', 'help');
      this.ui.addChatMessage('/gamemode <creative|survival> - Switch game mode', 'help');
      this.ui.addChatMessage('/time set <day|night> - Change world time', 'help');
      this.ui.addChatMessage('/summon <villager|iron_golem|pillager|zombie|pig|cow|sheep|creeper|skeleton> - Spawn mob', 'help');
      this.ui.addChatMessage('/give <item_name> [amount] - Add items to inventory', 'help');
      this.ui.addChatMessage('/offline - Toggle the World Agent between API and offline presets', 'help');
      this.ui.addChatMessage('/clear - Clear chat', 'help');
    } else if (root === '/offline') {
      const agent = this.geminiAgent;
      const nowOffline = !agent.offlineMode;
      agent.setOfflineMode(nowOffline);
      this.ui.addChatMessage(
        nowOffline
          ? `World Agent offline mode ON (${agent.vendorLabel} key kept). Type /offline again to re-enable the API.`
          : `World Agent offline mode OFF.${agent.apiKey ? '' : ' No API key is saved yet, so the terminal still runs offline.'}`,
        'system'
      );
      this.ui.openAgentSettings();
    } else if (root === '/save') {
      const now = new Date();
      const defaultName = `World_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const name = parts.slice(1).join(' ') || defaultName;
      this.ui.addChatMessage(`Saving map "${name}" to local computer...`, 'system');
      saveMapToDefault(this, name).then(res => {
        this.ui.addChatMessage(`Saved map successfully! Location: ${res.path}`, 'system');
      }).catch(err => {
        this.ui.addChatMessage(`Save failed: ${err.message}`, 'error');
      });
    } else if (root === '/load') {
      const name = parts.slice(1).join(' ');
      if (!name) {
        this.ui.addChatMessage('Usage: /load <filename> (or type /maps to browse)', 'error');
      } else {
        const filename = name.endsWith('.json') ? name : `${name}.json`;
        this.ui.addChatMessage(`Loading map "${filename}"...`, 'system');
        this.loadMapWithProgress(progress => loadMapFromDefault(this, filename, { progress }), {
          title: 'Loading Map'
        }).then(res => {
          this.ui.addChatMessage(`Map "${res.name}" loaded successfully!`, 'system');
        }).catch(err => {
          this.ui.addChatMessage(`Load failed: ${err.message}`, 'error');
        });
      }
    } else if (root === '/maps' || root === '/saves') {
      this.ui.openMapModal('load');
    } else if (root === '/weather') {

      const type = parts[1] ? parts[1].toLowerCase() : 'clear';
      if (type === 'rain' || type === 'clear' || type === 'thunder') {
        this.weather.setWeather(type);
        this.ui.addChatMessage(`Set weather to ${type}`, 'system');
      } else {
        this.ui.addChatMessage('Usage: /weather <clear|rain|thunder>', 'error');
      }
    } else if (root === '/gamemode') {
      const mode = parts[1] ? parts[1].toLowerCase() : '';
      if (mode === 'creative' || mode === 'c' || mode === '1') {
        if (this.tournament?.isTournamentMap) {
          this.ui.addChatMessage('The World Martial Arts Tournament is survival mode only!', 'system');
          return;
        }
        this.player.gamemode = 'creative';
        this.ui.addChatMessage('Set game mode to Creative Mode', 'system');
        this.ui.openCreativeInventory();
      } else if (mode === 'survival' || mode === 's' || mode === '0') {
        this.player.gamemode = 'survival';
        this.player.isFlying = false;
        this.ui.addChatMessage('Set game mode to Survival Mode', 'system');
      } else {
        this.ui.addChatMessage('Usage: /gamemode <creative|survival>', 'error');
      }
    } else if (root === '/time') {
      if (parts[1] === 'set') {
        if (parts[2] === 'day') {
          this.worldTime = 6000;
          this.ui.addChatMessage('Set the time to 6000 (Day)', 'system');
        } else if (parts[2] === 'night') {
          this.worldTime = 18000;
          this.ui.addChatMessage('Set the time to 18000 (Night)', 'system');
        }
      }
    } else if (root === '/summon') {
      const mobType = parts[1] ? parts[1].toLowerCase() : '';
      const p = this.player.position;
      if (mobType === 'villager') {
        this.mobs.spawnVillager(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Villager', 'system');
      } else if (mobType === 'iron_golem') {
        this.mobs.spawnIronGolem(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Iron Golem', 'system');
      } else if (mobType === 'pillager') {
        this.mobs.spawnPillager(p.x + 3, p.y + 1, p.z + 3);
        this.ui.addChatMessage('Summoned new Pillager', 'system');
      } else if (mobType === 'zombie') {
        this.mobs.spawnZombie(p.x + 3, p.y + 1, p.z + 3);
        this.ui.addChatMessage('Summoned new Zombie', 'system');
      } else if (mobType === 'pig') {
        this.mobs.spawnPig(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Pig', 'system');
      } else if (mobType === 'chicken') {
        this.mobs.spawnChicken(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Chicken', 'system');
      } else if (mobType === 'cow') {
        this.mobs.spawnCow(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Cow', 'system');
      } else if (mobType === 'sheep') {
        this.mobs.spawnSheep(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Sheep', 'system');
      } else if (mobType === 'salmon' || mobType === 'fish') {
        this.mobs.spawnSalmon(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Salmon', 'system');
      } else if (mobType === 'cod') {
        this.mobs.spawnCod(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Cod', 'system');
      } else if (mobType === 'guardian') {
        this.mobs.spawnGuardian(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Guardian', 'system');
      } else if (mobType === 'elder_guardian') {
        this.mobs.spawnElderGuardian(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Elder Guardian', 'system');
      } else if (mobType === 'drowned') {
        this.mobs.spawnDrowned(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Drowned', 'system');
      } else if (mobType === 'glow_squid') {
        this.mobs.spawnGlowSquid(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Glow Squid', 'system');
      } else if (mobType === 'dolphin') {
        this.mobs.spawnDolphin(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Dolphin', 'system');
      } else if (mobType === 'octopus' || mobType === 'squid') {
        if (this.mobs.spawnSquid) {
          this.mobs.spawnSquid(p.x + 2, p.y + 1, p.z + 2);
        } else {
          this.mobs.spawnOctopus(p.x + 2, p.y + 1, p.z + 2);
        }
        this.ui.addChatMessage('Summoned new Squid', 'system');
      } else if (mobType === 'axolotl') {
        this.mobs.spawnAxolotl(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Axolotl', 'system');
      } else if (mobType === 'polar_bear') {
        this.mobs.spawnPolarBear(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Polar Bear', 'system');
      } else if (mobType === 'tournament_host' || mobType === 'host') {
        this.mobs.spawnTournamentHost(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned Tournament Announcer Host', 'system');
      } else if (mobType === 'enderman') {
        this.mobs.spawnEnderman(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned Enderman Challenger Boss', 'system');
      } else {
        this.ui.addChatMessage('Unknown mob. Try: villager, tournament_host, enderman, iron_golem, pillager, zombie, pig, cow, sheep, chicken, salmon, cod, dolphin, squid, glow_squid, guardian, elder_guardian, drowned, polar_bear, axolotl', 'error');
      }
    } else if (root === '/give') {
      const itName = parts[1] ? parts[1].toLowerCase() : '';
      const count = parts[2] ? parseInt(parts[2]) : 64;

      // Check if it's a block
      let foundBlock = null;
      for (const b in BLOCKS) {
        if (b.toLowerCase() === itName) {
          foundBlock = BLOCKS[b];
          break;
        }
      }

      if (foundBlock !== null) {
        this.inventory.addItem(foundBlock, true, count);
        this.ui.updateHotbar();
        this.ui.addChatMessage(`Gave ${count} [${itName}] to Player`, 'system');
      } else if (ITEMS[itName]) {
        this.inventory.addItem(itName, false, count);
        this.ui.updateHotbar();
        this.ui.addChatMessage(`Gave ${count} [${itName}] to Player`, 'system');
      } else {
        this.ui.addChatMessage(`Unknown item '${itName}'`, 'error');
      }
    } else if (root === '/clear') {
      document.getElementById('chat-messages').innerHTML = '';
    } else {
      this.ui.addChatMessage(`Unknown command: ${cmd}. Type /help for help.`, 'error');
    }
  }

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

    if (!this.worldGenerated) {
      this.clock.getDelta();
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const dt = this.clock.getDelta();
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
    this.player.update(dt);
    this.waterSplashes.update(dt, this.player.position);

    // 2. Update Held Item in Player Hand
    const activeItem = this.inventory.getActiveItem();
    this.heldItemRenderer.setItem(activeItem);
    const speed = Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.z ** 2);
    this.heldItemRenderer.update(dt, speed);

    // 3. Update Voxel Raycasting & Mining
    this.updateRaycast();
    this.updateMining(dt);

    // 4. Update Mobs AI & Projectiles
    // A fault inside a single mob is now contained by the loop itself, which reports
    // and skips just that mob. This catch is the backstop for the shared work around
    // it (arrows, animal and hostile behaviour passes, collision separation), where a
    // throw would still stop every mob. It used to log to the console alone, so when
    // one mob type threw — 28 of them did, on an unguarded `mob.mat.color` — every mob
    // in the world stopped moving and hitting them did nothing, with no indication why.
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
    if (this.spawnManager && this.worldGenerated) {
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

    // 5a. Update Furnaces (cooking progress, fuel consumption, lighting & particles)
    if (this.furnaceManager) {
      this.furnaceManager.update(dt);
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

    // 5b. Update World Mechanism System & Active World Mechanics
    if (this.mechanisms) {
      this.mechanisms.update(dt, this.player);
    }
    if (this.tournament && (this.mechanisms ? this.mechanisms.isFeatureEnabled('hasTournamentAnnouncer') : this.tournament.isTournamentMap)) {
      this.tournament.update(dt, this.player);
    }
    if (this.dragonballSkills && (this.mechanisms ? this.mechanisms.isFeatureEnabled('hasDragonBallSkills') : this.dragonballSkills.enabled)) {
      this.dragonballSkills.update(dt);
    }
    if (this.trainingSites && (this.mechanisms ? this.mechanisms.isFeatureEnabled('hasTrainingSites') : this.tournament?.isTournamentMap)) {
      this.trainingSites.update(dt, this.player);
    }
    if (this.dungeonMode && (this.mechanisms ? this.mechanisms.isFeatureEnabled('hasDungeonCombatMode') : this.tournament?.isTournamentMap)) {
      this.dungeonMode.update(dt);
    }

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

    // 8. Render Main World Scene (held items and DOM UI remain sharp).
    this.shader.render(dt);

    // 9. Render 1st person held item overlay (Hidden in Dungeon Mode)
    if (this.player.perspective === 0 && !this.player.isDungeonMode && !this.dungeonMode?.isActive) {
      this.heldItemRenderer.render(this.renderer);
    }
  }

  /**
   * Snapshot what the player is currently looking at, for the agent terminal.
   * The held item is hidden for the capture so the image matches the player's
   * unobstructed view, and it is restored immediately afterwards.
   */
  captureCurrentView(options = {}) {
    const showHeldItem = this.player?.perspective === 0 && !this.player?.isDungeonMode && !this.dungeonMode?.isActive;
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
  game.start();
});
