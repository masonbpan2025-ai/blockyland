#!/usr/bin/env node
// Collect the bots the AI models wrote in an arena run into this library (agentArena/bots/ai/<game>/<Name>/), where they
// are kept with the code: a run's folder (agentArena/runs/) is not. Each bot's imports of the game, written as absolute
// file:// URLs on the machine that ran the arena, become paths relative to the bot's file, so the library works in any
// checkout. The bot's notes (plan.md, changes.md) come along; its own tests do not (they were written for the workspace).
//
//   node agentArena/bots/ai/collect.mjs --game skywars --run five-bots
//   node agentArena/bots/ai/collect.mjs --game bedwars --run bedwars-five-r2
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };
const here = import.meta.dirname, repo = path.resolve(here, '..', '..', '..');

/** Rewrite every `file:///<somewhere>/<repo part>` import in a bot file to a path relative to that file. */
export function relativiseImports(source, fileAbs, repoRoot = repo) {
  return source.replace(/(['"])file:\/\/\/[^'"]*?\/((?:packages|src|agentArena|tests)\/[^'"]+)\1/g, (m, q, rest) => {
    let rel = path.relative(path.dirname(fileAbs), path.join(repoRoot, rest)).replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${q}${rel}${q}`;
  });
}

function collect({ game, run, names }) {
  const from = path.join(repo, 'agentArena', 'runs', run, 'bots');
  if (!existsSync(from)) throw new Error(`no bots in ${from}`);
  for (const name of names ?? readdirSync(from)) {
    const src = path.join(from, name), to = path.join(here, game, name);
    if (!statSync(src).isDirectory()) continue;
    rmSync(to, { recursive: true, force: true });
    cpSync(src, to, { recursive: true, filter: (p) => !/[\\/]agent-tests([\\/]|$)/.test(p) });
    const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.m?js$/.test(f)) writeFileSync(p, relativiseImports(readFileSync(p, 'utf8'), p)); } };
    walk(to);
    for (const n of ['notes-plan.md', 'notes-changes.md']) if (existsSync(path.join(to, n))) { mkdirSync(path.join(to, 'notes'), { recursive: true }); cpSync(path.join(to, n), path.join(to, 'notes', n.replace(/^notes-/, ''))); rmSync(path.join(to, n)); }
    writeFileSync(path.join(to, 'SOURCE.md'), `# ${name}'s ${game === 'bedwars' ? 'Bed Wars' : 'SkyWars'} bot\n\nWritten by an AI agent in the arena run \`${run}\` (agentArena/runs/${run}/), collected by agentArena/bots/ai/collect.mjs.\nIts imports of the game were made relative; its code is otherwise as the agent left it, except where a later change is noted in agentArena/bots/ai/CHANGES.md.\n`);
    console.log(`${game}/${name}: from ${run}`);
  }
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('collect.mjs')) {
  const game = opt('game'), run = opt('run');
  if (!['skywars', 'bedwars'].includes(game) || !run) { console.error('usage: node agentArena/bots/ai/collect.mjs --game skywars|bedwars --run <run>'); process.exit(2); }
  collect({ game, run, names: opt('names')?.split(',') ?? null });
}
