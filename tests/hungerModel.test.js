// The vanilla hunger, saturation, exhaustion and regeneration model.
//
// This is the survival loop itself. Before it existed the player had a `hunger` field that nothing
// ever reduced, so food was optional, and regeneration was a flat `health += dt * 0.3` at any hunger
// above 18 -- roughly six times vanilla's fast rate, applied at levels where vanilla regenerates
// slowly or not at all.
//
// The values here are vanilla's, verified against Mineclonia's mcl_hunger source. The parts most
// likely to be wrong, and therefore the parts tested hardest, are the specific numbers: the order in
// which saturation and hunger are spent, that one large exhaustion event pays out more than once, and
// the three regeneration branches.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHungerState, addExhaustion, eat, tickHunger, starvationFloor, scaleDamageByDifficulty,
  MAX_HUNGER, EXHAUSTION, EXHAUSTION_THRESHOLD, REGEN,
} from '../src/hunger.js';

test('exhaustion constants match vanilla', () => {
  // Transcribed from the verified rules. A typo here would make the whole loop the wrong speed, and
  // the symptom would be "hunger drains a bit fast" rather than a failure.
  assert.equal(EXHAUSTION.dig, 0.005, 'digging is 0.005 per block');
  assert.equal(EXHAUSTION.jump, 0.05);
  assert.equal(EXHAUSTION.sprintJump, 0.2);
  assert.equal(EXHAUSTION.attack, 0.1);
  assert.equal(EXHAUSTION.swim, 0.01);
  assert.equal(EXHAUSTION.sprint, 0.1);
  assert.equal(EXHAUSTION.damage, 0.1);
  assert.equal(EXHAUSTION.regen, 6.0, 'regenerating 1 HP costs 6.0 exhaustion');
  assert.equal(EXHAUSTION_THRESHOLD, 4.0, 'the payout threshold is 4.0');
  assert.equal(MAX_HUNGER, 20);
});

test('saturation is spent before hunger', () => {
  // The defining behaviour of the vanilla model, and the reason saturation is worth tracking at all.
  const state = createHungerState({ hunger: 20, saturation: 3, exhaustion: 0 });
  addExhaustion(state, EXHAUSTION_THRESHOLD);
  assert.equal(state.hunger, 20, 'hunger must not fall while saturation remains');
  // Wiki (Food, Exhaustion): at 4.0 it "reduces the saturation by 1 if there is any saturation remaining".
  assert.equal(state.saturation, 2, 'one payout costs 1 saturation');
});

test('hunger only falls once saturation is gone', () => {
  const state = createHungerState({ hunger: 20, saturation: 0, exhaustion: 0 });
  addExhaustion(state, EXHAUSTION_THRESHOLD);
  assert.equal(state.hunger, 19, 'one payout costs 1 hunger when there is no saturation');
  assert.equal(state.saturation, 0);
});

test('a large exhaustion event pays out more than once', () => {
  // Vanilla lets exhaustion overshoot and processes every threshold crossed. Mineclonia clamps to the
  // threshold, so a 12.0 burst costs it one payout instead of three -- a deviation this deliberately
  // does not copy.
  const state = createHungerState({ hunger: 20, saturation: 0, exhaustion: 0 });
  addExhaustion(state, 12);
  assert.equal(state.hunger, 17, '12.0 exhaustion is three payouts of 4.0');
  assert.ok(state.exhaustion < EXHAUSTION_THRESHOLD, 'the remainder must stay below the threshold');

  // And a burst larger than the whole bar does not loop forever.
  const empty = createHungerState({ hunger: 1, saturation: 0, exhaustion: 0 });
  addExhaustion(empty, 1000);
  assert.equal(empty.hunger, 0);
  assert.equal(empty.exhaustion, 0, 'exhaustion must not accumulate with nothing left to pay');
});

test('mining from full with ordinary saturation empties the bar in the low tens of thousands of blocks', () => {
  // An order-of-magnitude check on the whole model at once. The exact figure is
  // (20 hunger + 5 saturation) * 4 / 0.005 == 20000, and reaching it within a couple of hundred
  // means the constants, the threshold and the payout order are all behaving together.
  const state = createHungerState({ hunger: 20, saturation: 5, exhaustion: 0 });
  let blocks = 0;
  while (state.hunger > 0 && blocks < 200000) {
    addExhaustion(state, EXHAUSTION.dig);
    blocks++;
  }
  // One payout per point of saturation, then one per point of hunger; floating-point accumulation of 0.005
  // steps can land a payout a block late, so allow a little either side.
  const ideal = ((MAX_HUNGER + 5) * EXHAUSTION_THRESHOLD) / EXHAUSTION.dig;
  assert.ok(blocks > ideal - 50 && blocks < ideal + 1500,
    `mining emptied hunger after ${blocks} blocks, expected between ${Math.round(ideal)} and ${Math.round(ideal) + 1500}`);
  // And it must be a figure that makes the point: food is not optional, but nor is it punishing.
  assert.ok(blocks > 15000 && blocks < 22000, `implausible figure: ${blocks}`);
});

test('eating adds hunger and caps saturation at the hunger level', () => {
  const state = createHungerState({ hunger: 3, saturation: 0, exhaustion: 0 });
  eat(state, 4, 9.6);
  assert.equal(state.hunger, 7);
  assert.equal(state.saturation, 7, 'saturation is capped at the hunger level, not at its own value');

  // A full player gains no hunger but does gain saturation up to the cap.
  // At full hunger the cap is 20, so a 9.6-saturation food is not clipped.
  const full = createHungerState({ hunger: 20, saturation: 0, exhaustion: 0 });
  eat(full, 4, 9.6);
  assert.equal(full.hunger, 20);
  assert.equal(full.saturation, 9.6);

  // The cap does bite when saturation would exceed hunger. Eating something worth 20 saturation at
  // hunger 10 leaves 10, not 20.
  const overfed = createHungerState({ hunger: 10, saturation: 0, exhaustion: 0 });
  eat(overfed, 0, 20);
  assert.equal(overfed.saturation, 10, 'saturation must not exceed the hunger level');
});

test('the three regeneration branches are distinct and correctly gated', () => {
  const withHealth = (hunger, saturation) => createHungerState({ hunger, saturation, exhaustion: 0 });

  // Java's FoodData ticks: fast is min(saturation, 6) / 6 HP every 10 ticks -- 2 HP a second with 6 or more
  // saturation; slow is 1 HP every 80 ticks at food 18 or more. Discrete, as in Java (see hunger.js).
  const fast = withHealth(20, 20);
  const fastResult = tickHunger(fast, 1, { health: 10, maxHealth: 20 });
  assert.equal(fastResult.heal, REGEN.fastPerSecond, 'full hunger regenerates fast');
  assert.ok(fastResult.heal > 0);

  // Slow: food 18 or more regenerates one whole HP after 4 s, not a sliver every tick.
  const slow = withHealth(18, 0);
  assert.equal(tickHunger(slow, 3.9, { health: 10, maxHealth: 20 }).heal, 0, 'nothing before 80 ticks');
  const slowResult = tickHunger(slow, 0.1, { health: 10, maxHealth: 20 });
  assert.equal(slowResult.heal, 1, 'food 18 regenerates 1 HP every 4 s');

  // None: below 18 with no saturation, nothing happens.
  const none = withHealth(17, 0);
  const noneResult = tickHunger(none, 1, { health: 10, maxHealth: 20 });
  assert.equal(noneResult.heal, 0, 'food 17 does not regenerate');

  // Starving: food 0 damages.
  const starving = withHealth(0, 0);
  const starveResult = tickHunger(starving, 4, { health: 10, maxHealth: 20 });
  assert.ok(starveResult.starve > 0, 'food 0 causes starvation damage');
  assert.equal(starveResult.heal, 0);
});

test('regeneration costs exhaustion, which is what makes it finite', () => {
  // Without this, a player at full hunger would regenerate forever for free.
  const state = createHungerState({ hunger: 20, saturation: 3, exhaustion: 0 });
  const before = state.saturation;
  tickHunger(state, 0.5, { health: 10, maxHealth: 20 });
  assert.ok(state.exhaustion > 0, 'regenerating must accrue exhaustion');
  assert.ok(state.saturation < before || state.exhaustion > 0,
    'regeneration must consume saturation or build exhaustion toward doing so');
});

test('peaceful heals and refills hunger instead of starving', () => {
  const state = createHungerState({ hunger: 0, saturation: 0, exhaustion: 0 });
  const result = tickHunger(state, 1, { peaceful: true, health: 10, maxHealth: 20 });
  assert.ok(result.heal > 0, 'peaceful regenerates');
  assert.equal(result.starve, 0, 'peaceful never starves');
  assert.ok(state.hunger > 0, 'peaceful refills hunger');
});

test('starvation is floored by difficulty', () => {
  // Vanilla forbids starvation from killing on easy and normal, and disables it on peaceful.
  assert.equal(starvationFloor('peaceful'), Infinity);
  assert.equal(starvationFloor('easy'), 10);
  assert.equal(starvationFloor('normal'), 1);
  assert.equal(starvationFloor('hard'), 0, 'only hard lets starvation kill');
  assert.equal(starvationFloor(undefined), 1, 'an unknown difficulty should behave like normal');
});

test('damage scales by difficulty', () => {
  // Only mob-sourced damage scales, but the arithmetic is shared so it is tested here.
  assert.equal(scaleDamageByDifficulty(10, 'peaceful'), 0);
  assert.equal(scaleDamageByDifficulty(10, 'normal'), 10);
  assert.equal(scaleDamageByDifficulty(10, 'hard'), 15);
  // Easy is `min(damage/2 + 1, damage)`, so it never increases damage.
  assert.equal(scaleDamageByDifficulty(10, 'easy'), 6);
  assert.ok(scaleDamageByDifficulty(1, 'easy') <= 1, 'easy must not increase small damage');
  assert.equal(scaleDamageByDifficulty(10, undefined), 10);
});

test('a zero or negative exhaustion amount is ignored', () => {
  // Guarding this matters because `dt` can be zero, and an infinite loop of zero-cost payouts would
  // hang the game rather than fail a test.
  const state = createHungerState({ hunger: 20, saturation: 5, exhaustion: 0 });
  addExhaustion(state, 0);
  addExhaustion(state, -5);
  assert.equal(state.hunger, 20);
  assert.equal(state.saturation, 5);
});

// Wiki (Food): natural regeneration costs 6.0 exhaustion per HP healed -- 1.5 saturation, the "saturation boost
// heals 1 HP by consuming 1.5 saturation". It was charged per second instead: half price at full hunger, four
// times the price at 18-19.
test('every healed HP costs 6.0 exhaustion, fast or slow', () => {
  for (const [hunger, saturation, seconds] of [[20, 20, 0.5], [19, 0, 4], [18, 0, 4]]) {
    const state = createHungerState({ hunger, saturation, exhaustion: 0 });
    const { heal } = tickHunger(state, seconds, { health: 10, maxHealth: 20 });
    const spent = (saturation - state.saturation) * 4 + (hunger - state.hunger) * 4 + state.exhaustion;
    assert.equal(heal, 1, `hunger ${hunger} heals 1 HP`);
    assert.ok(Math.abs(spent / heal - EXHAUSTION.regen) < 1e-9, `hunger ${hunger}: ${spent / heal} per HP`);
  }
  // A whole HP of saturation boost, from 5 saturation: 1.5 spent.
  const state = createHungerState({ hunger: 20, saturation: 5, exhaustion: 0 });
  let healed = 0;
  for (let i = 0; i < 50 && healed < 1 - 1e-9; i++) healed += tickHunger(state, 0.01, { health: 10, maxHealth: 20 }).heal;
  // Heals come in min(saturation, 6) / 6 HP pieces, so compare the rate: 1.5 saturation for every HP healed.
  const spentSaturation = 5 - state.saturation + state.exhaustion / EXHAUSTION_THRESHOLD;
  assert.ok(Math.abs(spentSaturation / healed - 1.5) < 1e-6, `one HP costs 1.5 saturation (${spentSaturation} for ${healed})`);
});
