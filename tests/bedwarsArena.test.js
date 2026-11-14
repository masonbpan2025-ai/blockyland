// The Bed Wars arena (agentArena/bedwarsArena.mjs): squads of four on teams that turn from game to game, a team placed
// by when it went out and scoring the teams it outlasted, and instructions that state the rules a bot is judged by --
// the closing zone above all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeTeams, squadsFor, instructionsText } from '../agentArena/bedwarsArena.mjs';
import { parsePlayers } from '../agentArena/scriptedArena.mjs';

const players = parsePlayers('Opus:claude:claude-opus-5-5:high,Sol:codex:gpt-6.1-sol:high,Gemini:agy:gemini-3.8-flash-high:high,DeepSeek:deepseek:deepseek-flash:high,Scripted:scripted');

test('every game: five squads of four, each on its own team, the teams turning by one', () => {
  const bots = { Opus: { module: '/x/opus.mjs' } };
  const g1 = squadsFor(players, 1, { difficulty: 'hard', bots, referee: () => () => {}, violations: [] });
  assert.equal(g1.specs.length, 20);
  assert.deepEqual(g1.specs.filter((s) => s.team === 'red').map((s) => s.name), ['Opus1', 'Opus2', 'Opus3', 'Opus4']);
  assert.ok(g1.specs.filter((s) => s.name.startsWith('Opus')).every((s) => s.sessionModule === '/x/opus.mjs'));
  assert.ok(g1.specs.filter((s) => s.name.startsWith('Sol')).every((s) => !s.sessionModule), 'no frozen bot: the scripted bot plays');
  const g2 = squadsFor(players, 2, { difficulty: 'hard', bots, referee: () => () => {}, violations: [] });
  assert.deepEqual(g2.order.map((p) => p.name), ['Sol', 'Gemini', 'DeepSeek', 'Scripted', 'Opus']);
  assert.equal(g2.specs.find((s) => s.name === 'Opus1').team, 'aqua');
});

test('placing: the winner, then the last team out; teams standing at the time limit share; points for teams outlasted', () => {
  const squads = [{ name: 'A', team: 'red' }, { name: 'B', team: 'blue' }, { name: 'C', team: 'green' }, { name: 'D', team: 'yellow' }, { name: 'E', team: 'aqua' }];
  const won = placeTeams({ squads, outs: [{ team: 'blue', t: 100 }, { team: 'green', t: 50 }, { team: 'yellow', t: 300 }, { team: 'aqua', t: 200 }], winner: 'red' });
  assert.deepEqual(won.places, { A: 1, D: 2, E: 3, B: 4, C: 5 });
  assert.deepEqual(won.points, { A: 4, D: 3, E: 2, B: 1, C: 0 });
  assert.equal(won.winner, 'A');
  const time = placeTeams({ squads, outs: [{ team: 'green', t: 50 }, { team: 'yellow', t: 60 }, { team: 'aqua', t: 70 }], winner: null });
  assert.equal(time.places.A, 1); assert.equal(time.places.B, 1);
  assert.equal(time.points.A, 3); assert.equal(time.points.E, 2);
});

test('the instructions state the rules the bot is judged by: the zone, the beds, the shop, the items, the squad', () => {
  const text = instructionsText({ player: players[0], players, difficulty: 'hard', practiceLimit: 5, practiceTime: 6, minutes: 60, timeLimit: 600 });
  for (const must of [
    /all four players of your team/, /Opus1, Opus2,\s+Opus3, Opus4/, /6:00 Bed Destruction/, /6:00 the zone starts to close/, /fully closed at 9:00/,
    /border closes in on the middle/, /void rises/, /hiding under an island counts as the void/, /Ten seconds in the\s+void/, /skills\.keepInZone\(\)/,
    /within reach/, /open face/, /within 6 blocks of the keeper/, /Items come only from the game/, /no TNT or fireball/, /one point for every team it outlasts/,
    /Compact Middle[\s\S]*Classic Cross[\s\S]*Flanking Diamonds[\s\S]*High Middle[\s\S]*Archipelago/, /about 60 minutes/, /5 in all/, /team radio/,
  ]) assert.match(text, must);
  // It names the other squads and who writes them.
  assert.match(text, /\*\*Sol\*\* \(an AI agent, GPT-6\.1 Sol/);
  assert.match(text, /\*\*Scripted\*\* \(a squad of the unchanged scripted bot/);
});
