// Clean-room igloo templates.
//
// PROVENANCE, which matters here: this repository ships no Minecraft assets, so these are NOT vanilla's
// `igloo/top`, `igloo/middle` and `igloo/bottom` files. They are independently built from the layout the
// wiki describes (a snow dome a few blocks across with a trapdoor, and, half the time, a stone-brick
// basement holding a villager and a zombie villager behind iron bars with the makings of a cure). Every
// dimension here is an approximation of the described structure, and STRUCTURE_PARITY.md records the igloo
// as `PARTIAL` for exactly this reason: it generates, deterministically and in the right biome, with the
// right contents, but its geometry is not block-for-block vanilla.
//
// The templates are BUILT BY CODE rather than typed as literal block lists. Two reasons: a 7x5x7 dome is
// ~40 blocks and a basement is ~120, so literals would be a wall of numbers nobody can review; and the
// shapes are regular enough that a loop states the intent more clearly than the data would.

/**
 * The snow dome: a 7x5x7 shell with a doorway, a hollow interior and a torch.
 *
 * Palette indices are local to each template, as they are in vanilla: index 0 is the first entry.
 */
export function buildIglooTop() {
  const size = [7, 5, 7];
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:snow_block' },
    { Name: 'minecraft:oak_trapdoor', Properties: { facing: 'north', half: 'bottom', open: 'false', powered: 'false', waterlogged: 'false' } },
    { Name: 'minecraft:torch' }
  ];
  const blocks = [];
  const set = (x, y, z, state) => { if (x >= 0 && x < 7 && y >= 0 && y < 5 && z >= 0 && z < 7) blocks.push({ pos: [x, y, z], state }); };

  // Floor.
  for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) set(x, 0, z, 1);

  // Shell: the radius shrinks with height, which is what makes it read as a dome rather than a box.
  const radiusAt = [3, 3, 2, 1, 0];
  for (let y = 1; y < 5; y++) {
    const r = radiusAt[y];
    for (let x = 3 - r; x <= 3 + r; x++) {
      for (let z = 3 - r; z <= 3 + r; z++) {
        const edge = x === 3 - r || x === 3 + r || z === 3 - r || z === 3 + r;
        set(x, y, z, edge ? 1 : 0);
      }
    }
    // An opening in the south wall at walking height, with a trapdoor above it.
    if (y <= 2) set(3, y, 0, 0);
  }
  set(3, 3, 0, 2);
  set(3, 1, 3, 3);
  return { size, palette, blocks, entities: [] };
}

/**
 * The basement: a 9x4x11 stone-brick room with an iron-bar cell, the cure ingredients, and a chest.
 *
 * Vanilla's basement is a separate pair of templates (middle + bottom) reached by a trapdoor; here the
 * room and its ceiling are one template, because the split is an artefact of how vanilla stores the files
 * and nothing in this engine needs to reproduce it.
 */
export function buildIglooBasement() {
  const size = [9, 4, 11];
  const palette = [
    { Name: 'minecraft:air' },
    { Name: 'minecraft:stone_bricks' },
    { Name: 'minecraft:cobblestone' },
    { Name: 'minecraft:iron_bars' },
    { Name: 'minecraft:chest', Properties: { facing: 'north', waterlogged: 'false' } },
    { Name: 'minecraft:brewing_stand', Properties: { has_bottle_0: 'true', has_bottle_1: 'true', has_bottle_2: 'false' } },
    { Name: 'minecraft:oak_trapdoor', Properties: { facing: 'north', half: 'top', open: 'false', powered: 'false', waterlogged: 'false' } },
    { Name: 'minecraft:red_carpet' },
    { Name: 'minecraft:ladder', Properties: { facing: 'south', waterlogged: 'false' } }
  ];
  const blocks = [];
  const set = (x, y, z, state) => { if (x >= 0 && x < 9 && y >= 0 && y < 4 && z >= 0 && z < 11) blocks.push({ pos: [x, y, z], state }); };

  for (let x = 0; x < 9; x++) {
    for (let z = 0; z < 11; z++) set(x, 0, z, 2);                    // cobblestone floor
    set(x, 3, 0, 1); set(x, 3, 10, 1); set(x, 3, 1, 1); set(x, 3, 9, 1);
  }
  for (let z = 0; z < 11; z++) {
    for (let y = 1; y <= 2; y++) {
      set(0, y, z, 1);
      set(8, y, z, 1);
      if (z <= 1 || z >= 9) { set(1, y, z, 1); set(7, y, z, 1); }
    }
    set(0, 3, z, 1);
    set(8, 3, z, 1);
  }
  // Ceiling over the whole room, with the trapdoor entrance above the middle.
  for (let x = 1; x <= 7; x++) for (let z = 2; z <= 8; z++) set(x, 3, z, 1);
  set(4, 3, 5, 6);
  for (let y = 1; y <= 3; y++) set(4, y, 6, 8);                       // ladder down to the room

  // The cell: iron bars on two sides, the rest stone, holding the zombie villager in vanilla. The
  // villager and the zombie villager are placed as entities, not blocks, so they are not in this list.
  for (let x = 1; x <= 3; x++) { set(x, 1, 7, 3); set(x, 2, 7, 3); }
  set(3, 1, 8, 3); set(3, 2, 8, 3);
  set(1, 1, 8, 1); set(2, 1, 8, 1);
  set(1, 2, 8, 1); set(2, 2, 8, 1);

  // The cure setup and the loot, with a carpet so "the third carpet from the doorway" is meaningful to a
  // future reader comparing against the wiki description.
  set(6, 1, 2, 5);
  set(5, 1, 2, 4);
  set(7, 1, 3, 7);
  return {
    size,
    palette,
    blocks,
    entities: [
      { pos: [2.5, 1, 8.5], blockPos: [2, 1, 8], nbt: { id: 'minecraft:villager', VillagerData: { profession: 'minecraft:cleric', level: 1 } } },
      { pos: [2.5, 1, 9.5], blockPos: [2, 1, 9], nbt: { id: 'minecraft:zombie_villager', VillagerData: { profession: 'minecraft:cleric', level: 1 } } }
    ]
  };
}

/** Both basement templates vanilla keeps separate, and the marker a caller can key on. */
export const IGLOO_TEMPLATES = {
  'minecraft:igloo/top': buildIglooTop,
  'minecraft:igloo/bottom': buildIglooBasement
};

/** The two entities an igloo can contain, by the id this game's mob manager uses. */
export const IGLOO_ENTITIES = ['villager', 'zombie_villager'];
