#!/usr/bin/env node
// A second round of coding for a Bed Wars arena series (bedwarsArena.mjs), then its five games again on new maps.
//
// For when the first round's coding was not fair to everyone, or the game changed under the bots:
// - the agents named by --fresh code again from the start, in a new workspace, for --minutes (as a first round does);
// - every other agent keeps its workspace and its session: the arena first plays --preplay practice games of its frozen
//   bot (full five-team games, on the layouts of --preplay-layouts), then resumes its session for --refine-minutes with
//   --refine-practice more practice games of its own, told what changed (the prompt names it).
// Practice is served fairly (scriptedPractice.mjs servePractice): two games at a time, the agent with the fewest games
// first; the arena's own games only in a spare slot. Then each bot is frozen into runs/<run>/bots/ and bedwarsArena.mjs
// plays the games (new seeds).
//
//   node agentArena/bedwarsRefine.mjs --from bedwars-five --run bedwars-five-r2 --fresh Opus [--minutes 60] [--practice 5]
//        [--refine-minutes 40] [--refine-practice 2] [--preplay 2] [--preplay-layouts highmid,archipelago]
//        [--practice-time 6] [--time-limit 10] [--difficulty hard] [--port 3195] [--no-games]
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeWorkspace, prepare } from './bedwarsArena.mjs';
import { servePractice } from './scriptedPractice.mjs';
import { parsePlayers, auditTranscript, INSTRUCTIONS, check } from './scriptedArena.mjs';
import { LAYOUT_IDS } from '../src/mods/bedwars/layouts.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);
const repo = path.resolve(import.meta.dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** skills.breakBed as the first round's bots have it (the bed hit in the same tick as its cover). */
const OLD_BREAK_BED = `    /** Break a bed at \`at\` (its foot), and first whatever covers it. */
    breakBed(at, { summary = null } = {}) {
      const [bx, by, bz] = at;
      const top = bot.getVoxel(bx, by + 1, bz);
      if (top !== BLOCKS.AIR && !BED_BLOCK_IDS.has(top)) bot.breakBlockAt(bx, by + 1, bz);
      say(summary);
      const r = bot.breakBlockAt(bx, by, bz);
      if (r?.ok || !/covered/.test(r?.reason ?? '')) return r;`;
const OLD_BREAK_BED_END = `      if (!covers.length) return r;
      const dug = bot.breakBlockAt(...covers[0].c);
      return { ...r, dug: dug?.ok ? covers[0].c : null };`;

/**
 * The game's digging now takes time: a bot's skills.breakBed, if still the one it was given, becomes the repository's
 * (the same skill, digging on call after call). True when it was replaced.
 */
export function updateBreakBed(file) {
  const src = readFileSync(file, 'utf8'), lf = src.replace(/\r\n/g, '\n');
  if (!lf.includes(OLD_BREAK_BED) || !lf.includes(OLD_BREAK_BED_END)) return false;
  const repoSkills = readFileSync(path.join(repo, 'agentArena', 'skills', 'skills.mjs'), 'utf8').replace(/\r\n/g, '\n');
  const neu = /( {4}\/\*\*\n {5}\* Dig at a bed[\s\S]*?\n {4}\},\n)/.exec(repoSkills)?.[1];
  const start = lf.indexOf(OLD_BREAK_BED), end = lf.indexOf(OLD_BREAK_BED_END, start) + OLD_BREAK_BED_END.length;
  const close = lf.indexOf('\n    },\n', end) + '\n    },\n'.length;
  if (!neu || close < end) return false;
  writeFileSync(file, lf.slice(0, start) + neu + lf.slice(close));
  return true;
}

async function main() {
  const from = opt('from');
  if (!from) throw new Error('--from <run> names the first round');
  const fromDir = path.join(repo, 'agentArena', 'runs', from);
  const old = JSON.parse(readFileSync(path.join(fromDir, 'state.json'), 'utf8'));
  const oldSummary = JSON.parse(readFileSync(path.join(fromDir, 'summary.json'), 'utf8'));
  const playersSpec = oldSummary.players.map((p) => (p.harness === 'scripted' ? `${p.name}:scripted` : `${p.name}:${p.harness}:${p.model}${p.effort ? `:${p.effort}` : ''}`)).join(',');
  const players = parsePlayers(playersSpec);
  const fresh = new Set(String(opt('fresh', '')).split(',').filter(Boolean));
  const difficulty = opt('difficulty', oldSummary.difficulty ?? 'hard');
  const timeLimit = Math.round(Number(opt('time-limit', (oldSummary.timeLimit ?? 600) / 60)) * 60);
  const practiceTime = Number(opt('practice-time', 6)), minutes = Number(opt('minutes', 60)), practiceLimit = Number(opt('practice', 5));
  const refineMinutes = Number(opt('refine-minutes', 40)), refinePractice = Number(opt('refine-practice', 2)), preplay = Number(opt('preplay', 2));
  const preLayouts = String(opt('preplay-layouts', 'highmid,archipelago')).split(',').filter((l) => LAYOUT_IDS.includes(l));
  const port = Number(opt('port', 3195));
  const run = opt('run', `${from}-r2`);
  const runDir = path.join(repo, 'agentArena', 'runs', run);
  mkdirSync(runDir, { recursive: true });
  const log = (m) => { const l = `${new Date().toISOString()} ${m}`; console.log(l); appendFileSync(path.join(runDir, 'arena.log'), `${l}\n`); };
  const statePath = path.join(runDir, 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const save = () => writeFileSync(statePath, JSON.stringify(state, null, 2));
  const agents = players.filter((p) => p.harness !== 'scripted');
  log(`second round of ${from} as ${run}: ${[...fresh].join(', ') || 'nobody'} from the start (${minutes} min, ${practiceLimit} practice games); ${agents.filter((p) => !fresh.has(p.name)).map((p) => p.name).join(', ')} refine (${preplay} games played for them on ${preLayouts.join(', ')}, then ${refineMinutes} min and ${refinePractice} more games); practice ${practiceTime} min, games ${timeLimit / 60} min`);

  if (!state.coded) {
    state.workspaces ??= Object.fromEntries(agents.map((p) => [p.name, fresh.has(p.name) ? path.join(os.homedir(), 'blockyland-arena', `bw-${randomBytes(6).toString('hex')}`, 'work') : old.workspaces[p.name]]));
    state.from = from;
    save();
    const workspaces = state.workspaces;
    const limits = {};
    const notes = {};
    for (const p of agents) {
      const ws = workspaces[p.name];
      if (fresh.has(p.name)) {
        if (existsSync(ws) && !state.started) rmSync(path.dirname(ws), { recursive: true, force: true });
        writeWorkspace({ ws, player: p, players, workspaces, difficulty, practiceLimit, practiceTime, minutes, runDir, timeLimit });
        limits[p.name] = practiceLimit;
        continue;
      }
      // A refining agent: its unfinished practice folders are games the arena failed to play, and do not count.
      const pdir = path.join(ws, 'practice');
      for (const d of existsSync(pdir) ? readdirSync(pdir).filter((x) => /^\d+$/.test(x)) : []) {
        if (!existsSync(path.join(pdir, d, 'summary.md'))) { try { renameSync(path.join(pdir, d), path.join(pdir, `failed-${d}`)); } catch { /* in use */ } }
      }
      for (const f of existsSync(path.join(pdir, 'queue')) ? readdirSync(path.join(pdir, 'queue')) : []) rmSync(path.join(pdir, 'queue', f), { force: true });
      const played = readdirSync(pdir).filter((x) => /^\d+$/.test(x)).length;
      limits[p.name] = played + preplay + refinePractice;
      writeWorkspace({ ws, player: p, players, workspaces, difficulty, practiceLimit: limits[p.name], practiceTime, minutes: refineMinutes, runDir, timeLimit });
      notes[p.name] = { updatedBreakBed: updateBreakBed(path.join(ws, 'bot', 'skills', 'skills.mjs')), playedBefore: played };
      if (!state.started) for (let i = 0; i < preplay; i++) {
        writeFileSync(path.join(pdir, 'queue', `p${Date.now()}${i}.json`), JSON.stringify({ template: preLayouts[i % preLayouts.length] ?? null, seed: null, opponents: 4, pre: true, at: Date.now() + i }));
      }
      log(`${p.name}: workspace updated (${played} practice games from the first round; ${limits[p.name]} in all now)${notes[p.name].updatedBreakBed ? '; skills.breakBed updated for timed digging' : '; its own skills.breakBed kept'}`);
    }
    state.started = true;
    state.limits = limits;
    state.notes = notes;
    save();

    const service = servePractice({ workspaces: agents.map((p) => ({ name: p.name, ws: workspaces[p.name], limit: limits[p.name] })), difficulty, timeLimit: practiceTime * 60,
      concurrency: Number(opt('practice-concurrency', 2)), minFreeGb: 2.5, gameTimeoutMs: (practiceTime * 3 + 5) * 60e3, portBase: port + 100, log,
      script: path.join(repo, 'agentArena', 'bedwarsPractice.mjs'), describe: (j) => `${j.template ?? 'a random layout'}, ${j.opponents} scripted squad${j.opponents > 1 ? 's' : ''}` });

    // The fresh agents code from the start now; the others once the arena has played their games.
    const fromScratch = agents.filter((p) => fresh.has(p.name)).map(async (player) => {
      const ws = workspaces[player.name];
      return { player, ws, ...(await prepare({ player, ws, agentDir: path.join(runDir, 'agents', player.name), minutes, log })) };
    });
    const refining = (async () => {
      const refiners = agents.filter((p) => !fresh.has(p.name));
      while (refiners.some((p) => service.pending(workspaces[p.name]) > 0)) await sleep(5000);
      log(`the arena's practice games for ${refiners.map((p) => p.name).join(', ')} are played: their turns start`);
      return Promise.all(refiners.map(async (player) => {
        const ws = workspaces[player.name];
        const pdir = path.join(ws, 'practice');
        const games = readdirSync(pdir).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
        const mine = games.filter((n) => n > notes[player.name].playedBefore);
        const instr = INSTRUCTIONS[player.harness];
        const prompt = `The arena has changed since your bot was frozen, and you have about ${refineMinutes} more minutes to improve it. The five games are then played again, on new maps, against every agent's newest bot.

What changed (${instr} is updated; read it again):
1. **Digging takes Java's time now.** Before, the bot client broke any block at once, so a bed's cover cost nothing. Now each call of breakBlockAt (and of skills.breakBed) digs on and answers { digging: true, progress } until the block breaks; a pause of more than 1.25 s, or another block, starts it over; the tool in hand counts (wool: 1.2 s by hand, 0.25 s with shears; end stone: 15 s by hand, 1.15 s with the wooden pickaxe; obsidian: 4.2 s with the diamond pickaxe; a bed 0.3 s; the full table is in docs/bedwars-rulebook.md). ${notes[player.name].updatedBreakBed ? 'The arena replaced skills.breakBed in bot/skills/skills.mjs with the repository\'s new version, which digs the bed through an open face, else one covering block at a time, call after call.' : 'Your bot has its own skills.breakBed: make sure it keeps digging the same block, call after call.'} Any code of yours that breaks a block must keep calling on the same block, tick after tick, until it answers ok. Bed defence (end stone, obsidian, layers) now matters, and so does carrying a pickaxe or shears.
2. **The void's final line is one block under the middle's island tops** (it was two): a bridge hung below the middle's edge is in the void.
3. **Practice works properly now**: two games at a time, taken in turn (fewest games first), and a game the arena failed to play does not count. The arena has just played ${mine.length} full five-team game${mine.length === 1 ? '' : 's'} of your frozen bot under the new rules: ${mine.map((n) => `practice/${n}/`).join(', ') || '(none could be played)'} (summary.md, timeline.txt, chat.txt). You may play ${refinePractice} more with node practice.mjs (give it a 5-minute timeout; node practice.mjs result waits again).

Read the new practice results and ${instr}, then improve bot/. Run node check.mjs after every change, and finish with it passing and notes/changes.md updated (add a section for this round: what you changed and why).`;
        const agentDir = path.join(runDir, 'agents', player.name);
        const session = readFileSync(path.join(fromDir, 'agents', player.name, 'session.txt'), 'utf8').trim() || null;
        const t0 = Date.now();
        let r = await prepare({ player, ws, agentDir, minutes: refineMinutes, log, prompt, session });
        // A session that could not be resumed (it ended at once, doing nothing): a new one, told what it did before.
        if ((Date.now() - t0) < 120e3 && refineMinutes - (Date.now() - t0) / 60e3 > 5) {
          log(`${player.name}: its session did not resume; a new session with the same task`);
          r = await prepare({ player, ws, agentDir, minutes: refineMinutes - (Date.now() - t0) / 60e3, log,
            prompt: `You wrote the bot in bot/ earlier in this arena (notes/plan.md and notes/changes.md say what you did and why). ${prompt}` });
        }
        return { player, ws, ...r };
      }));
    })();
    const results = [...(await Promise.all(fromScratch)), ...(await refining)];
    service.stop();

    // Each bot frozen as it stands.
    const botsDir = path.join(runDir, 'bots');
    state.bots = {};
    for (const r of results) {
      const to = path.join(botsDir, r.player.name);
      rmSync(to, { recursive: true, force: true });
      const audit = auditTranscript(path.join(runDir, 'agents', r.player.name), { ws: r.ws, otherWorkspaces: Object.entries(workspaces).filter(([n]) => n !== r.player.name).map(([, w]) => w), runDir });
      if (r.ok) {
        cpSync(path.join(r.ws, 'bot'), to, { recursive: true });
        for (const f of ['plan.md', 'changes.md']) if (existsSync(path.join(r.ws, 'notes', f))) cpSync(path.join(r.ws, 'notes', f), path.join(to, `notes-${f}`));
        if (existsSync(path.join(r.ws, 'tests'))) cpSync(path.join(r.ws, 'tests'), path.join(to, 'agent-tests'), { recursive: true });
        if (existsSync(path.join(r.ws, 'practice'))) cpSync(path.join(r.ws, 'practice'), path.join(runDir, 'agents', r.player.name, 'practice'), { recursive: true, filter: (src) => !/[\\/]recording([\\/]|$)/.test(src) });
        state.bots[r.player.name] = { module: path.join(to, 'scriptedBot', 'scriptedBot.mjs'), check: r.check, minutes: r.minutes, paused: r.paused, refined: !fresh.has(r.player.name), baseline: false, audit };
      } else state.bots[r.player.name] = { module: null, check: r.check, minutes: r.minutes, baseline: true, audit };
      log(`${r.player.name}: ${r.ok ? `bot frozen (${r.check}; ${r.minutes} min${r.paused ? `, ${r.paused} min paused for the usage limit` : ''})` : `the check fails (${r.check}): the scripted bot plays for it`}${audit.length ? `; AUDIT: ${audit.join('; ')}` : ''}`);
    }
    state.coded = true;
    save();
  }

  if (flag('no-games')) return;
  // The games: bedwarsArena.mjs, on this run (its state says the coding is done), with new seeds.
  log('the games begin (bedwarsArena.mjs)');
  const child = spawn(process.execPath, [path.join(repo, 'agentArena', 'bedwarsArena.mjs'), '--run', run, '--players', playersSpec, '--difficulty', difficulty, '--time-limit', String(timeLimit / 60), '--port', String(port), ...(flag('no-video') ? ['--no-video'] : [])], { stdio: 'inherit', windowsHide: true });
  await new Promise((r) => child.on('exit', r));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main().then(() => process.exit(0), (err) => { console.error(err); process.exit(1); });
