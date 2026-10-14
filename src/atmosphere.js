// Keep the useful terrain range clear. Fog hides the final streaming ring,
// rather than washing out mountains halfway through the loaded view.
export function overworldFogRange(renderDistance = 8, rain = 0) {
  const chunks = Number.isFinite(renderDistance) ? Math.max(1, renderDistance) : 8;
  const reach = chunks * 16;
  const wet = Math.max(0, Math.min(1, rain));
  return {near: reach * .72 * (1 - wet * .22), far: reach * .99 * (1 - wet * .15)};
}
