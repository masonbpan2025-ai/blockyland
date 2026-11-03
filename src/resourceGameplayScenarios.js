// Item and Block Inspector scenarios for the rules a resource carries into play, added to the showcase of every
// resource they apply to (resourceShowcaseScenarios.js getScenariosForResource):
//
//   * the recipe book (recipeBook.js): which tab lists the resource, that picking up an ingredient unlocks it, and that
//     clicking it in the book fills the crafting grid so the grid makes it;
//   * beds: sleeping in the Nether or the End explodes them (power 5, with fire), as the wiki's Bed page says;
//   * the sunflower: two blocks tall, its head standing on its stalk, one sunflower from the pair;
//   * anvils: one with nothing under it falls like sand, hurts what it lands on, and may wear a stage;
//   * the beacon: its beam into the sky (beaconBeamRenderer.js) -- when it shows, what stops it, and how stained glass
//     colours it, as the wiki's Beacon page says. Drawn in the preview, to be watched.
//
// Each runs against small stand-ins (a map of voxels, an Inventory), not the inspector's preview world, so a scenario
// cannot disturb the block on show -- except the anvil's, which is there to be watched falling in the preview and
// puts the block back when it ends.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { Inventory } from './inventory.js';
import { bookEntries, recipeCells, learnFromInventory, placeRecipe, RECIPE_BOOK_TABS } from './recipeBook.js';
import { recipeIdOf } from './advancedCommands.js';
import { BedManager, BED_EXPLOSION_POWER } from './bed.js';
import { canSupportPlant } from './resourceVisualPolicy.js';
import { FallingBlocks, ANVILS } from './fallingBlocks.js';
import { BeaconBeamRenderer } from './beaconBeamRenderer.js';

const isBlockValue = (value) => typeof value === 'number';

/** The recipe book's entry for a resource, if it has a crafting recipe. */
export function bookEntryFor(entry) {
  const id = recipeIdOf({ id: entry.blockId ?? entry.id });
  return bookEntries(3).find((e) => e.id === id) ?? null;
}

export function recipeBookScenarios(entry) {
  const book = bookEntryFor(entry);
  if (!book) return [];
  const recipe = book.recipes[0];
  const cells = recipeCells(recipe);
  const first = cells[0];
  const tab = RECIPE_BOOK_TABS.find((t) => t.id === book.tab)?.label ?? book.tab;
  return [
    {
      id: 'recipe-book-tab-01',
      label: `RECIPE-BOOK-01: In the recipe book's ${tab} tab, and in All`,
      duration: 0.4,
      verify: () => RECIPE_BOOK_TABS.some((t) => t.id === book.tab) && bookEntries(3).includes(book)
    },
    {
      id: 'recipe-book-unlock-01',
      label: 'RECIPE-BOOK-02: Picking up one of its ingredients unlocks it',
      duration: 0.4,
      verify() {
        const inv = new Inventory({ playClick() {} });
        const player = {};
        inv.addItem(first.value, isBlockValue(first.value), 1);
        learnFromInventory(player, inv);
        return player.knownRecipes.has(book.id);
      }
    },
    {
      id: 'recipe-book-fill-01',
      label: 'RECIPE-BOOK-03: Clicking it in the book fills the grid, and the grid makes it',
      duration: 0.6,
      verify() {
        const inv = new Inventory({ playClick() {} });
        for (const cell of cells) inv.addItem(cell.value, isBlockValue(cell.value), 1);
        const placed = placeRecipe(inv, book, { size: 3 });
        return placed?.placed === 1 && recipeIdOf(inv.craft3x3Result ?? {}) === book.id;
      }
    }
  ];
}

/** A bed used in a dimension, in a small world of netherrack: what happened. */
export function useBedIn(dimension, colour = 'red') {
  const voxels = new Map();
  const key = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  const world = {
    getVoxel: (x, y, z) => voxels.get(key(x, y, z)) ?? (y < 0 ? BLOCKS.NETHERRACK : BLOCKS.AIR),
    setVoxel: (x, y, z, id) => { voxels.set(key(x, y, z), id); },
    getChunk: () => null
  };
  const player = { position: new THREE.Vector3(0.5, 0, 3.5), velocity: new THREE.Vector3(), gamemode: 'survival', health: 20, spawnPosition: new THREE.Vector3(), takeDamage(n) { this.health -= n; } };
  const game = { world, player, currentDimension: dimension, difficulty: 'normal', worldTime: 18000, entities: { spawnExplosion() {} }, mobs: { mobs: [] }, ui: { addChatMessage() {} } };
  const beds = new BedManager(game);
  beds.placeBed(world, [0, 0, 0], 0, colour);
  const result = beds.interact(0, 0, 0, player);
  let fire = 0;
  for (const id of voxels.values()) if (id === BLOCKS.FIRE) fire++;
  return { result, explosion: beds.lastExplosion ?? null, fire, health: player.health, bedLeft: world.getVoxel(0, 0, 0) };
}

export function bedScenarios(entry) {
  const def = BLOCK_DEFS[entry.blockId];
  const id = String(entry.id ?? '');
  if (!def?.bed && !/_bed$/.test(id)) return [];
  const colour = def?.bedColour ?? id.replace(/_bed$/, '') ?? 'red';
  return ['nether', 'the_end'].map((dimension) => ({
    id: `bed-explodes-${dimension}`,
    label: `BED-EXPLODE-01: Sleeping in ${dimension === 'nether' ? 'the Nether' : 'the End'} explodes it (power ${BED_EXPLOSION_POWER}, with fire)`,
    duration: 0.6,
    verify() {
      const r = useBedIn(dimension, colour);
      this.detail = `power ${r.explosion?.power}, ${r.explosion?.broken ?? 0} blocks broken, ${r.fire} fires, player at ${r.health} health`;
      return r.result?.exploded === true && r.explosion?.power === BED_EXPLOSION_POWER && r.fire > 0 && r.bedLeft !== BLOCK_DEFS[r.bedLeft]?.bed;
    }
  }));
}

export function sunflowerScenarios(entry) {
  if (entry.blockId !== BLOCKS.SUNFLOWER && entry.blockId !== BLOCKS.SUNFLOWER_STALK && entry.id !== 'sunflower') return [];
  return [
    {
      id: 'sunflower-tall-01',
      label: 'SUNFLOWER-01: Two blocks tall: the flower head stands on its stalk',
      duration: 0.4,
      verify: () => canSupportPlant(BLOCKS.SUNFLOWER_STALK, BLOCKS.SUNFLOWER) && BLOCK_DEFS[BLOCKS.SUNFLOWER_STALK]?.lowerHalfOf === BLOCKS.SUNFLOWER
    },
    {
      id: 'sunflower-drop-01',
      label: 'SUNFLOWER-02: Either half drops the one sunflower (the other half goes without a drop)',
      duration: 0.4,
      verify: () => BLOCK_DEFS[BLOCKS.SUNFLOWER]?.drop === BLOCKS.SUNFLOWER && BLOCK_DEFS[BLOCKS.SUNFLOWER_STALK]?.drop === BLOCKS.SUNFLOWER
    }
  ];
}

/**
 * An anvil dropped in the inspection world: it is put `height` blocks above the block on show's spot, with a
 * cobblestone under the spot, and the game's own falling blocks (fallingBlocks.js) take it from there. Its falling
 * form is drawn in a group placed as the inspector places the world's mesh, so the two line up.
 */
export function dropAnvil(session, id, { height = 3, roll = 0.99, player = null, textures = null } = {}) {
  const layer = new THREE.Group();
  layer.position.set(-8.5, -2, -8.5);
  session.game.scene.add(layer);
  const falling = new FallingBlocks(session.world);
  falling.attach({ scene: layer, textures, entities: session.game.entities, player });
  // The wear roll: 0.99 never wears it, a low roll always does.
  falling.random = () => roll;
  session.reset(id);
  session.world.setVoxel(8, 2, 8, BLOCKS.AIR);
  session.world.setVoxel(8, 1, 8, BLOCKS.COBBLESTONE);
  session.world.setVoxel(8, 2 + height, 8, id);
  falling.notify(8, 2 + height, 8);
  return {
    falling, from: 2 + height,
    update: (dt) => falling.update(dt),
    dispose() {
      for (const mesh of falling.drawn.values()) mesh.dispose();
      layer.removeFromParent();
    }
  };
}

const ANVIL_CAMERA = { position: [3.2, 3, 5.2], target: [0, 2, 0] };

export function anvilScenarios(entry, session, textures) {
  const id = entry.blockId;
  if (!ANVILS.includes(id) || !session?.world) return [];
  const worn = ANVILS[ANVILS.indexOf(id) + 1] ?? BLOCKS.AIR;
  const name = (block) => BLOCK_DEFS[block]?.name ?? 'nothing';
  let drop = null;
  const step = (fields, options, verify) => ({
    duration: 2.2, camera: ANVIL_CAMERA,
    enter() { drop = dropAnvil(session, id, { textures, ...options() }); },
    update: (dt) => drop.update(dt),
    verify() {
      const ok = verify();
      this.detail = `left y ${drop.from}: ${name(session.world.getVoxel(8, drop.from, 8))}, landed: ${name(session.world.getVoxel(8, 2, 8))}`;
      return ok;
    },
    exit() { drop.dispose(); session.reset(id); },
    ...fields
  });
  const fellAndLanded = (as) => session.world.getVoxel(8, drop.from, 8) === BLOCKS.AIR && session.world.getVoxel(8, 2, 8) === as;
  let player = null;
  return [
    step({ id: 'anvil-fall-01', label: 'ANVIL-FALL-01: Placed with nothing under it, it falls like sand and lands on the block below' },
      () => ({}), () => fellAndLanded(id) && drop.falling.entities.length === 0),
    step({ id: 'anvil-fall-02', label: 'ANVIL-FALL-02: Falling 3 blocks onto a player deals 4 damage (2 per block after the first)' },
      () => {
        player = { position: { x: 8.5, y: 2, z: 8.5 }, height: 1.8, hurt: 0, takeDamage(n) { this.hurt += n; } };
        return { player };
      },
      () => player.hurt === 4 && fellAndLanded(id)),
    step({ id: 'anvil-fall-03', label: `ANVIL-FALL-03: A fall may wear it a stage (5% per block fallen): it lands as ${worn === BLOCKS.AIR ? 'nothing -- a damaged anvil breaks' : name(worn)}` },
      () => ({ roll: 0 }), () => fellAndLanded(worn))
  ];
}

/**
 * A beacon in the inspection world, on a 3x3 pyramid of iron blocks (level 1) unless `pyramid` is false, with
 * `above` set into the column over it ({ dy: block }). Its beam is drawn in a group placed as the inspector places the
 * world's mesh, so the two line up.
 */
export function showBeacon(session, { pyramid = true, above = {} } = {}) {
  session.reset(BLOCKS.BEACON);
  for (let x = 7; x <= 9; x++) for (let z = 7; z <= 9; z++) session.world.setVoxel(x, 1, z, pyramid ? BLOCKS.IRON_BLOCK : BLOCKS.COBBLESTONE);
  for (const [dy, id] of Object.entries(above)) session.world.setVoxel(8, 2 + Number(dy), 8, id);
  const layer = new THREE.Group();
  layer.position.set(-8.5, -2, -8.5);
  session.game.scene.add(layer);
  const beams = new BeaconBeamRenderer(layer), beacons = [{ x: 8, y: 2, z: 8 }];
  const refresh = (dt = 0) => beams.update(dt, session.world, beacons, { force: dt === 0 });
  refresh();
  return { beams, update: refresh, refresh, dispose() { beams.dispose(); layer.removeFromParent(); } };
}

/** Far enough back to see the pyramid, the beacon and the beam rising from it, with the glass over it. */
const BEAM_CAMERA = { position: [7, 3, 11], target: [0, 4.5, 0] };

export function beaconScenarios(entry, session) {
  if (entry.blockId !== BLOCKS.BEACON || !session?.world) return [];
  let shown = null;
  const hex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
  const describe = () => {
    const beam = shown.beams.drawn[0];
    return beam ? beam.segments.map((s) => `${hex(s.color)} from y ${s.from}${s.to - s.from > 100 ? ' up' : ` to ${s.to}`}`).join(', ') : 'no beam';
  };
  const step = (fields, setup, verify) => ({
    duration: 2.4, camera: BEAM_CAMERA,
    enter() { shown = showBeacon(session, setup); },
    update: (dt) => shown.update(dt),
    verify() { shown.refresh(); this.detail = describe(); return verify(shown.beams.drawn); },
    exit() { shown.dispose(); session.reset(BLOCKS.BEACON); },
    ...fields,
  });
  const WHITE = [255, 255, 255], RED = [0xb0, 0x2e, 0x26], BLUE = [0x3c, 0x44, 0xa0];
  const same = (a, b) => a.every((c, i) => Math.abs(c - b[i]) < 0.51);
  const one = (drawn) => drawn.length === 1 ? drawn[0].segments : null;
  return [
    step({ id: 'beacon-beam-01', label: 'BEACON-BEAM-01: On a level-1 pyramid (3x3 iron) under open sky, a white beam rises straight up, 2048 blocks from the beacon' },
      {}, (drawn) => { const s = one(drawn); return !!s && s.length === 1 && s[0].from === 2 && s[0].to === 2 + 2048 && same(s[0].color, WHITE); }),
    step({ id: 'beacon-beam-02', label: 'BEACON-BEAM-02: With no pyramid under it, there is no beam' },
      { pyramid: false }, (drawn) => drawn.length === 0),
    step({ id: 'beacon-beam-03', label: 'BEACON-BEAM-03: A fully opaque block above it (stone, 4 up) stops the beam' },
      { above: { 4: BLOCKS.STONE } }, (drawn) => drawn.length === 0),
    step({ id: 'beacon-beam-04', label: 'BEACON-BEAM-04: Bedrock does not stop it, so a beacon works under the Nether ceiling' },
      { above: { 4: BLOCKS.BEDROCK } }, (drawn) => !!one(drawn)),
    step({ id: 'beacon-beam-05', label: 'BEACON-BEAM-05: Glass and leaves let it through, untinted' },
      { above: { 2: BLOCKS.GLASS, 4: BLOCKS.OAK_LEAVES } }, (drawn) => { const s = one(drawn); return !!s && s.length === 1 && same(s[0].color, WHITE); }),
    step({ id: 'beacon-beam-06', label: 'BEACON-BEAM-06: Red stained glass 3 up turns it red (the red dye, #b02e26) from that block on' },
      { above: { 3: BLOCKS.RED_STAINED_GLASS } }, (drawn) => { const s = one(drawn); return !!s && s.length === 2 && s[1].from === 5 && same(s[0].color, WHITE) && same(s[1].color, RED); }),
    step({ id: 'beacon-beam-07', label: 'BEACON-BEAM-07: Blue glass over the red averages the two: purple (#763963) from the blue on' },
      { above: { 3: BLOCKS.RED_STAINED_GLASS, 6: BLOCKS.BLUE_STAINED_GLASS } },
      (drawn) => { const s = one(drawn); return !!s && s.length === 3 && s[2].from === 8 && same(s[2].color, RED.map((c, i) => (c + BLUE[i]) / 2)); }),
  ];
}

/** Every gameplay scenario above that applies to a resource. */
export function gameplayScenarios(entry, session = null, textures = null) {
  if (!entry) return [];
  return [...recipeBookScenarios(entry), ...bedScenarios(entry), ...sunflowerScenarios(entry), ...anvilScenarios(entry, session, textures), ...beaconScenarios(entry, session)];
}
