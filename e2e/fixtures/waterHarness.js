// Browser-side helpers for the water suite.
//
// Runs inside `page.evaluate`, on the survival fixture's disposable flat world. The fixture owns the clock: every
// step runs the real `Player.update`, raycast, mining and entity updates at a fixed 1/30 s, so a test can count
// seconds exactly. Water here is placed directly and the fluid simulation is not ticked, so the pool and the
// channel keep the shape the test built.
import { createSurvivalFixture } from './survivalFixture.js';
import { BLOCKS } from '../../src/blocks.js';

/** The pool: x 10..22, y 1..4, z 0..4, four blocks deep over the grass floor. */
export const POOL = { x0: 10, x1: 22, y0: 1, y1: 4, z0: 0, z1: 4 };
/** A one-block-deep channel at z = 8 flowing towards +x: a source at x = 10, then levels 1..7. */
export const CHANNEL = { x0: 10, z: 8, y: 1 };

export async function createWaterHarness(game) {
  const fixture = createSurvivalFixture(game);
  const { step } = fixture;
  const world = game.world;
  const p = game.player;

  function buildPool() {
    for (let x = POOL.x0; x <= POOL.x1; x++) for (let z = POOL.z0; z <= POOL.z1; z++) {
      for (let y = POOL.y0; y <= POOL.y1; y++) world.setVoxel(x, y, z, BLOCKS.WATER, 0);
    }
    // The channel, levels rising away from the source so the current runs towards +x.
    for (let i = 0; i < 8; i++) world.setVoxel(CHANNEL.x0 + i, CHANNEL.y, CHANNEL.z, BLOCKS.WATER, i);
  }

  function reset({ gameMode = 'survival' } = {}) {
    game.applyWorldSettings({ gameMode, difficulty: 'normal', cheats: true });
    p.health = 20; p.hunger = 20; p.saturation = 5; p.exhaustion = 0;
    p.statusEffects?.clear?.();
    p.isFlying = false; p.isSwimming = false; p.height = 1.8; p.eyeHeight = 1.62;
    p.velocity.set(0, 0, 0); p.fallDistance = 0;
    p.keys = {}; p.botControls = null;
    p.breath = 15; p.drownTimer = 0;
    game.isMouseDown = false; game.miningTime = 0;
    game.inventory.clearAll();
    world.isNether = false;
    buildPool();
  }

  function place(x, y, z, { yaw = 0, pitch = 0 } = {}) {
    p.position.set(x, y, z);
    p.velocity.set(0, 0, 0);
    p.yaw = yaw; p.pitch = pitch;
    p.fallDistance = 0;
    p.onGround = false;
  }

  async function seconds(s) {
    for (let i = 0; i < Math.round(s * 30); i++) { step(1 / 30); await Promise.resolve(); }
  }

  /** Step until `done()` or the budget runs out; returns the seconds taken, or null on a timeout. */
  async function until(done, maxSeconds = 20) {
    for (let i = 0; i < maxSeconds * 30; i++) {
      if (done()) return i / 30;
      step(1 / 30);
      await Promise.resolve();
    }
    return done() ? maxSeconds : null;
  }

  /** Hold keys through the bot's own control channel, the same one PlayerBot drives. */
  function hold(keys) { p.botControls = keys ? { ...keys } : null; }

  /** Mesh every chunk, so a render shows what the world now holds. */
  function meshAll() {
    for (const chunk of world.chunks.values()) game.rebuildChunkMesh(chunk);
  }

  return { fixture, game, world, player: p, reset, place, seconds, until, hold, meshAll, step, POOL, CHANNEL, BLOCKS };
}
