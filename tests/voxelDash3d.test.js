// Voxel Dash's 3D view: the course laid along a fixed, winding path (track3d.js), the way Minecraft's Sonic DLC runs
// its player along a set route. The run itself is the same simulation; these hold the path to being one a run can
// follow: continuous, straight where the run starts, never turning so tight that the track folds over itself, and
// putting each course point at its own height and distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack, chaseCamera, clampCamera, DEFAULT_CAMERA, CAMERA_LIMITS, UNIT, TRACK_WIDTH, LEAD_IN, MIN_RADIUS } from '../src/mods/voxel-dash/client/track3d.js';
import { LEVELS } from '../src/mods/voxel-dash/levels.js';

test('every level gets a path as long as its course, straight through the start, then winding', () => {
  LEVELS.forEach((level, i) => {
    const track = buildTrack(level.length, i);
    assert.ok(track.length >= level.length / UNIT, `${level.name}: the path reaches the finish`);
    for (let s = -LEAD_IN; s <= 5; s += 1) assert.ok(Math.abs(track.at(s).heading) < 1e-3, `${level.name}: straight at ${s}`);
    const headings = []; for (let s = 0; s < track.length; s += 10) headings.push(track.at(s).heading);
    assert.ok(Math.max(...headings) - Math.min(...headings) > 0.3, `${level.name}: the path winds`);
  });
});

test('the path is continuous, a block of course is a block of path, and no bend is tighter than the track can take', () => {
  LEVELS.forEach((level, i) => {
    const track = buildTrack(level.length, i);
    let previous = track.at(-LEAD_IN), worst = 0;
    for (let s = -LEAD_IN + 0.25; s < track.length; s += 0.25) {
      const p = track.at(s), step = Math.hypot(p.x - previous.x, p.z - previous.z);
      assert.ok(Math.abs(step - 0.25) < 0.01, `${level.name}: a quarter block of course is a quarter block of path at ${s}`);
      worst = Math.max(worst, Math.abs(p.heading - previous.heading) / 0.25);
      previous = p;
    }
    assert.ok(worst <= 1 / MIN_RADIUS + 1e-6, `${level.name}: tightest bend radius ${(1 / worst).toFixed(1)} blocks`);
    assert.ok(MIN_RADIUS > TRACK_WIDTH * 4, 'the inside edge of a bend never folds over');
  });
});

test('a course point is placed at its own height, its distance along the path, and across the track to the right', () => {
  const track = buildTrack(LEVELS[3].length, 3);
  const centre = track.place(9000, 120), side = track.place(9000, 120, 1.5), path = track.at(9000 / UNIT);
  assert.equal(centre.y, 120 / UNIT);
  assert.ok(Math.abs(centre.x - path.x) < 1e-9 && Math.abs(centre.z - path.z) < 1e-9);
  assert.ok(Math.abs(Math.hypot(side.x - centre.x, side.z - centre.z) - 1.5) < 1e-9);
  // Across is square to the way the path runs.
  assert.ok(Math.abs((side.x - centre.x) * path.fx + (side.z - centre.z) * path.fz) < 1e-9);
  // The same level always winds the same way; another level winds differently.
  assert.deepEqual(buildTrack(LEVELS[3].length, 3).at(500), track.at(500));
  assert.notEqual(buildTrack(LEVELS[4].length, 4).at(500).heading, track.at(500).heading);
});

test('the chosen camera angle: kept within its limits, and anything broken falls back to the default', () => {
  assert.deepEqual(clampCamera(null), { ...DEFAULT_CAMERA });
  assert.deepEqual(clampCamera({ azimuth: 'x', elevation: NaN }), { ...DEFAULT_CAMERA });
  const wild = clampCamera({ azimuth: 9, elevation: -3, distance: 400 });
  assert.deepEqual(wild, { azimuth: CAMERA_LIMITS.azimuth[1], elevation: CAMERA_LIMITS.elevation[0], distance: CAMERA_LIMITS.distance[1] });
  assert.ok(CAMERA_LIMITS.azimuth[1] < Math.PI * 0.75, 'never round in front, where the course comes from');
});

test('the chase camera sits at the chosen angle round the player, at the chosen distance, and turns with the path', () => {
  const track = buildTrack(LEVELS[2].length, 2), s = 300, p = track.at(s);
  for (const angle of [DEFAULT_CAMERA, { azimuth: 0, elevation: 0.5, distance: 10 }, { azimuth: 1.4, elevation: 0.2, distance: 6 }]) {
    const cam = chaseCamera(track, s, 0, angle), dx = cam.x - p.x, dy = cam.y - 0.5, dz = cam.z - p.z;
    assert.ok(Math.abs(Math.hypot(dx, dy, dz) - angle.distance) < 1e-9, 'at its distance from the player');
    const behind = -(dx * p.fx + dz * p.fz), right = dx * p.rx + dz * p.rz;
    assert.ok(Math.abs(Math.atan2(right, behind) - angle.azimuth) < 1e-9, 'round the player by its azimuth, in the path\'s frame');
    assert.ok(Math.abs(Math.asin(dy / angle.distance) - angle.elevation) < 1e-9, 'up by its elevation');
  }
  // The default is behind and to the left; a mirror portal shows the world from the other side.
  const left = chaseCamera(track, s, 0, DEFAULT_CAMERA), mirrored = chaseCamera(track, s, 0, DEFAULT_CAMERA, true);
  assert.ok((left.x - p.x) * p.rx + (left.z - p.z) * p.rz < 0);
  assert.ok((mirrored.x - p.x) * p.rx + (mirrored.z - p.z) * p.rz > 0);
  // It looks ahead of the player along the path.
  assert.ok((left.lookX - p.x) * p.fx + (left.lookZ - p.z) * p.fz > 0);
});
