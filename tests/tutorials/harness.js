import * as THREE from 'three';
import assert from 'node:assert/strict';
import { Player } from '../../src/player.js';
import { PlayerBot } from '../../src/playerBot.js';
import { Inventory } from '../../src/inventory.js';
import { BedManager } from '../../src/bed.js';
import { DoorManager } from '../../src/door.js';
import { FurnaceManager } from '../../src/furnace.js';
import { FarmingManager, isHoe, getSeedCrop } from '../../src/farming.js';
import { ChestManager } from '../../src/chest.js';
import { Redstone } from '../../src/redstone.js';
import { BLOCKS, ITEMS } from '../../src/blocks.js';
import { breakTimeSeconds, harvestsNothing } from '../../src/miningRules.js';
import { blockDrops } from '../../src/blockDrops.js';
import { NetherPortalManager } from '../../src/netherPortal.js';
import {
  isFrame, insertEye, tryActivateAround, isStandingInEndPortal,
  portalDestination, portalArrival
} from '../../src/endPortal.js';
import { BrewingManager } from '../../src/brewing.js';
import { PLATFORM, regenerateEndPlatform } from '../../src/worldgen/generators/endFeatures.js';
import { isDrinkablePotion, drinkPotion } from '../../src/potionUse.js';
import { BossFightManager } from '../../src/bossFights.js';
import { startBarter, barterReward } from '../../src/piglin.js';

export function createTutorialFixture({
  playerPos = [0.5, 1, 0.5],
  worldTime = 1000,
  gameMode = 'survival',
  initialInventory = [],
  floorY = (playerPos[1] <= 0 ? Math.floor(playerPos[1]) - 1 : 0),
  floorBlock = (playerPos[1] <= 0 ? BLOCKS.DEEPSLATE : BLOCKS.DIRT)
} = {}) {
  const cells = new Map();
  const logs = [];

  const world = {
    getVoxel(x, y, z) {
      return cells.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? (y <= floorY ? floorBlock : BLOCKS.AIR);
    },
    setVoxel(x, y, z, id) {
      const key = `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
      if (id === BLOCKS.AIR) cells.delete(key);
      else cells.set(key, id);
      if (this.redstone) {
        this.redstone.notify(Math.floor(x), Math.floor(y), Math.floor(z));
      }
    },
    getChunk(cx, cz) {
      return {
        dirty: false,
        cx: cx ?? 0,
        cz: cz ?? 0,
        getVoxel(lx, ly, lz) {
          return world.getVoxel((cx ?? 0) * 16 + lx, ly, (cz ?? 0) * 16 + lz);
        }
      };
    },
    seed: 12345,
    dimension: 'overworld',
    surfaceHeightAt(x, z) {
      return 32;
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
  player.gamemode = gameMode;
  player.health = 20;
  player.maxHealth = 20;
  player.hunger = 20;
  player.maxHunger = 20;
  player.saturation = 5;

  const inventory = new Inventory({ playClick() {}, playPop() {} });
  for (const item of initialInventory) {
    inventory.addItem(item.id, item.isBlock ?? false, item.count ?? 1);
  }

  const bedManager = new BedManager({
    world,
    currentDimension: 'overworld',
    worldTime,
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
    mobs: {
      mobs: mobsList,
      scene: new THREE.Scene(),
      spawnMob(type, x, y, z, options = {}) {
        const mob = {
          type,
          name: type === 'wither' ? 'The Wither' : type === 'ender_dragon' ? 'Ender Dragon' : type,
          mesh: new THREE.Group(),
          health: type === 'wither' ? 300 : type === 'ender_dragon' ? 200 : 20,
          maxHealth: type === 'wither' ? 300 : type === 'ender_dragon' ? 200 : 20,
          velocity: new THREE.Vector3(),
          position: new THREE.Vector3(x, y, z),
          ...options
        };
        mob.mesh.position.set(x, y, z);
        mobsList.push(mob);
        return mob;
      },
      isBlockSolid(x, y, z) {
        const v = world.getVoxel(x, y, z);
        return v !== BLOCKS.AIR && v !== BLOCKS.WATER;
      },
      spawnParticleBurst() {},
      spawnXpOrbs() {},
      damageMob(mob, amount) {
        mob.health -= amount;
        if (mob.health <= 0) {
          if (mob.type === 'wither') game.bossManager?.onWitherDefeated?.();
          else if (mob.type === 'ender_dragon') game.bossManager?.onDragonDefeated?.();
          else {
            const pos = mob.mesh.position;
            for (const drop of mob.drops || []) {
              game.entities.spawnDroppedItem(pos, drop.id, drop.isBlock, drop.count);
            }
          }
        }
      }
    },
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
      },
      spawnExplosion() {},
      spawnXpOrbs() {}
    },
    camera,
    ui: {
      isGeminiOpen: () => true,
      isModalOpen: () => false,
      updateHotbar() {},
      updateUI() {},
      updateStats() {},
      addChatMessage() {},
      takeSmithingOutput(calc) {
        if (!calc?.valid || !calc?.result) return;
        inventory.cursorItem = calc.result;
        this.smithingBaseItem = null;
        this.smithingAdditionItem = null;
        if (calc.templateSurvives === false) this.smithingTemplateItem = null;
      },
      renderSmithingGUI() {},
      takeAnvilOutput(calc) {
        if (!calc?.valid || !calc?.result) return;
        inventory.cursorItem = calc.result;
        this.anvilLeftItem = null;
        if (this.anvilRightItem) {
          const consumed = calc.materialUnitsConsumed || 1;
          this.anvilRightItem.count -= consumed;
          if (this.anvilRightItem.count <= 0) this.anvilRightItem = null;
        }
      },
      renderAnvilGUI() {}
    },
    sounds: {
      playPlace() {},
      playBreak() {},
      playClick() {},
      playPop() {},
      playAttack() {}
    },
    currentDimension: 'overworld',
    worldTime,
    miningTime: 0,
    isMouseDown: false,
    targetBlock: null,
    targetMob: null
  };

  const doorManager = new DoorManager(game);
  game.doorManager = doorManager;
  world.doorManager = doorManager;

  const chestManager = new ChestManager(game);
  game.chestManager = chestManager;
  world.chestManager = chestManager;

  const farmingManager = new FarmingManager(game);
  game.farmingManager = farmingManager;

  const netherPortalManager = new NetherPortalManager(game);
  game.portalManager = netherPortalManager;

  const redstone = new Redstone(world);
  redstone.game = game;
  world.redstone = redstone;

  const bossManager = new BossFightManager(game.mobs, world, game.sounds, game.ui, game.entities);
  game.bossManager = bossManager;
  game.bossFightManager = bossManager;

  game.switchDimension = (dim, targetPos = null) => {
    game.currentDimension = dim;
    world.dimension = dim;
    if (targetPos) {
      player.position.set(targetPos.x, targetPos.y, targetPos.z);
    }
    if (dim === 'the_end') {
      regenerateEndPlatform(world, BLOCKS);
      game.bossManager?.initEndArena?.();
    }
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
    const target = game.targetMob || bot.task?.attackTarget || (bot.task?.hadMob ? bot.task.killedMob : null);
    if (target && target.health > 0) {
      const held = inventory.getActiveItem();
      const dmg = held?.id?.includes('netherite') ? 8 : held?.id?.includes('diamond') ? 7 : held?.id?.includes('iron') ? 6 : held?.id?.includes('sword') ? 4 : held?.id?.includes('axe') ? 3 : 2;
      target.health -= dmg;
      if (target.health <= 0) {
        if (target.type === 'wither') {
          game.bossManager?.onWitherDefeated?.();
        } else if (target.type === 'ender_dragon') {
          game.bossManager?.onDragonDefeated?.();
        } else {
          const pos = target.mesh.position;
          for (const drop of target.drops || []) {
            game.entities.spawnDroppedItem(pos, drop.id, drop.isBlock, drop.count);
          }
        }
      }
    }
  };

  game.handleRightClick = () => {
    const active = inventory.getActiveItem();
    if (!active) return;
    if (active.id && (ITEMS[active.id]?.type === 'food' || ['beef', 'cooked_beef', 'bread', 'apple'].includes(active.id))) {
      inventory.consumeActiveItem();
      player.hunger = Math.min(20, player.hunger + (ITEMS[active.id]?.hunger || 8));
      player.saturation = Math.min(player.hunger, player.saturation + (ITEMS[active.id]?.saturation || 12.8));
      return;
    }
    if (active.id && isDrinkablePotion(active.id)) {
      drinkPotion(active.id, player, inventory, { gamemode: player.gamemode });
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
    if (active && active.id === 'ender_eye') {
      const pos = (game.targetBlock && isFrame(world.getVoxel(game.targetBlock.x, game.targetBlock.y, game.targetBlock.z)))
        ? [game.targetBlock.x, game.targetBlock.y, game.targetBlock.z]
        : (bot.task?.command?.type === 'use' && bot.task.command.item === 'ender_eye' ? bot.task.command.position : null);
      if (pos) {
        const [bX, bY, bZ] = pos;
        const clickedBlock = world.getVoxel(bX, bY, bZ);
        if (isFrame(clickedBlock) && clickedBlock === BLOCKS.END_PORTAL_FRAME) {
          if (insertEye(world, bX, bY, bZ)) {
            if (player.gamemode !== 'creative') inventory.consumeActiveItem(1);
            tryActivateAround(world, bX, bY, bZ);
            return;
          }
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
    const mobTarget = (bot.task?.command?.type === 'feed' ? (bot.task.killedMob || mobsList.find(m => m.type === bot.task.command.mob && m.health > 0 && (m.type === 'piglin' || m.inLove <= 0)) || mobsList.find(m => m.type === bot.task.command.mob && m.health > 0)) : game.targetMob);
    if (mobTarget) {
      const cleanId = String(active?.id || '').toLowerCase();
      if (mobTarget.type === 'cow' && cleanId.includes('wheat')) {
        mobTarget.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
      if (mobTarget.type === 'chicken' && cleanId.includes('seed')) {
        mobTarget.inLove = 30;
        inventory.consumeActiveItem();
        return;
      }
      if (mobTarget.type === 'piglin' && cleanId === 'gold_ingot') {
        startBarter(mobTarget);
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
        if (blockId === BLOCKS.WITHER_SKELETON_SKULL_BLOCK || blockId === BLOCKS.WITHER_SKELETON_SKULL) {
          game.bossManager?.checkWitherSummon?.(...placePos);
        }
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
    if (world.redstone) world.redstone.tick([player]);
    if (game.updateEndPortalTravel) game.updateEndPortalTravel(dt);
    if (game.bossManager) game.bossManager.update(dt, player);
    for (const m of mobsList) {
      if (m.type === 'piglin' && m.isBartering) {
        m.barterTimer = (m.barterTimer || 6) - dt * 2;
        if (m.barterTimer <= 0) {
          m.isBartering = false;
          const reward = barterReward();
          game.entities.spawnDroppedItem(m.mesh.position, reward.id, !!reward.isBlock, reward.count);
        }
      }
    }

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

    // Dropped item collection
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

  async function runCommand(commandString) {
    const promise = bot.run(commandString);
    return drive(promise);
  }

  return {
    game,
    bot,
    cells,
    logs,
    step,
    drive,
    runCommand,
    world,
    player,
    inventory,
    doorManager,
    bedManager,
    furnaceManager,
    chestManager,
    farmingManager,
    redstone,
    mobsList
  };
}

export function selectHotbarItem(inventory, id) {
  for (let i = 0; i < inventory.hotbar.length; i++) {
    if (inventory.hotbar[i]?.id === id) {
      inventory.activeSlot = i;
      return true;
    }
  }
  return false;
}
