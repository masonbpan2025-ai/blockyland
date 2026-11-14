// The library of bots the AI models wrote in the Agent Arena (agentArena/bots/ai/), which the lobby's "Bot join" plays:
// kept with the code (a run's folder is not), loadable in any checkout, held to the game's limits, and able to play
// every mode the lobby offers -- SkyWars, and Bed Wars with teams of one to four, which they were never written for.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { AI_BOTS, aiBot, drawBot, entryUrl } from '../agentArena/bots/ai/index.mjs';
import { relativiseImports } from '../agentArena/bots/ai/collect.mjs';
import { BOT_SKILLS } from '../agentArena/scriptedBot/base.mjs';
import { bedwarsScenario, skywarsScenario } from './helpers/botFake.js';
import { MODES } from '../src/mods/bedwars/teams.js';
import { normalizeMap } from '../src/mods/bedwars/arena.js';

const repo = path.resolve(import.meta.dirname, '..');
const library = path.join(repo, 'agentArena', 'bots', 'ai');
const viewOf = async (bot) => import(new URL('../skills/view.mjs', entryUrl(bot)).href);
const tick = (p, ms = 5000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`a playbook tick took more than ${ms} ms`)), ms))]);

test('collecting a bot makes its imports of the game relative to its own file', () => {
  const file = path.join(repo, 'agentArena', 'bots', 'ai', 'bedwars', 'Opus', 'scriptedBot', 'scriptedBot.mjs');
  const src = "import { X } from 'file:///D:/elsewhere/Minecraft_in_browser/packages/blockyland-mcp/guestPeer.js';\nimport y from './own.mjs';";
  const out = relativiseImports(src, file, repo);
  assert.match(out, /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/packages\/blockyland-mcp\/guestPeer\.js'/);
  assert.match(out, /from '\.\/own\.mjs'/, 'its own imports untouched');
});

test('the library holds no machine-specific path, and every bot loads with the API the game runs', async () => {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(f)) files.push(p); } };
  walk(library);
  assert.ok(files.length > 20);
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /['"]file:\/\//, `${path.relative(repo, f)} imports a file:// URL`);
  for (const [game, bots] of Object.entries(AI_BOTS)) {
    assert.deepEqual(bots.map((b) => b.name), ['Opus', 'Sol', 'Gemini', 'DeepSeek', 'Scripted'], `${game}: the four AI bots and the scripted bot`);
    for (const bot of bots) {
      const M = await import(entryUrl(bot));
      for (const name of ['ScriptedBotSession', 'createBotSkills']) assert.equal(typeof M[name], 'function', `${game}/${bot.name} exports ${name}`);
      assert.equal(typeof M.PLAYBOOKS?.[game], 'function', `${game}/${bot.name} has a ${game} playbook`);
      assert.deepEqual(M.BOT_SKILLS, BOT_SKILLS, `${game}/${bot.name} keeps the game's skills and pace`);
    }
  }
});

test('a bot is drawn at random from all five; one is found by name', () => {
  for (const game of ['skywars', 'bedwars']) {
    const drawn = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map((r) => drawBot(game, () => r).name);
    assert.deepEqual(drawn, ['Opus', 'Sol', 'Gemini', 'DeepSeek', 'Scripted', 'Scripted']);
    assert.equal(aiBot(game, 'gemini')?.name, 'Gemini');
    assert.equal(aiBot(game, 'nobody'), null);
  }
  assert.throws(() => drawBot('chess'));
});

test('every SkyWars bot plays recorded rounds without failing', async () => {
  for (const bot of AI_BOTS.skywars) {
    const M = await import(entryUrl(bot)), V = await viewOf(bot);
    let ran = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const b = skywarsScenario(seed)(M.ScriptedBotSession), view = V.buildView(b);
      if (!view) continue;
      await tick(M.PLAYBOOKS.skywars({ view, skills: M.createBotSkills(b) }));
      ran++;
    }
    assert.ok(ran >= 20, `${bot.name}: ${ran} rounds`);
  }
});

test('every Bed Wars bot plays every mode, in a team of one to four, without failing', async () => {
  for (const bot of AI_BOTS.bedwars) {
    const M = await import(entryUrl(bot)), V = await viewOf(bot);
    for (const [mode, info] of Object.entries(MODES)) {
      const map = normalizeMap({ teams: info.teams });
      for (let mates = 0; mates < info.size; mates++) {
        let ran = 0;
        for (let seed = 1; seed <= 6; seed++) {
          const b = bedwarsScenario(seed, { mates, map, mode })(M.ScriptedBotSession), view = V.buildView(b);
          if (!view) continue;
          await tick(M.PLAYBOOKS.bedwars({ view, skills: M.createBotSkills(b) }));
          ran++;
        }
        assert.ok(ran > 0, `${bot.name} in ${mode}, a team of ${mates + 1}: no round played`);
      }
    }
  }
});

test('every Bed Wars bot shares out its jobs in a team of one, two or three', async () => {
  const view = (n, me) => {
    const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Player${i}`, team: 'red', alive: true }));
    return { me: players[me], players };
  };
  for (const bot of AI_BOTS.bedwars) {
    const P = await import(new URL('./playbooks/bedwars.mjs', entryUrl(bot)).href);
    if (typeof P.teamRole !== 'function') continue;
    assert.equal(P.teamRole(view(1, 0)), 'solo', `${bot.name}: alone, it plays every job`);
    const two = [P.teamRole(view(2, 0)), P.teamRole(view(2, 1))];
    assert.ok(two.includes('rusher') && two.some((r) => r === 'defender' || r === 'anchorman'), `${bot.name} in a team of two: ${two}`);
    const three = [0, 1, 2].map((i) => P.teamRole(view(3, i)));
    assert.ok(three.includes('collector') && three.includes('rusher'), `${bot.name} in a team of three: ${three}`);
  }
});

test('Sol raids alone in a team of two (it used to wait for a rush partner it never had)', async () => {
  const sol = aiBot('bedwars', 'Sol');
  const M = await import(entryUrl(sol)), V = await viewOf(sol);
  let raids = 0, tried = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const b = bedwarsScenario(seed, { mates: 1 })(M.ScriptedBotSession);
    const st = b.bedwarsState, me = st.players.find((p) => p.id === 'me');
    if (st.phase !== 'playing' || !me.team) continue;
    // Mid-game, every bed standing, on the middle with the blocks and health for a raid, no foe near: the rusher
    // (named after its teammate) of a team of two.
    me.alive = true;
    for (const p of st.players) if (p.id === 'mate-1') Object.assign(p, { alive: true, name: 'Mate1' });
    st.elapsed = 150;
    for (const t of st.teams) t.bed = true;
    b.position = { x: 0.5, y: 31, z: 0.5 };
    b.health = 20;
    b.inventory.counts.set('wool', 100);
    b.findAliveEnemies = () => [];
    for (const p of b.peers.values()) { p.x = 200; p.z = 200; }
    const view = V.buildView(b);
    if (!view) continue;
    tried++;
    await M.PLAYBOOKS.bedwars({ view, skills: M.createBotSkills(b) });
    if (/raid/.test(b.lastActionSummary ?? '')) raids++;
  }
  assert.ok(tried >= 10, `${tried} situations`);
  assert.ok(raids >= tried / 3, `Sol raided in ${raids} of ${tried}`);
});
