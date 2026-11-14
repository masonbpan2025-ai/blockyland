// The lobbies' Spectate toggle (off by default): a player -- the host, or a guest asking it -- can choose to watch a
// SkyWars or Bed Wars game instead of playing in it, say to watch bots play. Watching, they hold no island and no team,
// are no contender (the game starts with the others), and are put in spectator mode; turning it off in the lobby puts
// them back in the game. The choice survives the next round.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SkyWarsMatch, HOST_ID } from '../src/mods/skywars/rules.js';
import { BedWarsMatch } from '../src/mods/bedwars/rules.js';
import { createMiniGameHost } from './helpers/miniGameHost.js';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';

const pub = (match, id) => match.snapshot().players.find((p) => p.id === id);

test('SkyWars: spectating gives up the island, is no contender, and survives a new round; off again, an island back', () => {
  const m = new SkyWarsMatch({ seed: 1 });
  m.join(HOST_ID, 'Host'); m.join('b1', 'Bot1'); m.join('b2', 'Bot2');
  assert.equal(pub(m, HOST_ID).spectating, undefined, 'off by default');
  assert.equal(m.setSpectating(HOST_ID, true), true);
  assert.equal(m.players.get(HOST_ID).slot, null);
  assert.equal(pub(m, HOST_ID).spectating, true);
  assert.deepEqual(m.contenders().map((p) => p.id), ['b1', 'b2']);
  assert.equal(m.setSpectating(HOST_ID, true), false, 'already watching');
  assert.equal(m.start(HOST_ID).ok, true, 'two bots are enough to start');
  assert.equal(m.setSpectating(HOST_ID, false), false, 'not once the game has started');
  m.update(10); // countdown over
  assert.equal(m.phase, 'playing');
  assert.equal(m.players.get(HOST_ID).alive, false, 'the host watches');
  for (const id of ['b1', 'b2']) assert.equal(m.players.get(id).alive, true);
  m.eliminate('b2', 'void');
  assert.equal(m.phase, 'ended');
  assert.equal(m.winner, 'b1', 'the bots decide it');
  assert.equal(m.reset(HOST_ID), true);
  assert.equal(m.players.get(HOST_ID).slot, null, 'still watching in the next round');
  assert.equal(m.setSpectating(HOST_ID, false), true);
  assert.notEqual(m.players.get(HOST_ID).slot, null, 'back on an island');
  assert.equal(m.contenders().length, 3);
});

test('Bed Wars: spectating leaves the team, is no contender, survives a new round and a change of mode; choosing a team ends it', () => {
  const m = new BedWarsMatch({ mode: 'fours', seed: 3 });
  m.join(HOST_ID, 'Host'); m.join('b1', 'Bot1'); m.join('b2', 'Bot2');
  m.chooseTeam('b1', 'red'); m.chooseTeam('b2', 'blue');
  assert.equal(m.setSpectating(HOST_ID, true), true);
  assert.equal(m.players.get(HOST_ID).team, null);
  assert.equal(pub(m, HOST_ID).spectating, true);
  assert.deepEqual(m.contenders().map((p) => p.id).sort(), ['b1', 'b2']);
  assert.equal(m.setMode(HOST_ID, 'doubles'), true);
  assert.equal(m.players.get(HOST_ID).team, null, 'a change of mode shares out only those playing');
  assert.equal(m.contenders().length, 2);
  m.chooseTeam('b1', 'red'); m.chooseTeam('b2', 'blue');
  assert.equal(m.start(HOST_ID).ok, true);
  m.update(10);
  assert.equal(m.phase, 'playing');
  assert.equal(m.players.get(HOST_ID).alive, false, 'the host watches');
  assert.equal(m.teams.get('red').eliminated, false);
  m.phase = 'ended';
  assert.equal(m.reset(HOST_ID), true);
  assert.equal(m.players.get(HOST_ID).team, null, 'still watching in the next round');
  assert.equal(pub(m, HOST_ID).spectating, true);
  assert.equal(m.chooseTeam(HOST_ID, 'green'), true, 'joining a team is choosing to play');
  assert.equal(pub(m, HOST_ID).spectating, undefined);
  assert.equal(m.setSpectating(HOST_ID, true), true);
  assert.equal(m.setSpectating(HOST_ID, false), true);
  assert.notEqual(m.players.get(HOST_ID).team, null, 'off again: a team with room');
});

test('SkyWars, in the game: the host turns Spectate on and is a spectator at once; off again, back in its cage', async (t) => {
  const host = await createMiniGameHost('skywars');
  t.after(() => host.close());
  await host.tick(0.3);
  assert.notEqual(host.game.player.gamemode, 'spectator');
  host.manager.setSpectating(true);
  await host.tick(0.3);
  assert.equal(host.manager.spectating, true);
  assert.equal(host.game.player.gamemode, 'spectator');
  host.manager.setSpectating(false);
  await host.tick(0.3);
  assert.equal(host.manager.spectating, false);
  assert.equal(host.game.player.gamemode, 'adventure', 'in its cage, as before a game');
});

test('Bed Wars, in the game: a guest asks to spectate, and the host takes it off its team; the host spectating watches the game', async (t) => {
  const host = await createMiniGameHost('bedwars');
  t.after(() => host.close());
  const guest = new GuestPeerSession({ code: host.code, name: 'Friend', url: host.shareUrl, autopilot: false });
  t.after(() => guest.disconnect());
  await guest.connect({ timeoutMs: 15000, waitForSnapshot: false, team: 'blue' });
  await host.tick(0.5);
  const friend = () => [...host.manager.match.players.values()].find((p) => p.name === 'Friend');
  assert.equal(friend().team, 'blue');
  guest.sendPacket({ t: 'game', data: { type: 'spectate', on: true } });
  for (let i = 0; i < 20 && friend().team; i++) await host.tick(0.1);
  assert.equal(friend().team, null);
  assert.equal(friend().spectating, true);
  // The host watches too: the game is the guest's alone -- not enough to start, until the guest plays again.
  host.manager.setSpectating(true);
  await host.tick(0.2);
  assert.equal(host.manager.match.canStart(HOST_ID).ok, false);
  guest.sendPacket({ t: 'game', data: { type: 'spectate', on: false } });
  for (let i = 0; i < 20 && !friend().team; i++) await host.tick(0.1);
  assert.ok(friend().team, 'playing again, on a team');
  // A second player on another team, and the game starts without the host: it watches as a spectator.
  const other = new GuestPeerSession({ code: host.code, name: 'Other', url: host.shareUrl, autopilot: false });
  t.after(() => other.disconnect());
  const freeTeam = host.manager.match.teamIds().find((id) => id !== friend().team);
  await other.connect({ timeoutMs: 15000, waitForSnapshot: false, team: freeTeam });
  for (let i = 0; i < 20 && !host.manager.match.canStart(HOST_ID).ok; i++) await host.tick(0.1);
  assert.equal(host.manager.match.canStart(HOST_ID).ok, true);
  host.manager.requestStart();
  for (let i = 0; i < 80 && host.manager.match.phase !== 'playing'; i++) await host.tick(0.1);
  assert.equal(host.manager.match.phase, 'playing');
  await host.tick(0.3);
  assert.equal(host.game.player.gamemode, 'spectator', 'the host watches the game it chose not to play');
});

test('SkyWars: a spectator is no player -- with the host watching, eight bots take all eight islands', () => {
  const m = new SkyWarsMatch({ seed: 4 });
  m.join(HOST_ID, 'Host');
  m.setSpectating(HOST_ID, true);
  for (let i = 1; i <= 8; i++) m.join(`b${i}`, `Bot${i}`);
  assert.equal(m.contenders().length, 8);
  assert.equal(new Set(m.contenders().map((p) => p.slot)).size, 8, 'every bot on an island of its own');
  m.join('b9', 'Bot9');
  assert.equal(m.players.get('b9').slot, null, 'a ninth has no island left');
});

/** A watcher who stopped flying and fell below the islands: brought back to the spectators' spot, flying. */
async function fallsAndComesBack(host) {
  const p = host.game.player, spot = host.manager.arena.spectator;
  assert.equal(p.gamemode, 'spectator');
  assert.equal(p.creativeFlight, true, 'Creative-style movement');
  p.isFlying = false;
  p.position.set(spot.x, -40, spot.z);
  await host.tick(0.2);
  assert.ok(Math.abs(p.position.y - spot.y) < 0.01, );
  assert.equal(p.isFlying, true);
}

test('SkyWars: the host watching moves as a Creative player, flying, and is brought back if it falls below the islands', async (t) => {
  const host = await createMiniGameHost('skywars');
  t.after(() => host.close());
  host.manager.setSpectating(true);
  await host.tick(0.3);
  assert.equal(host.game.player.isFlying, true, 'flying to start with');
  await fallsAndComesBack(host);
});

test('Bed Wars: the host watching a game moves as a Creative player, and is brought back if it falls below the islands', async (t) => {
  const host = await createMiniGameHost('bedwars');
  t.after(() => host.close());
  host.manager.setSpectating(true);
  const guests = [];
  for (const [name, team] of [['A', 'red'], ['B', 'blue']]) {
    const g = new GuestPeerSession({ code: host.code, name, url: host.shareUrl, autopilot: false });
    t.after(() => g.disconnect());
    await g.connect({ timeoutMs: 15000, waitForSnapshot: false, team });
    guests.push(g);
  }
  for (let i = 0; i < 20 && !host.manager.match.canStart(HOST_ID).ok; i++) await host.tick(0.1);
  host.manager.requestStart();
  for (let i = 0; i < 80 && host.manager.match.phase !== 'playing'; i++) await host.tick(0.1);
  await host.tick(0.3);
  assert.equal(host.game.player.isFlying, true, 'flying to start with');
  await fallsAndComesBack(host);
});
