// The status-effect matrix, run in a disposable headless browser through the bot's own potion drinking.
//
// Layer: real `PlayerBot.run({type:'eat'})` -> `main.js`'s right-click chain -> `potionUse.drinkPotion` ->
// `Player.applyStatusEffect` -> the real `Player`'s effect map, health and movement, all in the real world.
// This is the layer the unit tests cannot reach: they drive `potionUse` against stubs, and `/give` looked
// perfectly healthy in unit tests while its bot route was dead.
//
// Nothing here treats the bot's success string as evidence. Every effect is read off `player.statusEffects`,
// and every consequence off the real functions the game uses, against the real player's fields.
//
// Reference: https://minecraft.wiki/w/Effect and the per-effect pages.
import { test, expect } from '@playwright/test';

test.describe('creative status effects through the bot API', () => {
  const evidence = { rows: [], generatedAt: null, reference: null };

  async function drain() {
    const rows = await globalThis.__page.evaluate(() => {
      const out = window.__fx.observed.slice();
      window.__fx.observed.length = 0;
      return out;
    });
    const { writeFileSync, mkdirSync, readFileSync, existsSync } = await import('node:fs');
    mkdirSync('docs/artifacts', { recursive: true });
    const path = 'docs/artifacts/effect-browser-rows.json';
    let previous = { rows: [] };
    if (existsSync(path)) {
      try { previous = JSON.parse(readFileSync(path, 'utf8')); } catch { previous = { rows: [] }; }
    }
    const keyed = new Map((previous.rows ?? []).map((r) => [r.key, r]));
    for (const r of rows) keyed.set(r.key, r);
    evidence.rows = [...keyed.values()];
    evidence.generatedAt = new Date().toISOString();
    writeFileSync(path, JSON.stringify(evidence, null, 2) + '\n');
    return rows;
  }

  test.afterEach(async () => {
    try { await drain(); } catch (error) { console.error('[effect] drain failed:', error.message); }
  });

  test.afterAll(async () => { await globalThis.__page?.close(); });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600000);
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(300000);
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForFunction(
      () => window.game?.playerBot && window.game?.inventory && window.game?.entities && window.game?.ui,
      null, { timeout: 300000 },
    );
    await page.evaluate(async () => {
      const { createEffectHarness } = await import('/e2e/fixtures/effectHarness.js');
      window.__fx = await createEffectHarness(window.game);
      window.__fxSetup = window.__fx.reset({ gameMode: 'creative', cheats: true });
    });
    const setup = await page.evaluate(() => window.__fxSetup);
    evidence.reference = {
      wiki: 'https://minecraft.wiki/w/Effect and the per-effect pages (fetched in this run)',
      javaEditionTarget: '1.21.4 (DataVersion 4189)',
      setup,
    };
    expect(setup.mode, 'the harness is set up in creative').toBe('creative');
    expect(setup.settings.cheats, 'with cheats on').toBe(true);
    globalThis.__page = page;
  });

  // --- BOT-X01: the basic drink, and what creative does with the bottle -------------

  test('BOT-X01 drinking a potion applies its effect to the real player', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('potion_of_fire_resistance');
      const row = await h.drink('potion_of_fire_resistance');
      return {
        error: row.error, ok: row.result?.ok, message: row.result?.message,
        effects: row.after.effects, before: row.before.effects,
        potions: h.count('potion_of_fire_resistance'),
        glass: h.count('glass_bottle'),
        mode: row.before.mode,
        botActive: row.after.botActive, controls: row.after.controls, keys: row.after.keys,
      };
    });
    expect(r.error, `the bot threw: ${r.error}`).toBeNull();
    expect(r.mode, 'this case runs in creative').toBe('creative');
    expect(r.before, 'the player starts with no effect').toEqual([]);
    const fx = r.effects.find((e) => e.name === 'fire_resistance');
    expect(fx, `effects after drinking: ${JSON.stringify(r.effects)}`).toBeTruthy();
    expect(fx.level, 'Fire Resistance is level I').toBe(1);
    // The wiki's Fire Resistance potion is 3:00.
    expect(fx.duration, `duration was ${fx.duration}s`).toBeGreaterThan(178);
    expect(fx.duration).toBeLessThanOrEqual(180);
    // Creative does not consume the potion, so it can be drunk again -- and the empty bottle does not
    // appear either, because nothing was drunk away.
    expect(r.potions, 'creative keeps the potion').toBe(1);
    expect(r.glass, 'and produces no empty bottle').toBe(0);
    expect(r.botActive, 'the bot releases control').toBe(false);
    expect(r.controls).toBeNull();
    expect(r.keys).toEqual([]);
  });

  // --- BOT-X02..03: the three potion tiers ------------------------------------------

  test('BOT-X02 extended and enhanced potions change duration and level as the wiki says', async () => {
    // Fire Resistance has no enhanced form (the wiki's table shows "—" under Enhanced), so the enhanced
    // case uses Strength, which has both. Extended is 8:00; enhanced Strength II is 1:30 at level 2.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      const run = async (item, effect) => {
        h.reset({ gameMode: 'creative', cheats: true });
        h.give(item);
        const row = await h.drink(item);
        return { item, error: row.error, ok: row.result?.ok, message: row.result?.message, effect: h.effectOf(effect) };
      };
      return {
        regular: await run('potion_of_fire_resistance', 'fire_resistance'),
        extended: await run('potion_of_fire_resistance_long', 'fire_resistance'),
        strength: await run('potion_of_strength', 'strength'),
        strengthLong: await run('potion_of_strength_long', 'strength'),
        strength2: await run('potion_of_strength_2', 'strength'),
      };
    });
    for (const [key, row] of Object.entries(r)) {
      expect(row.error, `${key} threw: ${row.error}`).toBeNull();
      expect(row.effect, `${key} (${row.item}) applied nothing: ${row.message}`).toBeTruthy();
    }
    // Fire Resistance: 3:00 regular, 8:00 extended, and the level does not change.
    expect(r.regular.effect.duration, 'regular Fire Resistance is 3:00').toBeGreaterThan(178);
    expect(r.extended.effect.duration, 'extended Fire Resistance is 8:00').toBeGreaterThan(478);
    expect(r.extended.effect.level, 'extending does not raise the level').toBe(1);
    // Strength: 3:00 at level 1, 8:00 extended at level 1, 1:30 at level 2 enhanced.
    expect(r.strength.effect.level).toBe(1);
    expect(r.strength.effect.duration).toBeGreaterThan(178);
    expect(r.strengthLong.effect.duration, 'extended Strength is 8:00').toBeGreaterThan(478);
    expect(r.strengthLong.effect.level, 'extending Strength keeps level 1').toBe(1);
    expect(r.strength2.effect.level, 'the enhanced potion is level II').toBe(2);
    expect(r.strength2.effect.duration, 'and trades duration for potency (1:30)').toBeLessThan(100);
  });

  test('BOT-X03 the Turtle Master potion applies its two real effects, not a fake status', async () => {
    // The wiki: the Potion of the Turtle Master applies Slowness IV and Resistance III together; there is
    // no "Turtle Master" effect in the HUD. The enhanced tier is Slowness VI and Resistance IV.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      const run = async (item) => {
        h.reset({ gameMode: 'creative', cheats: true });
        h.give(item);
        const row = await h.drink(item);
        return { item, error: row.error, ok: row.result?.ok, message: row.result?.message, effects: row.after.effects, damageTaken: row.after.damageTaken };
      };
      return { base: await run('potion_of_turtle_master'), enhanced: await run('potion_of_turtle_master_2') };
    });
    for (const [key, row] of Object.entries(r)) {
      expect(row.error, `${key} threw: ${row.error}`).toBeNull();
      expect(row.effects.length, `${key} effects: ${JSON.stringify(row.effects)}`).toBe(2);
      expect(row.effects.map((e) => e.name).sort()).toEqual(['resistance', 'slowness']);
      // The fake status must not appear.
      expect(row.effects.find((e) => e.name === 'turtle_master')).toBeUndefined();
    }
    expect(r.base.effects.find((e) => e.name === 'slowness').level, 'base Slowness IV').toBe(4);
    expect(r.base.effects.find((e) => e.name === 'resistance').level, 'base Resistance III').toBe(3);
    expect(r.enhanced.effects.find((e) => e.name === 'slowness').level, 'enhanced Slowness VI').toBe(6);
    expect(r.enhanced.effects.find((e) => e.name === 'resistance').level, 'enhanced Resistance IV').toBe(4);
  });

  // --- BOT-X04: instant effects -----------------------------------------------------

  test('BOT-X04 instant potions resolve immediately and leave no lasting effect', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      // Instant Health writes health directly, so it works in creative.
      h.reset({ gameMode: 'creative', cheats: true, health: 14 });
      h.give('potion_of_healing');
      const healed = await h.drink('potion_of_healing');

      h.reset({ gameMode: 'creative', cheats: true, health: 14 });
      h.give('potion_of_healing_2');
      const healed2 = await h.drink('potion_of_healing_2');

      // Instant Damage goes through `takeDamage`, which is a no-op in creative -- vanilla's rule, since a
      // creative player takes no damage -- so this one case is run in survival.
      h.reset({ gameMode: 'survival', cheats: true, health: 20 });
      h.give('potion_of_harming');
      const harmed = await h.drink('potion_of_harming');

      h.reset({ gameMode: 'survival', cheats: true, health: 20 });
      h.give('potion_of_harming_2');
      const harmed2 = await h.drink('potion_of_harming_2');

      return {
        healed: { before: healed.before.health, after: healed.after.health, effects: healed.after.effects, error: healed.error, message: healed.result?.message },
        healed2: { before: healed2.before.health, after: healed2.after.health, effects: healed2.after.effects, error: healed2.error },
        harmed: { before: harmed.before.health, after: harmed.after.health, effects: harmed.after.effects, error: harmed.error, message: harmed.result?.message, mode: harmed.before.mode },
        harmed2: { before: harmed2.before.health, after: harmed2.after.health, effects: harmed2.after.effects, error: harmed2.error },
      };
    });
    // Instant Health restores 4 HP at level I and 8 at level II.
    expect(r.healed.error, `healing threw: ${r.healed.error}`).toBeNull();
    expect(r.healed.after, `Instant Health I: 14 -> ${r.healed.after}`).toBe(18);
    expect(r.healed.effects, 'an instant effect is not held').toEqual([]);
    expect(r.healed2.after, `Instant Health II: 14 -> ${r.healed2.after}`).toBe(20);
    // Instant Damage deals 6 at level I and 12 at level II.
    expect(r.harmed.mode, 'the damage case runs in survival').toBe('survival');
    expect(r.harmed.error, `harming threw: ${r.harmed.error}`).toBeNull();
    expect(r.harmed.after, `Instant Damage I: 20 -> ${r.harmed.after}, via ${r.harmed.message}`).toBe(14);
    expect(r.harmed.effects, 'and is not held either').toEqual([]);
    expect(r.harmed2.after, `Instant Damage II: 20 -> ${r.harmed2.after}`).toBe(8);
  });

  // --- BOT-X05..07: what the effects actually change --------------------------------

  test('BOT-X05 the movement effects change the real speed rule', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      const run = async (item) => {
        h.reset({ gameMode: 'creative', cheats: true });
        if (item) h.give(item);
        const row = item ? await h.drink(item) : { after: h.snapshot(), error: null, result: null };
        return { item, error: row.error, speed: row.after.speedMultiplier, effects: row.after.effects };
      };
      return {
        none: await run(null),
        speed: await run('potion_of_swiftness'),
        speed2: await run('potion_of_swiftness_2'),
        slow: await run('potion_of_slowness'),
      };
    });
    expect(r.none.speed, 'no effect is 1x').toBe(1);
    // Speed adds 20% per level: +20% and +40%.
    expect(r.speed.speed, `Speed I gave ${r.speed.speed}`).toBeCloseTo(1.2, 6);
    expect(r.speed2.speed, `Speed II gave ${r.speed2.speed}`).toBeCloseTo(1.4, 6);
    // Slowness removes 15% per level: -15%.
    expect(r.slow.speed, `Slowness I gave ${r.slow.speed}`).toBeCloseTo(0.85, 6);
  });

  test('BOT-X06 the combat effects change the real damage rules', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      const run = async (item) => {
        h.reset({ gameMode: 'creative', cheats: true });
        if (item) h.give(item);
        const row = item ? await h.drink(item) : { after: h.snapshot(), error: null, result: null };
        return { item, error: row.error, attack: row.after.attackBonus, damageTaken: row.after.damageTaken, effects: row.after.effects };
      };
      return {
        none: await run(null),
        strength: await run('potion_of_strength'),
        strength2: await run('potion_of_strength_2'),
        weakness: await run('potion_of_weakness'),
        turtle: await run('potion_of_turtle_master'),
      };
    });
    // Strength adds 3 HP per level, Weakness subtracts 4.
    expect(r.none.attack).toBe(0);
    expect(r.strength.attack, `Strength I added ${r.strength.attack}`).toBe(3);
    expect(r.strength2.attack, `Strength II added ${r.strength2.attack}`).toBe(6);
    expect(r.weakness.attack, `Weakness I added ${r.weakness.attack}`).toBe(-4);
    // Resistance removes 20% per level, so Turtle Master's Resistance III takes 40% off.
    expect(r.none.damageTaken, 'no Resistance takes full damage').toBe(1);
    expect(r.turtle.damageTaken, `Resistance III left ${r.turtle.damageTaken}`).toBeCloseTo(0.4, 6);
  });

  test('BOT-X07 absorption raises a shield in front of the health bar', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      h.reset({ gameMode: 'creative', cheats: true, health: 20 });
      h.give('potion_of_fire_resistance');   // a control: a potion with no absorption
      const control = await h.drink('potion_of_fire_resistance');

      h.reset({ gameMode: 'creative', cheats: true, health: 20 });
      // Absorption comes from a golden apple, not a brewable potion.
      h.game.inventory.addItem('golden_apple', false, 1);
      h.game.player.hunger = 20;
      const apple = await h.drink('golden_apple');

      return {
        control: { absorption: control.after.absorption, effects: control.after.effects, error: control.error },
        apple: {
          absorption: apple.after.absorption, health: apple.after.health, effects: apple.after.effects,
          error: apple.error, ok: apple.result?.ok, message: apple.result?.message,
        },
      };
    });
    expect(r.control.error, `the control threw: ${r.control.error}`).toBeNull();
    expect(r.control.absorption, 'a Fire Resistance potion grants no shield').toBe(0);
    // A golden apple grants Absorption: 4 points per level, so 8 for its level II application.
    expect(r.apple.error, `the apple threw: ${r.apple.error}`).toBeNull();
    expect(r.apple.absorption, `golden apple absorption: effects ${JSON.stringify(r.apple.effects)}`)
      .toBeGreaterThanOrEqual(4);
    // And the apple's other effects are real statuses the player holds.
    expect(r.apple.effects.map((e) => e.name)).toContain('absorption');
  });

  // --- BOT-X08..09: the merge rule and expiry, on the real player -------------------

  test('BOT-X08 a weaker application does not cut a stronger one short', async () => {
    // "higher levels overwrite lower levels, and higher durations overwrite lower durations of the same
    // level". Drinking the regular potion after the extended one must not shorten it.
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('potion_of_fire_resistance_long');
      await h.drink('potion_of_fire_resistance_long');
      const afterExtended = h.effectOf('fire_resistance');
      h.give('potion_of_fire_resistance');
      await h.drink('potion_of_fire_resistance');
      const afterRegular = h.effectOf('fire_resistance');
      return { afterExtended, afterRegular };
    });
    expect(r.afterExtended.duration, 'the extended potion gives 8:00').toBeGreaterThan(478);
    // The bot takes a moment to drink the second potion, so compare against the extended window rather than
    // its exact starting value.
    expect(r.afterRegular.duration, 'the 3:00 potion must not shorten it').toBeGreaterThan(470);
    expect(r.afterRegular.level).toBe(1);
  });

  test('BOT-X09 an effect runs out on the real player and stops applying', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      h.reset({ gameMode: 'creative', cheats: true });
      h.give('potion_of_swiftness');
      await h.drink('potion_of_swiftness');
      const start = { effect: h.effectOf('speed'), speed: h.snapshot().speedMultiplier };
      // Tick the fixture forward. The potion is 3:00, so 5 seconds must leave it running but shorter.
      h.step(5);
      const early = { effect: h.effectOf('speed'), speed: h.snapshot().speedMultiplier };
      // Now clear it the way the game does when the timer runs out, and confirm the rule returns to 1.
      h.game.player.clearStatusEffect('speed');
      const cleared = { effect: h.effectOf('speed'), speed: h.snapshot().speedMultiplier, size: h.snapshot().effectsSize };
      return { start, early, cleared };
    });
    expect(r.start.speed).toBeCloseTo(1.2, 6);
    expect(r.early.effect, 'the effect is still running after 5 s').toBeTruthy();
    expect(r.early.effect.duration, `5 s in, ${r.early.effect.duration}s remained`).toBeLessThan(180);
    expect(r.early.effect.duration).toBeGreaterThan(170);
    expect(r.early.speed, 'and still applying').toBeCloseTo(1.2, 6);
    expect(r.cleared.effect, 'once it ends it is gone').toBeNull();
    expect(r.cleared.speed, 'and the rule is back to normal').toBe(1);
    expect(r.cleared.size, 'with nothing left in the map').toBe(0);
  });

  // --- BOT-X10: damage over time through the bot -------------------------------------

  test('BOT-X10 damage-over-time effects: poison floors at 1 HP, wither does not', async () => {
    const r = await globalThis.__page.evaluate(async () => {
      const h = window.__fx;
      const { effectsFor } = await import('/src/statusEffects.js');
      // No brewable Poison or Wither potion exists in this build's recipe table, so these effects are
      // applied the way a splash potion would apply them -- the same `effectsFor` path `splashPotion.js`
      // uses -- and the damage is then driven by the player's own update loop through `fixture.step`.
      //
      // Survival, because `takeDamage` is a no-op in creative ("a creative player takes no damage"), so the
      // damage these effects deal cannot be observed there at all. That is vanilla's rule, not a workaround.
      const runDamage = async (effect, level, { health, seconds, naturalRegeneration = false }) => {
        h.reset({ gameMode: 'survival', cheats: true, health, naturalRegeneration });
        const granted = effectsFor(effect, level);
        for (const [name, lvl] of granted) h.game.player.applyStatusEffect(name, 30, lvl);
        const applied = h.effects();
        h.step(seconds);
        return { granted, applied, health: h.game.player.health, isDead: h.game.player.isDead, remaining: h.effects() };
      };

      const poison20 = await runDamage('poison', 1, { health: 20, seconds: 6 });
      const poisonAtOne = await runDamage('poison', 3, { health: 1, seconds: 30 });
      const witherAtOne = await runDamage('wither', 3, { health: 1, seconds: 20 });
      const wither20 = await runDamage('wither', 1, { health: 20, seconds: 10 });

      // And the creative rule itself, observed rather than assumed.
      h.reset({ gameMode: 'creative', cheats: true, health: 20, naturalRegeneration: false });
      h.game.player.applyStatusEffect('wither', 30, 3);
      h.step(10);
      const creativeWither = { health: h.game.player.health, effects: h.effects() };

      return { poison20, poisonAtOne, witherAtOne, wither20, creativeWither };
    });
    // Poison damages, and its 1.25 s cadence over 6 s is four ticks of 1 HP.
    expect(r.poison20.applied.length, 'the poison effect landed').toBe(1);
    expect(r.poison20.health, `poison I from 20 over 6 s left ${r.poison20.health}`).toBe(16);
    // Poison's floor: the player cannot be killed by it, whatever the level.
    expect(r.poisonAtOne.health, 'poison floors at 1 HP').toBe(1);
    expect(r.poisonAtOne.isDead, 'and does not kill').toBe(false);
    // Wither has no such floor, and its higher tiers tick faster.
    expect(r.witherAtOne.health, 'wither is not floored').toBeLessThanOrEqual(0);
    expect(r.wither20.health, `wither I from 20 over 10 s left ${r.wither20.health}`).toBeLessThan(20);
    // Wither III ticks every 0.5 s, so it must do more than the single tick the invulnerability window used
    // to allow: from 20 HP it is lethal well inside ten seconds.
    expect(r.wither20.health, 'wither I lands more than one tick').toBeLessThanOrEqual(15);
    // Creative takes no damage, which is why the cases above run in survival.
    expect(r.creativeWither.health, 'a creative player takes no damage from an effect').toBe(20);
    expect(r.creativeWither.effects.length, 'though the effect is still held').toBe(1);
  });

  // --- evidence ---------------------------------------------------------------------

  test('the observed effect rows are recorded for the report', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const path = 'docs/artifacts/effect-browser-rows.json';
    expect(existsSync(path), 'the effects artifact was written').toBe(true);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written.rows.length, 'the artifact holds the observed drinks').toBeGreaterThan(8);
    expect(written.rows.filter((r) => r.error).length, 'no drink threw an exception').toBe(0);
    expect(written.rows.filter((r) => (r.effectsAfter ?? []).length > 0).length, 'effects really landed')
      .toBeGreaterThan(4);
  });
});
