// Headless multiplayer guest peer for blockyland-mcp.
//
// Connects to a hosted Blockyland game (Base Game shared world, SkyWars, or Bed Wars) over the
// `/ws/share` signaling & relay WebSocket using the ShareSession protocol (protocol v5), maintains
// a live voxel world and player state in Node.js, and executes both direct actions and high-level
// gameplay goals as a full participant in the world.

import zlib from 'node:zlib';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

export const PROTOCOL_VERSION = 5;
const MAX_MESSAGE_BYTES = 16_000;
const CHUNK_SIZE_X = 16;
const CHUNK_SIZE_Z = 16;
const CHUNK_HEIGHT = 64;

export const BLOCKS = Object.freeze({
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  GRAVEL: 7,
  OAK_LOG: 8,
  OAK_LEAVES: 9,
  OAK_PLANKS: 10,
  GLASS: 11,
  WATER: 12,
  LAVA: 13,
  COAL_ORE: 14,
  IRON_ORE: 15,
  GOLD_ORE: 16,
  DIAMOND_ORE: 17,
  OBSIDIAN: 20,
  CRAFTING_TABLE: 21,
  FURNACE: 22,
  TNT: 23,
  TORCH: 24,
  BRICKS: 25,
  SNOW: 28,
  ICE: 29,
  SANDSTONE: 32,
  STONE_BRICKS: 34,
  SPONGE: 38,
  CLAY: 37,
  END_STONE: 42,
  WHITE_WOOL: 43,
  RED_WOOL: 44,
  BLUE_WOOL: 45,
  YELLOW_WOOL: 46,
  GREEN_WOOL: 47,
  BLACK_WOOL: 48,
  LADDER: 49,
  ENCHANTING_TABLE: 53,
  CHERRY_LOG: 80,
  CHERRY_PLANKS: 82,
  BIRCH_LOG: 83,
  BIRCH_PLANKS: 85,
  SPRUCE_LOG: 86,
  SPRUCE_PLANKS: 88,
  JUNGLE_LOG: 89,
  JUNGLE_PLANKS: 91,
  ACACIA_LOG: 92,
  ACACIA_PLANKS: 94,
  DARK_OAK_LOG: 95,
  DARK_OAK_PLANKS: 97,
  MANGROVE_LOG: 98,
  TERRACOTTA: 113,
  RED_TERRACOTTA: 114,
  YELLOW_TERRACOTTA: 116,
  WHITE_TERRACOTTA: 117,
  PACKED_ICE: 119,
  COAL_BLOCK: 151,
  RED_BED_FOOT: 159,
  RED_BED_HEAD: 160,
  CHEST: 161,
  ANVIL: 205,
  IRON_BLOCK: 210,
  GOLD_BLOCK: 211,
  DIAMOND_BLOCK: 212,
  EMERALD_BLOCK: 213,
  BLUE_BED: 255,
  CYAN_BED: 257,
  GRAY_BED: 258,
  GREEN_BED: 259,
  LIME_BED: 262,
  PINK_BED: 265,
  WHITE_BED: 267,
  YELLOW_BED: 268,
  BLUE_TERRACOTTA: 322,
  CYAN_TERRACOTTA: 327,
  GRAY_TERRACOTTA: 330,
  LIME_TERRACOTTA: 342,
  PINK_TERRACOTTA: 350,
  CYAN_WOOL: 763,
  GRAY_WOOL: 764,
  LIME_WOOL: 767,
  PINK_WOOL: 770,
  BLUE_BED_HEAD: 773,
  CYAN_BED_HEAD: 775,
  GRAY_BED_HEAD: 776,
  LIME_BED_HEAD: 780,
  PINK_BED_HEAD: 783,
  WHITE_BED_HEAD: 785,
  YELLOW_BED_HEAD: 786,
});

const BLOCK_BY_NAME = new Map(Object.entries(BLOCKS).map(([k, v]) => [k.toLowerCase(), v]));
function baseGameDrop(blockId) {
  if (blockId === BLOCKS.STONE) return { id: BLOCKS.COBBLESTONE, isBlock: true, count: 1 };
  if (blockId === BLOCKS.GRASS) return { id: BLOCKS.DIRT, isBlock: true, count: 1 };
  if (blockId === BLOCKS.COAL_ORE) return { id: 'coal', isBlock: false, count: 1 };
  if (blockId === BLOCKS.IRON_ORE) return { id: 'raw_iron', isBlock: false, count: 1 };
  if (blockId === BLOCKS.GOLD_ORE) return { id: 'raw_gold', isBlock: false, count: 1 };
  if (blockId === BLOCKS.DIAMOND_ORE) return { id: 'diamond', isBlock: false, count: 1 };
  if (blockId === BLOCKS.CLAY) return { id: 'clay_ball', isBlock: false, count: 4 };
  return { id: blockId, isBlock: true, count: 1 };
}

const NAME_BY_BLOCK = new Map(Object.entries(BLOCKS).map(([k, v]) => [v, k.toLowerCase()]));

const NON_SOLID_BLOCKS = new Set([
  BLOCKS.AIR, BLOCKS.WATER, BLOCKS.LAVA, BLOCKS.TORCH, 30, 31, 50, 51, 56, 57, 58, 68, 69,
  135, 146, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179,
  180, 184, 186, 187, 1219, 1220,
]);

const BED_BLOCK_IDS = new Set([
  BLOCKS.RED_BED_FOOT, BLOCKS.RED_BED_HEAD,
  BLOCKS.BLUE_BED, BLOCKS.BLUE_BED_HEAD,
  BLOCKS.CYAN_BED, BLOCKS.CYAN_BED_HEAD,
  BLOCKS.GRAY_BED, BLOCKS.GRAY_BED_HEAD,
  BLOCKS.GREEN_BED, 777,
  BLOCKS.LIME_BED, BLOCKS.LIME_BED_HEAD,
  BLOCKS.PINK_BED, BLOCKS.PINK_BED_HEAD,
  BLOCKS.WHITE_BED, BLOCKS.WHITE_BED_HEAD,
  BLOCKS.YELLOW_BED, BLOCKS.YELLOW_BED_HEAD,
  254, 772, 256, 774, 260, 778, 261, 779, 263, 781, 264, 782, 266, 784,
]);

const WEAPON_DAMAGE = Object.freeze({
  netherite_sword: 8,
  diamond_sword: 7,
  iron_sword: 6,
  stone_sword: 5,
  golden_sword: 4,
  wooden_sword: 4,
  netherite_axe: 10,
  diamond_axe: 9,
  iron_axe: 9,
  stone_axe: 9,
  wooden_axe: 7,
  golden_axe: 7,
  trident: 9,
  mace: 6,
  stick: 2,
});

const ARMOR_SCORE = Object.freeze({
  leather_helmet: 1, golden_helmet: 2, chainmail_helmet: 2, iron_helmet: 2, turtle_helmet: 2, diamond_helmet: 3, netherite_helmet: 3,
  leather_chestplate: 3, golden_chestplate: 5, chainmail_chestplate: 5, iron_chestplate: 6, diamond_chestplate: 8, netherite_chestplate: 8,
  leather_leggings: 2, golden_leggings: 3, chainmail_leggings: 4, iron_leggings: 5, diamond_leggings: 6, netherite_leggings: 6,
  leather_boots: 1, golden_boots: 1, chainmail_boots: 1, iron_boots: 2, diamond_boots: 3, netherite_boots: 3,
});

const BEDWARS_TEAMS = Object.freeze([
  { id: 'red', name: 'Red', wool: BLOCKS.RED_WOOL, clay: BLOCKS.RED_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.RED_BED_FOOT, bedHead: BLOCKS.RED_BED_HEAD },
  { id: 'blue', name: 'Blue', wool: BLOCKS.BLUE_WOOL, clay: BLOCKS.BLUE_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.BLUE_BED, bedHead: BLOCKS.BLUE_BED_HEAD },
  { id: 'green', name: 'Green', wool: BLOCKS.LIME_WOOL, clay: BLOCKS.LIME_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.LIME_BED, bedHead: BLOCKS.LIME_BED_HEAD },
  { id: 'yellow', name: 'Yellow', wool: BLOCKS.YELLOW_WOOL, clay: BLOCKS.YELLOW_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.YELLOW_BED, bedHead: BLOCKS.YELLOW_BED_HEAD },
  { id: 'aqua', name: 'Aqua', wool: BLOCKS.CYAN_WOOL, clay: BLOCKS.CYAN_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.CYAN_BED, bedHead: BLOCKS.CYAN_BED_HEAD },
  { id: 'white', name: 'White', wool: BLOCKS.WHITE_WOOL, clay: BLOCKS.WHITE_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.WHITE_BED, bedHead: BLOCKS.WHITE_BED_HEAD },
  { id: 'pink', name: 'Pink', wool: BLOCKS.PINK_WOOL, clay: BLOCKS.PINK_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.PINK_BED, bedHead: BLOCKS.PINK_BED_HEAD },
  { id: 'gray', name: 'Gray', wool: BLOCKS.GRAY_WOOL, clay: BLOCKS.GRAY_TERRACOTTA, glass: BLOCKS.GLASS, bedFoot: BLOCKS.GRAY_BED, bedHead: BLOCKS.GRAY_BED_HEAD },
]);

const BEDWARS_RESOURCE_ITEMS = Object.freeze({
  iron: 'iron_ingot',
  gold: 'gold_ingot',
  diamond: 'diamond',
  emerald: 'emerald',
});

const BEDWARS_PICKAXES = Object.freeze([
  null,
  { id: 'wooden_pickaxe', enchantments: [{ id: 'efficiency', level: 1 }] },
  { id: 'iron_pickaxe', enchantments: [{ id: 'efficiency', level: 2 }] },
  { id: 'golden_pickaxe', enchantments: [{ id: 'efficiency', level: 3 }, { id: 'sharpness', level: 2 }] },
  { id: 'diamond_pickaxe', enchantments: [{ id: 'efficiency', level: 3 }] },
]);

const BEDWARS_AXES = Object.freeze([
  null,
  { id: 'wooden_axe', enchantments: [{ id: 'efficiency', level: 1 }] },
  { id: 'stone_axe', enchantments: [{ id: 'efficiency', level: 1 }] },
  { id: 'iron_axe', enchantments: [{ id: 'efficiency', level: 2 }] },
  { id: 'diamond_axe', enchantments: [{ id: 'efficiency', level: 3 }] },
]);

const BEDWARS_ARMOR_TIERS = Object.freeze(['leather', 'chainmail', 'iron', 'diamond']);
const BEDWARS_SWORDS = Object.freeze(['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword']);
const cost = (small, large = small) => ({ small, large });

const BEDWARS_ITEM_SHOP = Object.freeze([
  { key: 'wool', category: 'blocks', name: 'Wool', count: 16, price: cost({ iron: 4 }), kind: 'teamBlock', block: 'wool' },
  { key: 'clay', category: 'blocks', name: 'Hardened Clay', count: 16, price: cost({ iron: 12 }), kind: 'teamBlock', block: 'clay' },
  { key: 'glass', category: 'blocks', name: 'Blast-Proof Glass', count: 4, price: cost({ iron: 12 }), kind: 'teamBlock', block: 'glass' },
  { key: 'end_stone', category: 'blocks', name: 'End Stone', count: 12, price: cost({ iron: 24 }), kind: 'item', give: { id: BLOCKS.END_STONE, isBlock: true } },
  { key: 'ladder', category: 'blocks', name: 'Ladder', count: 8, price: cost({ iron: 4 }), kind: 'item', give: { id: BLOCKS.LADDER, isBlock: true } },
  { key: 'wood', category: 'blocks', name: 'Oak Planks', count: 16, price: cost({ gold: 4 }), kind: 'item', give: { id: BLOCKS.OAK_PLANKS, isBlock: true } },
  { key: 'obsidian', category: 'blocks', name: 'Obsidian', count: 4, price: cost({ emerald: 4 }), kind: 'item', give: { id: BLOCKS.OBSIDIAN, isBlock: true }, notIn: ['duel'] },
  { key: 'stone_sword', category: 'melee', name: 'Stone Sword', price: cost({ iron: 10 }), kind: 'sword', tier: 1 },
  { key: 'iron_sword', category: 'melee', name: 'Iron Sword', price: cost({ gold: 7 }), kind: 'sword', tier: 2 },
  { key: 'diamond_sword', category: 'melee', name: 'Diamond Sword', price: cost({ emerald: 4 }, { emerald: 3 }), kind: 'sword', tier: 3 },
  { key: 'kb_stick', category: 'melee', name: 'Knockback Stick', price: cost({ gold: 5 }), kind: 'item', give: { id: 'stick', isBlock: false, enchantments: [{ id: 'knockback', level: 1 }] } },
  { key: 'chain_armor', category: 'armor', name: 'Permanent Chainmail Armor', price: cost({ iron: 24 }), kind: 'armor', tier: 1 },
  { key: 'iron_armor', category: 'armor', name: 'Permanent Iron Armor', price: cost({ gold: 12 }), kind: 'armor', tier: 2 },
  { key: 'diamond_armor', category: 'armor', name: 'Permanent Diamond Armor', price: cost({ emerald: 6 }), kind: 'armor', tier: 3 },
  { key: 'shears', category: 'tools', name: 'Permanent Shears', price: cost({ iron: 20 }), kind: 'shears' },
  { key: 'pickaxe', category: 'tools', name: 'Pickaxe', kind: 'tool', tool: 'pickaxe', tiers: [cost({ iron: 10 }), cost({ iron: 10 }), cost({ gold: 3 }), cost({ gold: 6 })] },
  { key: 'axe', category: 'tools', name: 'Axe', kind: 'tool', tool: 'axe', tiers: [cost({ iron: 10 }), cost({ iron: 10 }), cost({ gold: 3 }), cost({ gold: 6 })] },
  { key: 'arrows', category: 'ranged', name: 'Arrow', count: 6, price: cost({ gold: 2 }), kind: 'item', give: { id: 'arrow', isBlock: false } },
  { key: 'bow', category: 'ranged', name: 'Bow', price: cost({ gold: 12 }), kind: 'item', give: { id: 'bow', isBlock: false } },
  { key: 'bow_power', category: 'ranged', name: 'Bow (Power I)', price: cost({ gold: 20 }), kind: 'item', give: { id: 'bow', isBlock: false, enchantments: [{ id: 'power', level: 1 }] } },
  { key: 'bow_punch', category: 'ranged', name: 'Bow (Power I, Punch I)', price: cost({ emerald: 6 }), kind: 'item', give: { id: 'bow', isBlock: false, enchantments: [{ id: 'power', level: 1 }, { id: 'punch', level: 1 }] } },
  { key: 'speed', category: 'potions', name: 'Speed II Potion (45 s)', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'potion_of_swiftness_2', isBlock: false, bedwars: 'speed' } },
  { key: 'jump', category: 'potions', name: 'Jump V Potion (45 s)', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'potion_of_leaping_2', isBlock: false, bedwars: 'jump' } },
  { key: 'invis', category: 'potions', name: 'Invisibility Potion (30 s)', price: cost({ emerald: 2 }), kind: 'item', give: { id: 'potion_of_invisibility', isBlock: false, bedwars: 'invis' } },
  { key: 'gapple', category: 'utility', name: 'Golden Apple', price: cost({ gold: 3 }), kind: 'item', give: { id: 'golden_apple', isBlock: false } },
  { key: 'fireball', category: 'utility', name: 'Fireball', price: cost({ iron: 40 }), kind: 'item', give: { id: 'fire_charge', isBlock: false, bedwars: 'fireball' } },
  { key: 'tnt', category: 'utility', name: 'TNT', price: cost({ gold: 4 }, { gold: 8 }), kind: 'item', give: { id: BLOCKS.TNT, isBlock: true } },
  { key: 'pearl', category: 'utility', name: 'Ender Pearl', price: cost({ emerald: 4 }), kind: 'item', give: { id: 'ender_pearl', isBlock: false } },
  { key: 'water', category: 'utility', name: 'Water Bucket', price: cost({ gold: 2 }, { gold: 3 }), kind: 'item', give: { id: 'water_bucket', isBlock: false } },
  { key: 'bridge_egg', category: 'utility', name: 'Bridge Egg', price: cost({ emerald: 1 }), kind: 'item', give: { id: 'egg', isBlock: false, bedwars: 'bridge_egg' } },
  { key: 'milk', category: 'utility', name: 'Magic Milk', price: cost({ gold: 4 }), kind: 'item', give: { id: 'milk_bucket', isBlock: false, bedwars: 'magic_milk' } },
  { key: 'sponge', category: 'utility', name: 'Sponge', count: 4, price: cost({ gold: 2 }, { gold: 3 }), kind: 'item', give: { id: BLOCKS.SPONGE, isBlock: true } },
  { key: 'tower', category: 'utility', name: 'Compact Pop-up Tower', price: cost({ iron: 24 }), kind: 'item', give: { id: 'chest', isBlock: false, bedwars: 'popup_tower' } },
]);

const BEDWARS_UPGRADES = Object.freeze({
  sharpness: { name: 'Sharpened Swords', max: 1, small: [4], large: [8] },
  protection: { name: 'Reinforced Armor', max: 4, small: [2, 4, 8, 16], large: [5, 10, 20, 30] },
  haste: { name: 'Maniac Miner', max: 2, small: [2, 4], large: [4, 6] },
  forge: { name: 'Forge', max: 4, small: [2, 4, 6, 8], large: [4, 8, 12, 16] },
  healPool: { name: 'Heal Pool', max: 1, small: [1], large: [3] },
  cushioned: { name: 'Cushioned Boots', max: 2, small: [1, 2], large: [2, 4] },
});

const BEDWARS_TRAPS = Object.freeze({
  its_a_trap: "It's a Trap!",
  counter: 'Counter-Offensive Trap',
  alarm: 'Alarm Trap',
  miner: 'Miner Fatigue Trap',
});

export const DIFFICULTIES = Object.freeze(['easy', 'normal', 'hard']);

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    id: 'easy',
    label: 'Easy (Beginner Human)',
    walkSpeed: 2.4,
    sprintSpeed: 2.8,
    sprintAllowed: false,
    stepDelayMs: 55,
    bridgePlaceDelayMs: 450,
    chestLootDelayMs: 1400,
    brainIntervalMs: 1000,
    brainMoveDurationMs: 350,
    meleeCooldownMs: 1300,
    critChance: 0.0,
    strafe: false,
    projectileCooldownMs: 8000,
    useProjectiles: false,
    usePearls: false,
    maxBedDefense: 0,
  }),
  normal: Object.freeze({
    id: 'normal',
    label: 'Normal (Casual Human)',
    walkSpeed: 3.1,
    sprintSpeed: 3.7,
    sprintAllowed: false,
    stepDelayMs: 50,
    bridgePlaceDelayMs: 260,
    chestLootDelayMs: 800,
    brainIntervalMs: 600,
    brainMoveDurationMs: 450,
    meleeCooldownMs: 800,
    critChance: 0.0,
    strafe: false,
    projectileCooldownMs: 6000,
    useProjectiles: false,
    usePearls: false,
    maxBedDefense: 1,
  }),
  hard: Object.freeze({
    id: 'hard',
    label: 'Hard (Competitive Human)',
    walkSpeed: 3.6,
    sprintSpeed: 4.32,
    sprintAllowed: false,
    stepDelayMs: 50,
    bridgePlaceDelayMs: 220,
    chestLootDelayMs: 600,
    brainIntervalMs: 550,
    brainMoveDurationMs: 450,
    meleeCooldownMs: 650,
    critChance: 0.0,
    strafe: false,
    projectileCooldownMs: 4500,
    useProjectiles: false,
    usePearls: false,
    maxBedDefense: 2,
  }),
});

export function encodeFrames(msgId, json) {
  const id = Number(msgId).toString(36);
  const total = Math.max(1, Math.ceil(json.length / MAX_MESSAGE_BYTES));
  const frames = [];
  for (let i = 0; i < total; i++) {
    const slice = json.slice(i * MAX_MESSAGE_BYTES, (i + 1) * MAX_MESSAGE_BYTES);
    frames.push(`${id}|${i}|${total}|${slice}`);
  }
  return frames;
}

export function decodeVoxelsRLE(rle, targetArray) {
  if (!rle || !targetArray) return;
  let idx = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const val = rle[i];
    const count = rle[i + 1];
    targetArray.fill(val, idx, idx + count);
    idx += count;
  }
}

export function normalizeShareUrl(rawUrl = 'ws://localhost:3000/ws/share') {
  const trimmed = String(rawUrl || 'ws://localhost:3000/ws/share').trim();
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:') u.protocol = 'ws:';
    else if (u.protocol === 'https:') u.protocol = 'wss:';
    if (!u.pathname || u.pathname === '/') u.pathname = '/ws/share';
    return u.toString();
  } catch {
    return 'ws://localhost:3000/ws/share';
  }
}

function buildBedWarsArenaLayout(map = {}) {
  const teams = [2, 4, 8].includes(map.teams) ? map.teams : 4;
  const sides = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const rawBases = [];
  if (teams === 2) {
    for (const [sx, sz] of [sides[0], sides[2]]) rawBases.push({ x: sx * 44, z: sz * 44, fx: -sx, fz: -sz });
  } else if (teams === 4) {
    for (const [sx, sz] of sides) rawBases.push({ x: sx * 44, z: sz * 44, fx: -sx, fz: -sz });
  } else {
    for (const [sx, sz] of sides) {
      const rx = -sz, rz = sx;
      for (const along of [-1, 1]) rawBases.push({ x: sx * 52 + rx * along * 19, z: sz * 52 + rz * along * 19, fx: -sx, fz: -sz });
    }
  }
  const y = 30;
  const bases = rawBases.map((at, index) => {
    const team = BEDWARS_TEAMS[index];
    const fx = at.fx, fz = at.fz, rx = -fz, rz = fx;
    const W = (u, v) => [at.x + u * rx + v * fx, at.z + u * rz + v * fz];
    const [gx, gz] = W(0, -7);
    const [sx, sz] = W(0, -4);
    const [shopX, shopZ] = W(-5, -5);
    const [upX, upZ] = W(5, -5);
    const [chX, chZ] = W(3, -8);
    const [footX, footZ] = W(0, 3);
    const [headX, headZ] = W(0, 4);
    const cells = [];
    for (let u = -8; u <= 8; u++) for (let v = -9; v <= 7; v++) {
      if (Math.abs(u) === 8 && (v === -9 || v === 7)) continue;
      cells.push(W(u, v));
    }
    return {
      team: team.id,
      index,
      center: { x: at.x, z: at.z },
      facing: { x: fx, z: fz },
      spawn: { x: sx + 0.5, y: y + 1, z: sz + 0.5, yaw: Math.atan2(-fx, -fz) },
      forge: { x: gx + 0.5, y: y + 1, z: gz + 0.5 },
      shop: { x: shopX + 0.5, y: y + 1, z: shopZ + 0.5 },
      upgrades: { x: upX + 0.5, y: y + 1, z: upZ + 0.5 },
      chest: { x: chX, y: y + 1, z: chZ },
      bed: { foot: [footX, y + 1, footZ], head: [headX, y + 1, headZ] },
      cells,
    };
  });
  const diamondCoords = teams === 2
    ? [{ x: 26, z: 0 }, { x: -26, z: 0 }]
    : (() => { const d = teams === 8 ? 38 : 30; return [{ x: d, z: -d }, { x: d, z: d }, { x: -d, z: d }, { x: -d, z: -d }]; })();
  const diamonds = diamondCoords.map((at, i) => ({ id: `d${i}`, kind: 'diamond', x: at.x + 0.5, y: y + 1, z: at.z + 0.5, center: at }));
  const emeraldCoords = teams === 8
    ? [{ x: 4, z: 4 }, { x: -4, z: -4 }, { x: 4, z: -4 }, { x: -4, z: 4 }]
    : [{ x: 4, z: 0 }, { x: -4, z: 0 }];
  const emeralds = emeraldCoords.map((at, i) => ({ id: `e${i}`, kind: 'emerald', x: at.x + 0.5, y: y + 1, z: at.z + 0.5, center: at }));
  return {
    teams,
    surfaceY: y,
    voidY: -4,
    lobby: { x: 0.5, y: 53, z: 0.5 },
    spectator: { x: 0.5, y: 48, z: 0.5 },
    bases,
    diamonds,
    emeralds,
    midRadius: teams === 8 ? 12 : 10,
  };
}

function defaultSkyWarsSpawns() {
  const RING_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];
  const spawns = [];
  for (let slot = 0; slot < 8; slot++) {
    const angle = (RING_ORDER[slot] / 8) * Math.PI * 2;
    const x = Math.round(Math.sin(angle) * 24);
    const z = Math.round(-Math.cos(angle) * 24);
    spawns.push({ x: x + 0.5, y: 31, z: z + 0.5, yaw: Math.atan2(x, z) });
  }
  return spawns;
}

class GuestInventory {
  constructor() {
    this.hotbar = new Array(9).fill(null);
    this.storage = new Array(27).fill(null);
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this.offhand = null;
    this.activeSlot = 0;
  }

  clearCarried() {
    this.hotbar.fill(null);
    this.storage.fill(null);
    this.armor = { head: null, chest: null, legs: null, feet: null };
    this.offhand = null;
  }

  getActiveItem() {
    return this.hotbar[this.activeSlot] || null;
  }

  addItem(itemOrId, isBlock = false, count = 1, enchantments = null) {
    const stack = typeof itemOrId === 'object' && itemOrId !== null
      ? { ...itemOrId, count: itemOrId.count ?? 1, isBlock: Boolean(itemOrId.isBlock) }
      : { id: itemOrId, isBlock: Boolean(isBlock), count: Math.max(1, count), ...(enchantments ? { enchantments } : {}) };

    const canStack = !stack.enchantments && !stack.bedwars && !String(stack.id).endsWith('_sword')
      && !String(stack.id).endsWith('_pickaxe') && !String(stack.id).endsWith('_axe')
      && !String(stack.id).endsWith('_helmet') && !String(stack.id).endsWith('_chestplate')
      && !String(stack.id).endsWith('_leggings') && !String(stack.id).endsWith('_boots')
      && stack.id !== 'bow' && stack.id !== 'shears' && stack.id !== 'shield';

    if (canStack) {
      for (const list of [this.hotbar, this.storage]) {
        for (const s of list) {
          if (s && s.id === stack.id && Boolean(s.isBlock) === Boolean(stack.isBlock) && !s.enchantments && !s.bedwars && s.count < 64) {
            const add = Math.min(stack.count, 64 - s.count);
            s.count += add;
            stack.count -= add;
            if (stack.count <= 0) return true;
          }
        }
      }
    }

    for (const list of [this.hotbar, this.storage]) {
      for (let i = 0; i < list.length && stack.count > 0; i++) {
        if (!list[i]) {
          const put = canStack ? Math.min(64, stack.count) : 1;
          list[i] = { ...stack, count: put };
          stack.count -= put;
        }
      }
    }
    return stack.count <= 0;
  }

  allSlots() {
    return [...this.hotbar, ...this.storage];
  }

  countItem(id) {
    return this.allSlots().reduce((sum, s) => sum + (s && s.id === id ? s.count : 0), 0);
  }

  countPlaceableBlocks() {
    let total = 0;
    for (const s of this.allSlots()) {
      if (!s || s.count <= 0) continue;
      if (!s.isBlock && typeof s.id !== 'number') continue;
      const id = typeof s.id === 'number' ? s.id : BLOCK_BY_NAME.get(String(s.id).toLowerCase());
      if (Number.isInteger(id) && id > 0 && id !== BLOCKS.TNT && id !== BLOCKS.CHEST && !NON_SOLID_BLOCKS.has(id)) {
        total += s.count;
      }
    }
    return total;
  }

  takeItem(id, n = 1) {
    if (this.countItem(id) < n) return false;
    for (const list of [this.hotbar, this.storage]) {
      for (let i = 0; i < list.length && n > 0; i++) {
        const s = list[i];
        if (!s || s.id !== id) continue;
        const take = Math.min(n, s.count);
        s.count -= take;
        n -= take;
        if (s.count <= 0) list[i] = null;
      }
    }
    return true;
  }

  takePlaceableBlock(preferredBlockId = null) {
    const isPlaceable = (s) => {
      if (!s || s.count <= 0) return false;
      if (preferredBlockId !== null) return s.id === preferredBlockId;
      if (!s.isBlock && typeof s.id !== 'number') return false;
      const id = typeof s.id === 'number' ? s.id : BLOCK_BY_NAME.get(String(s.id).toLowerCase());
      return Number.isInteger(id) && id > 0 && id !== BLOCKS.TNT && id !== BLOCKS.CHEST && !NON_SOLID_BLOCKS.has(id);
    };

    for (const list of [this.hotbar, this.storage]) {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        if (!isPlaceable(s)) continue;
        const blockId = typeof s.id === 'number' ? s.id : BLOCK_BY_NAME.get(String(s.id).toLowerCase());
        s.count -= 1;
        if (s.count <= 0) list[i] = null;
        if (list === this.hotbar) this.activeSlot = i;
        return blockId;
      }
    }
    return null;
  }

  equipBest() {
    const slotForArmor = (id) => {
      const s = String(id || '');
      if (s.endsWith('_helmet')) return 'head';
      if (s.endsWith('_chestplate')) return 'chest';
      if (s.endsWith('_leggings')) return 'legs';
      if (s.endsWith('_boots')) return 'feet';
      return null;
    };
    const scoreArmor = (stack) => {
      if (!stack) return 0;
      const base = ARMOR_SCORE[stack.id] ?? 0;
      const prot = (stack.enchantments ?? []).reduce((acc, e) => acc + (e.id === 'protection' ? e.level : 0), 0);
      return base * 10 + prot;
    };

    for (const list of [this.hotbar, this.storage]) {
      for (let i = 0; i < list.length; i++) {
        const stack = list[i];
        if (!stack) continue;
        const armorKey = slotForArmor(stack.id);
        if (armorKey) {
          const current = this.armor[armorKey];
          if (scoreArmor(stack) > scoreArmor(current)) {
            this.armor[armorKey] = { ...stack, count: 1 };
            if (stack.count > 1) {
              stack.count -= 1;
            } else {
              list[i] = current ? { ...current } : null;
            }
          }
        } else if (stack.id === 'shield' && !this.offhand) {
          this.offhand = { ...stack, count: 1 };
          list[i] = null;
        }
      }
    }

    // Put strongest melee weapon into hotbar and select it.
    let bestWeaponIdx = -1;
    let bestWeaponList = null;
    let bestDamage = -1;
    const scoreWeapon = (stack) => {
      if (!stack) return -1;
      const base = WEAPON_DAMAGE[stack.id];
      if (!base) return -1;
      const sharp = (stack.enchantments ?? []).reduce((acc, e) => acc + (e.id === 'sharpness' ? 1.25 * e.level : 0), 0);
      return base + sharp;
    };

    for (const list of [this.hotbar, this.storage]) {
      for (let i = 0; i < list.length; i++) {
        const sc = scoreWeapon(list[i]);
        if (sc > bestDamage) {
          bestDamage = sc;
          bestWeaponIdx = i;
          bestWeaponList = list;
        }
      }
    }

    if (bestWeaponList === this.storage && bestWeaponIdx >= 0) {
      const targetHotbarIdx = this.hotbar.findIndex((s) => !s);
      const swapIdx = targetHotbarIdx >= 0 ? targetHotbarIdx : 0;
      const prev = this.hotbar[swapIdx];
      this.hotbar[swapIdx] = this.storage[bestWeaponIdx];
      this.storage[bestWeaponIdx] = prev;
      this.activeSlot = swapIdx;
    } else if (bestWeaponList === this.hotbar && bestWeaponIdx >= 0) {
      this.activeSlot = bestWeaponIdx;
    }
  }

  summary() {
    const formatStack = (s) => s ? {
      id: typeof s.id === 'number' ? (NAME_BY_BLOCK.get(s.id) ?? s.id) : s.id,
      blockId: typeof s.id === 'number' ? s.id : undefined,
      count: s.count,
      ...(s.enchantments?.length ? { enchantments: s.enchantments } : {}),
    } : null;
    return {
      activeSlot: this.activeSlot,
      held: formatStack(this.getActiveItem()),
      hotbar: this.hotbar.map((s, slot) => (s ? { slot, ...formatStack(s) } : null)).filter(Boolean),
      storage: this.storage.map((s, slot) => (s ? { slot, ...formatStack(s) } : null)).filter(Boolean),
      armor: {
        head: formatStack(this.armor.head),
        chest: formatStack(this.armor.chest),
        legs: formatStack(this.armor.legs),
        feet: formatStack(this.armor.feet),
      },
      offhand: formatStack(this.offhand),
    };
  }
}

export class GuestPeerSession {
  constructor({
    code,
    name = 'AgentBot',
    url = 'ws://localhost:3000/ws/share',
    WebSocketImpl = WebSocket,
    tickIntervalMs = 50,
    autopilot = true,
    strategy = 'auto',
    difficulty = 'normal',
    chatReplyDelayMs = 260,
    buildBlockDelayMs = 180,
    brain = null,
  } = {}) {
    this.roomId = String(code ?? '').trim();
    this.name = String(name || 'AgentBot').slice(0, 24);
    this.signalingUrl = normalizeShareUrl(url);
    this.WebSocketImpl = WebSocketImpl;
    this.tickIntervalMs = tickIntervalMs;
    this.autopilot = Boolean(autopilot);
    this.strategy = String(strategy || 'auto').toLowerCase();
    const rawDiff = String(difficulty || 'normal').toLowerCase().trim();
    this.difficulty = DIFFICULTIES.includes(rawDiff) ? rawDiff : 'normal';
    this.difficultyLockedByUser = Boolean(difficulty && DIFFICULTIES.includes(rawDiff) && rawDiff !== 'normal');
    this.chatReplyDelayMs = Math.max(0, Number(chatReplyDelayMs ?? 260));
    this.buildBlockDelayMs = Math.max(10, Number(buildBlockDelayMs ?? 180));

    this.ws = null;
    this.connected = false;
    this.clientId = null;
    this.hostName = 'Host';
    this.peers = new Map(); // peerId -> { id, name, isHost, x, y, z, yaw, pitch, activeItem, armor, dead }
    this.settings = { pvp: true };
    this.worldInfo = {};
    this.mechanism = 'default';
    this.gameMode = 'base'; // 'base' | 'skywars' | 'bedwars'
    this.worldTime = 6000;
    this.seed = null;

    this.chunks = new Map(); // "cx,cz" -> Uint16Array
    this.voxels = new Map(); // "x,y,z" -> blockId override / arena blocks
    this.chests = new Map(); // "x,y,z" -> { x, y, z, items: Array(27) }
    this.sharedDrops = new Map(); // id -> { id, x, y, z, item }
    this.chatLog = [];

    this.position = { x: 0.5, y: 31, z: 0.5 };
    this.velocity = { x: 0, y: 0, z: 0 };
    this.spawnPoint = { x: 0.5, y: 31, z: 0.5 };
    this.yaw = 0;
    this.pitch = 0;
    this.health = 20;
    this.maxHealth = 20;
    this.gamemode = 'survival';
    this.isDead = false;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isSwinging = false;
    this.blocking = false;
    this.lastHurtAt = 0;

    this.inventory = new GuestInventory();

    // SkyWars state
    this.skywarsState = null;
    this.skywarsSpawns = defaultSkyWarsSpawns();
    this.skywarsCagedRound = 0;
    this.skywarsRound = 0;

    // Bed Wars state
    this.bedwarsState = null;
    this.bedwarsArena = null;
    this.bedwarsKit = { armor: 0, pickaxe: 0, axe: 0, shears: false };
    this.bedwarsRound = 0;
    this.bedwarsPlacedRound = 0;
    this.waitingRespawn = false;
    this.lastCollectAt = 0;

    // Autonomous competitive brain state
    this.brainTimer = null;
    this.brainBusy = false;
    this.manualActionBusy = false;
    this.chatTaskBusy = false;
    this.lastActionSummary = 'idle';
    this.lastProjectileAt = 0;
    this.lastMeleeAt = 0;
    this.lastHealAt = 0;
    this.lastAttackerId = null;
    this.lastAttackedAt = 0;
    this.strafeDir = 1;
    this.strafeAngle = 0;
    this.bedDefenseCount = 0;
    this.lootedChestKeys = new Set();

    // Base game companion state
    this.companionMode = 'follow'; // 'follow' | 'stay'
    this.companionTargetId = 'host';
    // Talking with the player: an AI (model brain or external MCP client) answers and writes Mineflayer code.
    this.brain = typeof brain === 'function' ? brain : null;
    this.chatQueue = [];
    this.chatWaiters = [];
    this.chatSeq = 0;
    this.externalListenerAt = 0;
    this.noBrainNoticeSent = false;
    this.codeRuns = 0;
    this.lastChatReply = null;
    this.taskAbortToken = 0;
    this.lastGiftDropAt = 0;

    this.msgSeq = 0;
    this.assembly = new Map();
    this.tickTimer = null;
    this.pingTimer = null;
    this.currentGoal = null;
    this.snapshotReceived = false;
    this.snapshotWaiters = [];
    this.gameStateWaiters = [];
  }

  get profile() {
    return DIFFICULTY_PROFILES[this.difficulty] ?? DIFFICULTY_PROFILES.normal;
  }

  setDifficulty(difficulty, { locked = false } = {}) {
    const clean = String(difficulty || '').toLowerCase().trim();
    if (!DIFFICULTIES.includes(clean)) return this.difficulty;
    const changed = this.difficulty !== clean;
    this.difficulty = clean;
    if (locked) this.difficultyLockedByUser = true;
    if (changed && this.brainTimer && this.connected) {
      clearInterval(this.brainTimer);
      this.brainTimer = setInterval(() => {
        if (this.connected && this.autopilot && !this.manualActionBusy && !this.brainBusy && !this.chatTaskBusy) {
          void this.#runBrainTick();
        }
      }, this.profile.brainIntervalMs);
      this.brainTimer.unref?.();
    }
    return this.difficulty;
  }

  sendChat(text) {
    const clean = String(text ?? '').trim().slice(0, 240);
    if (!clean) return false;
    this.lastChatReply = clean;
    this.chatLog.push({
      sender: this.name,
      text: clean,
      time: Date.now(),
      self: true,
    });
    if (this.chatLog.length > 40) this.chatLog.shift();
    return this.sendPacket({ t: 'chat', text: clean });
  }

  chunkKey(cx, cz) {
    return `${cx},${cz}`;
  }

  cellKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getVoxel(x, y, z) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (by < 0 || by >= CHUNK_HEIGHT) return BLOCKS.AIR;
    const k = `${bx},${by},${bz}`;
    if (this.voxels.has(k)) return this.voxels.get(k);
    const cx = Math.floor(bx / CHUNK_SIZE_X);
    const cz = Math.floor(bz / CHUNK_SIZE_Z);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (!chunk) return BLOCKS.AIR;
    const lx = ((bx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((bz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    return chunk[(by * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx] ?? BLOCKS.AIR;
  }

  setVoxel(x, y, z, blockId) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (by < 0 || by >= CHUNK_HEIGHT) return;
    const k = `${bx},${by},${bz}`;
    this.voxels.set(k, blockId);
    const cx = Math.floor(bx / CHUNK_SIZE_X);
    const cz = Math.floor(bz / CHUNK_SIZE_Z);
    const chunk = this.chunks.get(this.chunkKey(cx, cz));
    if (chunk) {
      const lx = ((bx % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
      const lz = ((bz % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
      chunk[(by * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx] = blockId;
    }
    if (blockId === BLOCKS.CHEST && !this.chests.has(k)) {
      this.chests.set(k, { x: bx, y: by, z: bz, items: new Array(27).fill(null) });
    } else if (blockId === BLOCKS.AIR) {
      this.chests.delete(k);
    }
  }

  isSolid(x, y, z) {
    const id = this.getVoxel(x, y, z);
    return id !== BLOCKS.AIR && !NON_SOLID_BLOCKS.has(id);
  }

  async connect({ timeoutMs = 15_000, waitForSnapshot = true, team = null } = {}) {
    if (!/^[0-9]{4}$/.test(this.roomId)) {
      throw new Error(`Room code must be 4 digits (received "${this.roomId}")`);
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.disconnect();
        reject(new Error(`Timed out joining room ${this.roomId} at ${this.signalingUrl}`));
      }, timeoutMs);
      timer.unref?.();

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };

      const ws = new this.WebSocketImpl(this.signalingUrl);
      this.ws = ws;

      const onOpen = () => {
        ws.send(JSON.stringify({ type: 'join', room: this.roomId }));
      };

      const onMessage = (raw) => {
        const text = typeof raw === 'string' ? raw : raw?.data ? String(raw.data) : Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw);
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          return;
        }
        if (msg.type === 'error') {
          finish(new Error(msg.message || `Signaling error (${msg.code || 'unknown'})`));
          return;
        }
        if (msg.type === 'joined') {
          this.clientId = msg.guestId;
          ws.send(JSON.stringify({ type: 'signal', data: { kind: 'relay_request' } }));
          return;
        }
        if (msg.type === 'signal' && msg.data?.kind === 'relay_ok') {
          this.sendPacket({ t: 'hello', protocol: PROTOCOL_VERSION, name: this.name });
          return;
        }
        if (msg.type === 'host_left') {
          this.connected = false;
          finish(new Error(msg.message || 'The host closed the shared world.'));
          return;
        }
        if (msg.type === 'relay' && typeof msg.data === 'string') {
          const decoded = this.#decodeFrame(msg.data);
          if (decoded) {
            this.#handlePeerMessage(decoded, () => finish(null));
          }
        }
      };

      const onError = (err) => {
        finish(new Error(err?.message || `Could not connect to ${this.signalingUrl}`));
      };

      const onClose = () => {
        this.connected = false;
        if (!settled) finish(new Error(`Connection closed before welcome on room ${this.roomId}`));
      };

      if (typeof ws.on === 'function') {
        ws.on('open', onOpen);
        ws.on('message', onMessage);
        ws.on('error', onError);
        ws.on('close', onClose);
      } else {
        ws.onopen = onOpen;
        ws.onmessage = (ev) => onMessage(ev.data);
        ws.onerror = onError;
        ws.onclose = onClose;
      }
    });

    if (waitForSnapshot && !this.snapshotReceived) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2500);
        t.unref?.();
        this.snapshotWaiters.push(() => { clearTimeout(t); resolve(); });
      });
    }

    // Give mod hosts a brief moment to deliver initial game state if not yet arrived.
    if (this.gameMode === 'base' && (this.mechanism === 'skywars' || this.mechanism === 'bedwars')) {
      this.gameMode = this.mechanism;
    }
    if ((this.gameMode !== 'base' || !this.snapshotReceived) && !this.skywarsState && !this.bedwarsState) {
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 150);
        t.unref?.();
        this.gameStateWaiters.push(() => { clearTimeout(t); resolve(); });
      });
    }

    if (team && this.gameMode === 'bedwars') {
      this.chooseTeam(team);
    }

    this.#startLoops();
    this.broadcastState();
    return this.status();
  }

  disconnect() {
    this.connected = false;
    if (this.tickTimer) { clearInterval(this.tickTimer); this.tickTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.brainTimer) { clearInterval(this.brainTimer); this.brainTimer = null; }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors.
      }
      this.ws = null;
    }
  }

  sendPacket(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    const json = JSON.stringify(obj);
    const frames = encodeFrames(++this.msgSeq, json);
    for (const frame of frames) {
      this.ws.send(JSON.stringify({ type: 'relay', data: frame }));
    }
    return true;
  }

  #decodeFrame(frame) {
    if (typeof frame !== 'string') return null;
    const p1 = frame.indexOf('|');
    const p2 = frame.indexOf('|', p1 + 1);
    const p3 = frame.indexOf('|', p2 + 1);
    if (p1 < 1 || p2 < 0 || p3 < 0) {
      try { return JSON.parse(frame); } catch { return null; }
    }
    const id = frame.slice(0, p1);
    const index = Number(frame.slice(p1 + 1, p2));
    const total = Number(frame.slice(p2 + 1, p3));
    const slice = frame.slice(p3 + 1);
    if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1) return null;
    if (total === 1) {
      try { return JSON.parse(slice); } catch { return null; }
    }
    let entry = this.assembly.get(id);
    if (!entry) {
      entry = { parts: new Array(total), got: 0 };
      this.assembly.set(id, entry);
    }
    if (entry.parts[index] === undefined) {
      entry.parts[index] = slice;
      entry.got += 1;
    }
    if (entry.got < total) return null;
    this.assembly.delete(id);
    try { return JSON.parse(entry.parts.join('')); } catch { return null; }
  }

  #handlePeerMessage(msg, onWelcome) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome': {
        this.connected = true;
        this.clientId = msg.you?.id ?? this.clientId;
        this.name = msg.you?.name ?? this.name;
        this.hostName = msg.host?.name ?? 'Host';
        this.worldInfo = msg.worldInfo ?? {};
        if (typeof msg.settings?.pvp === 'boolean') this.settings.pvp = msg.settings.pvp;
        this.peers.clear();
        for (const p of msg.peers ?? []) {
          this.peers.set(p.id, {
            id: p.id,
            name: p.name,
            isHost: Boolean(p.isHost || p.id === 'host'),
            x: 0, y: 31, z: 0, yaw: 0, pitch: 0, dead: false,
          });
        }
        onWelcome?.();
        break;
      }
      case 'snapshot': {
        this.#applySnapshot(msg.packed);
        break;
      }
      case 'ping': {
        this.sendPacket({ t: 'pong' });
        break;
      }
      case 'pong':
        break;
      case 'peer_joined': {
        if (msg.peer?.id) {
          this.peers.set(msg.peer.id, {
            id: msg.peer.id,
            name: msg.peer.name,
            isHost: Boolean(msg.peer.id === 'host'),
            x: 0, y: 31, z: 0, yaw: 0, pitch: 0, dead: false,
          });
        }
        break;
      }
      case 'peer_left': {
        this.peers.delete(msg.peerId);
        break;
      }
      case 'player_state': {
        const peerId = msg.peerId || 'host';
        if (peerId === this.clientId) break;
        const existing = this.peers.get(peerId) || { id: peerId, name: peerId === 'host' ? this.hostName : peerId, isHost: peerId === 'host' };
        Object.assign(existing, msg.state);
        this.peers.set(peerId, existing);
        break;
      }
      case 'block_update': {
        this.setVoxel(msg.x, msg.y, msg.z, msg.blockId);
        break;
      }
      case 'container': {
        const bx = Math.floor(msg.x), by = Math.floor(msg.y), bz = Math.floor(msg.z);
        const k = `${bx},${by},${bz}`;
        const existing = this.chests.get(k);
        const items = new Array(27).fill(null);
        if (Array.isArray(msg.items)) {
          for (let i = 0; i < Math.min(27, msg.items.length); i++) {
            items[i] = msg.items[i] ? { ...msg.items[i] } : null;
          }
        }
        if (items.some(Boolean)) {
          this.lootedChestKeys.delete(k);
        }
        this.chests.set(k, {
          x: bx,
          y: by,
          z: bz,
          slot: existing?.slot ?? null,
          kind: existing?.kind ?? 'island',
          receivedContainer: true,
          items,
        });
        break;
      }
      case 'drops': {
        for (const d of msg.drops ?? []) {
          if (d?.id && d.item) this.sharedDrops.set(d.id, d);
        }
        break;
      }
      case 'taken': {
        this.sharedDrops.delete(msg.id);
        if (msg.by === this.clientId && msg.item) {
          this.inventory.addItem(msg.item);
          this.inventory.equipBest();
        }
        break;
      }
      case 'chat': {
        const sender = msg.sender || 'Player';
        const text = msg.text || '';
        const peerId = msg.peerId || 'host';
        this.chatLog.push({
          sender,
          text,
          peerId,
          time: Date.now(),
        });
        if (this.chatLog.length > 40) this.chatLog.shift();
        if (this._bot) this._bot.emit('chat', sender, text, null, null);
        if (peerId !== this.clientId && sender !== this.name && text.trim()) {
          void this.handlePlayerChat(sender, text, peerId);
        }
        break;
      }
      case 'settings': {
        if (typeof msg.pvp === 'boolean') this.settings.pvp = msg.pvp;
        break;
      }
      case 'time_sync': {
        if (typeof msg.worldTime === 'number') this.worldTime = msg.worldTime;
        break;
      }
      case 'hurt': {
        this.#onHurt(msg);
        break;
      }
      case 'game': {
        this.#onGameMessage(msg.data);
        break;
      }
      default:
        break;
    }
  }

  #applySnapshot(packed) {
    if (!packed || typeof packed.data !== 'string') return;
    let jsonText;
    try {
      if (packed.enc === 'gzip-b64') {
        const buf = Buffer.from(packed.data, 'base64');
        jsonText = zlib.gunzipSync(buf).toString('utf8');
      } else {
        jsonText = packed.data;
      }
      const data = JSON.parse(jsonText);
      const mapData = data.mapData || {};
      this.mechanism = mapData.mechanism || 'default';
      if (this.mechanism === 'skywars') this.gameMode = 'skywars';
      else if (this.mechanism === 'bedwars') this.gameMode = 'bedwars';
      this.seed = mapData.seed ?? null;
      this.worldTime = typeof data.worldTime === 'number' ? data.worldTime : (mapData.worldTime ?? 6000);

      this.chunks.clear();
      if (this.gameMode === 'base') {
        this.voxels.clear();
      }
      for (const ch of mapData.chunks ?? []) {
        const cx = ch.cx ?? ch.x ?? 0;
        const cz = ch.cz ?? ch.z ?? 0;
        const voxels = new Uint16Array(CHUNK_SIZE_X * CHUNK_HEIGHT * CHUNK_SIZE_Z);
        decodeVoxelsRLE(ch.voxels ?? ch.rle, voxels);
        this.chunks.set(this.chunkKey(cx, cz), voxels);
        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
            for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
              const id = voxels[(y * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx];
              if (id === BLOCKS.CHEST) {
                const wx = cx * CHUNK_SIZE_X + lx;
                const wz = cz * CHUNK_SIZE_Z + lz;
                const ck = `${wx},${y},${wz}`;
                if (!this.chests.has(ck)) {
                  this.chests.set(ck, { x: wx, y, z: wz, items: new Array(27).fill(null) });
                }
              }
            }
          }
        }
      }

      if (data.hostPos && Number.isFinite(data.hostPos.x)) {
        const hostPeer = this.peers.get('host') || { id: 'host', name: this.hostName, isHost: true };
        hostPeer.x = data.hostPos.x;
        hostPeer.y = data.hostPos.y;
        hostPeer.z = data.hostPos.z;
        hostPeer.yaw = data.hostYaw || 0;
        this.peers.set('host', hostPeer);
        if (this.gameMode === 'base') {
          this.position = { x: data.hostPos.x + 1.2, y: data.hostPos.y, z: data.hostPos.z + 1.2 };
          this.spawnPoint = { ...this.position };
          this.yaw = data.hostYaw || 0;
        }
      } else if (mapData.player?.position && this.gameMode === 'base') {
        this.position = {
          x: mapData.player.position.x + 1.2,
          y: mapData.player.position.y,
          z: mapData.player.position.z + 1.2,
        };
        this.spawnPoint = { ...this.position };
      }

      if (this.gameMode === 'skywars') {
        this.#stampSkyWarsIslands();
        if (this.skywarsState?.phase === 'playing') {
          this.#openSkyWarsCages();
        }
      } else if (this.gameMode === 'bedwars') {
        this.#stampBedWarsArena();
      }

      this.snapshotReceived = true;
      for (const resolve of this.snapshotWaiters.splice(0)) resolve();
    } catch {
      // Malformed snapshot ignored.
    }
  }

  #onGameMessage(data) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'state') {
      if (Array.isArray(data.teams) || Array.isArray(data.gens)) {
        this.gameMode = 'bedwars';
        this.#applyBedWarsState(data);
      } else {
        this.gameMode = 'skywars';
        this.#applySkyWarsState(data);
      }
      for (const resolve of this.gameStateWaiters.splice(0)) resolve();
      return;
    }

    if (this.gameMode === 'skywars') {
      if (data.type === 'event' && data.event?.kind === 'refill') {
        this.lootedChestKeys.clear();
      } else if (data.type === 'drops' && Array.isArray(data.drops)) {
        for (const d of data.drops) {
          if (d?.id && d.item) this.sharedDrops.set(d.id, d);
        }
      } else if (data.type === 'taken') {
        this.sharedDrops.delete(data.id);
        if (data.by === this.clientId && data.item) {
          this.inventory.addItem(data.item);
          this.inventory.equipBest();
        }
      }
      return;
    }

    if (this.gameMode === 'bedwars') {
      if (data.type === 'event' && data.event) {
        const ev = data.event;
        if (ev.kind === 'grant' && ev.id === this.clientId && ev.items) {
          for (const [res, itemId] of Object.entries(BEDWARS_RESOURCE_ITEMS)) {
            const count = ev.items[res] ?? 0;
            if (count > 0) this.inventory.addItem(itemId, false, count);
          }
        } else if (ev.kind === 'respawn' && ev.id === this.clientId) {
          this.#spawnAtBedWarsBase({ fresh: false });
        } else if (ev.kind === 'bed' && ev.team) {
          this.#removeBedWarsBedBlocks(ev.team);
        } else if (ev.kind === 'bed_gone') {
          for (const b of this.bedwarsArena?.bases ?? []) this.#removeBedWarsBedBlocks(b.team);
        }
      }
    }
  }

  #applySkyWarsState(state) {
    const prevPhase = this.skywarsState?.phase;
    this.skywarsState = state;
    if (state.difficulty && DIFFICULTIES.includes(state.difficulty) && !this.difficultyLockedByUser) {
      this.setDifficulty(state.difficulty);
    }
    if (Array.isArray(state.spawns) && state.spawns.length) {
      this.skywarsSpawns = state.spawns;
    }
    if (Array.isArray(state.chests)) {
      for (const c of state.chests) {
        const bx = Math.floor(c.x), by = Math.floor(c.y), bz = Math.floor(c.z);
        const ck = `${bx},${by},${bz}`;
        const existing = this.chests.get(ck);
        this.chests.set(ck, {
          x: bx,
          y: by,
          z: bz,
          slot: c.slot ?? existing?.slot ?? null,
          kind: c.kind ?? existing?.kind ?? 'island',
          receivedContainer: Boolean(existing?.receivedContainer),
          items: existing?.items ?? new Array(27).fill(null),
        });
        if (this.getVoxel(bx, by, bz) === BLOCKS.AIR) {
          this.voxels.set(ck, BLOCKS.CHEST);
        }
      }
    }
    if (state.round !== this.skywarsRound) {
      this.skywarsRound = state.round;
      this.skywarsCagedRound = 0;
      this.sharedDrops.clear();
      this.lootedChestKeys.clear();
    }
    for (const p of state.players ?? []) {
      if (p.id === this.clientId) continue;
      const peer = this.peers.get(p.id) || {
        id: p.id,
        name: p.name || p.id,
        isHost: p.id === 'host',
        x: 0,
        y: 31,
        z: 0,
        yaw: 0,
        pitch: 0,
        dead: !p.alive,
      };
      peer.dead = !p.alive;
      if (p.slot !== null && p.slot !== undefined && this.skywarsSpawns[p.slot] && peer.x === 0 && peer.z === 0) {
        const sp = this.skywarsSpawns[p.slot];
        peer.x = sp.x;
        peer.y = 31;
        peer.z = sp.z;
      }
      this.peers.set(p.id, peer);
    }
    this.#stampSkyWarsIslands();
    const me = this.me();
    const phase = state.phase;
    if ((phase === 'lobby' || phase === 'countdown') && me?.slot !== null && me?.slot !== undefined && this.skywarsCagedRound !== state.round) {
      const spot = this.skywarsSpawns[me.slot] ?? this.skywarsSpawns[0];
      if (spot) {
        this.position = { x: spot.x, y: spot.y, z: spot.z };
        this.spawnPoint = { ...this.position };
        this.yaw = spot.yaw ?? 0;
      }
      this.health = 20;
      this.isDead = false;
      this.gamemode = 'adventure';
      this.inventory.clearCarried();
      this.lootedChestKeys.clear();
      this.skywarsCagedRound = state.round;
      this.broadcastState();
    }
    if (phase === 'playing' && prevPhase !== 'playing') {
      this.#openSkyWarsCages();
      if (me?.alive) {
        this.gamemode = 'survival';
        this.isDead = false;
        this.health = 20;
        const groundY = this.#findGroundY(this.position.x, this.position.y, this.position.z);
        this.position.y = groundY ?? 31;
      } else {
        this.gamemode = 'spectator';
      }
      this.broadcastState();
      if (this.autopilot) {
        void this.#runBrainTick();
      }
    }
    if ((phase === 'playing' || phase === 'ended') && me && !me.alive) {
      this.gamemode = 'spectator';
      this.isDead = true;
    }
  }

  #findGroundY(x, startY, z) {
    const bx = Math.floor(x);
    const bz = Math.floor(z);
    const topY = Math.min(CHUNK_HEIGHT - 2, Math.floor(startY));
    for (let y = topY; y >= 0; y--) {
      if (this.isSolid(bx, y, bz) && !this.isSolid(bx, y + 1, bz)) {
        return y + 1;
      }
    }
    return null;
  }

  #stampSkyWarsIslands() {
    // Ensure center island and each spawn island have solid surfaces in the local voxel map.
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        if (dx * dx + dz * dz <= 64 && this.getVoxel(dx, 30, dz) === BLOCKS.AIR) {
          this.setVoxel(dx, 30, dz, BLOCKS.GRASS);
        }
      }
    }
    for (const spot of this.skywarsSpawns) {
      const sx = Math.floor(spot.x), sz = Math.floor(spot.z);
      const sy = Math.min(30, Math.floor(spot.y) - 1);
      for (let dx = -4; dx <= 4; dx++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (dx * dx + dz * dz <= 18 && this.getVoxel(sx + dx, sy, sz + dz) === BLOCKS.AIR) {
            this.setVoxel(sx + dx, sy, sz + dz, BLOCKS.GRASS);
          }
        }
      }
    }
  }

  #openSkyWarsCages() {
    for (const spot of this.skywarsSpawns) {
      const sx = Math.floor(spot.x), sy = Math.floor(spot.y), sz = Math.floor(spot.z);
      for (let y = Math.max(31, sy - 1); y <= sy + 4; y++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const id = this.getVoxel(sx + dx, y, sz + dz);
            if (id !== BLOCKS.CHEST) this.setVoxel(sx + dx, y, sz + dz, BLOCKS.AIR);
          }
        }
      }
    }
  }

  #applyBedWarsState(state) {
    const prevPhase = this.bedwarsState?.phase;
    this.bedwarsState = state;
    if (state.difficulty && DIFFICULTIES.includes(state.difficulty) && !this.difficultyLockedByUser) {
      this.setDifficulty(state.difficulty);
    }
    const teamsCount = state.map?.teams ?? 4;
    if (!this.bedwarsArena || this.bedwarsArena.teams !== teamsCount) {
      this.bedwarsArena = buildBedWarsArenaLayout(state.map);
      this.#stampBedWarsArena();
    }
    if (state.round !== this.bedwarsRound) {
      this.bedwarsRound = state.round;
      this.bedwarsPlacedRound = 0;
      this.bedwarsKit = { armor: 0, pickaxe: 0, axe: 0, shears: false };
      this.bedDefenseCount = 0;
      this.#stampBedWarsArena();
    }
    for (const p of state.players ?? []) {
      if (p.id === this.clientId) continue;
      const peer = this.peers.get(p.id) || {
        id: p.id,
        name: p.name || p.id,
        isHost: p.id === 'host',
        x: 0,
        y: 31,
        z: 0,
        yaw: 0,
        pitch: 0,
        dead: Boolean(!p.alive || p.dead),
      };
      peer.dead = Boolean(!p.alive || p.dead);
      if (p.team && this.bedwarsArena && peer.x === 0 && peer.z === 0) {
        const base = this.bedwarsArena.bases.find((b) => b.team === p.team);
        if (base) {
          peer.x = base.spawn.x;
          peer.y = base.spawn.y;
          peer.z = base.spawn.z;
        }
      }
      this.peers.set(p.id, peer);
    }
    const me = this.me();
    const phase = state.phase;
    if ((phase === 'lobby' || phase === 'countdown') && this.bedwarsPlacedRound !== state.round) {
      this.position = { ...this.bedwarsArena.lobby };
      this.spawnPoint = { ...this.position };
      this.health = 20;
      this.isDead = false;
      this.waitingRespawn = false;
      this.bedDefenseCount = 0;
      this.gamemode = 'adventure';
      this.inventory.clearCarried();
      this.bedwarsPlacedRound = state.round;
      this.broadcastState();
    }
    if (phase === 'playing' && prevPhase !== 'playing') {
      this.#stampBedWarsArena();
      this.bedDefenseCount = 0;
      if (me?.alive) {
        this.#spawnAtBedWarsBase({ fresh: true });
      } else {
        this.gamemode = 'spectator';
        this.position = { ...this.bedwarsArena.spectator };
      }
      this.broadcastState();
      if (this.autopilot) {
        void this.#runBrainTick();
      }
    }
    if (phase === 'playing' || phase === 'ended') {
      for (const t of state.teams ?? []) {
        if (!t.bed) this.#removeBedWarsBedBlocks(t.id);
      }
      if (me && !me.alive) {
        this.gamemode = 'spectator';
        this.isDead = true;
      } else if (me && me.alive && !me.dead && this.waitingRespawn) {
        this.#spawnAtBedWarsBase({ fresh: false });
      }
    }
  }

  #stampBedWarsArena() {
    if (!this.bedwarsArena) return;
    const y = this.bedwarsArena.surfaceY;
    for (const base of this.bedwarsArena.bases) {
      const teamDef = BEDWARS_TEAMS[base.index] ?? BEDWARS_TEAMS[0];
      for (const [cx, cz] of base.cells) {
        this.setVoxel(cx, y, cz, BLOCKS.GRASS);
      }
      this.setVoxel(base.bed.foot[0], base.bed.foot[1], base.bed.foot[2], teamDef.bedFoot);
      this.setVoxel(base.bed.head[0], base.bed.head[1], base.bed.head[2], teamDef.bedHead);
      this.setVoxel(base.chest.x, base.chest.y, base.chest.z, BLOCKS.CHEST);
    }
    for (const d of this.bedwarsArena.diamonds) {
      for (let dx = -4; dx <= 4; dx++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (dx * dx + dz * dz <= 18) this.setVoxel(d.center.x + dx, y, d.center.z + dz, BLOCKS.GRASS);
        }
      }
    }
    const r = this.bedwarsArena.midRadius;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz <= r * r + r * 0.6) this.setVoxel(dx, y, dz, BLOCKS.GRASS);
      }
    }
  }

  #removeBedWarsBedBlocks(teamId) {
    const base = this.bedwarsArena?.bases?.find((b) => b.team === teamId);
    if (!base) return;
    this.setVoxel(base.bed.foot[0], base.bed.foot[1], base.bed.foot[2], BLOCKS.AIR);
    this.setVoxel(base.bed.head[0], base.bed.head[1], base.bed.head[2], BLOCKS.AIR);
  }

  #spawnAtBedWarsBase({ fresh = false } = {}) {
    const me = this.me();
    const base = this.bedwarsArena?.bases?.find((b) => b.team === me?.team);
    if (!base) return;
    if (fresh) this.bedwarsKit = { armor: 0, pickaxe: 0, axe: 0, shears: false };
    this.waitingRespawn = false;
    this.isDead = false;
    this.health = 20;
    this.gamemode = 'survival';
    this.position = { x: base.spawn.x, y: base.spawn.y, z: base.spawn.z };
    this.spawnPoint = { ...this.position };
    this.yaw = base.spawn.yaw;
    this.pitch = 0;
    this.inventory.clearCarried();
    this.#applyBedWarsLoadout();
    this.broadcastState();
  }

  #applyBedWarsLoadout() {
    const myTeamObj = this.bedwarsState?.teams?.find((t) => t.id === this.me()?.team);
    const upgrades = myTeamObj?.upgrades ?? {};
    const sharp = upgrades.sharpness ? [{ id: 'sharpness', level: 1 }] : [];
    const hasSword = this.inventory.allSlots().some((s) => s && String(s.id).endsWith('_sword'));
    if (!hasSword) {
      this.inventory.addItem({ id: 'wooden_sword', isBlock: false, count: 1, ...(sharp.length ? { enchantments: sharp } : {}) });
    }
    if (this.bedwarsKit.pickaxe > 0) {
      const def = BEDWARS_PICKAXES[this.bedwarsKit.pickaxe];
      if (def && !this.inventory.allSlots().some((s) => s && s.id === def.id)) {
        this.inventory.addItem({ id: def.id, isBlock: false, count: 1, enchantments: def.enchantments.map((e) => ({ ...e })) });
      }
    }
    if (this.bedwarsKit.axe > 0) {
      const def = BEDWARS_AXES[this.bedwarsKit.axe];
      if (def && !this.inventory.allSlots().some((s) => s && s.id === def.id)) {
        this.inventory.addItem({ id: def.id, isBlock: false, count: 1, enchantments: [...def.enchantments.map((e) => ({ ...e })), ...sharp] });
      }
    }
    if (this.bedwarsKit.shears && !this.inventory.allSlots().some((s) => s && s.id === 'shears')) {
      this.inventory.addItem({ id: 'shears', isBlock: false, count: 1 });
    }
    const tier = BEDWARS_ARMOR_TIERS[this.bedwarsKit.armor] ?? 'leather';
    const prot = upgrades.protection ? [{ id: 'protection', level: upgrades.protection }] : [];
    const bootsEnch = [...prot, ...(upgrades.cushioned ? [{ id: 'feather_falling', level: upgrades.cushioned }] : [])];
    this.inventory.armor = {
      head: { id: 'leather_helmet', isBlock: false, count: 1, ...(prot.length ? { enchantments: prot } : {}) },
      chest: { id: 'leather_chestplate', isBlock: false, count: 1, ...(prot.length ? { enchantments: prot } : {}) },
      legs: { id: `${tier}_leggings`, isBlock: false, count: 1, ...(prot.length ? { enchantments: prot } : {}) },
      feet: { id: `${tier}_boots`, isBlock: false, count: 1, ...(bootsEnch.length ? { enchantments: bootsEnch } : {}) },
    };
  }

  #onHurt(hit) {
    if (this.isDead || this.gamemode === 'spectator' || this.gamemode === 'creative') return;
    const now = Date.now();
    if (now - this.lastHurtAt < 400) return;
    this.lastHurtAt = now;

    if (hit.attackerId || hit.fromId) {
      this.lastAttackerId = hit.attackerId || hit.fromId;
      this.lastAttackedAt = now;
    } else if (hit.from && Number.isFinite(hit.from.x) && Number.isFinite(hit.from.z)) {
      let closestId = null;
      let closestDist = Infinity;
      for (const peer of this.peers.values()) {
        const d = Math.hypot((peer.x ?? 0) - hit.from.x, (peer.z ?? 0) - hit.from.z);
        if (d < closestDist) {
          closestDist = d;
          closestId = peer.id;
        }
      }
      if (closestId) {
        this.lastAttackerId = closestId;
        this.lastAttackedAt = now;
      }
    }

    const rawDamage = Number.isFinite(hit.damage) ? hit.damage : 2;
    let armorPoints = 0;
    let protLevels = 0;
    for (const slot of ['head', 'chest', 'legs', 'feet']) {
      const piece = this.inventory.armor[slot];
      if (!piece) continue;
      armorPoints += ARMOR_SCORE[piece.id] ?? 0;
      for (const e of piece.enchantments ?? []) {
        if (e.id === 'protection') protLevels += e.level || 1;
      }
    }
    const armorReduction = Math.min(0.8, armorPoints * 0.04);
    const enchReduction = Math.min(0.8, protLevels * 0.04);
    const finalDamage = Math.max(0.5, rawDamage * (1 - armorReduction) * (1 - enchReduction));

    if (hit.from && Number.isFinite(hit.from.x) && Number.isFinite(hit.from.z)) {
      const dx = this.position.x - hit.from.x;
      const dz = this.position.z - hit.from.z;
      const dist = Math.hypot(dx, dz) || 1;
      const kb = 0.45 * (1 + (hit.knockbackLevel || (hit.isSprint ? 1 : 0)) * 0.5);
      const nx = this.position.x + (dx / dist) * kb;
      const nz = this.position.z + (dz / dist) * kb;
      if (!this.isSolid(nx, this.position.y, nz) && this.isSolid(nx, Math.floor(this.position.y) - 1, nz)) {
        this.position.x = nx;
        this.position.z = nz;
      }
    }

    this.health = Math.max(0, Number((this.health - finalDamage).toFixed(2)));
    if (this.health <= 0) {
      const cause = hit.projectile === 'arrow' ? 'arrow' : 'player';
      this.#handleDeath(cause);
    } else {
      if (this.health <= 12) {
        this.#consumeHealingItem();
      }
      this.broadcastState();
    }
  }

  #handleDeath(cause = 'other') {
    if (this.gameMode === 'skywars') {
      const me = this.me();
      if (this.skywarsState?.phase === 'playing' && me?.alive) {
        const items = this.inventory.allSlots().filter(Boolean).map((s) => ({ ...s }));
        this.inventory.clearCarried();
        if (items.length) {
          this.sendPacket({
            t: 'game',
            data: { type: 'drop_items', x: this.position.x, y: this.position.y, z: this.position.z, items },
          });
        }
        this.sendPacket({ t: 'game', data: { type: 'died', cause } });
      }
      this.isDead = true;
      this.gamemode = 'spectator';
      this.position = { x: 0.5, y: 44, z: 0.5 };
      this.broadcastState();
      return;
    }

    if (this.gameMode === 'bedwars') {
      const me = this.me();
      if (this.bedwarsState?.phase === 'playing' && me?.alive && !me.dead && !this.waitingRespawn) {
        const resources = {};
        for (const [res, itemId] of Object.entries(BEDWARS_RESOURCE_ITEMS)) {
          resources[res] = this.inventory.countItem(itemId);
        }
        this.inventory.clearCarried();
        this.bedwarsKit = {
          ...this.bedwarsKit,
          pickaxe: this.bedwarsKit.pickaxe > 1 ? this.bedwarsKit.pickaxe - 1 : this.bedwarsKit.pickaxe,
          axe: this.bedwarsKit.axe > 1 ? this.bedwarsKit.axe - 1 : this.bedwarsKit.axe,
        };
        this.waitingRespawn = true;
        this.isDead = true;
        this.gamemode = 'spectator';
        this.position = { ...(this.bedwarsArena?.spectator ?? { x: 0.5, y: 48, z: 0.5 }) };
        this.sendPacket({ t: 'game', data: { type: 'died', cause, resources } });
        this.broadcastState();
      }
      return;
    }

    // Base game death & respawn
    const items = this.inventory.allSlots().filter(Boolean).map((s) => ({ ...s }));
    if (items.length) {
      this.sendPacket({
        t: 'death_drops',
        x: this.position.x,
        y: this.position.y,
        z: this.position.z,
        items,
      });
    }
    this.inventory.clearCarried();
    this.health = 20;
    this.isDead = false;
    this.position = { ...this.spawnPoint };
    this.broadcastState();
  }

  #startLoops() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.brainTimer) clearInterval(this.brainTimer);
    this.tickTimer = setInterval(() => this.tick(this.tickIntervalMs / 1000), this.tickIntervalMs);
    this.tickTimer.unref?.();
    this.pingTimer = setInterval(() => {
      if (this.connected) this.sendPacket({ t: 'ping' });
    }, 4000);
    this.pingTimer.unref?.();
    this.brainTimer = setInterval(() => {
      if (this.connected && this.autopilot && !this.manualActionBusy && !this.brainBusy && !this.chatTaskBusy) {
        void this.#runBrainTick();
      }
    }, this.profile.brainIntervalMs);
    this.brainTimer.unref?.();
  }

  tick(dt = 0.05) {
    if (!this.connected) return;

    // 1. Gravity & ground snapping when in survival
    if (!this.isDead && this.gamemode === 'survival' && !this.manualActionBusy && !this.brainBusy) {
      const footY = Math.floor(this.position.y) - 1;
      if (!this.isSolid(this.position.x, footY, this.position.z)) {
        const groundY = this.#findGroundY(this.position.x, this.position.y, this.position.z);
        if (groundY !== null && this.position.y > groundY) {
          this.position.y = Math.max(groundY, this.position.y - Math.max(0.8, dt * 18));
        } else if (groundY === null) {
          this.position.y -= Math.max(0.8, dt * 18);
        }
      }
    }

    // 2. Auto-claim nearby shared drops (unless we just dropped a gift for the player)
    if (!this.isDead && this.gamemode !== 'spectator' && Date.now() - this.lastGiftDropAt >= 8000) {
      for (const drop of this.sharedDrops.values()) {
        if (Math.hypot(this.position.x - drop.x, this.position.z - drop.z) <= 1.8 && Math.abs(this.position.y - drop.y) <= 2.5) {
          if (this.gameMode === 'skywars') {
            this.sendPacket({ t: 'game', data: { type: 'claim', id: drop.id } });
          } else {
            this.sendPacket({ t: 'claim', id: drop.id });
          }
        }
      }
    }

    // 3. Bed Wars generator auto-pickup when standing near a generator
    if (this.gameMode === 'bedwars' && this.bedwarsState?.phase === 'playing' && !this.isDead && !this.waitingRespawn) {
      const now = Date.now();
      if (now - this.lastCollectAt >= 200) {
        for (const gen of this.bedwarsState.gens ?? []) {
          const hasStock = Object.values(gen.stock ?? {}).some((v) => v > 0);
          if (!hasStock) continue;
          const pos = this.#bedWarsGenPosition(gen.id);
          if (pos && Math.hypot(this.position.x - pos.x, this.position.z - pos.z) <= 1.8 && Math.abs(this.position.y - pos.y) <= 2.5) {
            this.lastCollectAt = now;
            this.sendPacket({ t: 'game', data: { type: 'collect', gen: gen.id } });
          }
        }
      }
    }

    // 4. Void check in SkyWars / Bed Wars
    if (!this.isDead && this.gamemode === 'survival' && this.position.y < -4) {
      if (this.gameMode === 'skywars' && this.skywarsState?.phase === 'playing') {
        this.#handleDeath('void');
        return;
      }
      if (this.gameMode === 'bedwars' && this.bedwarsState?.phase === 'playing') {
        this.#handleDeath('void');
        return;
      }
    }

    this.broadcastState();
    if (this._bot) { this._bot.emit('physicsTick'); this._bot.emit('physicTick'); }
  }

  #bedWarsGenPosition(genId) {
    if (!this.bedwarsArena) return null;
    if (String(genId).startsWith('f-')) {
      const teamId = String(genId).slice(2);
      return this.bedwarsArena.bases.find((b) => b.team === teamId)?.forge ?? null;
    }
    return [...this.bedwarsArena.diamonds, ...this.bedwarsArena.emeralds].find((g) => g.id === genId) ?? null;
  }

  broadcastState({ swinging = this.isSwinging } = {}) {
    if (!this.connected) return false;
    const held = this.inventory.getActiveItem();
    const state = {
      x: Number(this.position.x.toFixed(3)),
      y: Number(this.position.y.toFixed(3)),
      z: Number(this.position.z.toFixed(3)),
      yaw: Number(this.yaw.toFixed(3)),
      pitch: Number(this.pitch.toFixed(3)),
      isSneaking: Boolean(this.isSneaking),
      isSprinting: Boolean(this.isSprinting),
      isSwinging: Boolean(swinging),
      activeItem: held ? held.id : null,
      armor: this.inventory.armor,
      offhand: this.inventory.offhand,
      ...(this.isDead || this.waitingRespawn ? { dead: true } : {}),
      ...(this.blocking ? { blocking: true } : {}),
    };
    return this.sendPacket({ t: 'player_state', state });
  }

  me() {
    if (this.gameMode === 'skywars') {
      return this.skywarsState?.players?.find((p) => p.id === this.clientId) ?? null;
    }
    if (this.gameMode === 'bedwars') {
      return this.bedwarsState?.players?.find((p) => p.id === this.clientId) ?? null;
    }
    return { id: this.clientId, name: this.name, alive: !this.isDead };
  }

  chooseTeam(teamId) {
    const clean = String(teamId ?? '').toLowerCase().trim();
    this.sendPacket({ t: 'game', data: { type: 'team', team: clean } });
    return { ok: true, team: clean };
  }

  // --- direct actions & high-level goals -------------------------------------------------------------------

  lookAt(x, y, z) {
    const dx = x - this.position.x;
    const dy = y - (this.position.y + 1.62);
    const dz = z - this.position.z;
    const horiz = Math.hypot(dx, dz) || 1e-6;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(dy, horiz)));
  }

  resolveBlockId(blockInput) {
    if (typeof blockInput === 'number' && Number.isInteger(blockInput)) return blockInput;
    const raw = String(blockInput ?? '').trim().toLowerCase().replace(/^minecraft:/, '');
    if (!raw) return null;
    if (raw === 'wool') {
      const myTeam = this.me()?.team;
      const teamDef = BEDWARS_TEAMS.find((t) => t.id === myTeam);
      return teamDef ? teamDef.wool : BLOCKS.WHITE_WOOL;
    }
    return BLOCK_BY_NAME.get(raw) ?? BLOCK_BY_NAME.get(raw.toUpperCase()) ?? null;
  }

  placeBlockAt(x, y, z, blockInput = null, { broadcast = true } = {}) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if (by < 0 || by >= CHUNK_HEIGHT) return { ok: false, reason: 'Out of world bounds' };
    const preferredId = blockInput !== null && blockInput !== undefined ? this.resolveBlockId(blockInput) : null;
    let blockId = this.inventory.takePlaceableBlock(preferredId);
    if (blockId === null) {
      blockId = preferredId ?? (this.gameMode === 'bedwars' ? this.resolveBlockId('wool') : BLOCKS.COBBLESTONE);
    }
    this.lookAt(bx + 0.5, by + 0.5, bz + 0.5);
    this.setVoxel(bx, by, bz, blockId);
    this.sendPacket({ t: 'block_update', x: bx, y: by, z: bz, blockId });
    if (broadcast) this.broadcastState({ swinging: true });
    return { ok: true, position: [bx, by, bz], blockId, block: NAME_BY_BLOCK.get(blockId) ?? blockId };
  }

  breakBlockAt(x, y, z, { harvest = true } = {}) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const oldId = this.getVoxel(bx, by, bz);
    if (oldId === BLOCKS.AIR) return { ok: false, reason: 'Block is already air', position: [bx, by, bz] };

    this.lookAt(bx + 0.5, by + 0.5, bz + 0.5);
    if (this.gameMode === 'bedwars' && this.bedwarsArena) {
      const bedBase = this.bedwarsArena.bases.find((b) =>
        (b.bed.foot[0] === bx && b.bed.foot[1] === by && b.bed.foot[2] === bz) ||
        (b.bed.head[0] === bx && b.bed.head[1] === by && b.bed.head[2] === bz)
      );
      if (bedBase) {
        if (bedBase.team === this.me()?.team) {
          return { ok: false, reason: 'Cannot break your own team bed' };
        }
        this.#removeBedWarsBedBlocks(bedBase.team);
        this.sendPacket({ t: 'game', data: { type: 'bed', team: bedBase.team } });
        this.sendPacket({ t: 'block_update', x: bx, y: by, z: bz, blockId: BLOCKS.AIR });
        this.broadcastState({ swinging: true });
        return { ok: true, brokeBed: bedBase.team, position: [bx, by, bz] };
      }
    }

    this.setVoxel(bx, by, bz, BLOCKS.AIR);
    this.sendPacket({ t: 'block_update', x: bx, y: by, z: bz, blockId: BLOCKS.AIR });
    if (this.gameMode === 'base' && harvest && !BED_BLOCK_IDS.has(oldId)) {
      const drop = baseGameDrop(oldId);
      if (drop) this.inventory.addItem(drop);
    }
    this.broadcastState({ swinging: true });
    return { ok: true, position: [bx, by, bz], brokenBlockId: oldId, brokenBlock: NAME_BY_BLOCK.get(oldId) ?? oldId };
  }

  resolveTargetPosition(args = {}) {
    if (Array.isArray(args.position) && args.position.length === 3 && args.position.every(Number.isFinite)) {
      return { x: args.position[0], y: args.position[1], z: args.position[2], label: `[${args.position.join(', ')}]` };
    }
    const target = String(args.target || args.team || '').trim().toLowerCase();
    if (!target) return null;

    if (target === 'center' || target === 'mid' || target === 'middle') {
      return { x: 0.5, y: 31, z: 0.5, label: 'center' };
    }

    // Player by name or id
    for (const peer of this.peers.values()) {
      if (peer.id.toLowerCase() === target || (peer.name && peer.name.toLowerCase() === target)) {
        return { x: peer.x, y: peer.y, z: peer.z, label: peer.name, peerId: peer.id };
      }
    }

    if (this.gameMode === 'bedwars' && this.bedwarsArena) {
      const myTeam = this.me()?.team;
      const myBase = this.bedwarsArena.bases.find((b) => b.team === myTeam);
      if ((target === 'forge' || target === 'generator') && myBase) {
        return { ...myBase.forge, label: `${myTeam} forge` };
      }
      if (target === 'shop' && myBase) {
        return { ...myBase.shop, label: `${myTeam} shop` };
      }
      if (target === 'base' || target === 'spawn') {
        if (myBase) return { ...myBase.spawn, label: `${myTeam} base` };
      }
      if (target === 'diamond' || target.startsWith('d')) {
        const specific = this.bedwarsArena.diamonds.find((d) => d.id === target);
        const chosen = specific ?? [...this.bedwarsArena.diamonds].sort(
          (a, b) => Math.hypot(a.x - this.position.x, a.z - this.position.z) - Math.hypot(b.x - this.position.x, b.z - this.position.z)
        )[0];
        if (chosen) return { x: chosen.x, y: chosen.y, z: chosen.z, label: `diamond (${chosen.id})` };
      }
      if (target === 'emerald' || target.startsWith('e')) {
        const specific = this.bedwarsArena.emeralds.find((e) => e.id === target);
        const chosen = specific ?? [...this.bedwarsArena.emeralds].sort(
          (a, b) => Math.hypot(a.x - this.position.x, a.z - this.position.z) - Math.hypot(b.x - this.position.x, b.z - this.position.z)
        )[0];
        if (chosen) return { x: chosen.x, y: chosen.y, z: chosen.z, label: `emerald (${chosen.id})` };
      }
      const teamBase = this.bedwarsArena.bases.find((b) => b.team === target);
      if (teamBase) {
        return {
          x: teamBase.bed.foot[0] + 0.5,
          y: teamBase.bed.foot[1],
          z: teamBase.bed.foot[2] + 0.5,
          label: `${teamBase.team} base`,
          team: teamBase.team,
        };
      }
    }

    if (this.gameMode === 'skywars' && /^slot[-_ ]?(\d)$/.test(target)) {
      const slot = Number(target.match(/(\d)/)[1]);
      const sp = this.skywarsSpawns[slot];
      if (sp) return { x: sp.x, y: sp.y, z: sp.z, label: `island ${slot}` };
    }

    return null;
  }

  async moveStepToward(tx, ty, tz, { bridge = false, maxDistance = 120, durationMs = 15000, stopWithin = 1.2, stepDelayMs = null, abortToken = null, isCancelled = null } = {}) {
    const startedAt = Date.now();
    let lastStepAt = startedAt;
    const prof = this.profile;
    const effectiveStepDelayMs = Math.max(15, Number(stepDelayMs ?? prof.stepDelayMs ?? 50));
    const nominalDt = effectiveStepDelayMs / 1000;
    let bridgedBlocks = 0;
    let steps = 0;
    const maxSteps = Math.max(1, Math.min(600, Math.ceil(maxDistance / Math.max(0.12, prof.walkSpeed * nominalDt))));

    while (steps < maxSteps && Date.now() - startedAt <= durationMs) {
      if (abortToken !== null && this.taskAbortToken !== abortToken) break;
      if (isCancelled?.()) break;
      const now = Date.now();
      const dt = steps === 0 ? nominalDt : Math.min(0.12, Math.max(nominalDt, (now - lastStepAt) / 1000));
      lastStepAt = now;

      const dx = tx - this.position.x;
      const dz = tz - this.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= stopWithin) break;

      const sprinting = prof.sprintAllowed && dist > 2.5 && !this.isSneaking;
      const moveSpeed = sprinting ? prof.sprintSpeed : prof.walkSpeed;
      const stepLen = Math.min(moveSpeed * dt, dist);
      let nx = this.position.x + (dx / dist) * stepLen;
      let nz = this.position.z + (dz / dist) * stepLen;
      let ny = this.position.y;
      let placedBridgeThisStep = false;

      this.lookAt(tx, ty, tz);

      // Step up 1 block or steer around 2-block-tall obstacles (trees, pillars, chests)
      if (this.isSolid(nx, ny, nz)) {
        if (!this.isSolid(nx, ny + 1, nz) && !this.isSolid(nx, ny + 2, nz)) {
          ny += 1;
        } else {
          const perpX = -dz / dist;
          const perpZ = dx / dist;
          const leftX = this.position.x + (dx / dist * 0.5 + perpX * 0.65) * stepLen;
          const leftZ = this.position.z + (dz / dist * 0.5 + perpZ * 0.65) * stepLen;
          const rightX = this.position.x + (dx / dist * 0.5 - perpX * 0.65) * stepLen;
          const rightZ = this.position.z + (dz / dist * 0.5 - perpZ * 0.65) * stepLen;
          if (!this.isSolid(leftX, ny, leftZ)) {
            nx = leftX;
            nz = leftZ;
          } else if (!this.isSolid(rightX, ny, rightZ)) {
            nx = rightX;
            nz = rightZ;
          } else if (!this.isSolid(nx, ny + 1, nz)) {
            ny += 1;
          }
        }
      } else if (ty > ny + 0.8 && bridge) {
        // Stair-bridge upward when target is higher
        const underX = Math.floor(nx), underY = Math.floor(ny), underZ = Math.floor(nz);
        if (!this.isSolid(underX, underY, underZ)) {
          this.isSneaking = true;
          this.isSprinting = false;
          const placed = this.placeBlockAt(underX, underY, underZ, null, { broadcast: false });
          if (placed.ok) {
            bridgedBlocks++;
            placedBridgeThisStep = true;
            ny = underY + 1;
          }
        }
      }

      const floorX = Math.floor(nx);
      const floorY = Math.floor(ny) - 1;
      const floorZ = Math.floor(nz);

      if (!this.isSolid(floorX, floorY, floorZ)) {
        if (bridge) {
          this.isSneaking = true;
          this.isSprinting = false;
          const placed = this.placeBlockAt(floorX, floorY, floorZ, null, { broadcast: false });
          if (placed.ok) {
            bridgedBlocks++;
            placedBridgeThisStep = true;
            // Advance onto the newly placed bridge block along our heading
            const bridgeStep = Math.min(dist, 0.78);
            nx = this.position.x + (dx / dist) * bridgeStep;
            nz = this.position.z + (dz / dist) * bridgeStep;
          } else if (this.isSolid(floorX, floorY - 1, floorZ)) {
            ny -= 1;
          } else if (!this.manualActionBusy) {
            break;
          }
        } else if (this.isSolid(floorX, floorY - 1, floorZ)) {
          ny -= 1;
        } else if (this.gameMode !== 'base') {
          // Stop at island edge rather than walking into void when bridge is false.
          break;
        }
      } else {
        this.isSneaking = false;
      }

      this.position.x = nx;
      this.position.y = ny;
      this.position.z = nz;
      this.isSprinting = dist > 2.5 && !this.isSneaking;
      this.broadcastState({ swinging: placedBridgeThisStep });
      steps++;
      const waitMs = placedBridgeThisStep
        ? Math.min(prof.bridgePlaceDelayMs, Math.max(effectiveStepDelayMs, durationMs - (Date.now() - startedAt)))
        : effectiveStepDelayMs;
      if (waitMs > 0) {
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    this.isSprinting = false;
    this.isSneaking = false;
    this.broadcastState();
    const remaining = Number(Math.hypot(tx - this.position.x, tz - this.position.z).toFixed(2));
    return {
      ok: remaining <= stopWithin + 0.5 || steps > 0,
      reached: remaining <= stopWithin + 0.5,
      position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))],
      remainingDistance: remaining,
      bridgedBlocks,
    };
  }

  async lootChest(args = {}) {
    let targetChest = null;
    if (Array.isArray(args.position) && args.position.length === 3) {
      const [x, y, z] = args.position.map(Math.floor);
      targetChest = this.chests.get(`${x},${y},${z}`) || { x, y, z, items: [] };
    } else {
      const candidates = [...this.chests.values()].filter((c) => c.items?.some(Boolean));
      const pool = candidates.length ? candidates : [...this.chests.values()];
      pool.sort((a, b) =>
        Math.hypot(a.x + 0.5 - this.position.x, a.z + 0.5 - this.position.z) -
        Math.hypot(b.x + 0.5 - this.position.x, b.z + 0.5 - this.position.z)
      );
      targetChest = pool[0] ?? null;
    }

    if (!targetChest) {
      return { ok: false, reason: 'No chest found nearby' };
    }

    const dist = Math.hypot(targetChest.x + 0.5 - this.position.x, targetChest.z + 0.5 - this.position.z);
    if (dist > 4.2) {
      await this.moveStepToward(targetChest.x + 0.5, targetChest.y, targetChest.z + 0.5, {
        bridge: Boolean(args.bridge ?? true),
        stopWithin: 2.5,
        durationMs: args.duration_ms ?? 4000,
      });
    }

    const finalDist = Math.hypot(targetChest.x + 0.5 - this.position.x, targetChest.z + 0.5 - this.position.z);
    if (finalDist > 5.5) {
      return { ok: false, reason: `Could not reach chest at [${targetChest.x}, ${targetChest.y}, ${targetChest.z}] (distance ${finalDist.toFixed(1)})` };
    }

    this.lookAt(targetChest.x + 0.5, targetChest.y + 0.5, targetChest.z + 0.5);
    const looted = [];
    const chestsToLoot = [
      targetChest,
      ...[...this.chests.values()].filter((c) =>
        c !== targetChest &&
        (c.items?.some(Boolean) || (this.gameMode === 'skywars' && !this.lootedChestKeys.has(`${c.x},${c.y},${c.z}`))) &&
        Math.hypot(c.x - targetChest.x, c.z - targetChest.z) <= 6
      ),
    ];
    for (const chest of chestsToLoot) {
      const ck = `${chest.x},${chest.y},${chest.z}`;
      this.lootedChestKeys.add(ck);
      if (this.gameMode === 'skywars' && !chest.receivedContainer && !(chest.items ?? []).some(Boolean)) {
        chest.items = chest.kind === 'center'
          ? [
              { id: 'diamond_sword', count: 1, isBlock: false },
              { id: 'diamond_chestplate', count: 1, isBlock: false },
              { id: 'golden_apple', count: 2, isBlock: false },
              { id: 'ender_pearl', count: 1, isBlock: false },
              { id: BLOCKS.OAK_PLANKS, count: 32, isBlock: true },
            ]
          : [
              { id: 'iron_sword', count: 1, isBlock: false },
              { id: 'iron_chestplate', count: 1, isBlock: false },
              { id: 'iron_boots', count: 1, isBlock: false },
              { id: 'snowball', count: 8, isBlock: false },
              { id: BLOCKS.OAK_PLANKS, count: 32, isBlock: true },
            ];
      }
      const remainingSlots = new Array(27).fill(null);
      for (let i = 0; i < (chest.items?.length ?? 0); i++) {
        const item = chest.items[i];
        if (!item) continue;
        if (this.inventory.addItem(item)) {
          looted.push({ id: item.id, count: item.count });
        } else {
          remainingSlots[i] = item;
        }
      }
      chest.items = remainingSlots;
      this.sendPacket({
        t: 'container',
        x: chest.x,
        y: chest.y,
        z: chest.z,
        items: remainingSlots,
      });
    }
    this.inventory.equipBest();
    this.broadcastState({ swinging: true });

    const invSummary = this.inventory.summary();
    return {
      ok: true,
      chest: [targetChest.x, targetChest.y, targetChest.z],
      looted,
      taken: looted,
      heldItem: invSummary.held,
      inventory: invSummary,
    };
  }

  buyInBedWars(itemKey, count = 1) {
    if (this.gameMode !== 'bedwars' || this.bedwarsState?.phase !== 'playing') {
      return { ok: false, reason: 'Bed Wars match is not currently in playing phase' };
    }
    const key = String(itemKey ?? '').trim();
    const myTeamId = this.me()?.team;
    const teamDef = BEDWARS_TEAMS.find((t) => t.id === myTeamId);
    const myTeamState = this.bedwarsState?.teams?.find((t) => t.id === myTeamId);
    if (!teamDef || !myTeamState) return { ok: false, reason: 'Not assigned to a Bed Wars team' };

    const mode = this.bedwarsState.mode || 'fours';
    const group = (mode === 'solo' || mode === 'doubles') ? 'small' : 'large';

    // 1. Check Team Upgrades
    if (BEDWARS_UPGRADES[key]) {
      const def = BEDWARS_UPGRADES[key];
      const nextLevel = (myTeamState.upgrades?.[key] ?? 0) + 1;
      if (nextLevel > def.max) return { ok: false, reason: 'Upgrade already maxed' };
      const diamondCost = def[group]?.[nextLevel - 1] ?? null;
      if (!diamondCost || this.inventory.countItem('diamond') < diamondCost) {
        return { ok: false, reason: `Need ${diamondCost} diamonds for ${def.name}` };
      }
      this.inventory.takeItem('diamond', diamondCost);
      this.sendPacket({ t: 'game', data: { type: 'upgrade', key } });
      return { ok: true, bought: key, kind: 'upgrade', level: nextLevel, cost: { diamond: diamondCost } };
    }

    // 2. Check Traps
    if (BEDWARS_TRAPS[key]) {
      const queued = myTeamState.traps?.length ?? 0;
      if (queued >= 3) return { ok: false, reason: 'Trap queue full (max 3)' };
      const diamondCost = [1, 2, 4][queued];
      if (this.inventory.countItem('diamond') < diamondCost) {
        return { ok: false, reason: `Need ${diamondCost} diamonds for ${BEDWARS_TRAPS[key]}` };
      }
      this.inventory.takeItem('diamond', diamondCost);
      this.sendPacket({ t: 'game', data: { type: 'trap', trap: key } });
      return { ok: true, bought: key, kind: 'trap', cost: { diamond: diamondCost } };
    }

    // 3. Item Shop
    const entry = BEDWARS_ITEM_SHOP.find((e) => e.key === key.toLowerCase());
    if (!entry) {
      return { ok: false, reason: `Unknown Bed Wars shop key "${key}"` };
    }
    if (entry.notIn?.includes(mode)) return { ok: false, reason: 'Not sold in this mode' };

    const times = Math.max(1, Math.min(16, Number(count) || 1));
    let boughtTimes = 0;

    for (let t = 0; t < times; t++) {
      if (entry.kind === 'armor' && this.bedwarsKit.armor >= entry.tier) {
        return boughtTimes > 0 ? { ok: true, bought: entry.key, times: boughtTimes } : { ok: false, reason: 'Armor already owned' };
      }
      if (entry.kind === 'shears' && this.bedwarsKit.shears) {
        return boughtTimes > 0 ? { ok: true, bought: entry.key, times: boughtTimes } : { ok: false, reason: 'Shears already owned' };
      }
      if (entry.kind === 'tool' && (this.bedwarsKit[entry.tool] ?? 0) >= 4) {
        return boughtTimes > 0 ? { ok: true, bought: entry.key, times: boughtTimes } : { ok: false, reason: 'Tool already maxed' };
      }

      const price = entry.kind === 'tool'
        ? entry.tiers[this.bedwarsKit[entry.tool] ?? 0]?.[group]
        : entry.price?.[group];
      if (!price) return { ok: false, reason: 'Item not available' };

      for (const [res, amt] of Object.entries(price)) {
        if (this.inventory.countItem(BEDWARS_RESOURCE_ITEMS[res]) < amt) {
          return boughtTimes > 0
            ? { ok: true, bought: entry.key, times: boughtTimes, inventory: this.inventory.summary() }
            : { ok: false, reason: `Not enough ${res} (need ${amt})` };
        }
      }
      for (const [res, amt] of Object.entries(price)) {
        this.inventory.takeItem(BEDWARS_RESOURCE_ITEMS[res], amt);
      }

      const sharp = myTeamState.upgrades?.sharpness ? [{ id: 'sharpness', level: 1 }] : [];
      if (entry.kind === 'teamBlock') {
        this.inventory.addItem({ id: teamDef[entry.block], isBlock: true, count: entry.count });
      } else if (entry.kind === 'item') {
        this.inventory.addItem({
          ...entry.give,
          count: entry.count ?? 1,
          ...(entry.give.enchantments ? { enchantments: entry.give.enchantments.map((e) => ({ ...e })) } : {}),
        });
      } else if (entry.kind === 'sword') {
        for (const list of [this.inventory.hotbar, this.inventory.storage]) {
          for (let i = 0; i < list.length; i++) {
            if (list[i]?.id === 'wooden_sword') list[i] = null;
          }
        }
        this.inventory.addItem({
          id: BEDWARS_SWORDS[entry.tier],
          isBlock: false,
          count: 1,
          ...(sharp.length ? { enchantments: sharp } : {}),
        });
      } else if (entry.kind === 'armor') {
        this.bedwarsKit.armor = entry.tier;
        this.#applyBedWarsLoadout();
      } else if (entry.kind === 'shears') {
        this.bedwarsKit.shears = true;
        this.#applyBedWarsLoadout();
      } else if (entry.kind === 'tool') {
        this.bedwarsKit[entry.tool] = (this.bedwarsKit[entry.tool] ?? 0) + 1;
        this.#applyBedWarsLoadout();
      }
      boughtTimes++;
    }

    this.inventory.equipBest();
    this.broadcastState();
    return {
      ok: true,
      bought: entry.key,
      name: entry.name,
      times: boughtTimes,
      inventory: this.inventory.summary(),
    };
  }

  async collectResources(args = {}) {
    if (this.gameMode !== 'bedwars' || this.bedwarsState?.phase !== 'playing') {
      return { ok: false, reason: 'collect_resources is only available during an active Bed Wars match' };
    }
    const targetName = String(args.target || 'forge').toLowerCase();
    const goalPos = this.resolveTargetPosition({ target: targetName }) ?? this.resolveTargetPosition({ target: 'forge' });
    if (!goalPos) return { ok: false, reason: 'Could not locate generator' };

    await this.moveStepToward(goalPos.x, goalPos.y, goalPos.z, {
      bridge: Boolean(args.bridge ?? true),
      stopWithin: 0.6,
      durationMs: Math.max(2500, Number(args.duration_ms ?? 4000)),
    });

    // Trigger immediate collection for any generator within reach
    const collectedFrom = [];
    for (const gen of this.bedwarsState?.gens ?? []) {
      const pos = this.#bedWarsGenPosition(gen.id);
      if (pos && Math.hypot(this.position.x - pos.x, this.position.z - pos.z) <= 1.8 && Math.abs(this.position.y - pos.y) <= 2.5) {
        this.sendPacket({ t: 'game', data: { type: 'collect', gen: gen.id } });
        collectedFrom.push(gen.id);
      }
    }

    const waitMs = Math.min(5000, Math.max(60, Number(args.wait_ms ?? 150)));
    await new Promise((r) => setTimeout(r, waitMs));

    return {
      ok: true,
      generator: goalPos.label,
      collectedFrom,
      resources: {
        iron: this.inventory.countItem('iron_ingot'),
        gold: this.inventory.countItem('gold_ingot'),
        diamond: this.inventory.countItem('diamond'),
        emerald: this.inventory.countItem('emerald'),
      },
    };
  }

  async breakEnemyBed(args = {}) {
    if (this.gameMode !== 'bedwars' || this.bedwarsState?.phase !== 'playing') {
      return { ok: false, reason: 'break_bed is only available during an active Bed Wars match' };
    }
    const myTeam = this.me()?.team;
    const requestedTeam = String(args.team || args.target || '').toLowerCase().trim();
    const livingEnemyBeds = (this.bedwarsState?.teams ?? [])
      .filter((t) => t.id !== myTeam && t.bed && (!requestedTeam || t.id === requestedTeam))
      .map((t) => this.bedwarsArena?.bases?.find((b) => b.team === t.id))
      .filter(Boolean);

    if (!livingEnemyBeds.length) {
      return { ok: false, reason: requestedTeam ? `Team ${requestedTeam} has no active bed` : 'No enemy beds remaining' };
    }

    livingEnemyBeds.sort((a, b) =>
      Math.hypot(a.bed.foot[0] - this.position.x, a.bed.foot[2] - this.position.z) -
      Math.hypot(b.bed.foot[0] - this.position.x, b.bed.foot[2] - this.position.z)
    );
    const targetBase = livingEnemyBeds[0];
    const [bx, by, bz] = targetBase.bed.foot;

    while (this.inventory.countPlaceableBlocks() < 48 && this.inventory.countItem('iron_ingot') >= 4) {
      const bought = this.buyInBedWars('wool', 1);
      if (!bought.ok) break;
    }

    await this.moveStepToward(bx + 0.5, by, bz + 0.5, {
      bridge: Boolean(args.bridge ?? true),
      stopWithin: 2.2,
      durationMs: args.duration_ms ?? 35000,
    });

    const dist = Math.hypot(bx + 0.5 - this.position.x, bz + 0.5 - this.position.z);
    if (dist > 5.0) {
      return {
        ok: false,
        reason: `Moved toward ${targetBase.team} bed but still ${dist.toFixed(1)} blocks away (need more blocks or another step)`,
        position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))],
      };
    }

    // If a bed defense block covers the bed, mine it first
    const topId = this.getVoxel(bx, by + 1, bz);
    if (topId !== BLOCKS.AIR && !BED_BLOCK_IDS.has(topId)) {
      this.breakBlockAt(bx, by + 1, bz);
    }
    return this.breakBlockAt(bx, by, bz);
  }

  #findAliveEnemies(requested = '') {
    const clean = String(requested || '').toLowerCase().trim();
    const myTeam = this.gameMode === 'bedwars' ? this.me()?.team : null;
    const candidates = [...this.peers.values()].filter((p) => {
      if (p.id === this.clientId || p.dead) return false;
      if (this.gameMode === 'skywars') {
        const sp = this.skywarsState?.players?.find((q) => q.id === p.id);
        if (sp && !sp.alive) return false;
      }
      if (this.gameMode === 'bedwars') {
        const bp = this.bedwarsState?.players?.find((q) => q.id === p.id);
        if (bp && (!bp.alive || bp.dead || bp.team === myTeam)) return false;
      }
      if (clean) {
        return p.id.toLowerCase() === clean || (p.name && p.name.toLowerCase() === clean);
      }
      return true;
    });
    candidates.sort((a, b) =>
      Math.hypot((a.x ?? 0) - this.position.x, (a.z ?? 0) - this.position.z) -
      Math.hypot((b.x ?? 0) - this.position.x, (b.z ?? 0) - this.position.z)
    );
    return candidates;
  }

  #consumeHealingItem() {
    const now = Date.now();
    if (this.health >= 15 || now - this.lastHealAt < 2000) return false;
    const healOptions = [
      { id: 'enchanted_golden_apple', heal: 8 },
      { id: 'golden_apple', heal: 6 },
      { id: 'splash_potion_of_healing', heal: 6 },
      { id: 'potion_of_healing', heal: 6 },
      { id: 'splash_potion_of_regeneration', heal: 5 },
      { id: 'potion_of_regeneration', heal: 5 },
      { id: 'golden_carrot', heal: 4 },
      { id: 'cooked_beef', heal: 4 },
      { id: 'cooked_porkchop', heal: 4 },
      { id: 'bread', heal: 3 },
    ];
    for (const opt of healOptions) {
      if (this.inventory.takeItem(opt.id, 1)) {
        this.lastHealAt = now;
        this.health = Math.min(this.maxHealth, Number((this.health + opt.heal).toFixed(2)));
        this.lastActionSummary = `healed with ${opt.id}`;
        this.broadcastState({ swinging: true });
        return true;
      }
    }
    return false;
  }

  #fireProjectileAt(peer) {
    if (!this.profile.useProjectiles) return false;
    const now = Date.now();
    if (now - this.lastProjectileAt < this.profile.projectileCooldownMs) return false;
    const dx = (peer.x ?? 0) - this.position.x;
    const dy = (peer.y ?? 31) - this.position.y;
    const dz = (peer.z ?? 0) - this.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 4.5 || dist > 36) return false;

    const len = dist || 1;
    for (const throwable of ['snowball', 'egg']) {
      if (this.inventory.takeItem(throwable, 1)) {
        this.lastProjectileAt = now;
        this.lookAt(peer.x, (peer.y ?? 31) + 1.3, peer.z);
        this.sendPacket({
          t: 'shot',
          shot: {
            kind: throwable,
            x: this.position.x,
            y: this.position.y + 1.5,
            z: this.position.z,
            vx: (dx / len) * 24,
            vy: (dy / len) * 24 + 2,
            vz: (dz / len) * 24,
          },
        });
        this.sendPacket({
          t: 'attack',
          target: peer.id,
          damage: 0,
          projectile: throwable,
        });
        this.lastActionSummary = `threw ${throwable} at ${peer.name || peer.id}`;
        this.broadcastState({ swinging: true });
        return true;
      }
    }

    const bowStack = this.inventory.allSlots().find((s) => s && s.id === 'bow');
    if (bowStack && this.inventory.takeItem('arrow', 1)) {
      this.lastProjectileAt = now;
      this.lookAt(peer.x, (peer.y ?? 31) + 1.4, peer.z);
      const powerLevel = (bowStack.enchantments ?? []).find((e) => e.id === 'power')?.level ?? 0;
      const arrowDamage = 6 + powerLevel * 2;
      this.sendPacket({
        t: 'shot',
        shot: {
          kind: 'arrow',
          x: this.position.x,
          y: this.position.y + 1.5,
          z: this.position.z,
          vx: (dx / len) * 30,
          vy: (dy / len) * 30 + 1.5,
          vz: (dz / len) * 30,
        },
      });
      this.sendPacket({
        t: 'attack',
        target: peer.id,
        damage: arrowDamage,
        weapon: 'bow',
        projectile: 'arrow',
      });
      this.lastActionSummary = `shot arrow at ${peer.name || peer.id}`;
      this.broadcastState({ swinging: true });
      return true;
    }

    return false;
  }

  async #engageEnemy(peer) {
    if (!peer) return { ok: false, reason: 'No enemy target' };
    this.inventory.equipBest();
    if (this.health <= 12) {
      this.#consumeHealingItem();
    }

    const px = peer.x ?? 0;
    const py = peer.y ?? 31;
    const pz = peer.z ?? 0;
    const distBefore = Math.hypot(px - this.position.x, pz - this.position.z);

    // Ender pearl gap-closer when enemy is far across islands (hard difficulty)
    if (this.profile.usePearls && distBefore > 13 && this.inventory.countItem('ender_pearl') > 0 && this.isSolid(px, Math.floor(py) - 1, pz)) {
      if (this.inventory.takeItem('ender_pearl', 1)) {
        const dx = px - this.position.x, dy = py - this.position.y, dz = pz - this.position.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        this.sendPacket({
          t: 'shot',
          shot: {
            kind: 'ender_pearl',
            x: this.position.x,
            y: this.position.y + 1.5,
            z: this.position.z,
            vx: (dx / len) * 26,
            vy: (dy / len) * 26 + 3,
            vz: (dz / len) * 26,
          },
        });
        this.position = { x: px + 0.8, y: py, z: pz + 0.8 };
        this.lastActionSummary = `ender-pearled to ${peer.name || peer.id}`;
        this.broadcastState({ swinging: true });
      }
    }

    // Projectile opener / knockback denial at medium range
    if (this.profile.useProjectiles && distBefore >= 5.0 && distBefore <= 24) {
      this.#fireProjectileAt(peer);
    }

    // Close distance / bridge toward opponent at human speed
    const distAfterPearl = Math.hypot(px - this.position.x, pz - this.position.z);
    if (distAfterPearl > 3.2) {
      this.lastActionSummary = `moving toward ${peer.name || peer.id}`;
      await this.moveStepToward(px, py, pz, {
        bridge: this.gameMode !== 'base',
        stopWithin: 2.2,
        durationMs: this.profile.brainMoveDurationMs,
      });
    }

    const distNow = Math.hypot(px - this.position.x, py - this.position.y, pz - this.position.z);
    if (distNow > 5.8) {
      return { ok: false, reason: 'Closing distance to enemy', distance: Number(distNow.toFixed(2)) };
    }

    // Human-paced circle-strafe around target while avoiding void edges
    if (this.profile.strafe) {
      this.strafeAngle += 0.22 * this.strafeDir;
      const strafeRadius = 2.1;
      const targetSx = px + Math.cos(this.strafeAngle) * strafeRadius;
      const targetSz = pz + Math.sin(this.strafeAngle) * strafeRadius;
      const stepDx = targetSx - this.position.x;
      const stepDz = targetSz - this.position.z;
      const stepLen = Math.hypot(stepDx, stepDz) || 1;
      const maxStrafeStep = this.profile.walkSpeed * (this.profile.stepDelayMs / 1000);
      const sx = this.position.x + (stepDx / stepLen) * Math.min(stepLen, maxStrafeStep);
      const sz = this.position.z + (stepDz / stepLen) * Math.min(stepLen, maxStrafeStep);
      const floorY = Math.floor(this.position.y) - 1;
      if (this.isSolid(Math.floor(sx), floorY, Math.floor(sz)) && !this.isSolid(Math.floor(sx), Math.floor(this.position.y), Math.floor(sz))) {
        this.position.x = sx;
        this.position.z = sz;
      } else {
        this.strafeDir *= -1;
      }
    }

    this.lookAt(px, py + 1.2, pz);
    const now = Date.now();
    if (now - this.lastMeleeAt < this.profile.meleeCooldownMs) {
      this.broadcastState();
      return { ok: true, mode: 'cooldown', target: peer.name || peer.id };
    }
    this.lastMeleeAt = now;

    const held = this.inventory.getActiveItem();
    const weaponId = held && typeof held.id === 'string' ? held.id : null;
    let damage = (weaponId && WEAPON_DAMAGE[weaponId]) ? WEAPON_DAMAGE[weaponId] : 1;
    const sharp = (held?.enchantments ?? []).find((e) => e.id === 'sharpness');
    if (sharp) damage += 0.5 * sharp.level + 0.5;
    const kb = (held?.enchantments ?? []).find((e) => e.id === 'knockback')?.level ?? 0;
    const isCritical = Math.random() < this.profile.critChance;
    if (isCritical) damage = Number((damage * 1.25).toFixed(2));
    const damageMultiplier = this.difficulty === 'easy' ? 0.6 : (this.difficulty === 'normal' ? 0.8 : 1.0);
    damage = Math.max(1, Number((damage * damageMultiplier).toFixed(2)));

    this.isSprinting = this.profile.sprintAllowed;
    this.broadcastState({ swinging: true });
    this.sendPacket({
      t: 'attack',
      target: peer.id,
      damage,
      weapon: weaponId,
      isCritical,
      isSprint: this.profile.sprintAllowed,
      knockbackLevel: kb,
      fireAspect: 0,
    });
    this.isSprinting = false;
    this.lastActionSummary = `attacking ${peer.name || peer.id} with ${weaponId || 'fist'}`;
    return { ok: true, mode: 'melee', target: peer.name || peer.id, damage };
  }

  // --- Autonomous Competitive AI Brain ----------------------------------------------------------------------

  async #runBrainTick() {
    if (!this.connected || !this.autopilot || this.manualActionBusy || this.brainBusy) return;
    this.brainBusy = true;
    try {
      if (this.gameMode === 'skywars') {
        await this.#brainSkyWars();
      } else if (this.gameMode === 'bedwars') {
        await this.#brainBedWars();
      } else {
        await this.#brainBaseGame();
      }
    } catch {
      // Ignore transient brain tick errors.
    } finally {
      this.brainBusy = false;
    }
  }

  async #brainSkyWars() {
    if (!this.skywarsState || this.skywarsState.phase !== 'playing') return;
    const me = this.me();
    if (!me?.alive || this.isDead || this.gamemode !== 'survival') return;

    // 1. Emergency healing (scaled by difficulty so easy/normal are easier to defeat)
    const healThreshold = this.difficulty === 'hard' ? 12 : (this.difficulty === 'normal' ? 8 : 4);
    if (this.health <= healThreshold) {
      this.#consumeHealingItem();
    }

    const enemies = this.#findAliveEnemies();
    const nearestEnemy = enemies[0] ?? null;
    const nearestEnemyDist = nearestEnemy
      ? Math.hypot((nearestEnemy.x ?? 0) - this.position.x, (nearestEnemy.z ?? 0) - this.position.z)
      : Infinity;

    // 2. Immediate close-quarters self-defense if an enemy is right on our island
    if (nearestEnemy && nearestEnemyDist <= 7.5) {
      await this.#engageEnemy(nearestEnemy);
      return;
    }

    // 3. Phase 1: Spawn Island Looting at human speed
    const mySlot = me.slot;
    const mySpawn = (mySlot !== null && mySlot !== undefined && this.skywarsSpawns[mySlot])
      ? this.skywarsSpawns[mySlot]
      : this.spawnPoint;
    const spawnIslandChests = [...this.chests.values()].filter((c) => {
      const ck = `${c.x},${c.y},${c.z}`;
      if (this.lootedChestKeys.has(ck)) return false;
      if (c.slot !== null && c.slot !== undefined && mySlot !== null && mySlot !== undefined) {
        return c.slot === mySlot;
      }
      return Math.hypot(c.x + 0.5 - mySpawn.x, c.z + 0.5 - mySpawn.z) <= 10;
    });

    if (spawnIslandChests.length > 0 && this.strategy !== 'rusher') {
      spawnIslandChests.sort((a, b) =>
        Math.hypot(a.x + 0.5 - this.position.x, a.z + 0.5 - this.position.z) -
        Math.hypot(b.x + 0.5 - this.position.x, b.z + 0.5 - this.position.z)
      );
      const chest = spawnIslandChests[0];
      this.lastActionSummary = `looting spawn chest at [${chest.x}, ${chest.y}, ${chest.z}]`;
      await this.lootChest({
        position: [chest.x, chest.y, chest.z],
        bridge: false,
        duration_ms: this.profile.brainMoveDurationMs,
      });
      return;
    }

    // If rusher strategy, still grab at least 1 chest so we have blocks and a weapon
    const hasWeapon = this.inventory.allSlots().some((s) => s && WEAPON_DAMAGE[s.id]);
    const hasBlocks = this.inventory.countPlaceableBlocks() > 0;
    if ((!hasWeapon || !hasBlocks) && spawnIslandChests.length > 0) {
      const chest = spawnIslandChests[0];
      this.lastActionSummary = `looting starter chest at [${chest.x}, ${chest.y}, ${chest.z}]`;
      await this.lootChest({
        position: [chest.x, chest.y, chest.z],
        bridge: false,
        duration_ms: this.profile.brainMoveDurationMs,
      });
      return;
    }

    // 4. Phase 2: Mid-Island Rush & Center Chest Control (on Normal/Hard, or when no enemy is close)
    const centerChests = [...this.chests.values()].filter((c) => {
      const ck = `${c.x},${c.y},${c.z}`;
      if (this.lootedChestKeys.has(ck)) return false;
      if (c.kind === 'center' || c.kind === 'mid') return true;
      return Math.hypot(c.x, c.z) <= 14 && (c.items ?? []).some(Boolean);
    });

    if (centerChests.length > 0 && this.strategy !== 'rusher' && this.difficulty !== 'easy' && (!nearestEnemy || nearestEnemyDist > (this.difficulty === 'normal' ? 14 : 11))) {
      centerChests.sort((a, b) =>
        Math.hypot(a.x + 0.5 - this.position.x, a.z + 0.5 - this.position.z) -
        Math.hypot(b.x + 0.5 - this.position.x, b.z + 0.5 - this.position.z)
      );
      const targetChest = centerChests[0];
      this.lastActionSummary = `bridging to mid chest at [${targetChest.x}, ${targetChest.y}, ${targetChest.z}]`;
      await this.lootChest({
        position: [targetChest.x, targetChest.y, targetChest.z],
        bridge: true,
        duration_ms: this.profile.brainMoveDurationMs,
      });
      return;
    }

    // 5. Phase 3: Hunt & Clean-Up Remaining Enemies
    if (nearestEnemy) {
      await this.#engageEnemy(nearestEnemy);
      return;
    }

    // Hold center high ground if no enemies spotted yet
    if (Math.hypot(this.position.x - 0.5, this.position.z - 0.5) > 4) {
      this.lastActionSummary = 'controlling center island';
      await this.moveStepToward(0.5, 31, 0.5, {
        bridge: true,
        stopWithin: 2.0,
        durationMs: this.profile.brainMoveDurationMs,
      });
    }
  }

  async #brainBedWars() {
    if (!this.bedwarsState) return;
    const me = this.me();

    // 1. Auto-select a team in lobby if unassigned
    if (this.bedwarsState.phase === 'lobby' && !me?.team) {
      const counts = new Map();
      for (const t of this.bedwarsState.teams ?? []) counts.set(t.id, 0);
      for (const p of this.bedwarsState.players ?? []) {
        if (p.team && counts.has(p.team)) counts.set(p.team, counts.get(p.team) + 1);
      }
      let chosen = null;
      for (const [tid, c] of counts.entries()) {
        if (c === 0) { chosen = tid; break; }
      }
      if (!chosen) chosen = counts.keys().next().value || 'blue';
      this.chooseTeam(chosen);
      this.lastActionSummary = `joined ${chosen} team`;
      return;
    }

    if (this.bedwarsState.phase !== 'playing') return;
    if (!me?.alive || me.dead || this.isDead || this.waitingRespawn || this.gamemode !== 'survival') return;

    const myTeam = me.team;
    const myBase = this.bedwarsArena?.bases?.find((b) => b.team === myTeam);
    const myTeamState = this.bedwarsState.teams?.find((t) => t.id === myTeam);
    if (!myBase || !myTeamState) return;

    if (this.health <= 12) {
      this.#consumeHealingItem();
    }

    const enemies = this.#findAliveEnemies();

    // 2. Highest Priority: Base & Bed Siege Defense
    if (myTeamState.bed) {
      const bedX = myBase.bed.foot[0] + 0.5;
      const bedZ = myBase.bed.foot[2] + 0.5;
      const intruder = enemies.find((e) => Math.hypot((e.x ?? 0) - bedX, (e.z ?? 0) - bedZ) <= 20);
      if (intruder) {
        this.lastActionSummary = `intercepting ${intruder.name || intruder.id} near ${myTeam} bed`;
        await this.#engageEnemy(intruder);
        return;
      }
    }

    // 3. Smart Shop & Team Upgrade Progression
    const iron = this.inventory.countItem('iron_ingot');
    const gold = this.inventory.countItem('gold_ingot');
    const diamond = this.inventory.countItem('diamond');
    const emerald = this.inventory.countItem('emerald');
    const blocksCount = this.inventory.countPlaceableBlocks();
    const maxBedDef = this.profile.maxBedDefense;

    // Spend diamonds on Team Upgrades only on hard difficulty
    if (diamond > 0 && this.difficulty === 'hard') {
      for (const upg of ['sharpness', 'protection', 'forge', 'healPool', 'alarm']) {
        const res = this.buyInBedWars(upg, 1);
        if (res.ok) {
          this.lastActionSummary = `bought team upgrade ${upg}`;
          break;
        }
      }
    }

    // Spend emeralds on Diamond Armor / Diamond Sword / Ender Pearl (hard only)
    if (this.difficulty === 'hard') {
      if (emerald >= 6 && this.bedwarsKit.armor < 3) {
        this.buyInBedWars('diamond_armor', 1);
      } else if (emerald >= 4 && !this.inventory.allSlots().some((s) => s && s.id === 'diamond_sword')) {
        this.buyInBedWars('diamond_sword', 1);
      } else if (emerald >= 4 && this.profile.usePearls && this.inventory.countItem('ender_pearl') === 0) {
        this.buyInBedWars('pearl', 1);
      }
    }

    // Spend gold on Iron Armor / Iron Sword / Golden Apples / Oak Planks
    if (gold >= 12 && this.bedwarsKit.armor < 2 && this.difficulty === 'hard') {
      this.buyInBedWars('iron_armor', 1);
    } else if (gold >= 7 && !this.inventory.allSlots().some((s) => s && (s.id === 'iron_sword' || s.id === 'diamond_sword')) && this.difficulty !== 'easy') {
      this.buyInBedWars('iron_sword', 1);
    } else if (gold >= 3 && this.inventory.countItem('golden_apple') < 2 && this.difficulty === 'hard') {
      this.buyInBedWars('gapple', 1);
    } else if (gold >= 4 && this.bedDefenseCount < maxBedDef && this.strategy === 'defender') {
      this.buyInBedWars('wood', 1);
    }

    // Spend iron on Wool (keep >= 32 blocks), Stone Sword, Chain Armor, Pickaxe, Axe, End Stone
    if (iron >= 4 && blocksCount < 16) {
      this.buyInBedWars('wool', 1);
    } else if (iron >= 10 && this.inventory.allSlots().every((s) => !s || s.id === 'wooden_sword' || !WEAPON_DAMAGE[s.id])) {
      this.buyInBedWars('stone_sword', 1);
    } else if (iron >= 4 && blocksCount < 32) {
      this.buyInBedWars('wool', 1);
    } else if (iron >= 24 && this.bedwarsKit.armor < 1) {
      this.buyInBedWars('chain_armor', 1);
    } else if (iron >= 10 && this.bedwarsKit.pickaxe < 1) {
      this.buyInBedWars('pickaxe', 1);
    } else if (iron >= 10 && this.bedwarsKit.axe < 1) {
      this.buyInBedWars('axe', 1);
    } else if (iron >= 24 && this.bedDefenseCount < maxBedDef) {
      this.buyInBedWars('end_stone', 1);
    }

    // 4. Collect initial forge resources if we lack blocks to bridge/defend
    if (this.inventory.countPlaceableBlocks() < 8) {
      this.lastActionSummary = `collecting resources at ${myTeam} forge`;
      await this.moveStepToward(myBase.forge.x, myBase.forge.y, myBase.forge.z, {
        bridge: false,
        stopWithin: 0.6,
        durationMs: this.profile.brainMoveDurationMs,
      });
      this.sendPacket({ t: 'game', data: { type: 'collect', gen: `f-${myTeam}` } });
      return;
    }

    // 5. Place Bed Defense around our team bed (scaled by difficulty)
    if (myTeamState.bed && this.bedDefenseCount < maxBedDef && this.strategy !== 'rusher' && this.inventory.countPlaceableBlocks() >= 4) {
      const [fx, fy, fz] = myBase.bed.foot;
      const [hx, hy, hz] = myBase.bed.head;
      const defenseCells = [
        [fx, fy + 1, fz],
        [hx, hy + 1, hz],
        [fx + 1, fy, fz],
        [fx - 1, fy, fz],
      ].slice(0, maxBedDef);
      for (const [dx, dy, dz] of defenseCells) {
        if (this.getVoxel(dx, dy, dz) === BLOCKS.AIR) {
          const distToBed = Math.hypot(dx + 0.5 - this.position.x, dz + 0.5 - this.position.z);
          if (distToBed > 4.5) {
            await this.moveStepToward(dx + 0.5, dy, dz + 0.5, {
              bridge: false,
              stopWithin: 2.5,
              durationMs: this.profile.brainMoveDurationMs,
            });
          }
          const placed = this.placeBlockAt(dx, dy, dz);
          if (placed.ok) {
            this.bedDefenseCount++;
            this.lastActionSummary = `fortifying ${myTeam} bed defense (${this.bedDefenseCount}/${maxBedDef})`;
            return;
          }
        } else {
          this.bedDefenseCount++;
        }
      }
    }

    // 6. Opportunistic nearby Diamond / Emerald pickup
    for (const gen of this.bedwarsState.gens ?? []) {
      if (String(gen.id).startsWith('f-')) continue;
      const stock = (gen.stock?.diamond ?? 0) + (gen.stock?.emerald ?? 0);
      if (stock <= 0) continue;
      const pos = this.#bedWarsGenPosition(gen.id);
      if (pos && Math.hypot(pos.x - this.position.x, pos.z - this.position.z) <= 14) {
        this.lastActionSummary = `collecting ${gen.id} generator`;
        await this.moveStepToward(pos.x, pos.y, pos.z, {
          bridge: true,
          stopWithin: 0.8,
          durationMs: this.profile.brainMoveDurationMs,
        });
        this.sendPacket({ t: 'game', data: { type: 'collect', gen: gen.id } });
        return;
      }
    }

    // 7. Engage nearby enemy if within 7 blocks
    const closeEnemy = enemies[0] ?? null;
    if (closeEnemy && Math.hypot((closeEnemy.x ?? 0) - this.position.x, (closeEnemy.z ?? 0) - this.position.z) <= 7.0) {
      await this.#engageEnemy(closeEnemy);
      return;
    }

    // 8. Rush nearest living enemy bed
    const livingEnemyBases = (this.bedwarsState.teams ?? [])
      .filter((t) => t.id !== myTeam && t.bed)
      .map((t) => this.bedwarsArena?.bases?.find((b) => b.team === t.id))
      .filter(Boolean);

    if (livingEnemyBases.length > 0 && this.strategy !== 'defender') {
      livingEnemyBases.sort((a, b) =>
        Math.hypot(a.bed.foot[0] - this.position.x, a.bed.foot[2] - this.position.z) -
        Math.hypot(b.bed.foot[0] - this.position.x, b.bed.foot[2] - this.position.z)
      );
      const targetBase = livingEnemyBases[0];
      const [bx, by, bz] = targetBase.bed.foot;
      const distToBed = Math.hypot(bx + 0.5 - this.position.x, bz + 0.5 - this.position.z);
      if (distToBed > 4.2) {
        this.lastActionSummary = `bridging to destroy ${targetBase.team} bed`;
        await this.moveStepToward(bx + 0.5, by, bz + 0.5, {
          bridge: true,
          stopWithin: 2.2,
          durationMs: this.profile.brainMoveDurationMs,
        });
        return;
      }
      const topId = this.getVoxel(bx, by + 1, bz);
      if (topId !== BLOCKS.AIR && !BED_BLOCK_IDS.has(topId)) {
        this.breakBlockAt(bx, by + 1, bz);
      }
      this.lastActionSummary = `breaking ${targetBase.team} bed!`;
      this.breakBlockAt(bx, by, bz);
      return;
    }

    // 9. Hunt remaining enemies for final kills
    if (closeEnemy) {
      await this.#engageEnemy(closeEnemy);
    }
  }

  async #brainBaseGame() {
    if (this.isDead || this.gamemode === 'spectator') return;

    if (this.health <= 12) {
      this.#consumeHealingItem();
    }

    // 1. Self-defense or PvP strategy
    const provoked = this.lastAttackerId && (Date.now() - this.lastAttackedAt < 15_000);
    if (this.settings.pvp && (this.strategy === 'aggressive' || this.strategy === 'pvp' || provoked)) {
      const target = provoked
        ? (this.#findAliveEnemies(this.lastAttackerId)[0] ?? this.#findAliveEnemies()[0])
        : this.#findAliveEnemies()[0];
      if (target) {
        await this.#engageEnemy(target);
        return;
      }
    }

    // 2. Equip best gear or loot a nearby chest if unequipped
    const hasWeapon = this.inventory.allSlots().some((s) => s && WEAPON_DAMAGE[s.id]);
    if (!hasWeapon && this.companionMode !== 'stay') {
      const nearbyChest = [...this.chests.values()].find((c) => {
        const ck = `${c.x},${c.y},${c.z}`;
        return !this.lootedChestKeys.has(ck) && (c.items ?? []).some(Boolean) &&
          Math.hypot(c.x + 0.5 - this.position.x, c.z + 0.5 - this.position.z) <= 14;
      });
      if (nearbyChest) {
        this.lastActionSummary = `looting chest at [${nearbyChest.x}, ${nearbyChest.y}, ${nearbyChest.z}]`;
        await this.lootChest({
          position: [nearbyChest.x, nearbyChest.y, nearbyChest.z],
          bridge: false,
          duration_ms: this.profile.brainMoveDurationMs,
        });
        return;
      }
    }

    // 3. Co-op Companion Mode: follow or stay based on player instructions
    const companionPeer = this.peers.get(this.companionTargetId) ?? this.peers.get('host') ?? [...this.peers.values()][0];
    if (companionPeer && Number.isFinite(companionPeer.x) && Number.isFinite(companionPeer.z)) {
      const distToHost = Math.hypot(companionPeer.x - this.position.x, companionPeer.z - this.position.z);
      if (this.companionMode === 'stay') {
        if (distToHost <= 14) {
          this.lookAt(companionPeer.x, (companionPeer.y ?? this.position.y) + 1.5, companionPeer.z);
          this.broadcastState();
        }
        this.lastActionSummary = 'waiting here as requested';
        return;
      }

      if (this.companionMode === 'follow') {
        if (distToHost > 5.0 && distToHost < 96) {
          const flankAngle = (companionPeer.yaw ?? 0) + Math.PI * 0.75;
          const goalX = companionPeer.x + Math.sin(flankAngle) * 3.0;
          const goalZ = companionPeer.z + Math.cos(flankAngle) * 3.0;
          this.lastActionSummary = `following ${companionPeer.name || 'player'}`;
          await this.moveStepToward(goalX, companionPeer.y ?? this.position.y, goalZ, {
            bridge: false,
            stopWithin: 1.5,
            durationMs: this.profile.brainMoveDurationMs,
          });
        } else if (distToHost <= 5.0) {
          this.lookAt(companionPeer.x, (companionPeer.y ?? this.position.y) + 1.5, companionPeer.z);
          this.broadcastState();
          this.lastActionSummary = `accompanying ${companionPeer.name || 'player'}`;
        }
      }
    }
  }

  // --- Talking with the player (T chat) ---------------------------------------------------------------------
  //
  // Nothing here reads meaning into the player's words. Each message goes to an AI: an MCP client waiting in
  // wait_for_guest_chat (or the guest-agent bridge), or the session's model brain. The AI answers in chat and, when the
  // player asked for an action, writes Mineflayer code that runCode() executes.

  get bot() {
    if (!this._bot) this._bot = new MineflayerBot(this);
    return this._bot;
  }

  /** Run AI-written Mineflayer code on this guest. See MINEFLAYER_API_REFERENCE. */
  runCode(code, options = {}) {
    return runSessionCode(this, code, options);
  }

  /** Wait for the next player chat message (null on timeout). Marks an external AI as listening. */
  waitForChat(timeoutMs = 50_000) {
    this.externalListenerAt = Date.now();
    if (this.chatQueue.length) return Promise.resolve(this.chatQueue.shift());
    return new Promise((resolve) => {
      const waiter = (entry) => { clearTimeout(timer); resolve(entry); };
      const timer = setTimeout(() => {
        this.chatWaiters = this.chatWaiters.filter((w) => w !== waiter);
        this.externalListenerAt = Date.now();
        resolve(null);
      }, Math.max(100, timeoutMs));
      timer.unref?.();
      this.chatWaiters.push(waiter);
    });
  }

  async handlePlayerChat(sender, text, peerId = 'host') {
    const message = String(text ?? '').trim();
    if (!message) return { ok: false, reason: 'Empty message' };
    const entry = { id: ++this.chatSeq, sender: sender || 'Player', peerId, message, time: Date.now() };
    const speaker = this.peers.get(peerId);
    if (speaker && Number.isFinite(speaker.x) && Number.isFinite(speaker.z) && !this.chatTaskBusy) {
      this.lookAt(speaker.x, (speaker.y ?? this.position.y) + 1.5, speaker.z);
      this.broadcastState();
    }

    const waiter = this.chatWaiters.shift();
    if (waiter) { waiter(entry); return { ok: true, routedTo: 'external', entry }; }
    // An external AI polls between messages; keep the message for its next wait.
    const externalRecently = Date.now() - this.externalListenerAt < 5 * 60_000;
    if (externalRecently || !this.brain) {
      this.chatQueue.push(entry);
      if (this.chatQueue.length > 50) this.chatQueue.shift();
      if (!externalRecently && !this.brain && !this.noBrainNoticeSent) {
        this.noBrainNoticeSent = true;
        this.sendChat('I can read chat, but no AI model is connected to me yet, so I cannot answer or act on it.');
      }
      return { ok: true, routedTo: 'queue', entry };
    }
    return this.#thinkAndAct(entry);
  }

  async #thinkAndAct(entry) {
    let feedback = null;
    let last = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      let decision;
      try {
        decision = await this.brain({
          sender: entry.sender,
          message: entry.message,
          world: describeForModel(this, { sender: entry.sender }),
          recentChat: this.chatLog.slice(-12).map((c) => `${c.sender}: ${c.text}`),
          feedback,
        });
      } catch (err) {
        this.sendChat(`Sorry, my AI model did not answer (${String(err?.message || err).slice(0, 120)}).`);
        return { ok: false, error: String(err?.message || err) };
      }
      if (decision?.reply) this.sendChat(decision.reply);
      if (!decision?.code) return { ok: true, reply: decision?.reply ?? '', code: null };
      console.log('[AGENT_CODE_EXEC]\n' + decision.code);
      last = await this.runCode(decision.code, { sender: entry.sender, message: entry.message });
      if (!last.ok) console.log('[AGENT_CODE_ERROR]', last.error);
      if (last.ok || last.cancelled) return { ok: last.ok, reply: decision.reply, code: decision.code, run: last };
      feedback = { code: decision.code, error: last.error, logs: last.logs };
    }
    const errText = String(last?.error || '');
    const cleanErr = errText.replace(/^[A-Za-z]+Error:\s*/, '').trim();
    if (/missing ingredients|need \d+.*have \d+/i.test(errText)) {
      const match = errText.match(/Missing ingredients for ([a-z0-9_]+): need (\d+) ([a-z0-9_]+)/i);
      if (match) {
        const item = match[1].replace(/_/g, ' ');
        const ing = match[3].replace(/_/g, ' ');
        this.sendChat(`I looked around for materials to craft the ${item}, but I couldn't find enough ${ing} nearby. Could you help me find some, or what should we do next?`);
      } else {
        this.sendChat(`I looked around for the needed ingredients, but couldn't find enough nearby. Could you help me find the materials, or what should we do next?`);
      }
    } else if (/cannot reach block|no block|cannot be dug/i.test(errText)) {
      this.sendChat(`I couldn't reach that block from here. Where should we go next?`);
    } else if (/no path|stuck/i.test(errText)) {
      this.sendChat(`I got stuck trying to navigate there. Could you lead the way or tell me where to go?`);
    } else {
      this.sendChat(`I ran into an issue (${cleanErr.slice(0, 120)}). What should I do next?`);
    }
    return { ok: false, run: last };
  }


  async attackTarget(args = {}) {
    const requested = String(args.target || '').toLowerCase().trim();
    const peer = this.#findAliveEnemies(requested)[0] ?? null;
    if (!peer) {
      return { ok: false, reason: requested ? `Target player "${args.target}" not found or not attackable` : 'No attackable enemy players found' };
    }

    this.inventory.equipBest();
    const distBefore = Math.hypot(peer.x - this.position.x, peer.z - this.position.z);
    if (distBefore > 3.5) {
      await this.moveStepToward(peer.x, peer.y, peer.z, {
        bridge: Boolean(args.bridge ?? (this.gameMode !== 'base')),
        stopWithin: 2.5,
        durationMs: args.duration_ms ?? 3000,
      });
    }

    const distNow = Math.hypot(peer.x - this.position.x, peer.y - this.position.y, peer.z - this.position.z);
    const held = this.inventory.getActiveItem();
    const hasBow = this.inventory.allSlots().some((s) => s && s.id === 'bow');
    const hasArrow = this.inventory.countItem('arrow') > 0;

    if (distNow > 5.8 && hasBow && hasArrow && distNow <= 60) {
      this.inventory.takeItem('arrow', 1);
      this.lookAt(peer.x, peer.y + 1.4, peer.z);
      const dx = peer.x - this.position.x, dy = peer.y - this.position.y, dz = peer.z - this.position.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      this.sendPacket({
        t: 'shot',
        shot: { kind: 'arrow', x: this.position.x, y: this.position.y + 1.5, z: this.position.z, vx: (dx / len) * 30, vy: (dy / len) * 30, vz: (dz / len) * 30 },
      });
      this.sendPacket({
        t: 'attack',
        target: peer.id,
        damage: 6,
        weapon: 'bow',
        projectile: 'arrow',
      });
      this.broadcastState({ swinging: true });
      return { ok: true, mode: 'ranged', target: peer.name, targetId: peer.id, damage: 6, distance: Number(distNow.toFixed(2)) };
    }

    if (distNow > 5.8) {
      return {
        ok: false,
        reason: `Target ${peer.name} is ${distNow.toFixed(1)} blocks away (melee reach is 5.8)`,
        position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))],
      };
    }

    this.lookAt(peer.x, peer.y + 1.2, peer.z);
    const weaponId = held && typeof held.id === 'string' ? held.id : null;
    let damage = (weaponId && WEAPON_DAMAGE[weaponId]) ? WEAPON_DAMAGE[weaponId] : 1;
    const sharp = (held?.enchantments ?? []).find((e) => e.id === 'sharpness');
    if (sharp) damage += 0.5 * sharp.level + 0.5;
    const kb = (held?.enchantments ?? []).find((e) => e.id === 'knockback')?.level ?? 0;

    const swings = Math.max(1, Math.min(10, Number(args.count ?? 1)));
    this.broadcastState({ swinging: true });
    for (let i = 0; i < swings; i++) {
      this.sendPacket({
        t: 'attack',
        target: peer.id,
        damage,
        weapon: weaponId,
        isCritical: false,
        isSprint: true,
        knockbackLevel: kb,
        fireAspect: 0,
      });
      if (i + 1 < swings) {
        await new Promise((r) => setTimeout(r, this.profile.meleeCooldownMs));
      }
    }

    return {
      ok: true,
      mode: 'melee',
      target: peer.name,
      targetId: peer.id,
      weapon: weaponId || 'fist',
      damage,
      swings,
      distance: Number(distNow.toFixed(2)),
    };
  }

  async act(args = {}, hooks = {}) {
    const action = String(args.action || '').trim().toLowerCase();
    if (args.difficulty) {
      this.setDifficulty(args.difficulty, { locked: true });
    }
    if (action === 'set_difficulty' || action === 'difficulty') {
      const updated = this.setDifficulty(args.difficulty ?? args.target ?? 'normal', { locked: true });
      return {
        ok: true,
        difficulty: updated,
        profile: { ...this.profile },
      };
    }
    if (action === 'autopilot') {
      if (typeof args.enabled === 'boolean') this.autopilot = args.enabled;
      else if (typeof args.autopilot === 'boolean') this.autopilot = args.autopilot;
      else this.autopilot = true;
      if (args.strategy) this.strategy = String(args.strategy).toLowerCase();
      if (this.autopilot) void this.#runBrainTick();
      return {
        ok: true,
        autopilot: this.autopilot,
        strategy: this.strategy,
        difficulty: this.difficulty,
        lastAction: this.lastActionSummary,
      };
    }

    this.manualActionBusy = true;
    try {
      switch (action) {
        case 'chat': {
          const text = String(args.message ?? args.target ?? '').trim().slice(0, 240);
          if (!text) return { ok: false, reason: 'Empty chat message' };
          this.sendChat(text);
          return { ok: true, sent: text };
        }
        case 'respond_chat':
        case 'handle_chat': {
          return this.handlePlayerChat(args.sender ?? 'Player', args.message ?? args.target ?? '', args.peerId ?? 'host');
        }
        case 'run_code':
        case 'execute_code': {
          const code = String(args.code ?? args.script ?? args.message ?? '').trim();
          if (!code) return { ok: false, reason: 'Empty code' };
          return this.runCode(code, { sender: args.sender ?? null, message: args.message ?? '' });
        }
        case 'look': {
          if (Array.isArray(args.position) && args.position.length === 3) {
            this.lookAt(args.position[0], args.position[1], args.position[2]);
          } else if (args.target) {
            const targetPos = this.resolveTargetPosition(args);
            if (targetPos) this.lookAt(targetPos.x, targetPos.y, targetPos.z);
          } else {
            if (Number.isFinite(args.yaw)) this.yaw = args.yaw;
            if (Number.isFinite(args.pitch)) this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, args.pitch));
          }
          this.broadcastState();
          return { ok: true, yaw: Number(this.yaw.toFixed(3)), pitch: Number(this.pitch.toFixed(3)) };
        }
        case 'jump': {
          this.position.y += 1;
          this.broadcastState();
          setTimeout(() => {
            if (!this.isSolid(this.position.x, this.position.y - 1, this.position.z)) {
              this.position.y = Math.max(0, this.position.y - 1);
              this.broadcastState();
            }
          }, 250).unref?.();
          return { ok: true, position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))] };
        }
        case 'move': {
          const dist = Math.max(0.25, Math.min(32, Number(args.distance ?? 1)));
          const dir = String(args.direction || 'forward').toLowerCase();
          let dx = 0, dz = 0;
          if (dir === 'north') { dz = -dist; }
          else if (dir === 'south') { dz = dist; }
          else if (dir === 'east') { dx = dist; }
          else if (dir === 'west') { dx = -dist; }
          else {
            const fX = -Math.sin(this.yaw), fZ = -Math.cos(this.yaw);
            const rX = Math.cos(this.yaw), rZ = -Math.sin(this.yaw);
            if (dir === 'forward') { dx = fX * dist; dz = fZ * dist; }
            else if (dir === 'back') { dx = -fX * dist; dz = -fZ * dist; }
            else if (dir === 'left') { dx = -rX * dist; dz = -rZ * dist; }
            else if (dir === 'right') { dx = rX * dist; dz = rZ * dist; }
          }
          return this.moveStepToward(this.position.x + dx, this.position.y, this.position.z + dz, {
            bridge: Boolean(args.bridge ?? false),
            stopWithin: 0.2,
            durationMs: args.duration_ms ?? 3000,
          });
        }
        case 'goto':
        case 'pathfind': {
          const goal = this.resolveTargetPosition(args);
          if (!goal) return { ok: false, reason: 'Specify position [x,y,z] or a known target' };
          return this.moveStepToward(goal.x, goal.y, goal.z, {
            bridge: Boolean(args.bridge ?? (this.gameMode !== 'base')),
            stopWithin: 1.0,
            durationMs: args.duration_ms ?? 10000,
          });
        }
        case 'bridge_to': {
          const goal = this.resolveTargetPosition(args) ?? { x: 0.5, y: 31, z: 0.5, label: 'center' };
          return this.moveStepToward(goal.x, goal.y, goal.z, {
            bridge: true,
            stopWithin: 1.2,
            durationMs: args.duration_ms ?? 12000,
          });
        }
        case 'loot_chest': {
          return this.lootChest(args);
        }
        case 'place_block': {
          const pos = Array.isArray(args.position) && args.position.length === 3
            ? args.position
            : [Math.floor(this.position.x), Math.floor(this.position.y) - 1, Math.floor(this.position.z)];
          return this.placeBlockAt(pos[0], pos[1], pos[2], args.block ?? args.item ?? null);
        }
        case 'break_block':
        case 'mine_block': {
          if (!Array.isArray(args.position) || args.position.length !== 3) {
            return { ok: false, reason: 'break_block requires position [x, y, z]' };
          }
          const [bx, by, bz] = args.position;
          if (Math.hypot(bx + 0.5 - this.position.x, bz + 0.5 - this.position.z) > 4.5) {
            await this.moveStepToward(bx + 0.5, by, bz + 0.5, {
              bridge: Boolean(args.bridge ?? false),
              stopWithin: 2.5,
              durationMs: args.duration_ms ?? 4000,
            });
          }
          return this.breakBlockAt(bx, by, bz);
        }
        case 'break_bed': {
          return this.breakEnemyBed(args);
        }
        case 'collect_resources': {
          return this.collectResources(args);
        }
        case 'buy': {
          return this.buyInBedWars(args.item ?? args.target, args.count ?? 1);
        }
        case 'choose_team': {
          return this.chooseTeam(args.team ?? args.target);
        }
        case 'equip':
        case 'select': {
          if (args.item) {
            const wanted = String(args.item).toLowerCase();
            const idx = this.inventory.hotbar.findIndex((s) => s && String(s.id).toLowerCase() === wanted);
            if (idx >= 0) this.inventory.activeSlot = idx;
            else this.inventory.equipBest();
          } else {
            this.inventory.equipBest();
          }
          this.broadcastState();
          return { ok: true, inventory: this.inventory.summary() };
        }
        case 'attack': {
          return this.attackTarget(args);
        }
        case 'start_match': {
          if (typeof hooks.onStartMatch === 'function') {
            const hostResult = await hooks.onStartMatch(this);
            if (hostResult) return hostResult;
          }
          return {
            ok: true,
            note: 'Agent is ready in the lobby. The host can click Start Match in the lobby UI.',
            phase: this.skywarsState?.phase ?? this.bedwarsState?.phase ?? 'lobby',
          };
        }
        case 'respawn': {
          this.isDead = false;
          this.health = 20;
          this.position = { ...this.spawnPoint };
          this.broadcastState();
          return { ok: true, position: [this.position.x, this.position.y, this.position.z] };
        }
        case 'wait': {
          const ms = Math.max(20, Math.min(10_000, Number(args.duration_ms ?? 500)));
          await new Promise((r) => setTimeout(r, ms));
          return { ok: true, waitedMs: ms, status: this.status() };
        }
        case 'stop': {
          this.currentGoal = null;
          this.companionMode = 'stay';
          if (typeof args.autopilot === 'boolean') this.autopilot = args.autopilot;
          this.isSprinting = false;
          this.isSneaking = false;
          this.isSwinging = false;
          this.broadcastState();
          return { ok: true, stopped: true, autopilot: this.autopilot, companionMode: this.companionMode };
        }
        default:
          return { ok: false, reason: `Unknown guest action: ${action}` };
      }
    } finally {
      this.manualActionBusy = false;
    }
  }

  status({ radius = 32 } = {}) {
    const r = Math.max(4, Math.min(128, Number(radius) || 32));
    const nearbyChests = [...this.chests.values()]
      .map((c) => ({
        position: [c.x, c.y, c.z],
        distance: Number(Math.hypot(c.x + 0.5 - this.position.x, c.z + 0.5 - this.position.z).toFixed(1)),
        itemCount: (c.items ?? []).filter(Boolean).length,
      }))
      .filter((c) => c.distance <= r)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 12);

    const players = [...this.peers.values()].map((p) => {
      const dist = Number(Math.hypot((p.x ?? 0) - this.position.x, (p.z ?? 0) - this.position.z).toFixed(1));
      const sw = this.skywarsState?.players?.find((q) => q.id === p.id);
      const bw = this.bedwarsState?.players?.find((q) => q.id === p.id);
      return {
        id: p.id,
        name: p.name,
        isHost: Boolean(p.isHost),
        position: [Number((p.x ?? 0).toFixed(2)), Number((p.y ?? 0).toFixed(2)), Number((p.z ?? 0).toFixed(2))],
        distance: dist,
        heldItem: p.activeItem ?? null,
        dead: Boolean(p.dead || (sw && !sw.alive) || (bw && (!bw.alive || bw.dead))),
        ...(sw ? { slot: sw.slot, alive: sw.alive, kills: sw.kills } : {}),
        ...(bw ? { team: bw.team, alive: bw.alive, kills: bw.kills, finalKills: bw.finalKills, beds: bw.beds } : {}),
      };
    });

    const out = {
      connected: this.connected,
      roomId: this.roomId,
      roomCode: this.roomId,
      clientId: this.clientId,
      name: this.name,
      gameMode: this.gameMode,
      mod: this.gameMode === 'base' ? this.mechanism : this.gameMode,
      gamemode: this.gamemode,
      difficulty: this.difficulty,
      autopilot: this.autopilot,
      strategy: this.strategy,
      companionMode: this.companionMode,
      lastAction: this.lastActionSummary,
      lastChatReply: this.lastChatReply,
      pvp: this.settings.pvp,
      position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))],
      yaw: Number(this.yaw.toFixed(2)),
      pitch: Number(this.pitch.toFixed(2)),
      health: this.health,
      isDead: this.isDead,
      inventory: this.inventory.summary(),
      players,
      nearbyChests,
      sharedDrops: [...this.sharedDrops.values()].slice(0, 12),
      recentChat: this.chatLog.slice(-10),
    };

    if (this.gameMode === 'skywars' && this.skywarsState) {
      const me = this.me();
      out.skywars = {
        phase: this.skywarsState.phase,
        round: this.skywarsState.round,
        mode: this.skywarsState.mode,
        difficulty: this.skywarsState.difficulty ?? this.difficulty,
        map: this.skywarsState.map,
        countdown: this.skywarsState.countdown,
        elapsed: this.skywarsState.elapsed,
        nextRefill: this.skywarsState.nextRefill,
        winner: this.skywarsState.winner,
        me: me ?? null,
        mySlot: me?.slot ?? null,
        alive: me?.alive ?? false,
        kills: me?.kills ?? 0,
      };
    }

    if (this.gameMode === 'bedwars' && this.bedwarsState) {
      const me = this.me();
      const myBase = this.bedwarsArena?.bases?.find((b) => b.team === me?.team);
      out.bedwars = {
        phase: this.bedwarsState.phase,
        round: this.bedwarsState.round,
        mode: this.bedwarsState.mode,
        pace: this.bedwarsState.pace,
        difficulty: this.bedwarsState.difficulty ?? this.difficulty,
        map: this.bedwarsState.map,
        countdown: this.bedwarsState.countdown,
        elapsed: this.bedwarsState.elapsed,
        nextEvent: this.bedwarsState.next,
        winner: this.bedwarsState.winner,
        myTeam: me?.team ?? null,
        alive: me?.alive ?? false,
        waitingRespawn: this.waitingRespawn,
        kit: { ...this.bedwarsKit },
        resources: {
          iron: this.inventory.countItem('iron_ingot'),
          gold: this.inventory.countItem('gold_ingot'),
          diamond: this.inventory.countItem('diamond'),
          emerald: this.inventory.countItem('emerald'),
        },
        myBase: myBase ? {
          spawn: [myBase.spawn.x, myBase.spawn.y, myBase.spawn.z],
          forge: [myBase.forge.x, myBase.forge.y, myBase.forge.z],
          shop: [myBase.shop.x, myBase.shop.y, myBase.shop.z],
          bed: myBase.bed.foot,
        } : null,
        teams: (this.bedwarsState.teams ?? []).map((t) => {
          const base = this.bedwarsArena?.bases?.find((b) => b.team === t.id);
          return {
            ...t,
            bedPosition: base ? base.bed.foot : null,
          };
        }),
        generators: (this.bedwarsState.gens ?? []).map((g) => {
          const pos = this.#bedWarsGenPosition(g.id);
          return {
            ...g,
            position: pos ? [pos.x, pos.y, pos.z] : null,
          };
        }),
      };
    }

    return out;
  }
}

// --- Mineflayer-compatible bot API ------------------------------------------------------------------------------
//
// The agent is not driven by patterns matched against the player's words. When the player talks to it (T chat), an AI
// model decides what to do: answer in chat only, or write JavaScript against this Mineflayer-style API (the same shape
// as the real mineflayer + mineflayer-pathfinder packages) which runSessionCode() executes on the joined guest.
// Every action runs at human speed through the session's movement, digging and placing rules.

export class Vec3 {
  constructor(x = 0, y = 0, z = 0) {
    if (typeof x === 'object' && x !== null) { z = x.z; y = x.y; x = x.x; }
    this.x = Number(x) || 0; this.y = Number(y) || 0; this.z = Number(z) || 0;
  }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  offset(dx, dy, dz) { return new Vec3(this.x + dx, this.y + dy, this.z + dz); }
  plus(v) { return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  minus(v) { return new Vec3(this.x - v.x, this.y - v.y, this.z - v.z); }
  subtract(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scaled(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  floored() { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); this.z = Math.floor(this.z); return this; }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distanceSquared(v) { return (this.x - v.x) ** 2 + (this.y - v.y) ** 2 + (this.z - v.z) ** 2; }
  xzDistanceTo(v) { return Math.hypot(this.x - v.x, this.z - v.z); }
  equals(v) { return !!v && this.x === v.x && this.y === v.y && this.z === v.z; }
  norm() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const n = this.norm() || 1; return new Vec3(this.x / n, this.y / n, this.z / n); }
  toArray() { return [this.x, this.y, this.z]; }
  toString() { return `(${this.x}, ${this.y}, ${this.z})`; }
}

const vec = (p) => (p instanceof Vec3 ? p : new Vec3(p));

/** mineflayer-pathfinder goals. target() is where to walk; isEnd(pos) says the goal is met. */
class Goal {
  isEnd(pos) { const t = this.target(); return Math.hypot(pos.x - t.x, pos.z - t.z) <= Math.max(0.6, t.range) && Math.abs(pos.y - t.y) <= Math.max(1.5, t.range); }
}
class GoalBlock extends Goal {
  constructor(x, y, z) { super(); this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z); }
  target() { return { x: this.x + 0.5, y: this.y, z: this.z + 0.5, range: 0.5 }; }
}
class GoalNear extends Goal {
  constructor(x, y, z, range = 1) { super(); this.x = Math.floor(x); this.y = Math.floor(y); this.z = Math.floor(z); this.range = Number(range) || 1; }
  target() { return { x: this.x + 0.5, y: this.y, z: this.z + 0.5, range: this.range }; }
}
class GoalGetToBlock extends GoalNear { constructor(x, y, z) { super(x, y, z, 1.6); } }
class GoalLookAtBlock extends GoalNear { constructor(pos, _world, { reach = 4 } = {}) { const p = vec(pos); super(p.x, p.y, p.z, Math.min(4, reach)); } }
class GoalPlaceBlock extends GoalNear { constructor(pos, _world, { range = 4 } = {}) { const p = vec(pos); super(p.x, p.y, p.z, Math.min(4, range)); } }
class GoalXZ extends Goal {
  constructor(x, z) { super(); this.x = Math.floor(x); this.z = Math.floor(z); }
  target(bot) { return { x: this.x + 0.5, y: bot?.entity?.position?.y ?? 0, z: this.z + 0.5, range: 0.6 }; }
  isEnd(pos) { return Math.hypot(pos.x - (this.x + 0.5), pos.z - (this.z + 0.5)) <= 0.8; }
}
class GoalNearXZ extends GoalXZ {
  constructor(x, z, range = 1) { super(x, z); this.range = Number(range) || 1; }
  target(bot) { return { ...super.target(bot), range: this.range }; }
  isEnd(pos) { return Math.hypot(pos.x - (this.x + 0.5), pos.z - (this.z + 0.5)) <= this.range + 0.3; }
}
class GoalY extends Goal {
  constructor(y) { super(); this.y = Math.floor(y); }
  target(bot) { const p = bot?.entity?.position ?? { x: 0, z: 0 }; return { x: p.x, y: this.y, z: p.z, range: 0.5 }; }
  isEnd(pos) { return Math.floor(pos.y) === this.y; }
}
class GoalFollow extends Goal {
  constructor(entity, range = 2) { super(); this.entity = entity; this.range = Number(range) || 2; }
  target() { const p = this.entity?.position ?? { x: 0, y: 0, z: 0 }; return { x: p.x, y: p.y, z: p.z, range: this.range }; }
  isEnd(pos) { const t = this.target(); return Math.hypot(pos.x - t.x, pos.z - t.z) <= this.range + 0.3; }
}
class GoalInvert extends Goal {
  constructor(goal) { super(); this.goal = goal; }
  target(bot) {
    const t = this.goal.target(bot); const p = bot.entity.position;
    const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz) || 1;
    return { x: p.x + (dx / d) * 8, y: p.y, z: p.z + (dz / d) * 8, range: 1 };
  }
  isEnd(pos) { return !this.goal.isEnd(pos); }
}
class GoalCompositeAny extends Goal {
  constructor(goals = []) { super(); this.goals = goals; }
  target(bot) { const p = bot.entity.position; return [...this.goals].map((g) => g.target(bot)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; }
  isEnd(pos) { return this.goals.some((g) => g.isEnd(pos)); }
}
class GoalCompositeAll extends Goal {
  constructor(goals = []) { super(); this.goals = goals; }
  target(bot) { return this.goals.find((g) => !g.isEnd(bot.entity.position))?.target(bot) ?? this.goals[0].target(bot); }
  isEnd(pos) { return this.goals.every((g) => g.isEnd(pos)); }
}

export const goals = Object.freeze({
  Goal, GoalBlock, GoalNear, GoalGetToBlock, GoalLookAtBlock, GoalPlaceBlock, GoalXZ, GoalNearXZ, GoalY, GoalFollow,
  GoalInvert, GoalCompositeAny, GoalCompositeAll,
});

/** mineflayer-pathfinder Movements: accepted for compatibility; the session's own walking rules apply. */
export class Movements {
  constructor(bot) { this.bot = bot; this.canDig = true; this.allow1by1towers = true; this.allowParkour = false; this.allowSprinting = true; this.scafoldingBlocks = []; }
}

// Items the facade knows besides blocks. Names follow vanilla Java item ids.
const TOOL_TIERS = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite'];
const ARMOR_TIERS = ['leather', 'chainmail', 'iron', 'golden', 'diamond', 'netherite'];
const ITEM_NAMES = [
  ...TOOL_TIERS.flatMap((t) => ['sword', 'pickaxe', 'axe', 'shovel', 'hoe'].map((k) => `${t}_${k}`)),
  ...ARMOR_TIERS.flatMap((t) => ['helmet', 'chestplate', 'leggings', 'boots'].map((k) => `${t}_${k}`)),
  'stick', 'coal', 'charcoal', 'iron_ingot', 'gold_ingot', 'diamond', 'emerald', 'netherite_ingot', 'raw_iron', 'raw_gold',
  'string', 'feather', 'flint', 'leather', 'wheat', 'bread', 'apple', 'golden_apple', 'cooked_beef', 'beef', 'porkchop',
  'cooked_porkchop', 'cooked_chicken', 'chicken', 'cooked_mutton', 'carrot', 'potato', 'baked_potato', 'bow', 'arrow',
  'shield', 'shears', 'bucket', 'water_bucket', 'lava_bucket', 'milk_bucket', 'flint_and_steel', 'ender_pearl', 'snowball',
  'egg', 'fire_charge', 'redstone', 'lapis_lazuli', 'bone', 'gunpowder', 'oak_sapling', 'wheat_seeds',
];
const ITEM_ID_BASE = 100000;
const ITEM_ID_BY_NAME = new Map(ITEM_NAMES.map((n, i) => [n, ITEM_ID_BASE + i]));

const FOOD = Object.freeze({
  apple: 4, bread: 5, cooked_beef: 8, beef: 3, cooked_porkchop: 8, porkchop: 3, cooked_chicken: 6, chicken: 2,
  cooked_mutton: 6, carrot: 3, potato: 1, baked_potato: 5, golden_apple: 4,
});

const LOG_TO_PLANKS = Object.freeze({
  oak_log: 'oak_planks', birch_log: 'birch_planks', spruce_log: 'spruce_planks', jungle_log: 'jungle_planks',
  acacia_log: 'acacia_planks', dark_oak_log: 'dark_oak_planks', cherry_log: 'cherry_planks', mangrove_log: 'oak_planks',
});
const PLANKS = ['oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'cherry_planks'];
const LOGS = Object.keys(LOG_TO_PLANKS);
const INGREDIENT_TAGS = Object.freeze({ planks: PLANKS, logs: LOGS, coals: ['coal', 'charcoal'], stone_crafting_materials: ['cobblestone'] });

function buildRecipeBook() {
  const book = [];
  const add = (result, count, ingredients, requiresTable) => book.push({ result, count, ingredients, requiresTable });
  for (const [log, planks] of Object.entries(LOG_TO_PLANKS)) add(planks, 4, { [log]: 1 }, false);
  add('stick', 4, { planks: 2 }, false);
  add('crafting_table', 1, { planks: 4 }, false);
  add('torch', 4, { coals: 1, stick: 1 }, false);
  add('chest', 1, { planks: 8 }, true);
  add('furnace', 1, { cobblestone: 8 }, true);
  add('ladder', 3, { stick: 7 }, true);
  add('bow', 1, { stick: 3, string: 3 }, true);
  add('shield', 1, { planks: 6, iron_ingot: 1 }, true);
  add('bread', 1, { wheat: 3 }, true);
  add('bucket', 1, { iron_ingot: 3 }, true);
  add('shears', 1, { iron_ingot: 2 }, false);
  add('flint_and_steel', 1, { iron_ingot: 1, flint: 1 }, false);
  add('stone_bricks', 4, { stone: 4 }, false);
  const material = { wooden: 'planks', stone: 'cobblestone', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
  for (const [tier, mat] of Object.entries(material)) {
    add(`${tier}_pickaxe`, 1, { [mat]: 3, stick: 2 }, true);
    add(`${tier}_axe`, 1, { [mat]: 3, stick: 2 }, true);
    add(`${tier}_shovel`, 1, { [mat]: 1, stick: 2 }, true);
    add(`${tier}_hoe`, 1, { [mat]: 2, stick: 2 }, true);
    add(`${tier}_sword`, 1, { [mat]: 2, stick: 1 }, true);
  }
  const armorMat = { leather: 'leather', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
  for (const [tier, mat] of Object.entries(armorMat)) {
    add(`${tier}_helmet`, 1, { [mat]: 5 }, true);
    add(`${tier}_chestplate`, 1, { [mat]: 8 }, true);
    add(`${tier}_leggings`, 1, { [mat]: 7 }, true);
    add(`${tier}_boots`, 1, { [mat]: 4 }, true);
  }
  return book;
}
const RECIPE_BOOK = buildRecipeBook();

const SMELT_RECIPES = Object.freeze({
  raw_iron: 'iron_ingot',
  iron_ore: 'iron_ingot',
  raw_gold: 'gold_ingot',
  gold_ore: 'gold_ingot',
  raw_copper: 'copper_ingot',
  copper_ore: 'copper_ingot',
  cobblestone: 'stone',
  clay_ball: 'brick',
  sand: 'glass',
  beef: 'cooked_beef',
  porkchop: 'cooked_porkchop',
  chicken: 'cooked_chicken',
  mutton: 'cooked_mutton',
});

const FUELS = ['coal', 'charcoal', 'oak_planks', 'birch_planks', 'spruce_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks', 'cherry_planks', 'oak_log', 'birch_log', 'spruce_log', 'stick'];

// Seconds to break a block by hand, and the tool that speeds it up (vanilla hardness).
const BLOCK_HARDNESS = Object.freeze({
  grass_block: [0.6, 'shovel'], dirt: [0.5, 'shovel'], sand: [0.5, 'shovel'], gravel: [0.6, 'shovel'], clay: [0.6, 'shovel'],
  snow: [0.2, 'shovel'], stone: [1.5, 'pickaxe', true], cobblestone: [2, 'pickaxe', true], sandstone: [0.8, 'pickaxe', true],
  stone_bricks: [1.5, 'pickaxe', true], bricks: [2, 'pickaxe', true], coal_ore: [3, 'pickaxe', true], iron_ore: [3, 'pickaxe', true],
  gold_ore: [3, 'pickaxe', true], diamond_ore: [3, 'pickaxe', true], obsidian: [50, 'pickaxe', true], furnace: [3.5, 'pickaxe', true],
  end_stone: [3, 'pickaxe', true], glass: [0.3, null], ice: [0.5, 'pickaxe'], packed_ice: [0.5, 'pickaxe'],
  crafting_table: [2.5, 'axe'], chest: [2.5, 'axe'], ladder: [0.4, 'axe'], torch: [0, null], oak_leaves: [0.2, 'hoe'],
});
const TOOL_SPEED = { wooden: 2, stone: 4, iron: 6, diamond: 8, netherite: 9, golden: 12 };

class CancelledError extends Error {
  constructor() { super('Cancelled: a newer instruction replaced this one.'); this.name = 'CancelledError'; this.cancelled = true; }
}

/**
 * A Mineflayer-shaped bot over a GuestPeerSession. Properties read the session live; actions take human time and
 * check `gen` so a newer instruction (or bot.stopAll()) cancels whatever older code is still awaiting.
 */
export class MineflayerBot extends EventEmitter {
  constructor(session) {
    super();
    this.setMaxListeners(100);
    this._session = session;
    this.gen = 0;
    this._userListeners = [];
    this._timers = new Set();
    this.version = '1.21';
    this.controlState = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false };
    this._controlTimer = null;
    this.registry = buildRegistry();
    this.pathfinder = new Pathfinder(this);
    this.inventory = new InventoryView(this);
    this.food = 20;
    this.foodSaturation = 5;
  }

  get username() { return this._session.name; }
  get health() { return this._session.health; }
  get game() { return { gameMode: this._session.gamemode, dimension: 'overworld', difficulty: this._session.difficulty, mode: this._session.gameMode }; }
  get time() { const t = this._session.worldTime ?? 6000; return { timeOfDay: ((t % 24000) + 24000) % 24000, isDay: (t % 24000) < 12541 }; }
  get quickBarSlot() { return this._session.inventory.activeSlot; }
  get heldItem() { return this.inventory._itemFor(this._session.inventory.getActiveItem(), 36 + this._session.inventory.activeSlot); }
  get entity() {
    const s = this._session;
    return {
      id: s.clientId, type: 'player', name: 'player', username: s.name,
      position: new Vec3(s.position.x, s.position.y, s.position.z),
      velocity: new Vec3(0, 0, 0), yaw: s.yaw, pitch: s.pitch, height: 1.62, onGround: true,
    };
  }
  get players() {
    const out = {};
    const me = this.entity;
    out[me.username] = { username: me.username, entity: me };
    for (const peer of this._session.peers.values()) {
      const entity = peerEntity(peer);
      out[entity.username] = { username: entity.username, uuid: peer.id, entity };
    }
    return out;
  }
  get entities() {
    const out = { [this._session.clientId ?? 'self']: this.entity };
    for (const peer of this._session.peers.values()) out[peer.id] = peerEntity(peer);
    return out;
  }

  // Listeners the AI's code adds are remembered so the next instruction can drop them.
  on(event, fn) { this._userListeners.push([event, fn]); return super.on(event, fn); }
  addListener(event, fn) { return this.on(event, fn); }
  once(event, fn) { this._userListeners.push([event, fn]); return super.once(event, fn); }

  /** Stop everything older code started: awaits, paths, held controls, listeners and timers. */
  stopAll() {
    this.gen++;
    this.pathfinder._halt();
    this.clearControlStates();
    for (const [event, fn] of this._userListeners.splice(0)) super.removeListener(event, fn);
    for (const t of this._timers) { clearTimeout(t); clearInterval(t); }
    this._timers.clear();
  }

  _check(gen) { if (gen !== this.gen || !this._session.connected) throw new CancelledError(); }
  async _sleep(ms, gen = this.gen) {
    let left = Math.max(0, Number(ms) || 0);
    while (left > 0) { const step = Math.min(left, 100); await new Promise((r) => setTimeout(r, step)); left -= step; this._check(gen); }
  }
  waitForTicks(ticks = 1) { return this._sleep(Math.max(1, ticks) * 50); }

  chat(message) { this._session.sendChat(String(message ?? '')); }
  whisper(_username, message) { this.chat(message); }

  async lookAt(point) { const p = vec(point); this._session.lookAt(p.x, p.y, p.z); this._session.broadcastState(); await this._sleep(80); }
  async look(yaw, pitch) {
    this._session.yaw = Number(yaw) || 0;
    this._session.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(pitch) || 0));
    this._session.broadcastState();
    await this._sleep(80);
  }

  blockAt(point) {
    const p = vec(point).floored();
    const id = this._session.getVoxel(p.x, p.y, p.z);
    return makeBlock(this._session, id, p);
  }

  findBlocks({ matching, maxDistance = 16, count = 1, point = null } = {}) {
    const test = matcher(matching, this.registry);
    const origin = point ? vec(point).floored() : this.entity.position.floored();
    const r = Math.max(1, Math.min(32, Math.floor(maxDistance)));
    const found = [];
    for (let y = Math.max(0, origin.y - r); y <= Math.min(63, origin.y + r); y++) {
      for (let x = origin.x - r; x <= origin.x + r; x++) {
        for (let z = origin.z - r; z <= origin.z + r; z++) {
          const id = this._session.getVoxel(x, y, z);
          if (id === 0 && !test.wantsAir) continue;
          const d = Math.hypot(x - origin.x, y - origin.y, z - origin.z);
          if (d > r) continue;
          if (test.fn(id, () => makeBlock(this._session, id, new Vec3(x, y, z)))) found.push({ d, p: new Vec3(x, y, z) });
        }
      }
    }
    found.sort((a, b) => a.d - b.d);
    return found.slice(0, Math.max(1, count)).map((f) => f.p);
  }
  findBlock(options = {}) { const [p] = this.findBlocks({ ...options, count: 1 }); return p ? this.blockAt(p) : null; }

  nearestEntity(filter = () => true) {
    const me = this.entity.position;
    return Object.values(this.entities)
      .filter((e) => e.id !== this._session.clientId && filter(e))
      .sort((a, b) => a.position.distanceTo(me) - b.position.distanceTo(me))[0] ?? null;
  }

  canDigBlock(block) { return !!block && block.diggable && this.entity.position.offset(0, 1.62, 0).distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 4.5; }
  digTime(block) { return digSeconds(block?.name, this._session.inventory.getActiveItem()) * 1000; }

  async dig(block, _forceLook = true) {
    const gen = this.gen;
    if (!block?.position) throw new Error('dig needs a block (use bot.blockAt or bot.findBlock)');
    const p = block.position;
    if (this._session.getVoxel(p.x, p.y, p.z) === 0) throw new Error(`No block to dig at ${p}`);
    if (!this.canDigBlock(this.blockAt(p))) {
      const dy = Math.abs(p.y - this.entity.position.y);
      if (dy > 1.2) {
        await this.pathfinder.goto(new GoalNearXZ(p.x, p.z, 2.0));
      } else {
        await this.pathfinder.goto(new GoalNear(p.x, p.y, p.z, 2.5));
      }
    }
    this._check(gen);
    const current = this.blockAt(p);
    if (current.type === 0) return;
    if (!this.canDigBlock(current)) {
      throw new Error(`Cannot reach block ${current.name} at ${p.x},${p.y},${p.z} to dig`);
    }
    if (!current.diggable) throw new Error(`${current.name} cannot be dug`);
    this._session.lookAt(p.x + 0.5, p.y + 0.5, p.z + 0.5);
    const ms = this.digTime(current);
    const started = Date.now();
    this._digging = true;
    try {
      while (Date.now() - started < ms) {
        this._session.broadcastState({ swinging: true });
        await this._sleep(Math.min(250, ms - (Date.now() - started)), gen);
      }
    } finally { this._digging = false; }
    this._check(gen);
    const harvest = canHarvest(current.name, this._session.inventory.getActiveItem());
    const res = this._session.breakBlockAt(p.x, p.y, p.z, { harvest });
    if (!res.ok) throw new Error(res.reason || `Could not dig ${current.name}`);
    this.emit('diggingCompleted', current);
  }
  stopDigging() { this.gen++; }

  async placeBlock(referenceBlock, faceVector) {
    const gen = this.gen;
    if (!referenceBlock?.position) throw new Error('placeBlock needs a reference block');
    const target = referenceBlock.position.plus(vec(faceVector ?? new Vec3(0, 1, 0)));
    const held = this._session.inventory.getActiveItem();
    const blockId = held ? (typeof held.id === 'number' ? held.id : BLOCK_BY_NAME.get(String(held.id))) : null;
    if (!Number.isInteger(blockId) || blockId <= 0) throw new Error('Hold a block first: await bot.equip(item, "hand")');
    if (!this._session.isSolid(referenceBlock.position.x, referenceBlock.position.y, referenceBlock.position.z)) {
      throw new Error(`Reference block at ${referenceBlock.position} is not solid`);
    }
    if (this._session.isSolid(target.x, target.y, target.z)) throw new Error(`Block already at ${target}`);
    const eye = this.entity.position.offset(0, 1.62, 0);
    if (eye.distanceTo(target.offset(0.5, 0.5, 0.5)) > 4.5) await this.pathfinder.goto(new GoalNear(target.x, target.y, target.z, 3));
    this._check(gen);
    const me = this.entity.position.floored();
    if (me.x === target.x && me.z === target.z && (target.y === me.y || target.y === me.y + 1)) {
      throw new Error(`Cannot place a block inside yourself at ${target}; move first`);
    }
    await this._sleep(220, gen);
    const res = this._session.placeBlockAt(target.x, target.y, target.z, blockId);
    if (!res.ok) throw new Error(res.reason || 'Place failed');
  }

  async activateBlock(block) { if (block?.position) await this.lookAt(block.position.offset(0.5, 0.5, 0.5)); }
  async activateItem() { await this.consume().catch(() => {}); }
  deactivateItem() {}

  async equip(item, destination = 'hand') {
    const gen = this.gen;
    const inv = this._session.inventory;
    const stackRef = this.inventory._locate(item);
    if (!stackRef) throw new Error(`No ${typeof item === 'object' ? item?.name : item} in inventory`);
    const dest = String(destination || 'hand');
    const armorKey = { head: 'head', torso: 'chest', legs: 'legs', feet: 'feet' }[dest];
    if (armorKey) {
      const stack = stackRef.list[stackRef.index];
      const prev = inv.armor[armorKey];
      inv.armor[armorKey] = { ...stack, count: 1 };
      if (stack.count > 1) stack.count -= 1; else stackRef.list[stackRef.index] = prev ? { ...prev } : null;
    } else if (dest === 'off-hand') {
      const stack = stackRef.list[stackRef.index];
      const prev = inv.offhand;
      inv.offhand = { ...stack };
      stackRef.list[stackRef.index] = prev;
    } else if (stackRef.list === inv.hotbar) {
      inv.activeSlot = stackRef.index;
    } else {
      let slot = inv.hotbar.findIndex((s) => !s);
      if (slot < 0) slot = inv.activeSlot;
      const prev = inv.hotbar[slot];
      inv.hotbar[slot] = stackRef.list[stackRef.index];
      stackRef.list[stackRef.index] = prev;
      inv.activeSlot = slot;
    }
    this._session.broadcastState();
    await this._sleep(120, gen);
  }
  async unequip(destination = 'hand') {
    const inv = this._session.inventory;
    const armorKey = { head: 'head', torso: 'chest', legs: 'legs', feet: 'feet' }[destination];
    if (armorKey && inv.armor[armorKey]) { inv.addItem(inv.armor[armorKey]); inv.armor[armorKey] = null; }
    else if (destination === 'off-hand' && inv.offhand) { inv.addItem(inv.offhand); inv.offhand = null; }
    else if (destination === 'hand') { const empty = inv.hotbar.findIndex((s) => !s); if (empty >= 0) inv.activeSlot = empty; }
    this._session.broadcastState();
    await this._sleep(100);
  }
  setQuickBarSlot(slot) { this._session.inventory.activeSlot = Math.max(0, Math.min(8, Math.floor(slot))); this._session.broadcastState(); }

  /** Drop items on the ground in front of the bot; another player standing there picks them up. */
  async toss(itemType, _metadata = null, count = null) {
    const gen = this.gen;
    const name = this.registry.nameOf(itemType);
    if (!name) throw new Error(`Unknown item ${itemType}`);
    const have = this.inventory.count(name);
    const n = count === null || count === undefined ? have : Math.min(have, Math.max(1, Math.floor(count)));
    if (have <= 0 || n <= 0) throw new Error(`No ${name} to toss`);
    await this._sleep(150, gen);
    const stacks = this.inventory._take(name, n);
    this._dropStacks(stacks);
  }
  async tossStack(item) {
    const gen = this.gen;
    const ref = this.inventory._locate(item);
    if (!ref) throw new Error('That item is not in the inventory');
    await this._sleep(150, gen);
    const stack = ref.list[ref.index];
    ref.list[ref.index] = null;
    this._dropStacks([{ ...stack }]);
  }
  _dropStacks(stacks) {
    const s = this._session;
    const x = s.position.x - Math.sin(s.yaw) * 1.4;
    const z = s.position.z - Math.cos(s.yaw) * 1.4;
    s.lastGiftDropAt = Date.now();
    s.sendPacket({ t: 'death_drops', x, y: s.position.y + 0.5, z, items: stacks.map((st) => ({ id: st.id, count: st.count, isBlock: Boolean(st.isBlock), ...(st.enchantments ? { enchantments: st.enchantments } : {}) })) });
    s.broadcastState({ swinging: true });
  }

  recipesAll(itemType, _metadata = null, craftingTable = null) {
    const name = this.registry.nameOf(itemType);
    if (!name) return [];
    return RECIPE_BOOK.filter((r) => {
      if (r.result !== name) return false;
      if (!r.requiresTable) return true;
      if (craftingTable !== null && craftingTable !== false) return true;
      return this._nearbyCraftingTable() !== null ||
        this.inventory.count('crafting_table') > 0 ||
        this._canSatisfyIngredient('planks', 4);
    }).map((r) => this._recipeView(r));
  }
  recipesFor(itemType, metadata = null, minResultCount = 1, craftingTable = null) {
    return this.recipesAll(itemType, metadata, craftingTable).filter((view) => {
      const times = Math.max(1, Math.ceil((minResultCount ?? 1) / view.result.count));
      return Object.entries(view._recipe.ingredients).every(([ing, n]) => this._canSatisfyIngredient(ing, n * times));
    });
  }
  _recipeView(r) {
    const id = this.registry.idOf(r.result);
    return {
      _recipe: r, requiresTable: r.requiresTable,
      result: { id, name: r.result, count: r.count },
      delta: [
        ...Object.entries(r.ingredients).map(([ing, n]) => ({ id: this.registry.idOf(INGREDIENT_TAGS[ing]?.[0] ?? ing), name: ing, count: -n })),
        { id, name: r.result, count: r.count },
      ],
      ingredients: Object.entries(r.ingredients).map(([ing, n]) => ({ name: ing, count: n })),
    };
  }
  _countIngredient(ing) { return (INGREDIENT_TAGS[ing] ?? [ing]).reduce((sum, n) => sum + this.inventory.count(n), 0); }
  _canSatisfyIngredient(ing, needed) {
    if (this._countIngredient(ing) >= needed) return true;
    if (ing === 'planks') {
      const logs = this._countIngredient('logs');
      return (this._countIngredient('planks') + logs * 4) >= needed;
    }
    if (ing === 'stick') {
      const directSticks = this._countIngredient('stick');
      const totalPlanks = this._countIngredient('planks') + this._countIngredient('logs') * 4;
      return (directSticks + Math.floor(totalPlanks / 2) * 4) >= needed;
    }
    if (ing === 'iron_ingot') {
      const rawIron = this.inventory.count('raw_iron') + this.inventory.count('iron_ore');
      return (this.inventory.count('iron_ingot') + rawIron) >= needed;
    }
    return false;
  }

  _nearbyCraftingTable() {
    return this.findBlock({ matching: this.registry.blocksByName.crafting_table.id, maxDistance: 16 });
  }

  _nearbyFurnace() {
    return this.findBlock({ matching: this.registry.blocksByName.furnace.id, maxDistance: 16 });
  }

  _hasPickaxe() {
    return this.inventory.items().some((it) => /pickaxe$/.test(it.name));
  }

  _hasStonePickaxeOrBetter() {
    return this.inventory.items().some((it) => /^(stone|iron|diamond|netherite)_pickaxe$/.test(it.name));
  }

  _hasIronPickaxeOrBetter() {
    return this.inventory.items().some((it) => /^(iron|diamond|netherite)_pickaxe$/.test(it.name));
  }

  async _autoEquipBestTool(blockName, gen) {
    const held = this._session.inventory.getActiveItem();
    const heldName = held ? this.registry.nameOf(held.id) : null;
    const info = BLOCK_HARDNESS[blockName];
    const preferredKind = info ? info[1] : (/_log$|_planks$/.test(blockName) ? 'axe' : (/dirt|grass|sand|gravel/.test(blockName) ? 'shovel' : null));
    if (!preferredKind) return;
    const tiers = ['netherite', 'diamond', 'iron', 'stone', 'golden', 'wooden'];
    for (const tier of tiers) {
      const toolName = `${tier}_${preferredKind}`;
      if (heldName === toolName) return;
      if (this.inventory.count(toolName) > 0) {
        await this.equip(toolName, 'hand');
        return;
      }
    }
  }

  async _autoGatherLogs(count, gen) {
    let gathered = 0;
    let attempts = 0;
    const triedPositions = new Set();
    while (gathered < count && attempts++ < count * 8) {
      this._check(gen);
      const me = this.entity.position;
      const logPositions = this.findBlocks({
        matching: (b) => /_log$/.test(b.name),
        maxDistance: 48,
        count: 50,
      }).filter((p) => {
        if (triedPositions.has(`${p.x},${p.y},${p.z}`)) return false;
        return p.y >= me.y - 1.5 && p.y <= me.y + 4.2;
      });

      if (!logPositions.length) {
        // Fallback: look for placed planks nearby if no logs are accessible
        const plankPositions = this.findBlocks({
          matching: (b) => /_planks$/.test(b.name),
          maxDistance: 32,
          count: 20,
        }).filter((p) => !triedPositions.has(`${p.x},${p.y},${p.z}`) && p.y >= me.y - 1 && p.y <= me.y + 3.5);
        if (!plankPositions.length) break;
        plankPositions.sort((a, b) => this.entity.position.distanceTo(a) - this.entity.position.distanceTo(b));
        const targetPos = plankPositions[0];
        triedPositions.add(`${targetPos.x},${targetPos.y},${targetPos.z}`);
        const block = this.blockAt(targetPos);
        if (block && block.type !== 0) {
          try {
            await this._autoEquipBestTool(block.name, gen);
            await this.dig(block);
            gathered++;
          } catch {}
        }
        continue;
      }

      // Sort logs: lowest Y first so we harvest trunk from bottom to top, then closest horizontally
      logPositions.sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) >= 1) return yDiff;
        const distA = Math.hypot(a.x - me.x, a.z - me.z);
        const distB = Math.hypot(b.x - me.x, b.z - me.z);
        return distA - distB;
      });

      const targetPos = logPositions[0];
      triedPositions.add(`${targetPos.x},${targetPos.y},${targetPos.z}`);
      const block = this.blockAt(targetPos);
      if (!block || block.type === 0) continue;
      try {
        await this._autoEquipBestTool(block.name, gen);
        await this.dig(block);
        gathered++;
      } catch (err) {}
    }
    return gathered;
  }

  async _autoGatherStone(count, gen) {
    if (!this._hasPickaxe()) {
      await this.craft('wooden_pickaxe', 1);
    }
    let gathered = 0;
    let attempts = 0;
    const triedPositions = new Set();
    while (gathered < count && attempts++ < count * 8) {
      this._check(gen);
      const me = this.entity.position;
      const stonePositions = this.findBlocks({
        matching: (b) => b.name === 'stone' || b.name === 'cobblestone',
        maxDistance: 48,
        count: 40,
      }).filter((p) => {
        const floored = me.floored();
        if (p.x === floored.x && p.z === floored.z && p.y <= floored.y) return false;
        if (triedPositions.has(`${p.x},${p.y},${p.z}`)) return false;
        return p.y >= me.y - 2.5 && p.y <= me.y + 3.5;
      });
      if (!stonePositions.length) break;
      stonePositions.sort((a, b) => this.entity.position.distanceTo(a) - this.entity.position.distanceTo(b));
      const targetPos = stonePositions[0];
      triedPositions.add(`${targetPos.x},${targetPos.y},${targetPos.z}`);
      const block = this.blockAt(targetPos);
      if (!block || block.type === 0) continue;
      try {
        await this._autoEquipBestTool(block.name, gen);
        await this.dig(block);
        gathered++;
      } catch (err) {}
    }
    return gathered;
  }

  async _autoGatherIron(count, gen) {
    if (!this._hasStonePickaxeOrBetter()) {
      await this.craft('stone_pickaxe', 1);
    }
    let gathered = 0;
    let attempts = 0;
    const triedPositions = new Set();
    while (gathered < count && attempts++ < count * 8) {
      this._check(gen);
      const me = this.entity.position;
      const ironPositions = this.findBlocks({
        matching: (b) => b.name === 'iron_ore',
        maxDistance: 48,
        count: 30,
      }).filter((p) => !triedPositions.has(`${p.x},${p.y},${p.z}`) && p.y >= me.y - 3 && p.y <= me.y + 4);
      if (!ironPositions.length) break;
      ironPositions.sort((a, b) => this.entity.position.distanceTo(a) - this.entity.position.distanceTo(b));
      const targetPos = ironPositions[0];
      triedPositions.add(`${targetPos.x},${targetPos.y},${targetPos.z}`);
      const block = this.blockAt(targetPos);
      if (!block || block.type === 0) continue;
      try {
        await this._autoEquipBestTool(block.name, gen);
        await this.dig(block);
        gathered++;
      } catch (err) {}
    }
    return gathered;
  }

  async _autoGatherCoal(count, gen) {
    if (!this._hasPickaxe()) {
      await this.craft('wooden_pickaxe', 1);
    }
    let gathered = 0;
    let attempts = 0;
    const triedPositions = new Set();
    while (gathered < count && attempts++ < count * 8) {
      this._check(gen);
      const me = this.entity.position;
      const coalPositions = this.findBlocks({
        matching: (b) => b.name === 'coal_ore',
        maxDistance: 48,
        count: 30,
      }).filter((p) => !triedPositions.has(`${p.x},${p.y},${p.z}`) && p.y >= me.y - 3 && p.y <= me.y + 4);
      if (!coalPositions.length) break;
      coalPositions.sort((a, b) => this.entity.position.distanceTo(a) - this.entity.position.distanceTo(b));
      const targetPos = coalPositions[0];
      triedPositions.add(`${targetPos.x},${targetPos.y},${targetPos.z}`);
      const block = this.blockAt(targetPos);
      if (!block || block.type === 0) continue;
      try {
        await this._autoEquipBestTool(block.name, gen);
        await this.dig(block);
        gathered++;
      } catch (err) {}
    }
    return gathered;
  }

  async gather(resourceName, count = 1) {
    const gen = this.gen;
    const name = String(resourceName ?? '').toLowerCase().trim();
    const times = Math.max(1, Math.floor(count) || 1);
    if (name.includes('log') || name.includes('wood')) {
      return this._autoGatherLogs(times, gen);
    }
    if (name.includes('stone') || name.includes('cobble')) {
      return this._autoGatherStone(times, gen);
    }
    if (name.includes('coal')) {
      return this._autoGatherCoal(times, gen);
    }
    if (name.includes('iron')) {
      return this._autoGatherIron(times, gen);
    }
    const targetBlockId = this.registry.idOf(name);
    let gathered = 0;
    while (gathered < times) {
      this._check(gen);
      const pos = this.findBlock({ matching: targetBlockId, maxDistance: 32 });
      if (!pos) break;
      await this.dig(pos);
      gathered++;
    }
    return gathered;
  }

  async _autoCraftPlanks(minPlanks, gen) {
    let planksCrafted = 0;
    for (const logName of LOGS) {
      while (this.inventory.count(logName) > 0 && this._countIngredient('planks') < minPlanks) {
        this._check(gen);
        this.inventory._take(logName, 1);
        const plankResult = LOG_TO_PLANKS[logName] || 'oak_planks';
        const blockId = BLOCK_BY_NAME.get(plankResult);
        this._session.inventory.addItem(blockId !== undefined ? { id: blockId, isBlock: true, count: 4 } : { id: plankResult, isBlock: false, count: 4 });
        planksCrafted += 4;
        await this._sleep(150, gen);
      }
      if (this._countIngredient('planks') >= minPlanks) return;
    }

    const stillNeed = minPlanks - this._countIngredient('planks');
    if (stillNeed > 0) {
      const logsToGather = Math.ceil(stillNeed / 4);
      await this._autoGatherLogs(logsToGather, gen);
      for (const logName of LOGS) {
        while (this.inventory.count(logName) > 0 && this._countIngredient('planks') < minPlanks) {
          this._check(gen);
          this.inventory._take(logName, 1);
          const plankResult = LOG_TO_PLANKS[logName] || 'oak_planks';
          const blockId = BLOCK_BY_NAME.get(plankResult);
          this._session.inventory.addItem(blockId !== undefined ? { id: blockId, isBlock: true, count: 4 } : { id: plankResult, isBlock: false, count: 4 });
          planksCrafted += 4;
          await this._sleep(150, gen);
        }
        if (this._countIngredient('planks') >= minPlanks) break;
      }
    }
  }

  async _placeBlockTypeNearby(blockNameOrId, gen) {
    this._check(gen);
    const pos = this.entity.position.floored();
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];
    for (const [dx, dz] of offsets) {
      const groundPos = pos.offset(dx, -1, dz);
      const airPos = pos.offset(dx, 0, dz);
      if (this._session.isSolid(groundPos.x, groundPos.y, groundPos.z) &&
          !this._session.isSolid(airPos.x, airPos.y, airPos.z)) {
        await this.equip(blockNameOrId, 'hand');
        await this.placeBlock(this.blockAt(groundPos), new Vec3(0, 1, 0));
        return true;
      }
    }
    for (const [dx, dz] of offsets) {
      const groundPos = pos.offset(dx, 0, dz);
      const airPos = pos.offset(dx, 1, dz);
      if (this._session.isSolid(groundPos.x, groundPos.y, groundPos.z) &&
          !this._session.isSolid(airPos.x, airPos.y, airPos.z)) {
        await this.equip(blockNameOrId, 'hand');
        await this.placeBlock(this.blockAt(groundPos), new Vec3(0, 1, 0));
        return true;
      }
    }
    return false;
  }

  _placeCraftingTableNearby(gen) {
    return this._placeBlockTypeNearby('crafting_table', gen);
  }

  _placeFurnaceNearby(gen) {
    return this._placeBlockTypeNearby('furnace', gen);
  }

  async _executeCraft(r, times, gen) {
    await this._sleep(300, gen);
    for (let i = 0; i < times; i++) {
      this._check(gen);
      for (const [ing, n] of Object.entries(r.ingredients)) {
        let left = n;
        for (const name of INGREDIENT_TAGS[ing] ?? [ing]) {
          const take = Math.min(left, this.inventory.count(name));
          if (take > 0) { this.inventory._take(name, take); left -= take; }
          if (!left) break;
        }
      }
      const blockId = BLOCK_BY_NAME.get(r.result);
      this._session.inventory.addItem(blockId !== undefined ? { id: blockId, isBlock: true, count: r.count } : { id: r.result, isBlock: false, count: r.count });
      await this._sleep(150, gen);
    }
  }

  /** bot.craft(recipe, count, craftingTable): `recipe` from recipesFor (an item name also works). */
  async craft(recipe, count = 1, craftingTable = null) {
    const gen = this.gen;
    if (!recipe) {
      throw new Error(
        'No recipe provided to bot.craft(). If using bot.recipesFor(id, ...)[0], it returned undefined because required ingredients or a nearby crafting table are missing. Check bot.inventory.items() before crafting, or call bot.craft("item_name") directly!'
      );
    }
    let r = recipe?._recipe;
    if (!r) {
      const name = this.registry.nameOf(typeof recipe === 'object' && recipe ? (recipe.name ?? recipe.type ?? recipe.id) : recipe);
      r = RECIPE_BOOK.find((x) => x.result === name && Object.entries(x.ingredients).every(([ing, n]) => this._canSatisfyIngredient(ing, n)))
        ?? RECIPE_BOOK.find((x) => x.result === name);
      if (!r) throw new Error(`No recipe found for "${typeof recipe === 'object' ? JSON.stringify(recipe) : recipe}"`);
    }

    const times = Math.max(1, Math.floor(count) || 1);

    // Auto-resolve sticks and planks if needed
    const neededSticks = (r.ingredients.stick || 0) * times;
    const haveSticks = this._countIngredient('stick');
    let sticksToMake = 0;
    if (neededSticks > haveSticks) {
      sticksToMake = Math.ceil((neededSticks - haveSticks) / 4);
    }

    const needTablePlacement = r.requiresTable && !craftingTable?.position && !this._nearbyCraftingTable();
    const tablePlanksNeeded = (needTablePlacement && this.inventory.count('crafting_table') === 0) ? 4 : 0;
    const neededPlanks = (r.ingredients.planks || 0) * times + (sticksToMake * 2) + tablePlanksNeeded;
    const havePlanks = this._countIngredient('planks');
    if (neededPlanks > havePlanks) {
      const missingPlanks = neededPlanks - havePlanks;
      await this._autoCraftPlanks(missingPlanks, gen);
    }

    if (needTablePlacement) {
      if (this.inventory.count('crafting_table') === 0 && this._countIngredient('planks') >= 4) {
        const tableRecipe = RECIPE_BOOK.find((x) => x.result === 'crafting_table');
        if (tableRecipe) await this._executeCraft(tableRecipe, 1, gen);
      }
      if (this.inventory.count('crafting_table') > 0) {
        await this._placeCraftingTableNearby(gen);
      }
    }

    if (sticksToMake > 0 && this._countIngredient('stick') < neededSticks) {
      const stickRecipe = RECIPE_BOOK.find((x) => x.result === 'stick');
      if (stickRecipe) await this._executeCraft(stickRecipe, sticksToMake, gen);
    }

    // Auto-resolve cobblestone if needed
    if (r.ingredients.cobblestone) {
      const neededCobble = r.ingredients.cobblestone * times;
      const haveCobble = this._countIngredient('cobblestone');
      if (neededCobble > haveCobble) {
        const missingCobble = neededCobble - haveCobble;
        await this._autoGatherStone(missingCobble, gen);
      }
    }

    // Auto-smelt iron if needed and raw iron / ore is available or gatherable
    if (r.ingredients.iron_ingot) {
      const neededIngots = r.ingredients.iron_ingot * times;
      const haveIngots = this.inventory.count('iron_ingot');
      if (neededIngots > haveIngots) {
        const missingIngots = neededIngots - haveIngots;
        const availableRaw = this.inventory.count('raw_iron') + this.inventory.count('iron_ore');
        if (availableRaw < missingIngots) {
          await this._autoGatherIron(missingIngots - availableRaw, gen);
        }
        const smeltSource = this.inventory.count('raw_iron') >= missingIngots ? 'raw_iron' : (this.inventory.count('iron_ore') >= missingIngots ? 'iron_ore' : null);
        if (smeltSource) {
          await this.smelt(smeltSource, null, missingIngots);
        }
      }
    }

    if (r.requiresTable) {
      const table = craftingTable?.position ? craftingTable : this._nearbyCraftingTable();
      if (!table || this._session.getVoxel(table.position.x, table.position.y, table.position.z) !== BLOCKS.CRAFTING_TABLE) {
        throw new Error(`${r.result} needs a crafting table: place one and pass it to bot.craft(recipe, count, table)`);
      }
      if (this.entity.position.distanceTo(table.position.offset(0.5, 0, 0.5)) > 4.5) {
        await this.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 2));
      }
      this._session.lookAt(table.position.x + 0.5, table.position.y + 0.5, table.position.z + 0.5);
    }

    for (const [ing, n] of Object.entries(r.ingredients)) {
      if (this._countIngredient(ing) < n * times) {
        throw new Error(`Missing ingredients for ${r.result}: need ${n * times} ${ing}, have ${this._countIngredient(ing)}`);
      }
    }

    await this._executeCraft(r, times, gen);
    this._session.lastActionSummary = `crafted ${times * r.count} ${r.result}`;
    this._session.broadcastState({ swinging: true });
  }

  async attack(entity) {
    const gen = this.gen;
    const s = this._session;
    const peer = entity?.id !== undefined ? s.peers.get(entity.id) : null;
    if (!peer) throw new Error('attack needs a player entity (bot.players[name].entity or bot.nearestEntity())');
    if (!s.settings.pvp && s.gameMode === 'base') throw new Error('PvP is off in this world');
    const dist = Math.hypot((peer.x ?? 0) - s.position.x, (peer.y ?? 0) - s.position.y, (peer.z ?? 0) - s.position.z);
    if (dist > 4.2) throw new Error(`Target is ${dist.toFixed(1)} blocks away; get within 3 blocks first`);
    const wait = s.profile.meleeCooldownMs - (Date.now() - s.lastMeleeAt);
    if (wait > 0) await this._sleep(wait, gen);
    s.lastMeleeAt = Date.now();
    s.lookAt(peer.x, (peer.y ?? 0) + 1.2, peer.z);
    const held = s.inventory.getActiveItem();
    const weapon = held && typeof held.id === 'string' ? held.id : null;
    let damage = (weapon && WEAPON_DAMAGE[weapon]) || 1;
    const sharp = (held?.enchantments ?? []).find((e) => e.id === 'sharpness');
    if (sharp) damage += 0.5 * sharp.level + 0.5;
    s.broadcastState({ swinging: true });
    s.sendPacket({ t: 'attack', target: peer.id, damage, weapon, isCritical: false, isSprint: this.controlState.sprint, knockbackLevel: 0, fireAspect: 0 });
  }
  swingArm() { this._session.broadcastState({ swinging: true }); }

  async consume() {
    const gen = this.gen;
    const held = this._session.inventory.getActiveItem();
    const name = held ? this.registry.nameOf(held.id) : null;
    if (!name || !(name in FOOD)) throw new Error('Hold food first');
    await this._sleep(1600, gen);
    this.inventory._take(name, 1);
    this.food = Math.min(20, this.food + FOOD[name]);
    this._session.health = Math.min(this._session.maxHealth, this._session.health + (name === 'golden_apple' ? 4 : 1));
    this._session.broadcastState();
  }

  async openContainer(block) {
    const gen = this.gen;
    if (!block?.position) throw new Error('openContainer needs a chest block');
    const p = block.position;
    if (this.entity.position.distanceTo(p.offset(0.5, 0, 0.5)) > 4.5) await this.pathfinder.goto(new GoalNear(p.x, p.y, p.z, 2));
    this._check(gen);
    const key = `${p.x},${p.y},${p.z}`;
    const s = this._session;
    if (!s.chests.has(key)) s.chests.set(key, { x: p.x, y: p.y, z: p.z, items: new Array(27).fill(null) });
    const chest = s.chests.get(key);
    s.lookAt(p.x + 0.5, p.y + 0.5, p.z + 0.5);
    await this._sleep(300, gen);
    const bot = this;
    const sync = () => s.sendPacket({ t: 'container', x: p.x, y: p.y, z: p.z, items: chest.items });
    return {
      type: 'minecraft:chest',
      containerItems: () => chest.items.map((st, i) => bot.inventory._itemFor(st, i)).filter(Boolean),
      items: () => bot.inventory.items(),
      async withdraw(itemType, _meta, count = 1) {
        const name = bot.registry.nameOf(itemType);
        let left = Math.max(1, count ?? 1);
        for (let i = 0; i < chest.items.length && left > 0; i++) {
          const st = chest.items[i];
          if (!st || bot.registry.nameOf(st.id) !== name) continue;
          const take = Math.min(left, st.count);
          s.inventory.addItem({ ...st, count: take });
          st.count -= take; left -= take;
          if (st.count <= 0) chest.items[i] = null;
        }
        if (left === Math.max(1, count ?? 1)) throw new Error(`No ${name} in the chest`);
        sync(); await bot._sleep(150);
      },
      async deposit(itemType, _meta, count = null) {
        const name = bot.registry.nameOf(itemType);
        const n = count ?? bot.inventory.count(name);
        const stacks = bot.inventory._take(name, n);
        if (!stacks.length) throw new Error(`No ${name} to deposit`);
        for (const st of stacks) { const slot = chest.items.findIndex((x) => !x); if (slot < 0) { s.inventory.addItem(st); break; } chest.items[slot] = st; }
        sync(); await bot._sleep(150);
      },
      close() {},
    };
  }
  openChest(block) { return this.openContainer(block); }

  async openFurnace(block) {
    const gen = this.gen;
    if (!block?.position) throw new Error('openFurnace needs a furnace block');
    const p = block.position;
    if (this.entity.position.distanceTo(p.offset(0.5, 0, 0.5)) > 4.5) {
      await this.pathfinder.goto(new GoalNear(p.x, p.y, p.z, 2));
    }
    this._check(gen);
    this._session.lookAt(p.x + 0.5, p.y + 0.5, p.z + 0.5);
    await this._sleep(250, gen);
    const bot = this;
    let inputStack = null;
    let fuelStack = null;
    let outputStack = null;
    return {
      type: 'minecraft:furnace',
      inputItem: () => inputStack,
      fuelItem: () => fuelStack,
      outputItem: () => outputStack,
      async putInput(itemType, _meta, count = 1) {
        const name = bot.registry.nameOf(itemType);
        const [taken] = bot.inventory._take(name, count);
        if (!taken) throw new Error(`No ${name} to put in furnace input`);
        inputStack = taken;
        await bot._sleep(100);
      },
      async putFuel(itemType, _meta, count = 1) {
        const name = bot.registry.nameOf(itemType);
        const [taken] = bot.inventory._take(name, count);
        if (!taken) throw new Error(`No ${name} to put in furnace fuel`);
        fuelStack = taken;
        await bot._sleep(100);
      },
      async takeOutput() {
        if (!outputStack) return null;
        const out = { ...outputStack };
        bot._session.inventory.addItem(out);
        outputStack = null;
        await bot._sleep(100);
        return out;
      },
      close() {},
    };
  }

  async smelt(itemType, fuelType = null, count = 1) {
    const gen = this.gen;
    const itemName = this.registry.nameOf(itemType);
    if (!itemName) throw new Error(`Unknown item to smelt: ${itemType}`);
    const outputName = SMELT_RECIPES[itemName];
    if (!outputName) throw new Error(`Cannot smelt ${itemName}`);

    const times = Math.max(1, Math.floor(count) || 1);
    const haveInput = this.inventory.count(itemName);
    if (haveInput < times) throw new Error(`Not enough ${itemName} to smelt: need ${times}, have ${haveInput}`);

    let fuelName = fuelType ? this.registry.nameOf(fuelType) : null;
    if (!fuelName) {
      for (const f of FUELS) {
        if (this.inventory.count(f) > 0) { fuelName = f; break; }
      }
    }
    if (!fuelName || this.inventory.count(fuelName) <= 0) {
      if (this._canSatisfyIngredient('planks', 1)) {
        await this._autoCraftPlanks(1, gen);
        fuelName = 'oak_planks';
      } else {
        await this._autoGatherCoal(1, gen);
        fuelName = this.inventory.count('coal') > 0 ? 'coal' : null;
        if (!fuelName) {
          await this._autoCraftPlanks(1, gen);
          fuelName = 'oak_planks';
        }
      }
    }

    let furnace = this._nearbyFurnace();
    if (!furnace) {
      if (this.inventory.count('furnace') === 0) {
        await this.craft('furnace', 1);
      }
      if (this.inventory.count('furnace') > 0) {
        await this._placeBlockTypeNearby('furnace', gen);
        furnace = this._nearbyFurnace();
      }
    }
    if (!furnace) throw new Error('Furnace could not be placed or found nearby');

    if (this.entity.position.distanceTo(furnace.position.offset(0.5, 0, 0.5)) > 4.5) {
      await this.pathfinder.goto(new GoalNear(furnace.position.x, furnace.position.y, furnace.position.z, 2));
    }
    this._session.lookAt(furnace.position.x + 0.5, furnace.position.y + 0.5, furnace.position.z + 0.5);

    const fuelPerItem = fuelName === 'coal' || fuelName === 'charcoal' ? 1 / 8 : 1;
    const fuelNeeded = Math.max(1, Math.ceil(times * fuelPerItem));
    if (this.inventory.count(fuelName) < fuelNeeded) {
      throw new Error(`Need ${fuelNeeded} ${fuelName} as fuel, have ${this.inventory.count(fuelName)}`);
    }

    await this._sleep(500, gen);
    this.inventory._take(itemName, times);
    this.inventory._take(fuelName, fuelNeeded);

    const blockId = BLOCK_BY_NAME.get(outputName);
    this._session.inventory.addItem(blockId !== undefined ? { id: blockId, isBlock: true, count: times } : { id: outputName, isBlock: false, count: times });
    await this._sleep(250, gen);

    this._session.lastActionSummary = `smelted ${times} ${outputName}`;
    this._session.broadcastState({ swinging: true });
    return times;
  }

  setControlState(control, state) {
    if (!(control in this.controlState)) return;
    this.controlState[control] = Boolean(state);
    if (control === 'jump' && state) this._jumpOnce();
    const moving = ['forward', 'back', 'left', 'right'].some((c) => this.controlState[c]);
    if (moving && !this._controlTimer) {
      this._controlTimer = setInterval(() => this._controlStep(), 50);
      this._controlTimer.unref?.();
    } else if (!moving && this._controlTimer) {
      clearInterval(this._controlTimer); this._controlTimer = null;
    }
  }
  getControlState(control) { return Boolean(this.controlState[control]); }
  clearControlStates() { for (const k of Object.keys(this.controlState)) this.controlState[k] = false; if (this._controlTimer) { clearInterval(this._controlTimer); this._controlTimer = null; } }
  _jumpOnce() {
    const s = this._session;
    if (s.isSolid(s.position.x, s.position.y + 2, s.position.z)) return;
    s.position.y += 1; s.broadcastState();
    const t = setTimeout(() => { if (!s.isSolid(s.position.x, s.position.y - 1, s.position.z)) { s.position.y -= 1; s.broadcastState(); } }, 300);
    t.unref?.();
  }
  _controlStep() {
    const s = this._session;
    const c = this.controlState;
    const f = (c.forward ? 1 : 0) - (c.back ? 1 : 0);
    const r = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (!f && !r) return;
    const speed = (c.sprint && s.profile.sprintAllowed ? s.profile.sprintSpeed : s.profile.walkSpeed) * (c.sneak ? 0.3 : 1) * 0.05;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    let dx = fx * f + rx * r, dz = fz * f + rz * r;
    const len = Math.hypot(dx, dz) || 1; dx = (dx / len) * speed; dz = (dz / len) * speed;
    const nx = s.position.x + dx, nz = s.position.z + dz;
    let ny = s.position.y;
    if (s.isSolid(nx, ny, nz) || s.isSolid(nx, ny + 1, nz)) {
      if (!s.isSolid(nx, ny + 1, nz) && !s.isSolid(nx, ny + 2, nz)) ny += 1; else return;
    } else if (!s.isSolid(nx, ny - 1, nz) && s.isSolid(nx, ny - 2, nz)) ny -= 1;
    if (c.sneak && !s.isSolid(nx, ny - 1, nz)) return;
    s.position.x = nx; s.position.y = ny; s.position.z = nz;
    s.isSprinting = Boolean(c.sprint); s.isSneaking = Boolean(c.sneak);
    s.broadcastState();
  }
}

class Pathfinder {
  constructor(bot) { this.bot = bot; this.goal = null; this.dynamic = false; this._moveId = 0; this._loop = null; this.movements = new Movements(bot); this.thinkTimeout = 5000; }
  setMovements(m) { this.movements = m; }
  isMoving() { return !!this.goal; }
  isMining() { return !!this.bot._digging; }
  isBuilding() { return false; }
  _halt() { this._moveId++; this.goal = null; this.dynamic = false; }
  stop() { this._halt(); this.bot._session.isSprinting = false; this.bot._session.broadcastState(); }
  setGoal(goal, dynamic = false) {
    this._halt();
    if (!goal) return;
    this.goal = goal; this.dynamic = Boolean(dynamic);
    const moveId = this._moveId;
    this._loop = this._run(goal, this.dynamic, moveId).catch(() => {});
  }
  async goto(goal) {
    this._halt();
    this.goal = goal; this.dynamic = false;
    const moveId = this._moveId;
    try { await this._run(goal, false, moveId, true); } finally { if (this._moveId === moveId) this.goal = null; }
  }
  async _run(goal, dynamic, moveId, throwOnFail = false) {
    const bot = this.bot;
    const s = bot._session;
    const gen = bot.gen;
    const cancelled = () => moveId !== this._moveId || gen !== bot.gen || !s.connected;
    let stuck = 0;
    let lastDist = Infinity;
    for (let i = 0; i < 400; i++) {
      if (cancelled()) { if (throwOnFail) throw new Error('Path was stopped before reaching the goal'); return; }
      const pos = bot.entity.position;
      if (goal.isEnd(pos)) {
        bot.emit('goal_reached', goal);
        if (!dynamic) return;
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      const t = goal.target(bot);
      s.chatTaskBusy = true;
      await s.moveStepToward(t.x, t.y, t.z, { bridge: false, stopWithin: Math.max(0.4, (t.range ?? 1) - 0.2), durationMs: 1500, maxDistance: 400, isCancelled: cancelled });
      const d = Math.hypot(t.x - s.position.x, t.z - s.position.z);
      if (d >= lastDist - 0.05) stuck++; else stuck = 0;
      lastDist = d;
      if (stuck >= 4 && !dynamic) {
        if (throwOnFail) throw new Error(`No path: stuck ${d.toFixed(1)} blocks from the goal (dig or place blocks to get through)`);
        return;
      }
      if (stuck >= 4) { stuck = 0; await new Promise((r) => setTimeout(r, 300)); }
    }
    if (throwOnFail && !goal.isEnd(bot.entity.position)) throw new Error('Took too long to reach the goal');
  }
}

class InventoryView {
  constructor(bot) { this.bot = bot; }
  get _inv() { return this.bot._session.inventory; }
  _itemFor(stack, slot) {
    if (!stack) return null;
    const name = this.bot.registry.nameOf(stack.id) ?? String(stack.id);
    return { type: this.bot.registry.idOf(name), name, displayName: name.replace(/_/g, ' '), count: stack.count, slot, stackSize: 64, metadata: 0, enchants: stack.enchantments ?? [] };
  }
  items() {
    const inv = this._inv;
    return [
      ...inv.hotbar.map((s, i) => this._itemFor(s, 36 + i)),
      ...inv.storage.map((s, i) => this._itemFor(s, 9 + i)),
    ].filter(Boolean);
  }
  get slots() {
    const inv = this._inv; const out = new Array(46).fill(null);
    inv.storage.forEach((s, i) => { out[9 + i] = this._itemFor(s, 9 + i); });
    inv.hotbar.forEach((s, i) => { out[36 + i] = this._itemFor(s, 36 + i); });
    out[5] = this._itemFor(inv.armor.head, 5); out[6] = this._itemFor(inv.armor.chest, 6);
    out[7] = this._itemFor(inv.armor.legs, 7); out[8] = this._itemFor(inv.armor.feet, 8); out[45] = this._itemFor(inv.offhand, 45);
    return out;
  }
  count(itemType) {
    const name = this.bot.registry.nameOf(itemType);
    return this.items().filter((i) => i.name === name).reduce((sum, i) => sum + i.count, 0);
  }
  findInventoryItem(itemType) { const name = this.bot.registry.nameOf(itemType); return this.items().find((i) => i.name === name) ?? null; }
  emptySlotCount() { return [...this._inv.hotbar, ...this._inv.storage].filter((s) => !s).length; }
  _locate(item) {
    const inv = this._inv;
    if (item && typeof item === 'object' && Number.isInteger(item.slot)) {
      const list = item.slot >= 36 ? inv.hotbar : inv.storage;
      const index = item.slot >= 36 ? item.slot - 36 : item.slot - 9;
      if (list[index]) return { list, index };
    }
    const name = this.bot.registry.nameOf(typeof item === 'object' && item ? (item.name ?? item.type) : item);
    for (const list of [inv.hotbar, inv.storage]) {
      const index = list.findIndex((s) => s && this.bot.registry.nameOf(s.id) === name);
      if (index >= 0) return { list, index };
    }
    return null;
  }
  _take(name, n) {
    const inv = this._inv; const taken = [];
    let left = n;
    for (const list of [inv.hotbar, inv.storage]) {
      for (let i = 0; i < list.length && left > 0; i++) {
        const s = list[i];
        if (!s || this.bot.registry.nameOf(s.id) !== name) continue;
        const take = Math.min(left, s.count);
        taken.push({ ...s, count: take });
        s.count -= take; left -= take;
        if (s.count <= 0) list[i] = null;
      }
    }
    return taken;
  }
}

function peerEntity(peer) {
  return {
    id: peer.id, type: 'player', name: 'player', username: peer.name || peer.id, displayName: peer.name || peer.id,
    position: new Vec3(peer.x ?? 0, peer.y ?? 0, peer.z ?? 0), yaw: peer.yaw ?? 0, pitch: peer.pitch ?? 0, height: 1.8,
    heldItem: peer.activeItem ? { name: String(peer.activeItem) } : null, isHost: Boolean(peer.isHost), dead: Boolean(peer.dead),
  };
}

const MC_BLOCK_NAMES = Object.freeze({ grass: 'grass_block' });

function blockName(id) {
  const raw = NAME_BY_BLOCK.get(id);
  return raw ? (MC_BLOCK_NAMES[raw] ?? raw) : (id === 0 ? 'air' : `block_${id}`);
}

function makeBlock(session, id, position) {
  const name = blockName(id);
  const solid = id !== 0 && !NON_SOLID_BLOCKS.has(id);
  return {
    type: id, name, displayName: name.replace(/_/g, ' '), position, metadata: 0,
    boundingBox: solid ? 'block' : 'empty', diggable: id !== 0 && id !== BLOCKS.BEDROCK && id !== BLOCKS.WATER && id !== BLOCKS.LAVA,
    hardness: BLOCK_HARDNESS[name]?.[0] ?? 1, transparent: !solid,
  };
}

function buildRegistry() {
  const blocksByName = {}; const blocks = {}; const itemsByName = {}; const items = {};
  for (const [id, raw] of NAME_BY_BLOCK.entries()) {
    const name = MC_BLOCK_NAMES[raw] ?? raw;
    const entry = { id, name, displayName: name.replace(/_/g, ' '), hardness: BLOCK_HARDNESS[name]?.[0] ?? 1, diggable: id !== BLOCKS.BEDROCK };
    blocksByName[name] = entry; blocks[id] = entry;
    itemsByName[name] = { id, name, displayName: entry.displayName, stackSize: 64 }; items[id] = itemsByName[name];
  }
  blocksByName.air = { id: 0, name: 'air', displayName: 'air' }; blocks[0] = blocksByName.air;
  for (const [name, id] of ITEM_ID_BY_NAME) { itemsByName[name] = { id, name, displayName: name.replace(/_/g, ' '), stackSize: /sword|pickaxe|axe|shovel|hoe|helmet|chestplate|leggings|boots|bow|shield|shears|bucket/.test(name) ? 1 : 64 }; items[id] = itemsByName[name]; }
  const nameOf = (x) => {
    if (x === null || x === undefined) return null;
    if (typeof x === 'object') return nameOf(x.name ?? x.type ?? x.id);
    if (typeof x === 'number') return items[x]?.name ?? blocks[x]?.name ?? null;
    const clean = String(x).trim().toLowerCase().replace(/^minecraft:/, '').replace(/\s+/g, '_');
    if (clean === 'grass') return 'grass_block';
    return clean;
  };
  const idOf = (name) => itemsByName[nameOf(name)]?.id ?? blocksByName[nameOf(name)]?.id ?? null;
  return { blocksByName, blocks, itemsByName, items, blocksArray: Object.values(blocks), itemsArray: Object.values(items), nameOf, idOf, version: '1.21' };
}

function matcher(matching, registry) {
  if (typeof matching === 'function') return { fn: (id, block) => { try { return Boolean(matching(block())); } catch { return false; } }, wantsAir: false };
  const list = (Array.isArray(matching) ? matching : [matching]).map((m) => (typeof m === 'number' ? m : registry.blocksByName[registry.nameOf(m)]?.id)).filter((m) => m !== undefined && m !== null);
  const set = new Set(list);
  return { fn: (id) => set.has(id), wantsAir: set.has(0) };
}

function toolParts(stack) {
  const id = typeof stack?.id === 'string' ? stack.id : '';
  const m = id.match(/^(wooden|stone|iron|golden|diamond|netherite)_(pickaxe|axe|shovel|hoe|sword)$/);
  return m ? { tier: m[1], kind: m[2] } : null;
}

function canHarvest(name, held) {
  const info = BLOCK_HARDNESS[name];
  if (!info?.[2]) return true;
  const tool = toolParts(held);
  if (!tool || tool.kind !== info[1]) return false;
  if (name === 'obsidian') return ['diamond', 'netherite'].includes(tool.tier);
  if (['iron_ore', 'gold_ore', 'diamond_ore'].includes(name)) return !['wooden', 'golden'].includes(tool.tier);
  return true;
}

function digSeconds(name, held) {
  const [hardness, toolKind] = BLOCK_HARDNESS[name] ?? [/_log$|_planks$/.test(name ?? '') ? 2 : 1, /_log$|_planks$/.test(name ?? '') ? 'axe' : null];
  if (!hardness) return 0.05;
  const tool = toolParts(held);
  const speed = tool && tool.kind === toolKind ? TOOL_SPEED[tool.tier] : 1;
  const factor = canHarvest(name, held) ? 1.5 : 5;
  return Math.min(30, Math.max(0.05, (hardness * factor) / speed));
}

/** A short API reference for the model that writes the code. */
export const MINEFLAYER_API_REFERENCE = `You control a Minecraft-style player through a Mineflayer-compatible API (mineflayer + mineflayer-pathfinder).
Your code is the body of an async function; use await. In scope: bot, Vec3, goals, Movements, mcData, sleep(ms), player (the speaking player's entity or null), sender (their name), message (what they said), console.log.
Everything takes real human time (walking ~4.3 blocks/s, digging by hand is slow). A newer instruction cancels older code.
Properties: bot.username, bot.entity.position (Vec3), bot.entity.yaw, bot.health, bot.food, bot.heldItem, bot.players[name].entity, bot.entities, bot.game.mode ('base' | 'skywars' | 'bedwars'), bot.time.timeOfDay.
World: bot.blockAt(vec3) -> {name, type, position, boundingBox, diggable}; bot.findBlock({matching: id | [ids] | name | (block) => bool, maxDistance (<= 32)}); bot.findBlocks({matching, maxDistance, count}) -> Vec3[]; bot.nearestEntity(filter).
Ids: mcData.blocksByName.oak_log.id, mcData.itemsByName.stick.id. Block names include grass_block, dirt, stone, cobblestone, sand, gravel, oak_log, birch_log, spruce_log, oak_leaves, oak_planks, crafting_table, chest, furnace, glass, coal_ore, iron_ore, water, lava.
Moving: await bot.pathfinder.goto(new goals.GoalNear(x, y, z, range)); goals.GoalBlock, GoalXZ, GoalNearXZ, GoalY, GoalGetToBlock; bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true) keeps following until bot.pathfinder.stop(). bot.setControlState('forward'|'back'|'left'|'right'|'jump'|'sprint'|'sneak', bool), bot.clearControlStates(), await bot.lookAt(vec3), await bot.look(yaw, pitch).
Blocks: await bot.dig(block) (walks into reach; stone needs a pickaxe to drop anything); await bot.placeBlock(referenceBlock, faceVector) places the HELD block against a solid reference block, e.g. bot.placeBlock(bot.blockAt(pos.offset(0,-1,0)), new Vec3(0,1,0)) puts it on top.
Items: bot.inventory.items() -> [{name, type, count, slot}], bot.inventory.count(nameOrId), bot.inventory.findInventoryItem(nameOrId); await bot.equip(itemOrName, 'hand'|'head'|'torso'|'legs'|'feet'|'off-hand'); await bot.toss(itemOrName, null, count) drops items in front of you (face the player first: if (player) await bot.lookAt(player.position.offset(0,1.6,0))); await bot.consume().
Crafting & Smelting & Gathering: You can craft directly with await bot.craft('item_name', count) (e.g. await bot.craft('wooden_pickaxe'), await bot.craft('wooden_axe'), await bot.craft('wooden_sword'), await bot.craft('stone_pickaxe'), await bot.craft('furnace'), await bot.craft('iron_pickaxe')). bot.craft automatically gathers missing wood/cobblestone/iron from nearby blocks, handles prerequisite planks/sticks/smelting, and places crafting tables/furnaces! When asked for tools (e.g. "build some wooden tools" or "craft tools for both of us"), call await bot.craft(...) for each needed tool. You can also gather resources directly: await bot.gather('wood', 4); await bot.gather('stone', 8); await bot.gather('iron', 3); await bot.gather('coal', 2). Progression: Dig logs by hand (or bot.craft) -> wooden_pickaxe -> stone_pickaxe & furnace -> iron_pickaxe & iron tools!
Containers: const chest = await bot.openContainer(block); chest.containerItems(); await chest.withdraw(id, null, n); await chest.deposit(id, null, n); chest.close().
Combat: await bot.attack(entity) (within 3 blocks).
Chat: bot.chat(text). Events: bot.on('chat', (username, message) => {}), bot.once(...), 'goal_reached', 'physicsTick'.
Start with what you already have: check bot.inventory.items() before gathering. Report progress and status with bot.chat so the player knows what happened.`;

/** Run AI-written code on a session's Mineflayer bot. Returns {ok, result?, error?, cancelled?, logs}. */
export async function runSessionCode(session, code, { sender = null, message = '', cancelPrevious = true, timeoutMs = 10 * 60_000 } = {}) {
  const bot = session.bot;
  if (cancelPrevious) bot.stopAll();
  const gen = bot.gen;
  const logs = [];
  const log = (...args) => { logs.push(args.map((a) => (typeof a === 'string' ? a : safeJson(a))).join(' ')); if (logs.length > 60) logs.shift(); };
  const track = (fn) => (cb, ms, ...rest) => { const t = fn(() => { if (gen === bot.gen) cb(...rest); }, ms); bot._timers.add(t); t.unref?.(); return t; };
  const speakerEntity = sender ? (bot.players[sender]?.entity ?? null) : null;
  const context = vm.createContext({
    bot, Vec3, goals, Movements, mcData: bot.registry, BLOCKS, sender, message,
    player: speakerEntity,
    sleep: (ms) => bot._sleep(ms, gen),
    console: { log, info: log, warn: log, error: log },
    setTimeout: track(setTimeout), setInterval: track(setInterval),
    clearTimeout: (t) => clearTimeout(t), clearInterval: (t) => clearInterval(t),
  });
  let fn;
  let codeStr = String(code ?? '').trim().replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();

  const compile = (str) => vm.runInContext(`(async () => {\n${str}\n})`, context, { filename: 'agent-code.js', timeout: 1000 });

  const tryCompile = (str) => {
    try { return compile(str); } catch {}

    // Strip dangling trailing closing braces
    let repaired = str;
    while (/\}[\s;]*$/.test(repaired)) {
      repaired = repaired.replace(/\}[\s;]*$/, '').trim();
      try { return compile(repaired); } catch {}
    }

    // Wrap uninvoked anonymous functions: async function() { ... } or () => { ... }
    if (/^\s*(?:async\s+)?(?:function\s*\(|\([^)]*\)\s*=>)/i.test(str)) {
      try { return compile(`return await (${str.replace(/;+$/, '')})()`); } catch {}
    }

    // Wrap uninvoked arrow or function expression: (async () => { ... })
    if (/^\s*\(\s*(?:async\s+)?(?:function|\([^)]*\)|[a-zA-Z0-9_$]+)/i.test(str) && !/\)\s*\(\s*\)\s*;?\s*$/.test(str)) {
      try { return compile(`return await (${str})()`); } catch {}
    }

    // Uncalled named function declaration: async function doTask() { ... }
    const fnMatch = str.match(/(?:async\s+function|function)\s+([a-zA-Z0-9_$]+)/);
    if (fnMatch && !new RegExp(`\\b${fnMatch[1]}\\s*\\(`).test(str.slice(fnMatch.index + fnMatch[0].length))) {
      try { return compile(`${str}\nreturn await ${fnMatch[1]}();`); } catch {}
    }

    // Missing closing brace
    try { return compile(`${str}\n}`); } catch {}

    return compile(str);
  };

  try {
    fn = tryCompile(codeStr);
  } catch (err) {
    return { ok: false, error: `SyntaxError: ${err?.message || err}`, logs };
  }
  session.codeRuns = (session.codeRuns ?? 0) + 1;
  session.chatTaskBusy = true;
  session.lastActionSummary = `running code for ${sender || 'the AI'}`;
  let timer;
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Code ran longer than ${Math.round(timeoutMs / 1000)} s`)), timeoutMs); timer.unref?.(); }),
    ]);
    return { ok: true, result: result === undefined ? null : JSON.parse(safeJson(result)), logs };
  } catch (err) {
    if (err?.cancelled) return { ok: false, cancelled: true, error: err.message, logs };
    return { ok: false, error: `${err?.name || 'Error'}: ${err?.message || String(err)}`, logs };
  } finally {
    clearTimeout(timer);
    session.codeRuns -= 1;
    if (!session.codeRuns && !bot.pathfinder.isMoving()) session.chatTaskBusy = false;
    if (gen === bot.gen) session.lastActionSummary = 'idle';
  }
}

function safeJson(value) {
  try { return JSON.stringify(value, (k, v) => (k.startsWith('_') ? undefined : v)) ?? 'null'; } catch { return String(value); }
}

/** A compact description of the world for the model. */
export function describeForModel(session, { sender = null } = {}) {
  const bot = session.bot;
  const me = bot.entity.position;
  const round = (v) => Math.round(v * 10) / 10;
  const counts = new Map();
  const nearest = new Map();
  const r = 10;
  for (let y = Math.max(0, Math.floor(me.y) - 4); y <= Math.min(63, Math.floor(me.y) + 6); y++) {
    for (let x = Math.floor(me.x) - r; x <= Math.floor(me.x) + r; x++) {
      for (let z = Math.floor(me.z) - r; z <= Math.floor(me.z) + r; z++) {
        const id = session.getVoxel(x, y, z);
        if (!id) continue;
        const name = blockName(id);
        counts.set(name, (counts.get(name) ?? 0) + 1);
        const d = Math.hypot(x - me.x, y - me.y, z - me.z);
        if (!nearest.has(name) || nearest.get(name).d > d) nearest.set(name, { d, at: [x, y, z] });
      }
    }
  }
  const findLogs = bot.findBlocks({ matching: (b) => /_log$/.test(b.name), maxDistance: 32, count: 3 }).map((p) => p.toArray());
  return {
    you: { name: session.name, position: [round(me.x), round(me.y), round(me.z)], health: session.health, food: bot.food, holding: bot.heldItem?.name ?? null, busy: session.lastActionSummary },
    gameMode: session.gameMode,
    inventory: bot.inventory.items().map((i) => `${i.count} ${i.name}`),
    players: Object.values(bot.players).filter((p) => p.username !== session.name).map((p) => ({ name: p.username, position: p.entity.position.toArray().map(round), distance: round(p.entity.position.distanceTo(me)), speaking: p.username === sender })),
    blocksWithin10: Object.fromEntries([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)),
    nearestOfEach: Object.fromEntries([...nearest.entries()].filter(([n]) => n !== 'air').slice(0, 30).map(([n, v]) => [n, v.at])),
    nearestLogs: findLogs,
  };
}

const MODEL_SYSTEM_PROMPT = `You are a friendly, proactive companion player inside a Minecraft-like game called Blockyland. Players talk to you in game chat.
Decide from what the player says whether they want you to DO something in the game or are just talking.
Answer with a single JSON object: {"reply": "short chat message (or empty)", "code": "JavaScript or null"}.
- Just chatting, asking a question, or thanking you: put your answer in reply and set code to null.
- Asking you to act (gather, craft, build, follow, come, stop, give/throw, fight, dig, go somewhere...): write sequential statements using await directly (do NOT wrap in an uncalled anonymous function \`function() {}\` or \`async function() {}\`, and do NOT add an extra closing brace "}" at the end).
- Be proactive! When asked to make tools for both player and companion (e.g. "build wooden tools for yourself too so we can go mining", "throw the tools you built to me"), craft the requested tools using bot.craft(...) and toss the ones requested to the player. bot.craft automatically gathers missing wood/cobblestone/iron from nearby blocks, handles prerequisite planks/sticks/smelting, and places crafting tables/furnaces!
- To throw items to the player: face them (if (player) await bot.lookAt(player.position.offset(0, 1.6, 0))) and toss (e.g. await bot.toss('wooden_sword', null, 1);).
- "stop"/"wait"/"stay" style requests: code like bot.pathfinder.stop(); bot.clearControlStates(); (the new code already cancels old tasks).
- Keep reply under 200 characters. Never claim to have done something the code has not done; use bot.chat inside the code to report results.
${MINEFLAYER_API_REFERENCE}`;

/**
 * A brain that asks a hosted model what to do. Uses GEMINI_API_KEY / GOOGLE_API_KEY, OPENAI_API_KEY / OPENAI_KEY or
 * ANTHROPIC_API_KEY (first one set); BLOCKYLAND_AGENT_MODEL picks the model. Returns null when no key is set.
 */
export function createModelBrain({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const geminiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  const openaiKey = env.OPENAI_API_KEY || env.OPENAI_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;
  const provider = geminiKey ? 'gemini' : openaiKey ? 'openai' : anthropicKey ? 'anthropic' : null;
  if (!provider || typeof fetchImpl !== 'function') return null;
  const model = env.BLOCKYLAND_AGENT_MODEL || { gemini: 'gemini-2.5-flash', openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-5' }[provider];
  const ask = async (userText) => {
    let text;
    if (provider === 'gemini') {
      const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: MODEL_SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: userText }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    } else if (provider === 'openai') {
      const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: MODEL_SYSTEM_PROMPT }, { role: 'user', content: userText }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      text = data.choices?.[0]?.message?.content ?? '';
    } else {
      const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 4000, system: MODEL_SYSTEM_PROMPT, messages: [{ role: 'user', content: userText }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      text = (data.content ?? []).map((c) => c.text ?? '').join('');
    }
    const start = text.indexOf('{'); const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return { reply: text.trim().slice(0, 240), code: null };
    const parsed = JSON.parse(text.slice(start, end + 1));
    return { reply: typeof parsed.reply === 'string' ? parsed.reply : '', code: typeof parsed.code === 'string' && parsed.code.trim() ? parsed.code : null };
  };
  const brain = async ({ sender, message, world, recentChat, feedback }) => ask(JSON.stringify({ player: sender, said: message, world, recentChat, ...(feedback ? { previousAttempt: feedback } : {}) }));
  brain.provider = provider;
  brain.model = model;
  return brain;
}
