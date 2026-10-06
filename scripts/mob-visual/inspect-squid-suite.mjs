// Find out exactly what the squid suite reads from the materials, so the real sheet can be made to satisfy it.
//
// The suite does:
//   const {data,width,height} = m.mantle.material[face].map.image;
//   return [...data.slice(((height-1-y)*width+x)*4, ...)];
//
// A loaded texture from a real PNG has a canvas-backed image whose `data` is a Uint8ClampedArray of the WHOLE sheet, so
// `width`/`height` are the SHEET's size -- while the procedural version gave a per-face 12x16 buffer. That difference is
// what breaks the coordinates, not the presence of data.
import * as THREE from 'three';
import { createMobDebugSession } from '../../src/mobDebugSession.js';

const s = createMobDebugSession(new THREE.Scene());
s.reset('squid');
const m = s.mob;

console.log('  mantle.material is array:', Array.isArray(m.mantle.material), 'length:', m.mantle.material.length);
const img = m.mantle.material[4].map.image;
console.log('  image constructor:', img?.constructor?.name);
console.log('  has data:', Array.isArray(img?.data) || img?.data instanceof Uint8ClampedArray);
console.log('  width/height:', img?.width, img?.height);
if (img?.data) console.log('  data length:', img.data.length, '(= w*h*4?', img.width * img.height * 4, ')');
console.log('  map magFilter is Nearest:', m.mantle.material[4].map.magFilter === THREE.NearestFilter);

// What the suite computes for face 4 at a few pixels.
const pixel = (face, x, y) => {
  const { data, width, height } = m.mantle.material[face].map.image;
  const o = ((height - 1 - y) * width + x) * 4;
  return [...data.slice(o, o + 3)];
};
console.log('  pixel(4,2,10) =', JSON.stringify(pixel(4, 2, 10)));
console.log('  pixel(4,0,0)  =', JSON.stringify(pixel(4, 0, 0)));
