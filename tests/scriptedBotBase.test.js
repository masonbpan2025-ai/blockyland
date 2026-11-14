// The scripted bot's base layer (agentArena/scriptedBot/base.mjs; it began as the house bots' autopilot) and the guest code it shares with the MCP autopilot
// (packages/blockyland-mcp/guestPeer.js): judgements of ground, bridging, reach, the bow, getting off a tower, who is
// an enemy, and a fight action that never starves the session's link. Worlds are hand-built in the session's own block
// store (setVoxel), so the real walk and bridging code runs on them: a 7x7 island at y 30 with a one-block bridge
// along +x, unless a test builds its own. Nothing connects: packets sent are caught.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ScriptedBotBase } from '../agentArena/scriptedBot/base.mjs';
import { GuestPeerSession, BLOCKS } from '../packages/blockyland-mcp/guestPeer.js';

function session(blocks, Kind = ScriptedBotBase) {
  const s = new Kind({ code: '1234', name: 'House', url: 'ws://localhost:1/ws/share' });
  for (const k of blocks) { const [x, y, z] = k.split(',').map(Number); s.setVoxel(x, y, z, BLOCKS.STONE); }
  s.sent = [];
  s.sendPacket = (m) => { s.sent.push(m); return true; };
  s.broadcastState = () => true;
  s.connected = true;
  s.gameMode = 'skywars';
  s.gamemode = 'survival';
  return s;
}
function islandWithBridge() {
  const b = new Set();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) b.add(`${x},30,${z}`);
  for (let x = 4; x <= 12; x++) b.add(`${x},30,0`); // the bridge, 9 blocks
  return b;
}

test('wide ground is the island, not the bridge or its edge', () => {
  const s = session(islandWithBridge());
  assert.equal(s.wideAt(0.5, 31, 0.5), true);
  assert.equal(s.wideAt(8.5, 31, 0.5), false, 'a one-block bridge');
  assert.equal(s.wideAt(3.5, 31, 3.5), false, 'a corner of the island: 4 of 9 blocks under and round it');
});

test('the void behind me on the line from a foe: on the bridge with them beside it yes, mid-island no', () => {
  const s = session(islandWithBridge());
  s.position = { x: 8.5, y: 31, z: 0.5 };
  assert.equal(s.voidBehind(8.5, 3.5), true, 'a hit from the side sends me off the bridge');
  assert.equal(s.voidBehind(12.5, 0.5), false, 'a hit along the bridge keeps me on it');
  s.position = { x: 0.5, y: 31, z: 0.5 };
  assert.equal(s.voidBehind(0.5, 4.5), false);
});

test('a safer spot has ground under it and two blocks of ground behind it on the line from the foe', () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 2.5 }; // at the +z edge, the foe north of me (-z): a hit sends me off the edge
  assert.equal(s.voidBehind(0.5, -3.5), true);
  const spot = s.saferSpot(0.5, -3.5, 3);
  assert.ok(spot, 'there is ground to step to');
  const dz = spot.z - -3.5, dx = spot.x - 0.5, len = Math.hypot(dx, dz);
  for (const k of [1, 2]) assert.ok(s.groundAt(spot.x + (dx / len) * k, 31, spot.z + (dz / len) * k), `ground ${k} behind the spot`);
});

test('the blocks a rush needs: the void cells on the straight way at my level', () => {
  const b = islandWithBridge();
  for (let x = 20; x <= 26; x++) for (let z = -3; z <= 3; z++) b.add(`${x},30,${z}`); // the far island
  const s = session(b);
  s.position = { x: 0.5, y: 31, z: 0.5 };
  // Along z = 0: island to x 3, bridge 4-12, void 13-19 (7 cells), far island from 20.
  assert.equal(s.voidCellsToward(23.5, 0.5), 7);
});

test('a fight action that cannot move still yields: other timers run while it lasts', async () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 0.5 }; // the normal profile: a 450 ms action in 50 ms steps
  s.moveStepToward = async () => ({ ok: true }); // returns at once, as when already close enough
  const foe = { id: 'p2', name: 'Foe', x: 0.5, y: 31, z: 20.5 }; // 20 blocks off: no hit, no hold, only the walk toward them
  s.peers.set('p2', foe);
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 20);
  const started = Date.now();
  await s.engageTactics(foe);
  clearInterval(timer);
  const ms = Date.now() - started;
  assert.ok(ms >= s.profile.brainMoveDurationMs - 60, `the action lasts its time (${ms} ms)`);
  assert.ok(ticks >= Math.floor(ms / 20) / 2, `a 20 ms timer ran ${ticks} times in ${ms} ms: the loop yields`);
});

test('melee reach is Minecraft\'s: 3 blocks from the eyes to the nearest point of the body, at every difficulty', async () => {
  const { meleeReachDistance, AUTOPILOT_MELEE_REACH } = await import('../packages/blockyland-mcp/guestPeer.js');
  assert.equal(AUTOPILOT_MELEE_REACH, 3);
  const at = (x, y, z) => ({ x, y, z });
  // Level ground: the eyes are within the other's body height, so the distance is across to its side (half-width 0.3).
  assert.ok(Math.abs(meleeReachDistance(at(0, 31, 0), at(3.3, 31, 0)) - 3.0) < 1e-9, '3.3 apart: just in reach');
  assert.ok(meleeReachDistance(at(0, 31, 0), at(3.4, 31, 0)) > AUTOPILOT_MELEE_REACH, '3.4 apart: out of reach');
  assert.ok(meleeReachDistance(at(0, 31, 0), at(5, 31, 0)) > AUTOPILOT_MELEE_REACH, 'the old 5.8 reach no longer');
  // 3 below and 2 across: eyes at 32.62, the top of its body at 29.8 (2.82 down), 1.7 across to its side: 3.29.
  assert.ok(Math.abs(meleeReachDistance(at(0, 31, 0), at(2, 28, 0)) - Math.hypot(2.82, 1.7)) < 1e-9);
  // Standing on its head (feet at the top of its body, 32.8): the eyes are 1.62 straight above it.
  assert.ok(Math.abs(meleeReachDistance(at(0, 32.8, 0), at(0, 31, 0)) - 1.62) < 1e-9);
});

test('bridging toward a target far off and higher stays flat; the original guest code builds stairs up', async () => {
  const island = new Set();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) island.add(`${x},30,${z}`);
  const run = async (Kind) => {
    const s = session(island, Kind);
    s.inventory.addItem(BLOCKS.OAK_PLANKS, true, 64);
    s.position = { x: 3.5, y: 31, z: 0.5 };
    // 20 blocks off over the void, 4 higher (a foe on a higher island, or one knocked up in the air).
    await s.moveStepToward(23.5, 35, 0.5, { bridge: true, avoidVoid: true, stopWithin: 1, durationMs: 1500, stepDelayMs: 15 });
    return [...s.voxels.entries()].filter(([k, id]) => id === BLOCKS.OAK_PLANKS).map(([k]) => k.split(',').map(Number));
  };
  const house = await run(ScriptedBotBase);
  assert.ok(house.length >= 3, `the house bot bridged (${house.length} blocks)`);
  assert.deepEqual([...new Set(house.map((b) => b[1]))], [30], 'every bridge block at its own floor, y 30');
  const original = await run(GuestPeerSession);
  assert.ok(original.some((b) => b[1] > 30), `the original climbs toward the higher target: ${JSON.stringify(original.map((b) => b[1]))}`);
});

test('near the target, a stair only toward ground that is there, not toward a foe in the air', async () => {
  const island = new Set();
  for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) island.add(`${x},30,${z}`);
  const s = session(island);
  s.inventory.addItem(BLOCKS.OAK_PLANKS, true, 64);
  s.position = { x: 3.5, y: 31, z: 0.5 };
  // 4 blocks off and 2 up, with nothing under that point: a foe knocked into the air.
  await s.moveStepToward(7.5, 33, 0.5, { bridge: true, avoidVoid: true, stopWithin: 1, durationMs: 800, stepDelayMs: 15 });
  const ys = [...s.voxels.entries()].filter(([, id]) => id === BLOCKS.OAK_PLANKS).map(([k]) => Number(k.split(',')[1]));
  assert.ok(ys.length >= 1 && ys.every((y) => y === 30), `flat toward a foe in the air: ${JSON.stringify(ys)}`);
});

test('the fight swings only with the foe within 3 blocks of the eyes: 3.3 apart on level ground yes, 3.6 no', async () => {
  for (const [gap, expect] of [[3.3, true], [3.6, false]]) {
    const s = session(islandWithBridge());
    s.position = { x: 0, y: 31, z: 0 };
    s.moveStepToward = async () => ({ ok: true }); // stand still: only the swing is tested
    const foe = { id: 'p2', name: 'Foe', x: gap, y: 31, z: 0 };
    s.peers.set('p2', foe);
    s.skywarsState = { phase: 'playing', players: [{ id: 'p2', name: 'Foe', alive: true }] };
    await s.engageTactics(foe);
    assert.equal(s.sent.some((m) => m.t === 'attack' && m.target === 'p2'), expect, `${gap} apart`);
  }
});

test('the bow: drawn at a foe 12 blocks off, loosed after a full second, then not again within the projectile cooldown', async () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.inventory.addItem('bow', false, 1);
  s.inventory.addItem('arrow', false, 5);
  // The bow is in the backpack, not the hotbar: holdItem brings it to hand.
  const at = s.inventory.hotbar.findIndex((x) => x && x.id === 'bow');
  if (at >= 0) { s.inventory.storage[0] = s.inventory.hotbar[at]; s.inventory.hotbar[at] = null; }
  const foe = { id: 'p2', name: 'Foe', x: 12.5, y: 31, z: 0.5 };
  s.yaw = -Math.PI / 2; // already facing them (+x): turning is tested on its own
  assert.equal(s.bowAction(foe, 12), true, 'starts drawing');
  assert.equal(s.inventory.getActiveItem()?.id, 'bow');
  assert.equal(s.sent.filter((m) => m.t === 'shot').length, 0, 'nothing leaves while drawing');
  s.bowDrawAt = Date.now() - 1100; // a full draw later
  s.bot._drawStart = Date.now() - 1100;
  assert.equal(s.bowAction(foe, 12), true, 'looses');
  const shot = s.sent.find((m) => m.t === 'shot');
  assert.equal(shot?.shot?.kind, 'arrow');
  assert.equal(s.inventory.countItem('arrow'), 4, 'one arrow used');
  assert.ok(Math.abs(shot.shot.vx) > 50, 'toward +x at full draw (3 blocks a tick, 60 a second)');
  assert.equal(s.bowAction(foe, 12), false, 'not again within the cooldown');
});

test('off a tower: from a 1-block pillar, the way down to ground 3 below', async () => {
  const b = new Set();
  for (let y = 30; y <= 35; y++) b.add(`0,${y},0`); // the pillar, top at 35: standing at 36
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) if (Math.abs(x) >= 2 || Math.abs(z) >= 2) b.add(`${x},32,${z}`); // ground round it, standing at 33
  const s = session(b);
  s.position = { x: 0.5, y: 36, z: 0.5 };
  assert.equal(await s.unstick(), true);
  assert.ok(Math.hypot(s.position.x - 0.5, s.position.z - 0.5) > 0.5, `left the pillar: ${JSON.stringify(s.position)}`);
});

test('enemies are the round\'s living players: not a spectator, not someone outside the match, not the dead', () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.clientId = 'me';
  s.skywarsState = { phase: 'playing', players: [{ id: 'me', alive: true }, { id: 'p2', name: 'Foe', alive: true }, { id: 'p4', name: 'Out', alive: false }] };
  s.peers.set('p2', { id: 'p2', name: 'Foe', x: 5, y: 31, z: 0 });
  s.peers.set('ref', { id: 'ref', name: 'Referee', x: 0, y: 86, z: 0 }); // the host's spectating camera, not in the round
  s.peers.set('p3', { id: 'p3', name: 'Watcher', x: 1, y: 31, z: 0, gamemode: 'spectator' });
  s.peers.set('p4', { id: 'p4', name: 'Out', x: 2, y: 31, z: 0 });
  assert.deepEqual(s.findAliveEnemies().map((p) => p.id), ['p2']);
});

test('the bot API\'s hit: no sprint knock-back where the difficulty allows no sprint; the autopilot\'s reach under its rules', async () => {
  const { playRules } = await import('../agentArena/botRunner.mjs');
  for (const [rules, sprint] of [[{ standard: 'autopilot', difficulty: 'easy' }, false], [{ standard: 'autopilot', difficulty: 'normal' }, true], [{ standard: 'arena' }, true]]) {
    const s = session(islandWithBridge(), GuestPeerSession);
    Object.defineProperty(s, 'profile', { value: playRules(rules).profile, configurable: true });
    s.position = { x: 0, y: 31, z: 0 };
    s.peers.set('p2', { id: 'p2', name: 'Foe', x: 2, y: 31, z: 0 });
    s.bot.setControlState('sprint', true);
    await s.bot.attack({ id: 'p2' });
    assert.equal(s.sent.find((m) => m.t === 'attack')?.isSprint ?? false, sprint, rules.standard);
  }
  const s = session(islandWithBridge(), GuestPeerSession);
  Object.defineProperty(s, 'profile', { value: playRules({ standard: 'autopilot', difficulty: 'normal' }).profile, configurable: true });
  s.position = { x: 0, y: 31, z: 0 };
  s.peers.set('p2', { id: 'p2', name: 'Foe', x: 3.6, y: 31, z: 0 });
  await assert.rejects(() => s.bot.attack({ id: 'p2' }), /reach is 3/);
});

test('a foe standing on a ledge 4 above, 1 across: the house bot pillars up toward them, a block a step', async () => {
  const b = islandWithBridge();
  for (let y = 31; y <= 33; y++) b.add(`1,${y},0`); // a 3-high column beside me: its top at 33, standing at 34
  const s = session(b);
  s.inventory.addItem(BLOCKS.OAK_PLANKS, true, 16);
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.moveStepToward = async () => ({ ok: true });
  const foe = { id: 'p2', name: 'Foe', x: 1.5, y: 34, z: 0.5 };
  s.peers.set('p2', foe);
  s.skywarsState = { phase: 'playing', players: [{ id: 'p2', name: 'Foe', alive: true }] };
  await s.engageTactics(foe);
  assert.ok(s.position.y >= 32, `climbed: y ${s.position.y}`);
  assert.equal(s.isSolid(0, 31, 0), true, 'a block placed in the cell I stood in');
  // Not toward a foe in the air: the same height with nothing under them.
  const s2 = session(islandWithBridge());
  s2.inventory.addItem(BLOCKS.OAK_PLANKS, true, 16);
  s2.position = { x: 0.5, y: 31, z: 0.5 };
  s2.moveStepToward = async () => ({ ok: true });
  const flying = { id: 'p2', name: 'Foe', x: 1.5, y: 34, z: 0.5 };
  s2.peers.set('p2', flying);
  await s2.engageTactics(flying);
  assert.equal(s2.position.y, 31, 'no pillar toward a foe in the air');
});

test('an arrow at full draw hurts as Java\'s at every difficulty: 6, plus up to 4 more as a critical arrow (6-10)', async () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const seen = new Set();
    for (let shot = 0; shot < 12; shot++) {
      const s = session(islandWithBridge());
      s.setDifficulty(difficulty);
      s.position = { x: 0.5, y: 31, z: 0.5 };
      s.peers.set('p2', { id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -6.5 });
      s.inventory.addItem('bow', false, 1);
      s.inventory.addItem('arrow', false, 2);
      s.holdItem('bow');
      s.yaw = 0; s.pitch = 0; // straight at them, 7 blocks off: a hit within 3 ticks
      void s.bot.activateItem();
      s.bot._drawStart = Date.now() - 1100;
      s.bot.deactivateItem();
      for (let i = 0; i < 40 && !s.sent.some((m) => m.t === 'attack'); i++) await new Promise((r) => setTimeout(r, 25));
      const hit = s.sent.find((m) => m.t === 'attack');
      assert.ok(hit, `${difficulty}: the arrow hit`);
      assert.ok(Number.isInteger(hit.damage) && hit.damage >= 6 && hit.damage <= 10, `${difficulty}: ${hit.damage}`);
      seen.add(hit.damage);
    }
    assert.ok(seen.size > 1, `${difficulty}: the critical bonus varies (${[...seen]})`);
  }
});

test('the swing by skill: easy at half charge (a 40% hit), normal at full charge with sprint knock-back, hard a critical (x1.5) or a sprint hit toward the void', () => {
  const swing = (difficulty, foe, sinceMs) => {
    const s = session(islandWithBridge());
    s.setDifficulty(difficulty);
    s.position = { x: 0.5, y: 31, z: 0.5 };
    s.inventory.hotbar[0] = { id: 'stone_sword', count: 1 }; s.inventory.activeSlot = 0; // 5 damage, 625 ms
    s.lastMeleeAt = Date.now() - sinceMs;
    const swung = s.meleeHit(foe);
    return { swung, hit: s.sent.find((m) => m.t === 'attack') };
  };
  const onIsland = { id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -0.5 }; // ground behind them (to the island's edge at z -3)
  // Easy: at half charge (313 ms) it swings: 5 x (0.2 + 0.8 x 0.25) = 2.
  const easy = swing('easy', onIsland, 313);
  assert.equal(easy.swung, true);
  assert.ok(Math.abs(easy.hit.damage - 2) < 0.02, `easy at half charge: ${easy.hit.damage}`);
  assert.equal(easy.hit.isSprint, false);
  // Normal waits for full charge; then 5, a sprint hit.
  assert.equal(swing('normal', onIsland, 313).swung, false, 'normal: not at half charge');
  const normal = swing('normal', onIsland, 700);
  assert.equal(normal.hit.damage, 5);
  assert.equal(normal.hit.isSprint, true);
  assert.equal(normal.hit.isCritical, false);
  // Hard: a critical on a foe with ground behind them; a sprint hit on one with the void behind them (the bridge's side).
  const hard = swing('hard', onIsland, 700);
  assert.equal(hard.hit.isCritical, true);
  assert.equal(hard.hit.damage, 7.5);
  const onBridge = { id: 'p2', name: 'Foe', x: 8.5, y: 31, z: 0.5 };
  const s = session(islandWithBridge());
  s.setDifficulty('hard');
  s.position = { x: 8.5, y: 31, z: 2.5 }; // beside the bridge: my hit sends them off its far side
  s.inventory.hotbar[0] = { id: 'stone_sword', count: 1 }; s.inventory.activeSlot = 0;
  s.lastMeleeAt = Date.now() - 700;
  s.meleeHit(onBridge);
  const kb = s.sent.find((m) => m.t === 'attack');
  assert.equal(kb.isSprint, true);
  assert.equal(kb.isCritical, false);
  assert.equal(kb.damage, 5);
});

test('easy: no bow, no snowballs, no pillaring', async () => {
  const s = session(islandWithBridge());
  s.setDifficulty('easy');
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.inventory.addItem('bow', false, 1);
  s.inventory.addItem('arrow', false, 5);
  s.inventory.addItem('snowball', false, 5);
  s.moveStepToward = async () => ({ ok: true });
  const far = { id: 'p2', name: 'Foe', x: 10.5, y: 31, z: 0.5 }; // on the bridge, 10 off
  s.peers.set('p2', far);
  await s.engageTactics(far);
  assert.equal(s.sent.filter((m) => m.t === 'shot').length, 0, 'nothing thrown or shot');
  assert.equal(s.bowDrawAt ?? null, null, 'no bow drawn');
  const b = islandWithBridge();
  for (let y = 31; y <= 33; y++) b.add(`1,${y},0`);
  const p = session(b);
  p.setDifficulty('easy');
  p.inventory.addItem(BLOCKS.OAK_PLANKS, true, 16);
  p.position = { x: 0.5, y: 31, z: 0.5 };
  p.moveStepToward = async () => ({ ok: true });
  const above = { id: 'p2', name: 'Foe', x: 1.5, y: 34, z: 0.5 };
  p.peers.set('p2', above);
  await p.engageTactics(above);
  assert.equal(p.position.y, 31, 'no pillar');
});

test('a human\'s pace by skill: reaction time, turning speed, bridging and looting pace', async () => {
  const { BOT_SKILLS } = await import('../agentArena/scriptedBot/base.mjs');
  // Reaction: a player seen for less than the reaction time is not yet noticed; after it, seen where they were then.
  const s = session(islandWithBridge());
  s.setDifficulty('easy');
  s.clientId = 'me';
  s.skywarsState = { phase: 'playing', players: [{ id: 'me', alive: true }, { id: 'p2', name: 'Foe', alive: true }] };
  const foe = { id: 'p2', name: 'Foe', x: 5, y: 31, z: 0 };
  s.peers.set('p2', foe);
  s.notePerception();
  assert.deepEqual(s.findAliveEnemies(), [], 'just appeared: not noticed yet');
  s.percept.get('p2').first -= 800; s.percept.get('p2').hist[0].t -= 800; // seen 0.8 s ago, at x 5
  foe.x = 9; s.notePerception();                                          // now at x 9
  assert.equal(s.findAliveEnemies()[0]?.x, 5, 'acted on where they were 0.7 s ago');
  // Turning: easy 180 deg/s (9 deg a 50 ms step), hard 720 (36). Facing counts within 20 deg, so a half turn is 160 deg
  // of turning: easy faces on its 18th step (17 before it), hard on its 5th (4 before).
  for (const [difficulty, steps] of [['easy', 17], ['hard', 4]]) {
    const t = session(islandWithBridge());
    t.setDifficulty(difficulty);
    t.position = { x: 0.5, y: 31, z: 0.5 };
    t.yaw = 0; // facing -z; the target is behind (+z)
    let n = 0;
    t.lastTurnAt = Date.now() - 50;
    while (!t.faceToward(0.5, 32, 10) && n < 100) { n++; t.lastTurnAt = Date.now() - 50; }
    assert.ok(Math.abs(n - steps) <= 1, `${difficulty}: ${n} steps of 50 ms before facing behind (${steps})`);
  }
  // Bridging and looting paces, slower the less skilled.
  const e = session(islandWithBridge()); e.setDifficulty('easy');
  e.bridgingNow = true;
  assert.ok(Math.abs(e.profile.walkSpeed * 0.8 - 1.3) < 1e-9, 'easy sneak-bridges at 1.3 blocks a second');
  assert.equal(e.profile.bridgePlaceDelayMs, 600);
  const h = session(islandWithBridge()); h.setDifficulty('hard'); h.bridgingNow = true;
  assert.equal(h.profile.walkSpeed, 4.317, 'hard bridges at walking pace');
  assert.equal(h.profile.bridgePlaceDelayMs, 200);
  assert.ok(BOT_SKILLS.easy.lootOpenMs > BOT_SKILLS.normal.lootOpenMs && BOT_SKILLS.normal.lootOpenMs > BOT_SKILLS.hard.lootOpenMs);
  // Looting waits: opening plus each item.
  const l = session(islandWithBridge()); l.setDifficulty('hard');
  l.lootChest = ScriptedBotBase.prototype.lootChest;
  const base = Object.getPrototypeOf(ScriptedBotBase.prototype), shared = base.lootChest;
  base.lootChest = async () => ({ ok: true, looted: [{ id: 'a' }, { id: 'b' }] }); // the shared looting: two items
  const t0 = Date.now();
  try { await l.lootChest({}); } finally { base.lootChest = shared; }
  const took = Date.now() - t0;
  assert.ok(took >= 500 + 2 * 80 - 10, `hard: open 0.5 s and 2 items at 0.08 s: ${took} ms`);
});

test('a swing goes where the foe was seen, and misses if they have moved out of reach since', () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.inventory.hotbar[0] = { id: 'stone_sword', count: 1 }; s.inventory.activeSlot = 0;
  s.lastMeleeAt = Date.now() - 700;
  s.peers.set('p2', { id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -6 }); // really 6.5 off now
  assert.equal(s.meleeHit({ id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -1.5 }), true, 'swung at where it saw them');
  assert.equal(s.sent.some((m) => m.t === 'attack'), false, 'no hit lands');
  assert.match(s.lastActionSummary, /missed/);
});

test('the fallback fight (the copied original) lands no hit on a foe really out of reach, whatever it saw', async () => {
  const s = session(islandWithBridge());
  s.position = { x: 0.5, y: 31, z: 0.5 };
  s.inventory.hotbar[0] = { id: 'stone_sword', count: 1 }; s.inventory.activeSlot = 0;
  s.lastMeleeAt = Date.now() - 700;
  s.moveStepToward = async () => ({ ok: true });
  s.peers.set('p2', { id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -5.5 }); // really 6 off
  await s.engageEnemyOriginal({ id: 'p2', name: 'Foe', x: 0.5, y: 31, z: -1.5 }); // seen 2 off
  assert.equal(s.sent.some((m) => m.t === 'attack'), false);
});

/** An island at y 30 (standing at 31) with a 1-block pillar in its middle, its top at 35 (standing at 36). */
function islandWithPillar() {
  const b = new Set();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) b.add(`${x},30,${z}`);
  for (let y = 31; y <= 35; y++) b.add(`0,${y},0`);
  return b;
}

test('climbing down: off a 5-high pillar toward a foe below, landing with Java\'s fall damage (5 blocks: 2)', async () => {
  const s = session(islandWithPillar());
  s.position = { x: 0.5, y: 36, z: 0.5 };
  assert.equal(await s.climbDown(4.5, 0.5), true);
  assert.ok(Math.hypot(s.position.x - 0.5, s.position.z - 0.5) > 0.5, 'stepped off the pillar');
  s.onGround = false;
  for (let i = 0; i < 200 && !(s.onGround && s.position.y <= 31.001); i++) s.tick(0.05);
  assert.ok(Math.abs(s.position.y - 31) < 0.01, `landed: ${s.position.y}`);
  assert.equal(s.health, 18);
});

test('climbing down refuses a fall that would leave it under 6 health, and the void', async () => {
  const s = session(islandWithPillar());
  s.position = { x: 0.5, y: 36, z: 0.5 };
  s.health = 7; // a 5-block fall hurts 2: 5 would be left, under 6
  assert.equal(await s.climbDown(4.5, 0.5), false);
  const v = new Set(); for (let y = 30; y <= 35; y++) v.add(`0,${y},0`); // a pillar over the void
  const t = session(v);
  t.position = { x: 0.5, y: 36, z: 0.5 };
  assert.equal(await t.climbDown(4.5, 0.5), false);
});

test('a foe below and out of reach: the fight climbs down to them, at every difficulty (easy too)', async () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const s = session(islandWithPillar());
    s.setDifficulty(difficulty);
    s.position = { x: 0.5, y: 36, z: 0.5 };
    s.moveStepToward = async () => ({ ok: true }); // the walk cannot take the drop
    let called = 0;
    s.climbDown = async () => { called++; s.position = { ...s.position, y: 31 }; return true; };
    const foe = { id: 'p2', name: 'Foe', x: 3.5, y: 31, z: 0.5 };
    s.peers.set('p2', foe);
    await s.engageTactics(foe);
    assert.ok(called >= 1, `${difficulty}: climbed down`);
  }
});
