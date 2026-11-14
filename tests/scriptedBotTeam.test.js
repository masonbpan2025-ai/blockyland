// The scripted bot on a Bed Wars team (agentArena/scriptedBot/playbooks/bedwars.mjs): the members still in the game
// share the jobs by name order with no messages -- a defender, a collector with three or more, the rest rushers -- and
// the last one left plays every job. The defender's cover is one layer on and all round the two-block bed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { teamRole, bedCover, rushPartners, flankVia } from '../agentArena/scriptedBot/playbooks/bedwars.mjs';

const player = (id, team, { alive = true, respawnIn = null } = {}) => ({ id, name: id, team, alive, respawnIn });
const viewOf = (meId, players) => ({ me: { id: meId, team: players.find((p) => p.id === meId)?.team }, players });

test('four on a team: one defender, one collector, two rushers -- each bot works its own out alike', () => {
  const players = ['Red1', 'Red2', 'Red3', 'Red4'].map((n) => player(n, 'red')).concat(['Blue1', 'Blue2'].map((n) => player(n, 'blue')));
  const roles = ['Red1', 'Red2', 'Red3', 'Red4'].map((id) => teamRole(viewOf(id, players)));
  assert.deepEqual(roles, ['defender', 'collector', 'rusher', 'rusher']);
});

test('a teammate respawning keeps its job; one out of the game hands the jobs on', () => {
  const players = [player('Red1', 'red', { alive: false, respawnIn: 4 }), player('Red2', 'red'), player('Red3', 'red')];
  assert.equal(teamRole(viewOf('Red2', players)), 'collector', 'Red1 is only respawning: still the defender');
  players[0] = player('Red1', 'red', { alive: false, respawnIn: null });
  assert.equal(teamRole(viewOf('Red2', players)), 'defender', 'Red1 is out: the next takes the bed');
  assert.equal(teamRole(viewOf('Red3', players)), 'rusher', 'two left: a defender and a rusher');
});

test('the last of a team, or a solo game, plays every job', () => {
  assert.equal(teamRole(viewOf('Red1', [player('Red1', 'red'), player('Blue1', 'blue')])), 'solo');
  assert.equal(teamRole(viewOf('Red4', [player('Red1', 'red', { alive: false }), player('Red4', 'red')])), 'solo');
});

test('the bed cover: on top of both halves and all round them, eight blocks, none on the bed', () => {
  const foot = [10, 31, 20], head = [10, 31, 21];
  const cover = bedCover(foot, head).map((c) => c.join(',')).sort();
  assert.deepEqual(cover, ['10,31,19', '10,31,22', '10,32,20', '10,32,21', '11,31,20', '11,31,21', '9,31,20', '9,31,21'].sort());
});

test('the rushers pair up: each knows the other, and the defender and collector are no one\'s partner', () => {
  const players = ['Red1', 'Red2', 'Red3', 'Red4'].map((n) => player(n, 'red'));
  assert.deepEqual(rushPartners(viewOf('Red3', players)), ['Red4']);
  assert.deepEqual(rushPartners(viewOf('Red4', players)), ['Red3']);
  // Two left: one defender, one rusher, and no partner to wait for.
  assert.deepEqual(rushPartners(viewOf('Red2', players.slice(0, 2))), []);
});

test('the way round: by a diamond island off the middle when it is at most 40% longer than going straight', () => {
  const home = { x: 0, z: -40 }, theirs = { x: 0, z: 40 };
  const side = { id: 'd0', at: [20.5, 31, 0.5] }, far = { id: 'd1', at: [60.5, 31, 0.5] }, middle = { id: 'd2', at: [3.5, 31, 0.5] };
  // Straight is 80; by the side island about 89 (11% longer): taken. The far one is 144: not. One on the middle: never.
  assert.equal(flankVia([far, middle, side], home, theirs)?.id, 'd0');
  assert.equal(flankVia([far, middle], home, theirs), null);
});
