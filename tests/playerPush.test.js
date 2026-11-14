// Players push each other as Java Edition's do (packages/blockyland-mcp/playerPush.js), for headless guests (the arena's
// bots) and for the browser player. Java's Entity.push(Entity): d = other.x - self.x, e = other.z - self.z,
// f = max(|d|, |e|); nothing below 0.01; else f = sqrt(f), d /= f, e /= f, both times min(1, 1/f) and 0.05, and self
// gets (-d, -e) blocks/tick, from every player whose 0.6 x 1.8 box intersects its own (LivingEntity.pushEntities).
// The expected numbers below are worked out by hand from that formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pushFrom, pushImpulse, stepPushVelocity, movePushed } from '../packages/blockyland-mcp/playerPush.js';
import { GuestPeerSession, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';
import { Player } from '../src/player.js';
import { RemotePlayerManager } from '../src/multiplayer/remotePlayerManager.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

test("one player's push is Java's Entity.push, worked by hand", () => {
  // Straight east, 0.3 away: f = 0.3, sqrt = 0.547723; d = 0.3 / 0.547723 = 0.547723; 1/f > 1 so no scaling; * 0.05.
  const east = pushFrom({ x: 0, z: 0 }, { x: 0.3, z: 0 });
  near(east.x, -0.0273861);
  near(east.z, 0);
  // Diagonal (0.2, 0.1): f = 0.2, sqrt = 0.447214; d = 0.447214, e = 0.223607; * 0.05, pushed away from the other.
  const diag = pushFrom({ x: 5, z: 5 }, { x: 5.2, z: 5.1 });
  near(diag.x, -0.0223607);
  near(diag.z, -0.0111803);
  // Closer than 0.01 on both axes: Java does nothing (two players exactly stacked stay stacked).
  assert.deepEqual(pushFrom({ x: 0, z: 0 }, { x: 0.004, z: -0.009 }), { x: 0, z: 0 });
  // At 0.01 exactly it pushes: f = 0.01, sqrt 0.1, e = 0.01 / 0.1 = 0.1, 1/f = 10 capped to 1, * 0.05 = 0.005.
  near(pushFrom({ x: 0, z: 0 }, { x: 0, z: 0.01 }).z, -0.005);
});

test('only players whose boxes intersect push, and touching is not intersecting', () => {
  const me = { x: 0, y: 64, z: 0 };
  // 0.6 wide boxes: centres 0.6 apart only touch (Java's AABB.intersects is strict).
  assert.deepEqual(pushImpulse(me, [{ x: 0.6, y: 64, z: 0 }]), { x: 0, z: 0 });
  assert.ok(pushImpulse(me, [{ x: 0.59, y: 64, z: 0 }]).x < 0);
  // A player standing on my head (feet 1.8 up) only touches; one whose feet are 1.7 up overlaps me.
  assert.deepEqual(pushImpulse(me, [{ x: 0.1, y: 65.8, z: 0 }]), { x: 0, z: 0 });
  assert.ok(pushImpulse(me, [{ x: 0.1, y: 65.7, z: 0 }]).x < 0);
  // Sneaking, my box is 1.5 tall: feet 1.6 up no longer reach me.
  assert.deepEqual(pushImpulse({ ...me, sneaking: true }, [{ x: 0.1, y: 65.6, z: 0 }]), { x: 0, z: 0 });
  // A player who is not pushable (dead, spectator) neither pushes nor is pushed.
  assert.deepEqual(pushImpulse(me, [{ x: 0.1, y: 64, z: 0, pushable: false }]), { x: 0, z: 0 });
  assert.deepEqual(pushImpulse({ ...me, pushable: false }, [{ x: 0.1, y: 64, z: 0 }]), { x: 0, z: 0 });
  // Two players on either side, equally close, cancel out; pushes from several players add.
  near(pushImpulse(me, [{ x: 0.3, y: 64, z: 0 }, { x: -0.3, y: 64, z: 0 }]).x, 0);
  near(pushImpulse(me, [{ x: 0.3, y: 64, z: 0 }, { x: 0, y: 64, z: 0.3 }]).z, -0.0273861);
});

test('a steady push settles where Java\'s drag balances it', () => {
  // Java: v(n+1) = v(n) * 0.546 + p on the ground (0.6 * 0.91). A steady p = 0.05 blocks/tick settles at
  // p / (1 - 0.546) = 0.110132 blocks/tick = 2.20264 blocks/second; in the air (0.91) at 0.05 / 0.09 * 20 = 11.1111.
  for (const [grounded, settle] of [[true, 2.20264], [false, 11.1111]]) {
    let v = { x: 0, z: 0 };
    for (let i = 0; i < 400; i++) v = stepPushVelocity(v, { x: 0.05, z: 0 }, grounded).velocity;
    near(v.x, settle, 1e-3);
  }
  // Each tick moves by the velocity it starts with: 2 blocks/second for one tick is 0.1 blocks.
  near(stepPushVelocity({ x: 2, z: 0 }, { x: 0, z: 0 }, true).move.x, 0.1);
  // With no push left, the velocity dies away: 0.546^30 of 2 blocks/second is below a thousandth, and then it is 0.
  let v = { x: 2, z: 0 };
  for (let i = 0; i < 30; i++) v = stepPushVelocity(v, { x: 0, z: 0 }, true).velocity;
  assert.deepEqual(v, { x: 0, z: 0 });
});

test('a push does not carry a player into a block, and a grounded sneaker is not pushed off an edge', () => {
  const wallWest = (x, y, z) => x === -1;
  const pushed = movePushed({ x: 0.31, y: 64, z: 0.5 }, { x: -3, z: 0 }, { x: -0.1, z: 0 }, wallWest);
  near(pushed.position.x, 0.31);
  assert.equal(pushed.velocity.x, 0);
  const open = () => false;
  const ground = (p) => p.x > 0 && p.x < 1;
  near(movePushed({ x: 0.05, y: 64, z: 0.5 }, { x: -3, z: 0 }, { x: -0.1, z: 0 }, open, { sneaking: true, grounded: true, hasGround: ground }).position.x, 0.05);
  near(movePushed({ x: 0.05, y: 64, z: 0.5 }, { x: -3, z: 0 }, { x: -0.1, z: 0 }, open, { sneaking: false, grounded: true, hasGround: ground }).position.x, -0.05);
});

// A headless guest (an arena bot), ticked by hand, with another player whose state it has heard.
function guestWith({ ground = (x, z) => true, mode = 'skywars' } = {}) {
  const guest = new GuestPeerSession({ code: '0000', url: 'ws://127.0.0.1:1/ws/share', autopilot: false });
  guest.connected = true;
  guest.sendPacket = () => true;
  guest.gameMode = mode;
  guest.gamemode = 'survival';
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (ground(x, z)) guest.setVoxel(x, 30, z, BLOCKS.STONE);
  guest.position = { x: 0.5, y: 31, z: 0.5 };
  const roster = [{ id: guest.clientId, alive: true, dead: false }];
  guest.skywarsState = { phase: 'playing', players: roster };
  const other = (id, state, inGame = true) => {
    if (inGame) roster.push({ id, alive: true, dead: false });
    guest.peers.set(id, { id, name: id, ...state, stateAt: Date.now() });
  };
  return { guest, other };
}

test('a guest pushed by another player moves away until their boxes part, and no further than the drag lets it slide', () => {
  const { guest, other } = guestWith();
  other('rival', { x: 0.7, y: 31, z: 0.5 });
  for (let i = 0; i < 60; i++) guest.tick(0.05);
  const gap = 0.7 - guest.position.x;
  // Parted (0.6 or more). Past that the push is gone and the guest only slides: from at most the steady 2.2026
  // blocks/second, the ground drag (0.546 a tick) lets it go 2.2026 * 0.05 / (1 - 0.546) = 0.2426 blocks more.
  assert.ok(gap >= 0.6 && gap <= 0.6 + 0.2426, `gap ${gap}`);
  near(guest.position.z, 0.5);
  near(guest.position.y, 31);
});

test('in a mini-game only its living players push: not the referee host, not a dead player, not a stale position', () => {
  for (const [label, setup] of [
    ['referee host (not in the roster)', (other) => other('host', { x: 0.7, y: 31, z: 0.5 }, false)],
    ['dead player', (other) => other('ghost', { x: 0.7, y: 31, z: 0.5, dead: true })],
  ]) {
    const { guest, other } = guestWith();
    setup(other);
    for (let i = 0; i < 20; i++) guest.tick(0.05);
    near(guest.position.x, 0.5);
    assert.ok(true, label);
  }
  const { guest } = guestWith();
  guest.peers.set('old', { id: 'old', x: 0.7, y: 31, z: 0.5, stateAt: Date.now() - 10_000 });
  guest.skywarsState.players.push({ id: 'old', alive: true });
  for (let i = 0; i < 20; i++) guest.tick(0.05);
  near(guest.position.x, 0.5);
});

test('on a one-block bridge a push sideways can knock a guest into the void, unless it sneaks', () => {
  const bridge = (x) => x === 0;
  // From the middle of the bridge a push only parts the two boxes, and the guest stays on the bridge.
  const middle = guestWith({ ground: bridge });
  middle.other('rival', { x: 0.75, y: 31, z: 0.5 });
  for (let i = 0; i < 40; i++) middle.guest.tick(0.05);
  near(middle.guest.position.y, 31);
  // Near the edge, a player crowding in from the inside pushes the guest's whole box off the block: it falls.
  const edge = guestWith({ ground: bridge });
  edge.guest.position = { x: 0.15, y: 31, z: 0.5 };
  edge.other('rival', { x: 0.35, y: 31, z: 0.5 });
  for (let i = 0; i < 40; i++) edge.guest.tick(0.05);
  assert.ok(edge.guest.position.y < 31, 'the pushed guest fell off the bridge');

  const sneaker = guestWith({ ground: bridge });
  sneaker.guest.isSneaking = true;
  sneaker.guest.position = { x: 0.15, y: 31, z: 0.5 };
  sneaker.other('rival', { x: 0.35, y: 31, z: 0.5 });
  for (let i = 0; i < 40; i++) sneaker.guest.tick(0.05);
  near(sneaker.guest.position.y, 31);
  assert.ok(sneaker.guest.isFootSupported(sneaker.guest.position.x, 31, sneaker.guest.position.z));
});

test('the browser player is pushed by the remote players the game lists, at Java\'s rate', () => {
  const p = Object.create(Player.prototype);
  Object.assign(p, { position: new THREE.Vector3(0, 64, 0), onGround: true, isDead: false, gamemode: 'survival', isSneaking: false });
  p.pushingPlayers = () => [{ x: 0.3, y: 64, z: 0 }];
  // One tick (0.05 s): the push is 0.0273861 blocks/tick west = 0.547723 blocks/second.
  near(p.advancePlayerPush(0.05).x, -0.547723);
  // The next tick: 0.547723 * 0.546 + 0.547723.
  near(p.advancePlayerPush(0.05).x, -0.547723 * 1.546);
  // A spectator is not pushed.
  p.gamemode = 'spectator';
  assert.deepEqual(p.advancePlayerPush(0.05), { x: 0, z: 0 });
});

test('the remote players who push are those heard, alive and shown', (t) => {
  // Avatars draw their name tags on a canvas: a stand-in document for this test only (test files share a process).
  if (globalThis.document === undefined) {
    globalThis.document = { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({}) }), style: {} }) };
    t.after(() => { delete globalThis.document; });
  }
  const rpm = new RemotePlayerManager({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), player: { position: new THREE.Vector3() } });
  rpm.updatePeerState('a', { x: 1, y: 64, z: 2, isSneaking: true });
  rpm.updatePeerState('b', { x: 3, y: 64, z: 4 });
  rpm.addPeer('c', 'Unheard');
  rpm.remotePlayers.get('b').avatar.mesh.visible = false; // hidden by the world's game (a spectator, the referee)
  assert.deepEqual(rpm.pushers(), [{ x: 1, y: 64, z: 2, sneaking: true }]);
});
