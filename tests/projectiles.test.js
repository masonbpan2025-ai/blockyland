// Guest projectiles (packages/blockyland-mcp/projectiles.js): a bow's power and damage, and the flight of a shot against
// blocks and players. Expected values are worked by hand from the Minecraft Wiki's figures (Bow, Arrow, Snowball): an
// arrow leaves at 3 blocks/tick at full draw, loses 1% of its speed a tick and falls 0.05 blocks/tick^2; its damage is
// 2 x speed rounded up; the bow's power is (f^2 + 2f)/3 for f seconds drawn, capped at 1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bowPower, arrowDamage, facing, launch, flyShot, stepShot } from '../packages/blockyland-mcp/projectiles.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const noSpread = () => 0.5; // three draws of 0.5 sum to 1.5: no spread

test('a bow: a full draw takes a second, half a second gives 5/12 of the power, a tap fires nothing', () => {
  close(bowPower(1000), 1);
  close(bowPower(2500), 1);
  close(bowPower(500), (0.25 + 1) / 3);
  assert.equal(bowPower(50), 0);
});

test('an arrow at full speed deals 6; at half speed 3', () => {
  assert.equal(arrowDamage(3), 6);
  assert.equal(arrowDamage(1.5), 3);
});

test('facing: yaw 0 looks toward -Z, a quarter turn toward -X, pitch up looks up', () => {
  const a = facing(0, 0); close(a.x, 0); close(a.y, 0); close(a.z, -1);
  const b = facing(Math.PI / 2, 0); close(b.x, -1); close(b.z, 0, 1e-12);
  const c = facing(0, Math.PI / 2); close(c.y, 1);
});

test('an arrow fired level at a player 10 blocks away hits in the 4th tick, having dropped under a fifth of a block', async () => {
  // Ticks move it 3, 2.97, 2.9403, 2.9109: it reaches x = 8.91 after three ticks and passes 9.45 (the box's near side,
  // 10 - 0.3 - 0.25) in the fourth. Its height falls 0, 0.05, 0.0995 in those ticks: 0.1495 below the eye.
  const start = launch('arrow', { eye: { x: 0, y: 1.62, z: 0.5 }, yaw: -Math.PI / 2, pitch: 0, random: noSpread });
  close(start.vel.x, 3, 1e-9);
  const end = await flyShot('arrow', start, { isSolid: () => false, targetsAt: () => [{ id: 'p', x: 10, y: 0, z: 0.5 }] });
  assert.equal(end.hit?.id, 'p');
  assert.equal(end.ticks, 4);
  assert.ok(end.at.y > 1.62 - 0.1495 - 0.06 && end.at.y < 1.62, `height ${end.at.y}`);
});

test('a wall between stops the arrow at the wall, and the player behind it is not hit', async () => {
  const start = launch('arrow', { eye: { x: 0, y: 1.62, z: 0.5 }, yaw: -Math.PI / 2, pitch: 0, random: noSpread });
  const wall = (x) => x === 5;
  const end = await flyShot('arrow', start, { isSolid: (x) => wall(x), targetsAt: () => [{ id: 'p', x: 10, y: 0, z: 0.5 }] });
  assert.equal(end.hit, undefined);
  assert.deepEqual(end.block, { x: 5, y: 1, z: 0 });
  assert.ok(end.at.x < 5);
});

test('a player who walks out of the path while it flies is missed', async () => {
  const start = launch('arrow', { eye: { x: 0, y: 1.62, z: 0.5 }, yaw: -Math.PI / 2, pitch: 0, random: noSpread });
  // At 20 blocks it needs 7 ticks; the player steps 1 block aside after the 2nd.
  const end = await flyShot('arrow', start, { isSolid: () => false, maxTicks: 40, voidY: -64, targetsAt: (t) => [{ id: 'p', x: 20, y: 0, z: t <= 2 ? 0.5 : 1.5 }] });
  assert.equal(end.hit, undefined);
});

test('a snowball is slower and drops more: thrown level, it has fallen 0.03 + 0.0597 below the eye after three ticks', () => {
  const start = launch('snowball', { eye: { x: 0, y: 10, z: 0 }, yaw: 0, pitch: 0, random: noSpread });
  close(start.vel.z, -1.5);
  const s = { pos: { ...start.pos }, vel: { ...start.vel } };
  for (let i = 0; i < 3; i++) stepShot(s, 'snowball', { isSolid: () => false });
  close(s.pos.y, 10 - 0.03 - (0.03 * 0.99 + 0.03), 1e-9);
  close(s.pos.z, -(1.5 + 1.485 + 1.47015), 1e-9);
});
