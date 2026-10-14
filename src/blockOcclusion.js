// Only an opaque FULL cube can hide a neighbour's entire face. Partial models
// may have opaque textures, but carpet, slabs, chests, etc. leave exposed area.
// Conservatively keep the whole face beside those models (depth testing covers
// the overlapping part), rather than cutting holes in ordinary solid blocks.
const PARTIAL_SHAPES = [
  'slab', 'pane', 'carpet', 'stair', 'candle', 'chain', 'fence', 'wall',
  'pressurePlate', 'button', 'fenceGate', 'banner', 'hangingSign', 'wallSign',
  'wallFan', 'head', 'wallHead', 'sign', 'rod', 'rail', 'flowerPot',
  'door', 'trapdoor', 'bed', 'chest', 'redstone', 'model',
];

export function occludesWholeFace(def) {
  return !!def && !def.transparent && !def.plant && def.solid !== false
    && def.shape !== 'torch' && !PARTIAL_SHAPES.some(shape => def[shape]);
}
