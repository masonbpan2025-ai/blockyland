// The igloo's two templates, from the wiki's blueprint (https://minecraft.wiki/w/Igloo/Structure, converted by
// scripts/generate-structure-blueprints.mjs): `igloo/top` is the drawing's layers 0 to 4 (the snow dome on the
// ground), `igloo/bottom` its layers -23 to -1 (the ladder shaft and the stone-brick basement).
//
// Both templates use the full drawing's x/z frame (7 x 10), so the two line up when placed at the same x/z with the
// same rotation: the ladder comes down exactly under the trapdoor.
//
// From the pages:
//   * igloos without a basement have "a snow block in place of the trapdoor" (95 snow blocks instead of 94);
//   * the basement's cauldron is "two-thirds full of water" (water cauldron, level 2);
//   * some stone bricks are infested (2 chiseled, 1 mossy, 6 plain: the materials table). The drawing does not mark
//     which, so they are chosen at random per igloo;
//   * a villager and a zombie villager, both clerics, are confined behind iron bars.

import { STRUCTURE_BLUEPRINTS } from '../generators/structureBlueprintData.js';
import { LegacyRandom } from '../random.js';

const BLUEPRINT = STRUCTURE_BLUEPRINTS.igloo;
const GROUND = -BLUEPRINT.minLayer; // the drawing's layer 0 (ground) as a y in the full drawing
export const IGLOO_BASEMENT_DEPTH = GROUND;
/** The infested blocks the materials table counts, by the block they disguise. */
export const IGLOO_INFESTED = { 'minecraft:chiseled_stone_bricks': ['minecraft:infested_chiseled_stone_bricks', 2], 'minecraft:mossy_stone_bricks': ['minecraft:infested_mossy_stone_bricks', 1], 'minecraft:stone_bricks': ['minecraft:infested_stone_bricks', 6] };

const cells = () => BLUEPRINT.blocks.split(';').map((r) => r.split(',').map(Number)).map(([x, y, z, p]) => ({ x, y, z, state: BLUEPRINT.palette[p] }));

function template(filter, shiftY, size, edit = (c) => c) {
  const palette = [{ Name: 'minecraft:air' }];
  const index = new Map([['minecraft:air{}', 0]]);
  const state = (s) => {
    const key = s.Name + JSON.stringify(s.Properties ?? {});
    if (!index.has(key)) { index.set(key, palette.length); palette.push(s); }
    return index.get(key);
  };
  const blocks = [];
  for (const c of cells().filter(filter)) {
    const e = edit(c);
    if (!e) continue;
    const block = { pos: [c.x, c.y - shiftY, c.z], state: state(e.state) };
    if (e.nbt) block.nbt = e.nbt;
    blocks.push(block);
  }
  return { size, palette, blocks };
}

/** The dome: layers 0-4. Without a basement the trapdoor becomes a snow block. */
export function buildIglooTop({ hasBasement = true } = {}) {
  const t = template((c) => c.y >= GROUND, GROUND, [BLUEPRINT.size[0], BLUEPRINT.size[1] - GROUND, BLUEPRINT.size[2]], (c) => (
    !hasBasement && c.state.Name === 'minecraft:oak_trapdoor' ? { state: { Name: 'minecraft:snow_block' } } : c
  ));
  return { ...t, entities: [] };
}

/** The shaft and basement: layers -23 to -1, with its infested bricks chosen from `seed`. */
export function buildIglooBasement({ seed = 0 } = {}) {
  const random = new LegacyRandom(BigInt(seed) * 6364136223846793005n + 1442695040888963407n);
  const chosen = new Set();
  const all = cells().filter((c) => c.y < GROUND);
  for (const [name, [, count]] of Object.entries(IGLOO_INFESTED)) {
    const pool = all.filter((c) => c.state.Name === name);
    for (let i = 0; i < count && pool.length; i++) chosen.add(pool.splice(random.nextIntBound(pool.length), 1)[0]);
  }
  const t = template((c) => c.y < GROUND, 0, [BLUEPRINT.size[0], GROUND, BLUEPRINT.size[2]], (c) => {
    const found = all.find((a) => a.x === c.x && a.y === c.y && a.z === c.z);
    if (chosen.has(found)) return { state: { Name: IGLOO_INFESTED[c.state.Name][0] } };
    if (c.state.Name === 'minecraft:cauldron') return { state: { Name: 'minecraft:water_cauldron', Properties: { level: '2' } } };
    if (c.state.Name === 'minecraft:chest') return { state: c.state, nbt: { id: 'minecraft:chest', LootTable: 'minecraft:chests/igloo_chest' } };
    if (c.state.Name === 'minecraft:brewing_stand') return { state: c.state, nbt: { id: 'minecraft:brewing_stand', Items: [{ Slot: 0, id: 'minecraft:splash_potion', potion: 'minecraft:weakness' }] } };
    return c;
  });
  const entities = BLUEPRINT.entities.map((e) => ({
    pos: [e.pos[0] + 0.5, e.pos[1], e.pos[2] + 0.5],
    blockPos: [e.pos[0], e.pos[1], e.pos[2]],
    nbt: { id: 'minecraft:' + e.type, VillagerData: { profession: 'minecraft:cleric', type: 'minecraft:plains' }, PersistenceRequired: 1 }
  }));
  return { ...t, entities };
}

export const IGLOO_TEMPLATES = { top: buildIglooTop, bottom: buildIglooBasement };

/** The two entities an igloo can contain, by the id this game's mob manager uses. */
export const IGLOO_ENTITIES = ['villager', 'zombie_villager'];
