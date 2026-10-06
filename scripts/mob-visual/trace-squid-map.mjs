// Trace what the wired squid model actually receives, so the remaining failure is a fact rather than a guess.
import * as THREE from 'three';
import { createMobDebugSession } from '../../src/mobDebugSession.js';

const s = createMobDebugSession(new THREE.Scene());
s.reset('squid');
const m = s.mob;
const material = m.mantle.material[4];
const map = material.map;

console.log('  material.map === null:', map === null);
console.log('  map.image === null:', map?.image === null);
console.log('  map has image.data:', map?.image?.data !== undefined);
if (map?.image?.data) {
  console.log('  image size:', map.image.width + 'x' + map.image.height);
}
console.log('  map.assetPath:', map?.assetPath ?? '(none)');
console.log('  is a DataTexture:', map?.isDataTexture === true);
console.log('  manager.textures.squid === map:', s.manager.textures?.squid === map);
const atlas = s.manager.textures?.squid;
console.log('  atlas image === null:', atlas?.image === null, ' hasData:', atlas?.image?.data !== undefined);
