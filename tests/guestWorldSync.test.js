// A headless guest (a house bot, an MCP agent) plays on the host's world as it is. A mini-game builds each round's arena
// anew from its map in every browser; a headless guest cannot, so it asks the host for the world again when the round or
// the map changes. It used to keep the world it joined with and stamp a guessed middle island and spawn islands into
// it on every state: on maps whose middle is not a disc at y 30 (Twin Peaks has none) bots took that guess for ground,
// bridged around it -- the gaps in their bridges -- and were seen walking on air.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createShareServer } from '../server/shareServer.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { GuestPeerSession, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (check()) return; await pause(10); }
  assert.fail(`Timed out: ${label}`);
}

/** A host whose world is the void (a mini-game's world between arenas), answering every request for it. */
async function room(t, mechanism = 'skywars', control = { answer: true }) {
  const app = createShareServer({ port: 0 });
  const port = await app.listen(0, '127.0.0.1');
  const location = { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' };
  const host = new ShareSession({ location, signalingFactory: (u) => new SignalingClient({ url: u, WebSocketImpl: WebSocket }) });
  const guest = new GuestPeerSession({ code: '0000', url: `ws://127.0.0.1:${port}/ws/share`, autopilot: false });
  t.after(async () => { guest.disconnect(); host.disconnect(true); await app.close(); });
  const asked = [];
  host.on('request_snapshot', ({ targetPeerId }) => {
    asked.push(targetPeerId);
    if (!control.answer) return;
    void host.sendWorldSnapshot(targetPeerId, { mapData: { mechanism, chunks: [] }, hostPos: { x: 0.5, y: 40, z: 0.5 }, hostYaw: 0, worldTime: 6000 });
  });
  const { roomId } = await host.hostRoom('Host', { settings: { pvp: true } });
  guest.roomId = roomId;
  await guest.connect({ waitForSnapshot: true, timeoutMs: 5000 });
  clearInterval(guest.tickTimer); clearInterval(guest.brainTimer);
  return { host, guest, asked };
}

const skywars = (guest, round, template = 'tiers', phase = 'playing') => ({
  type: 'state', phase, round, elapsed: 5, refills: 0, timeLimit: 600, map: { template, pack: 'stone_keep', seed: round },
  players: [{ id: guest.clientId, name: 'G', slot: 0, alive: true, kills: 0 }],
  spawns: [{ x: 0.5, y: 31, z: -29.5 }, { x: 0.5, y: 31, z: 30.5 }], chests: [],
});

test('SkyWars: no guessed islands over the host\'s world -- void at the middle stays void', { timeout: 20000 }, async (t) => {
  const { host, guest } = await room(t);
  host.sendGame(skywars(guest, 1));
  await until(() => guest.skywarsState?.round === 1, 'the state arrives');
  assert.equal(guest.getVoxel(0, 30, 0), BLOCKS.AIR, 'no guessed middle island');
  assert.equal(guest.getVoxel(0, 30, -30), BLOCKS.AIR, 'no guessed spawn island');
});

test('SkyWars: a new round or a new map asks for the world again; the same round does not', { timeout: 20000 }, async (t) => {
  const { host, guest, asked } = await room(t);
  const joined = asked.length;
  host.sendGame(skywars(guest, 1));
  await until(() => guest.skywarsState?.round === 1, 'round 1');
  host.sendGame({ ...skywars(guest, 1), elapsed: 9 });
  await until(() => guest.skywarsState?.elapsed === 9, 'the same round again');
  await pause(100);
  assert.equal(asked.length, joined, 'the world came with the welcome; nothing changed since');
  host.sendGame(skywars(guest, 2));
  await until(() => asked.length === joined + 1, 'asked at the new round');
  host.sendGame(skywars(guest, 2, 'twin_peaks', 'lobby'));
  await until(() => asked.length === joined + 2, 'asked at the new map');
});

test('a fresh world drops what the guest kept over the old one', { timeout: 20000 }, async (t) => {
  const { host, guest, asked } = await room(t);
  host.sendGame(skywars(guest, 1));
  await until(() => guest.skywarsState?.round === 1, 'round 1');
  guest.setVoxel(5, 30, 5, BLOCKS.STONE); // a block of the last round's arena, or a guess
  const n = asked.length;
  host.sendGame(skywars(guest, 2));
  await until(() => asked.length === n + 1, 'asked');
  await until(() => guest.getVoxel(5, 30, 5) === BLOCKS.AIR, 'the old block is gone with the fresh world');
});

test('Bed Wars: the same -- a new round asks for the world, and no guessed islands are stamped over it', { timeout: 20000 }, async (t) => {
  const { host, guest, asked } = await room(t, 'bedwars');
  const state = (round) => ({ type: 'state', phase: 'playing', round, elapsed: 5, map: { teams: 2, layout: 'practice', seed: 1 }, teams: [{ id: 'red', bed: true }, { id: 'blue', bed: true }], gens: [], players: [{ id: guest.clientId, name: 'G', team: 'red', alive: true, dead: false }] });
  const joined = asked.length;
  host.sendGame(state(1));
  await until(() => guest.bedwarsState?.round === 1, 'round 1');
  assert.equal(guest.getVoxel(0, 30, 0), BLOCKS.AIR, 'no guessed middle island');
  host.sendGame(state(2));
  await until(() => asked.length === joined + 1, 'asked at the new round');
});

test('a host that does not answer (one from before request_snapshot): the guest stops asking and guesses the islands, as it used to', { timeout: 20000 }, async (t) => {
  const control = { answer: true };
  const { host, guest, asked } = await room(t, 'skywars', control);
  control.answer = false; // from now on, nobody answers -- as an older host's page would not
  const heard = { get length() { return asked.length - joined; } };
  const joined = asked.length;
  host.sendGame(skywars(guest, 1));
  await until(() => guest.skywarsState?.round === 1, 'round 1');
  assert.equal(guest.getVoxel(0, 30, 0), BLOCKS.AIR, 'the world it has is the host\'s');
  host.sendGame(skywars(guest, 2));
  await until(() => heard.length === 1, 'asked once');
  await until(() => guest.getVoxel(0, 30, 0) === BLOCKS.GRASS, 'no answer in 4 s: the middle island is guessed', 6000);
  host.sendGame(skywars(guest, 3));
  await until(() => guest.skywarsState?.round === 3, 'round 3');
  await pause(200);
  assert.equal(heard.length, 1, 'it does not ask again: an older host counts every unknown message against it');
  void asked;
});

test('SkyWars: a map changed in the lobby, the round the same, moves the guest into the new map\'s cage', { timeout: 20000 }, async (t) => {
  const { host, guest } = await room(t);
  const lobby = (template, spawns) => ({ ...skywars(guest, 1, template, 'lobby'), spawns });
  host.sendGame(lobby('rush', [{ x: 0.5, y: 31, z: -21.5 }, { x: 0.5, y: 31, z: 22.5 }]));
  await until(() => guest.position.z === -21.5, 'in the first map\'s cage');
  host.sendGame(lobby('classic', [{ x: 0.5, y: 31, z: -30.5 }, { x: 0.5, y: 31, z: 31.5 }]));
  await until(() => guest.position.z === -30.5, 'in the new map\'s cage, not the last one\'s');
});
