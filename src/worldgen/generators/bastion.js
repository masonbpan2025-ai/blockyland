// Bastion remnants, from the wiki (https://minecraft.wiki/w/Bastion_Remnant and /Structure).
//
// From the page:
//   * "generate in all Nether biomes except basalt deltas" (a fortress takes the spot there); the `nether_complexes`
//     regions, bastion 3 : fortress 2;
//   * four types: the bridge ("a large ruined rampart structure with a piglin face carved into it. The inside of the
//     'mouth' consists of multiple levels of walkways surrounded by lava. A damaged bridge goes out from the mouth,
//     with a support pillar on the far side"), the hoglin stables ("a three-part rampart with damaged hoglin stables
//     on either side"), the housing units ("multiple ruined two-part ramparts arranged around a central courtyard
//     with nether wart growing in the middle"), the treasure room ("a large rampart supported by buttresses ... many
//     bridges suspended above a lava floor. At the bottom ... a magma cube monster spawner, and a center loot area
//     consisting of blocks of gold, as well as 1 or 2 treasure chests. Additional chests ... use the 'generic' loot");
//   * "when over the lava sea, they do not generate pillars ... but float above, entirely even";
//   * mobs at generation: "a 10% chance of spawning a piglin brute, a 40% chance of spawning a piglin with a golden
//     sword, a 40% of spawning a piglin with a crossbow, and a 10% chance of not spawning at all"; hoglins in the
//     stables; none of them despawn;
//   * loot: bridge, generic, hoglin stable and treasure tables; the Blocks list.
//
// The wiki draws only some of the bridge type's hundreds of templates, without how they join, so every type here is
// built to its description from the Blocks list: ours are the layouts, sizes, the odds of each type (equal), how
// ruined the walls are (12% of rampart blocks missing), and the height (the floor at y 26-30 in this 64-tall
// Nether).

import { LegacyRandom, legacyFromLargeFeatureSeed } from '../random.js';
import { CellCanvas, cellStart, realizeCells } from '../cellStructure.js';
import { BlockBox } from '../geometry.js';

export const BASTION_TYPES = ['bridge', 'hoglin_stable', 'housing', 'treasure'];
export const BASTION_LOOT = {
  bridge: 'minecraft:chests/bastion_bridge', generic: 'minecraft:chests/bastion_other',
  hoglin_stable: 'minecraft:chests/bastion_hoglin_stable', treasure: 'minecraft:chests/bastion_treasure'
};
export const BASTION_Y_RANGE = [26, 30];
export const RUIN_SHARE = 0.12;
export const PIGLIN_ODDS = { brute: 0.1, sword: 0.4, crossbow: 0.4, none: 0.1 };
const SIZE = 44;

export function buildBastion({ seed, type, x, y, z }) {
  const random = new LegacyRandom(BigInt(seed));
  const c = new CellCanvas();
  const pieces = [];
  const brick = () => { const r = random.nextFloat(); return r < 0.6 ? 'polished_blackstone_bricks' : r < 0.8 ? 'cracked_polished_blackstone_bricks' : r < 0.95 ? 'blackstone' : 'gilded_blackstone'; };
  const ruined = () => random.nextFloat() < RUIN_SHARE;
  const put = (bx, by, bz, name, props, nbt) => c.set(x + bx, y + by, z + bz, name, props, nbt);
  /** A rampart: a solid wall block run from (x0,z0) to (x1,z1), `h` tall and `t` thick, with a walkway on top. */
  const rampart = (x0, z0, x1, z1, h, kind = 'rampart') => {
    pieces.push({ box: new BlockBox(x + Math.min(x0, x1), y, z + Math.min(z0, z1), x + Math.max(x0, x1), y + h, z + Math.max(z0, z1)), kind });
    for (let bx = Math.min(x0, x1); bx <= Math.max(x0, x1); bx++) for (let bz = Math.min(z0, z1); bz <= Math.max(z0, z1); bz++) {
      for (let by = 0; by < h; by++) if (!ruined() || by < 2) put(bx, by, bz, (by % 6 === 5) ? 'basalt' : brick(), (by % 6 === 5) ? { axis: 'y' } : null);
      put(bx, h, bz, random.nextFloat() < 0.3 ? 'blackstone_slab' : 'polished_blackstone_bricks', random.nextFloat() < 0.3 ? { type: 'bottom' } : null);
    }
  };
  const gold = (n, area) => { for (let i = 0; i < n; i++) { const [bx, by, bz] = area(); put(bx, by, bz, 'gold_block'); } };
  const chest = (bx, by, bz, loot, facing = 'north') => put(bx, by, bz, 'chest', { facing }, { id: 'minecraft:chest', LootTable: loot });
  const taken = new Set();
  const piglin = (bx, by, bz) => {
    const r = random.nextFloat();
    // One mob to a block.
    if (taken.has(`${bx},${by},${bz}`)) return;
    taken.add(`${bx},${by},${bz}`);
    if (r < PIGLIN_ODDS.brute) c.entities.push({ type: 'piglin_brute', x: x + bx + 0.5, y: y + by, z: z + bz + 0.5 });
    else if (r < PIGLIN_ODDS.brute + PIGLIN_ODDS.sword) c.entities.push({ type: 'piglin', x: x + bx + 0.5, y: y + by, z: z + bz + 0.5, options: { weapon: 'golden_sword' } });
    else if (r < 0.9) c.entities.push({ type: 'piglin', x: x + bx + 0.5, y: y + by, z: z + bz + 0.5, options: { weapon: 'crossbow' } });
  };
  const floor = (x0, z0, x1, z1, by, name = 'polished_blackstone_bricks') => { for (let bx = x0; bx <= x1; bx++) for (let bz = z0; bz <= z1; bz++) put(bx, by, bz, name); };
  const lantern = (bx, by, bz) => { put(bx, by + 1, bz, 'chain', { axis: 'y' }); put(bx, by, bz, 'lantern', { hanging: 'true' }); };

  if (type === 'housing') {
    // Two-part ramparts round a courtyard; nether wart in its middle.
    for (const [x0, z0, x1, z1] of [[0, 0, SIZE - 1, 3], [0, SIZE - 4, SIZE - 1, SIZE - 1], [0, 4, 3, SIZE - 5], [SIZE - 4, 4, SIZE - 1, SIZE - 5]]) rampart(x0, z0, x1, z1, 14);
    floor(4, 4, SIZE - 5, SIZE - 5, 0, 'blackstone');
    const mid = SIZE / 2;
    for (let bx = mid - 3; bx <= mid + 3; bx++) for (let bz = mid - 3; bz <= mid + 3; bz++) {
      const edge = Math.abs(bx - mid) === 3 || Math.abs(bz - mid) === 3;
      put(bx, 0, bz, edge ? 'polished_blackstone_bricks' : 'soul_sand');
      if (!edge) put(bx, 1, bz, 'nether_wart', { age: String(random.nextIntBound(4)) });
    }
    pieces.push({ box: new BlockBox(x + mid - 3, y, z + mid - 3, x + mid + 3, y + 1, z + mid + 3), kind: 'courtyard' });
    // The units: two-storey rooms against the walls, a generic chest in each.
    for (const [ux, uz] of [[5, 5], [SIZE - 13, 5], [5, SIZE - 13], [SIZE - 13, SIZE - 13]]) {
      for (let bx = ux; bx < ux + 8; bx++) for (let bz = uz; bz < uz + 8; bz++) for (let by = 0; by <= 8; by++) {
        const edge = bx === ux || bx === ux + 7 || bz === uz || bz === uz + 7;
        if (by === 0 || by === 4 || by === 8 || (edge && !ruined())) put(bx, by, bz, by === 4 ? 'polished_blackstone_bricks' : brick());
        else if (!edge) put(bx, by, bz, 'air');
      }
      for (let by = 1; by <= 2; by++) put(ux + 3, by, uz, 'air');
      chest(ux + 2, 1, uz + 2, BASTION_LOOT.generic);
      piglin(ux + 4, 1, uz + 4); piglin(ux + 4, 5, uz + 4);
      pieces.push({ box: new BlockBox(x + ux, y, z + uz, x + ux + 7, y + 8, z + uz + 7), kind: 'unit' });
    }
    gold(4, () => [4 + random.nextIntBound(SIZE - 8), 1, 4 + random.nextIntBound(SIZE - 8)]);
    for (let i = 0; i < 4; i++) piglin(8 + random.nextIntBound(SIZE - 16), 1, 8 + random.nextIntBound(SIZE - 16));
  } else if (type === 'hoglin_stable') {
    // A three-part rampart down the middle, stables either side.
    const mid = SIZE / 2;
    for (let part = 0; part < 3; part++) rampart(mid - 3, part * 15, mid + 2, part * 15 + 12, 16);
    for (const side of [-1, 1]) {
      const sx = side < 0 ? 2 : mid + 6;
      floor(sx, 2, sx + 14, SIZE - 3, 0, 'blackstone');
      for (let pen = 0; pen < 3; pen++) {
        const z0 = 3 + pen * 13;
        for (let bx = sx; bx <= sx + 12; bx++) for (let bz = z0; bz <= z0 + 10; bz++) {
          const edge = bx === sx || bx === sx + 12 || bz === z0 || bz === z0 + 10;
          if (edge && !ruined()) { put(bx, 1, bz, 'blackstone_wall'); if (random.nextFloat() < 0.6) put(bx, 2, bz, 'blackstone_wall'); }
          if (!edge) put(bx, 1, bz, 'air');
        }
        for (let n = 0; n < 2 + random.nextIntBound(3); n++) {
          const hx = sx + 3 + random.nextIntBound(7); const hz = z0 + 3 + random.nextIntBound(5);
          if (taken.has(`${hx},1,${hz}`)) continue;
          taken.add(`${hx},1,${hz}`);
          c.entities.push({ type: 'hoglin', x: x + hx + 0.5, y: y + 1, z: z + hz + 0.5 });
        }
        if (random.nextFloat() < 0.6) chest(sx + 1, 1, z0 + 1, BASTION_LOOT.hoglin_stable);
        pieces.push({ box: new BlockBox(x + sx, y, z + z0, x + sx + 12, y + 2, z + z0 + 10), kind: 'stable' });
      }
    }
    gold(3, () => [mid - 2 + random.nextIntBound(4), 17, random.nextIntBound(SIZE - 4)]);
    for (let i = 0; i < 5; i++) piglin(mid - 1 + random.nextIntBound(3), 17, 2 + random.nextIntBound(SIZE - 6));
  } else if (type === 'treasure') {
    // A rampart on buttresses round a pit with a lava floor; bridges across; the centre's gold and chests.
    const H = 22;
    for (const [x0, z0, x1, z1] of [[0, 0, SIZE - 1, 3], [0, SIZE - 4, SIZE - 1, SIZE - 1], [0, 4, 3, SIZE - 5], [SIZE - 4, 4, SIZE - 1, SIZE - 5]]) rampart(x0, z0, x1, z1, H);
    for (const [bx, bz] of [[-2, 10], [-2, SIZE - 11], [SIZE + 1, 10], [SIZE + 1, SIZE - 11]]) for (let by = 0; by < H - 4; by++) for (let d = 0; d < 2; d++) put(bx + (bx < 0 ? d : -d), by, bz, brick());
    floor(4, 4, SIZE - 5, SIZE - 5, 0, 'magma_block');
    floor(4, 4, SIZE - 5, SIZE - 5, 1, 'lava');
    const mid = SIZE / 2;
    floor(mid - 4, mid - 4, mid + 3, mid + 3, 1, 'polished_blackstone_bricks');
    floor(mid - 4, mid - 4, mid + 3, mid + 3, 2, 'air');
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(Math.round(mid + Math.cos(a) * 3) - 1, 2, Math.round(mid + Math.sin(a) * 3) - 1, 'gold_block'); }
    const treasures = 1 + random.nextIntBound(2);
    for (let i = 0; i < treasures; i++) chest(mid - 1 + i, 2, mid - 1, BASTION_LOOT.treasure, 'south');
    pieces.push({ box: new BlockBox(x + mid - 4, y + 1, z + mid - 4, x + mid + 3, y + 3, z + mid + 3), kind: 'treasure_centre' });
    // Bridges suspended across the pit; under one, "a magma cube monster spawner hanging from an iron chain".
    for (const [level, along] of [[8, 'x'], [14, 'z']]) {
      for (let a = 4; a < SIZE - 4; a++) for (let w = -1; w <= 1; w++) {
        const [bx, bz] = along === 'x' ? [a, mid + w] : [mid + w, a];
        if (!ruined()) put(bx, level, bz, w === 0 ? 'polished_blackstone_bricks' : 'blackstone_slab', w === 0 ? null : { type: 'bottom' });
      }
      piglin(along === 'x' ? 10 : mid, level + 1, along === 'x' ? mid : 10);
    }
    put(mid + 6, 8, mid, 'polished_blackstone_bricks');
    put(mid + 6, 7, mid, 'chain', { axis: 'y' });
    put(mid + 6, 6, mid, 'spawner', null, { id: 'minecraft:mob_spawner', SpawnData: { entity: { id: 'minecraft:magma_cube' } } });
    chest(mid - 8, 9, mid, BASTION_LOOT.generic);
    chest(mid, 15, mid - 8, BASTION_LOOT.generic);
    gold(6, () => [1 + random.nextIntBound(2), H + 1, 4 + random.nextIntBound(SIZE - 8)]);
  } else {
    // The bridge: a rampart wall with a piglin face; inside its mouth, walkways in lava; a damaged double-deck bridge
    // out from the mouth with a support pillar at its far end.
    const H = 24;
    rampart(0, 0, SIZE - 1, 6, H, 'face_rampart');
    // The face: two eyes and a wide mouth through the wall.
    const mid = SIZE / 2;
    for (const ex of [mid - 8, mid + 5]) for (let bx = ex; bx < ex + 4; bx++) for (let by = 15; by < 19; by++) for (let bz = 0; bz < 7; bz++) put(bx, by, bz, 'air');
    for (let bx = mid - 7; bx <= mid + 6; bx++) for (let by = 2; by < 10; by++) for (let bz = 0; bz < 7; bz++) put(bx, by, bz, 'air');
    for (const tx of [mid - 7, mid - 3, mid + 1, mid + 5]) for (let by = 8; by < 10; by++) put(tx, by, 0, 'polished_blackstone_bricks'); // teeth
    // Inside the mouth: lava with walkways at three levels.
    floor(mid - 7, 1, mid + 6, 6, 1, 'lava');
    for (const [lvl, z0] of [[2, 1], [4, 3], [6, 5]]) for (let bx = mid - 6; bx <= mid + 5; bx++) put(bx, lvl, z0, 'polished_blackstone_bricks');
    chest(mid - 5, 3, 1, BASTION_LOOT.bridge, 'south');
    // The bridge: two decks, 5 wide, 30 long, ruined in places; 16 gold blocks along it.
    for (let bz = 7; bz < 37; bz++) for (let bx = mid - 2; bx <= mid + 2; bx++) {
      if (!ruined()) put(bx, 3, bz, bx === mid - 2 || bx === mid + 2 ? 'polished_blackstone_brick_stairs' : 'polished_blackstone_bricks', bx === mid - 2 || bx === mid + 2 ? { facing: bx < mid ? 'east' : 'west', half: 'bottom' } : null);
      if (!ruined()) put(bx, 8, bz, 'polished_blackstone_bricks');
    }
    pieces.push({ box: new BlockBox(x + mid - 2, y + 3, z + 7, x + mid + 2, y + 8, z + 36), kind: 'bridge' });
    for (let by = -6; by <= 8; by++) for (let bx = mid - 2; bx <= mid + 2; bx++) for (let bz = 34; bz <= 36; bz++) if (by <= 2 || bx === mid - 2 || bx === mid + 2) put(bx, by, bz, brick());
    pieces.push({ box: new BlockBox(x + mid - 2, y - 6, z + 34, x + mid + 2, y + 8, z + 36), kind: 'leg' });
    for (let i = 0; i < 16; i++) put(mid - 2 + (i % 2 ? 4 : 0), 9, 9 + i * 1.5 | 0, 'gold_block');
    for (let i = 0; i < 4; i++) put(mid, 9, 10 + i * 6, 'quartz_block');
    lantern(mid, 7, 12); lantern(mid, 7, 24);
    chest(mid + 1, 9, 30, BASTION_LOOT.bridge, 'north');
    for (let i = 0; i < 4; i++) piglin(mid - 1 + random.nextIntBound(3), 9, 10 + random.nextIntBound(20));
    for (let i = 0; i < 3; i++) piglin(mid - 5 + random.nextIntBound(10), 7, 3);
  }
  // Glowstone and fire in a few spots: the Blocks list's light.
  for (let i = 0; i < 3; i++) put(5 + random.nextIntBound(SIZE - 10), 0, 5 + random.nextIntBound(SIZE - 10), 'glowstone');
  return { canvas: c, pieces };
}

export function generateBastion({ seed, chunkX, chunkZ, structureId = 'bastion_remnant', context }) {
  const random = legacyFromLargeFeatureSeed(seed, chunkX, chunkZ);
  const type = BASTION_TYPES[random.nextIntBound(4)];
  const [lo, hi] = BASTION_Y_RANGE;
  const y = lo + random.nextIntBound(hi - lo + 1);
  const x = chunkX * 16 - 14; const z = chunkZ * 16 - 14;
  const { canvas, pieces } = buildBastion({ seed: random.nextInt(), type, x, y, z });
  return cellStart({
    structureId, chunkX, chunkZ, seed, id: 'minecraft:bastion_remnant', pieces, canvas,
    biome: context.biomeAt ? context.biomeAt(x + SIZE / 2, z + SIZE / 2) : null,
    meta: { type, y, floats: true }
  });
}

export function realizeBastion(start, setBlock, blockIds, options = {}) {
  return { ...realizeCells(start, setBlock, blockIds, options), note: 'bastion remnant: the four types built to the wiki\'s descriptions; floats by design' };
}
