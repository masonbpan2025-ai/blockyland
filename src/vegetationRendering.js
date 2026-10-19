// Vanilla's grass, vines and most leaves are grayscale masks tinted by the game.
// Keep already-coloured flowers, cherry leaves and azalea artwork unchanged.
export function vegetationTint(def) {
  if (/^(Short Grass|Tall Grass|Fern|Large Fern)$/.test(def?.name)) return [0.48, 0.74, 0.31];
  if (/^(Vine|Oak Leaves|Jungle Leaves|Acacia Leaves|Dark Oak Leaves|Mangrove Leaves)$/.test(def?.name)) return [0.35, 0.65, 0.22];
  if (def?.name === 'Birch Leaves') return [0.48, 0.65, 0.3];
  if (def?.name === 'Spruce Leaves') return [0.32, 0.5, 0.35];
  return null;
}

export function configureCutoutMaterial(material) {
  // Binary holes, with surviving fragments participating in the depth buffer.
  // Ordinary alpha blending made leaves/grass depend on chunk draw order.
  material.transparent = false;
  material.depthWrite = true;
  material.alphaTest = 0.5;
  return material;
}
