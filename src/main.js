import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { TextureManager } from './textures.js';
import { World, CHUNK_SIZE_X, CHUNK_SIZE_Z } from './world.js';
import { ChunkMesher } from './mesher.js';
import { SoundEngine } from './audio.js';
import { Player } from './player.js';
import { MobManager } from './mobs.js';
import { EntityManager } from './entities.js';
import { Inventory } from './inventory.js';
import { UIManager } from './ui.js';
import { HeldItemRenderer } from './heldItem.js';
import { WeatherManager } from './weather.js';
import { WorldAgent } from './worldAgent.js';
import { encodeScreenshotDataUrl } from './agentProviders.js';
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
import { getBlockDrop } from './itemVisuals.js';
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    // Subsystems
    this.sounds = new SoundEngine();
    this.textures = new TextureManager();
    this.world = new World();
    this.weather = new WeatherManager(this.scene, this.sounds);
    this.geminiAgent = new WorldAgent(this);
    this.mesher = null;
    this.player = null;
    this.mobs = null;
    this.entities = null;
    this.inventory = null;
    this.ui = null;
    this.heldItemRenderer = null;
    this.tournament = null;

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
    this.renderDistance = 4; // chunks radius

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
    this.mesher = new ChunkMesher(this.textures);

    // 2. Initialize Player & Controls
    this.player = new Player(this.camera, this.renderer.domElement, this.world, this.sounds);
    this.player.game = this;
    this.scene.add(this.player.model);
    this.player.model.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });

    // 3. Initialize Mobs & Entities
    this.entities = new EntityManager(this.scene, this.world, this.sounds, this.textures);
    this.mobs = new MobManager(this.scene, this.world, this.sounds, this.entities);
    this.mobs.game = this;

    // 4. Initialize Inventory & UI
    this.inventory = new Inventory(this.sounds);
    this.ui = new UIManager(this.inventory, this.player, this.world, this.mobs, this.sounds, this);
    this.ui.game = this;
    this.ui.onCommand = (cmd) => this.handleCommand(cmd);
    this.ui.initGemini(this.geminiAgent);
    // Let every agent request carry a live screenshot of the player's view.
    this.geminiAgent.viewCaptureProvider = () => this.captureCurrentView();
    this.entities.onItemPickup = () => this.ui.updateHotbar();
    this.world.water.onDisplace = (x,y,z,id) => {
      const drop=getBlockDrop(id);
      if(drop) this.entities.spawnDroppedItem(new THREE.Vector3(x+.5,y+.5,z+.5),drop.id,drop.isBlock);
    };

    // 5. Initialize Held Item 3D Renderer
    this.heldItemRenderer = new HeldItemRenderer(this.camera, this.textures);

    // 5b. Initialize Tournament & Dragon Ball Skills
    this.tournament = new TournamentManager(this);
    this.dragonballSkills = new DragonballSkillsManager(this);
    this.trainingSites = new TrainingSitesManager(this);
    this.dungeonMode = new DungeonModeManager(this);

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
    const pcx = Math.floor(this.player.position.x / CHUNK_SIZE_X);
    const pcz = Math.floor(this.player.position.z / CHUNK_SIZE_Z);

    // Generate neighbors before meshing so boundary water depth and face culling
    // use real terrain rather than treating not-yet-loaded chunks as empty air.
    for (let cx = pcx - this.renderDistance; cx <= pcx + this.renderDistance; cx++) {
      for (let cz = pcz - this.renderDistance; cz <= pcz + this.renderDistance; cz++) {
        if (!this.world.getChunk(cx, cz)) {
          this.world.getOrCreateChunk(cx, cz);
          for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const neighbor = this.world.getChunk(cx + dx, cz + dz);
            if (neighbor) neighbor.dirty = true;
          }
        }
      }
    }
    for (let cx = pcx - this.renderDistance; cx <= pcx + this.renderDistance; cx++) {
      for (let cz = pcz - this.renderDistance; cz <= pcz + this.renderDistance; cz++) {
        const chunk = this.world.getOrCreateChunk(cx, cz);
        if (chunk.dirty) {
          this.rebuildChunkMesh(chunk);
        }
      }
    }
  }

  refreshDirtyChunks(budget = 4) {
    const px=this.player.position.x, pz=this.player.position.z;
    const dirty=[...this.world.chunks.values()].filter(chunk=>chunk.dirty);
    dirty.sort((a,b)=>(a.cx*16-px)**2+(a.cz*16-pz)**2-((b.cx*16-px)**2+(b.cz*16-pz)**2));
    for(const chunk of dirty.slice(0,budget)) this.rebuildChunkMesh(chunk);
  }

  rebuildChunkMesh(chunk) {
    for (const key of ['opaqueMesh', 'transparentMesh', 'waterMesh', 'lightMesh']) {
      if (chunk[key]) { this.scene.remove(chunk[key]); chunk[key].geometry.dispose(); chunk[key] = null; }
    }

    const { opaqueGeo, transparentGeo, waterGeo, lightGeo } = this.mesher.meshChunk(chunk, this.world);

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
        if (v !== BLOCKS.AIR && v !== BLOCKS.WATER) {
          return y + 1.01;
        }
      }
      return 26;
    };

    // Villagers near path and house
    this.mobs.spawnVillager(2.0, getGround(2.0, 3.5), 3.5);
    this.mobs.spawnVillager(5.5, getGround(5.5, 5.5), 5.5);
    this.mobs.spawnVillager(7.5, getGround(7.5, 3.5), 3.5);

    // Iron Golem village guardian in front of cottage!
    this.mobs.spawnIronGolem(3.8, getGround(3.8, 1.5), 1.5);

    // Pillager patrol on the meadow outskirts
    this.mobs.spawnPillager(14.5, getGround(14.5, 12.5), 12.5);
    this.mobs.spawnPillager(12.5, getGround(12.5, 14.5), 14.5);

    // Passive animals in meadow
    this.mobs.spawnPig(6.5, getGround(6.5, -2.5), -2.5);
    this.mobs.spawnPig(8.5, getGround(8.5, 2.5), 2.5);
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
        if (this._worldStartInFlight) return;
        this._worldStartInFlight = true;
        this.sounds.init();
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
        // Right Click: Place / Interact
        this.heldItemRenderer.recoil();
        this.handleRightClick();
      } else if (e.button === 1) {
        // Middle Click: Pick Block
        this.handleMiddleClick();
      }
    });

    window.addEventListener('mouseup', (e) => {
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

  handleLeftClick() {
    // Attack mob if target mob is looked at
    if (this.targetMob) {
      const activeItem = this.inventory.getActiveItem();
      let damage = 2; // hand damage
      if (activeItem && !activeItem.isBlock) {
        const it = ITEMS[activeItem.id];
        if (it && it.attack) damage = it.attack;
      }
      this.mobs.damageMob(this.targetMob, damage, this.player.position);
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

    const bucketItem = this.inventory.getActiveItem();
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
    // Interacting with Villager
    if (this.targetMob && this.targetMob.type === 'villager') {
      this.sounds.playVillager();
      this.ui.openVillagerTrade(this.targetMob);
      return;
    }

    if (!this.targetBlock) return;

    const bX = this.targetBlock.x;
    const bY = this.targetBlock.y;
    const bZ = this.targetBlock.z;
    const clickedBlock = this.world.getVoxel(bX, bY, bZ);

    // Crafting Table interaction
    if (clickedBlock === BLOCKS.CRAFTING_TABLE) {
      this.sounds.playClick();
      this.ui.openCraftingTable();
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

    // Eating Food, Buckets, and Spawn Eggs
    const activeItem = this.inventory.getActiveItem();
    if (activeItem && !activeItem.isBlock) {
      const it = ITEMS[activeItem.id];
      if (it && it.type === 'food') {
        if (this.player.hunger < this.player.maxHunger || this.player.health < this.player.maxHealth || this.player.gamemode === 'creative') {
          this.sounds.playEat();
          this.player.hunger = Math.min(this.player.maxHunger, this.player.hunger + (it.food || 4));
          this.player.health = Math.min(this.player.maxHealth, this.player.health + 2);
          if (this.player.gamemode !== 'creative') {
            this.inventory.consumeActiveItem();
            this.ui.updateHotbar();
          }
          return;
        }
      }

      // Spawn Eggs
      if (it && it.type === 'spawn_egg') {
        const mobType = it.mob;
        const norm = this.targetBlock.normal || { x: 0, y: 1, z: 0 };
        const sx = bX + norm.x + 0.5;
        const sy = bY + norm.y + 0.05;
        const sz = bZ + norm.z + 0.5;

        if (mobType === 'villager') this.mobs.spawnVillager(sx, sy, sz);
        else if (mobType === 'iron_golem') this.mobs.spawnIronGolem(sx, sy, sz);
        else if (mobType === 'pillager') this.mobs.spawnPillager(sx, sy, sz);
        else if (mobType === 'zombie') this.mobs.spawnZombie(sx, sy, sz);
        else if (mobType === 'skeleton') this.mobs.spawnSkeleton(sx, sy, sz);
        else if (mobType === 'creeper') this.mobs.spawnCreeper(sx, sy, sz);
        else if (mobType === 'pig') this.mobs.spawnPig(sx, sy, sz);
        else if (mobType === 'cow') this.mobs.spawnCow(sx, sy, sz);
        else if (mobType === 'sheep') this.mobs.spawnSheep(sx, sy, sz);
        else if (mobType === 'salmon') this.mobs.spawnSalmon(sx, sy, sz);
        else if (mobType === 'dolphin') this.mobs.spawnDolphin(sx, sy, sz);
        else if (mobType === 'octopus') this.mobs.spawnOctopus(sx, sy, sz);
        else if (mobType === 'axolotl') this.mobs.spawnAxolotl(sx, sy, sz);

        this.sounds.playPop();
        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }
        return;
      }
    }

    // Place Block on adjacent targeted face
    if (activeItem && activeItem.isBlock && this.targetBlock.normal) {
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
        this.world.setVoxel(placeX, placeY, placeZ, activeItem.id);

        const def = BLOCK_DEFS[activeItem.id];
        this.sounds.playPlace(def ? def.sound : 'wood');

        if (this.player.gamemode !== 'creative') {
          this.inventory.consumeActiveItem();
          this.ui.updateHotbar();
        }

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

  breakTargetBlock() {
    if (!this.targetBlock) return;
    const { x, y, z, blockId } = this.targetBlock;
    if (blockId === BLOCKS.AIR || blockId === BLOCKS.BEDROCK) return;

    const def = BLOCK_DEFS[blockId];
    this.sounds.playBreak(def ? def.sound : 'stone');

    // Spawn block debris particles
    this.entities.spawnBlockParticles(new THREE.Vector3(x, y, z), blockId);

    // In survival, drop item
    if (this.player.gamemode === 'survival') {
      const drop = getBlockDrop(blockId);
      if (drop) this.entities.spawnDroppedItem(new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5), drop.id, drop.isBlock, 1);
    }

    // Set air in world
    this.world.setVoxel(x, y, z, BLOCKS.AIR);

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
      const mobPos = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0));
      const toMob = mobPos.clone().sub(camPos);
      const proj = toMob.dot(camDir);
      if (proj > 0 && proj < 4.5) {
        const perpDist = toMob.clone().sub(camDir.clone().multiplyScalar(proj)).length();
        if (perpDist < 0.7 && proj < closestMobDist) {
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

    const def = BLOCK_DEFS[this.targetBlock.blockId];
    if (!def || def.hardness >= 99999) return; // bedrock

    // Tool speed multiplier
    let speedMult = 1.0;
    const activeItem = this.inventory.getActiveItem();
    if (activeItem && !activeItem.isBlock) {
      const it = ITEMS[activeItem.id];
      if (it && it.speed) speedMult = it.speed;
    }

    const breakDuration = Math.max(0.15, def.hardness / speedMult);
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
    this.worldTime = (this.worldTime + (24000 / this.dayLengthSeconds) * dt) % 24000;
    this.sky.setTime(this.worldTime);
    followSun(this.sunLight, this.sky.sunDirection, this.camera.position);
    this.moonLight.position.copy(this.sky.sunDirection).multiplyScalar(-100);
    const sunHeight = this.sky.sunDirection.y;
    const day = this.sky.uniforms.uDay.value;
    this.normalBgColor.copy(this.sky.horizonColor);
    this.ambientLight.intensity = 0.10 + day * 0.38;
    this.sunLight.intensity = 0.9 * THREE.MathUtils.smoothstep(sunHeight, -0.025, 0.5);
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
      // Restore normal sky fog
      this.scene.background.copy(this.normalBgColor);
      this.scene.fog.color.copy(this.normalBgColor);
      this.scene.fog.near = this.normalFogNear;
      this.scene.fog.far = this.normalFogFar;

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

    if (root === '/help') {
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
      } else if (mobType === 'salmon' || mobType === 'fish') {
        this.mobs.spawnSalmon(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Salmon', 'system');
      } else if (mobType === 'dolphin') {
        this.mobs.spawnDolphin(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Dolphin', 'system');
      } else if (mobType === 'octopus' || mobType === 'squid') {
        this.mobs.spawnOctopus(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Octopus', 'system');
      } else if (mobType === 'axolotl') {
        this.mobs.spawnAxolotl(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned new Axolotl', 'system');
      } else if (mobType === 'tournament_host' || mobType === 'host') {
        this.mobs.spawnTournamentHost(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned Tournament Announcer Host', 'system');
      } else if (mobType === 'enderman') {
        this.mobs.spawnEnderman(p.x + 2, p.y + 1, p.z + 2);
        this.ui.addChatMessage('Summoned Enderman Challenger Boss', 'system');
      } else {
        this.ui.addChatMessage('Unknown mob. Try: villager, tournament_host, enderman, iron_golem, pillager, zombie, pig, salmon, dolphin, octopus, axolotl', 'error');
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
    this.player.update(dt);

    // 2. Update Held Item in Player Hand
    const activeItem = this.inventory.getActiveItem();
    this.heldItemRenderer.setItem(activeItem);
    const speed = Math.sqrt(this.player.velocity.x ** 2 + this.player.velocity.z ** 2);
    this.heldItemRenderer.update(dt, speed);

    // 3. Update Voxel Raycasting & Mining
    this.updateRaycast();
    this.updateMining(dt);

    // 4. Update Mobs AI & Projectiles
    this.mobs.update(dt, this.player);

    // 5. Update Dropped Items, TNT, & Particles
    this.entities.update(dt, this.player, this.inventory);

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
    this.refreshDirtyChunks();

    // 6. Day/Night Cycle, Weather, Underwater & Dynamic Water Shader
    this.updateDayNightCycle(dt);
    this.updateUnderwaterState();
    this.weather.update(dt, this.player.position, this.ambientLight, this.sunLight, this.scene.fog, this.scene.background);
    this.sky.update(dt, this.camera, this.weather, this.isUnderwater);
    this.blockLighting.update(dt, this.camera.position);
    this.textures.update(dt, this.sunLight, this.scene.background, this.scene.fog);

    // 7. Update UI Stats & Debug Overlay
    this.ui.updateStats();
    this.ui.updateDebug(fps, this.renderer.info);

    // 8. Render Main World Scene
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

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
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
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
