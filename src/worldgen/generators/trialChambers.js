// Trial chambers, from the wiki (https://minecraft.wiki/w/Trial_Chambers and /Structure).
//
// From the pages:
//   * underground in the Overworld (the set's 34-chunk regions), "The starting room generates at an altitude of between
//     Y=-40 and -20 ... the majority of the structure's rooms tend to generate between Y=-20 and 0";
//   * "The starting room of the structure is corridor/end. This room connects to a chamber and a section of a corridor.
//     At the end of the section of a corridor, an intersection links to another chamber and another section of a
//     corridor is generated, but this time it ends on the atrium, which then leads to the entrance room. The structure
//     then branches out from some corridor/straight pieces";
//   * the chambers: chamber_1 (a tall breeze column), chamber_2 (powder snow floor), pedestal, chamber_4 (small, two
//     storeys), eruption (magma round a fountain), assembly (floor, balcony, platform), chamber_8 (tall, four storeys,
//     the slow spawners), slanted;
//   * "Natural mob spawning do not occur within the trial chambers"; the trial spawners' mobs: "one mob from each of the
//     following categories is randomly selected for the trial spawners in that trial chamber ... Breeze (always),
//     Melee (1/3 husk, spider or zombie), Ranged and slow ranged (1/3 bogged, skeleton or stray), Small melee (1/4 baby
//     zombie, cave spider, silverfish or slime)";
//   * loot: vaults and ominous vaults (rewards), chests (entrance, intersection, supply), barrels (intersection,
//     corridor), decorated pots, dispensers; the Blocks list (tuff bricks, polished and chiseled tuff, waxed copper
//     blocks, grates, bulbs, doors).
//
// The wiki lists every piece's blocks but draws none, so the shapes are ours, built from those materials: corridors
// five wide, chambers of the described kinds, the path start -> chamber -> corridor -> intersection -> chamber ->
// corridor -> atrium -> entrance, and two to four more chambers off the straight corridors. This world is 64 tall:
// the start is at y 4-12 (Y -40..-20).

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { BlockBox } from '../geometry.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';

export const CHAMBER_KINDS = ['chamber_1', 'chamber_2', 'pedestal', 'chamber_4', 'eruption', 'assembly', 'chamber_8', 'slanted'];
export const MOB_CATEGORIES = {
  breeze: ['breeze'], melee: ['husk', 'spider', 'zombie'], ranged: ['bogged', 'skeleton', 'stray'], small_melee: ['baby_zombie', 'cave_spider', 'silverfish', 'slime']
};
export const TRIAL_LOOT = {
  entrance: 'minecraft:chests/trial_chambers/entrance', intersection: 'minecraft:chests/trial_chambers/intersection', supply: 'minecraft:chests/trial_chambers/supply',
  intersection_barrel: 'minecraft:chests/trial_chambers/intersection_barrel', corridor: 'minecraft:chests/trial_chambers/corridor', pot: 'minecraft:pots/trial_chambers/corridor'
};
const WALL = ['tuff_bricks', 'tuff_bricks', 'polished_tuff', 'chiseled_tuff_bricks', 'waxed_copper_block', 'waxed_oxidized_copper'];

export function buildTrialChambers({ seed, x, y, z }) {
  const random = new LegacyRandom(BigInt(seed));
  const pick = (list) => list[random.nextIntBound(list.length)];
  const canvas = new CellCanvas();
  const pieces = [];
  // One mob per category for the whole structure.
  const mobs = Object.fromEntries(Object.entries(MOB_CATEGORIES).map(([k, list]) => [k, pick(list)]));
  const fits = (box) => box.minY >= 1 && box.maxY <= 62 && !pieces.some((p) => p.box.intersects(box));
  const shell = (box, { floor = 'polished_tuff', fill = 'air' } = {}) => {
    for (let bx = box.minX; bx <= box.maxX; bx++) for (let by = box.minY; by <= box.maxY; by++) for (let bz = box.minZ; bz <= box.maxZ; bz++) {
      const edge = bx === box.minX || bx === box.maxX || bz === box.minZ || bz === box.maxZ || by === box.maxY;
      canvas.set(bx, by, bz, by === box.minY ? floor : edge ? (random.nextFloat() < 0.15 ? 'waxed_copper_grate' : pick(WALL)) : fill);
    }
  };
  const open = (bx, by, bz, axis) => { for (let a = -1; a <= 1; a++) for (let up = 1; up <= 3; up++) canvas.set(axis === 'x' ? bx : bx + a, by + up, axis === 'x' ? bz + a : bz, 'air'); };
  const spawner = (bx, by, bz, category, kind = 'normal') => {
    const mob = mobs[category];
    canvas.set(bx, by, bz, 'trial_spawner', null, { trialSpawner: { mob, kind, category } });
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) canvas.set(bx + dx, by - 1, bz + dz, 'waxed_chiseled_copper');
    canvas.set(bx, by - 1, bz, 'waxed_copper_block');
  };
  const vault = (bx, by, bz, ominous) => canvas.set(bx, by, bz, 'vault', { facing: 'north', ominous: String(ominous) }, { vault: { ominous } });
  const bulb = (bx, by, bz) => canvas.set(bx, by, bz, 'waxed_copper_bulb', { lit: 'true' });

  /** A corridor `length` long from (cx, cz) heading (dx, dz). */
  const corridor = (cx, cy, cz, dx, dz, length, kind = 'corridor') => {
    const x0 = Math.min(cx, cx + dx * (length - 1)) - (dz ? 2 : 0); const x1 = Math.max(cx, cx + dx * (length - 1)) + (dz ? 2 : 0);
    const z0 = Math.min(cz, cz + dz * (length - 1)) - (dx ? 2 : 0); const z1 = Math.max(cz, cz + dz * (length - 1)) + (dx ? 2 : 0);
    const box = new BlockBox(x0, cy, z0, x1, cy + 5, z1);
    if (!fits(box)) return null;
    shell(box);
    for (let a = 2; a < length; a += 6) bulb(cx + dx * a + (dz ? 0 : 0), cy + 4, cz + dz * a);
    if (random.nextFloat() < 0.5) canvas.set(cx + dx * 3 + (dz ? 1 : 0), cy + 1, cz + dz * 3 + (dx ? 1 : 0), 'decorated_pot', null, { id: 'minecraft:decorated_pot', LootTable: TRIAL_LOOT.pot });
    if (random.nextFloat() < 0.4) canvas.set(cx + dx * 5 - (dz ? 1 : 0), cy + 1, cz + dz * 5 - (dx ? 1 : 0), 'barrel', { facing: 'up' }, { id: 'minecraft:barrel', LootTable: TRIAL_LOOT.corridor });
    pieces.push({ box, kind });
    return { x: cx + dx * length, y: cy, z: cz + dz * length };
  };

  /** A chamber of a given kind, its entrance at (cx, cz) facing (dx, dz). */
  const chamber = (kind, cx, cy, cz, dx, dz) => {
    const size = { chamber_4: 11, chamber_8: 13 }[kind] ?? 19;
    const height = { chamber_8: 18, chamber_1: 14, chamber_2: 14 }[kind] ?? 10;
    const mx = cx + dx * Math.floor(size / 2) + dx; const mz = cz + dz * Math.floor(size / 2) + dz;
    const half = Math.floor(size / 2);
    const box = new BlockBox(mx - half, cy - 1, mz - half, mx + half, cy + height, mz + half);
    if (!fits(box)) return null;
    shell(box, { floor: kind === 'chamber_2' ? 'powder_snow' : 'polished_tuff' });
    open(cx, cy, cz, dx ? 'x' : 'z');
    // The kind's centre piece.
    if (kind === 'chamber_1') { for (let by = cy; by < cy + 8; by++) canvas.set(mx, by, mz, 'waxed_cut_copper'); spawner(mx, cy + 8, mz, 'breeze'); }
    else if (kind === 'eruption') { for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) canvas.set(mx + ox * 2, cy - 1, mz + oz * 2, 'magma_block'); canvas.set(mx, cy, mz, 'water'); spawner(mx + 4, cy + 1, mz, 'melee'); }
    else if (kind === 'pedestal') { for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) canvas.set(mx + ox, cy, mz + oz, 'chiseled_tuff'); spawner(mx, cy + 1, mz, 'ranged'); }
    else if (kind === 'assembly') { for (let ox = -half + 1; ox <= half - 1; ox++) canvas.set(mx + ox, cy + 5, mz - half + 2, 'polished_tuff_slab', { type: 'bottom' }); spawner(mx, cy + 1, mz + 2, 'melee'); spawner(mx - 3, cy + 1, mz, 'small_melee'); }
    else if (kind === 'chamber_8') { for (let lvl = 1; lvl < 4; lvl++) for (let ox = -half + 1; ox <= -2; ox++) canvas.set(mx + ox, cy + lvl * 4, mz, 'waxed_cut_copper_slab', { type: 'bottom' }); spawner(mx + 2, cy + 1, mz, 'ranged', 'slow'); spawner(mx - 2, cy + 9, mz, 'ranged', 'slow'); }
    else if (kind === 'slanted') { for (let s = 0; s < half; s++) canvas.set(mx - half + 1 + s, cy + s, mz, 'waxed_cut_copper_stairs', { facing: 'east', half: 'bottom' }); spawner(mx + 3, cy + 1, mz + 3, 'small_melee'); }
    else if (kind === 'chamber_2') { spawner(mx, cy + 1, mz, 'breeze'); }
    else { spawner(mx, cy + 1, mz, pick(['melee', 'ranged', 'small_melee'])); }
    // Rewards: a vault, sometimes an ominous one; a dispenser on a wall.
    vault(mx + half - 2, cy, mz + half - 2, false);
    if (random.nextFloat() < 0.5) vault(mx - half + 2, cy, mz + half - 2, true);
    canvas.set(mx, cy + 2, mz + half, 'dispenser', { facing: 'north' }, { id: 'minecraft:dispenser', LootTable: 'minecraft:dispensers/trial_chambers/chamber' });
    pieces.push({ box, kind });
    return box;
  };

  // The start (corridor end) and the described path.
  const start = new BlockBox(x - 3, y, z - 3, x + 3, y + 6, z + 3);
  shell(start);
  pieces.push({ box: start, kind: 'corridor_end' });
  open(x + 3, y, z, 'x');
  chamber(pick(CHAMBER_KINDS), x - 4, y, z, -1, 0);
  let at = corridor(x + 4, y, z, 1, 0, 12);
  const crossing = at && new BlockBox(at.x, y, at.z - 3, at.x + 6, y + 6, at.z + 3);
  if (crossing && fits(crossing)) {
    shell(crossing);
    pieces.push({ box: crossing, kind: 'intersection' });
    canvas.set(at.x + 1, y + 1, at.z - 2, 'chest', { facing: 'south' }, { id: 'minecraft:chest', LootTable: TRIAL_LOOT.intersection });
    canvas.set(at.x + 5, y + 1, at.z - 2, 'barrel', { facing: 'up' }, { id: 'minecraft:barrel', LootTable: TRIAL_LOOT.intersection_barrel });
    open(at.x + 3, y, at.z + 3, 'z');
    chamber(pick(CHAMBER_KINDS), at.x + 3, y, at.z + 4, 0, 1);
    at = corridor(at.x + 7, y, at.z, 1, 0, 10);
  }
  if (at) {
    // The atrium, rising to the entrance.
    const atrium = new BlockBox(at.x, y, at.z - 6, at.x + 12, y + 16, at.z + 6);
    if (fits(atrium)) {
      shell(atrium);
      pieces.push({ box: atrium, kind: 'atrium' });
      for (let s = 0; s < 10; s++) canvas.set(at.x + 1 + s, y + s, at.z, 'waxed_cut_copper_stairs', { facing: 'east', half: 'bottom' });
      const entrance = new BlockBox(at.x + 13, y + 10, at.z - 3, at.x + 19, y + 16, at.z + 3);
      if (fits(entrance)) {
        shell(entrance);
        pieces.push({ box: entrance, kind: 'entrance' });
        canvas.set(at.x + 16, y + 11, at.z + 2, 'chest', { facing: 'north' }, { id: 'minecraft:chest', LootTable: TRIAL_LOOT.entrance });
      }
    }
  }
  // Branches off the straight corridors: two to four more chambers.
  const branches = 2 + random.nextIntBound(3);
  for (let b = 0; b < branches; b++) {
    const ax = x + 6 + random.nextIntBound(10); const dz = random.nextFloat() < 0.5 ? 1 : -1;
    const end = corridor(ax, y, z + dz * 3, 0, dz, 8 + random.nextIntBound(8), 'branch');
    if (end) {
      if (!chamber(pick(CHAMBER_KINDS), end.x, y, end.z, 0, dz)) {
        canvas.set(end.x, y + 1, end.z - dz, 'chest', { facing: 'north' }, { id: 'minecraft:chest', LootTable: TRIAL_LOOT.supply });
      }
    }
  }
  return { canvas, pieces, mobs };
}

export function generateTrialChambers({ seed, chunkX, chunkZ, structureId = 'trial_chambers', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const x = chunkX * 16 + 8; const z = chunkZ * 16 + 8;
  const y = 4 + random.nextIntBound(9);
  const { canvas, pieces, mobs } = buildTrialChambers({ seed: random.nextInt(), x, y, z });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:trial_chambers', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x, z) : null,
    meta: { startY: y, mobs, kinds: pieces.map((p) => p.kind) }
  });
}

export function realizeTrialChambers(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'trial chambers: built to the wiki\'s pieces and materials' };
}
