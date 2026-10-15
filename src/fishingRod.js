// The fishing rod, in the world: casting, the bobber and its line, the bite, and the reel.
//
// References: https://minecraft.wiki/w/Fishing · https://minecraft.wiki/w/Fishing_Rod
//
// Loot and timing rules live in fishing.js. This controller advances them with
// accumulated simulation ticks and provides swept casting, floating and feedback.
//
// Shaped after `BowController`, which is the same kind of thing -- a use-item feature with a state machine
// driven from the frame loop.
import { advancementEvent } from './advancements.js';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { maxDurabilityFor, spendDurability } from './durability.js';
import { addPlayerExperience } from './experience.js';
import { resolveItem } from './commands.js';
import { waterSurfaceAt, isWaterCell } from './waterContact.js';
import { FishingEffects } from './fishingEffects.js';
import {
  ENCHANTMENT_REGISTRY, eligibleEnchantments, enchantmentEntry, levelForCost, selectEnchantments,
} from './enchanting.js';
import {
  LINE_BREAK_DISTANCE,
  OPEN_WATER_BLOCK,
  TREASURE_EXCLUDED_ENCHANTMENTS,
  advanceWait,
  isJunkGear,
  isOpenWater,
  isTreasureGear,
  reelDurability,
  rollBiteApproachSeconds,
  rollBiteWindowSeconds,
  rollCatch,
  rollFishingXp,
  rollJunkDamage,
  rollTreasureDurabilityRemaining,
  rollTreasureEnchantLevel,
  rollWaitTicks,
  totalLuck,
} from './fishing.js';

/** Fixed flight steps and a separate accumulated 20 Hz fishing clock. */
const SIMULATION_STEP = 1 / 60;

/** How close the bobber has to be to a mob or a dropped item to hook it. */
const HOOK_RANGE = 0.3;

/**
 * Blocks that do not stop the bobber being "directly exposed to sun or moonlight".
 *
 * Wiki: "all blocks above the bobber must be transparent to sunlight, such as glass and carpet. Blocks that
 * diffuse sky light (such as ice and leaves) negate direct exposure." Ice and leaves are therefore absent
 * from this list on purpose -- they are the two examples the wiki gives of blocks that do NOT count.
 */
const TRANSPARENT_TO_SKY = new Set([
  BLOCKS.AIR, BLOCKS.GLASS, BLOCKS.TORCH,
].filter(v => typeof v === 'number'));

/** Water plants and bubble columns are waterlogged, so they read as water rather than as an obstruction. */
const WATERLOGGED = new Set([
  BLOCKS.SEAGRASS, BLOCKS.KELP, BLOCKS.KELP_PLANT, BLOCKS.BUBBLE_COLUMN,
].filter(v => typeof v === 'number'));

/** The states the rod moves through. `idle` means no bobber in the world. */
export const FISHING_STATE = Object.freeze({
  IDLE: 'idle',
  CASTING: 'casting',
  HOOKED: 'hooked',
  WAITING: 'waiting',
  APPROACHING: 'approaching',
  BITING: 'biting',
});

/**
 * The fishing rod.
 *
 * One instance per game, updated every frame like the bow. `cast()` is called on right-click and returns true
 * when it consumed the click, so the caller knows not to go on to place a block.
 */
export class FishingController {
  constructor(game) {
    this.game = game;
    this.effects = new FishingEffects(game.scene);
    this.reset();
  }

  /** Back to no bobber. Does not touch durability: the wiki is explicit that abandoning costs nothing. */
  reset() {
    this.state = FISHING_STATE.IDLE;
    this.bobber = null;
    this.line = null;
    this.waitTicks = 0;
    this.approachLeft = 0;
    this.biteLeft = 0;
    this.trailTimer = 0;
    this.hooked = null;
    this.stuckInBlock = false;
    this.catchPending = null;
    this.waterBlock = null;
    this.surfaceY = undefined;
    this.velocity = new THREE.Vector3();
    this.accumulator = 0;
    this.waitAccumulator = 0;
    this.elapsed = 0;
  }

  /** True while a bobber is out. */
  get active() {
    return this.state !== FISHING_STATE.IDLE;
  }

  /** The fishing rod the player is holding, or null. */
  rod() {
    const item = this.game?.inventory?.getActiveItem?.();
    if (!item || item.isBlock || item.id !== 'fishing_rod') return null;
    return item;
  }

  /** The level of one enchantment on a stack. Enchantments are `[{ id, level }]`. */
  enchantLevel(stack, id) {
    const found = stack?.enchantments?.find?.(e => e?.id === id);
    return Math.max(0, found?.level ?? 0);
  }

  /**
   * Right-click.
   *
   * With no bobber out this casts; with one out it reels. Either way it returns true when the rod handled the
   * click, which is what keeps the rod from also trying to place itself as a block.
   */
  cast() {
    if (!this.rod()) return false;
    if (this.active) {
      this.reel();
      return true;
    }
    return this.beginCast();
  }

  beginCast() {
    const g = this.game;
    const origin = this.eyePosition();
    const direction = g.camera.getWorldDirection(new THREE.Vector3());

    this.buildBobber(origin.addScaledVector(direction, 0.3));
    // Launch from the player, rather than teleporting to the look-ray hit.
    this.velocity.copy(direction).multiplyScalar(15);
    this.velocity.y += 2;
    this.state = FISHING_STATE.CASTING;
    g.heldItemRenderer?.recoil?.();
    g.sounds?.playBowShoot?.();
    this.updateLine();
    return true;
  }

  /** Roll a fresh wait, and start it. */
  beginWait() {
    const lure = this.enchantLevel(this.rod(), 'lure');
    let ticks = rollWaitTicks(Math.random, { lureLevel: lure });
    // Wiki: "If it causes the wait time to be less than 0, a new wait time is generated in the next tick."
    // Modelled as a re-roll on the spot, which is the same distribution and one frame of difference.
    let guard = 0;
    while (ticks < 0 && guard++ < 16) ticks = rollWaitTicks(Math.random, { lureLevel: lure });
    this.waitTicks = Math.max(0, ticks);
    this.state = FISHING_STATE.WAITING;
    this.waitAccumulator = 0;
    this.updateFloat();
  }

  /** Sweep every flight step; thin walls must not be skipped at low frame rates. */
  updateFlight(dt) {
    const world = this.game.world;
    this.velocity.y -= 9.8 * dt;
    const origin = this.bobber.position.clone();
    const displacement = this.velocity.clone().multiplyScalar(dt);
    const steps = Math.max(1, Math.ceil(displacement.length() / 0.08));
    for (let i = 1; i <= steps; i++) {
      const point = origin.clone().addScaledVector(displacement, i / steps);
      const { x, y, z } = point;
      const bx = Math.floor(x);
      const by = Math.floor(y);
      const bz = Math.floor(z);
      const voxel = world.getVoxel(bx, by, bz);
      this.bobber.position.copy(point);
      const hook = this.findHookTarget();
      if (hook) { this.hooked = hook; this.state = FISHING_STATE.HOOKED; this.velocity.set(0,0,0); return; }
      if (isWaterCell(voxel)) {
        const water = waterSurfaceAt(world, x, y, z);
        if (y > water.surfaceY) continue;
        this.waterBlock = { x: water.x, y: water.y, z: water.z };
        this.surfaceY = water.surfaceY;
        this.velocity.set(0,0,0);
        this.bobber.position.y = this.surfaceY;
        this.effects.splash(this.bobber.position);
        this.game.sounds?.playSplash?.();
        this.beginWait();
        return;
      }
      if (voxel !== BLOCKS.AIR && BLOCK_DEFS[voxel]?.solid !== false) {
        this.bobber.position.copy(origin.clone().addScaledVector(displacement, (i - 1) / steps));
        this.stuckInBlock = true;
        this.state = FISHING_STATE.WAITING;
        this.waitTicks = Infinity;
        this.velocity.set(0,0,0);
        return;
      }
    }
  }

  eyePosition() {
    const p = this.game.player.position;
    return new THREE.Vector3(p.x, p.y + (this.game.player.eyeHeight ?? 1.62), p.z);
  }

  // --- the bobber and its line -------------------------------------------------------------------------

  buildBobber(point) {
    const scene = this.game.scene;
    const bobber = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    );
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0xc0392b }),
    );
    cap.position.y = 0.02;
    bobber.add(body, cap);
    bobber.position.copy(point);
    scene.add(bobber);

    const geometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 17 }, () => point.clone()));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
    scene.add(line);

    this.bobber = bobber;
    this.line = line;
  }

  removeBobber() {
    const scene = this.game.scene;
    for (const object of [this.bobber, this.line]) {
      if (!object) continue;
      scene?.remove(object);
      object.traverse(child => { child.geometry?.dispose(); child.material?.dispose(); });
    }
    this.bobber = null;
    this.line = null;
  }

  /** Keep the line drawn from the rod tip to the bobber. */
  updateLine() {
    if (!this.line || !this.bobber) return;
    const tip = this.eyePosition();
    const dir = this.game.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0)).normalize();
    tip.addScaledVector(dir, 0.7).addScaledVector(right, 0.25).add(new THREE.Vector3(0, -0.2, 0));
    const positions = this.line.geometry.attributes.position;
    const sag = Math.min(0.75, tip.distanceTo(this.bobber.position) * 0.04);
    for (let i = 0; i < positions.count; i++) {
      const t = i / (positions.count - 1);
      const p = tip.clone().lerp(this.bobber.position, t);
      p.y -= Math.sin(Math.PI * t) * sag;
      positions.setXYZ(i, p.x, p.y, p.z);
    }
    positions.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
  }

  // --- the world questions the model needs -------------------------------------------------------------

  /**
   * How one block reads for the open-water test.
   *
   * The engine stores water as one block id with a level, where 0 is a source and anything above it is
   * flowing -- which is exactly the distinction the wiki draws: "flowing water is not allowed in any layers".
   */
  sampleBlock(bx, by, bz) {
    const world = this.game.world;
    const voxel = world.getVoxel(bx, by, bz);
    if (voxel === BLOCKS.WATER) {
      const level = world.getWaterLevel ? world.getWaterLevel(bx, by, bz) : 0;
      return level > 0 ? OPEN_WATER_BLOCK.FLOWING : OPEN_WATER_BLOCK.WATER;
    }
    // A lily pad is the one thing the wiki lets sit in an air layer, and it is non-colliding.
    if (voxel === BLOCKS.AIR || voxel === BLOCKS.LILY_PAD) return OPEN_WATER_BLOCK.AIR;
    // Waterlogged plants occupy a water cell without blocking it.
    if (WATERLOGGED.has(voxel) || BLOCK_DEFS[voxel]?.waterPlant) return OPEN_WATER_BLOCK.WATER;
    return OPEN_WATER_BLOCK.OTHER;
  }

  /** True when the bobber is in open water, which is what gates treasure. */
  openWater() {
    if (!this.waterBlock || !this.bobber) return false;
    const { x, y, z } = this.waterBlock;
    return isOpenWater((bx, by, bz) => this.sampleBlock(bx, by, bz), x, y, z);
  }

  /** Wiki: whether the bobber is directly exposed to the sky, and whether it is raining there. */
  conditions() {
    if (!this.bobber) return { exposedToSky: false, raining: false };
    const bx = Math.floor(this.bobber.position.x);
    const by = Math.floor(this.bobber.position.y);
    const bz = Math.floor(this.bobber.position.z);
    return { exposedToSky: this.exposedToSky(bx, by, bz), raining: this.rainingAt(bx, bz, this.bobber.position.y) };
  }

  /** Walk up from the bobber; anything opaque to sky light ends direct exposure. */
  exposedToSky(bx, by, bz) {
    const world = this.game.world;
    for (let y = by + 1; y < by + 64; y++) {
      const voxel = world.getVoxel(bx, y, bz);
      if (voxel === BLOCKS.AIR) continue;
      const def = BLOCK_DEFS?.[voxel];
      if (TRANSPARENT_TO_SKY.has(voxel)) continue;
      // A block the registry marks as not blocking light also lets sky light through.
      if (def && !def.leaves && !/ice|leaves/i.test(def.name ?? '') && (def.transparent === true || def.opacity === 0 || def.carpet)) continue;
      return false;
    }
    return true;
  }

  rainingAt(bx, bz, y=this.bobber?.position.y??22) {
    const weather = this.game.weather;
    if(weather?.isRainingAt)return weather.isRainingAt(bx,y,bz);
    if (!weather?.isRaining?.()) return false;
    // Wiki: the bobber must be "located in a biome where it is currently raining".
    const biome = this.game.world.getBiome?.(bx, bz);
    return weather.isRainingInBiome ? weather.isRainingInBiome(biome) : true;
  }

  // --- hooking -----------------------------------------------------------------------------------------

  /**
   * Wiki: "Fish mobs do not attempt to bite the fish hook and bobber, but can be hooked and reeled as with
   * other mobs", and reeling a dropped item costs 3 durability against 5 for an entity.
   */
  findHookTarget() {
    if (!this.bobber) return null;
    const pos = this.bobber.position;
    let best = null;
    let bestDistance = HOOK_RANGE;

    for (const mob of this.game.mobs?.mobs ?? []) {
      if (!mob?.mesh?.position || mob.health <= 0) continue;
      if (mob.type === 'fishing_bobber') continue;
      if (mob.mesh.position.distanceTo(pos) > 8) continue;
      const box = new THREE.Box3().setFromObject(mob.mesh);
      const d = box.isEmpty() ? mob.mesh.position.distanceTo(pos) : box.distanceToPoint(pos);
      if (d < bestDistance) { bestDistance = d; best = { kind: 'mob', ref: mob }; }
    }
    for (const drop of this.game.entities?.droppedItems ?? []) {
      const position = (drop?.group ?? drop?.mesh)?.position;
      if (!position || drop.collected) continue;
      const d = position.distanceTo(pos);
      if (d < bestDistance) { bestDistance = d; best = { kind: 'item', ref: drop }; }
    }
    return best;
  }

  // --- the frame ---------------------------------------------------------------------------------------

  update(dt) {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    dt = Math.min(dt, 0.25);
    this.effects.update(dt);
    if (!this.active) return;
    const g = this.game;

    // Wiki: "If the player wanders more than 32 blocks away from the bobber, or if the player stops holding
    // the fishing rod, the bobber and fishing line disappear with no durability reduction to the rod."
    if (!this.rod()) { this.cancel(); return; }
    if (this.bobber && this.bobber.position.distanceTo(this.eyePosition()) > LINE_BREAK_DISTANCE) {
      this.cancel();
      return;
    }

    this.accumulator += dt;
    while (this.accumulator + 1e-9 >= SIMULATION_STEP && this.active) {
      this.accumulator -= SIMULATION_STEP;
      this.elapsed += SIMULATION_STEP;
      this.step(SIMULATION_STEP);
      if (this.bobber?.position.distanceTo(this.eyePosition()) > LINE_BREAK_DISTANCE) this.cancel();
    }
    this.updateLine();
  }

  step(dt) {
    if (this.state === FISHING_STATE.CASTING) { this.updateFlight(dt); return; }
    if (this.hooked) {
      const position = (this.hooked.ref.group ?? this.hooked.ref.mesh)?.position;
      if (!position || this.hooked.ref.collected || this.hooked.ref.health <= 0) { this.cancel(); return; }
      this.bobber.position.copy(position);
      return;
    }
    if (!this.stuckInBlock) this.updateFloat();

    if (this.state === FISHING_STATE.WAITING) {
      if (this.waitTicks === Infinity) return;   // landed on ground: nothing will ever bite
      // `dt` is seconds; the wait is in ticks, and the wiki counts at 20 to the second.
      this.waitAccumulator += dt * 20;
      while (this.waitAccumulator + 1e-9 >= 1) {
        this.waitAccumulator -= 1;
        this.waitTicks = advanceWait(this.waitTicks, this.conditions());
      }
      if (this.waitTicks <= 0) {
        this.state = FISHING_STATE.APPROACHING;
        this.approachLeft = rollBiteApproachSeconds(Math.random);
        this.approachDuration = this.approachLeft;
        this.approachAngle = Math.random() * Math.PI * 2;
      }
      return;
    }

    if (this.state === FISHING_STATE.APPROACHING) {
      this.approachLeft -= dt;
      this.emitTrail(dt);
      if (this.approachLeft <= 0) {
        this.state = FISHING_STATE.BITING;
        this.biteLeft = rollBiteWindowSeconds(Math.random);
        this.splash();
      }
      return;
    }

    if (this.state === FISHING_STATE.BITING) {
      this.biteLeft -= dt;
      // Wiki: missing the window means "the waiting time resets".
      if (this.biteLeft <= 0) this.beginWait();
    }
  }

  updateFloat() {
    if (!this.waterBlock || !this.bobber) return;
    const p = this.bobber.position;
    const water = waterSurfaceAt(this.game.world, p.x, this.waterBlock.y, p.z);
    if (!water) {
      this.waterBlock = null;
      this.state = FISHING_STATE.CASTING;
      this.velocity.set(0,0,0);
      return;
    }
    this.waterBlock = { x: water.x, y: water.y, z: water.z };
    this.surfaceY = water.surfaceY;
    // Dipping is an offset from the surface, not a permanent subtraction on each bite.
    p.y = water.surfaceY + Math.sin(this.elapsed * 3.5) * 0.025 - (this.state === FISHING_STATE.BITING ? 0.28 : 0);
  }

  /** The wiki's serpentine trail of fishing particles, approaching the bobber. */
  emitTrail(dt) {
    if (!this.bobber) return;
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.08;
    const remaining = Math.max(0, this.approachLeft / (this.approachDuration || 1));
    const distance = remaining * 3.5;
    const angle = this.approachAngle + Math.sin(this.elapsed*8)*0.14;
    const point = this.bobber.position.clone();
    point.x += Math.cos(angle)*distance;
    point.z += Math.sin(angle)*distance;
    const water = waterSurfaceAt(this.game.world, point.x, this.waterBlock.y, point.z);
    if (water) { point.y = water.surfaceY; this.effects.ripple(point); }
  }

  /** The bobber dipping below the surface when something takes it. */
  splash() {
    if (!this.bobber) return;
    this.effects.splash(new THREE.Vector3(this.bobber.position.x, this.surfaceY, this.bobber.position.z));
    this.updateFloat();
    this.game.sounds?.playSplash?.();
  }

  // --- reeling -----------------------------------------------------------------------------------------

  /** Reel in. This is where the durability, the loot and the XP are settled. */
  reel() {
    if (!this.active) return;
    const rod = this.rod();
    const biting = this.state === FISHING_STATE.BITING && !this.hooked;
    const hooked = this.hooked;

    const cost = reelDurability({
      caught: biting,
      stuckInBlock: this.stuckInBlock,
      hookedItem: hooked?.kind === 'item',
      hookedEntity: hooked?.kind === 'mob',
    });

    // Wiki: pulling a mob or a dropped item drags it to the player.
    if (hooked) this.pullTowardPlayer(hooked.ref);

    let caught = null;
    if (biting) caught = this.awardCatch();
    if (caught) advancementEvent('fish', { item: caught?.id ?? caught });

    if (rod && cost > 0) {
      spendDurability(rod, cost, Math.random);
      this.game.ui?.updateHotbar?.();
    }

    this.removeBobber();
    const wasBiting = biting;
    this.reset();
    if (wasBiting && caught) {
      this.game.ui?.addChatMessage?.(`Caught ${caught}`, 'system');
    }
    this.game.heldItemRenderer?.recoil?.();
  }

  /** Roll the catch, give it to the player and award the XP. */
  awardCatch() {
    const g = this.game;
    const rod = this.rod();
    const luckLevel = totalLuck({
      luckOfTheSea: this.enchantLevel(rod, 'luck_of_the_sea'),
      // Wiki: "The Luck status effect grants the same benefit."
      luckEffect: g.player?.statusEffects?.get?.('luck')?.level ?? 0,
    });
    const bx = this.waterBlock?.x ?? Math.floor(this.bobber?.position.x ?? 0);
    const bz = this.waterBlock?.z ?? Math.floor(this.bobber?.position.z ?? 0);
    const caught = rollCatch(Math.random, {
      luckLevel,
      openWater: this.openWater(),
      biomeId: g.world.getBiome?.(bx, bz) ?? null,
    });

    const stack = this.makeStack(caught);
    this.giveToPlayer(stack);

    // Wiki: "An experience orb worth 1-6 experience points spawns at the position of the player."
    const xp = rollFishingXp(Math.random);
    if (g.entities?.spawnXpOrbs) g.entities.spawnXpOrbs(g.player.position.clone(), xp);
    else addPlayerExperience(g.player, xp, g.sounds, g.ui);
    return stack.name;
  }

  /**
   * Turn a rolled catch into an item stack, applying the durability and enchantment rules its category
   * carries.
   *
   * `resolveItem` is the same lookup `/give` uses, so a fished item is the identical stack to a given one --
   * which matters for the 720 block item forms, where the stack has to carry the numeric block id.
   */
  makeStack(caught) {
    const resolved = resolveItem(caught.item);
    const stack = {
      id: resolved.ok ? resolved.id : caught.item,
      isBlock: resolved.ok ? resolved.isBlock : false,
      count: caught.count,
      name: resolved.ok ? resolved.display : caught.item,
    };

    const max = maxDurabilityFor(typeof stack.id === 'string' ? stack.id : caught.item);

    if (caught.category === 'treasure' && isTreasureGear(caught.item)) {
      // Wiki: treasure gear is "enchanted at a random level between 22 and 30 and [has] 0-25% durability
      // remaining", with the enchantment probabilities of a level-30 table and the chance of multiple
      // enchantments NOT reduced. The level is what fishing rolls; the table's own rules pick the rest.
      const level = rollTreasureEnchantLevel(Math.random);
      stack.enchantments = this.rollTreasureEnchantments(caught.item, level);
      if (max) {
        stack.durability = Math.max(1, Math.floor(rollTreasureDurabilityRemaining(Math.random) * max));
      }
    } else if (caught.category === 'junk' && isJunkGear(caught.item)) {
      // Wiki: junk rods and boots are "0-90% damaged (i.e., have 10-100% durability remaining) and always
      // unenchanted".
      if (max) stack.durability = Math.max(1, Math.floor((1 - rollJunkDamage(Math.random)) * max));
    }
    return stack;
  }

  /**
   * Roll the enchantments for a treasure item at a given level.
   *
   * Uses the enchanting table's own selection, so "the chance of multiple enchantments is not reduced" holds
   * the same way it does at a real table, and the wiki's three exclusions are passed as a hard exclude.
   */
  rollTreasureEnchantments(itemId, level, random = Math.random) {
    const candidates = eligibleEnchantments(itemId, {
      allowTreasure: true,
      exclude: [...TREASURE_EXCLUDED_ENCHANTMENTS],
    });
    if (!candidates.length) return [];
    const keys = selectEnchantments(candidates, level, random);
    const out = [];
    for (const key of keys) {
      const entry = enchantmentEntry(key, Math.max(1, levelForCost(ENCHANTMENT_REGISTRY[key], level)));
      if (entry) out.push(entry);
    }
    return out;
  }

  /** Launch real loot towards the player; normal pickup handles collision/full inventories. */
  giveToPlayer(stack) {
    const g = this.game;
    if (g.entities?.spawnDroppedItem && this.bobber) {
      const pos = this.bobber.position.clone();
      pos.y = (this.surfaceY ?? pos.y) + 0.22;
      const countBefore = g.entities.droppedItems?.length ?? 0;
      g.entities.spawnDroppedItem(pos, stack.id, stack.isBlock === true, stack.count ?? 1, { itemData: stack, enchantments: stack.enchantments, durability: stack.durability, pickupDelay: 0.1 });
      const drop = g.entities.droppedItems?.length > countBefore ? g.entities.droppedItems.at(-1) : null;
      if (drop?.velocity) {
        const target = new THREE.Vector3(g.player.position.x, g.player.position.y + 0.8, g.player.position.z);
        const direction = target.sub(pos);
        const flightTime = Math.min(1.25, 0.4 + direction.length() * 0.04);
        drop.velocity.copy(direction).divideScalar(flightTime);
        // Match the dropped-item system's 18 blocks/s² gravity.
        drop.velocity.y += 9 * flightTime;
      }
      return;
    }
    if (g.inventory?.addItem?.(stack)) {
      g.ui?.updateHotbar?.();
    }
  }

  pullTowardPlayer(target) {
    const position = (target.group ?? target.mesh)?.position;
    if (!position) return;
    const direction = this.eyePosition().sub(position);
    const distance = direction.length();
    if (target.velocity?.addScaledVector) target.velocity.addScaledVector(direction, 0.1);
    else if (distance > 0.001) position.addScaledVector(direction.normalize(), Math.min(distance, 0.75));
  }

  /** Abandon the line: no durability, no loot. Used by the 32-block rule and by losing pointer lock. */
  cancel() {
    this.removeBobber();
    this.effects.clear();
    this.reset();
  }
}
