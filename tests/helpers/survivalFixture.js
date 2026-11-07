// The survival fixture shared by the player bot tests: a real Player and PlayerBot on a small hand-made world (ground at
// y <= 0), with a stand-in for the Game object that handles clicks, mining, pickups and portals the way the game does.
import assert from 'node:assert/strict';
import { PLATFORM, regenerateEndPlatform } from '../../src/worldgen/generators/endFeatures.js';
import * as THREE from 'three';
import { Player } from '../../src/player.js';
import { PlayerBot } from '../../src/playerBot.js';
import { Inventory } from '../../src/inventory.js';
import { BedManager } from '../../src/bed.js';
import { DoorManager } from '../../src/door.js';
import { FurnaceManager } from '../../src/furnace.js';
import { FarmingManager, isHoe, getSeedCrop } from '../../src/farming.js';
import { BLOCKS, ITEMS } from '../../src/blocks.js';
import { breakTimeSeconds, harvestsNothing } from '../../src/miningRules.js';
import { blockDrops } from '../../src/blockDrops.js';
import { NetherPortalManager, detectPortalFrame, lightPortal } from '../../src/netherPortal.js';
import {
  isFrame, isFilledFrame, insertEye, tryActivateAround, isStandingInEndPortal,
  portalDestination, portalArrival, buildEndPlatform, frameRingOffsets
} from '../../src/endPortal.js';
import { initVillagerEconomy } from '../../src/villagerEconomy.js';
import { calculateBookshelfCount } from '../../src/enchanting.js';
import { BrewingManager } from '../../src/brewing.js';

export function createSurvivalFixture({ playerPos = [0.5, 1, 0.5] } = {}) {
  const cells = new Map();
  const logs = [];

  const world = {
    getVoxel(x, y, z) {
      return cells.get(`${x},${y},${z}`) ?? (y <= 0 ? BLOCKS.DIRT : BLOCKS.AIR);
    },
    setVoxel(x, y, z, id) {
      if (id === BLOCKS.AIR) cells.delete(`${x},${y},${z}`);
      else cells.set(`${x},${y},${z}`, id);
    },
    getChunk() {
      return null;
    }
  };

  const camera = new THREE.PerspectiveCamera();
  const player = new Player(
    camera,
    { addEventListener() {}, requestPointerLock() {} },
    world,
    { playStep() {}, playJump() {} }
  );

  player.position.set(...playerPos);
  player.onGround = true;
  player.gamemode = 'survival';
  player.health = 20;
  player.maxHealth = 20;
  player.hunger = 20;
  player.maxHunger = 20;
  player.saturation = 5;

  const inventory = new Inventory({ playClick() {}, playPop() {} });
  const bedManager = new BedManager({
    world,
    currentDimension: 'overworld',
    worldTime: 13000,
    ui: { addChatMessage() {} },
    sounds: { playClick() {} }
  });
  const furnaceManager = new FurnaceManager({ world });
  const brewingManager = new BrewingManager();
  const mobsList = [];
  const droppedItems = [];

  const game = {
    world,
    player,
    inventory,
    bedManager,
    furnaceManager,
    brewingManager,
    worldReady: true,
    mobs: { mobs: mobsList },
    entities: {
      droppedItems,
      spawnDroppedItem(pos, itemType, isBlock, count = 1) {
        const item = {
          itemType,
          isBlock,
          count,
          age: 2,
          pickupDelay: 0,
          group: {
            position: new THREE.Vector3(pos.x ?? pos[0], pos.y ?? pos[1], pos.z ?? pos[2])
          }
        };
        droppedItems.push(item);
        return item;
      }
    },
    camera,
    ui: {
      isGeminiOpen: () => true,
      isModalOpen: () => false,
      updateHotbar() {},
      updateUI() {},
      addChatMessage() {}
    },
    sounds: {
      playPlace() {},
      playBreak() {},
      playClick() {},
      playPop() {},
      playAttack() {}
    },
    currentDimension: 'overworld',
    worldTime: 13000,
    miningTime: 0,
    isMouseDown: false,
    targetBlock: null,
    targetMob: null
  };

  const doorManager = new DoorManager(game);
  game.doorManager = doorManager;
  world.doorManager = doorManager;

  const farmingManager = new FarmingManager(game);
  game.farmingManager = farmingManager;

  const netherPortalManager = new NetherPortalManager(game);
  game.portalManager = netherPortalManager;

  game.switchDimension = (dim, targetPos = null) => {
    // As Game.travelToDimension does: walking through the portal is the walk's result.
    if (game.playerBot?.task) game.playerBot.finish(true, `Went through the portal to ${dim}.`);
    game.currentDimension = dim;
    if (targetPos) {
      player.position.set(targetPos.x, targetPos.y, targetPos.z);
    }
    if (dim === 'the_end') regenerateEndPlatform(world, BLOCKS);
  };

  game.updateEndPortalTravel = (dt) => {
    game.endPortalTravelCooldown = Math.max(0, (game.endPortalTravelCooldown || 0) - dt);
    if (game.endPortalTravelCooldown > 0) return;
    if (!game.world || !game.player || game.player.isDead) return;
    if (!isStandingInEndPortal(game.world, game.player)) return;

    const from = game.currentDimension || 'overworld';
    const dest = portalDestination(from);
    if (!dest) return;

    game.endPortalTravelCooldown = 3.0;
    const arrival = dest === 'the_end' ? portalArrival('the_end') : portalArrival('overworld');
    game.switchDimension(dest, arrival);
    game.ui?.addChatMessage?.(dest === 'the_end' ? 'You step through the End portal.' : 'You return from the End.', 'system');
  };

  player.game = game;
  player.inventory = inventory;
  bedManager.game = game;
  furnaceManager.game = game;

  game.handleLeftClick = () => {
    if (game.targetMob && game.targetMob.health > 0) {
      const held = inventory.getActiveItem();
      const dmg = held?.id?.includes('sword') ? 4 : held?.id?.includes('axe') ? 3 : 2;
      game.targetMob.health -= dmg;
      if (game.targetMob.health <= 0) {
        const pos = game.targetMob.mesh.position;
        for (const drop of game.targetMob.drops || []) {
          game.entities.spawnDroppedItem(pos, drop.id, drop.isBlock, drop.count);
        }
      }
    }
  };

  game.handleRightClick = () => {
    const active = inventory.getActiveItem();
    if (!active) return;
    if (active.id && (ITEMS[active.id]?.type === 'food' || ['beef', 'cooked_beef', 'bread', 'apple'].includes(active.id))) {
      inventory.consumeActiveItem();
      player.hunger = Math.min(20, player.hunger + 8);
      return;
    }
    if (active && active.id === 'flint_and_steel') {
      if (game.targetBlock) {
        const norm = game.targetBlock.normal || { x: 0, y: 1, z: 0 };
        if (game.portalManager?.ignitePortal(world, game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, norm, player)) {
          return;
        }
      }
      if (bot.task?.command?.type === 'use' && bot.task.command.position) {
        const [ux, uy, uz] = bot.task.command.position;
        if (game.portalManager?.ignitePortal(world, ux, uy, uz, null, player)) {
          return;
        }
      }
    }
    if (active && active.id === 'ender_eye' && game.targetBlock) {
      const bX = game.targetBlock.x, bY = game.targetBlock.y, bZ = game.targetBlock.z;
      const clickedBlock = world.getVoxel(bX, bY, bZ);
      if (isFrame(clickedBlock) && clickedBlock === BLOCKS.END_PORTAL_FRAME) {
        if (insertEye(world, bX, bY, bZ)) {
          if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
          tryActivateAround(world, bX, bY, bZ);
          return;
        }
      }
    }
    if (active && isHoe(active.id) && game.targetBlock) {
      if (farmingManager.till(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, player)) {
        return;
      }
    }
    if (active && active.id === 'bone_meal' && game.targetBlock) {
      if (farmingManager.applyBoneMeal(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, player)) {
        return;
      }
    }
    if (active && getSeedCrop(active.id) && game.targetBlock) {
      if (farmingManager.plant(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z, active.id, player)) {
        return;
      }
    }
    if (game.targetMob) {
      const cleanId = String(active?.id || '').toLowerCase();
      if (game.targetMob.type === 'cow' && cleanId.includes('wheat')) {
        game.targetMob.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
      if (game.targetMob.type === 'chicken' && cleanId.includes('seed')) {
        game.targetMob.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
    }
    if (active && ITEMS[active.id]?.armorSlot && inventory.equipArmorItem) {
      inventory.equipArmorItem(true);
      return;
    }
    if ((String(active.id).endsWith('_bed') || active.id === 'bed' || active.id === BLOCKS.RED_BED_FOOT) && game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const look = new THREE.Vector3();
      camera.getWorldDirection(look);
      let dir = 3;
      if (Math.abs(look.x) > Math.abs(look.z)) {
        dir = look.x > 0 ? 0 : 1;
      } else {
        dir = look.z > 2 ? 2 : 3;
      }
      const res = bedManager.placeBed(world, placePos, dir);
      if (res.success) {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem();
      }
      return;
    }
    if ((String(active.id).endsWith('_door') || active.id === 'door' || active.id === BLOCKS.OAK_DOOR || active.id === BLOCKS.IRON_DOOR) && game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const isIron = active.id === 'iron_door' || active.id === BLOCKS.IRON_DOOR;
      const res = doorManager.placeDoor(world, placePos, 3, isIron);
      if (res.success) {
        if (player.gamemode !== 'creative') inventory.consumeActiveItem();
      }
      return;
    }
    if (game.targetBlock?.normal) {
      const placePos = [
        game.targetBlock.x + game.targetBlock.normal.x,
        game.targetBlock.y + game.targetBlock.normal.y,
        game.targetBlock.z + game.targetBlock.normal.z
      ];
      const blockId = active.isBlock
        ? (active.blockId ?? (typeof active.id === 'number' ? active.id : BLOCKS[String(active.id).toUpperCase()]))
        : (ITEMS[active.id]?.blockId ?? BLOCKS[String(active.id).toUpperCase()]);
      if (typeof blockId === 'number' && world.getVoxel(...placePos) === BLOCKS.AIR) {
        world.setVoxel(...placePos, blockId);
        if (player.gamemode !== 'creative') inventory.consumeActiveItem();
      }
    }
  };

  const bot = new PlayerBot(game, { log: (...args) => logs.push(args) });
  game.playerBot = bot;

  function step(dt = 1 / 20) {
    bot.tick(dt);
    player.update(dt);
    if (furnaceManager) furnaceManager.update(dt * 10);
    if (bedManager) bedManager.update(dt * 10);
    if (netherPortalManager) netherPortalManager.update(dt, player, game);
    if (game.updateEndPortalTravel) game.updateEndPortalTravel(dt);

    camera.position.set(
      player.position.x,
      player.position.y + (player.isSneaking ? 1.38 : player.eyeHeight || 1.62),
      player.position.z
    );
    const cosPitch = Math.cos(player.pitch || 0);
    const direction = new THREE.Vector3(
      -Math.sin(player.yaw || 0) * cosPitch,
      Math.sin(player.pitch || 0),
      -Math.cos(player.yaw || 0) * cosPitch
    ).normalize();
    camera.getWorldDirection = (v = new THREE.Vector3()) => v.copy(direction);

    // Target block raycasting
    game.targetBlock = null;
    for (let d = 0; d < 5.2; d += 0.05) {
      const point = camera.position.clone().addScaledVector(direction, d);
      const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);
      const blockId = world.getVoxel(x, y, z);
      if (blockId !== BLOCKS.AIR) {
        const prev = point.clone().sub(direction.clone().multiplyScalar(0.05));
        const px = Math.floor(prev.x), py = Math.floor(prev.y), pz = Math.floor(prev.z);
        const normal = { x: px - x, y: py - y, z: pz - z };
        if (normal.x === 0 && normal.y === 0 && normal.z === 0) normal.y = 1;
        game.targetBlock = { x, y, z, blockId, normal };
        break;
      }
    }

    // Target mob raycasting
    game.targetMob = null;
    for (const mob of mobsList) {
      if (mob.health > 0) {
        const mobPos = mob.mesh.position;
        if (camera.position.distanceTo(mobPos) < 4.0) {
          game.targetMob = mob;
          break;
        }
      }
    }

    bot.afterRaycast();

    // Mining completion
    if (game.isMouseDown && game.targetBlock) {
      const b = game.targetBlock;
      const held = inventory.getActiveItem();
      game.miningTime += dt;
      const breakTime = Math.min(0.2, breakTimeSeconds(b.blockId, ITEMS[held?.id], held?.id));
      if (game.miningTime >= breakTime) {
        world.setVoxel(b.x, b.y, b.z, BLOCKS.AIR);
        game.miningTime = 0;
        if (!harvestsNothing(b.blockId, ITEMS[held?.id], held?.id)) {
          const drops = blockDrops(b.blockId, () => 0.05);
          for (const drop of drops) {
            game.entities.spawnDroppedItem({ x: b.x + 0.5, y: b.y + 0.5, z: b.z + 0.5 }, drop.id, drop.isBlock, drop.count);
          }
        }
      }
    }

    // Dropped item collection (standard reach magnet)
    for (let i = droppedItems.length - 1; i >= 0; i--) {
      const drop = droppedItems[i];
      if (drop.group.position.distanceTo(player.position) < 4.5) {
        inventory.addItem(drop.itemType, drop.isBlock, drop.count);
        droppedItems.splice(i, 1);
      }
    }
  }

  async function drive(promise, max = 25000) {
    let done = false;
    promise.then(() => (done = true), () => (done = true));
    for (let i = 0; i < max && !done; i++) {
      step();
      await Promise.resolve();
    }
    assert.equal(done, true, 'scenario task must terminate');
    return promise;
  }

  return { game, bot, cells, logs, step, drive, world, player, inventory, bedManager, furnaceManager, mobsList };
}
