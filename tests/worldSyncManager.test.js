// The game's side of sharing: the dialogs, joining from a link, and keeping two worlds in step.
//
// Two WorldSyncManagers run against mock games and a mock page, joined by the in-memory network from
// helpers/shareFakes.js. What a real browser adds -- WebRTC, a real page, real worlds -- is covered by e2e/share.pw.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { WorldSyncManager, describeShareError } from '../src/multiplayer/worldSyncManager.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { ShareError } from '../src/multiplayer/signaling.js';
import { BLOCKS } from '../src/blocks.js';
import { createFakeNetwork, nextEvent, settle } from './helpers/shareFakes.js';

/** A small page: every element the manager looks up exists, and text, classes and children can be read back. */
function setupMockDom(t) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const elements = new Map();
  const make = (tag, id = null) => {
    const el = {
      tagName: tag, id, textContent: '', value: '', style: {}, children: [], onclick: null, title: '', className: '',
      classList: {
        classes: new Set(),
        add(c) { this.classes.add(c); },
        remove(c) { this.classes.delete(c); },
        contains(c) { return this.classes.has(c); },
        toggle(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); },
      },
      appendChild(child) { this.children.push(child); return child; },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = [...nodes]; },
      addEventListener() {}, removeEventListener() {}, remove() {}, select() {},
      // A drawing surface that accepts every call: the nametag above an avatar is drawn on a canvas.
      getContext: () => new Proxy({}, { get: (_, key) => (key === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true }),
    };
    return el;
  };
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, make('div', id));
    return elements.get(id);
  };
  globalThis.document = { getElementById: get, createElement: (tag) => make(tag), body: make('body'), execCommand() {} };
  return { get, elements };
}

/** A game with a world of voxels, a player, a chat log and the hooks the manager calls. */
function mockGame({ name = 'game' } = {}) {
  const voxels = new Map();
  const chatLog = [];
  const rebuilt = [];
  return {
    name,
    scene: new THREE.Scene(),
    world: {
      seed: 42,
      getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id),
      getChunk: (cx, cz) => ({ cx, cz }),
      chunks: new Map(),
      voxels,
    },
    player: { position: new THREE.Vector3(10, 64, 10), yaw: 0, pitch: 0, isSneaking: false, isSprinting: false },
    inventory: { getActiveItem: () => ({ id: 'stick' }) },
    ui: { addChatMessage: (msg) => chatLog.push(msg), closeAllModals() {} },
    chatLog, rebuilt,
    worldGenerated: true, worldReady: true, worldTime: 1000, isMouseDown: false,
    rebuildChunkMesh: (chunk) => rebuilt.push(`${chunk.cx},${chunk.cz}`),
    generateNewWorld: async () => {},
  };
}

const LOCATION = { href: 'https://game.example/', protocol: 'https:', host: 'game.example', search: '' };

function managerOn(network, { game = mockGame(), location = LOCATION, ...options } = {}) {
  const session = new ShareSession({
    signalingFactory: network.signalingFactory, peerFactory: network.peerFactory, location,
    timeouts: { connectMs: 400, heartbeatMs: 40, silenceMs: 400, resignalMs: 30 },
  });
  // A world "file" is just the voxels, so the guest ends up with the host's blocks.
  const serialize = (g) => ({ voxels: [...g.world.voxels.entries()], tag: 'world' });
  const deserialize = async (g, data) => { for (const [k, v] of data.voxels) g.world.voxels.set(k, v); };
  const manager = new WorldSyncManager(game, { session, serialize, deserialize, ...options });
  manager.playerName = () => options.name ?? 'Tester';
  return { manager, game, session };
}

// --- hosting --------------------------------------------------------------------------

test('hosting shows the link, the code and who is here, and the link opens the world', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const { manager, session } = managerOn(network);
  t.after(() => session.disconnect(true));
  await manager.hostWorld();
  assert.equal(manager.isHosting, true);
  assert.match(dom.get('host-share-link-input').value, /^https:\/\/game\.example\/\?join=[0-9]{4}$/);
  assert.equal(dom.get('host-room-id-badge').textContent, manager.roomId);
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), false, 'the dialog is open');
  assert.equal(dom.get('host-local-warning').classList.contains('hidden'), true, 'a public address needs no warning');
  assert.equal(dom.get('hud-multiplayer-badge').classList.contains('hidden'), false);
  assert.match(dom.get('hud-multiplayer-text').textContent, /Sharing: 1 player$/);
  const rows = dom.get('host-connected-players-list').children;
  assert.equal(rows.length, 1);
  assert.match(rows[0].children[0].textContent, /You \(Host\)/);
});

test('a link on localhost warns that only this computer can open it', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const local = { href: 'http://localhost:3000/', protocol: 'http:', host: 'localhost:3000', search: '' };
  const { manager, session } = managerOn(network, { location: local });
  t.after(() => session.disconnect(true));
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(url); return { ok: true, json: async () => ({ lan: [{ address: '192.168.1.9', url: 'http://192.168.1.9:3000/', name: 'wifi' }] }) }; };
  t.after(() => { globalThis.fetch = realFetch; });
  await manager.hostWorld();
  await settle(10);
  assert.equal(dom.get('host-local-warning').classList.contains('hidden'), false);
  assert.deepEqual(fetched, ['/api/share/info']);
  const lan = dom.get('host-lan-links').children;
  const inputs = lan.flatMap((row) => row.children ?? []).filter((c) => c.tagName === 'input');
  assert.equal(inputs.length, 1);
  assert.equal(inputs[0].value, `http://192.168.1.9:3000/?join=${manager.roomId}`, 'a ready link on the network address');
});

test('sharing again just shows the link, and does not start a second room', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const { manager, session } = managerOn(network);
  t.after(() => session.disconnect(true));
  await manager.hostWorld();
  const code = manager.roomId;
  dom.get('host-world-modal').classList.add('hidden');
  await manager.hostWorld();
  assert.equal(manager.roomId, code, 'the same room');
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), false, 'the dialog is back');
  assert.equal(network.rooms.size, 1);
});

test('when sharing cannot start, the dialog says why, in words, instead of alerting', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  network.signalingReachable = false;
  const { manager } = managerOn(network);
  await manager.hostWorld();
  assert.equal(manager.isHosting, false);
  const error = dom.get('host-error');
  assert.equal(error.classList.contains('hidden'), false);
  assert.match(error.textContent, /Could not reach the sharing service/);
  assert.equal(dom.get('host-link-section').classList.contains('hidden'), true, 'no link is offered that would not work');
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), false);
});

test('stopping sharing closes the room, clears the screen and tells the guests', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  await settle(20);
  host.manager.leave();
  await settle(100);
  assert.equal(host.manager.isHosting, false);
  assert.equal(network.rooms.size, 0, 'the room is gone');
  assert.equal(dom.get('hud-multiplayer-badge').classList.contains('hidden'), true);
  assert.match(dom.get('join-status-text').textContent, /closed/i, 'the guest is told the world closed');
});

test('the Stop Sharing button stops sharing and closes the dialog', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const { manager, session } = managerOn(network);
  t.after(() => session.disconnect(true));
  await manager.hostWorld();
  dom.get('btn-stop-sharing').onclick();
  assert.equal(manager.isHosting, false);
  assert.equal(network.rooms.size, 0);
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), true);
});

test('the Done and close buttons close the dialog but keep sharing', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const { manager, session } = managerOn(network);
  t.after(() => session.disconnect(true));
  await manager.hostWorld();
  for (const id of ['btn-dismiss-host-modal', 'btn-close-host-world']) {
    dom.get('host-world-modal').classList.remove('hidden');
    dom.get(id).onclick();
    assert.equal(dom.get('host-world-modal').classList.contains('hidden'), true, id);
  }
  assert.equal(manager.isHosting, true);
  assert.equal(network.rooms.size, 1);
});

test('clicking the player badge while sharing brings the link back', async (t) => {
  const dom = setupMockDom(t);
  const { manager, session } = managerOn(createFakeNetwork());
  t.after(() => session.disconnect(true));
  await manager.hostWorld();
  dom.get('host-world-modal').classList.add('hidden');
  dom.get('hud-multiplayer-badge').onclick();
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), false);
});

// --- joining --------------------------------------------------------------------------

test('a guest who opens the link ends up in the host\'s world with the host\'s blocks', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  host.game.world.setVoxel(3, 4, 5, BLOCKS.DIAMOND_BLOCK);
  host.game.player.position.set(100, 70, 200);
  await host.manager.hostWorld();

  await guest.manager.joinWorld(host.manager.roomId);
  assert.equal(guest.game.world.getVoxel(3, 4, 5), BLOCKS.DIAMOND_BLOCK, 'the world arrived');
  assert.ok(Math.abs(guest.game.player.position.x - 101.2) < 1e-6, 'the guest appears next to the host');
  assert.equal(guest.manager.isJoined, true);
  assert.equal(guest.game.worldReady, true);
  assert.equal(dom.get('join-connecting-overlay').classList.contains('hidden'), true, 'the joining screen is gone');
  assert.ok(guest.manager.remotePlayers.remotePlayers.has('host'), 'the host is visible');
  assert.ok(guest.game.chatLog.some((m) => m.includes('Welcome')));
  assert.ok(host.game.chatLog.some((m) => m.includes('Gus') && m.includes('joined')));
});

test('a guest sees every player already in the world, not only the host', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const first = managerOn(network, { name: 'Ann' });
  const second = managerOn(network, { name: 'Bob' });
  t.after(() => { host.session.disconnect(true); first.session.disconnect(true); second.session.disconnect(true); });
  await host.manager.hostWorld();
  await first.manager.joinWorld(host.manager.roomId);
  await second.manager.joinWorld(host.manager.roomId);
  const seen = [...second.manager.remotePlayers.remotePlayers.values()].map((p) => p.name).sort();
  assert.deepEqual(seen, ['Ann', 'Hana']);
});

test('each way joining can fail is explained, and the guest is offered the way back', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const guest = managerOn(network);
  await guest.manager.joinWorld('9999');
  assert.match(dom.get('join-status-text').textContent, /No world is being shared with that code/);
  assert.equal(dom.get('join-progress-fill').style.background, '#ef4444');
  const back = dom.get('btn-join-cancel');
  assert.equal(back.classList.contains('hidden'), false, 'a way out is offered');
  assert.equal(back.textContent, 'Back to Main');
  assert.equal(guest.manager.isJoined, false);
});

test('a link with no usable code says so, rather than doing nothing', async (t) => {
  const dom = setupMockDom(t);
  const guest = managerOn(createFakeNetwork());
  await guest.manager.joinFromLink('?join=oops');
  assert.match(dom.get('join-status-text').textContent, /A join code is four digits/);
  await guest.manager.joinFromLink('?join=');
  assert.match(dom.get('join-status-text').textContent, /four digits/);
});

test('a link\'s code is read from the address and joined', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinFromLink(`?x=1&join=${host.manager.roomId.toUpperCase()}`);
  assert.equal(guest.manager.isJoined, true);
});

test('the guest is told when the host closes the world, and can go back', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => guest.session.disconnect(true));
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  const gone = nextEvent(guest.session, 'host_disconnected');
  host.manager.leave();
  await gone;
  assert.match(dom.get('join-overlay-title').textContent, /closed/i);
  assert.equal(guest.manager.isJoined, false);
  assert.equal(guest.manager.remotePlayers.remotePlayers.size, 0, 'the host\'s avatar is gone');
  assert.equal(dom.get('btn-join-cancel').classList.contains('hidden'), false);
});

// --- keeping the worlds in step ---------------------------------------------------------------

test('block edits flow both ways and redraw the chunk, and its neighbour on an edge', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  await settle(20);

  guest.manager.onBlockPlaced(5, 70 - 10, 5, BLOCKS.DIAMOND_BLOCK);
  await settle(30);
  assert.equal(host.game.world.getVoxel(5, 60, 5), BLOCKS.DIAMOND_BLOCK, 'the guest\'s block reached the host');

  host.manager.onBlockBroken(5, 60, 5);
  await settle(30);
  assert.equal(guest.game.world.getVoxel(5, 60, 5), BLOCKS.AIR, 'the host\'s break reached the guest');

  guest.game.rebuilt.length = 0;
  host.manager.onBlockPlaced(16, 10, 5, BLOCKS.STONE); // on a chunk's west edge: x & 15 === 0
  await settle(30);
  assert.ok(guest.game.rebuilt.length >= 2, `the edge touches a neighbour: ${guest.game.rebuilt}`);
});

test('a guest is never sent its own edit back', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  guest.game.rebuilt.length = 0;
  guest.manager.onBlockPlaced(1, 2, 3, BLOCKS.STONE);
  await settle(30);
  assert.equal(guest.game.rebuilt.length, 0, 'no echo to redraw');
});

test('chat appears for everyone, with the sender\'s name, and nothing in it can become markup', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  await settle(20);
  guest.manager.onChatSent('<img src=x onerror=alert(1)> hello & goodbye');
  await settle(30);
  const line = host.game.chatLog.find((m) => m.includes('Gus') && m.includes('hello'));
  assert.ok(line, 'the host saw it');
  assert.ok(!line.includes('<img'), `escaped: ${line}`);
  assert.ok(line.includes('&lt;img src=x onerror=alert(1)&gt; hello &amp; goodbye'));
});

test('a name with markup in it is shown as text in the list and in the join message', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  t.after(() => host.session.disconnect(true));
  await host.manager.hostWorld();
  // A guest that bypasses the manager and joins with a hostile name.
  const hostile = new ShareSession({ signalingFactory: network.signalingFactory, peerFactory: network.peerFactory, location: LOCATION, timeouts: { connectMs: 400, heartbeatMs: 40, silenceMs: 400 } });
  t.after(() => hostile.disconnect(true));
  await hostile.joinRoom(host.manager.roomId, 'Mallory<script>alert(1)</script>');
  await settle(20);
  const rows = dom.get('host-connected-players-list').children;
  const labels = rows.map((r) => r.children[0].textContent);
  assert.ok(labels.some((l) => l.includes('Mallory')));
  assert.ok(labels.every((l) => !/[<>]/.test(l)), JSON.stringify(labels));
  assert.ok(host.game.chatLog.every((m) => !m.includes('<script')), 'and the join message is escaped');
});

test('movement is sent to others about 25 times a second, and not at all when alone', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  const sent = [];
  const original = host.session.sendPlayerState.bind(host.session);
  host.session.sendPlayerState = (s) => { sent.push(s); original(s); };
  for (let i = 0; i < 50; i++) host.manager.update(0.02);
  assert.equal(sent.length, 0, 'nobody else is here');
  await guest.manager.joinWorld(host.manager.roomId);
  for (let i = 0; i < 50; i++) host.manager.update(0.02); // one second of frames
  assert.ok(sent.length >= 22 && sent.length <= 27, `${sent.length} updates in a second`);
  assert.equal(sent[0].activeItem, 'stick');
  assert.equal(sent[0].x, 10);
});

test('another player\'s movement moves their avatar', async (t) => {
  setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  await settle(20);
  guest.game.player.position.set(33, 64, -7);
  for (let i = 0; i < 5; i++) guest.manager.update(0.05);
  await settle(30);
  const avatar = [...host.manager.remotePlayers.remotePlayers.values()].find((p) => p.name === 'Gus');
  assert.ok(avatar, 'the guest has an avatar on the host');
  assert.equal(avatar.targetPos.x, 33);
  assert.equal(avatar.targetPos.z, -7);
});

// --- leaving ----------------------------------------------------------------------------------------

test('leaving forgets the room, the players and the dialog, and the manager can host again', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  const guest = managerOn(network, { name: 'Gus' });
  t.after(() => { host.session.disconnect(true); guest.session.disconnect(true); });
  await host.manager.hostWorld();
  await guest.manager.joinWorld(host.manager.roomId);
  const firstCode = host.manager.roomId;
  host.manager.leave();
  assert.equal(host.manager.isHosting, false);
  assert.equal(host.manager.roomId, null);
  assert.equal(host.manager.remotePlayers.remotePlayers.size, 0);
  assert.equal(dom.get('host-world-modal').classList.contains('hidden'), true);
  await host.manager.hostWorld();
  assert.notEqual(host.manager.roomId, firstCode, 'a new room, with a new code');
});

test('leaving is safe when nothing was shared', async (t) => {
  setupMockDom(t);
  const { manager } = managerOn(createFakeNetwork());
  assert.doesNotThrow(() => manager.leave());
  assert.doesNotThrow(() => manager.leave());
});

test('the name a player goes by is remembered, and cleaned', async (t) => {
  setupMockDom(t);
  const store = new Map();
  const real = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } });
  t.after(() => { if (real) Object.defineProperty(globalThis, 'localStorage', real); else delete globalThis.localStorage; });
  const manager = new WorldSyncManager(mockGame(), { session: new ShareSession({ signalingFactory: createFakeNetwork().signalingFactory, location: LOCATION }) });
  const first = manager.playerName();
  assert.match(first, /^Player-\d{4}$/);
  assert.equal(manager.playerName(), first, 'the same name next time');
  store.set('mc-player-name', '<b>Alex</b>');
  assert.equal(manager.playerName(), 'bAlex/b', 'a stored name is cleaned before use');
});

// --- the words ------------------------------------------------------------------------------------

test('every kind of failure has a sentence a person can act on', () => {
  const codes = {
    room_not_found: /No world is being shared with that code/, bad_code: /four digits/, too_many_codes: /Wait a minute/,
    room_full: /full/, room_busy: /try again/i,
    version_mismatch: /different version/, signalling_unreachable: /sharing service/, connect_timeout: /block peer-to-peer/,
  };
  for (const [code, pattern] of Object.entries(codes)) {
    const text = describeShareError(new ShareError(code, 'x'));
    assert.match(text, pattern, code);
    assert.ok(text.length > 20 && !/undefined|\[object/.test(text), code);
  }
  assert.equal(describeShareError(new ShareError('connect_failed', 'Custom words.')), 'Custom words.');
  assert.match(describeShareError(new Error('plain')), /plain/);
  assert.match(describeShareError(null), /Something went wrong/);
});

// --- Join on the start screen ----------------------------------------------------------

test('Join on the start screen joins the world whose four-digit code is typed', async (t) => {
  const dom = setupMockDom(t);
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  await host.manager.hostWorld();
  const code = host.session.roomId;
  assert.match(code, /^[0-9]{4}$/);
  assert.equal(dom.get('host-room-id-badge').textContent, code, 'the host is shown the code to read out');

  const guest = managerOn(network, { name: 'Gus' });
  guest.manager.openJoinCode();
  assert.equal(dom.get('join-code-modal').classList.contains('hidden'), false, 'Join asks for the code');
  dom.get('join-code-input').value = '12';
  assert.equal(guest.manager.joinTypedCode(), null, 'two digits are not a code');
  assert.equal(dom.get('join-code-error').classList.contains('hidden'), false);
  assert.match(dom.get('join-code-error').textContent, /four digits/);

  dom.get('join-code-input').value = code;
  await guest.manager.joinTypedCode();
  assert.equal(guest.manager.isJoined, true, 'joined with nothing but the code');
  assert.equal(dom.get('join-code-modal').classList.contains('hidden'), true);
  host.manager.leave(); guest.manager.leave();
});

test('the start screen offers Join, not sharing: a world is shared from inside it', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const start = html.slice(html.indexOf('id="start-overlay"'), html.indexOf('<!-- Share This World'));
  assert.match(start, /id="btn-start-join"[^>]*>🌐 Join</);
  assert.doesNotMatch(start, /btn-start-host-world|Host World/);
  assert.match(html, /id="btn-host-world"/, 'Share This World is in the pause menu');
});

// --- PvP -------------------------------------------------------------------------------

function fakeStorage(t, initial = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const store = new Map(Object.entries(initial));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k),
  } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  return store;
}

test('the host\'s PvP switch starts from the last choice, goes with the world, and is sent to everyone when changed', async (t) => {
  const dom = setupMockDom(t);
  const store = fakeStorage(t, { 'mc-share-pvp': 'off' });
  const network = createFakeNetwork();
  const host = managerOn(network, { name: 'Hana' });
  assert.equal(dom.get('host-pvp-toggle').checked, false, 'remembered as off');
  // Both managers share this one mock page, so keep the host's handler before the guest's manager replaces it.
  const hostToggleChanged = dom.get('host-pvp-toggle').onchange;
  await host.manager.hostWorld();
  assert.equal(host.session.settings.pvp, false, 'the world is shared with PvP off');

  const guest = managerOn(network, { name: 'Gus' });
  await guest.manager.joinWorld(host.session.roomId);
  assert.equal(guest.session.settings.pvp, false, 'the guest is told on joining');

  const told = new Promise((resolve) => guest.session.on('settings', resolve));
  dom.get('host-pvp-toggle').checked = true;
  hostToggleChanged();
  assert.equal((await told).pvp, true);
  assert.equal(store.get('mc-share-pvp'), 'on', 'remembered for next time');
  assert.ok(guest.game.chatLog.some((line) => /PvP is on/.test(line)), 'the guest is told in chat');
  host.manager.leave(); guest.manager.leave();
});

test('a hit from another player is taken like a melee hit, from where they stood, and a kill is announced', (t) => {
  setupMockDom(t);
  const { manager, game } = managerOn(createFakeNetwork());
  const taken = [];
  game.player.health = 20;
  game.player.takeDamage = (amount, source, type, attacker) => { taken.push({ amount, source, type, attacker }); game.player.health -= amount; };
  manager.takeHit({ attackerName: 'Ann', damage: 7, from: { x: 1, y: 2, z: 3 } });
  assert.deepEqual(taken[0], { amount: 7, source: { x: 1, y: 2, z: 3 }, type: 'player', attacker: null },
    'through takeDamage, so armour, shields, Creative and the knockback apply');
  manager.takeHit({ attackerName: 'Ann', damage: 20, from: { x: 1, y: 2, z: 3 } });
  assert.ok(game.chatLog.some((line) => /was slain by Ann/.test(line)), 'Minecraft\'s death message');
});

test('a swing at a player with PvP off says so once, not on every swing', (t) => {
  setupMockDom(t);
  const { manager, game, session } = managerOn(createFakeNetwork());
  session.attackPlayer = () => 'pvp_off';
  assert.equal(manager.attackRemotePlayer('p1', 5), false);
  assert.equal(manager.attackRemotePlayer('p1', 5), false);
  assert.equal(game.chatLog.filter((line) => /PvP is off/.test(line)).length, 1);
});

test('the crosshair finds another player\'s avatar, nearest first, within reach', (t) => {
  setupMockDom(t);
  const { manager } = managerOn(createFakeNetwork());
  manager.client.connected = true;
  const near = manager.remotePlayers.addPeer('p1', 'Ann');
  const far = manager.remotePlayers.addPeer('p2', 'Ben');
  near.currentPos.set(3, 0, 0);
  far.currentPos.set(6, 0, 0);
  const eye = new THREE.Vector3(0, 1.6, 0);
  assert.equal(manager.pickRemotePlayer(eye, new THREE.Vector3(1, 0, 0), 5)?.peerId, 'p1');
  assert.ok(Math.abs(manager.pickRemotePlayer(eye, new THREE.Vector3(1, 0, 0), 5).distance - 2.7) < 1e-9, 'to the front of the box');
  assert.equal(manager.pickRemotePlayer(eye, new THREE.Vector3(1, 0, 0), 2), null, 'out of reach');
  assert.equal(manager.pickRemotePlayer(eye, new THREE.Vector3(0, 0, 1), 5), null, 'looking away');
  assert.equal(manager.pickRemotePlayer(eye, new THREE.Vector3(1, 0.5, 0).normalize(), 5), null, 'over its head');
  manager.client.connected = false;
  assert.equal(manager.pickRemotePlayer(eye, new THREE.Vector3(1, 0, 0), 5), null, 'nobody to hit when not sharing');
});
