// The fishing rod, in the world: casting, the bobber and its line, the bite, and the reel.
//
// References: https://minecraft.wiki/w/Fishing · https://minecraft.wiki/w/Fishing_Rod
//
// The numbers and the rolls all live in `fishing.js`, which is pure and fully tested. This file is the part
// that needs a world, and it is kept thin on purpose: it decides WHEN to call the model and what to do with
// the answer, and it makes no parity decisions of its own.
//
// Shaped after `BowController`, which is the same kind of thing -- a use-item feature with a state machine
// driven from the frame loop.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { maxDurabilityFor, spendDurability } from './durability.js';
import { addPlayerExperience } from './experience.js';
import { resolveItem } from './commands.js';
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

/** The reach of a cast, in blocks. The wiki's line breaks at 32, so 33 is far enough to be useless. */
const CAST_REACH = 33;

/** How close the bobber has to be to a mob or a dropped item to hook it. */
const HOOK_RANGE = 1.6;

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

    const hit = this.findCastingPoint(origin, direction);
    // Casting at open air does nothing at all. Vanilla lets the bobber fly and fall back; there is no water
    // or ground to land on here, so there is nothing to model.
    if (!hit) return true;

    const { point, water, stuck } = hit;
    this.buildBobber(point);
    this.stuckInBlock = stuck;
    this.waterBlock = water ? { x: point.x, y: point.y, z: point.z } : null;

    if (water) {
      this.beginWait();
    } else {
      // Landed on ground. Vanilla keeps the bobber there, and reeling it in costs 2 durability.
      this.state = FISHING_STATE.WAITING;
      this.waitTicks = Infinity;
    }
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
  }

  /** March the look ray to the first block, and report whether it was water. */
  findCastingPoint(origin, direction) {
    const world = this.game.world;
    const step = 0.25;
    for (let t = 1; t <= CAST_REACH; t += step) {
      const x = origin.x + direction.x * t;
      const y = origin.y + direction.y * t;
      const z = origin.z + direction.z * t;
      const bx = Math.floor(x);
      const by = Math.floor(y);
      const bz = Math.floor(z);
      const voxel = world.getVoxel(bx, by, bz);
      if (voxel === BLOCKS.WATER) {
        // Float to the top of the column, which is where the wiki says the bobber sits.
        let top = by;
        while (top < 320 && world.getVoxel(bx, top + 1, bz) === BLOCKS.WATER) top++;
        return { point: new THREE.Vector3(bx + 0.5, top + 0.85, bz + 0.5), water: { x: bx, y: top, z: bz }, stuck: false };
      }
      if (voxel !== BLOCKS.AIR) {
        return { point: new THREE.Vector3(x, y, z), water: null, stuck: true };
      }
    }
    return null;
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

    const geometry = new THREE.BufferGeometry().setFromPoints([point.clone(), point.clone()]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
    scene.add(line);

    this.bobber = bobber;
    this.line = line;
  }

  removeBobber() {
    const scene = this.game.scene;
    if (this.bobber) scene.remove(this.bobber);
    if (this.line) scene.remove(this.line);
    this.bobber = null;
    this.line = null;
  }

  /** Keep the line drawn from the rod tip to the bobber. */
  updateLine() {
    if (!this.line || !this.bobber) return;
    const tip = this.eyePosition();
    const dir = this.game.camera.getWorldDirection(new THREE.Vector3());
    tip.addScaledVector(dir, 0.7).add(new THREE.Vector3(0, -0.25, 0));
    const positions = this.line.geometry.attributes.position;
    positions.setXYZ(0, tip.x, tip.y, tip.z);
    positions.setXYZ(1, this.bobber.position.x, this.bobber.position.y, this.bobber.position.z);
    positions.needsUpdate = true;
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
    if (WATERLOGGED.has(voxel)) return OPEN_WATER_BLOCK.WATER;
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
      if (def && (def.transparent === true || def.opacity === 0)) continue;
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
      const d = mob.mesh.position.distanceTo(pos);
      if (d < bestDistance) { bestDistance = d; best = { kind: 'mob', ref: mob }; }
    }
    for (const drop of this.game.entities?.droppedItems ?? []) {
      if (!drop?.mesh?.position || drop.collected) continue;
      const d = drop.mesh.position.distanceTo(pos);
      if (d < bestDistance) { bestDistance = d; best = { kind: 'item', ref: drop }; }
    }
    return best;
  }

  // --- the frame ---------------------------------------------------------------------------------------

  update(dt) {
    if (!this.active) return;
    const g = this.game;

    // Wiki: "If the player wanders more than 32 blocks away from the bobber, or if the player stops holding
    // the fishing rod, the bobber and fishing line disappear with no durability reduction to the rod."
    if (!this.rod()) { this.cancel(); return; }
    if (this.bobber && this.bobber.position.distanceTo(this.eyePosition()) > LINE_BREAK_DISTANCE) {
      this.cancel();
      return;
    }

    this.updateLine();
    if (!this.hooked) this.hooked = this.findHookTarget();

    if (this.state === FISHING_STATE.WAITING) {
      if (this.waitTicks === Infinity) return;   // landed on ground: nothing will ever bite
      // `dt` is seconds; the wait is in ticks, and the wiki counts at 20 to the second.
      let ticksThisFrame = dt * 20;
      while (ticksThisFrame > 0) {
        const step = Math.min(1, ticksThisFrame);
        ticksThisFrame -= step;
        if (step === 1) this.waitTicks = advanceWait(this.waitTicks, this.conditions());
      }
      if (this.waitTicks <= 0) {
        this.state = FISHING_STATE.APPROACHING;
        this.approachLeft = rollBiteApproachSeconds(Math.random);
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

  /** The wiki's serpentine trail of fishing particles, approaching the bobber. */
  emitTrail(dt) {
    if (!this.bobber) return;
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.08;
    const target = this.bobber.position;
    const jitter = new THREE.Vector3(
      (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.9,
    );
    this.game.mobs?.spawnParticleBurst?.(target.clone().add(jitter).add(new THREE.Vector3(0, 0.2, 0)), 0x8fd6ff, 2);
  }

  /** The bobber dipping below the surface when something takes it. */
  splash() {
    if (!this.bobber) return;
    this.bobber.position.y -= 0.35;
    this.game.mobs?.spawnParticleBurst?.(this.bobber.position.clone(), 0xbfe9ff, 8);
    this.game.sounds?.play?.('splash');
  }

  // --- reeling -----------------------------------------------------------------------------------------

  /** Reel in. This is where the durability, the loot and the XP are settled. */
  reel() {
    if (!this.active) return;
    const rod = this.rod();
    const biting = this.state === FISHING_STATE.BITING;
    const hooked = this.hooked;

    const cost = reelDurability({
      caught: biting,
      stuckInBlock: this.stuckInBlock,
      hookedItem: hooked?.kind === 'item',
      hookedEntity: hooked?.kind === 'mob',
    });

    // Wiki: pulling a mob or a dropped item drags it to the player.
    if (hooked?.kind === 'mob') this.pullTowardPlayer(hooked.ref.mesh?.position);
    if (hooked?.kind === 'item') this.pullTowardPlayer(hooked.ref.mesh?.position);

    let caught = null;
    if (biting) caught = this.awardCatch();

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
    addPlayerExperience(g.player, rollFishingXp(Math.random), g.sounds, g.ui);
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

  /** Wiki: the catch "is added to the player's inventory. If the player's inventory is full, the item drops
   * on the ground." */
  giveToPlayer(stack) {
    const g = this.game;
    const inv = g.inventory;
    // `addItem` is positional: (itemId, isBlock, count, enchantments).
    if (inv?.addItem?.(stack.id, stack.isBlock === true, stack.count ?? 1, stack.enchantments ?? null)) {
      g.ui?.updateHotbar?.();
      return;
    }
    const pos = g.player.position.clone();
    g.entities?.spawnDroppedItem?.(pos, stack.id, stack.isBlock === true, stack.count ?? 1);
  }

  pullTowardPlayer(position) {
    if (!position) return;
    const player = this.game.player.position;
    const direction = player.clone().sub(position);
    const distance = direction.length();
    if (distance > 0.001) position.addScaledVector(direction.normalize(), Math.min(distance, 0.75));
  }

  /** Abandon the line: no durability, no loot. Used by the 32-block rule and by losing pointer lock. */
  cancel() {
    this.removeBobber();
    this.reset();
  }
}
