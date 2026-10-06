// Absorption, and the golden apple that was missing half of itself.
//
// `statusEffects.js` has defined Absorption since that table was written and nothing implemented it: it was
// absent from the damage path and from the UI, so applying it did literally nothing. It is also half of what
// a golden apple is FOR -- the other half being Regeneration -- and eating one gave nothing but food.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { absorbDamage, absorptionForLevel, ABSORPTION_PER_LEVEL } from '../src/absorption.js';
import { goldenAppleEffects, isGoldenApple, applyGoldenApple, GOLDEN_APPLE_EFFECTS }
  from '../src/goldenApple.js';
import { effectNames } from '../src/statusEffects.js';

// --- absorption -----------------------------------------------------------------

test('a level grants four points, and applying it takes the maximum', () => {
  assert.equal(ABSORPTION_PER_LEVEL, 4, 'two hearts per level, which is vanilla');
  assert.equal(absorptionForLevel(1, 0), 4);
  assert.equal(absorptionForLevel(2, 0), 8);
  assert.equal(absorptionForLevel(4, 0), 16);
  // The max rather than the sum: a second golden apple must not stack on top of an unspent buffer.
  assert.equal(absorptionForLevel(2, absorptionForLevel(4, 0)), 16, 'a weaker re-application must not shrink it');
  assert.equal(absorptionForLevel(4, absorptionForLevel(2, 0)), 16, 'and must not sum with it');
  // A stronger one does raise it, which is the point of taking the maximum.
  assert.equal(absorptionForLevel(4, 4), 16);
});

test('damage comes out of the buffer before it reaches health', () => {
  assert.deepEqual(absorbDamage(3, 8), { absorbed: 3, remaining: 0, pool: 5 });
  assert.deepEqual(absorbDamage(8, 8), { absorbed: 8, remaining: 0, pool: 0 }, 'exactly emptying it');
  assert.deepEqual(absorbDamage(12, 8), { absorbed: 8, remaining: 4, pool: 0 },
    'and the excess passes through');
  assert.deepEqual(absorbDamage(5, 0), { absorbed: 0, remaining: 5, pool: 0 },
    'with no buffer, nothing is absorbed');
  assert.deepEqual(absorbDamage(0, 8), { absorbed: 0, remaining: 0, pool: 8 }, 'and zero damage costs nothing');
});

test('the buffer never goes negative and nonsense cannot poison health', () => {
  // This value flows into `this.health`, where a negative or NaN would be unrecoverable.
  for (const d of [-5, NaN, undefined, null, Infinity]) {
    const r = absorbDamage(d, 8);
    assert.ok(Number.isFinite(r.remaining) && r.remaining >= 0, 'remaining for ' + String(d) + ' was ' + r.remaining);
    assert.ok(Number.isFinite(r.pool) && r.pool >= 0, 'pool for ' + String(d) + ' was ' + r.pool);
  }
  for (const p of [-1, NaN, undefined]) {
    const r = absorbDamage(5, p);
    assert.ok(Number.isFinite(r.remaining) && r.remaining >= 0);
    assert.equal(r.pool, 0, 'a broken pool should read as empty rather than negative');
  }
});

test('the damage path soaks with absorption after armour, not before', () => {
  // Order matters: absorbing first would let armour reduce damage that had already been spent.
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ absorbDamage, absorptionForLevel \} from '\.\/absorption\.js'/);
  const armour = source.indexOf('Armor damage mitigation');
  const soak = source.indexOf('if ((this.absorption || 0) > 0 && amount > 0)');
  const health = source.indexOf('this.health = Math.max(0, this.health - amount);', soak);
  assert.ok(armour > 0 && soak > armour, 'absorption should come after the armour formula');
  assert.ok(health > soak, 'and before health is reduced');
});

test('applying the effect sets the buffer, and nothing else does', () => {
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(source, /if \(effect === 'absorption'\) \{\s*this\.absorption = absorptionForLevel\(level, this\.absorption \|\| 0\)/,
    'applyStatusEffect should seed the buffer from the level');
});

// --- golden apples ----------------------------------------------------------------

test('a golden apple grants Absorption II and Regeneration II', () => {
  // Vanilla's figures. The apple is the classic emergency item, and both effects were missing.
  assert.deepEqual(goldenAppleEffects('golden_apple'), [
    { id: 'absorption', seconds: 120, level: 2 },
    { id: 'regeneration', seconds: 5, level: 2 },
  ]);
});

test('an enchanted golden apple grants four effects', () => {
  assert.deepEqual(goldenAppleEffects('enchanted_golden_apple'), [
    { id: 'absorption', seconds: 120, level: 4 },
    { id: 'regeneration', seconds: 30, level: 5 },
    { id: 'fire_resistance', seconds: 300, level: 1 },
    { id: 'resistance', seconds: 300, level: 1 },
  ]);
});

test('every effect a golden apple grants is a real effect', () => {
  // Guards against a typo turning into an effect the game silently ignores.
  const known = new Set(effectNames());
  for (const [item, effects] of Object.entries(GOLDEN_APPLE_EFFECTS)) {
    assert.ok(effects.length > 0, item + ' should grant something');
    for (const e of effects) {
      assert.ok(known.has(e.id), item + ' grants unknown effect ' + e.id);
      assert.ok(e.seconds > 0, item + ' ' + e.id + ' should last a positive time');
      assert.ok(Number.isInteger(e.level) && e.level >= 1, item + ' ' + e.id + ' should have a level');
    }
  }
});

test('only the two golden apples count', () => {
  assert.equal(isGoldenApple('golden_apple'), true);
  assert.equal(isGoldenApple('enchanted_golden_apple'), true);
  // A plain apple and a golden carrot must not: the carrot is horse food and a player food, but it grants
  // no effects in vanilla.
  assert.equal(isGoldenApple('apple'), false);
  assert.equal(isGoldenApple('golden_carrot'), false);
  assert.equal(isGoldenApple(''), false);
  assert.equal(isGoldenApple(undefined), false);
  assert.deepEqual(goldenAppleEffects('apple'), []);
});

test('applying one reaches the player and reports that it did', () => {
  const applied = [];
  const player = { applyStatusEffect: (id, seconds, level) => applied.push({ id, seconds, level }) };
  assert.equal(applyGoldenApple(player, 'golden_apple'), true);
  assert.equal(applied.length, 2);
  assert.deepEqual(applied[0], { id: 'absorption', seconds: 120, level: 2 });
  // And a non-apple applies nothing at all.
  applied.length = 0;
  assert.equal(applyGoldenApple(player, 'apple'), false);
  assert.deepEqual(applied, []);
  // A player without the method must not throw; the item is still a golden apple.
  assert.doesNotThrow(() => applyGoldenApple({}, 'golden_apple'));
  assert.equal(applyGoldenApple(undefined, 'golden_apple'), true);
});

test('the eating path applies the effects', () => {
  // Checked at the source because `main.js` needs most of an engine to drive. This proves the call is in the
  // food branch, which is where eating happens.
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ applyGoldenApple, isGoldenApple \} from '\.\/goldenApple\.js'/);
  const food = source.indexOf("it.type === 'food'");
  const apply = source.indexOf('if (isGoldenApple(activeItem.id)) applyGoldenApple(this.player, activeItem.id)');
  const hunger = source.indexOf('this.player.hunger = Math.min(', food);
  assert.ok(food > 0 && apply > food, 'the effects should be applied in the food branch');
  assert.ok(hunger > apply, 'and before the hunger restore');
});
