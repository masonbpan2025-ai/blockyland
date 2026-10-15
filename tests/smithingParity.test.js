// Smithing parity with https://minecraft.wiki/w/Smithing, pinned at the layers the browser suite does not reach.
//
// `e2e/smithCommand.pw.js` runs the rules through the live bot and table. These tests cover what that suite
// relies on without a browser: the bot's command grammar, the template resolver, the fireproof rule that the
// dropped-item physics reads, and that every id the bot can name is a real item.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlayerCommand, validatePlayerCommand } from '../src/playerBot.js';
import {
  NETHERITE_UPGRADE_TEMPLATE, TRIM_PATTERNS, TRIM_MATERIALS,
  resolveSmithingTemplate, isFireproof, calculateSmithingResult,
} from '../src/smithing.js';
import { ITEMS } from '../src/blocks.js';

// The sources are checked with their line endings normalised, so a boundary like a closing brace on its own line matches on Windows.
const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

// --- the bot's command grammar ----------------------------------------------------

test('the bot reads "smith <template> on <gear> with <material> at x y z"', () => {
  const command = parsePlayerCommand('smith netherite upgrade on diamond_chestplate with netherite ingot at 1 64 -3');
  assert.deepEqual(command, {
    type: 'smith',
    template: 'netherite_upgrade',
    base: 'diamond_chestplate',
    addition: 'netherite_ingot',
    position: [1, 64, -3],
  });
});

test('the bot accepts a leading "bot", a trailing full stop and mixed case, as its other commands do', () => {
  const command = parsePlayerCommand('/bot Smith Sentry Armor Trim On Iron_Chestplate With Gold_Ingot At 0 70 0.');
  assert.equal(command.type, 'smith');
  assert.equal(command.template, 'sentry_armor_trim');
  assert.equal(command.base, 'iron_chestplate');
  assert.equal(command.addition, 'gold_ingot');
});

test('a smith command without its three names and coordinates is not read as a smith', () => {
  assert.notEqual(parsePlayerCommand('smith netherite upgrade')?.type, 'smith');
  assert.notEqual(parsePlayerCommand('smith netherite upgrade on diamond_chestplate with netherite_ingot')?.type, 'smith');
});

test('validation keeps a well-formed smith command and refuses an unknown template at the boundary', () => {
  const valid = validatePlayerCommand('smith netherite_upgrade on diamond_chestplate with netherite_ingot at 1 2 3');
  assert.equal(valid.type, 'smith');
  assert.equal(valid.count ?? 1, 1, 'smithing acts once per command');
  assert.throws(
    () => validatePlayerCommand({ type: 'smith', template: 'bogus', base: 'diamond_chestplate', addition: 'netherite_ingot', position: [1, 2, 3] }),
    /Unknown smithing template/,
  );
  assert.throws(
    () => validatePlayerCommand({ type: 'smith', template: 'sentry', base: 'iron_chestplate', addition: 'gold_ingot', position: [1, 2.5, 3] }),
    /integer world coordinates/,
    'coordinates must be whole blocks',
  );
  assert.throws(
    () => validatePlayerCommand({ type: 'smith', template: 'sentry', base: 'iron_chestplate', addition: 'gold_ingot', position: [1, 2, 3], count: 2 }),
    /once per command/,
  );
});

// --- the template resolver --------------------------------------------------------

test('a player can name a template by its short name, and every one of the 19 resolves', () => {
  assert.equal(resolveSmithingTemplate('netherite_upgrade'), NETHERITE_UPGRADE_TEMPLATE);
  assert.equal(resolveSmithingTemplate('netherite_upgrade_smithing_template'), NETHERITE_UPGRADE_TEMPLATE);
  for (const pattern of Object.keys(TRIM_PATTERNS)) {
    assert.equal(resolveSmithingTemplate(pattern), pattern, `${pattern} resolves to itself`);
    assert.equal(resolveSmithingTemplate(TRIM_PATTERNS[pattern]), pattern, `${TRIM_PATTERNS[pattern]} resolves to its template`);
  }
  assert.equal(resolveSmithingTemplate('sentry_armor_trim'), 'sentry_armor_trim_smithing_template');
});

test('a name that is not one of the 19 templates does not resolve, so a typo cannot become another template', () => {
  for (const bad of ['bogus', 'sentryy', 'netherite', 'diamond_chestplate', '', null, undefined]) {
    assert.equal(resolveSmithingTemplate(bad), null, `${String(bad)} resolves to nothing`);
  }
});

// --- every id the bot can name is a real item -------------------------------------

test('every smithing template and trim material is a registered item, so the bot can always name it', () => {
  for (const template of [NETHERITE_UPGRADE_TEMPLATE, ...Object.keys(TRIM_PATTERNS)]) {
    assert.ok(ITEMS[template], `${template} is an item`);
  }
  for (const material of Object.keys(TRIM_MATERIALS)) {
    assert.ok(ITEMS[material], `${material} is an item`);
  }
  assert.ok(ITEMS.netherite_ingot, 'the netherite ingot is an item');
});

// --- the table's rules, in the form the bot runs them -----------------------------

test('the upgrade and the trim are the two operations the bot can run, and the template is kept only by the upgrade', () => {
  const diamond = { id: 'diamond_chestplate', count: 1, maxDurability: 528, durability: 528 };
  const upgrade = calculateSmithingResult({ id: NETHERITE_UPGRADE_TEMPLATE, count: 1 }, diamond, { id: 'netherite_ingot', count: 1 });
  assert.equal(upgrade.valid, true);
  assert.equal(upgrade.templateSurvives, true);
  const trim = calculateSmithingResult({ id: 'sentry_armor_trim_smithing_template', count: 1 }, { id: 'iron_chestplate', count: 1 }, { id: 'gold_ingot', count: 1 });
  assert.equal(trim.valid, true);
  assert.equal(trim.templateSurvives, false);
});

// --- netherite is fireproof when dropped -------------------------------------------

test('netherite items survive lava and fire, and nothing else does', () => {
  for (const id of ['netherite_ingot', 'netherite_sword', 'netherite_chestplate', 'netherite_pickaxe']) {
    assert.equal(isFireproof(id), true, `${id} is fireproof`);
  }
  assert.equal(isFireproof(NETHERITE_UPGRADE_TEMPLATE), false, 'the upgrade template is a template, and burns');
  for (const id of ['diamond_chestplate', 'iron_ingot', 'gold_ingot', 42, null, undefined]) {
    assert.equal(isFireproof(id), false, `${String(id)} burns`);
  }
});

test('the dropped-item physics reads isFireproof before it destroys an item in lava or fire', () => {
  const entities = read('src/entities.js');
  assert.match(entities, /import \{ isFireproof \} from '\.\/smithing\.js'/, 'the rule is imported');
  assert.match(entities, /\(contact===BLOCKS\.LAVA\|\|contact===BLOCKS\.FIRE\)&&!isFireproof\(item\.itemType\)/,
    'and a drop in lava or fire is removed only when it is not fireproof');
});

// --- the cost of an upgrade -------------------------------------------------------

test('smithing spends no experience: the table and the bot never touch the experience level', () => {
  const ui = read('src/ui.js');
  const start = ui.indexOf('takeSmithingOutput(calculation) {');
  const body = ui.slice(start, ui.indexOf('\n  }\n', start));
  assert.ok(start > 0, 'takeSmithingOutput exists');
  assert.doesNotMatch(body, /xp|experience/i, 'taking the output charges no experience');
  const survival = read('src/playerBotSurvival.js');
  // Bounded by the next branch: the anvil branch that follows says "Too Expensive!", which contains "xp".
  const smithAt = survival.indexOf("} else if (c.type === 'smith') {");
  const smith = survival.slice(smithAt, survival.indexOf("} else if (c.type === '", smithAt + 10));
  assert.ok(smith.length > 0, 'the bot branch exists');
  assert.doesNotMatch(smith, /xp|experience/i, 'and the bot charges none either');
});
