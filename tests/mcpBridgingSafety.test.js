import test from 'node:test';
import assert from 'node:assert/strict';
import { GuestPeerSession } from '../packages/blockyland-mcp/guestPeer.js';
import { BLOCKS } from '../src/blocks.js';

function createMockGuestSession(options = {}) {
  const session = new GuestPeerSession({
    code: '1234',
    name: 'SafetyBot',
    autopilot: false,
    ...options,
  });
  // Simulate connected state
  session.connected = true;
  session.ws = { readyState: 1, send: () => {} };
  return session;
}

test('placeBlockAt: does not fabricate blocks when inventory is empty in survival mode', () => {
  const session = createMockGuestSession();
  session.gamemode = 'survival';
  session.gameMode = 'bedwars';

  // Ensure inventory has 0 placeable blocks
  assert.equal(session.inventory.countPlaceableBlocks(), 0);

  // Attempt to place a block at (5, 30, 5)
  const result = session.placeBlockAt(5, 30, 5);
  assert.equal(result.ok, false);
  assert.match(result.reason, /No placeable blocks/);

  // Verify the block was NOT set in the local voxel map
  assert.equal(session.getVoxel(5, 30, 5), BLOCKS.AIR);
  assert.equal(session.isSolid(5, 30, 5), false);
});

test('placeBlockAt: successfully places block and decrements inventory when player holds blocks', () => {
  const session = createMockGuestSession();
  session.gamemode = 'survival';
  session.gameMode = 'bedwars';

  // Add 2 wool blocks to inventory
  session.inventory.addItem(BLOCKS.BLUE_WOOL, true, 2);
  assert.equal(session.inventory.countPlaceableBlocks(), 2);

  // Place first block
  const res1 = session.placeBlockAt(5, 30, 5, BLOCKS.BLUE_WOOL);
  assert.equal(res1.ok, true);
  assert.equal(res1.blockId, BLOCKS.BLUE_WOOL);
  assert.equal(session.getVoxel(5, 30, 5), BLOCKS.BLUE_WOOL);
  assert.equal(session.inventory.countPlaceableBlocks(), 1);

  // Place second block
  const res2 = session.placeBlockAt(6, 30, 5, BLOCKS.BLUE_WOOL);
  assert.equal(res2.ok, true);
  assert.equal(session.inventory.countPlaceableBlocks(), 0);

  // Third placement must fail because inventory is exhausted
  const res3 = session.placeBlockAt(7, 30, 5, BLOCKS.BLUE_WOOL);
  assert.equal(res3.ok, false);
  assert.equal(session.getVoxel(7, 30, 5), BLOCKS.AIR);
});

test('moveStepToward with bridge: stops at edge and does not walk into air when 0 blocks in inventory', async () => {
  const session = createMockGuestSession();
  session.gamemode = 'survival';
  session.gameMode = 'bedwars';

  // Build a 3x3 platform at y=30 (x: 0..2, z: 0..2)
  for (let x = 0; x <= 2; x++) {
    for (let z = 0; z <= 2; z++) {
      session.setVoxel(x, 30, z, BLOCKS.STONE);
    }
  }

  // Position bot near edge of platform at x=2.5, y=31, z=1.5
  session.position.x = 2.5;
  session.position.y = 31;
  session.position.z = 1.5;

  // Zero blocks in inventory
  assert.equal(session.inventory.countPlaceableBlocks(), 0);

  // Try to bridge into void toward x=10, y=31, z=1.5
  const moveRes = await session.moveStepToward(10, 31, 1.5, {
    bridge: true,
    avoidVoid: true,
    durationMs: 500,
    stepDelayMs: 15,
  });

  // Bot must stop at edge (x <= 2.8) and NOT advance into void (x > 3.0)
  assert.ok(session.position.x <= 2.8, `bot should halt at edge, got x=${session.position.x}`);
  assert.equal(moveRes.bridgedBlocks, 0);

  // No phantom blocks created in the void
  assert.equal(session.getVoxel(3, 30, 1), BLOCKS.AIR);
  assert.equal(session.getVoxel(4, 30, 1), BLOCKS.AIR);
});

test('moveStepToward with bridge: prevents air gap when starting over an empty overhang block', async () => {
  const session = createMockGuestSession();
  session.gamemode = 'survival';
  session.gameMode = 'bedwars';

  // Platform at x=10, z=5, y=30
  session.setVoxel(10, 30, 5, BLOCKS.BLUE_WOOL);

  // Bot is overhanging the edge at x=9.95, y=31, z=5.5 (currBx=9 is air)
  session.position.x = 9.95;
  session.position.y = 31;
  session.position.z = 5.5;

  // Provide 4 wool blocks
  session.inventory.addItem(BLOCKS.BLUE_WOOL, true, 4);

  // Bridge forward towards x=6, y=31, z=5.5
  const res = await session.moveStepToward(6.5, 31, 5.5, {
    bridge: true,
    avoidVoid: true,
    durationMs: 1000,
    stepDelayMs: 15,
  });

  // Verify that the overhang block at x=9 was filled first (no air gap between x=10 and x=8)
  assert.equal(session.getVoxel(9, 30, 5), BLOCKS.BLUE_WOOL, 'block under initial footing must be placed to prevent air gap');
  assert.equal(session.getVoxel(8, 30, 5), BLOCKS.BLUE_WOOL);
  assert.ok(res.bridgedBlocks >= 2);
});

test('moveStepToward with bridge: stops exactly when inventory runs out of blocks and never walks into air', async () => {
  const session = createMockGuestSession();
  session.gamemode = 'survival';
  session.gameMode = 'bedwars';

  // Platform at x=0, z=0, y=30
  session.setVoxel(0, 30, 0, BLOCKS.STONE);
  session.position.x = 0.5;
  session.position.y = 31;
  session.position.z = 0.5;

  // Give exactly 2 blocks of wool
  session.inventory.addItem(BLOCKS.BLUE_WOOL, true, 2);

  // Attempt to bridge 10 blocks out to (10.5, 31, 0.5)
  const res = await session.moveStepToward(10.5, 31, 0.5, {
    bridge: true,
    avoidVoid: true,
    durationMs: 2000,
    stepDelayMs: 15,
  });

  // Exactly 2 blocks should have been bridged
  assert.equal(res.bridgedBlocks, 2);
  assert.equal(session.getVoxel(1, 30, 0), BLOCKS.BLUE_WOOL);
  assert.equal(session.getVoxel(2, 30, 0), BLOCKS.BLUE_WOOL);
  assert.equal(session.getVoxel(3, 30, 0), BLOCKS.AIR, 'block 3 must be air because inventory ran out');

  // Agent must halt on block 2 and not walk onto block 3 or into the air
  assert.ok(session.position.x <= 2.8, `agent should stop on the last solid block, got x=${session.position.x}`);
  assert.equal(session.inventory.countPlaceableBlocks(), 0);
});
