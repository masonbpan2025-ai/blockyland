import { BLOCKS } from './blocks.js';

export function isSnowSurface(id) {
  return id === BLOCKS.SNOW || id === BLOCKS.SNOW_LAYER || id === BLOCKS.POWDER_SNOW;
}

// Linear-space shades: white tops, two distinct side shades and darker bottoms.
// Brightness comes from sky exposure, not an emissive snow material.
const TOP = [1, 1, 1], BOTTOM = [.25, .28, .32];
const X_SIDE = [.32, .40, .52], Z_SIDE = [.50, .58, .70];
export function snowFaceTint(nx, ny, nz) {
  if (ny > 0.5) return TOP;
  if (ny < -0.5) return BOTTOM;
  return Math.abs(nx) > 0.5 ? X_SIDE : Z_SIDE;
}

export function snowDaylightStrength(sunHeight, rain = 0) {
  // Minecraft-style sky fill stays bright at sunrise, unlike a Lambert sun
  // whose contribution to a horizontal face is nearly zero at the horizon.
  const t = Math.max(0, Math.min(1, (sunHeight + .18) / .22));
  return 1.08 * t * t * (3 - 2 * t) * (1 - Math.max(0, Math.min(1, rain)) * .12);
}
