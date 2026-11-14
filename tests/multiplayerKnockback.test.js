import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createShareServer } from '../server/shareServer.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { SignalingClient } from '../src/multiplayer/signaling.js';
import { GuestPeerSession, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';
import { stepKnockback } from '../packages/blockyland-mcp/knockback.js';
import { sanitizeAttack } from '../src/multiplayer/shareProtocol.js';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const end = Date.now() + 3000;
  while (Date.now() < end) { if (check()) return; await pause(5); }
  assert.fail(`Timed out: ${label}`);
}

async function bridgeGame(t, mode = 'skywars') {
  const app = createShareServer({ port: 0 });
  const port = await app.listen(0, '127.0.0.1');
  const location = { href: `http://127.0.0.1:${port}/`, protocol: 'http:', host: `127.0.0.1:${port}`, search: '' };
  const session = () => new ShareSession({ location, signalingFactory: url => new SignalingClient({ url, WebSocketImpl: WebSocket }) });
  const host = session(), observer = session();
  const guest = new GuestPeerSession({ code: '0000', url: `ws://127.0.0.1:${port}/ws/share`, autopilot: false });
  t.after(async () => { guest.disconnect(); observer.disconnect(true); host.disconnect(true); await app.close(); });
  const { roomId } = await host.hostRoom('Attacker', { settings: { pvp: true } });
  guest.roomId = roomId;
  await guest.connect({ waitForSnapshot: false });
  clearInterval(guest.tickTimer); clearInterval(guest.brainTimer);
  await observer.joinRoom(roomId, 'Observer');
  const states = [[], []], deaths = [];
  host.on('player_state', p => { if (p.peerId === guest.clientId) states[0].push(p.state); });
  observer.on('player_state', p => { if (p.peerId === guest.clientId) states[1].push(p.state); });
  host.on('game', p => { if (p.data?.type === 'died') deaths.push(p.data); });
  guest.gameMode = mode;
  guest[mode === 'skywars' ? 'skywarsState' : 'bedwarsState'] = { phase: 'playing', players: [{ id: guest.clientId, alive: true, dead: false }] };
  guest.position = { x: 0.5, y: 31, z: 0.5 };
  for (let z = -8; z <= 8; z++) guest.setVoxel(0, 30, z, BLOCKS.STONE);
  // This is a one-block-wide bridge over the void, with no full island for a safe-walk fallback.
  host.sendPlayerState({ x: -2, y: 31, z: 0.5, yaw: -Math.PI / 2, pitch: 0 });
  guest.broadcastState();
  await until(() => states.every(s => s.length), 'both peers receive the initial bridge position');
  return { host, observer, guest, states, deaths };
}

test('one travel tick uses independently calculated Minecraft units, gravity and grounded drag', () => {
  const state = { position: { x: 0.5, y: 31, z: 0.5 }, velocity: { x: 8, y: 8, z: 0 }, onGround: true };
  const moved = stepKnockback(state, (x, y) => x === 0 && y === 30);
  // 0.4 blocks/tick * 20 = 8 blocks/second; 50 ms moves 0.4 blocks.
  assert.ok(Math.abs(moved.position.x - 0.9) < 1e-9);
  assert.ok(Math.abs(moved.position.y - 31.4) < 1e-9);
  assert.ok(Math.abs(moved.velocity.x - 8 * 0.6 * 0.91) < 1e-9);
  assert.ok(Math.abs(moved.velocity.y - (8 - 0.08 * 20) * 0.98) < 1e-9);
  assert.equal(moved.onGround, false);
});

test('knockback collides with walls rather than tunnelling through them', () => {
  let state = { position: { x: 0.5, y: 31, z: 0.5 }, velocity: { x: 50, y: 0, z: 0 }, onGround: true };
  for (let i = 0; i < 20; i++) state = stepKnockback(state, (x, y) => y === 30 || x === 2 && y >= 31 && y <= 34);
  assert.ok(state.position.x <= 1.7 + 1e-8, 'the 0.6-wide body stays on this side of the wall');
  assert.equal(state.velocity.x, 0);
  assert.equal(state.position.y, 31, 'lands back on the floor without being snapped a block upward');
});

for (const mode of ['skywars', 'bedwars']) for (const weapon of ['sword', 'arrow', 'snowball']) {
  test(`${mode}: ${weapon} knocks a busy, sneaking MCP guest off a bridge, and host and observer see it fall`, { timeout: 12000 }, async t => {
    const { host, guest, states, deaths } = await bridgeGame(t, mode);
    guest.manualActionBusy = true; guest.brainBusy = true; guest.isSneaking = true;
    const damage = weapon === 'snowball' ? 0 : 4;
    const options = weapon === 'sword' ? { weapon: 'iron_sword' } : { projectile: weapon, direction: { x: 1, z: 0 } };
    assert.equal(host.attackPlayer(guest.clientId, damage, options), null);
    await until(() => Number.isFinite(guest.lastHurtAt), 'hit delivery');
    assert.equal(guest.health, 20 - damage, 'a snowball never becomes half a point of health damage');
    assert.equal(guest.velocity.x, 8, 'same 0.4 blocks/tick impulse as the browser player');
    assert.equal(guest.velocity.y, 8);
    assert.equal(guest.position.x, 0.5, 'a hit changes velocity, not an instantaneous teleport');
    for (let i = 0; i < 90 && !guest.isDead; i++) { guest.tick(0.05); await pause(8); }
    await until(() => deaths.length, 'void death is reported to the authoritative host');
    assert.equal(deaths[0].cause, 'void');
    assert.equal(guest.isDead, true);
    assert.equal(guest.lastAttackerId, 'host');
    for (const history of states) {
      assert.ok(history.some(s => s.x > 1.3), 'the replicated body leaves the entire bridge footprint');
      assert.ok(history.some(s => s.y < 30), 'the replicated body falls below the bridge');
    }
  });
}

test('the guest hurt window rejects repeated knockback and applies only the extra damage of a stronger hit', async t => {
  const { host, guest } = await bridgeGame(t);
  host.attackPlayer(guest.clientId, 4, { weapon: 'iron_sword' });
  await until(() => guest.health === 16, 'first hit');
  guest.tick(0.05);
  const velocity = { ...guest.velocity };
  host.attackPlayer(guest.clientId, 4, { weapon: 'iron_sword' });
  host.attackPlayer(guest.clientId, 7, { weapon: 'diamond_sword' });
  await until(() => guest.health === 13, 'stronger hit deals just three more');
  assert.deepEqual(guest.velocity, velocity, 'neither hit adds a second impulse within 10 ticks');
});

for (const mode of ['skywars', 'bedwars']) {
  for (const sprint of [false, true]) test(`${mode}: raw ${sprint ? 'sprinting' : 'walking'} controls can leave a bridge and everyone sees the fall`, async t => {
    const { guest, states, deaths } = await bridgeGame(t, mode);
    guest.manualActionBusy = true; guest.brainBusy = true;
    guest.yaw = -Math.PI / 2;
    const bot = guest.bot;
    // Drive the same fixed control ticks used by setControlState, without a wall-clock interval racing the test.
    bot.setControlState('forward', true); clearInterval(bot._controlTimer); bot._controlTimer = null;
    bot.setControlState('sprint', sprint);
    for (let i = 0; i < 90 && !guest.isDead; i++) { bot._controlStep(); guest.tick(0.05); await pause(8); }
    await until(() => deaths.length, 'walking into the void reports a death');
    assert.equal(deaths[0].cause, 'void');
    assert.equal(guest.lastAttackerId, null, 'a voluntary fall does not invent an attacker');
    for (const history of states) {
      assert.ok(history.some(s => s.x > 1.3), 'no invisible bridge edge wall');
      assert.ok(history.some(s => s.y < 30), 'host and observer receive the fall');
    }
  });

  test(`${mode}: explicit sneak stops at the edge, releasing it permits a fall`, async t => {
    const { guest } = await bridgeGame(t, mode);
    guest.yaw = -Math.PI / 2;
    const bot = guest.bot;
    bot.setControlState('forward', true); clearInterval(bot._controlTimer); bot._controlTimer = null;
    bot.setControlState('sneak', true);
    for (let i = 0; i < 60; i++) { bot._controlStep(); guest.tick(0.05); }
    assert.ok(guest.position.x > 1 && guest.position.x <= 1.3, 'sneaking can lean out over the block');
    assert.equal(guest.position.y, 31);
    bot.setControlState('sneak', false);
    let crossed = false, fell = false;
    for (let i = 0; i < 35 && !guest.isDead; i++) {
      bot._controlStep(); guest.tick(0.05);
      crossed ||= guest.position.x > 1.3; fell ||= guest.position.y < 30;
    }
    assert.ok(crossed && fell, 'releasing sneak removes the restraint before spectator respawn');
  });

  test(`${mode}: grounded tick never nudges a player away from the edge`, async t => {
    const { guest } = await bridgeGame(t, mode);
    guest.position.x = 1.2;
    for (let i = 0; i < 20; i++) guest.tick(0.05);
    assert.equal(guest.position.x, 1.2, 'supporting a corner of the hitbox does not recenter it');
    assert.equal(guest.position.y, 31);
  });

  test(`${mode}: the move command has no automatic void avoidance`, async t => {
    const { guest, deaths, states } = await bridgeGame(t, mode);
    const physics = setInterval(() => guest.tick(0.05), 5);
    t.after(() => clearInterval(physics));
    await guest.act({ action: 'move', direction: 'east', distance: 6, duration_ms: 1500 });
    await until(() => deaths.length, 'direct movement can fall into the void');
    assert.equal(deaths[0].cause, 'void');
    assert.ok(states.every(history => history.some(s => s.x > 1.3 && s.y < 30)), 'both peers see the walk and fall before spectator respawn');
  });
}

test('projectile flight direction is normalized, while malformed directions and melee spoofing are refused', () => {
  const shot = sanitizeAttack({ target: 'guest', damage: 0, projectile: 'snowball', direction: { x: 3, z: 4 } });
  assert.deepEqual(shot.direction, { x: 0.6, z: 0.8 });
  for (const direction of [{ x: NaN, z: 1 }, { x: Infinity, z: 0 }, { x: 0, z: 0 }, { x: '1', z: 0 }])
    assert.equal(sanitizeAttack({ target: 'guest', damage: 4, projectile: 'arrow', direction }), null);
  assert.equal(sanitizeAttack({ target: 'guest', damage: 4, direction: { x: 1, z: 0 } }).direction, undefined);
});

test('absorption (a golden apple\'s) takes a hit before health, as in Java', async t => {
  const { host, guest } = await bridgeGame(t);
  guest.absorption = 4;
  host.attackPlayer(guest.clientId, 3, { weapon: 'stone_sword' });
  await until(() => guest.absorption < 4, 'the hit lands');
  assert.equal(guest.health, 20, 'health untouched while absorption lasts');
  assert.equal(guest.absorption, 1);
});
