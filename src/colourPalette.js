// The 16 vanilla dye colours, and the block families tinted by them.
//
// Why this exists. Vanilla defines its coloured blocks combinatorially -- 16 colours x a dozen
// families. This game's block textures are not image files: `TextureAtlas.drawFallbackTile`
// procedurally draws a tile when no asset exists, so a new colour variant renders correctly only if
// that generator knows the colour. Without this table the 75 generated blocks would all draw as the
// same neutral grey, which is worse than not having them.
//
// The hex values are the standard Minecraft dye colours. They are the same set used for wool,
// carpet, concrete, terracotta, stained glass and the dyes themselves, which is exactly why vanilla
// can define those families as one colour plus one shape.
//
// This is deliberately data only -- no imports -- so both the texture generator and the content
// generator can use it without creating a cycle.

/** Colour name -> hex. Keys match the vanilla colour prefix used in block and item names. */
export const DYE_COLOURS = {
  white: '#f9fffe',
  light_gray: '#9d9d97',
  gray: '#474f52',
  black: '#1d1d21',
  brown: '#835432',
  red: '#b02e26',
  orange: '#f9801d',
  yellow: '#fed83d',
  lime: '#80c71f',
  green: '#5e7c16',
  cyan: '#169c9c',
  light_blue: '#3ab3da',
  blue: '#3c44a0',
  purple: '#8932b8',
  magenta: '#c74ebd',
  pink: '#f38baa',
};

/**
 * Slight variations so a family does not look identical to its own dye.
 *
 * Vanilla's textured families are not flat fills; a concrete is flatter than a wool, a terracotta is
 * duller. Reproducing a hint of that keeps 16 colours x 4 families from reading as one flat swatch.
 */
export const FAMILY_SHADE = {
  wool: { lighten: 0, desaturate: 0 },
  concrete: { lighten: 0, desaturate: 0 },
  concrete_powder: { lighten: 0.08, desaturate: 0.1 },
  terracotta: { lighten: -0.16, desaturate: 0.28 },
  stained_glass: { lighten: 0.1, desaturate: 0 },
  carpet: { lighten: 0, desaturate: 0 },
  dye: { lighten: 0, desaturate: 0 },
  candle: { lighten: 0, desaturate: 0 },
  shulker_box: { lighten: 0, desaturate: 0 },
};

/** Split "light_blue_wool" into { colour: 'light_blue', family: 'wool' }. Returns null if not coloured. */
export function parseColouredName(name) {
  const n = String(name).toLowerCase().replace(/\.png$/, '');
  // Longest colour first, so `light_blue` is matched before `blue` and `light_gray` before `gray`.
  const colours = Object.keys(DYE_COLOURS).sort((a, b) => b.length - a.length);
  for (const colour of colours) {
    if (!n.startsWith(colour + '_')) continue;
    const rest = n.slice(colour.length + 1);
    // A family is the rest of the name; only known families are treated as coloured.
    const family = Object.keys(FAMILY_SHADE).find(f => rest === f || rest === f + 's');
    if (family) return { colour, family, hex: DYE_COLOURS[colour] };
  }
  return null;
}

/** Apply a family's shade to a hex colour, returning a new hex string. */
export function shadedHex(hex, family) {
  const shade = FAMILY_SHADE[family] || { lighten: 0, desaturate: 0 };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Desaturate toward the channel mean, then lighten toward white or black.
  const mean = (r + g + b) / 3;
  const d = shade.desaturate ?? 0;
  let nr = r + (mean - r) * d;
  let ng = g + (mean - g) * d;
  let nb = b + (mean - b) * d;
  const l = shade.lighten ?? 0;
  const target = l >= 0 ? 255 : 0;
  const t = Math.abs(l);
  nr = nr + (target - nr) * t;
  ng = ng + (target - ng) * t;
  nb = nb + (target - nb) * t;
  const hx = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + hx(nr) + hx(ng) + hx(nb);
}
