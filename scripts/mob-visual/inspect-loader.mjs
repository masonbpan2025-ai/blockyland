// Find a property that distinguishes the REAL loaded sheet from the test fixture's color-keyed stub.
//
// The fixture supplies a texture whose image is {width:12, height:16, data:<per-face 12x16 RGBA>} -- a stub the suite can
// read pixels from. The runtime supplies whatever `MobManager.loadTexture` returns for a real PNG. If those differ in a
// detectable way, a model can use the real sheet at runtime and satisfy the suite's pixel reads in tests.
import * as THREE from 'three';

// The project's own loader, used exactly as a spawner uses it.
const { MobManager } = await import('../../src/mobs.js');
const manager = Object.create(MobManager.prototype ?? MobManager);
manager.textures = {};

console.log('  MobManager.loadTexture exists:', typeof manager.loadTexture);
if (typeof manager.loadTexture === 'function') {
  let tex = null;
  try { tex = manager.loadTexture('/assets/entity/squid/squid.png'); }
  catch (e) { console.log('  loadTexture threw:', e.message.split('\n')[0]); }
  if (tex) {
    console.log('    constructor:', tex.constructor?.name);
    console.log('    isTexture:', tex.isTexture === true);
    console.log('    image type:', tex.image?.constructor?.name ?? typeof tex.image);
    console.log('    image.width/height:', tex.image?.width, tex.image?.height);
    console.log('    image has .data:', tex.image?.data !== undefined);
    console.log('    image.complete:', tex.image?.complete);
    console.log('    assetPath:', tex.assetPath);
  }
}
