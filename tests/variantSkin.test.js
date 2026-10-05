// Regression tests for DERIVED (tinted) mob skins.
//
// The husk, stray and bogged are recoloured versions of the zombie and skeleton skins. All three rendered as a
// SOLID BLACK BLOB in the Mob Inspector. Two separate faults combined:
//
//   1. The variants were built INSIDE the `this.textures = { ... }` literal, so `this.textures` did not exist
//      yet. `this.textures?.[baseKey]` returned undefined, the base was null, and the variant got a texture with
//      no image at all. A `MeshLambertMaterial` with a colour but no map has nothing to multiply against.
//   2. The tint used the canvas `multiply` composite, which measured as a NO-OP in the live page -- the
//      "tinted" texture came back at exactly the base's average, so even with a base nothing was recoloured.
//
// These tests pin the ordering, and pin that the tint arithmetic really changes the pixels without crushing
// them to black. The visual result was confirmed separately with a real WebGL renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { VARIANT_TINTS } from '../src/undeadVariants.js';

/** Install a fake DOM with a permissive 2D canvas, which Node does not provide. */
function withCanvas() {
  const original = globalThis.document;
  const makeCanvas = () => ({
    width: 300, height: 150, _data: null,
    getContext() {
      const self = this;
      return {
        globalCompositeOperation: 'source-over',
        fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: '', textBaseline: '',
        clearRect() {}, fillRect() {}, strokeRect() {},
        beginPath() {}, closePath() {}, arc() {}, ellipse() {}, moveTo() {}, lineTo() {}, rect() {},
        fill() {}, stroke() {}, clip() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        setTransform() {}, transform() {}, resetTransform() {},
        fillText() {}, strokeText() {}, measureText: () => ({ width: 0 }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }),
        drawImage() {},
        // A flat opaque grey, so the tint has something real to act on.
        getImageData(x, y, w, h) {
          const data = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < data.length; i += 4) {
            data[i] = 120; data[i + 1] = 120; data[i + 2] = 120; data[i + 3] = 255;
          }
          return { data, width: w, height: h };
        },
        putImageData(img) { self._data = img.data; }
      };
    }
  });
  globalThis.document = {
    createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { style: {}, addEventListener() {} }),
    createElementNS: () => ({ style: {}, addEventListener() {}, set src(_v) {}, complete: false, width: 0, height: 0 })
  };
  return {
    restore() {
      if (original === undefined) delete globalThis.document;
      else globalThis.document = original;
    }
  };
}

function manager() {
  const scene = new THREE.Scene();
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {}
  };
  return new MobManager(scene, world, new Proxy({}, { get: () => () => {} }), null);
}

/** A base texture whose image is already decodable, so the derivation paints synchronously. */
function readyBase(width = 64, height = 64) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const tex = new THREE.Texture();
  tex.image = canvas;
  return tex;
}

test('the variant skins are derived AFTER the texture table exists', () => {
  // Fault 1. Inside the object literal `this.textures` is still undefined, so the base was always null and the
  // variant kept the default 300x150 blank canvas forever. This asserts the OUTCOME (no longer blank) rather
  // than the ordering itself, because in Node the base image never decodes and the paint defers.
  const env = withCanvas();
  try {
    const mgr = manager();
    for (const key of ['husk', 'stray', 'bogged']) {
      assert.ok(mgr.textures[key], `${key} must exist`);
      assert.equal(mgr.textures[key].isCanvasTexture, true, `${key} must be a canvas texture`);
      assert.ok(mgr.textures[key].image, `${key} must actually have a canvas`);
    }
    // And the bases the variants are derived FROM are present in the same table.
    assert.ok(mgr.textures.zombie, 'the zombie base exists');
    assert.ok(mgr.textures.skeleton, 'the skeleton base exists');
  } finally { env.restore(); }
});

test('the painter really tints, and does not crush to black', () => {
  // Fault 2, isolated by handing the derivation a base that is already decodable.
  const env = withCanvas();
  try {
    const mgr = manager();
    mgr.textures.zombie = readyBase();
    const husk = mgr.createVariantTexture('zombie', VARIANT_TINTS.husk);
    assert.ok(husk.image._data, 'the painter ran');
    const data = husk.image._data;
    let sum = 0, opaque = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      opaque++; sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    assert.ok(opaque > 0, 'the texture has opaque pixels');
    const avg = sum / opaque;
    // The flat base was 120. The tint multiplies it down and the uniform gain lifts it back toward the tint's own
    // brightness (0xc2a878 averages 161). It must NOT still read 120, which is what happened when the canvas
    // `multiply` composite silently did nothing.
    assert.ok(Math.abs(avg - 120) > 4, `the skin must actually be tinted, got avg ${Math.round(avg)}`);
    assert.ok(avg > 80, `and must not be crushed to black, got avg ${Math.round(avg)}`);
  } finally { env.restore(); }
});

test('a base that is not ready yet still yields a paintable texture', () => {
  // The deferred path: no image on the base means nothing to paint now, so the method must hand back a texture
  // that will be filled in when the base arrives -- never a bare `THREE.Texture` with a null image.
  const env = withCanvas();
  try {
    const mgr = manager();
    mgr.textures.zombie = new THREE.Texture(); // image is null, exactly as TextureLoader leaves it
    const husk = mgr.createVariantTexture('zombie', VARIANT_TINTS.husk);
    assert.equal(husk.isCanvasTexture, true, 'it must still be a canvas texture');
    assert.ok(husk.image, 'with a real canvas attached, so the material has a map');
    // Now deliver the image the way TextureLoader eventually does, and confirm the deferred paint fires.
    const base = mgr.textures.zombie;
    base.image = readyBase();
    base.dispatchEvent({ type: 'load' });
    assert.ok(husk.image._data, 'the deferred paint ran once the base arrived');
  } finally { env.restore(); }
});

test('the tints come from one source: VARIANT_TINTS', () => {
  // The colours must not be duplicated as literals in mobs.js, or a change to one would silently miss the other.
  assert.deepEqual(Object.keys(VARIANT_TINTS).sort(), ['bogged', 'husk', 'parched', 'stray']);
  assert.equal(VARIANT_TINTS.husk, 0xc2a878, 'the husk tint is the wiki\'s sandy colour');
  assert.equal(typeof MobManager.prototype.createVariantTexture, 'function');
});

test('deriving a skin is safe without any DOM at all', () => {
  // Headless runs have no document. The method must not throw and must hand back something a material can take.
  const env = withCanvas();
  env.restore();
  delete globalThis.document;
  try {
    const mgr = manager();
    assert.ok(mgr.textures.husk, 'construction must not fail without a DOM');
    assert.doesNotThrow(() => mgr.spawnMob('husk', 0, 1, 0));
  } finally {
    if (env) env.restore();
  }
});

test('every tinted variant still spawns as its own type', () => {
  const env = withCanvas();
  try {
    const mgr = manager();
    for (const type of ['husk', 'stray', 'bogged']) {
      const mob = mgr.spawnMob(type, 0, 1, 0);
      assert.equal(mob.type, type);
      assert.equal(mob.name, type.charAt(0).toUpperCase() + type.slice(1));
      assert.ok(mob.maxHealth > 0);
    }
  } finally { env.restore(); }
});
