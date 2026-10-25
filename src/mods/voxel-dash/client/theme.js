// Per-level colours for what the player must read at a glance: platforms, spikes, pads, orbs and the player itself.
// Chosen against the level's background so they stand out from it, by the WCAG contrast ratio, the same measure a
// test holds them to (tests/voxelDash.test.js). Pure, so it runs in Node.

const channels = (hex) => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex) {
  const [r, g, b] = channels(hex).map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `a` moved `t` of the way towards `b`. */
export function mix(a, b, t) {
  const x = channels(a), y = channels(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
}

/** The colours behind the course as drawn: the lower sky and the scenery hills (or the default hills), under the veil. */
export function backgroundColors(level) {
  const light = isLightLevel(level);
  return [level.sky[1], ...(level.hills ?? ['#193e47', '#25545a', '#336a60'])]
    .map((c) => (light ? mix(c, '#ffffff', VEIL_LIGHT) : mix(c, '#04080c', VEIL_DARK)));
}

/** How far the veil moves the drawn background towards white (light level) or black (dark level). */
export const VEIL_LIGHT = 0.3, VEIL_DARK = 0.34;

/**
 * Is the level's playing field light? Judged by the sky where the course runs, its lower end: Back On Track's meadow
 * and Dry Out's badlands are; the rest are night, caves and voids.
 */
export function isLightLevel(level) {
  return luminance(level.sky[1]) > 0.25;
}

/** The colour, of `candidates`, that stands out most from every background colour (the worst case counts). */
function mostDistinct(candidates, backgrounds) {
  let best = candidates[0], bestScore = -1;
  for (const c of candidates) {
    const score = Math.min(...backgrounds.map((b) => contrast(c, b)));
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}

/**
 * The level's palette for objects and the player.
 *  - `outline`: the player's outline, light on a dark level and dark on a light one.
 *  - `veil`: laid over the drawn background to push it back (darker on a dark level, lighter on a light one).
 *  - `solid`, `solidTop`, `solidEdge`: platforms, their walkable top, and their outline.
 *  - `fill`: the inside of walls (no collision), a shade off `solid`.
 *  - `spike`, `spikeEdge`, `pad*`, `orb*`, `edge`: hazards and launchers, and the outline every one of them gets.
 */
export function levelPalette(level) {
  const light = isLightLevel(level);
  const bg = backgroundColors(level);
  const ink = light ? '#141418' : '#ffffff';
  const accent = mostDistinct([level.color, mix(level.color, ink, 0.45), ink], bg);
  if (light) {
    return {
      light, outline: '#101014', veil: `rgba(255,255,255,${VEIL_LIGHT})`,
      solid: mix(level.stone, '#000000', 0.45), solidTop: mix(level.ground, '#000000', 0.15), solidEdge: '#101014',
      fill: mix(level.stone, '#000000', 0.6),
      spike: '#1b1b24', spikeEdge: '#ffffff', edge: '#101014', accent,
      padYellow: '#ffd21f', padPink: '#ff3fb4', padGravity: '#1fa8ff',
      orbYellow: '#ffe32e', orbPink: '#ff52c4', orbBlue: '#2eb4ff',
    };
  }
  return {
    light, outline: '#ffffff', veil: `rgba(4,8,12,${VEIL_DARK})`,
    solid: mix(mix(level.stone, level.color, 0.22), '#ffffff', 0.08), solidTop: level.color, solidEdge: mix(level.color, '#ffffff', 0.55),
    fill: mix(level.stone, level.color, 0.12),
    spike: mix(level.color, '#ffffff', 0.8), spikeEdge: '#0b0d12', edge: '#0b0d12', accent,
    padYellow: '#ffe14a', padPink: '#ff6ad0', padGravity: '#4fd2ff',
    orbYellow: '#fff04f', orbPink: '#ff7ad8', orbBlue: '#62d8ff',
  };
}
