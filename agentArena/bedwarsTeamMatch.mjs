#!/usr/bin/env node
// A Bed Wars team match of scripted bots, no agents: every team a squad of the scripted bot (or of another version of
// it), in the real game. For trying the scripted bot's team play, and as the five-team series' baseline.
//
//   node agentArena/bedwarsTeamMatch.mjs [--mode duel|fives] [--layout compact] [--seed 7] [--seconds 600]
//        [--difficulty hard] [--bot path/to/scriptedBot.mjs[,another.mjs...]] [--out dir] [--port 3071] [--no-video]
//
// --mode duel is 4v4 (two teams of four), fives is 4v4v4v4v4. --bot gives each team's module in team order (one for
// all, or one per team); the repo's scripted bot when not given. Writes the recording to --out (default
// agentArena/runs/bw-team-<time>/) and prints the account: beds broken, kills and final kills per team, the winner.
import path from 'node:path';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { runBotMatch } from './botMatch.mjs';
import { MODES, TEAMS } from '../src/mods/bedwars/teams.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const mode = opt('mode', 'duel');
if (!MODES[mode] || MODES[mode].size !== 4) throw new Error('--mode duel (4v4) or fives (4v4v4v4v4)');
const here = import.meta.dirname;
const teams = TEAMS.slice(0, MODES[mode].teams);
const bots = String(opt('bot', '')).split(',').filter(Boolean).map((f) => path.resolve(f));
const out = path.resolve(opt('out', path.join(here, 'runs', `bw-team-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`)));
const difficulty = opt('difficulty', 'hard');
const seed = opt('seed', null);

// Players join team by team, each named for its team and number (Red1..Red4, Blue1..).
const players = teams.flatMap((t, ti) => Array.from({ length: 4 }, (_, i) => ({
  name: `${t.name}${i + 1}`, team: t.id, scripted: difficulty,
  ...(bots.length ? { sessionModule: bots[Math.min(ti, bots.length - 1)] } : {}),
})));

const result = await runBotMatch({
  game: 'bedwars', bedwarsMode: mode, bedwarsLayout: opt('layout', 'standard'), bedwarsSeed: seed === null ? null : Number(seed),
  outDir: out, maxSeconds: Number(opt('seconds', 600)), video: !args.includes('--no-video'), port: Number(opt('port', 3071)),
  difficulty, statusEveryTicks: 5, players, log: (l) => console.log(l),
});

// The account, from the recording's chat.
const jl = (f) => (existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);
const t0 = result.playingT ?? 0;
const chat = [...new Map(jl(path.join(out, 'recording', 'chat.jsonl')).filter((c) => c.t >= t0).map((c) => [c.text, c])).values()];
const teamOf = (name) => players.find((p) => p.name === name)?.team ?? null;
const account = Object.fromEntries(teams.map((t) => [t.id, { beds: 0, kills: 0, finals: 0, deaths: 0, bedLostAt: null }]));
const lines = [];
for (const c of chat) {
  const at = Math.round(c.t - t0), text = c.text;
  const bed = /([A-Za-z]+) Bed was (?:destroyed|broken) by ([A-Za-z]+\d)/i.exec(text) ?? /BED DESTRUCTION.*?([A-Za-z]+) Bed.*?by ([A-Za-z]+\d)/i.exec(text);
  if (bed) { const by = teamOf(bed[2]), lost = teams.find((t) => t.name.toLowerCase() === bed[1].toLowerCase())?.id; if (by) account[by].beds++; if (lost) account[lost].bedLostAt = at; lines.push(`${at}s ${text}`); continue; }
  const death = /^([A-Za-z]+\d) (?:was|fell|died|blew|disconnected)(?:.*? by ([A-Za-z]+\d))?/.exec(text);
  if (death) {
    const final = /FINAL KILL/.test(text), victim = teamOf(death[1]), killer = death[2] ? teamOf(death[2]) : null;
    if (victim) account[victim].deaths++;
    if (killer && killer !== victim) { account[killer].kills++; if (final) account[killer].finals++; }
    lines.push(`${at}s ${text}`);
    continue;
  }
  if (/won|wins|eliminated|victory/i.test(text)) lines.push(`${at}s ${text}`);
}
const summary = { mode, layout: opt('layout', 'standard'), seed, winner: result.winner, winnerName: result.winnerName, endReason: result.endReason, seconds: result.seconds, account };
writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nRESULT: ${result.winner ? `${result.winner} won` : 'no winner'} (${result.endReason}) after ${result.seconds} s`);
for (const t of teams) { const a = account[t.id]; console.log(`  ${t.name.padEnd(7)} beds broken ${a.beds}, kills ${a.kills} (final ${a.finals}), deaths ${a.deaths}${a.bedLostAt !== null ? `, bed lost at ${a.bedLostAt}s` : ''}`); }
console.log(lines.map((l) => `  ${l}`).join('\n'));
console.log(`  recording: ${out}`);
process.exit(0);
