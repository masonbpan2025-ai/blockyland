// A headless guest -- a scripted bot, an MCP agent -- is seen wearing what it wears: its state carries its armour and its
// off hand as a browser player's does (src/multiplayer/playerLook.js), so the host's check keeps them and every other
// player draws them. They were sent as the inventory's own objects, and dropped: nobody saw a bot's armour or shield.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createShareServer } from '../server/shareServer.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { sanitizePlayerState } from '../src/multiplayer/shareProtocol.js';

/** A guest that has looted armour and a shield and put them on (its inventory's own rule: the best piece per slot). */
function armouredGuest(url = 'ws://127.0.0.1:1/x') {
  const g = new GuestPeerSession({ code: '0000', url, autopilot: false });
  g.inventory.addItem('iron_chestplate', false, 1);
  g.inventory.addItem('diamond_boots', false, 1);
  g.inventory.addItem('shield', false, 1);
  g.inventory.equipBest();
  return g;
}

test('a guest\'s state carries its armour in head, chest, legs, feet order and its off hand, and the host keeps them', () => {
  const g = armouredGuest();
  const sent = [];
  g.connected = true;
  g.sendPacket = (m) => { sent.push(m); return true; };
  g.broadcastState();
  const kept = sanitizePlayerState(sent[0].state);
  assert.deepEqual(kept.armor, [null, { id: 'iron_chestplate' }, null, { id: 'diamond_boots' }]);
  assert.equal(kept.offhand, 'shield');
});

test('a trimmed piece is seen with its trim', () => {
  const g = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/x', autopilot: false });
  g.inventory.armor.head = { id: 'iron_helmet', count: 1, trim: { pattern: 'coast', material: 'gold' } };
  const sent = [];
  g.connected = true;
  g.sendPacket = (m) => { sent.push(m); return true; };
  g.broadcastState();
  assert.deepEqual(sanitizePlayerState(sent[0].state).armor[0], { id: 'iron_helmet', trim: { pattern: 'coast', material: 'gold' } });
});

test('through a real share server, the host sees the guest\'s armour and shield', { timeout: 15000 }, async (t) => {
  const app = createShareServer({ port: 0 });
  const port = await app.listen(0, '127.0.0.1');
  const location = { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' };
  const host = new ShareSession({ location, signalingFactory: (u) => new SignalingClient({ url: u, WebSocketImpl: WebSocket }) });
  const guest = armouredGuest(`ws://127.0.0.1:${port}/ws/share`);
  t.after(async () => { guest.disconnect(); host.disconnect(true); await app.close(); });
  const { roomId } = await host.hostRoom('Host', { settings: { pvp: true } });
  guest.roomId = roomId;
  await guest.connect({ waitForSnapshot: false });
  clearInterval(guest.tickTimer); clearInterval(guest.brainTimer);
  const states = [];
  host.on('player_state', (p) => { if (p.peerId === guest.clientId) states.push(p.state); });
  guest.broadcastState();
  const end = Date.now() + 3000;
  while (!states.some((s) => s.armor) && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
  const seen = states.find((s) => s.armor);
  assert.ok(seen, 'the host received the guest\'s armour');
  assert.deepEqual(seen.armor, [null, { id: 'iron_chestplate' }, null, { id: 'diamond_boots' }]);
  assert.equal(seen.offhand, 'shield');
});

/** A guest whose packets are recorded instead of sent. */
function recorded(Session = GuestPeerSession) {
  const g = new Session({ code: '0000', url: 'ws://127.0.0.1:1/x', autopilot: false });
  const sent = [];
  g.connected = true;
  g.sendPacket = (m) => { sent.push(m); return true; };
  return { g, sent, last: () => sanitizePlayerState(sent.filter((m) => m.t === 'player_state').at(-1).state) };
}

test('drawing a bow is seen: the bow in hand, held out (using "bow"); after the shot, no longer', async () => {
  const { g, last } = recorded();
  g.inventory.addItem('bow', false, 1);
  g.inventory.addItem('arrow', false, 8);
  g.inventory.activeSlot = g.inventory.hotbar.findIndex((s) => s?.id === 'bow');
  await g.bot.activateItem();
  g.broadcastState();
  assert.deepEqual([last().activeItem, last().using], ['bow', 'bow']);
  await new Promise((r) => setTimeout(r, 120));
  g.bot.deactivateItem();
  g.broadcastState();
  assert.equal(last().using, null);
});

test('eating is seen: the food in hand, at the mouth (using "eat")', () => {
  const { g, last } = recorded();
  g.inventory.addItem('stone_sword', false, 1);
  g.inventory.addItem('golden_apple', false, 1);
  g.health = 10;
  assert.equal(g.startEating('golden_apple'), true);
  g.broadcastState();
  assert.deepEqual([last().activeItem, last().using], ['golden_apple', 'eat']);
});

test('a scripted bot\'s snowball is in its hand before it is thrown: the others see it, then the throw', async () => {
  const { ScriptedBotSession } = await import('../agentArena/scriptedBot/scriptedBot.mjs');
  const { g, sent } = recorded(ScriptedBotSession);
  g.inventory.addItem('stone_sword', false, 1);
  g.inventory.addItem('snowball', false, 4);
  g.position = { x: 0.5, y: 31, z: 0.5 };
  assert.equal(g.throwAt('snowball', 0.5, 31, -10.5), true);
  const shot = sent.findIndex((m) => m.t === 'shot');
  assert.ok(shot > 0, 'a shot was sent');
  const before = sent.slice(0, shot).filter((m) => m.t === 'player_state').at(-1);
  assert.equal(sanitizePlayerState(before.state).activeItem, 'snowball', 'the snowball in hand before the throw');
  assert.equal(g.inventory.countItem('snowball'), 3);
});
