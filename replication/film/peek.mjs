// A quick look at an agent's latest transcript (Claude Code stream-json): what it thought, said and ran.
//   node replication/film/peek.mjs <run> <Name> [lines]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const [run, name, keep = 40] = process.argv.slice(2);
const dir = path.join(import.meta.dirname, '..', 'runs', run, 'agents', name);
const files = readdirSync(dir).filter(f => f.startsWith('transcript-')).sort();
const out = [];
for (const f of files) {
  for (const line of readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    let j; try { j = JSON.parse(line); } catch { continue; }
    const short = (s, n = 220) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
    if (j.type === 'system' && j.subtype === 'init') out.push(`SYS init model=${j.model} tools=${(j.tools ?? []).join(',')}`);
    else if (j.type === 'assistant') for (const c of j.message?.content ?? []) {
      if (c.type === 'thinking') out.push(`THINK ${short(c.thinking)}`);
      else if (c.type === 'text') out.push(`SAY   ${short(c.text)}`);
      else if (c.type === 'tool_use') out.push(`TOOL  ${c.name} ${short(JSON.stringify(c.input), 260)}`);
    } else if (j.type === 'user') for (const c of j.message?.content ?? []) {
      if (c.type === 'tool_result') out.push(`  ->  ${short(typeof c.content === 'string' ? c.content : JSON.stringify(c.content), 260)}`);
    } else if (j.type === 'result') out.push(`RESULT ${j.subtype} turns=${j.num_turns} cost=$${j.total_cost_usd?.toFixed?.(2)}`);
  }
}
const stderr = path.join(dir, 'stderr.log');
console.log(out.slice(-keep).join('\n'));
if (existsSync(stderr)) console.log('STDERR:', readFileSync(stderr, 'utf8').slice(-400));
