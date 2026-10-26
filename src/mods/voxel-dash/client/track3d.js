// The 3D view's fixed trajectory: the course, which the simulation runs along a straight line, laid along a winding
// path through a 3D world, as Minecraft's Sonic the Hedgehog DLC runs its player along a set route. The game is
// unchanged: the course distance x becomes a distance along the path, the height y stays a height, and the track
// has a width the player never moves across. Pure, so it runs in Node (tests/voxelDash3d.test.js).

/** Course units (Geometry Dash's 30 to a block) per world block. */
export const UNIT = 30;
/** The track's width in blocks; the player runs down its middle. */
export const TRACK_WIDTH = 3;
/** Straight blocks before the course starts and after it ends, so the start and the finish line up with the run. */
export const LEAD_IN = 24, LEAD_OUT = 60;
/** Blocks of the run before the path starts to bend. */
export const STRAIGHT = 8;
/** Path samples per block. */
const STEPS = 4;
/** The tightest the path turns: radius in blocks. Wide enough that a 3-block track's inside edge never folds over. */
export const MIN_RADIUS = 30;

const fract = (n) => n - Math.floor(n);
const rand = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

/**
 * The path for a level: its heading at each distance, the sum of slow waves whose phases come from the level, so a
 * level always winds the same way and no two levels wind alike. Straight through the lead-in, easing into the bends.
 * @param {number} lengthUnits the course length, in course units
 * @param {number} seed the level index
 */
export function buildTrack(lengthUnits, seed = 0) {
  const blocks = lengthUnits / UNIT + LEAD_OUT, count = Math.ceil((blocks + LEAD_IN) * STEPS) + 2;
  const xs = new Float64Array(count), zs = new Float64Array(count), hs = new Float64Array(count);
  const waves = [0, 1, 2].map((k) => ({ amp: [0.5, 0.32, 0.18][k], period: [70, 31, 17][k] * (0.85 + rand(seed * 3 + k) * 0.3), phase: rand(seed * 7 + k + 0.5) * Math.PI * 2 }));
  // Straight for the first blocks of the run, then easing into the bends.
  const heading = (s) => {
    const ease = Math.min(1, Math.max(0, (s - STRAIGHT) / 60));
    return ease * ease * waves.reduce((sum, w) => sum + w.amp * (Math.sin(s / w.period + w.phase) - Math.sin(w.phase)), 0);
  };
  for (let i = 0; i < count; i++) hs[i] = heading(i / STEPS - LEAD_IN);
  // Scaled, as measured, so the tightest bend anywhere is no tighter than MIN_RADIUS (a turn rate scales with it).
  let maxRate = 0;
  for (let i = 1; i < count; i++) maxRate = Math.max(maxRate, Math.abs(hs[i] - hs[i - 1]) * STEPS);
  const fit = maxRate > 0 ? Math.min(1, 0.99 / MIN_RADIUS / maxRate) : 1;
  let x = 0, z = 0;
  for (let i = 0; i < count; i++) {
    const h = hs[i] *= fit;
    xs[i] = x; zs[i] = z;
    x += Math.cos(h) / STEPS; z += Math.sin(h) / STEPS;
  }
  /**
   * Where the path is at distance `s` blocks from the course start: its point, heading, forward and right directions.
   * The right-hand direction is the track's width; up is world up.
   */
  function at(s, out = {}) {
    const f = Math.min(count - 1.001, Math.max(0, (s + LEAD_IN) * STEPS)), i = Math.floor(f), t = f - i;
    out.x = xs[i] + (xs[i + 1] - xs[i]) * t;
    out.z = zs[i] + (zs[i + 1] - zs[i]) * t;
    out.heading = hs[i] + (hs[i + 1] - hs[i]) * t;
    out.fx = Math.cos(out.heading); out.fz = Math.sin(out.heading);
    out.rx = -out.fz; out.rz = out.fx;
    return out;
  }
  /** A course point (units along, units up) and an offset across the track (blocks, right positive), in world blocks. */
  function place(xUnits, yUnits, across = 0, out = {}) {
    const p = at(xUnits / UNIT);
    out.x = p.x + p.rx * across; out.y = yUnits / UNIT; out.z = p.z + p.rz * across; out.heading = p.heading;
    return out;
  }
  return { at, place, length: blocks, start: -LEAD_IN, turnRate: fit * maxRate };
}

/**
 * The chase camera's angle, which the player chooses in the 3D view's preview: round the player (`azimuth`, radians,
 * 0 straight behind, negative to the left, ±π/2 square to the side), up (`elevation`, radians) and how far
 * (`distance`, blocks). The default is the angle the 3D view began with: behind, to the left and a little above.
 */
export const DEFAULT_CAMERA = Object.freeze({ azimuth: -0.6, elevation: 0.36, distance: 8.2 });
/** From behind round to a little past either side (never from in front: the course comes from there), low to steep, near to far. */
export const CAMERA_LIMITS = Object.freeze({ azimuth: [-1.9, 1.9], elevation: [0.05, 1.25], distance: [4, 16] });

/** A camera angle with every part a number within its limits; anything missing or broken takes the default. */
export function clampCamera(angle) {
  const out = {};
  for (const key of Object.keys(DEFAULT_CAMERA)) {
    const value = Number(angle?.[key]), [lo, hi] = CAMERA_LIMITS[key];
    out[key] = angle?.[key] !== null && angle?.[key] !== undefined && Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : DEFAULT_CAMERA[key];
  }
  return out;
}

/**
 * Where the chase camera is and what it looks at, for a player `s` blocks along the path whose camera height is
 * `baseY`: placed by the angle in the path's own frame at the player, so it turns with the bends, and looking a little
 * ahead along the path -- further ahead the more it is behind the player. A mirror portal shows the world from the
 * other side, as the 2D view turns it back to front.
 */
export function chaseCamera(track, s, baseY, angle, mirrored = false) {
  const { azimuth, elevation, distance } = clampCamera(angle), az = mirrored ? -azimuth : azimuth;
  const p = track.at(s), flat = Math.cos(elevation) * distance, back = -Math.cos(az) * flat, side = Math.sin(az) * flat;
  const ahead = track.at(s + 1 + 4 * Math.max(0, Math.cos(az)));
  return {
    x: p.x + p.fx * back + p.rx * side, y: baseY + 0.5 + Math.sin(elevation) * distance, z: p.z + p.fz * back + p.rz * side,
    lookX: ahead.x, lookY: baseY + 1.2, lookZ: ahead.z,
  };
}
