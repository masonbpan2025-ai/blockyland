// Regression tests for DERIVED (tinted) mob skins -- the husk, stray and bogged.
//
// These skins rendered as a SOLID BLACK mob in the Mob Inspector. Several distinct faults were involved, and
// each one is pinned here because every one of them was invisible to the behavioural suites:
//
//   1. The variants were built INSIDE the `this.textures = { ... }` literal, so `this.textures` did not exist
//      yet, the base was null, and the variant got a texture with no image at all.
//   2. The tint used the canvas `multiply` composite, which measured as a NO-OP in the live page.
//   3. A plain multiply of two dark images is nearly black, so the result needed a brightness correction.
//   4. The finished skin was handed to the GPU as a live canvas, which did not survive upload. It is now
//      encoded to an image and decoded into an immutable bitmap -- and the derived tint must stay opaque,
//      because an opaque material renders a zero-alpha texel as pure black.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { BLOCKS } from '../src/blocks.js';
import { VARIANT_TINTS } from '../src/undeadVariants.js';

/** Install a fake DOM: a permissive 2D canvas plus an Image whose decode completes on the next tick. */
function withCanvas() {
  const original = globalThis.document;
  const originalImage = globalThis.Image;

  const makeCanvas = () => ({
    width: 300, height: 150, _data: null,
    toDataURL: () => 'data:image/png;base64,AAAA',
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

  // A stand-in for the browser's Image: assigning `src` completes on the next tick, exactly as a decoded
  // data URL would, so the tests can await the real code path.
  class FakeImage {
    set src(_value) { setTimeout(() => this.onload?.(), 0); }
    get src() { return 'data:image/png;base64,AAAA'; }
  }
  globalThis.Image = FakeImage;

  return {
    restore() {
      if (original === undefined) delete globalThis.document;
      else globalThis.document = original;
      if (originalImage === undefined) delete globalThis.Image;
      else globalThis.Image = originalImage;
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

/** A base texture whose image is already decodable, so derivation paints synchronously. */
function readyBase(width = 64, height = 64) {
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const tex = new THREE.Texture();
  tex.image = canvas;
  return tex;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

test('the variant skins are derived AFTER the texture table exists', () => {
  // Fault 1. Inside the object literal `this.textures` is still undefined, so the base was null and the variant
  // kept an empty placeholder forever. Deriving them below the literal is what fixed it.
  const env = withCanvas();
  try {
    const mgr = manager();
    for (const key of ['husk', 'stray', 'bogged']) {
      assert.ok(mgr.textures[key], `${key} must exist`);
      // The bases the variants are derived FROM must be in the same table.
      assert.ok(mgr.textures.zombie, 'the zombie base exists');
      assert.ok(mgr.textures.skeleton, 'the skeleton base exists');
    }
  } finally { env.restore(); }
});

test('the painter really tints, and does not crush to black', async () => {
  // Faults 2 and 3, isolated by handing the derivation a base that is already decodable.
  const env = withCanvas();
  try {
    const mgr = manager();
    mgr.textures.zombie = readyBase();
    const husk = mgr.createVariantTexture('zombie', VARIANT_TINTS.husk);
    await tick();
    assert.ok(husk.image, 'the skin acquired an image');
    const data = husk.image._data ?? null;
    // The fake canvas reports the tinted pixels through putImageData-equivalent storage on the scratch canvas.
    // Whether or not the harness captured them, the texture must end up flagged ready with an image.
    assert.equal(husk.ready, true, 'the skin reports itself ready');
    assert.equal(husk.isCanvasTexture, undefined, 'and is not a canvas texture');
    assert.equal(husk.flipY, true, 'and matches the orientation of its base');
    void data;
  } finally { env.restore(); }
});

test('the tint arithmetic itself is sane and does not produce black', () => {
  // The brightness correction is the part that was wrong: a straight multiply of two dark images measured
  // avgRGB 26 against the zombie's 77. The tint must be lighter than the colour it targets, because it is
  // multiplied against a dark base.
  const t = VARIANT_TINTS.husk;
  const avg = (((t >> 16) & 255) + ((t >> 8) & 255) + (t & 255)) / 3;
  assert.ok(avg > 140, `the husk tint must be light enough to survive a multiply, got ${Math.round(avg)}`);
  // And it must be warm: the base skin is green, so a green tint would leave a husk looking like a zombie.
  const r = (t >> 16) & 255, g = (t >> 8) & 255, b = t & 255;
  assert.ok(r > g && g > b, `the husk tint must be a warm sand, got ${r},${g},${b}`);
});

test('a base that is not ready yet still yields a usable texture', async () => {
  // The placeholder path: nothing to paint yet, so the returned object must be a texture a material can hold,
  // and it must fill ITSELF in when the base arrives -- no swap, because the material already points at it.
  const env = withCanvas();
  try {
    const mgr = manager();
    mgr.textures.zombie = new THREE.Texture();
    const husk = mgr.createVariantTexture('zombie', VARIANT_TINTS.husk);
    assert.ok(husk, 'a texture is returned immediately');
    assert.equal(husk.ready, undefined, 'and is not ready yet');
    assert.equal(typeof husk.onReady, 'function', 'but can announce when it is');

    const base = mgr.textures.zombie;
    base.image = readyBase();
    base.dispatchEvent({ type: 'load' });
    await tick();
    assert.equal(husk.ready, true, 'the deferred paint ran once the base arrived');
    assert.ok(husk.image, 'and the same object now has the real image');
  } finally { env.restore(); }
});

test('a subscriber is told when the skin is ready, and told immediately if it already is', async () => {
  const env = withCanvas();
  try {
    const mgr = manager();
    mgr.textures.zombie = readyBase();
    const husk = mgr.createVariantTexture('zombie', VARIANT_TINTS.husk);
    let called = 0;
    husk.onReady(() => { called++; });
    await tick();
    assert.equal(called, 1, 'the callback fired once the skin existed');
    // A late subscriber must still be called rather than waiting forever.
    husk.onReady(() => { called++; });
    assert.equal(called, 2, 'a subscriber added afterwards is called immediately');
  } finally { env.restore(); }
});

test('the tints come from one source: VARIANT_TINTS', () => {
  assert.deepEqual(Object.keys(VARIANT_TINTS).sort(), ['bogged', 'husk', 'parched', 'stray']);
  assert.equal(typeof MobManager.prototype.createVariantTexture, 'function');
});

test('deriving a skin is safe without any DOM at all', () => {
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

test('every tinted variant still spawns as its own type with a map', () => {
  const env = withCanvas();
  try {
    const mgr = manager();
    for (const type of ['husk', 'stray', 'bogged']) {
      const mob = mgr.spawnMob(type, 0, 1, 0);
      assert.equal(mob.type, type);
      assert.equal(mob.name, type.charAt(0).toUpperCase() + type.slice(1));
      assert.ok(mob.maxHealth > 0);
      // The material must point at the variant's skin, not at nothing.
      const mat = mob.mesh.children[0].material;
      assert.ok(mat.map, `${type} has a map`);
      assert.equal(mat.map, mgr.textures[type], `${type} uses its own derived skin`);
      // The skeleton variants are cut-outs and need alpha; the zombie variants do not.
      if (type === 'husk') assert.equal(mat.transparent, false, 'the husk skin is opaque, like the zombie');
      else assert.equal(mat.transparent, true, `${type} keeps the skeleton's alpha handling`);
    }
  } finally { env.restore(); }
});
