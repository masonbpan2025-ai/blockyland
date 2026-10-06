// Variant-aware spawning through the generic dispatcher.
//
// `spawnMob(type, x, y, z)` accepted only four parameters and forwarded `spawnX(x, y, z)` to every
// handler, so a fifth `options` argument was silently dropped. Every variant-aware spawner therefore
// could not be given a variant through the generic entry point: a snow fox spawned as a red fox, a
// brown panda as black and white, and a lime-collared wolf as a red-collared one.
//
// Separately, two mobs never applied their variant to the model at all even when the variant was set.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { PANDA_COLORS, applyPandaColors, isPanda } from '../src/pandaBehavior.js';
import { WOLF_DEFAULT_COLLAR } from '../src/wolfBehavior.js';
import { SHEEP_COLOR_HEX } from '../src/sheepBehavior.js';
import { FOX_COAT_COLORS, FOX_PREY } from '../src/foxBehavior.js';

function fixture() {
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, { get: () => () => {} });
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0,
    surfaceHeightAt: () => 1,
    getLightLevel: () => 15,
    setVoxel() {}
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
    entities: { spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {} },
    game: { player: null, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' }, ui: null }
  });
  return { manager };
}

/** Every colour in the model, including meshes hidden until tamed such as a wolf collar. */
function modelColors(mob) {
  const colors = new Set();
  mob.mesh?.traverse?.((obj) => {
    if (obj.isMesh && obj.material?.color) colors.add(obj.material.color.getHexString());
  });
  return [...colors].sort().join(',');
}

/**
 * Everything that makes a mob look different: its materials' colours AND the skins they are bound to.
 *
 * A variant can express itself either way. The mooshroom switches between two vanilla textures instead of tinting
 * its model, so a colour-only comparison reports two genuinely different mobs as identical.
 */
function modelAppearance(mob) {
  const parts = [];
  mob.mesh?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    for (const material of (Array.isArray(obj.material) ? obj.material : [obj.material])) {
      if (!material) continue;
      parts.push((material.color?.getHexString?.() ?? '-') + '@' + (material.map?.assetPath ?? 'nomap'));
    }
  });
  return [...new Set(parts)].sort().join(',');
}

/**
 * Each mob that carries a variant, with two option sets that must render differently.
 *
 * A mob is only included if its variant is *visible*, so a colour-differing pair is the assertion.
 */
const VARIANT_CASES = [
  { type: 'fox', key: 'coat', a: { coat: 'red' }, b: { coat: 'snow' } },
  { type: 'wolf', key: 'collarColor', a: { collarColor: 'red' }, b: { collarColor: 'lime' } },
  { type: 'panda', key: 'personality', a: { mainGene: 'normal', hiddenGene: 'normal' }, b: { mainGene: 'brown', hiddenGene: 'brown' } },
  { type: 'sheep', key: 'woolColor', a: { woolColor: 'white' }, b: { woolColor: 'black' } },
  { type: 'mooshroom', key: 'variant', a: { variant: 'red' }, b: { variant: 'brown' } },
  { type: 'rabbit', key: 'coat', a: { coat: 'brown' }, b: { coat: 'gold' } },
  { type: 'parrot', key: 'variant', a: { variant: 0 }, b: { variant: 4 } }
];

test('spawnMob forwards options, so a variant reaches the model', () => {
  const { manager } = fixture();
  for (const entry of VARIANT_CASES) {
    const first = manager.spawnMob(entry.type, 0, 1, 0, entry.a);
    // `spawnMob(type, x, y, z, options)`. This read `spawnMob(2, 1, 0, entry.b)`, passing 2 as the TYPE --
    // it only ever passed because the dispatcher substituted a villager for the unknown type `2`, which is
    // the silent fallback that was removed. The assertion below then compared two villagers' colours.
    const second = manager.spawnMob(entry.type, 2, 1, 0, entry.b);
    assert.ok(first, `${entry.type} a spawned`);
    assert.ok(second, `${entry.type} b spawned`);
    // A variant may differ by COLOUR or by SKIN. Both are legitimate: the mooshroom switches between two vanilla
    // textures rather than tinting the model, so comparing colours alone would call a real difference invisible.
    assert.notEqual(modelAppearance(first), modelAppearance(second),
      `${entry.type}: ${entry.key} must change the rendered model`);
  }
});

test('the requested variant is recorded on the mob, not only rendered', () => {
  const { manager } = fixture();
  assert.equal(manager.spawnMob('fox', 0, 1, 0, { coat: 'snow' }).coat, 'snow');
  assert.equal(manager.spawnMob('wolf', 0, 1, 0, { collarColor: 'lime' }).collarColor, 'lime');
  assert.equal(manager.spawnMob('panda', 0, 1, 0, { mainGene: 'brown', hiddenGene: 'brown' }).personality, 'brown');
  assert.equal(manager.spawnMob('sheep', 0, 1, 0, { woolColor: 'black' }).woolColor, 'black');
  assert.equal(manager.spawnMob('mooshroom', 0, 1, 0, { variant: 'brown' }).variant, 'brown');
  assert.equal(manager.spawnMob('rabbit', 0, 1, 0, { coat: 'gold' }).coat, 'gold');
  assert.equal(manager.spawnMob('parrot', 0, 1, 0, { variant: 4 }).variant, 4);
});

test('spawning without options still works for every case', () => {
  // The new fifth parameter must not have disturbed the ordinary three-argument call.
  const { manager } = fixture();
  for (const entry of VARIANT_CASES) {
    const mob = manager.spawnMob(entry.type, 0, 1, 0);
    assert.ok(mob, `${entry.type} spawned with no options`);
    assert.equal(mob.type, entry.type);
    assert.ok(modelColors(mob).length > 0, `${entry.type} has a coloured model`);
  }
});

test('handlers with a positional argument keep their default', () => {
  // `spawnSlime(x,y,z,size=4)` and `spawnCat(x,y,z,breed=null)` take a POSITIONAL value with a default,
  // not an options bag. Forwarding an options object there turned the slime size into `{}`.
  const { manager } = fixture();
  const slime = manager.spawnMob('slime', 0, 1, 0);
  assert.equal(slime.slimeSize, 4, 'wiki: a slime spawns at size 4 by default');
  assert.equal(typeof slime.health, 'number', 'and its health is a number, not NaN');
  const cat = manager.spawnMob('cat', 0, 1, 0);
  assert.equal(cat.type, 'cat');
  const villager = manager.spawnMob('villager', 0, 1, 0);
  assert.equal(villager.type, 'villager');
});

test('a panda gets the palette for its personality', () => {
  // Wiki: a brown panda is brown and white instead of black and white. The other six personalities
  // share the normal palette, so brown is the ONLY one that recolours the model.
  const { manager } = fixture();
  const normal = manager.spawnMob('panda', 0, 1, 0, { mainGene: 'normal', hiddenGene: 'normal' });
  const brown = manager.spawnMob('panda', 2, 1, 0, { mainGene: 'brown', hiddenGene: 'brown' });
  assert.equal(normal.personality, 'normal');
  assert.equal(brown.personality, 'brown');

  const normalColors = modelColors(normal);
  const brownColors = modelColors(brown);
  assert.ok(normalColors.includes(PANDA_COLORS.normal.dark.toString(16)),
    `a normal panda is black-ish, got ${normalColors}`);
  assert.ok(brownColors.includes(PANDA_COLORS.brown.dark.toString(16)),
    `a brown panda is brown, got ${brownColors}`);
  // The light parts are shared, which is what makes it brown *and* white.
  assert.ok(brownColors.includes(PANDA_COLORS.brown.light.toString(16)));
  assert.notEqual(normalColors, brownColors);

  // Every other personality keeps the normal palette.
  for (const gene of ['lazy', 'worried', 'playful', 'aggressive', 'weak']) {
    const panda = manager.spawnMob('panda', 0, 1, 0, { mainGene: gene, hiddenGene: gene });
    assert.equal(modelColors(panda), normalColors, `${gene} keeps the normal palette`);
  }
});

test('the panda recolour is safe and reversible', () => {
  const { manager } = fixture();
  const panda = manager.spawnMob('panda', 0, 1, 0, { mainGene: 'normal', hiddenGene: 'normal' });
  const before = modelColors(panda);
  panda.personality = 'brown';
  applyPandaColors(panda);
  assert.notEqual(modelColors(panda), before, 'changing the personality recolours it');
  panda.personality = 'normal';
  applyPandaColors(panda);
  assert.equal(modelColors(panda), before, 'and back again');
  assert.doesNotThrow(() => applyPandaColors(null));
  assert.doesNotThrow(() => applyPandaColors({ type: 'cow' }));
  // A model with no material handles falls back to the traversal, which must not crash either.
  const bare = { type: 'panda', personality: 'brown', mesh: new THREE.Group() };
  assert.doesNotThrow(() => applyPandaColors(bare));
  assert.equal(isPanda(bare), true);
});

test('a wolf gets the palette for its collar colour', () => {
  // Wiki: the default collar is red. The spawner hardcoded red, so `options.collarColor` was ignored
  // at spawn even though dyeing a collar afterwards worked.
  const { manager } = fixture();
  const def = manager.spawnMob('wolf', 0, 1, 0);
  assert.equal(def.collarColor, WOLF_DEFAULT_COLLAR);
  assert.equal(def.collarMesh.material.color.getHex(), SHEEP_COLOR_HEX.red,
    'the default collar is red');

  const lime = manager.spawnMob('wolf', 2, 1, 0, { collarColor: 'lime' });
  assert.equal(lime.collarColor, 'lime');
  assert.equal(lime.collarMesh.material.color.getHex(), SHEEP_COLOR_HEX.lime,
    'a requested collar colour is applied to the mesh');
  assert.notEqual(modelColors(def), modelColors(lime));

  // An unknown colour falls back to red rather than rendering black or crashing.
  const odd = manager.spawnMob('wolf', 0, 1, 0, { collarColor: 'chartreuse' });
  assert.equal(odd.collarMesh.material.color.getHex(), SHEEP_COLOR_HEX.red);
});

test('fox, rabbit and parrot variants still reach the model after the dispatcher change', () => {
  const { manager } = fixture();
  const red = manager.spawnMob('fox', 0, 1, 0, { coat: 'red' });
  const snow = manager.spawnMob('fox', 2, 1, 0, { coat: 'snow' });
  assert.equal(snow.coat, 'snow');
  // A coat is a SHEET now, so the two variants differ by texture rather than by tint.
  assert.match(snow.bodyMat.map?.assetPath ?? '', /fox_snow\.png$/);
  assert.notEqual(red.bodyMat.map?.assetPath, snow.bodyMat.map?.assetPath);

  const brown = manager.spawnMob('rabbit', 0, 1, 0, { coat: 'brown' });
  const gold = manager.spawnMob('rabbit', 2, 1, 0, { coat: 'gold' });
  assert.equal(gold.coat, 'gold');
  assert.notEqual(modelColors(brown), modelColors(gold));

  const cyan = manager.spawnMob('parrot', 0, 1, 0, { variant: 3 });
  assert.equal(cyan.variantName, 'cyan');
});

test('a sheep and a mooshroom still honour their colour option', () => {
  const { manager } = fixture();
  const white = manager.spawnMob('sheep', 0, 1, 0, { woolColor: 'white' });
  const black = manager.spawnMob('sheep', 2, 1, 0, { woolColor: 'black' });
  assert.equal(black.woolColor, 'black');
  assert.notEqual(white.woolMesh.material.color.getHex(), black.woolMesh.material.color.getHex());

  const red = manager.spawnMob('mooshroom', 0, 1, 0, { variant: 'red' });
  const brown = manager.spawnMob('mooshroom', 2, 1, 0, { variant: 'brown' });
  assert.equal(brown.variant, 'brown');
  // The mooshroom shows its variant through its SKIN, not through a tint: a red and a brown mooshroom are the same
  // cow-shaped model wearing two different vanilla textures. So the difference to assert is which skin each is
  // bound to, and that neither was flattened to one colour to express it.
  assert.notEqual(modelAppearance(red), modelAppearance(brown),
    'red and brown mooshrooms must not render identically');
  assert.match(modelAppearance(brown), /brown_mooshroom/, 'the brown variant wears the brown skin');
  assert.match(modelAppearance(red), /red_mooshroom/, 'and the red variant the red one');
});

test('the extra options argument does not leak into the mob state', () => {
  // The dispatcher passes `options` to handlers that declare it; a handler must not accidentally
  // record the whole bag, which would serialise junk into a save.
  const { manager } = fixture();
  const mob = manager.spawnMob('fox', 0, 1, 0, { coat: 'snow' });
  assert.equal(mob.options, undefined, 'the options bag is not stored on the mob');
  assert.equal(mob.coat, 'snow');
});

test('every variant mob survives the real update loop with its variant intact', () => {
  const { manager } = fixture();
  const player = {
    position: new THREE.Vector3(12, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    inventory: { getActiveItem: () => null }, takeDamage() {}, applyStatusEffect() {},
    hasStatusEffect: () => false
  };
  manager.game.player = player;

  // Math.random is seeded for the duration of this case. Several mobs in the list use randomness for
  // idle decisions (the rabbit hops, the parrot alternates flying and resting), and an unseeded run made
  // this case fail intermittently with "rabbit survived the loop" -- a different outcome each run.
  // Seeding makes it deterministic instead of roughly-right, which matters because a flaky assertion
  // here would be blamed on whatever changed last.
  const realRandom = Math.random;
  let seed = 12345;
  Math.random = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  try {
  // Spawned ONE AT A TIME with a long window. Deliberately NOT asserting distance moved: a parrot's
  // idle flight alternates flying and resting, so in a short window it may legitimately end where it
  // started. Movement is covered by the per-mob parity suites and by mobUpdateSmoke; what this case is
  // for is that the dispatcher change did not break a variant mob in the real loop.
  //
  // Each mob gets its OWN pen. Every mob used to be spawned at the origin, so they accumulated in one
  // spot -- and a fox therefore shared a pen with the rabbit two cases later. Whether the fox connected
  // depends on its randomised timing, which made this assertion fail or pass depending on how much
  // Math.random had been consumed earlier in the process; adding an unrelated module import was enough to
  // flip it. That is the SAME interaction the neighbouring test documents as real behaviour ("a fox
  // hunting a rabbit", asserted there as a lone rabbit being safe). Spacing the pens apart keeps this case
  // measuring what it says it measures -- that no variant mob breaks in the real update loop -- instead of
  // also re-testing predation through a proximity accident.
  const PEN_SPACING = 60;
  for (let index = 0; index < VARIANT_CASES.length; index++) {
    const entry = VARIANT_CASES[index];
    const mob = manager.spawnMob(entry.type, index * PEN_SPACING, 1, 0, entry.b);
    const colorsAtSpawn = modelColors(mob);
    assert.doesNotThrow(() => {
      for (let i = 0; i < 600; i++) manager.update(1 / 60, player);
    }, `${entry.type} updated without throwing`);
    assert.ok(mob.health > 0, `${entry.type} survived the loop`);
    assert.equal(modelColors(mob), colorsAtSpawn, `${entry.type} kept its variant colours`);
  }
  assert.deepEqual([...(manager.mobErrors || [])], [], 'no fault reported');
  } finally {
    Math.random = realRandom;
  }
});

test('a fox hunting a rabbit is why they are not batched, and a lone rabbit is safe', () => {
  // Wiki: a fox's prey includes rabbits. This failed my first version of the case above, where all seven
  // variant mobs shared one pen and the rabbit died. Asserted here so the reason is recorded rather
  // than folklore. The lone-rabbit half is what makes it deterministic: whether the fox connects
  // depends on its randomised timing, so only the safe direction is asserted.
  const { manager } = fixture();
  const player = {
    position: new THREE.Vector3(12, 1, 0), velocity: new THREE.Vector3(),
    gamemode: 'survival', health: 20, keys: {}, onGround: true, statusEffects: {},
    inventory: { getActiveItem: () => null }, takeDamage() {}, applyStatusEffect() {},
    hasStatusEffect: () => false
  };
  manager.game.player = player;

  const lonely = manager.spawnMob('rabbit', 0, 1, 0, { coat: 'gold' });
  for (let i = 0; i < 400; i++) manager.update(1 / 60, player);
  assert.equal(lonely.health, lonely.maxHealth, 'a rabbit with no predator is unharmed');

  // And the predator relationship is real, not assumed.
  const fox = manager.spawnMob('fox', 0, 1, 0, { coat: 'snow' });
  assert.equal(fox.type, 'fox');
  assert.ok(FOX_PREY.includes('rabbit'), 'the fox prey list really does include rabbits');
});
