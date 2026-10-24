import { advancementEvent } from './advancements.js';
import { soulSpeedMultiplier } from './barterItems.js';
import { USING_ITEM_SPEED } from './eating.js';
import { modeRules, isSurvivalLike, takesDamage } from './gameModeRules.js';
import { tickWither } from './witherEffect.js';
import { damageTakenMultiplier, attackDamageBonus, tickEffect, speedMultiplier, fallDamage, hasSlowFalling, FALL_DAMAGE, absorptionShield, jumpVelocityMultiplier, immuneToEffect } from './statusEffects.js';
import { thornsReflect, depthStriderMultiplier, protectionPoints } from './enchantmentEffects.js';
import { spendDurability } from './durability.js';
import { shieldWear } from './toolWear.js';
import * as THREE from 'three';
import { bowFov } from './bow.js';
import { waterHeight, waterCurrent } from './waterGeometry.js';
import { cameraTurnAllowed } from './pointerLock.js';
import { SWIM_SPEED, CURRENT_PUSH, sprintSwimSpeed, canSprintSwim, SWIMMING_HEIGHT, SWIMMING_EYE_HEIGHT } from './waterRules.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { HUNGER_EFFECT_EXHAUSTION_PER_SECOND, addExhaustion, tickHunger, eat, starvationFloor, createHungerState, EXHAUSTION, MAX_HUNGER } from './hunger.js';
import { normaliseSettings, normaliseGameMode, gameruleFor } from './sessionSettings.js';
import { collectDeathDrops, xpLossFor, resolveRespawn, resetSurvivalState } from './deathAndRespawn.js';
import { getTotalXpForLevel } from './experience.js';
import { consumeAnchorRespawn } from './respawnAnchor.js';
import { createPlayerModel } from './playerModel.js';
import { calculateThirdPersonCamera, getPlayerSightline } from './thirdPersonCamera.js';

/**
 * How much of a fall the block landed on absorbs.
 *
 * Vanilla has a handful of these and they are not all the same rule: hay and honey take a fifth of the
 * damage, while slime, powder snow and water take none of it. A named table rather than a chain of
 * conditionals, so the list can be read at a glance and a test can walk it.
 *
 * Deliberately absent: sweet berry bushes, which reduce the damage by one per block fallen rather than by
 * a fraction, and scaffolding and cobwebs, which this game does not have.
 */
export const FALL_ABSORBING_BLOCKS = new Map([
  [BLOCKS.HAY_BLOCK, 0.2],
  [BLOCKS.HONEY_BLOCK, 0.2],
  [BLOCKS.SLIME_BLOCK, 0],
  [BLOCKS.POWDER_SNOW, 0],
  [BLOCKS.WATER, 0],
]);

export class Player {
  constructor(camera, domElement, world, soundEngine, settings = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.sounds = soundEngine;

    // Position & Dimensions (Spawns on village pathway facing the cottage and mobs)
    this.position = new THREE.Vector3(1.5, 27.0, -1.5);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.width = 0.6;
    this.height = 1.8;
    this.eyeHeight = 1.62;
    // Sprint-swimming lays the player flat: one block tall, which is what fits them through a one-block gap.
    this.isSwimming = false;

    // State
    this.onGround = false;
    this.inWater = false;
    // Wiki (Water): "a breath meter that lasts 15 seconds. After they run out of breath, they take 2 HP
    // drowning damage every second until they die, surface, or enter bubble columns."
    this.breath = 15;
    this.drownTimer = 0;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isFlying = false;    // Survival, not Creative.
    //
    // This was hard-coded `'creative'`, so every player began able to fly, break anything and mint items,
    // and the only way into Survival was a later toggle that did not always clean up the abilities. The mode
    // is now whatever the world was created with; `setGameMode` is the one place that changes it.
    // Mob AI identifies its target with `target.type === 'player'` (vindicator, evoker, fish, happy ghast, ...). The
    // player had no type, so those checks were false for the real player and the illagers never attacked it.
    this.type = 'player';
    this.gamemode = normaliseSettings(settings).gameMode;
    this.difficulty = normaliseSettings(settings).difficulty;
    this.perspective = 0; // 0: 1st person, 1: 3rd person back, 2: 3rd person front
    this.botControls = null;

    // Stats
    //
    // hunger was previously a number that never fell, because nothing reduced it. saturation and
    // exhaustion are what make the survival loop work: exhaustion accumulates from digging, jumping,
    // sprinting and taking damage, and is paid out of saturation before hunger. See src/hunger.js.
    this.health = 20;
    this.maxHealth = 20;
    // Points of Absorption shield in front of the health bar. Spent by `takeDamage` before health and
    // refilled only by applying the effect again.
    this.absorption = 0;
    this.hunger = 20;
    this.maxHunger = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    // Backing object for the pure hunger model in src/hunger.js, so the arithmetic that runs is
    // the arithmetic that is tested.
    this._hungerState = createHungerState();
    this.exp = 0;
    this.level = 0;
    this.invulnerableTimer = 0;
    this.isDead = false;
    this.spawnPosition = new THREE.Vector3(1.5, 27.0, -1.5);
    this.bedSpawnPosition = null;
    this.isSleeping = false;
    this.fallDistance = 0;
    this.statusEffects = new Map();

    // Movement speeds (blocks/sec)
    this.walkSpeed = 4.3;
    this.sprintSpeed = 5.6;
    this.sneakSpeed = 1.3;
    this.flySpeed = 11.0;
    this.jumpForce = 8.6;
    this.gravity = 28.0;

    // Camera Rotation (facing positive Z towards village and mobs)
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.baseFov = 70;
    this.currentFov = 70;

    // Input state
    this.keys = {};
    this.lastSpacePress = 0;
    // Double-tapping the forward key is vanilla's secondary sprint binding; this holds it until the key is
    // released or the player sneaks.
    this.lastForwardPress = 0;
    this.sprintKeyToggled = false;
    this.stepDistance = 0;
    this.controlsDisabled = false;

    // 3D Player Mesh (shown in 3rd person and inventory preview)
    this.model = this.createPlayerModel();

    // Dragon Ball Ki Gathering state
    this.isGatheringKi = false;
    this.onKiInterrupted = null;
    // Called when thorns has damage to reflect, as (attacker, damage, procs). Wired by main.js to the
    // mob manager, so the player never damages a mob itself.
    this.onThornsReflect = null;

    // Minecraft Dungeons mode & combat states
    this.isDungeonMode = false;
    this.dungeonCameraOffset = new THREE.Vector3(0, 14.5, 12.0);

    // Dodge Roll state (Key N)
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDuration = 0.35;
    this.rollCooldown = 0;
    this.maxRollCooldown = 1.0;
    this.rollDirection = new THREE.Vector3(0, 0, -1);
    this.onRoll = null;

    // Punch state (Key U)
    this.isPunching = false;
    this.punchTimer = 0;
    this.punchDuration = 0.22;
    this.punchCooldown = 0;
    this.onPunch = null;

    // Shield blocking state
    this.isBlocking = false;
    this._inventory = null;

    this.setupInputs();
  }

  get inventory() {
    return this._inventory || this.game?.inventory;
  }

  set inventory(inv) {
    this._inventory = inv;
  }

  areControlsDisabled(e = null) {
    if (this.controlsDisabled || this.isSleeping) return true;
    if (e && e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
      return true;
    }
    const ui = this.game?.ui || this.ui;
    if (ui) {
      if (ui.isChatOpen || (typeof ui.isGeminiOpen === 'function' && ui.isGeminiOpen()) || (typeof ui.isModalOpen === 'function' && ui.isModalOpen())) {
        return true;
      }
    }
    if (typeof document !== 'undefined') {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        const isHidden = !activeEl.isConnected ||
          activeEl.offsetParent === null ||
          activeEl.closest?.('.hidden') ||
          activeEl.closest?.('[style*="display: none"]') ||
          (activeEl.getClientRects && activeEl.getClientRects().length === 0);
        if (!isHidden) {
          return true;
        }
      }
      const geminiModal = document.getElementById('gemini-modal');
      if (geminiModal && !geminiModal.classList.contains('hidden')) {
        return true;
      }
      const chatWrapper = document.getElementById('chat-input-wrapper');
      if (chatWrapper && chatWrapper.style.display !== 'none' && chatWrapper.style.display !== '') {
        return true;
      }
    }
    return false;
  }

  setupInputs() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      if (this.areControlsDisabled(e)) {
        this.keys = {};
        return;
      }

      this.keys[e.code] = true;

      // Double tap space to toggle creative flight
      // Only a fresh press counts as a tap: holding Space auto-repeats keydown, and those repeats used to read
      // as extra taps, switching flight off while the player was flying higher. Flight now changes only on a
      // genuine second press, however long either press is held.
      if (e.code === 'Space' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastSpacePress < 280) {
          if (this.gamemode === 'creative') {
            this.isFlying = !this.isFlying;
            this.velocity.y = 0;
          }
          // The pair is consumed, so a third quick press starts a new pair instead of toggling again.
          this.lastSpacePress = 0;
        } else {
          this.lastSpacePress = now;
        }
      }

      // Double tap W to sprint, as vanilla's secondary sprint binding does.
      if (e.code === 'KeyW' && !e.repeat) {
        const now = performance.now();
        if (now - this.lastForwardPress < 280) this.sprintKeyToggled = true;
        this.lastForwardPress = now;
      }

      // Sneaking cancels either kind of sprint.
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprintKeyToggled = false;

      // F5: Toggle perspective
      if (e.code === 'F5') {
        e.preventDefault();
        this.perspective = (this.perspective + 1) % 3;
      }

      // F: Swap held item with off-hand
      if (e.code === 'KeyF' && !e.repeat) {
        if (!e.target?.tagName?.match(/INPUT|TEXTAREA/)) {
          this.inventory?.swapOffhand();
          this.game?.ui?.updateHotbar?.();
          this.game?.ui?.updateStats?.();
        }
      }

      // U: Punch Attack
      if ((e.code === 'KeyU' || e.key === 'u' || e.key === 'U') && !e.repeat) {
        if (!e.target?.tagName?.match(/INPUT|TEXTAREA/)) {
          if (!this.game?.mechanisms || this.game.mechanisms.isFeatureEnabled('allowFistPunchAttack')) {
            this.triggerPunch();
          }
        }
      }

      // N: Dodge Roll
      if (e.code === 'KeyN' && !e.repeat) {
        if (!e.target?.tagName?.match(/INPUT|TEXTAREA/)) {
          if (!this.game?.mechanisms || this.game.mechanisms.isFeatureEnabled('allowDodgeRoll')) {
            this.triggerDodgeRoll();
          }
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.areControlsDisabled(e)) {
        this.keys = {};
        return;
      }
      this.keys[e.code] = false;
      // Releasing the forward key ends a sprint started by double-tapping it.
      if (e.code === 'KeyW') this.sprintKeyToggled = false;
    });

    window.addEventListener('mousedown', (e) => {
      if (this.areControlsDisabled(e)) return;
      this.isMouseDown = true;
      this._lastMouseX = e.clientX;
      this._lastMouseY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this._lastMouseX = undefined;
      this._lastMouseY = undefined;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDungeonMode) return; // In Dungeon Top-Down mode, facing is controlled by movement
      if (this.areControlsDisabled(e)) {
        this._lastMouseX = undefined;
        this._lastMouseY = undefined;
        return;
      }

      const isLocked = document.pointerLockElement && (
        document.pointerLockElement === this.domElement ||
        document.pointerLockElement === this.domElement?.parentElement ||
        (this.domElement && document.pointerLockElement?.contains?.(this.domElement)) ||
        (this.domElement && this.domElement?.contains?.(document.pointerLockElement))
      );

      let dx = 0;
      let dy = 0;

      if (isLocked) {
        dx = e.movementX || 0;
        dy = e.movementY || 0;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
      } else {
        // Fallback when pointer lock is not active (test harness, iframe, background tab, or uncaptured cursor)
        // Without the lock the view turns only while a button is held to drag it. Hovering over the canvas used to
        // turn it too, which is what kept the view moving after Escape released the pointer (see pointerLock.js).
        const isInteracting = this.isMouseDown || (e.buttons !== undefined && e.buttons > 0);

        if (!cameraTurnAllowed({ locked: false, buttonHeld: isInteracting })) {
          this._lastMouseX = undefined;
          this._lastMouseY = undefined;
          return;
        }

        if (typeof e.movementX === 'number' && e.movementX !== 0) {
          dx = e.movementX;
        } else if (this._lastMouseX !== undefined && typeof e.clientX === 'number') {
          dx = e.clientX - this._lastMouseX;
        }

        if (typeof e.movementY === 'number' && e.movementY !== 0) {
          dy = e.movementY;
        } else if (this._lastMouseY !== undefined && typeof e.clientY === 'number') {
          dy = e.clientY - this._lastMouseY;
        }

        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
      }

      if (dx === 0 && dy === 0) return;

      const sensitivity = 0.0022;
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity;

      // Clamp pitch to avoid neck snapping (-89 to +89 degrees)
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // Immediately sync camera rotation so view updates
      if (this.camera && !this.isDungeonMode && this.perspective === 0) {
        if (this.camera.up?.set) this.camera.up.set(0, 1, 0);
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.z = 0;
      } else if (this.camera && !this.isDungeonMode) {
        this.updateCameraAndModel(0);
      }
    });
  }

  triggerPunch() {
    if (this.areControlsDisabled() || this.isPunching || this.punchCooldown > 0 || this.isGatheringKi) return false;
    this.isPunching = true;
    this.punchTimer = this.punchDuration;
    this.punchCooldown = 0.28;
    this.sounds?.playPunch?.();
    if (this.game?.heldItemRenderer && this.perspective === 0 && !this.isDungeonMode) {
      this.game.heldItemRenderer.swing();
    }
    if (this.onPunch) this.onPunch();
    return true;
  }

  triggerDodgeRoll() {
    if (this.areControlsDisabled() || this.isRolling || this.rollCooldown > 0 || this.isGatheringKi) return false;
    this.isRolling = true;
    this.rollTimer = this.rollDuration;
    this.rollCooldown = this.maxRollCooldown;
    this.invulnerableTimer = 0.38;

    const rollDir = new THREE.Vector3();
    if (this.isDungeonMode) {
      if (this.keys['KeyW']) rollDir.z -= 1;
      if (this.keys['KeyS']) rollDir.z += 1;
      if (this.keys['KeyA']) rollDir.x -= 1;
      if (this.keys['KeyD']) rollDir.x += 1;
    } else {
      let moveForward = 0;
      let moveRight = 0;
      if (this.keys['KeyW']) moveForward += 1;
      if (this.keys['KeyS']) moveForward -= 1;
      if (this.keys['KeyD']) moveRight += 1;
      if (this.keys['KeyA']) moveRight -= 1;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
      if (moveForward !== 0 || moveRight !== 0) {
        rollDir.addScaledVector(forward, moveForward);
        rollDir.addScaledVector(right, moveRight);
      }
    }

    if (rollDir.lengthSq() < 0.001) {
      rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    rollDir.normalize();
    this.rollDirection.copy(rollDir);

    if (this.onRoll) this.onRoll();
    return true;
  }

  createPlayerModel(options = {}) {
    return createPlayerModel(options);
  }

  isBlockSolid(x, y, z) {
    const b = this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b === BLOCKS.AIR || b === BLOCKS.WATER) return false;
    const def = BLOCK_DEFS[b];
    return def && def.solid !== false && !def.plant;
  }

  checkCollision(pos) {
    const hw = this.width / 2;
    const minX = Math.floor(pos.x - hw);
    const maxX = Math.floor(pos.x + hw);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + (this.isSneaking ? 1.5 : this.height));
    const minZ = Math.floor(pos.z - hw);
    const maxZ = Math.floor(pos.z + hw);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isBlockSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    // Fences, fence gates and walls are 1.5 blocks tall (Tutorial:Ranching: too high to jump): the half block above
    // one is solid too. They were plain 1-block cubes, so a player or an animal hopped straight over a fence.
    const below = minY - 1;
    if (pos.y < below + 1.5) for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
      const d = BLOCK_DEFS[this.world.getVoxel(x, below, z)];
      if (d && (d.fence || d.wall || (d.fenceGate && d.solid !== false))) return true;
    }
    return false;
  }

  update(dt) {
    if (dt > 0.1) dt = 0.1; // clamp delta to prevent tunneling

    if (this.health <= 0 && !this.isDead && this.gamemode !== 'creative') {
      this.die();
      return;
    }

    if (this.isDead) {
      if (this.velocity) this.velocity.set(0, 0, 0);
      this.updateCameraAndModel(dt);
      return;
    }

    // The attack cooldown's clock (attackCooldown.js): time since the last swing, restarted when the held item
    // changes, as the wiki's "ticks since the last attack or item switch" says.
    this.secondsSinceSwing = (this.secondsSinceSwing ?? Infinity) + dt;
    const heldNow = this.game?.inventory?.getActiveItem?.() ?? null;
    const heldKey = heldNow ? `${heldNow.id}` : '';
    if (this.lastHeldKey !== undefined && heldKey !== this.lastHeldKey) this.secondsSinceSwing = 0;
    this.lastHeldKey = heldKey;

    // Invulnerability timer countdown
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // Breath and drowning, before the effects tick so `water_breathing` this frame is honoured.
    this.tickBreath(dt);

    // Suffocation in solid opaque blocks (https://minecraft.wiki/w/Damage#Suffocation)
    this.tickSuffocation(dt);

    // Update active status effects (poison, wither, slowness, dolphins_grace, etc.)
    for (const [effect, data] of this.statusEffects.entries()) {
      if(effect==='wither'){
        tickWither(data,dt,amount=>this.takeDamage(amount,null,'wither'));
        if(data.duration<=0)this.statusEffects.delete(effect);
        continue;
      }
      data.duration -= dt;
      // Poison keeps its own inline handling because the "cannot kill" floor is about this player's
      // health, not about the effect table.
      data.tickTimer = (data.tickTimer || 0) + dt;
      if (effect === 'poison' && data.tickTimer >= 1.25) {
        data.tickTimer = 0;
        if (this.health > 1) {
          this.health = Math.max(1, this.health - 1);
          this.sounds?.playHurt?.();
        }
      }
      // Regeneration heals on the same 1.25 s cadence as poison, one point per level, and never past
      // full. Without this a Potion of Regeneration was stored, listed in the HUD and did nothing.
      //
      // This is deliberately the inline form rather than the shared effect table: the potion adds to
      // the player's own natural regeneration instead of replacing it, and
      // tests/itemPotionDrinking.test.js asserts exactly that contribution (level I adds one point,
      // level II two). Routing it through tickEffect made the contribution zero in that window.
      if (effect === 'regeneration' && data.tickTimer >= 1.25) {
        data.tickTimer = 0;
        if (this.health > 0 && this.health < this.maxHealth) {
          this.health = Math.min(this.maxHealth, this.health + (data.level || 1));
        }
      }
      if (data.duration <= 0) {
        this.statusEffects.delete(effect);
      }
    }

    // Cooldown countdowns
    if (this.rollCooldown > 0) this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    if (this.punchCooldown > 0) this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      if (this.punchTimer <= 0) {
        this.isPunching = false;
      }
    }

    // If rolling (Dodge Roll), override horizontal movement with roll impulse
    if (this.isRolling) {
      this.rollTimer -= dt;
      const rollSpeed = 14.5;
      this.velocity.x = this.rollDirection.x * rollSpeed;
      this.velocity.z = this.rollDirection.z * rollSpeed;
      if (this.rollTimer <= 0) {
        this.isRolling = false;
      }
      this.moveWithCollision(dt);
      this.updateCameraAndModel(dt);
      return;
    }

    // Check if player is standing in water
    const blockAtFeet = this.world.getVoxel(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    this.inWater = blockAtFeet === BLOCKS.WATER && this.position.y % 1 < waterHeight(this.world, Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    this.headInWater = this.isEyeInWater();

    // A bot owns only its synthetic controls; modal keyboard suppression still
    // applies to human input while the Agent Terminal stays open.
    const controlsDisabled = this.areControlsDisabled() && !this.botControls;
    if (this.botControls) this.keys = { ...this.botControls };
    if (controlsDisabled) {
      this.keys = {};
      this.isSneaking = false;
      this.isSprinting = false;
    }

    // Validate shield blocking state
    const hasShield = (this.inventory?.getOffhandItem()?.id === 'shield') ||
                      (this.inventory?.getActiveItem()?.id === 'shield');
    if (this.isBlocking && !hasShield) {
      this.isBlocking = false;
    }

    // Determine current speed mode
    this.isSneaking = !controlsDisabled && !!this.keys['ShiftLeft'];
    // Either Control or a double-tapped forward key sprints, and vanilla refuses a sprint at or below six
    // hunger points, which is what makes a sprint cost something.
    const wantsSprint = !!this.keys['ControlLeft'] || this.sprintKeyToggled;
    const canSprint = this.gamemode === 'creative' || typeof this.hunger !== 'number' || this.hunger > 6;
    this.isSprinting = !controlsDisabled && wantsSprint && canSprint && !this.isSneaking && !this.isBlocking;

    // Sprint-swimming (Swimming article): started by sprinting while moving forward with the head under water,
    // refused at 6 hunger or below and under Blindness, and ended by the same conditions or by leaving the water.
    this.updateSwimming(!controlsDisabled && wantsSprint && !this.isSneaking, !controlsDisabled && !!this.keys['KeyW']);

    // A mounted player is driven by AnimalBehaviors or RailSystem. Running normal player
    // gravity/collision here as well made the rider fight the mount every
    // frame, producing visible jitter and immediately cancelling movement.
    // Keep input flags (especially sneak, used to dismount) but let the mount
    // own position, velocity and jump physics.
    if (this.ridingMob || this.game?.riding) {
      this.velocity.set(0, 0, 0);
      this.onGround = true;
      this.updateCameraAndModel(dt);
      return;
    }

    // /attribute ... movement_speed scales the player's speed (advancedCommands.js).
    let targetSpeed = this.selectBaseSpeed() * (this.speedAttributeScale ?? 1);

    if (!this.isFlying && !this.inWater) targetSpeed *= soulSpeedMultiplier(this.world, this);

    // Swiftness and Slowness were read inline here, and the effect table had a copy of the same rule that
    // nothing called. Both now come from `speedMultiplier`, so the two cannot disagree and both scale with
    // level. The inline slowness was a flat 0.6 where vanilla is 15% per level; this is the vanilla value,
    // which makes Slowness IV (0.52) bite much harder than Slowness I (0.85) for the first time -- the
    // Turtle Master and Slowness IV potions both carry level 4.
    targetSpeed *= speedMultiplier(this.statusEffects);
    // Using an item -- eating, drinking, drawing a bow -- slows the player to a fifth of their speed (eating.js).
    if ((this.usingItem || this.bowDraw > 0) && !this.isFlying) targetSpeed *= USING_ITEM_SPEED;

    // Movement direction input
    let moveForward = 0;
    let moveRight = 0;
    if (!controlsDisabled) {
      if (this.keys['KeyW']) moveForward += 1;
      if (this.keys['KeyS']) moveForward -= 1;
      if (this.keys['KeyD']) moveRight += 1;
      if (this.keys['KeyA']) moveRight -= 1;
    }

    // Calculate forward/right vectors based on Yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    // If gathering Ki, player is frozen in place and cannot move or jump
    if (this.isGatheringKi) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      if (!this.isFlying) {
        this.velocity.y -= this.gravity * (this.gravityAttributeScale ?? 1) * dt;
        if (this.velocity.y < -78) this.velocity.y = -78;
      }
      this.moveWithCollision(dt);
      return;
    }

    const moveDir = new THREE.Vector3();
    if (this.isDungeonMode) {
      // Minecraft Dungeons WASD cardinal direction control
      if (!controlsDisabled) {
        if (this.keys['KeyW']) moveDir.z -= 1;
        if (this.keys['KeyS']) moveDir.z += 1;
        if (this.keys['KeyA']) moveDir.x -= 1;
        if (this.keys['KeyD']) moveDir.x += 1;
      }

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        this.yaw = Math.atan2(-moveDir.x, -moveDir.z);
      }
    } else {
      if (moveForward !== 0 || moveRight !== 0) {
        moveDir.addScaledVector(forward, moveForward);
        moveDir.addScaledVector(right, moveRight);
        moveDir.normalize();
      }
    }

    // Horizontal acceleration
    const accel = this.onGround ? 12.0 : 4.0;
    const current = this.inWater && !this.isFlying ? waterCurrent(this.world, Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z)) : {x:0,y:0,z:0};
    // A current pushes at about 1.39 m/s (Water: "25 blocks every 18 seconds"); it was 0.65.
    // A swimmer moves along the look direction, so the level share of the speed shrinks as they look up or down.
    const level = this.isSwimming ? Math.cos(this.pitch || 0) : 1;
    const targetVx = moveDir.x * targetSpeed * level + current.x * CURRENT_PUSH;
    const targetVz = moveDir.z * targetSpeed * level + current.z * CURRENT_PUSH;

    this.velocity.x += (targetVx - this.velocity.x) * Math.min(1.0, accel * dt);
    this.velocity.z += (targetVz - this.velocity.z) * Math.min(1.0, accel * dt);
    if (Math.abs(this.velocity.x) < 1e-4) this.velocity.x = 0;
    if (Math.abs(this.velocity.z) < 1e-4) this.velocity.z = 0;

    // Vertical Movement (Gravity & Jump)
    if (this.isFlying) {
      this.velocity.y = 0;
      if (!controlsDisabled) {
        if (this.keys['Space']) this.velocity.y = this.flySpeed * 0.7;
        if (this.keys['ShiftLeft']) this.velocity.y = -this.flySpeed * 0.7;
      }
    } else if (this.inWater) {
      if (this.isSwimming && moveForward > 0) {
        // Sprint-swimming follows the look direction: looking straight down or up is the fastest way down or up.
        const want = Math.sin(this.pitch || 0) * targetSpeed;
        this.velocity.y += (want - this.velocity.y) * Math.min(1, 6 * dt);
        if (!controlsDisabled && this.keys['Space']) this.velocity.y = Math.max(this.velocity.y, 2.0);
      } else {
        this.velocity.y -= this.gravity * 0.2 * dt;
        if (this.velocity.y < -3.0) this.velocity.y = -3.0;
        if (!controlsDisabled && this.keys['Space']) {
          this.velocity.y = 4.0; // swim upwards
        }
      }
      // "Crouching sinks faster" (Water): a steady push down while the sneak key is held.
      if (!controlsDisabled && this.keys['ShiftLeft'] && !this.keys['Space']) {
        this.velocity.y = Math.max(this.velocity.y - this.gravity * 0.45 * dt, -4.5);
      }
    } else if (this.world && [0, 0.35, -0.35].some(dx => [0, 0.35, -0.35].some(dz => this.world.getVoxel?.(Math.floor(this.position.x + dx), Math.floor(this.position.y), Math.floor(this.position.z + dz)) === BLOCKS.LADDER))) {
      if (!controlsDisabled && (this.keys['Space'] || this.keys['KeyW'])) {
        this.velocity.y = 2.35;
      } else {
        this.velocity.y = Math.max(this.velocity.y - this.gravity * 0.1 * dt, -0.15);
      }
    } else {
      // Normal Gravity
      this.velocity.y -= this.gravity * (this.gravityAttributeScale ?? 1) * dt;
      // Slow Falling holds the descent as well as negating the damage, which is the half a player
      // notices: the landing is gentle rather than merely harmless.
      if (hasSlowFalling(this.statusEffects) && this.velocity.y < -FALL_DAMAGE.slowFallingSpeed) {
        this.velocity.y = -FALL_DAMAGE.slowFallingSpeed;
      }
      if (this.velocity.y < -78) this.velocity.y = -78;

      if (!controlsDisabled && this.onGround && this.keys['Space']) {
        // Jump Boost raises the jump; the fall half of the same effect is in `fallDamage`.
        this.velocity.y = this.jumpForce * (this.jumpAttributeScale ?? 1) * jumpVelocityMultiplier(this.statusEffects);
        // A sprint-jump costs 0.2 exhaustion against 0.05 for a standing jump, which is why
        // sprint-jumping everywhere empties the hunger bar far faster.
        this.addExhaustion(this.isSprinting ? EXHAUSTION.sprintJump : EXHAUSTION.jump);
        this.onGround = false;
        this.sounds.playStep(this.getBlockBelowSound());
      }
    }

    // Apply movement with 3-axis AABB collision
    this.moveWithCollision(dt);

    // Footstep audio
    const horizDist = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z) * dt;
    if (this.onGround && horizDist > 0.001) {
      this.stepDistance += horizDist;
      const stepThreshold = this.isSprinting ? 2.0 : 2.5;
      if (this.stepDistance >= stepThreshold) {
        this.sounds.playStep(this.getBlockBelowSound());
        this.stepDistance = 0;
      }
    }

    // FOV animation for sprinting
    const targetFov = bowFov(this.isSprinting && (moveForward > 0) ? 82 : this.baseFov, this.bowDraw || 0);
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-8 * dt));
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Natural regeneration and starvation, from the vanilla hunger model in src/hunger.js.
    //
    // This used to be a flat `health += dt * 0.3` at any hunger above 18, which is about six times
    // vanilla's fast rate and applied at hunger levels where vanilla regenerates slowly or not at all.
    if (isSurvivalLike(this.gamemode) && !this.isDead) {
      // The void (wiki, Void): "Falling at least 64 blocks into the void ... causes the health of any mob ... to be
      // depleted by about 4 every 10 ticks", whatever armour or effects say. This world's bottom is y 0. It took 10 and
      // teleported the player back up to (8.5, 35, 8.5), which vanilla never does (Tutorial:Accessing the void).
      if (this.position.y < -64) {
        this.voidDamageTimer = (this.voidDamageTimer ?? 0) - dt;
        if (this.voidDamageTimer <= 0) { this.voidDamageTimer = 0.5; this.takeDamage(4, null, 'void'); }
      } else this.voidDamageTimer = 0;
      // Sprinting and swimming add exhaustion continuously, which is what makes sprinting cost
      // something. Vanilla charges per block travelled, so the rate is scaled by distance moved.
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.inWater && speed > 0.05) {
        this.addExhaustion(EXHAUSTION.swim * speed * dt);
      } else if (this.isSprinting && speed > 0.05) {
        this.addExhaustion(EXHAUSTION.sprint * speed * dt);
      }
      this.updateHungerModel(dt);
    }

    // Update 3D Camera & Player Model Position
    this.updateCameraAndModel(dt);
  }

  /**
   * Ensure the hunger state exists and is in sync with the player's own fields.
   *
   * A Player can be created with Object.create(Player.prototype), which skips the constructor --
   * several tests do exactly that, and one of them started throwing the moment these methods assumed
   * the constructor had run. Initialising lazily means the model works for those too.
   */
  ensureHungerState() {
    if (!this._hungerState) this._hungerState = createHungerState();
    if (typeof this.hunger !== 'number') this.hunger = MAX_HUNGER;
    if (typeof this.saturation !== 'number') this.saturation = 5;
    if (typeof this.exhaustion !== 'number') this.exhaustion = 0;
    this._hungerState.hunger = this.hunger;
    this._hungerState.saturation = this.saturation;
    this._hungerState.exhaustion = this.exhaustion;
    return this._hungerState;
  }

  /**
   * Add exhaustion, paying it out of saturation and then hunger.
   *
   * Kept as a thin wrapper over the pure model in src/hunger.js rather than reimplementing the
   * arithmetic, so the tested model is the one that runs.
   */
  addExhaustion(amount) {
    if (this.gamemode !== 'survival') return;
    const state = this.ensureHungerState();
    addExhaustion(state, amount);
    this.hunger = state.hunger;
    this.saturation = state.saturation;
    this.exhaustion = state.exhaustion;
  }

  /**
   * The authoritative difficulty.
   *
   * `game.difficulty` is what every mob behaviour, the spawner and the boot path read, so the player reads it
   * too rather than keeping a second copy that silently goes stale the moment the difficulty changes.
   * `this.difficulty` is the fallback for the Player-shaped stubs the tests drive, which have no game -- and
   * for a Player built before it is attached to one.
   */
  get difficultyLevel() {
    // `trim` as well as `toLowerCase`: the value indexes the starvation-floor and mob-damage tables by key,
    // and a stray space would silently miss every one of them and fall through to the default.
    return String(this.game?.difficulty ?? this.difficulty ?? 'normal').trim().toLowerCase();
  }

  /** One tick of regeneration, starvation and the difficulty floor. */
  updateHungerModel(dt) {
    const state = this.ensureHungerState();
    // The Hunger effect: "0.1 exhaustion per second, per Hunger status effect level" (Food). Its table entry and
    // `exhaustionFor` existed and nothing called them, so rotten flesh's food poisoning cost nothing.
    const hungerEffect = this.statusEffects?.get?.('hunger');
    if (hungerEffect && (hungerEffect.duration ?? 0) > 0 && this.difficultyLevel !== 'peaceful') {
      addExhaustion(state, HUNGER_EFFECT_EXHAUSTION_PER_SECOND * Math.max(1, Math.floor(hungerEffect.level ?? 1)) * dt);
    }
    const result = tickHunger(state, dt, {
      peaceful: this.difficultyLevel === 'peaceful',
      naturalRegeneration: gameruleFor(this.game, 'naturalRegeneration'),
      health: this.health,
      maxHealth: this.maxHealth,
    });
    this.hunger = this._hungerState.hunger;
    this.saturation = this._hungerState.saturation;
    this.exhaustion = this._hungerState.exhaustion;

    if (result.heal > 0 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + result.heal);
    }
    if (result.starve > 0 && this.health > 0) {
      // Starvation is floored by difficulty, so it cannot kill on easy or normal.
      // Wiki (Food, Starvation): on Hard it "does not stop at any health threshold". The old test
      // `health - starve > floor` skipped the last fraction, so a starving Hard player hung on at 0.02 HP.
      const floor = starvationFloor(this.difficultyLevel);
      if (this.health > floor) {
        this.health = Math.max(floor, this.health - result.starve);
      }
    }
  }

  /** Eat something, adding hunger and saturation the way vanilla does. */
  eatFood(hungerPoints, saturationPoints = 0) {
    this._hungerState.hunger = this.hunger;
    this._hungerState.saturation = this.saturation;
    this._hungerState.exhaustion = this.exhaustion;
    eat(this._hungerState, hungerPoints, saturationPoints);
    this.hunger = this._hungerState.hunger;
    this.saturation = this._hungerState.saturation;
    this.exhaustion = this._hungerState.exhaustion;
  }

  moveWithCollision(dt) {
    // A spectator "can ... go through blocks and entities": no collision at all.
    if (modeRules(this.gamemode).noclip) {
      this.isFlying = true;
      this.position.addScaledVector(this.velocity, dt);
      this.onGround = false;
      return;
    }
    const oldPos = this.position.clone();
    const newPos = this.position.clone();

    // 1. Move X
    newPos.x += this.velocity.x * dt;
    if (this.isSneaking && this.onGround && !this.hasGroundAhead(newPos.x, this.position.z)) {
      newPos.x = oldPos.x;
      this.velocity.x = 0;
    } else if (this.checkCollision(newPos)) {
      // Try step climbing (half block / full block step up)
      const stepPos = newPos.clone();
      stepPos.y += 1.05;
      if (this.onGround && !this.checkCollision(stepPos)) {
        newPos.y += 1.05;
      } else {
        newPos.x = oldPos.x;
        this.velocity.x = 0;
      }
    }

    // 2. Move Z
    newPos.z += this.velocity.z * dt;
    if (this.isSneaking && this.onGround && !this.hasGroundAhead(newPos.x, newPos.z)) {
      newPos.z = oldPos.z;
      this.velocity.z = 0;
    } else if (this.checkCollision(newPos)) {
      // Try step climbing
      const stepPos = newPos.clone();
      stepPos.y += 1.05;
      if (this.onGround && !this.checkCollision(stepPos)) {
        newPos.y += 1.05;
      } else {
        newPos.z = oldPos.z;
        this.velocity.z = 0;
      }
    }

    // 3. Move Y, swept in steps under half a block. At falling speed one frame moved more than a block, so a long
    // fall ended inside the ground block, snapped to the wrong block top and counted a block too many: a 22-block
    // drop (19 damage in Java) measured 23 and killed (Shelters play-test).
    const startY = newPos.y, stepY = this.velocity.y * dt;
    const parts = Math.max(1, Math.ceil(Math.abs(stepY) / 0.45));
    for (let i = 0; i < parts; i++) {
      newPos.y += stepY / parts;
      if (i < parts - 1 && this.checkCollision(newPos)) break;
    }
    if (this.velocity.y < 0) {
      this.fallDistance += Math.max(0, startY - newPos.y);
    }
    this.onGround = false;
    if (this.checkCollision(newPos)) {
      if (this.velocity.y < 0) {
        // Bed bounce check
        const blockBelow = this.world?.getVoxel(Math.floor(this.position.x), Math.floor(newPos.y - 0.1), Math.floor(this.position.z));
        if (this.game?.bedManager?.handleBedBounce(this, blockBelow)) {
          this.onGround = false;
        } else {
          this.onGround = true;
          // Farmland trample check (landing from jump or height on farmland)
          const belowX = Math.floor(this.position.x);
          const belowY = Math.floor(newPos.y - 0.1);
          const belowZ = Math.floor(this.position.z);
          if (this.game?.farmingManager?.checkTrample) {
            this.game.farmingManager.checkTrample(this, belowX, belowY, belowZ, this.fallDistance);
          }
          // Snap to top of block. The fall counted this whole step, but the player stops at the block top: take the
          // overshoot back off, or a fall gained up to a block at speed (a 22-block drop dealt 20 and killed, where
          // Java deals 19; Shelters play-test).
          const overshoot = Math.ceil(newPos.y) - newPos.y;
          this.fallDistance = Math.max(0, this.fallDistance - overshoot);
          newPos.y = Math.ceil(newPos.y);
          const fell = this.fallDistance;
          this.velocity.y = 0;
          this.fallDistance = 0;
          this.applyFallDamage(fell, belowY);
        }
      } else {
        // Bump head
        newPos.y = Math.floor(newPos.y + (this.isSneaking ? 1.5 : this.height)) - (this.isSneaking ? 1.5 : this.height);
        this.velocity.y = 0;
      }
    }

    this.game?.modRuntime?.constrainMovement?.(this, newPos);

    this.position.copy(newPos);
  }

  hasGroundAhead(x, z) {
    const yBelow = Math.floor(this.position.y - 0.2);
    return this.isBlockSolid(x, yBelow, z);
  }

  getBlockBelowSound() {
    const blockBelow = this.world.getVoxel(Math.floor(this.position.x), Math.floor(this.position.y - 0.5), Math.floor(this.position.z));
    const def = BLOCK_DEFS[blockBelow];
    return (def && def.sound) ? def.sound : 'grass';
  }

  /**
   * The flat damage this player's outgoing hits gain from strength and weakness.
   *
   * Lives here so the melee call site needs no import from the effect module, and so a test can ask a
   * Player rather than reaching into its effect map.
   *
   * Vanilla adds a flat amount per level rather than scaling the hit, so this is a number of HP to add
   * and not a multiplier: Strength II adds six damage to a wooden sword and six to a netherite one.
   */
  attackDamageBonus() {
    return attackDamageBonus(this.statusEffects);
  }

  /** The multiplier this player's incoming damage takes from resistance. */
  damageTakenMultiplier() {
    return damageTakenMultiplier(this.statusEffects);
  }

  /**
   * The enchantment lists of the four worn armour pieces, for effects that roll per piece.
   *
   * Returns an array of arrays rather than a flat list because thorns procs INDEPENDENTLY on each piece,
   * so two level-III pieces are two 45% rolls and not one 90% roll.
   */
  armourEnchantmentLists() {
    const armour = this.inventory?.armor;
    if (!armour) return [];
    const lists = [];
    for (const slotKey of ['head', 'chest', 'legs', 'feet']) {
      const piece = armour[slotKey];
      lists.push(Array.isArray(piece?.enchantments) ? piece.enchantments : []);
    }
    return lists;
  }

  /**
   * Wear the armour for damage taken, the way a tool wears for use.
   *
   * Vanilla charges every worn piece `max(1, floor(damage / 4))` points per hit, with unbreaking rolled
   * per piece. Armour that never wears out is an infinite shield, which is why this is here now that a
   * durability system exists.
   *
   * @param {number} damage the damage actually taken, after reductions
   * @returns {string[]} the slots whose piece broke
   */
  wearArmour(damage) {
    const armour = this.inventory?.armor;
    if (!armour || !(damage > 0)) return [];
    const perPiece = Math.max(1, Math.floor(damage / 4));
    const roll = typeof this.random === 'function' ? this.random : Math.random;
    const broken = [];
    for (const slotKey of ['head', 'chest', 'legs', 'feet']) {
      const piece = armour[slotKey];
      if (!piece) continue;
      const wear = spendDurability(piece, perPiece, roll);
      if (wear.broke) {
        armour[slotKey] = null;
        broken.push(slotKey);
      }
    }
    return broken;
  }

  /**
   * The base movement speed for the player's current state, before status effects and soul speed.
   *
   * Extracted from `update` so the stairs of conditionals -- and the depth strider factor inside the
   * water branch -- can be asserted directly. Driving `update` to reach this line needs most of a game
   * engine stubbed, and an untestable branch is one that quietly stops being applied.
   */
  /** True when the eye is inside water, below that block's surface. Water plants count: they are waterlogged. */
  isEyeInWater() {
    if (!this.world || typeof this.world.getVoxel !== 'function') return false;
    const x = Math.floor(this.position.x), z = Math.floor(this.position.z);
    const eyeY = this.position.y + (this.eyeHeight ?? 1.62);
    const y = Math.floor(eyeY);
    const id = this.world.getVoxel(x, y, z);
    if (BLOCK_DEFS[id]?.waterPlant) return true;
    return id === BLOCKS.WATER && eyeY - y < waterHeight(this.world, x, y, z);
  }

  /**
   * Start, keep or end sprint-swimming, and lay the player flat or stand them up to match.
   *
   * Swimming article: sprint-swimming starts with the sprint key while moving, "is not possible at 6 hunger (3
   * drumsticks) or below, or while Blindness is active", and ends when hunger drops to 6 or below. The start also
   * needs the head under water (Water: "Sprinting while fully submerged enters swim mode"); keeping it only needs
   * the player in water, so a swimmer at the surface does not flicker in and out of it.
   */
  updateSwimming(wantsSprint, movingForward) {
    const allowed = this.inWater && !this.isFlying && canSprintSwim({
      wantsSprint, movingForward,
      hunger: this.hunger,
      blind: Boolean(this.hasStatusEffect?.('blindness')),
      creative: this.gamemode === 'creative',
    });
    if (!this.isSwimming && allowed && this.headInWater) this.isSwimming = true;
    else if (this.isSwimming && !allowed) this.isSwimming = false;
    this.applySwimPose();
  }

  /** One block tall while swimming; back to full height only where there is room to stand. */
  applySwimPose() {
    if (this.isSwimming) {
      this.height = SWIMMING_HEIGHT;
      this.eyeHeight = SWIMMING_EYE_HEIGHT;
      return;
    }
    if (this.height >= 1.8) return;
    if (this.hasHeadroom(1.8)) {
      this.height = 1.8;
      this.eyeHeight = 1.62;
    }
  }

  /** Is there room for the player to be `height` tall where they are? */
  hasHeadroom(height) {
    const hw = (this.width ?? 0.6) / 2;
    const top = Math.floor(this.position.y + height - 0.001);
    for (let y = Math.floor(this.position.y + this.height); y <= top; y++) {
      for (const [dx, dz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) {
        if (this.isBlockSolid(this.position.x + dx, y, this.position.z + dz)) return false;
      }
    }
    return true;
  }

  selectBaseSpeed() {
    if (this.isFlying) return this.flySpeed;
    if (this.isBlocking) return this.sneakSpeed;
    // Sprint-swimming, from the Swimming article: about 3.918 m/s, and 5.305 with Depth Strider III.
    if (this.isSwimming) {
      let speed = sprintSwimSpeed(this.armourEnchantmentLevel('depth_strider'));
      if (this.hasStatusEffect('dolphins_grace')) speed *= 2.2;
      return speed;
    }
    if (this.isSprinting && !this.inWater) return this.sprintSpeed;
    if (this.isSneaking && !this.inWater) return this.sneakSpeed;
    if (this.inWater) {
      // Swimming article: 2.20 blocks/s on the surface of still water, 1.97 partially submerged. Sprinting at the
      // surface without swimming does not outrun this, which is why the old land sprint speed no longer applies.
      let speed = this.headInWater ? SWIM_SPEED.submerged : SWIM_SPEED.surface;
      // Depth Strider "increases water movement efficiency by 1/3" per level (Water), so at level III the water
      // speed has caught up with walking. Capped at III, which is vanilla's maximum.
      const strider = Math.min(3, Math.max(0, Math.floor(this.armourEnchantmentLevel('depth_strider') || 0)));
      speed += (this.walkSpeed - speed) * (strider / 3);
      if (this.hasStatusEffect('dolphins_grace')) speed *= 2.2;
      return speed;
    }
    return this.walkSpeed;
  }

  /**
   * The highest level of an enchantment across the worn armour, or 0.
   *
   * The highest rather than the sum, because that is how a single-piece effect works: depth strider only
   * usefully exists on boots, and two pieces carrying the same enchantment do not stack in vanilla.
   */
  armourEnchantmentLevel(id) {
    let level = 0;
    for (const list of this.armourEnchantmentLists()) {
      for (const ench of list) {
        if (ench?.id === id && typeof ench.level === 'number') level = Math.max(level, ench.level);
      }
    }
    return level;
  }

  /**
   * Damage the player for a fall, taking the landing block into account.
   *
   * Called on landing with the distance fallen before it was reset. The effect half of the rule lives in
   * `statusEffects.fallDamage`, next to the distance it modifies; what is here is the block the player
   * landed on, and the armour that reduces it is already handled inside `takeDamage`.
   *
   * A bed bounce never reaches this, because the bounce is checked first and returns through its own
   * branch -- which is why `tests/bed.test.js` can assert that landing on a bed negates fall damage.
   *
   * Returns the health actually lost rather than the amount asked for, because Feather Falling and armour
   * both reduce it inside `takeDamage` and a caller that wants to know what a landing cost wants the
   * truth. Creative mode, invulnerability frames and a harmless landing all report zero.
   */
  /**
   * Breath and drowning.
   *
   * Wiki (Water, "Drowning"): "Players and mobs (except aquatic mobs, undead mobs and iron golems) have a
   * breath meter that lasts 15 seconds. After they run out of breath, they take 2 HP drowning damage every
   * second until they die, surface, or enter bubble columns." Respiration grants +15 seconds per level and,
   * once the meter is empty, an x/(x+1) chance of taking no damage at all (so I averages 1 HP/s, II 2/3, III
   * 1/2).
   *
   * The meter drains only while the HEAD is under water. `this.inWater` is measured at the feet, so a player
   * standing in a one-block puddle has wet feet and dry lungs and must not drown.
   */
  tickBreath(dt) {
    const respiration = this.armourEnchantmentLevel ? this.armourEnchantmentLevel('respiration') : 0;
    const capacity = 15 + respiration * 15;
    if (this.gamemode === 'creative' || this.gamemode === 'spectator' || this.isDead) {
      this.breath = capacity;
      this.drownTimer = 0;
      return;
    }
    const head = this.world?.getVoxel(
      Math.floor(this.position.x),
      Math.floor(this.position.y + (this.eyeHeight ?? 1.62)),
      Math.floor(this.position.z),
    );
    // A bubble column is air for breathing, which is what lets one be used as a lift out of the water.
    const eyeUnderwater = typeof this.isEyeInWater === 'function' ? this.isEyeInWater() : (head === BLOCKS.WATER);
    const inWaterBlock = eyeUnderwater || head === BLOCKS.WATER || Boolean(BLOCK_DEFS[head]?.waterPlant);
    const hasAirPocket = head === BLOCKS.BUBBLE_COLUMN || head === BLOCKS.AIR;
    const immuneToDrowning = Boolean(this.hasStatusEffect?.('water_breathing') || this.hasStatusEffect?.('conduit_power'));
    const submerged = inWaterBlock && !hasAirPocket && !immuneToDrowning;
    if (!submerged) {
      this.breath = capacity;
      this.drownTimer = 0;
      return;
    }
    if (this.breath > 0) {
      this.breath = Math.max(0, this.breath - dt);
      this.drownTimer = 0;
      return;
    }
    this.drownTimer += dt;
    if (this.drownTimer < 1) return;
    this.drownTimer -= 1;
    if (respiration > 0 && Math.random() < respiration / (respiration + 1)) return;
    const allowsDrowning = this.game ? (gameruleFor(this.game, 'drowningDamage') !== false) : true;
    if (allowsDrowning) {
      this.takeDamage(2, null, 'drowning');
    }
  }

  /**
   * True if a block is a solid opaque full cube that causes suffocation when inside it.
   */
  isSuffocatingBlock(blockId) {
    if (!blockId || blockId === BLOCKS.AIR || blockId === BLOCKS.WATER || blockId === BLOCKS.LAVA) return false;
    const def = BLOCK_DEFS[blockId];
    if (!def) return false;
    if (def.solid === false || def.transparent === true || def.plant === true) return false;
    if (def.shape && def.shape !== 'cube') return false;
    return true;
  }

  /**
   * Suffocation damage in solid blocks (https://minecraft.wiki/w/Damage#Suffocation).
   * 1 damage (half a heart) every 0.5s while head is trapped in a solid opaque block.
   */
  tickSuffocation(dt) {
    if (this.gamemode === 'creative' || this.gamemode === 'spectator' || this.isDead) {
      this.suffocationTimer = 0;
      return;
    }
    const x = Math.floor(this.position.x);
    const eyeY = this.position.y + (this.isSneaking ? 1.38 : (this.eyeHeight ?? 1.62));
    const y = Math.floor(eyeY);
    const z = Math.floor(this.position.z);
    const blockId = this.world?.getVoxel?.(x, y, z);
    if (!this.isSuffocatingBlock(blockId)) {
      this.suffocationTimer = 0;
      return;
    }
    this.suffocationTimer = (this.suffocationTimer || 0) + dt;
    if (this.suffocationTimer >= 0.5) {
      this.suffocationTimer -= 0.5;
      this.takeDamage(1, null, 'suffocation');
    }
  }

  applyFallDamage(fallDistance, blockY) {
    if (!(fallDistance > 0)) return 0;
    // Wiki (Water): "Water of any depth prevents any entity, including the player, from sustaining falling
    // damage if they fall into it, regardless of the distance fallen." Doing this BEFORE the damage
    // calculation is the point: a dive to the bottom of a pool is a long fall that must cost nothing, and
    // this checked only the fall-absorbing blocks (hay, slime, honey), so water took full damage.
    const landed = this.world?.getVoxel(Math.floor(this.position.x), blockY, Math.floor(this.position.z));
    if (this.inWater || landed === BLOCKS.WATER) return 0;
    let damage = fallDamage(fallDistance, this.statusEffects);
    if (damage <= 0) return 0;
    const factor = FALL_ABSORBING_BLOCKS.get(landed);
    if (factor !== undefined) damage *= factor;
    damage = Math.floor(damage);
    if (damage <= 0) return 0;
    const before = this.health;
    this.takeDamage(damage, null, 'fall');
    return before - this.health;
  }

  takeDamage(amount, sourcePos = null, damageType = 'generic', attacker = null) {
    // Taking damage is tiring in vanilla, at 0.1 exhaustion per instance.
    if (isSurvivalLike(this.gamemode) && amount > 0) this.addExhaustion(EXHAUSTION.damage);

    // Creative takes none; a spectator only the void's and /kill's (gameModeRules.js).
    if (!takesDamage(this.gamemode, damageType)) return;
    if (this.isDead) return;
    // The invulnerability window is the one a MELEE or projectile hit opens, so that a mob swinging twice in
    // one tick cannot hit twice. Vanilla's effect damage -- Wither, Instant Damage, Poison -- is not subject
    // to it, and this gate used to swallow the whole of it: Wither III ticks every 2 s / 2^2 = 0.5 s, which is
    // exactly the window a Wither hit opens, so a level III wither did no damage at all beyond its first
    // tick, and the Wither boss's 0.5 s skull cadence was eaten the same way.
    // Void damage too: it applies "irrespective of ... invulnerability" (Void).
    const effectDamage = damageType === 'wither' || damageType === 'magic' || damageType === 'void';
    if (this.invulnerableTimer > 0 && !effectDamage) return;

    if (this.hasStatusEffect('fire_resistance') && ['fire', 'lava', 'burn'].includes(damageType)) return;

    // Shield blocking check: 100% deflection within frontal 180° cone
    const hasShield = (this.inventory?.getOffhandItem()?.id === 'shield') ||
                      (this.inventory?.getActiveItem()?.id === 'shield');
    if (this.isBlocking && hasShield && !['fall','starvation','void','wither','drowning','suffocation'].includes(damageType)) {
      let blocked = true;
      if (sourcePos) {
        const toSource = new THREE.Vector3(sourcePos.x - this.position.x, 0, sourcePos.z - this.position.z).normalize();
        const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
        // Dot product >= 0 means source is within frontal 180-degree cone
        if (forward.dot(toSource) < 0) {
          blocked = false;
        }
      }

      if (blocked) {
        this.sounds.playShieldBlock?.();
        if (['arrow', 'projectile', 'trident', 'fireball', 'snowball', 'egg', 'wind_charge'].includes(damageType)) advancementEvent('deflect');
        this.invulnerableTimer = 0.2;
        // Blocking costs the shield a point of durability.
        //
        // The shield was registered as durable -- `FIXED_DURABILITY` gives it 336 -- and nothing ever spent
        // any of it, so a shield was permanent. That is the same gap tool durability and armour durability
        // each had, and the third and last piece of it.
        //
        // Durability: "When the shield blocks an attack dealing more than 3 HP, it takes damage equal to the
        // strength of the attack (rounded down) plus 1" -- and nothing for a weaker one (toolWear.js). This charged a
        // flat point per blocked hit.
        const shieldCost = shieldWear(amount);
        if (this.gamemode === 'survival' && shieldCost > 0) {
          const shield = this.inventory?.getOffhandItem?.()?.id === 'shield'
            ? this.inventory.getOffhandItem()
            : this.inventory?.getActiveItem?.();
          if (shield && shield.id === 'shield') {
            const roll = typeof this.random === 'function' ? this.random : Math.random;
            const wear = spendDurability(shield, shieldCost, roll);
            if (wear.broke) {
              this.ui?.addChatMessage?.('<span style="color:#ef4444;">Your shield broke.</span>');
            }
          }
        }
        return;
      }
    }

    // Critical counter-hit: taking damage while gathering Ki cancels skill and deals 1.5x damage
    if (this.isGatheringKi) {
      amount = Math.round(amount * 1.5);
      this.isGatheringKi = false;
      if (this.onKiInterrupted) {
        this.onKiInterrupted();
      }
    }

    // Armor damage mitigation (Minecraft Java Edition formula)
    // Formula: A_eff = max(A / 5, A - D / (2 + T / 4)), DamageReduction = min(20, max(0, A_eff)) / 25
    if (damageType !== 'void' && damageType !== 'starvation' && damageType !== 'fall' && damageType !== 'drowning' && damageType !== 'suffocation') {
      const armor = this.inventory ? this.inventory.getTotalArmorPoints() : 0;
      const toughness = this.inventory ? this.inventory.getTotalArmorToughness() : 0;
      if (armor > 0 && damageType !== 'wither') {
        const effectiveArmor = Math.max(armor / 5, armor - amount / (2 + toughness / 4));
        const damageReduction = Math.min(20, Math.max(0, effectiveArmor)) / 25;
        amount = amount * (1 - damageReduction);
      }

      // Resistance reduces what actually gets through, after armour, which is the order vanilla uses.
      // The level cap lives in statusEffects.js so every caller gets it.
      const resistance = damageTakenMultiplier(this.statusEffects);
      if (resistance !== 1) amount = amount * resistance;

      // Protection enchantment reduction (4% per point, up to 80%).
      //
      // Which of the four protection enchantments answers depends on the source: Fire Protection for the
      // fire and lava paths, Blast Protection for explosions, Projectile Protection for arrows, and
      // Protection for the rest. Only Protection was read here, so the other three were obtainable from
      // an enchanting table and did nothing at all.
      const epf = protectionPoints(this.armourEnchantmentLists(), damageType);
      if (epf > 0) {
        const protReduction = Math.min(0.8, epf * 0.04);
        amount = amount * (1 - protReduction);
      }
    }

    // Feather Falling enchantment mitigation on fall damage
    if (damageType === 'fall' && this.inventory?.armor?.feet) {
      const boots = this.inventory.armor.feet;
      if (Array.isArray(boots.enchantments)) {
        const ff = boots.enchantments.find(e => e.id === 'feather_falling');
        if (ff) {
          amount = amount * Math.max(0.1, 1 - ff.level * 0.15);
        }
      }
    }

    // Absorption is a shield, not a heal: it takes the damage first and does not come back. Vanilla
    // spends it before the health bar, which is why a golden apple can save a player from a hit that
    // would otherwise be fatal without putting any health back.
    if (this.absorption > 0 && amount > 0) {
      const absorbed = Math.min(this.absorption, amount);
      this.absorption -= absorbed;
      amount -= absorbed;
    }

    this.health = Math.max(0, this.health - amount);
    // Effect damage does not open a window of its own: two wither ticks are two hits, and Wither III ticks
    // every 0.5 s precisely because it is meant to hurt.
    if (!effectDamage) this.invulnerableTimer = 0.5;
    if (sourcePos && Number.isFinite(sourcePos.x) && this.health > 0) {
      const push = this.position.clone().sub(sourcePos).setY(0).normalize();
      this.velocity.addScaledVector(push, 3);
      this.velocity.y = Math.max(this.velocity.y, 2.5);
    }
    // Guarded like the other hurt-sound call above: a caller may supply a partial sounds object (the
    // terminal-controls test does), and a missing beep must not break the damage itself.
    this.sounds?.playHurt?.();

    // Armour wears for the damage that got through. In vanilla every worn piece is charged, so this runs
    // after the reductions rather than on the raw amount.
    const noWearTypes = ['drowning', 'suffocation', 'starvation', 'void', 'freeze', 'wither', 'magic'];
    if (amount > 0 && this.gamemode === 'survival' && !noWearTypes.includes(damageType)) {
      const broken = this.wearArmour(amount);
      for (const slotKey of broken) {
        this.ui?.addChatMessage?.(
          `<span style="color:#ef4444;">Your ${slotKey} armour broke.</span>`);
      }
    }

    // Thorns reflects on to whoever struck. Reported through a hook rather than applied here, because
    // damaging a mob is the mob manager's job and the player should not reach into it -- the same reason
    // `onKiInterrupted` exists.
    //
    // The hook receives the damage SOURCE POSITION as well as the attacker, because most call sites pass
    // only a position: `mobs.js` calls `takeDamage(amount, mob.mesh.position, mob.type)` in four places and
    // changing them all would mean editing a file another agent is actively working in. The position is
    // enough for the receiver to identify the mob, and an explicit attacker is used directly when a
    // caller does provide one.
    //
    // Rolled only when the player survived: a fatal blow has nothing to reflect from, and fall and void
    // damage have no attacker by definition.
    if (this.health > 0 && damageType !== 'fall' && damageType !== 'void' && (attacker || sourcePos)) {
      // `this.random` is injectable so a test can force the proc on or off. Without it the thorns roll is
      // 45% at level III, which makes every assertion about it flaky -- and makes the NEGATIVE assertions
      // pass for the wrong reason half the time. `rollLoot` in mobLootData.js uses the same pattern.
      const roll = typeof this.random === 'function' ? this.random : Math.random;
      const reflect = thornsReflect(this.armourEnchantmentLists(), roll);
      if (reflect.damage > 0) this.onThornsReflect?.(attacker || null, reflect.damage, reflect.procs, sourcePos);
    }

    // Totem of Undying: held in either hand it "prevents the death of the holder", leaving 1 HP, clearing the
    // effects and granting Regeneration II (45 s), Absorption II (5 s) and Fire Resistance (40 s); the void and /kill
    // bypass it. It had no effect at all (found by the advancement guide play-test, "Postmortal").
    if (this.health <= 0 && !['void', 'kill', 'outOfWorld'].includes(damageType) && this.useTotemOfUndying()) return;
    if (this.health <= 0) {
      this.die();
    }

    // Damage red flash indicator
    if (typeof document !== 'undefined') {
      const canvas = document.getElementById('canvas-container');
      if (canvas) {
        canvas.style.filter = 'sepia(1) saturate(5) hue-rotate(-50deg)';
        setTimeout(() => { canvas.style.filter = 'none'; }, 150);
      }
    }
  }

  /** Spend a Totem of Undying from the main hand or off hand to survive. True when one was used. */
  useTotemOfUndying() {
    const inv = this.inventory;
    if (!inv) return false;
    const off = inv.getOffhandItem?.() ?? inv.offhand;
    const main = inv.getActiveItem?.();
    let used = false;
    if (main?.id === 'totem_of_undying') { inv.consumeActiveItem?.(1); used = true; }
    else if (off?.id === 'totem_of_undying') { if (off.count > 1) off.count--; else if ('offhand' in inv) inv.offhand = null; used = true; }
    if (!used) return false;
    this.health = 1;
    for (const effect of [...(this.statusEffects?.keys?.() ?? [])]) this.clearStatusEffect?.(effect);
    this.applyStatusEffect?.('regeneration', 45, 2);
    this.applyStatusEffect?.('absorption', 5, 2);
    this.applyStatusEffect?.('fire_resistance', 40, 1);
    this.game?.ui?.updateHotbar?.();
    advancementEvent('totem');
    return true;
  }

  /**
   * Die.
   *
   * The inventory drop is a **transaction**, and it is idempotent: `isDead` guards the whole method, and
   * `deathDropsDone` guards the drop separately, so a second damage callback or a repeated death cannot drop
   * the same items twice.
   */
  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.health = 0;
    if (this.velocity) this.velocity.set(0, 0, 0);

    // Cancel ongoing actions
    this.isGatheringKi = false;
    this.isRolling = false;

    // Vanilla's "Score" is the experience the player held when they died, so it is read before the drop.
    const score = getTotalXpForLevel(this.level || 0) + Math.floor(this.exp || 0);
    this.dropInventoryOnDeath();

    const handled = this.game?.modRuntime?.onPlayerDeath?.(this);
    this.isDungeonMode = false;
    if (handled) return;

    // Vanilla: the "You died!" screen with the score, Respawn and Title Screen. The gamerule
    // doImmediateRespawn skips the screen and respawns at once. (The tournament's "Match Defeat" overlay
    // belongs to the tournament mod, which handles its own deaths above.)
    if (this.game?.gamerules?.doImmediateRespawn === true) {
      this.respawn();
      return;
    }
    if (typeof document !== 'undefined') {
      const scoreEl = document.getElementById('death-score');
      if (scoreEl) scoreEl.textContent = String(score);
      document.getElementById('death-overlay')?.classList.remove('hidden');
      if (document.exitPointerLock) document.exitPointerLock();
    }
  }

  /**
   * Drop what the player was carrying, once.
   *
   * `keepInventory` is Java's gamerule and preserves the items and the experience, so it is checked here
   * rather than at the call site.
   *
   * @returns {{dropped:number, xpPoints:number, kept:boolean}|null} null when already done
   */
  dropInventoryOnDeath() {
    if (this.deathDropsDone) return null;
    this.deathDropsDone = true;

    if (this.game?.modRuntime?.keepInventoryOnDeath?.()) return { dropped: 0, xpPoints: 0, kept: true };

    const keep = this.game?.gamerules?.keepInventory === true
      || this.game?.settings?.keepInventory === true;
    if (keep) return { dropped: 0, xpPoints: 0, kept: true };

    const inv = this.inventory;
    const drops = collectDeathDrops(inv);
    const origin = this.position?.clone ? this.position.clone() : this.position;
    for (const stack of drops) {
      this.game?.entities?.spawnDroppedItem?.(origin, stack.id, stack.isBlock, stack.count);
    }

    const loss = xpLossFor(this.xpLevel ?? this.level ?? 0);
    this.xpLevel = 0;
    this.level = 0;
    this.xp = 0;
    this.exp = 0;
    if (loss.points > 0) {
      this.game?.entities?.spawnXpOrbs?.(origin, loss.points);
    }

    // The carried inventory is gone. Crafting grid and results are a workspace, not owned items.
    inv?.clearCarried?.();
    // And shown to be gone: the hotbar and XP bar kept drawing the dropped items and level until something
    // else redrew them, and picking a slot that looked full found it empty.
    this.game?.ui?.updateHotbar?.();
    this.game?.ui?.updateStats?.();
    return { dropped: drops.length, xpPoints: loss.points, kept: false };
  }

  respawn() {
    // A complete reset, first, on EVERY path.
    //
    // This used to restore only health and hunger, and the bed branch `return`ed before the
    // `statusEffects.clear()` at the end -- so poison, fire, absorption and every other transient survived
    // death for anyone who had bound a bed.
    resetSurvivalState(this);
    // Death resets "time since rest" too (Phantom), so a respawned player is not hunted by phantoms at once.
    this.game?.mobs?.hostileBehaviors?.resetSleep?.();
    this.game?.spawnManager?.specialSpawners?.phantom?.reset?.();
    this.deathDropsDone = false;
    this.isDungeonMode = false;
    if (this.velocity) this.velocity.set(0, 0, 0);

    if (typeof document !== 'undefined') {
      const defeatOverlay = document.getElementById('defeat-overlay');
      if (defeatOverlay) {
        defeatOverlay.classList.remove('visible');
        defeatOverlay.classList.add('hidden');
      }
      document.getElementById('death-overlay')?.classList.add('hidden');
    }

    if (this.game?.modRuntime?.respawn?.(this)) return;

    // Hardcore: no respawn -- the player spectates from where they died (Tutorial:Hardcore mode: "the game will switch
    // you to spectator mode and can never switch back").
    if (this.game?.settings?.hardcore) {
      this.setGameMode?.('spectator');
      if (this.game.settings) this.game.settings = { ...this.game.settings, gameMode: 'spectator' };
      this.game?.ui?.addChatMessage?.('Game over! You are now spectating this world.', 'system');
      return;
    }

    // Which anchor, revalidated now rather than trusted from when it was set: a spot that was safe before
    // death can be blocked afterwards.
    const decision = resolveRespawn({
      anchorPosition: consumeAnchorRespawn(this),
      validAnchor: !!this.anchorSpawn,
      bedPosition: this.bedSpawnPosition ?? null,
      // The bed block itself; a save from before that was recorded has only the stand spot, which is next to the bed.
      isBedStillThere: (bed) => this.bedBlockPosition ? this.isBedStillThere(this.bedBlockPosition)
        : [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => this.isBedStillThere({ x: bed.x + dx, y: bed.y, z: bed.z + dz })),
      isSpaceSafe: (pos) => this.isRespawnSpaceSafe(pos),
      // /spawnpoint (vanillaCommands.js) sets the player's own respawn point; /setworldspawn the world's.
      worldSpawn: this.commandSpawnPosition || this.spawnPosition || new THREE.Vector3(1.5, 27.0, -1.5),
    });

    if (decision.lostBed) {
      this.game?.ui?.addChatMessage?.('Your home bed was missing or obstructed', 'system');
      this.bedSpawnPosition = null;
      this.bedBlockPosition = null;
    }
    if (decision.blocked) {
      // Reported rather than silently placing the player inside a block.
      this.game?.ui?.addChatMessage?.('Your spawn point was obstructed', 'system');
    }
    this.position.copy(decision.position);
    this.lastRespawnSource = decision.source;
  }

  /** Is the bed this binding points at still there? */
  isBedStillThere(bed) {
    const bx = Math.floor(bed.x);
    const by = Math.floor(bed.y);
    const bz = Math.floor(bed.z);
    const v = this.world?.getVoxel(bx, by, bz);
    if (v === BLOCKS.RED_BED_FOOT || v === BLOCKS.RED_BED_HEAD || BLOCK_DEFS[v]?.bed) return true;
    return this.game?.bedManager?.getBed?.(bx, by, bz) != null;
  }

  /** Is there room to stand here? Checked at respawn, not only when the bed was bound. */
  isRespawnSpaceSafe(pos) {
    if (!pos || !this.world?.getVoxel) return false;
    const bx = Math.floor(pos.x);
    const by = Math.floor(pos.y);
    const bz = Math.floor(pos.z);
    const feet = this.world.getVoxel(bx, by, bz);
    const head = this.world.getVoxel(bx, by + 1, bz);
    const below = this.world.getVoxel(bx, by - 1, bz);
    const solid = (id) => {
      const def = BLOCK_DEFS[id];
      return id !== BLOCKS.AIR && def && def.solid !== false && !def.plant;
    };
    return !solid(feet) && !solid(head) && solid(below);
  }

  applyStatusEffect(effect, duration = 30, level = 1) {
    // A higher level overwrites a lower one and a longer duration overwrites a shorter one, which is
    // vanilla's rule: "It is not possible to apply the same effect multiple times... higher levels
    // overwrite lower levels, and higher durations overwrite lower durations of the same level." The map
    // already held one entry per effect; this keeps a weaker or shorter application from cutting a
    // stronger or longer running one short, which it previously did on every sip.
    const current = this.statusEffects.get(effect);
    if (current) {
      const runningLevel = Math.floor(current.level ?? 1);
      const incomingLevel = Math.floor(level) || 1;
      const runningDuration = current.duration ?? 0;
      // The incoming effect wins when it is stronger, or equal in strength and at least as long.
      if (runningLevel > incomingLevel) return;
      if (runningLevel === incomingLevel && runningDuration >= duration) return;
    }
    this.statusEffects.set(effect, { duration, level, tickTimer: 0 });
    // Absorption is a pool rather than a per-tick rule, so the shield is raised here, where the effect
    // starts, and spent in `takeDamage`. A second application takes the larger shield instead of adding,
    // so two golden apples back to back do not stack into sixteen points.
    if (effect === 'absorption') {
      // `|| 0` because several tests drive a Player-shaped stub that never ran the constructor, and
      // `Math.max(undefined, 4)` is NaN -- an invisible shield of NaN absorbs nothing and poisons every
      // later comparison.
      this.absorption = Math.max(this.absorption || 0, absorptionShield(this.statusEffects));
    }
    if (this.game?.ui?.addChatMessage) {
      const name = effect.replace(/_/g, ' ').toUpperCase();
      this.game.ui.addChatMessage(`<span style="color:#c084fc;">[Effect] Applied ${name} (${Math.round(duration)}s)</span>`, 'system');
    }
  }

  clearStatusEffect(effect) {
    this.statusEffects.delete(effect);
  }

  /**
   * The one place the game mode changes.
   *
   * There were three paths before this: the pause-menu button, the chat command, and the building studio.
   * Only the command path cleared Creative flight, so toggling to Survival from the menu left the player
   * flying with Creative abilities, and the studio set `gamemode` directly with no cleanup at all.
   *
   * Entering Survival disables Creative flight and the Creative-only item abilities. It does **not** touch
   * the inventory: Minecraft preserves your items when you change mode, and the plan is explicit that only a
   * fresh ordinary world starts empty.
   *
   * @returns {{previous:string, mode:string, changed:boolean}}
   */
  setGameMode(mode) {
    const next = normaliseGameMode(mode);
    const previous = this.gamemode;
    this.gamemode = next;
    if (next !== 'creative') {
      // The two abilities that are Creative-only, and the ones a later toggle used to leave behind.
      this.isFlying = false;
      this.elytraActive = false;
      this.elytraFlight = false;
    }
    // "Spectators are always flying" (Spectator page).
    if (modeRules(next).alwaysFlying) this.isFlying = true;
    return { previous, mode: next, changed: previous !== next };
  }

  /** Creative abilities: flight, instant breaking and unlimited blocks all follow this. */
  hasCreativeAbilities() {
    return this.gamemode === 'creative';
  }

  hasStatusEffect(effect) {
    return this.statusEffects.has(effect);
  }

  getViewVector(target = new THREE.Vector3()) {
    const dx = -Math.sin(this.yaw) * Math.cos(this.pitch);
    const dy = Math.sin(this.pitch);
    const dz = -Math.cos(this.yaw) * Math.cos(this.pitch);
    return target.set(
      Math.abs(dx) < 1e-10 ? 0 : dx,
      Math.abs(dy) < 1e-10 ? 0 : dy,
      Math.abs(dz) < 1e-10 ? 0 : dz
    ).normalize();
  }

  getEyePosition(target = new THREE.Vector3()) {
    const eyeY = this.position.y + (this.isSneaking ? 1.38 : (this.eyeHeight || 1.62));
    return target.set(this.position.x, eyeY, this.position.z);
  }

  updateCameraAndModel(dt) {
    const eyeY = this.position.y + (this.isSneaking ? 1.38 : this.eyeHeight);

    // Animate 3D Model limbs
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;

      // Synchronize equipped armor on 3D player model
      if (typeof this.model.updateArmor === 'function') {
        this.model.updateArmor(this.inventory?.armor);
      }

      if (this.isRolling) {
        // Full 360 forward flip roll animation
        const rollProgress = Math.max(0, Math.min(1.0, 1.0 - (this.rollTimer / this.rollDuration)));
        this.model.rotation.x = rollProgress * Math.PI * 2;
        this.model.leftLeg.rotation.x = -1.2;
        this.model.rightLeg.rotation.x = -1.2;
        this.model.leftArm.rotation.x = 1.5;
        this.model.rightArm.rotation.x = 1.5;
        this.model.head.rotation.x = 0;
      } else {
        this.model.rotation.x = 0;
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const walkTime = performance.now() * 0.008;
        const legSwing = Math.sin(walkTime) * Math.min(1.0, speed * 0.3);

        this.model.leftLeg.rotation.x = legSwing;
        this.model.rightLeg.rotation.x = -legSwing;
        // Punch arm forward thrust animation
        if (this.isPunching && this.punchTimer > 0) {
          const punchProg = Math.sin((1.0 - this.punchTimer / this.punchDuration) * Math.PI);
          // Torso rotates into punch
          if (this.model.torso) this.model.torso.rotation.y = -0.4 * punchProg;
          // Right arm raises horizontally and punches forward from shoulder
          this.model.rightArm.rotation.x = -Math.PI / 2 - 0.25 * punchProg;
          this.model.rightArm.rotation.y = -0.25 * punchProg;
          this.model.rightArm.position.set(0.38, 1.375, -0.6 * punchProg);
          // Left arm raises into martial arts guard stance
          this.model.leftArm.rotation.x = -0.8 * punchProg;
          this.model.leftArm.position.set(-0.38, 1.375, 0.25 * punchProg);
        } else {
          if (this.model.torso) this.model.torso.rotation.y = 0;
          this.model.leftArm.rotation.x = -legSwing;
          this.model.rightArm.rotation.x = legSwing;
          this.model.leftArm.rotation.y = 0;
          this.model.rightArm.rotation.y = 0;
          this.model.leftArm.position.set(-0.38, 1.375, 0);
          this.model.rightArm.position.set(0.38, 1.375, 0);
        }

        this.model.head.rotation.x = this.isDungeonMode ? 0 : this.pitch;
      }
    }

    // Position Camera based on Dungeon Mode or perspective
    if (this.isDungeonMode) {
      if (this.model) this.model.visible = true;
      const targetCamPos = this.position.clone().add(this.dungeonCameraOffset);
      this.camera.position.lerp(targetCamPos, Math.min(1.0, 8.0 * (dt || 0.016)));
      this.camera.lookAt(this.position.x, this.position.y + 0.8, this.position.z);
    } else if (this.perspective === 0) {
      // 1st Person
      if (this.model) this.model.visible = false;
      this.camera.position.set(this.position.x, eyeY, this.position.z);
      if (this.camera.up?.set) this.camera.up.set(0, 1, 0);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
      this.camera.rotation.z = 0;
      if (typeof document !== 'undefined') {
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = 'block';
      }
    } else {
      // Third Person (Perspective 1: Back, Perspective 2: Front)
      const camData = calculateThirdPersonCamera(this, this.world);
      this.camera.position.copy(camData.position);
      if (this.camera.up?.set) this.camera.up.set(0, 1, 0);
      this.camera.lookAt(camData.lookTarget);
      if (this.model) {
        this.model.visible = camData.showModel;
      }
      if (typeof document !== 'undefined') {
        const crosshair = document.getElementById('crosshair');
        if (crosshair) crosshair.style.display = camData.showCrosshair ? 'block' : 'none';
      }
    }
  }
}
