// The scripted bot (agentArena/scriptedBot/): the baseline bot of SkyWars and Bed Wars -- the lobby's "Bot join" bot and
// the starting point of every Agent Arena agent's own (agentArena/scriptedArena.mjs). Its playbooks see only the
// general view and act only through skills; its limits are the base layer's; it plays every recorded round of the
// skills tests without failing. The skill library and the view it is built on are tested here too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as Bot from '../agentArena/scriptedBot/scriptedBot.mjs';
import * as Base from '../agentArena/scriptedBot/base.mjs';
import { createSkills, SKILL_NAMES } from '../agentArena/skills/skills.mjs';
import { buildView, roundOf } from '../agentArena/skills/view.mjs';
import { BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';
import { fakeBot, skywarsScenario, bedwarsScenario } from './helpers/botFake.js';

test('it is built on the base layer: its limits, every library skill, its own playbooks, played by default', () => {
  assert.deepEqual(Bot.BOT_SKILLS, Base.BOT_SKILLS);
  const s = new Bot.ScriptedBotSession({ code: '0000', url: 'ws://127.0.0.1:1/x' });
  assert.ok(s instanceof Base.ScriptedBotBase);
  assert.equal(s.playbooks, Bot.PLAYBOOKS);
  assert.equal(s.brainKind, 'skills');
  for (const n of Object.values(SKILL_NAMES).flat()) assert.equal(typeof s.skillSet[n], 'function', n);
  for (const d of ['easy', 'normal', 'hard']) {
    const a = new Base.ScriptedBotBase({ code: '0000', url: 'ws://127.0.0.1:1/x' });
    a.setDifficulty(d); s.setDifficulty(d);
    assert.deepEqual(JSON.parse(JSON.stringify(s.profile)), JSON.parse(JSON.stringify(a.profile)), d);
  }
  assert.equal(Bot.HouseAutopilotSession, Bot.ScriptedBotSession, 'the name older match code loads a bot by');
});

test('its playbooks see only the view and act only through skills', () => {
  const dir = new URL('../agentArena/scriptedBot/playbooks/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /\b(skywarsState|bedwarsState|bedwarsArena|lootedChestKeys|session|this)\b|\bbot\.|\.inventory\b|\.peers\b/, f);
  }
});

test('it plays all 700 recorded rounds without failing, and acts in the rounds it is in', async () => {
  let acted = 0, playing = 0;
  for (const [game, make, n] of [['skywars', skywarsScenario, 300], ['bedwars', bedwarsScenario, 400]]) for (let seed = 1; seed <= n; seed++) {
    const bot = make(seed)(Bot.ScriptedBotSession);
    const view = buildView(bot);
    if (!view) continue;
    await Bot.PLAYBOOKS[game]({ view, skills: Bot.createBotSkills(bot) });
    if (view.phase === 'playing' && view.me.canAct) { playing++; if (bot.log.some((e) => e[0] !== 'heal')) acted++; }
  }
  assert.ok(playing > 400, `${playing} rounds in play`);
  assert.ok(acted / playing > 0.9, `acted in ${acted} of ${playing}`);
});

test('the lobby\'s Bot join plays it, beside the bots the AI models wrote (agentArena/bots/ai/index.mjs)', async () => {
  const { AI_BOTS } = await import('../agentArena/bots/ai/index.mjs');
  const { fileURLToPath } = await import('node:url');
  const here = fileURLToPath(new URL('../agentArena/scriptedBot/scriptedBot.mjs', import.meta.url));
  for (const game of ['skywars', 'bedwars']) {
    const scripted = AI_BOTS[game].find((b) => b.name === 'Scripted');
    assert.ok(scripted, `${game}: the scripted bot is one of the five`);
    assert.equal(scripted.entry.toLowerCase(), here.toLowerCase());
  }
});

// --- the skills and the view, on their own ---------------------------------------------------------------------------

test('every skill named in the list is there, and there are no others', () => {
  const bot = fakeBot({ difficulty: 'normal', gameMode: 'skywars', position: { x: 0, y: 31, z: 0 }, items: {}, enemies: [], voxels: [], round: { fields: {} }, general: null, kit: {} });
  const skills = createSkills(bot);
  const named = Object.values(SKILL_NAMES).flat();
  assert.deepEqual([...named].sort(), Object.keys(skills).sort());
});

test('the view is the general state and the bot: no game\'s own fields', () => {
  const bot = skywarsScenario(7)();
  const view = buildView(bot);
  assert.deepEqual(Object.keys(view).sort(), ['elapsed', 'game', 'me', 'memory', 'next', 'objectives', 'phase', 'places', 'players', 'rules', 'teams', 'timeLeft'].sort());
  assert.equal(view.game, 'skywars');
  assert.ok(view.rules.text.includes('last player alive'));
  assert.ok(view.objectives.every((o) => o.kind === 'chest' && Array.isArray(o.at)));
  assert.equal(roundOf(bot), bot.generalState, 'the mod\'s own description first');
});

test('flee goes away from the danger; follow stops short of the player; guard returns to its post', async () => {
  const bot = fakeBot({ difficulty: 'normal', gameMode: 'skywars', position: { x: 0, y: 31, z: 0 }, items: {}, enemies: [], voxels: [], round: { fields: {} }, general: null, kit: {} });
  const skills = createSkills(bot);
  await skills.flee([4, 31, 0], { distance: 6 });
  const [, x, , z] = bot.log.at(-1);
  assert.ok(x < -5.9 && Math.abs(z) < 1e-9, `fled to ${x}, ${z}`);
  await skills.follow({ id: 'a', x: 10, y: 31, z: 0 }, { distance: 4 });
  assert.equal(bot.log.at(-1)[5], 4, 'stops 4 short');
  await skills.guard([20, 31, 0], { radius: 6 });
  assert.equal(bot.log.at(-1)[0], 'move');
  assert.equal(bot.lastActionSummary, 'back to guard');
});

test('hide finds a spot with a wall between it and the danger, and none in the open', async () => {
  const wall = [];
  for (let y = 31; y <= 33; y++) for (let z = -3; z <= 3; z++) wall.push([`2,${y},${z}`, 1]);
  const floor = [];
  for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) floor.push([`${x},30,${z}`, 1]);
  const open = fakeBot({ difficulty: 'normal', gameMode: 'skywars', position: { x: 0.5, y: 31, z: 0.5 }, items: {}, enemies: [], voxels: floor, round: { fields: {} }, general: null, kit: {} });
  open.groundAt = (x, y, z) => open.isSolid(Math.floor(x), Math.floor(y) - 1, Math.floor(z));
  assert.equal(await createSkills(open).hide([8.5, 31, 0.5], { radius: 4 }), false, 'no cover in the open');
  const walled = fakeBot({ difficulty: 'normal', gameMode: 'skywars', position: { x: 0.5, y: 31, z: 0.5 }, items: {}, enemies: [], voxels: [...floor, ...wall], round: { fields: {} }, general: null, kit: {} });
  walled.groundAt = (x, y, z) => walled.isSolid(Math.floor(x), Math.floor(y) - 1, Math.floor(z));
  assert.equal(await createSkills(walled).hide([8.5, 31, 0.5], { radius: 4 }), true);
  const [, x] = walled.log.at(-1);
  assert.ok(x < 2, `behind the wall at x ${x}`);
});
