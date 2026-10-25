// SkyWars chest loot, from minecraft.wiki Tutorial:SkyWars and Hypixel's SkyWars page. Pure and seeded.
//
// Normal mode, spawn islands (Tutorial:SkyWars): "armor that is either leather or iron, which gives the player 1 to 15
//   armor. The chests also contain 1 to 3 swords ranging from a stone sword, a stone Sharpness 1 sword, and an iron
//   sword. Wooden Planks and stone are randomized in the chests and give 8 to 16 in one slot".
// Insane mode, spawn islands: "at least three pieces of armor that are either iron or diamond, which gives the player 9
//   to 20 armor ... 1 to 3 swords ranging from a stone sword with Sharpness 1, a diamond sword, and a diamond sword with
//   Sharpness 1", the same blocks, and "Other random items by chance": water bucket, lava bucket, diamond pickaxe,
//   diamond axe, Splash Potion of Regeneration, Splash Potion of Swiftness, Potion of Fire Resistance, a bow with Power
//   I and 15 arrows or Power III and 20 arrows, a fishing rod, eggs or snowballs.
// The middle (Hypixel): Normal -- "enchanted diamond helmets and boots, enchanted iron chestplates and leggings, 1-2
//   ender pearls, 1-3 golden apples, weaker knockback rods"; Insane -- "enchanted diamond armor and swords, stronger
//   variants of items like the knockback rod, and increased quantities of items such as ender pearls and golden apples".
// Refills (Hypixel): "all chests on the map will refill. A later second chest refill will also place ender pearls in
//   every chest."
import { BLOCKS } from '../../blocks.js';
import { enchantmentEntry } from '../../enchanting.js';
import { seededRandom } from './arena.js';

export const MODES = Object.freeze(['normal', 'insane']);
const SLOTS = 27;
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
/** Armour points per piece (Armor): leather 1/3/2/1, iron 2/6/5/2, diamond 3/8/6/3. */
export const ARMOR_POINTS = Object.freeze({
  leather: { helmet: 1, chestplate: 3, leggings: 2, boots: 1 },
  iron: { helmet: 2, chestplate: 6, leggings: 5, boots: 2 },
  diamond: { helmet: 3, chestplate: 8, leggings: 6, boots: 3 },
});

const item = (id, count = 1, extra = {}) => ({ id, count, isBlock: false, ...extra });
const block = (id, count) => ({ id, count, isBlock: true });
const enchanted = (id, enchantments) => item(id, 1, { enchantments: enchantments.map(([e, level]) => enchantmentEntry(e, level)) });

/** The armour points of a list of stacks (helmet ... boots of leather, iron or diamond). */
export function armorPoints(stacks) {
  let total = 0;
  for (const s of stacks) {
    const m = /^(leather|iron|diamond)_(helmet|chestplate|leggings|boots)$/.exec(s?.id ?? '');
    if (m) total += ARMOR_POINTS[m[1]][m[2]];
  }
  return total;
}

/** Everything one spawn island's chests hold together, before it is spread across them. */
export function rollIslandLoot(mode, random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const out = [];
  // Armour.
  if (mode === 'insane') {
    const pieces = random() < 0.5 ? 3 : 4;
    const slots = [...ARMOR_SLOTS].sort(() => random() - 0.5).slice(0, pieces);
    for (const slot of slots) out.push(item(`${random() < 0.5 ? 'iron' : 'diamond'}_${slot}`));
  } else {
    const slots = ARMOR_SLOTS.filter(() => random() < 0.55);
    if (!slots.length) slots.push(pick(ARMOR_SLOTS));
    for (const slot of slots) out.push(item(`${random() < 0.6 ? 'leather' : 'iron'}_${slot}`));
  }
  // Swords.
  const swords = mode === 'insane'
    ? [() => enchanted('stone_sword', [['sharpness', 1]]), () => item('diamond_sword'), () => enchanted('diamond_sword', [['sharpness', 1]])]
    : [() => item('stone_sword'), () => enchanted('stone_sword', [['sharpness', 1]]), () => item('iron_sword')];
  for (let n = between(1, 3); n > 0; n--) out.push(pick(swords)());
  // Building blocks: 8 to 16 a slot, two to four slots, so every island can bridge.
  for (let n = between(2, 4); n > 0; n--) out.push(block(random() < 0.5 ? BLOCKS.OAK_PLANKS : BLOCKS.STONE, between(8, 16)));
  // The rest, "by chance".
  const extras = mode === 'insane'
    ? [() => item('water_bucket'), () => item('lava_bucket'), () => item('diamond_pickaxe'), () => item('diamond_axe'),
      () => item('splash_potion_of_regeneration'), () => item('splash_potion_of_swiftness'), () => item('potion_of_fire_resistance'),
      () => [enchanted('bow', [['power', 1]]), item('arrow', 15)], () => [enchanted('bow', [['power', 3]]), item('arrow', 20)],
      () => item('fishing_rod'), () => item(random() < 0.5 ? 'egg' : 'snowball', 16)]
    : [() => item('stone_pickaxe'), () => item('stone_axe'), () => [item('bow'), item('arrow', between(8, 16))],
      () => item(random() < 0.5 ? 'egg' : 'snowball', between(8, 16)), () => item('cooked_beef', between(3, 8)), () => item('water_bucket'),
      () => item('fishing_rod')];
  const pool = [...extras];
  for (let n = mode === 'insane' ? between(2, 5) : between(1, 3); n > 0 && pool.length; n--) {
    const [roll] = pool.splice(Math.floor(random() * pool.length), 1);
    out.push(...[].concat(roll()));
  }
  return out;
}

/** One middle chest. */
export function rollCenterChest(mode, random) {
  const between = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
  const insane = mode === 'insane';
  const prot = () => ['protection', insane ? between(2, 3) : between(1, 2)];
  const pool = insane
    ? [() => enchanted('diamond_helmet', [prot()]), () => enchanted('diamond_chestplate', [prot()]), () => enchanted('diamond_leggings', [prot()]),
      () => enchanted('diamond_boots', [prot()]), () => enchanted('diamond_sword', [['sharpness', between(2, 3)]]),
      () => item('ender_pearl', between(2, 4)), () => item('golden_apple', between(2, 5)), () => enchanted('stick', [['knockback', 2]]),
      () => [enchanted('bow', [['power', 3]]), item('arrow', 24)], () => item('splash_potion_of_healing', 2), () => block(BLOCKS.TNT, 4)]
    : [() => enchanted('diamond_helmet', [prot()]), () => enchanted('diamond_boots', [prot()]), () => enchanted('iron_chestplate', [prot()]),
      () => enchanted('iron_leggings', [prot()]), () => item('ender_pearl', between(1, 2)), () => item('golden_apple', between(1, 3)),
      () => enchanted('stick', [['knockback', 1]]), () => item('diamond_sword'), () => [item('bow'), item('arrow', 16)], () => item('iron_axe')];
  const out = [];
  const choices = [...pool];
  for (let n = between(3, 5); n > 0 && choices.length; n--) {
    const [roll] = choices.splice(Math.floor(random() * choices.length), 1);
    out.push(...[].concat(roll()));
  }
  out.push(block(random() < 0.5 ? BLOCKS.OAK_PLANKS : BLOCKS.STONE, between(8, 16)));
  return out;
}

/** Spread stacks over `chests` chests of 27 slots, in random slots. */
export function scatter(stacks, chests, random) {
  const out = Array.from({ length: chests }, () => new Array(SLOTS).fill(null));
  stacks.forEach((stack, i) => {
    const chest = out[i % chests];
    let slot = Math.floor(random() * SLOTS);
    for (let tries = 0; chest[slot] && tries < SLOTS; tries++) slot = (slot + 1) % SLOTS;
    if (!chest[slot]) chest[slot] = stack;
  });
  return out;
}

/**
 * The contents of every chest of the arena (arena.js buildArena chests), for a fill (`refill` 0), the first refill
 * (1) or the second (2), which adds an ender pearl to every chest.
 * @returns {(object|null)[][]} one 27-slot list per arena chest, in the arena's order
 */
export function fillChests(arena, { mode = 'normal', seed = 1, refill = 0 } = {}) {
  const random = seededRandom((seed ^ Math.imul(refill + 1, 0x9E3779B1)) >>> 0);
  const result = new Array(arena.chests.length);
  const bySlot = new Map();
  arena.chests.forEach((c, i) => { if (c.kind === 'island') { if (!bySlot.has(c.slot)) bySlot.set(c.slot, []); bySlot.get(c.slot).push(i); } });
  for (const [, indices] of bySlot) {
    const lists = scatter(rollIslandLoot(mode, random), indices.length, random);
    indices.forEach((index, n) => { result[index] = lists[n]; });
  }
  arena.chests.forEach((c, i) => {
    if (c.kind === 'center') result[i] = scatter(rollCenterChest(mode, random), 1, random)[0];
  });
  if (refill >= 2) {
    for (const list of result) {
      const free = list.indexOf(null);
      if (free >= 0) list[free] = item('ender_pearl', 1);
    }
  }
  return result;
}
