// Step 3 of the AI-brain plan: plans as JSON rules over general facts (agentArena/plans/planRunner.mjs, facts.mjs), run by
// fast code with the scripted playbook as the fallback, and the slow thinker that asks a model for them on events
// (agentArena/plans/thinker.mjs). The model here is a stub; the bots are the recorded fakes of tests/helpers/botFake.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, holds, runPlan, resolveTarget } from '../agentArena/plans/planRunner.mjs';
import { computeFacts } from '../agentArena/plans/facts.mjs';
import { SlowThinker, extractJson, describeForModel } from '../agentArena/plans/thinker.mjs';
import { PLAYBOOKS, ScriptedBotSession, createBotSkills as createSkills } from '../agentArena/scriptedBot/scriptedBot.mjs';
import { buildView } from '../agentArena/skills/view.mjs';
import { skywarsScenario, bedwarsScenario } from './helpers/botFake.js';

/** A SkyWars scenario that is in play, with me able to act, and the given foes. */
function playingSkyWars(seed, { enemies } = {}) {
  for (let s = seed; s < seed + 500; s++) {
    const bot = skywarsScenario(s)();
    const view = buildView(bot);
    if (view?.phase === 'playing' && view.me.canAct && (enemies === undefined || (enemies ? bot.findAliveEnemies().length > 0 : bot.findAliveEnemies().length === 0))) return { bot, view, seed: s };
  }
  throw new Error('no such scenario');
}

// --- checking plans ----------------------------------------------------------------------------------------------

test('a plan is checked before it runs: what is wrong is said, and the defaults are filled in', () => {
  const ok = validatePlan({ rules: [{ when: { fact: 'me.health', op: '<', value: 6 }, do: 'flee', target: { enemy: 'nearest' } }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.plan.reflexes, { fightWithin: 3.5 });
  assert.deepEqual(ok.plan.otherwise, { do: 'default' });
  assert.equal(ok.plan.rules[0].id, 'rule-1');
  const bad = validatePlan({ rules: [
    { when: { fact: 'me.health', op: '=<', value: 6 }, do: 'flee' },
    { when: { fact: 'x' }, do: 'teleport' },
    { when: { all: [] }, do: 'loot', target: { objective: 'chest', pick: 'best' } },
    { do: 'buy' },
  ], reflexes: { fightWithin: 99 } });
  assert.equal(bad.ok, false);
  for (const words of ['"op"', 'a number "value"', '.do: one of', 'an empty all', '.pick', '.item', 'fightWithin']) assert.ok(bad.errors.some((e) => e.includes(words)), words);
  assert.equal(validatePlan([]).ok, false);
  assert.equal(validatePlan({ rules: Array.from({ length: 30 }, () => ({ do: 'wait' })) }).ok, false, 'at most 24 rules');
});

test('conditions: all, any, not; a count of something the round lacks is 0, a distance Infinity; an unknown fact is false', () => {
  const f = { 'me.health': 8, 'chest.mine.open': 2 };
  assert.equal(holds({ fact: 'me.health', op: '<', value: 10 }, f), true);
  assert.equal(holds({ all: [{ fact: 'me.health', op: '<', value: 10 }, { fact: 'chest.mine.open', op: '>', value: 2 }] }, f), false);
  assert.equal(holds({ any: [{ fact: 'me.health', op: '>', value: 10 }, { fact: 'chest.mine.open', op: '==', value: 2 }] }, f), true);
  assert.equal(holds({ not: { fact: 'me.health', op: '<', value: 10 } }, f), false);
  assert.equal(holds({ fact: 'bed.enemy.open', op: '==', value: 0 }, f), true, 'no beds in this round: none open');
  assert.equal(holds({ fact: 'bed.enemy.nearest', op: '>', value: 1000 }, f), true);
  assert.equal(holds({ fact: 'made.up', op: '<', value: 1 }, f), false);
  assert.equal(holds({ fact: 'me.health', op: '<', valueFact: 'chest.mine.open' }, f), false);
});

test('facts are general: SkyWars chests on my island are mine, the middle\'s nobody\'s; Bed Wars beds are mine and the enemy\'s', () => {
  const { view, bot } = playingSkyWars(1);
  const f = computeFacts(view, bot.findAliveEnemies(), bot);
  const mine = view.objectives.filter((o) => o.slot === view.me.slot);
  assert.equal(f['chest.mine.count'], mine.length);
  assert.equal(f['chest.mine.open'], mine.filter((o) => !o.looted).length);
  assert.equal(f['chest.neutral.count'], view.objectives.filter((o) => o.slot === null).length);
  assert.ok(Number.isFinite(f['place.middle.dist']));
  assert.ok(!Object.keys(f).some((k) => /skywars|slot/i.test(k)), 'no game words in the facts');
  for (let s = 1; s < 100; s++) {
    const b = bedwarsScenario(s)(); const v = buildView(b);
    if (v?.phase !== 'playing' || !v.me.team) continue;
    const g = computeFacts(v, b.findAliveEnemies(), b);
    assert.equal(g['bed.mine.count'], 1);
    assert.equal(g['bed.enemy.count'], v.objectives.filter((o) => o.kind === 'bed').length - 1);
    assert.equal(g['generator.neutral.count'], v.objectives.filter((o) => o.kind === 'generator' && !o.team).length);
    return;
  }
  assert.fail('no Bed Wars scenario in play');
});

// --- running plans -----------------------------------------------------------------------------------------------

test('a plan\'s first rule that holds and can be done is done: here, the highest neutral chest, bridging', async () => {
  const { bot, view } = playingSkyWars(1, { enemies: false });
  const plan = validatePlan({ reflexes: { fightWithin: 0 }, rules: [
    { id: 'never', when: { fact: 'me.health', op: '>', value: 100 }, do: 'wait' },
    { id: 'no-such', when: true, do: 'loot', target: { objective: 'flag' } },
    { id: 'high', when: true, do: 'loot', target: { objective: 'chest', relation: 'neutral', pick: 'highest' }, bridge: true },
  ] }).plan;
  const r = await runPlan({ plan, view, skills: createSkills(bot), fallback: PLAYBOOKS.skywars, session: bot });
  assert.deepEqual([r.by, r.action], ['high', 'loot']);
  const loot = bot.log.find((e) => e[0] === 'loot');
  const top = Math.max(...view.objectives.filter((o) => o.slot === null && !o.looted).map((o) => o.at[1]));
  assert.equal(loot[2], top);
  assert.equal(loot[4], true, 'bridging');
});

test('the reflex: a foe within reach is fought first, whatever the rules say', async () => {
  const { bot, view } = playingSkyWars(1, { enemies: true });
  const foe = bot.findAliveEnemies()[0];
  bot.findAliveEnemies = () => [{ ...foe, x: view.me.at.x + 2, z: view.me.at.z }];
  const plan = validatePlan({ rules: [{ when: true, do: 'wait' }] }).plan;
  const r = await runPlan({ plan, view, skills: createSkills(bot), fallback: PLAYBOOKS.skywars, session: bot });
  assert.equal(r.by, 'reflex');
  assert.ok(bot.log.some((e) => e[0] === 'fight'));
});

test('with no plan, or "default", the bot plays exactly as the scripted playbook', async () => {
  for (const seed of [3, 11, 29, 57]) {
    const a = skywarsScenario(seed)(), b = skywarsScenario(seed)(), c = skywarsScenario(seed)();
    await PLAYBOOKS.skywars({ view: buildView(a), skills: createSkills(a) });
    await runPlan({ plan: null, view: buildView(b), skills: createSkills(b), fallback: PLAYBOOKS.skywars, session: b });
    const def = validatePlan({ reflexes: { fightWithin: 0 }, rules: [] }).plan;
    await runPlan({ plan: def, view: buildView(c), skills: createSkills(c), fallback: PLAYBOOKS.skywars, session: c });
    assert.deepEqual(b.log, a.log, `no plan, seed ${seed}`);
    // A plan heals first, then hands over: the same actions, and one more heal.
    assert.deepEqual(c.log.filter((e) => e[0] !== 'heal'), a.log.filter((e) => e[0] !== 'heal'), `default, seed ${seed}`);
  }
});

test('targets: the nearest foe, a place, an objective by tag; nothing when there is none', () => {
  const { view } = playingSkyWars(1);
  const enemies = [{ id: 'a', x: view.me.at.x + 10, y: 31, z: view.me.at.z, health: 20 }, { id: 'b', x: view.me.at.x + 3, y: 40, z: view.me.at.z, health: 5 }];
  assert.equal(resolveTarget({ enemy: 'nearest' }, view, enemies).player.id, 'b');
  assert.equal(resolveTarget({ enemy: 'weakest' }, view, enemies).player.id, 'b');
  assert.equal(resolveTarget({ enemy: 'lowest' }, view, enemies).player.id, 'a');
  assert.equal(resolveTarget({ place: 'middle' }, view, enemies).place.kind, 'middle');
  const centre = resolveTarget({ objective: 'chest', where: { ring: 'center' } }, view, []);
  assert.equal(centre?.objective.ring ?? 'center', 'center');
  assert.equal(resolveTarget({ objective: 'flag' }, view, []), null);
  assert.equal(resolveTarget({ enemy: 'nearest' }, view, []), null);
});

// --- the slow thinker ----------------------------------------------------------------------------------------------

const PLAN = { intent: 'loot the middle', rules: [{ id: 'mid', when: true, do: 'loot', target: { objective: 'chest', relation: 'neutral' } }] };
const settle = () => new Promise((r) => setTimeout(r, 0));

test('the thinker asks when the round starts, installs a good plan, and does not ask again for nothing', async () => {
  let t = 0; const asked = [];
  const thinker = new SlowThinker({ ask: async (sys, user) => { asked.push(user); return `Here is my plan:\n\`\`\`json\n${JSON.stringify(PLAN)}\n\`\`\``; }, clock: () => t, minIntervalMs: 5000 });
  const { bot, view } = playingSkyWars(1);
  thinker.observe(view, [], bot);
  await settle();
  assert.equal(asked.length, 1);
  assert.match(asked[0], /SINCE YOUR LAST PLAN: the round started/);
  assert.equal(thinker.plan.intent, 'loot the middle');
  t += 10000; thinker.observe(view, [], bot); await settle();
  assert.equal(asked.length, 1, 'nothing changed: no question');
  assert.ok(thinker.history[0].reasons.some((r) => /round started/.test(r)), 'asked because the round started');
});

test('it asks again on events: a foe out, a bed broken, chests refilled, hurt, the plan old or stuck -- at most so often', async () => {
  let t = 0; const reasons = [];
  const thinker = new SlowThinker({ ask: async () => JSON.stringify(PLAN), clock: () => t, minIntervalMs: 5000, ttlMs: 30000 });
  const { bot, view } = playingSkyWars(1);
  thinker.observe(view, [], bot); await settle();
  const again = async (mutate, dt = 6000) => {
    t += dt;
    const v = structuredClone({ ...view, me: { ...view.me, carrying: undefined } });
    v.me.carrying = view.me.carrying; v.me.canAct = true;
    mutate(v);
    thinker.observe(v, [], bot); await settle();
    reasons.push(thinker.history.at(-1).reasons.join(' | '));
  };
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); });
  assert.match(reasons.at(-1), /a foe died/);
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); v.objectives = v.objectives.map((o) => ({ ...o, looted: false })); });
  assert.match(reasons.at(-1), /chests became available/);
  bot.health = 6;
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); v.objectives = v.objectives.map((o) => ({ ...o, looted: false })); });
  assert.match(reasons.at(-1), /I am hurt/);
  bot.health = 20;
  for (let i = 0; i < 12; i++) thinker.noteResult({ by: 'mid', action: 'loot' }, false);
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); v.objectives = v.objectives.map((o) => ({ ...o, looted: false })); });
  assert.match(reasons.at(-1), /has not moved/);
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); v.objectives = v.objectives.map((o) => ({ ...o, looted: false })); }, 31000);
  assert.match(reasons.at(-1), /ran its time/);
  // Too soon after the last question: the reason waits.
  const n = thinker.history.length;
  bot.health = 6;
  await again((v) => { v.players = v.players.map((p) => (p.id === 'foe' ? { ...p, alive: false } : p)); v.objectives = v.objectives.map((o) => ({ ...o, looted: false })); }, 1000);
  assert.equal(thinker.history.length, n, 'within minIntervalMs');
});

test('a bad answer is sent back once with what was wrong; a second bad one leaves the old plan', async () => {
  const answers = ['I think you should loot.', JSON.stringify({ rules: [{ do: 'teleport' }] })];
  const asked = [];
  const thinker = new SlowThinker({ ask: async (s, u) => { asked.push(u); return answers.shift() ?? ''; } });
  const { bot, view } = playingSkyWars(1);
  thinker.observe(view, [], bot); await settle(); await settle();
  assert.equal(asked.length, 2);
  assert.match(asked[1], /not a valid plan: no JSON object/);
  assert.equal(thinker.plan, null);
  assert.ok(thinker.history[0].errors.some((e) => e.includes('.do')));
});

test('a model that fails or is slow costs only its plan: the bot keeps playing meanwhile', async () => {
  let release;
  const thinker = new SlowThinker({ ask: () => new Promise((r) => { release = r; }) });
  const { bot, view } = playingSkyWars(1);
  thinker.observe(view, [], bot);
  assert.equal(thinker.busy, true);
  const r = await runPlan({ plan: thinker.plan, view, skills: createSkills(bot), fallback: PLAYBOOKS.skywars, session: bot });
  assert.equal(r.by, 'fallback');
  release(JSON.stringify(PLAN)); await settle(); await settle();
  assert.equal(thinker.plan.intent, 'loot the middle');
  const broken = new SlowThinker({ ask: async () => { throw new Error('network down'); } });
  broken.observe(view, [], bot); await settle(); await settle();
  assert.deepEqual(broken.history[0].errors, ['network down']);
  assert.equal(broken.busy, false);
});

test('what the model is shown: the rules, the facts, objectives and places in general words, its last plan and how it went', () => {
  const { bot, view } = playingSkyWars(1);
  const facts = computeFacts(view, [], bot);
  const text = describeForModel(view, facts, [], { events: ['a foe died'], lastPlan: PLAN, lastStats: { mid: 4 }, notes: 'take the middle early' });
  for (const part of ['GAME: skywars', 'last player alive', 'FACTS: ', 'chest.mine.open=', 'OBJECTIVES', 'PLACES', 'a foe died', '"mid":4', 'take the middle early']) assert.ok(text.includes(part), part);
  assert.ok(!/skywarsState|lootedChestKeys|bedwarsArena/.test(text));
  assert.deepEqual(extractJson('noise {"a": {"b": 1}} trailing'), { a: { b: 1 } });
  assert.equal(extractJson('none here'), null);
});

test('the scripted bot\'s planner brain: the thinker plans, the runner plays the plan', async () => {
  const { bot } = playingSkyWars(1, { enemies: false });
  const thinker = new SlowThinker({ ask: async () => JSON.stringify({ reflexes: { fightWithin: 0 }, rules: [{ id: 'mid', when: true, do: 'goTo', target: { place: 'middle' } }] }) });
  const real = new ScriptedBotSession({ code: '0000', url: 'ws://127.0.0.1:1/x', brain: 'planner', planner: thinker });
  assert.equal(real.brainKind, 'planner');
  assert.equal(real.thinker, thinker);
  // The fake bot, given the planner brain.
  Object.assign(bot, { brainKind: 'planner', thinker, playbooks: PLAYBOOKS, skillSet: createSkills(bot), connected: true, noteLand() {}, pearlClutch: () => false });
  const random = Math.random; Math.random = () => 0;
  try {
    await bot.runBrainTick(); await settle(); await settle();
    await bot.runBrainTick();
  } finally { Math.random = random; }
  assert.equal(thinker.history.length, 1);
  assert.equal(bot.lastPlanStep.by, 'mid');
  assert.ok(bot.log.some((e) => e[0] === 'move'));
});
