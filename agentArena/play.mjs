#!/usr/bin/env node
// Play one arena match with strategy files and no AI agents: to test the arena, or to replay a strategy.
//
//   node agentArena/play.mjs --game skywars --a Ada=path/to/a.js --b Bo=path/to/b.js [--out agentArena/runs/test] [--headed]
import path from 'node:path';
import { runMatch } from './series.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const game = opt('game', 'skywars');
const players = ['a', 'b'].map((k) => { const [name, file] = String(opt(k, '')).split('='); if (!name || !file) throw new Error(`--${k} Name=strategy.js`); return { name, strategyFile: path.resolve(file) }; });
const outDir = path.resolve(opt('out', `agentArena/runs/play-${game}-${Date.now()}`));
const result = await runMatch({
  game, players, outDir, statusDir: path.join(outDir, 'status'), headed: args.includes('--headed'), video: !args.includes('--no-video'),
  maxSeconds: Number(opt('max-seconds', 0)) || undefined,
  log: (l) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${l}`),
});
console.log(JSON.stringify(result, null, 2));
process.exit(0);
