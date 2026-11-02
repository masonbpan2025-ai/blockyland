// Who the player plays as: the default Voxel cube (a creeper face in the level's colour), or the head of a Minecraft
// player or mob, cut from that mob's own skin in public/assets/entity. Heads are the wiki's seven head blocks
// (https://minecraft.wiki/w/Head: player, zombie, skeleton, wither skeleton, creeper, piglin, dragon), less the dragon,
// whose head is no cube, and thirteen more mobs with a boxy head.
//
// A face is the front of the head box in the mob's model: `face` is its size in skin pixels, and each layer copies a
// rectangle of the skin [x, y, w, h] to [dx, dy] on the face. The first layer is the head's front; later ones are what
// sits in front of it (a hat layer, a snout, a beak, a nose), where the model puts them. A box's front face sits at
// (u + depth, v + depth) from the box's texture offset, which is how each rectangle below is found.
// Pure data and one loader, so the table runs in Node (tests/voxelDash.test.js) and the loader in the page.

export const DEFAULT_CHARACTER = 'voxel';

/** At most twenty, the default included. */
export const CHARACTERS = [
  { id: 'voxel', name: 'Voxel Cube' },
  { id: 'steve', name: 'Steve', skin: '/assets/entity/player/wide/steve.png', size: [64, 64], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0], [40, 8, 8, 8, 0, 0]] },
  { id: 'zombie', name: 'Zombie', skin: '/assets/entity/zombie/zombie.png', size: [64, 64], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0], [40, 8, 8, 8, 0, 0]] },
  { id: 'skeleton', name: 'Skeleton', skin: '/assets/entity/skeleton/skeleton.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0]] },
  { id: 'wither_skeleton', name: 'Wither Skeleton', skin: '/assets/entity/skeleton/wither_skeleton.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0]] },
  { id: 'creeper', name: 'Creeper', skin: '/assets/entity/creeper/creeper.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0]] },
  // A 10-wide head, with its snout (texture offset 31,1; a 4x2x1 box) on the face.
  { id: 'piglin', name: 'Piglin', skin: '/assets/entity/piglin/piglin.png', size: [64, 64], face: [10, 8], layers: [[8, 8, 10, 8, 0, 0], [32, 2, 4, 2, 3, 4]] },
  { id: 'husk', name: 'Husk', skin: '/assets/entity/zombie/husk.png', size: [64, 64], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0], [40, 8, 8, 8, 0, 0]] },
  { id: 'drowned', name: 'Drowned', skin: '/assets/entity/zombie/drowned.png', size: [64, 64], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0], [40, 8, 8, 8, 0, 0]] },
  { id: 'stray', name: 'Stray', skin: '/assets/entity/skeleton/stray.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0]] },
  // Sheep: a 6x6x8 head. Cow: 8x8x6. Pig: 8x8x8, with its 4x3x1 snout (offset 16,16) low on the face.
  { id: 'sheep', name: 'Sheep', skin: '/assets/entity/sheep.png', size: [64, 32], face: [6, 6], layers: [[8, 8, 6, 6, 0, 0]] },
  { id: 'cow', name: 'Cow', skin: '/assets/entity/cow.png', size: [64, 32], face: [8, 8], layers: [[6, 6, 8, 8, 0, 0]] },
  { id: 'pig', name: 'Pig', skin: '/assets/entity/pig.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0], [17, 17, 4, 3, 2, 4]] },
  // A 4x6x3 head, with the beak (offset 14,0; 4x2x2) and the wattle (offset 14,4; 2x2x2) in front of it.
  { id: 'chicken', name: 'Chicken', skin: '/assets/entity/chicken.png', size: [64, 32], face: [4, 6], layers: [[3, 3, 4, 6, 0, 0], [16, 2, 4, 2, 0, 2], [16, 6, 2, 2, 1, 4]] },
  // The head box at offset 32,4, its eyes on a second, glowing skin at the same place.
  { id: 'spider', name: 'Spider', skin: '/assets/entity/spider/spider.png', size: [64, 32], face: [8, 8], layers: [[40, 12, 8, 8, 0, 0], [40, 12, 8, 8, 0, 0, '/assets/entity/spider/spider_eyes.png']] },
  { id: 'blaze', name: 'Blaze', skin: '/assets/entity/blaze.png', size: [64, 32], face: [8, 8], layers: [[8, 8, 8, 8, 0, 0]] },
  // An 8x10x8 head, with the 2x4x2 nose (offset 24,0) from just under the eyes, clipped where it hangs below the chin.
  { id: 'villager', name: 'Villager', skin: '/assets/entity/villager.png', size: [64, 64], face: [8, 10], layers: [[8, 8, 8, 10, 0, 0], [26, 2, 2, 3, 3, 7]] },
  { id: 'iron_golem', name: 'Iron Golem', skin: '/assets/entity/iron_golem/iron_golem.png', size: [128, 128], face: [8, 10], layers: [[8, 8, 8, 10, 0, 0], [26, 2, 2, 3, 3, 7]] },
  { id: 'witch', name: 'Witch', skin: '/assets/entity/witch.png', size: [64, 128], face: [8, 10], layers: [[8, 8, 8, 10, 0, 0], [26, 2, 2, 3, 3, 7]] },
  { id: 'pillager', name: 'Pillager', skin: '/assets/entity/pillager.png', size: [64, 64], face: [8, 10], layers: [[8, 8, 8, 10, 0, 0], [26, 2, 2, 3, 3, 7]] },
];

/** The character with this id, or the default for anything unknown. */
export function characterById(id) {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

const images = new Map();
function loadImage(src) {
  if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Could not load ${src}`)); image.src = src;
  }));
  return images.get(src);
}

/**
 * The character's face, drawn at its skin's own pixels on a canvas `face` in size; null for the default cube, which
 * the painters draw themselves. Drawn without smoothing, so scaled up it stays Minecraft-sharp.
 */
export async function loadFace(character) {
  if (!character?.skin) return null;
  const sources = await Promise.all(character.layers.map((layer) => loadImage(layer[6] ?? character.skin)));
  const canvas = document.createElement('canvas'); [canvas.width, canvas.height] = character.face;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  // A skin may be drawn at a larger resolution than the model's texture size; the layers are in model pixels.
  character.layers.forEach(([x, y, w, h, dx, dy], i) => {
    const image = sources[i], sx = image.naturalWidth / character.size[0], sy = image.naturalHeight / character.size[1];
    ctx.drawImage(image, x * sx, y * sy, w * sx, h * sy, dx, dy, w, h);
  });
  return canvas;
}
