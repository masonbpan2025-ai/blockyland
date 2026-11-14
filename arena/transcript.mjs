#!/usr/bin/env node
// A readable record of an arena game: round by round, what each player thought, planned and said to their team, how
// each step went, and every hit and death. Written next to the game's log as transcript.md.
//   node arena/transcript.mjs arena-runs/game2
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node arena/transcript.mjs <game folder>');
const events = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const summary = (() => { try { return JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8')); } catch { return null; } })();
// The start event names the teams; a log without it (the launcher attached late) has them in every plan.
const start = events.find(e => e.kind === 'start') ?? { teams: [...new Set(events.filter(e => e.kind === 'plan').map(e => e.team))].map(name => ({ name, players: [...new Set(events.filter(e => e.kind === 'plan' && e.team === name).map(e => e.player))] })) };
const teamOf = Object.fromEntries((start?.teams ?? []).flatMap(t => t.players.map(p => [p, t.name])));
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const out = [];
out.push(`# Arena game: ${start?.teams.map(t => `${t.name} (${t.players.join(', ')})`).join(' vs ')}`, '');
const over = events.find(e => e.kind === 'game_over');
if (over) out.push(`**Result:** ${over.winner ? `${over.winner} wins` : 'a draw'} in round ${over.round} (${clock(over.time)} of game time). Still standing: ${over.survivors.join(', ') || 'no one'}.`, '');
if (summary) {
  out.push('| Player | Team | Kills | Damage dealt | Fate |', '| --- | --- | --- | --- | --- |');
  for (const p of summary.players) out.push(`| ${p.name} | ${p.team} | ${p.kills} | ${p.damageDealt} | ${p.alive ? 'survived' : `killed by ${p.killedBy ?? 'the world'}`} |`);
  out.push('');
}
const rounds = [...new Set(events.map(e => e.round))].sort((a, b) => a - b);
for (const r of rounds) {
  const inRound = events.filter(e => e.round === r);
  // Plans are handed in before a round is played, so they carry the previous round's number: show them under the
  // round they shaped.
  const plans = events.filter(e => e.kind === 'plan' && e.round === r - 1);
  const happened = inRound.filter(e => ['result', 'hit', 'death', 'arrow', 'miss', 'loot', 'hunt'].includes(e.kind));
  if (!plans.length && !happened.length) continue;
  const first = inRound.find(e => e.kind === 'round');
  out.push(`## Round ${r}${first ? ` (from ${clock(first.t)})` : ''}`, '');
  for (const team of start?.teams ?? []) {
    const teamPlans = plans.filter(p => p.team === team.name);
    if (!teamPlans.length) continue;
    out.push(`### ${team.name}`, '');
    for (const p of teamPlans) {
      out.push(`**${p.player}** thinks: ${p.thought.replace(/\s+/g, ' ')}`);
      out.push(`- Plan: ${p.plan.map(s => `\`${s}\``).join(', ')}${p.rejected?.length ? ` (rejected: ${p.rejected.map(x => `\`${x.step}\`: ${x.problem}`).join('; ')})` : ''}`);
      if (p.chat) out.push(`- To the team: “${p.chat.replace(/\s+/g, ' ')}”`);
      out.push('');
    }
  }
  const lines = [];
  for (const e of happened) {
    if (e.kind === 'result') lines.push(`- ${clock(e.t)} ${e.player}: \`${e.step}\` ${e.ok ? '✓' : '✗'} ${e.message}`);
    else if (e.kind === 'hit') lines.push(`- ${clock(e.t)} **${e.from} hits ${e.to}** for ${e.amount} with ${String(e.weapon).replace(/_/g, ' ')} (${e.to} at ${e.health} health)`);
    else if (e.kind === 'death') lines.push(`- ${clock(e.t)} **☠ ${e.player} (${e.team}) is out**${e.by ? `, killed by ${e.by}` : ''} (${e.cause})`);
    else if (e.kind === 'arrow') lines.push(`- ${clock(e.t)} ${e.from} shoots at ${e.to}: ${e.hit ? 'hit' : 'miss'}`);
    else if (e.kind === 'hunt') lines.push(`- ${clock(e.t)} ${e.player} hunts a ${e.animal}`);
    else if (e.kind === 'loot') lines.push(`- ${clock(e.t)} ${e.player} picks up ${e.count} ${e.item} dropped by ${e.from}`);
  }
  if (lines.length) out.push('What happened:', '', ...lines, '');
}
writeFileSync(join(dir, 'transcript.md'), out.join('\n'));
console.log(`Wrote ${join(dir, 'transcript.md')} (${out.length} lines)`);
