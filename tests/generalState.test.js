// The general state (packages/blockyland-mcp/generalState.js): one shape for every game a mod runs, reported by the
// SkyWars and Bed Wars mods (src/mods/*/generalState.js) and kept by a guest, so a bot can play from it without knowing
// the game. Expected values come from the mods' rules (rules.js constants) and the arenas they build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createShareServer } from '../server/shareServer.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { sanitizeGeneralState, GENERAL_STATE_VERSION, generalPhase } from '../packages/blockyland-mcp/generalState.js';
import * as fromMods from '../src/mods/generalState.js';
import { describeSkyWars } from '../src/mods/skywars/generalState.js';
import { describeBedWars } from '../src/mods/bedwars/generalState.js';
import * as skywarsArena from '../src/mods/skywars/arena.js';
import * as bedwarsArena from '../src/mods/bedwars/arena.js';

const SW = skywarsArena.buildArena(skywarsArena.DEFAULT_MAP);
const BW = bedwarsArena.buildArena(bedwarsArena.DEFAULT_MAP);

test('the mods read the same definition the guest does', () => {
  assert.equal(fromMods.sanitizeGeneralState, sanitizeGeneralState);
});

test('SkyWars as a general state: every chest an objective, a spawn for each slot, the middle, the clock', () => {
  const g = describeSkyWars({ phase: 'playing', elapsed: 100, refills: 0, players: [{ id: 'a', name: 'A', slot: 2, alive: true, kills: 1 }, { id: 'b', name: 'B', slot: 5, alive: false, kills: 0 }] }, SW);
  assert.equal(g.v, GENERAL_STATE_VERSION);
  assert.equal(g.game, 'skywars');
  assert.deepEqual([g.rules.goal, g.rules.teams, g.rules.respawn, g.rules.timeLimit], ['last_player', false, false, 600]);
  assert.equal(g.timeLeft, 500, '10 minutes less 100 s');
  assert.deepEqual(g.next, { label: 'Chest refill', in: 80 }, 'the first refill at 3:00');
  assert.equal(g.objectives.length, SW.chests.length);
  assert.ok(g.objectives.every((o) => o.kind === 'chest' && o.state === 'filled'));
  assert.equal(g.objectives.filter((o) => o.ring === 'center').length, SW.chests.filter((c) => c.kind === 'center').length);
  assert.equal(g.places.filter((p) => p.kind === 'spawn').length, SW.spawns.filter(Boolean).length);
  assert.deepEqual(g.places.find((p) => p.kind === 'middle').at, [0.5, 31, 0.5]);
  assert.deepEqual(g.players.map((p) => [p.id, p.alive, p.slot, p.score.kills]), [['a', true, 2, 1], ['b', false, 5, 0]]);
  assert.deepEqual(sanitizeGeneralState(g), g, 'it is a valid general state as it stands');
});

test('Bed Wars as a general state: each team\'s bed and forge, the generators, and its places', () => {
  const teams = BW.bases.map((b, i) => ({ id: b.team, bed: i !== 1, eliminated: i === 3 }));
  const gens = [{ id: `f-${BW.bases[0].team}`, stock: { iron: 3, gold: 1 } }, { id: 'd0', stock: { diamond: 2 } }];
  const g = describeBedWars({ phase: 'playing', elapsed: 40, teams, gens, players: [{ id: 'a', team: BW.bases[0].team, alive: true, dead: false, kills: 2, finalKills: 1, beds: 0 }] }, BW);
  assert.deepEqual([g.rules.goal, g.rules.teams, g.rules.respawn], ['last_team', true, true]);
  const beds = g.objectives.filter((o) => o.kind === 'bed');
  assert.equal(beds.length, BW.bases.length);
  assert.equal(beds[0].state, 'standing');
  assert.equal(beds[1].state, 'broken');
  assert.deepEqual(beds[0].at, BW.bases[0].bed.foot);
  const forge = g.objectives.find((o) => o.id === `f-${BW.bases[0].team}`);
  assert.equal(forge.state, 'ready');
  assert.deepEqual(forge.stock, { iron: 3, gold: 1 });
  assert.equal(g.objectives.find((o) => o.id === `f-${BW.bases[2].team}`).state, 'empty');
  assert.equal(g.objectives.find((o) => o.id === 'd0').state, 'ready');
  assert.equal(g.objectives.filter((o) => o.kind === 'generator' && o.team === null).length, BW.diamonds.length + BW.emeralds.length);
  for (const kind of ['spawn', 'base', 'shop', 'upgrades']) assert.equal(g.places.filter((p) => p.kind === kind).length, BW.bases.length, kind);
  assert.deepEqual(g.teams.map((t) => t.alive), [true, true, true, false]);
  assert.deepEqual(sanitizeGeneralState(g), g);
});

test('the phases keep their names; a mod\'s own words for them map onto the four', () => {
  for (const p of ['lobby', 'countdown', 'playing', 'ended']) assert.equal(generalPhase(p), p);
  assert.equal(generalPhase('caged'), 'countdown');
  assert.equal(generalPhase('over'), 'ended');
  assert.equal(generalPhase(undefined), 'lobby');
});

test('a guest keeps only a well-formed general state: the wrong version or phase, bad ids and points are dropped', () => {
  const good = describeSkyWars({ phase: 'playing', elapsed: 0, players: [] }, SW);
  assert.equal(sanitizeGeneralState({ ...good, v: 2 }), null);
  assert.equal(sanitizeGeneralState({ ...good, phase: 'paused' }), null);
  assert.equal(sanitizeGeneralState({ ...good, game: 'bad game!' }), null);
  const odd = sanitizeGeneralState({
    ...good,
    objectives: [{ id: 'ok', kind: 'flag', at: [1, 2, 3], state: 'home', extra: { deep: { deeper: 1 } }, fn: 'x' }, { id: 'nopoint', kind: 'flag', at: [1, 'b', 3] }, { id: 'bad id!', kind: 'flag', at: [0, 0, 0] }],
    rules: { ...good.rules, text: 'x'.repeat(5000) },
    players: Array.from({ length: 600 }, (_, i) => ({ id: `p${i}` })),
  });
  assert.deepEqual(odd.objectives.map((o) => o.id), ['ok']);
  assert.deepEqual(odd.objectives[0].extra, {}, 'one level of numbers only');
  assert.equal(odd.rules.text.length, 2000);
  assert.equal(odd.players.length, 512);
  assert.equal(sanitizeGeneralState(null), null);
});

/** A host and a headless guest on a real share server (as multiplayerKnockback.test.js). */
async function room(t) {
  const app = createShareServer({ port: 0 });
  const port = await app.listen(0, '127.0.0.1');
  const location = { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' };
  const host = new ShareSession({ location, signalingFactory: (url) => new SignalingClient({ url, WebSocketImpl: WebSocket }) });
  const guest = new GuestPeerSession({ code: '0000', url: `ws://127.0.0.1:${port}/ws/share`, autopilot: false });
  t.after(async () => { guest.disconnect(); host.disconnect(true); await app.close(); });
  const { roomId } = await host.hostRoom('Host', { settings: { pvp: true } });
  guest.roomId = roomId;
  await guest.connect({ waitForSnapshot: false });
  clearInterval(guest.tickTimer); clearInterval(guest.brainTimer);
  return { host, guest };
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (check()) return; await pause(5); }
  assert.fail(`Timed out: ${label}`);
}

test('a SkyWars state sent with its general state reaches a headless guest, which keeps it; one without it leaves none', { timeout: 15000 }, async (t) => {
  const { host, guest } = await room(t);
  const state = { type: 'state', phase: 'playing', round: 1, elapsed: 10, refills: 0, timeLimit: 600, players: [{ id: guest.clientId, name: 'G', slot: 0, alive: true, kills: 0 }] };
  host.sendGame({ ...state, spawns: SW.spawns, chests: SW.chests.map((c) => ({ x: c.x, y: c.y, z: c.z, slot: c.slot, kind: c.kind })), general: describeSkyWars(state, SW) });
  await until(() => guest.generalState, 'the guest keeps the general state');
  assert.equal(guest.gameMode, 'skywars');
  // As the wire carries it (JSON: a -0 arrives as 0).
  assert.deepEqual(guest.generalState, sanitizeGeneralState(JSON.parse(JSON.stringify(describeSkyWars(state, SW)))));
  host.sendGame({ ...state, elapsed: 11, general: { v: 99 } });
  await until(() => guest.skywarsState?.elapsed === 11, 'the next state arrives');
  assert.equal(guest.generalState, null, 'a malformed one is not kept');
});

test('a Bed Wars state sent with its general state reaches a headless guest the same way', { timeout: 15000 }, async (t) => {
  const { host, guest } = await room(t);
  const teams = BW.bases.map((b) => ({ id: b.team, bed: true, eliminated: false, upgrades: {}, traps: [] }));
  const state = { type: 'state', phase: 'playing', round: 1, elapsed: 5, map: bedwarsArena.DEFAULT_MAP, teams, gens: [], players: [{ id: guest.clientId, name: 'G', team: teams[0].id, alive: true, dead: false }] };
  host.sendGame({ ...state, general: describeBedWars(state, BW) });
  await until(() => guest.generalState, 'the guest keeps the general state');
  assert.equal(guest.gameMode, 'bedwars');
  assert.equal(guest.generalState.game, 'bedwars');
  assert.equal(guest.generalState.objectives.filter((o) => o.kind === 'bed').length, BW.bases.length);
});
