// A chest is opened within reach, one at a time, as in Java (block_interaction_range 4.5 from the eyes; the server
// allows 1 more). In an Agent Arena film a bot standing by one chest of the middle emptied the others too, up to six
// blocks beyond it, and a guest's chest change was accepted from anywhere. Expected distances are worked by hand below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { withinBlockReach, BLOCK_REACH } from '../src/multiplayer/shareProtocol.js';
import { createShareServer } from '../server/shareServer.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { GuestPeerSession, chestReach, CHEST_REACH } from '../packages/blockyland-mcp/guestPeer.js';

test("reach is measured from the eyes to the block's nearest point: 4.5, and the server's 1 more", () => {
  assert.equal(BLOCK_REACH, 4.5);
  assert.equal(CHEST_REACH, 4.5);
  const feet = { x: 0.5, y: 31, z: 0.5 }; // eyes at y 32.62
  // A chest at (4, 31, 0): its near face at x 4, 3.5 across; its top at y 32, 0.62 below the eyes: hypot(3.5, 0.62) = 3.55.
  assert.ok(Math.abs(chestReach(feet, { x: 4, y: 31, z: 0 }) - Math.hypot(3.5, 0.62)) < 1e-9);
  // At (5, 31, 0): hypot(4.5, 0.62) = 4.54, just out of Java's reach, inside the server's 5.5.
  assert.ok(chestReach(feet, { x: 5, y: 31, z: 0 }) > 4.5);
  assert.equal(withinBlockReach(feet, { x: 5, y: 31, z: 0 }), true);
  assert.equal(withinBlockReach(feet, { x: 5, y: 31, z: 0 }, 0), false);
  // At (7, 31, 0): hypot(6.5, 0.62) = 6.53, beyond both.
  assert.equal(withinBlockReach(feet, { x: 7, y: 31, z: 0 }), false);
  // Straight down 4 blocks: the block's top at y 28, 4.62 below the eyes: out of reach for Java, in for the server.
  assert.ok(chestReach(feet, { x: 0, y: 27, z: 0 }) > 4.5 && withinBlockReach(feet, { x: 0, y: 27, z: 0 }));
  assert.equal(withinBlockReach(null, { x: 99, y: 0, z: 0 }), true, 'no position known yet: not judged');
});

function guestBy(chests) {
  const guest = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false });
  guest.connected = true;
  guest.gameMode = 'skywars';
  guest.sendPacket = () => {};
  guest.broadcastState = () => {};
  guest.moveStepToward = async () => {}; // stays where it is
  guest.position = { x: 0.5, y: 31, z: 0.5 };
  for (const c of chests) guest.chests.set(`${c.x},${c.y},${c.z}`, { ...c, receivedContainer: true });
  return guest;
}
const stack = (id, count = 1) => ({ id, count, isBlock: false });

test('looting opens the one chest looked at, not the chests around it', async () => {
  const near = { x: 2, y: 31, z: 0, items: [stack('iron_sword'), ...new Array(26).fill(null)] };
  const beside = { x: 5, y: 31, z: 3, items: [stack('diamond_sword'), ...new Array(26).fill(null)] }; // 3.6 from the first: it used to go too
  const guest = guestBy([near, beside]);
  const r = await guest.lootChest({ position: [2, 31, 0], bridge: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.looted.map((s) => s.id), ['iron_sword']);
  assert.ok(guest.chests.get('5,31,3').items.some((s) => s?.id === 'diamond_sword'), 'the other chest keeps its sword');
});

test('a chest out of reach is not opened', async () => {
  const far = { x: 8, y: 31, z: 0, items: [stack('diamond_sword'), ...new Array(26).fill(null)] };
  const guest = guestBy([far]);
  const r = await guest.lootChest({ position: [8, 31, 0], bridge: false });
  assert.equal(r.ok, false);
  assert.match(r.reason, /reach/);
  assert.ok(guest.chests.get('8,31,0').items.some((s) => s?.id === 'diamond_sword'));
});

test("the host makes a guest's chest change only within reach of where the guest is", async (t) => {
  const app = createShareServer({ port: 0 });
  const port = await app.listen(0, '127.0.0.1');
  const location = { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' };
  const host = new ShareSession({ location, signalingFactory: (u) => new SignalingClient({ url: u, WebSocketImpl: WebSocket }) });
  const guest = new GuestPeerSession({ code: '0000', url: `ws://127.0.0.1:${port}/ws/share`, autopilot: false });
  t.after(async () => { guest.disconnect(); host.disconnect(true); await app.close(); });
  host.on('request_snapshot', ({ targetPeerId }) => void host.sendWorldSnapshot(targetPeerId, { mapData: { chunks: [] }, hostPos: { x: 0.5, y: 40, z: 0.5 }, hostYaw: 0, worldTime: 6000 }));
  const { roomId } = await host.hostRoom('Host', { settings: { pvp: true } });
  guest.roomId = roomId;
  await guest.connect({ waitForSnapshot: true, timeoutMs: 5000 });
  clearInterval(guest.tickTimer); clearInterval(guest.brainTimer);
  const changed = [];
  host.on('container', (c) => changed.push(`${c.x},${c.y},${c.z}`));
  const items = [stack('stick'), ...new Array(26).fill(null)];
  guest.position = { x: 0.5, y: 31, z: 0.5 };
  guest.broadcastState({ force: true });
  const until = async (check) => { for (let i = 0; i < 300 && !check(); i++) await new Promise((r) => setTimeout(r, 10)); };
  await until(() => host.positions.size > 0);
  guest.sendPacket({ t: 'container', x: 12, y: 31, z: 0, items }); // 11.5 across: refused
  guest.sendPacket({ t: 'container', x: 3, y: 31, z: 0, items }); // 2.5 across: made
  await until(() => changed.length > 0);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(changed, ['3,31,0']);
});
