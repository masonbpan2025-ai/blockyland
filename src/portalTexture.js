// The Nether portal's swirling animation.
//
// Minecraft drew its portal texture with code, not a picture (Classic to 1.4, TexturePortalFX; the later animated
// texture is a strip of the same swirl): 32 frames of two spirals turning against each other, purple, translucent and
// flecked with noise. The game used to draw one still frame, so a lit portal was a flat purple sheet. This is that
// algorithm, frame for frame; textures.js paints a frame into the portal's atlas tile twenty times a second, the rate
// the game ticks at. A resource pack's own animated strip is played instead when it has one.
export const PORTAL_FRAMES = 32;
export const PORTAL_FRAME_SECONDS = 0.05;

/** A seeded random in [0, 1), so the swirl's noise is the same each time. */
function seeded(seed = 100) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The 32 frames, each 16 x 16 RGBA. For every pixel, two spirals centred on the tile and on its corner (wrapping):
 *   angle = atan2(y, x) + (frame / 32 * 2pi - d^2 * 10 + 2l) * (2l - 1),   value = (sin(angle) + 1) / 2 / (d^2 + 1)
 * summed at half weight, plus up to 0.1 of noise; then red = f^2*200 + 55, green = f^4*255, blue = f*100 + 155 (purple),
 * and alpha = f*100 + 155.
 * @returns {Uint8ClampedArray[]}
 */
export function netherPortalFrames(random = seeded()) {
  const frames = [];
  for (let i = 0; i < PORTAL_FRAMES; i++) {
    const pixels = new Uint8ClampedArray(16 * 16 * 4);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) {
      let f = 0;
      for (let l = 0; l < 2; l++) {
        const c = l * 8;
        let u = ((x - c) / 16) * 2, v = ((y - c) / 16) * 2;
        if (u < -1) u += 2; if (u >= 1) u -= 2;
        if (v < -1) v += 2; if (v >= 1) v -= 2;
        const d2 = u * u + v * v;
        let a = Math.atan2(v, u) + ((i / 32) * Math.PI * 2 - d2 * 10 + l * 2) * (l * 2 - 1);
        a = (Math.sin(a) + 1) / 2;
        f += (a / (d2 + 1)) * 0.5;
      }
      f += random() * 0.1;
      const o = (y * 16 + x) * 4;
      pixels[o] = f * f * 200 + 55;
      pixels[o + 1] = f * f * f * f * 255;
      pixels[o + 2] = f * 100 + 155;
      pixels[o + 3] = f * 100 + 155;
    }
    frames.push(pixels);
  }
  return frames;
}
