#!/usr/bin/env node
// A match between programs, no agents: the house bots (agentArena/bots/) against each other, or against any strategy
// file, in the real game. For trying the house bots and for sparring.
//
//   node agentArena/houseMatch.mjs skywars [--a bots/skywars.js] [--b bots/skywars.js] [--seconds 300] [--out dir] [--practice-map]
//
// Writes the match's recording to --out (default agentArena/runs/house-<game>-<time>/), prints the result, and a short
// account of each player: hits landed, deaths, how far it got.
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { runBotMatch, MATCH_CAPS } from './botMatch.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const game = args[0];
if (!MATCH_CAPS[game]) throw new Error('usage: node agentArena/houseMatch.mjs skywars|bedwars [--a file] [--b file] [--seconds N] [--out dir]');
const here = import.meta.dirname;
const file = (f) => (f === 'dummy' ? null : path.resolve(here, f));
const a = file(opt('a', `bots/${game}.js`)), b = file(opt('b', `bots/${game}.js`));
const out = path.resolve(opt('out', path.join(here, 'runs', `house-${game}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)));

const result = await runBotMatch({
  game, outDir: out, maxSeconds: Number(opt('seconds', MATCH_CAPS[game])), video: !args.includes('--no-video'),
  practiceMap: args.includes('--practice-map'), bedwarsLayout: opt('layout', null), port: Number(opt('port', 3061)),
  players: [{ name: 'HouseA', strategyFile: a }, { name: 'HouseB', strategyFile: b }],
  log: (l) => console.log(l),
});

// A short account from the recording.
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const rec = path.join(out, 'recording'), t0 = result.playingT ?? 0;
const chat = [...new Set(jl(path.join(rec, 'chat.jsonl')).filter((c) => c.t >= t0).map((c) => `${Math.round(c.t - t0)}s ${c.text}`))].filter((l) => /void|slain|killed|fell|knocked|died|won|bed|destroy/i.test(l));
const hurt = jl(path.join(rec, 'events.jsonl')).filter((e) => e.kind === 'hurt' && e.t >= t0);
console.log(`\nRESULT: ${result.winnerName ? `${result.winnerName} won` : 'no winner'} (${result.endReason}) after ${result.seconds} s`);
for (const n of ['HouseA', 'HouseB']) console.log(`  ${n}: took ${hurt.filter((h) => h.who === n).length} hits (${hurt.filter((h) => h.who === n).reduce((s, h) => s + h.amount, 0).toFixed(1)} damage)`);
console.log(`  messages: ${chat.join(' | ') || 'none'}`);
console.log(`  recording: ${out}`);
process.exit(0);
