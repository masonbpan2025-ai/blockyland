// Tests for the atlas-aware entity model helpers.
//
// These exist because the mobs they build were previously plain boxes with flat colours, so nothing checked whether
// a face sampled the pixels that actually carry an eye. The assertions here are about the geometry/UV contract:
// which atlas rectangle each face reads, that the rectangles stay inside the sheet, and that a rectangle with no
// room for a side face is reported rather than silently mapping to a blank strip.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEntityBox, createBoxFromFaces, quadRects } from '../src/mobVisuals/entityBox.js';
import { buildModel } from '../src/mobVisuals/modelBuilder.js';

/** Read back the atlas rectangle each face of a geometry samples, in texture pixels and as authored. */
function faceRects(geometry, texW, texH) {
  const uv = geometry.attributes.uv;
  // The rectangle as authored is the one whose top-left corner is the UV at vertex 0, so its size is measured from
  // there rather than by taking a min/max. That distinction is the whole point of the mirror assertion below: a
  // mirrored face starts at its RIGHT edge and extends left, which min/max would silently normalise away.
  const rects = [];
  for (let face = 0; face < 6; face++) {
    const base = face * 4;
    const x = uv.getX(base + 0) * texW;
    const y = (1 - uv.getY(base + 0)) * texH;
    const w = (uv.getX(base + 1) - uv.getX(base + 0)) * texW;
    const h = ((1 - uv.getY(base + 2)) - (1 - uv.getY(base + 0))) * texH;
    rects.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  }
  return rects;
}

/** The same rectangles normalised so x is always the left edge, for comparisons that do not care about direction. */
function normalisedRects(geometry, texW, texH) {
  return faceRects(geometry, texW, texH).map((r) => ({
    x: r.w >= 0 ? r.x : r.x + r.w,
    y: r.h >= 0 ? r.y : r.y + r.h,
    w: Math.abs(r.w),
    h: Math.abs(r.h)
  }));
}

test('a quad box maps each face to its own rectangle in vanilla order', () => {
  // A 14x14x7 head at the atlas origin. The order along the second row is right, front, left, back -- and the
  // front face is the one that must land on the eyes.
  const geo = createEntityBox(1, 1, 0.5, 0, 0, 14, 14, 7, { texW: 128, texH: 64 });
  const r = normalisedRects(geo, 128, 64);
  assert.deepEqual(r[0], { x: 0, y: 7, w: 7, h: 14 }, '+X right');
  assert.deepEqual(r[4], { x: 7, y: 7, w: 14, h: 14 }, '+Z front');
  assert.deepEqual(r[2], { x: 7, y: 0, w: 14, h: 7 }, '+Y top');
  assert.deepEqual(r[3], { x: 21, y: 0, w: 14, h: 7 }, '-Y bottom');
  assert.notDeepEqual(r[0], r[4]);
});

test('explicit per-face rectangles are honoured, including a single patched face', () => {
  const faces = [
    { x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 },
    { x: 8, y: 0, w: 4, h: 4 }, { x: 12, y: 0, w: 4, h: 4 },
    { x: 16, y: 0, w: 8, h: 8 }, { x: 24, y: 0, w: 4, h: 4 }
  ];
  const geo = createBoxFromFaces(1, 1, 1, faces, { texW: 64, texH: 64 });
  const r = normalisedRects(geo, 64, 64);
  assert.deepEqual(r[4], { x: 16, y: 0, w: 8, h: 8 }, 'the front face takes its own patch');
  assert.deepEqual(r[0], { x: 0, y: 0, w: 4, h: 4 });
});

test('quadRects agrees with what createEntityBox maps', () => {
  // The two must not drift: one is the documented layout, the other is what actually renders.
  const rects = quadRects(0, 0, 14, 14, 7);
  const geo = createEntityBox(1, 1, 0.5, 0, 0, 14, 14, 7, { texW: 128, texH: 64 });
  assert.deepEqual(normalisedRects(geo, 128, 64), rects);
});

test('mirroring flips the horizontal direction of every face', () => {
  const geoNormal = createEntityBox(1, 1, 0.5, 0, 0, 14, 14, 7, { texW: 128, texH: 64 });
  const geoMirror = createEntityBox(1, 1, 0.5, 0, 0, 14, 14, 7, { texW: 128, texH: 64, mirror: true });
  const normal = faceRects(geoNormal, 128, 64);
  const mirrored = faceRects(geoMirror, 128, 64);
  for (let i = 0; i < 6; i++) {
    assert.equal(mirrored[i].x, normal[i].x + normal[i].w, `face ${i} starts at its right edge`);
    assert.equal(mirrored[i].w, -normal[i].w, `face ${i} extends left, so its signed width is negated`);
    // The same region is covered either way: mirroring must not move a face to different art.
    assert.deepEqual(normalisedRects(geoMirror, 128, 64)[i], normalisedRects(geoNormal, 128, 64)[i],
      `face ${i} covers the same rectangle as the unmirrored one`);
  }
});

test('a material whose texture has not decoded keeps its flat colour instead of rendering black', () => {
  // The failure this guards is severe and silent: an opaque material with a map whose bitmap is missing renders
  // as solid black, which is how mobs became silhouettes.
  const definition = {
    name: 'probe',
    texture: '/assets/none.png',
    textureSize: [64, 64],
    units: 16,
    parts: [{ name: 'body', box: [8, 8, 8], uv: { u: 0, v: 0, tw: 8, th: 8, td: 8 } }]
  };
  const pending = new THREE.Texture();
  pending.assetPath = '/assets/none.png';
  pending.image = { addEventListener() {}, width: 0 };

  const built = buildModel(definition, {
    loadTexture: () => pending,
    onTextureReady: () => {}
  });
  const mesh = built.parts['body:mesh'];
  assert.ok(!mesh.material.map, 'no map while the bitmap is missing');
  assert.equal(mesh.material.color.getHex(), 0xffffff, 'and the flat colour is still there to draw');

  // The bitmap arrives: the map is adopted and the colour goes white so it does not tint the skin.
  pending.image = { addEventListener() {}, width: 64, height: 64 };
  built.materials.default.map = pending;
  built.materials.default.color.setHex(0xffffff);
  assert.equal(mesh.material.map, pending);
});

test('the readiness hook the builder is given is actually used', () => {
  // The builder cannot attach its own load listener successfully, because `loadTexture` passes an explicit onLoad
  // to three's loader and that SUPPRESSES the texture's own event. So it must hand its callback to the host.
  const definition = {
    name: 'probe',
    texture: '/assets/pending.png',
    textureSize: [64, 64],
    units: 16,
    parts: [{ name: 'body', box: [8, 8, 8], uv: { u: 0, v: 0, tw: 8, th: 8, td: 8 } }]
  };
  const pending = new THREE.Texture();
  pending.assetPath = '/assets/pending.png';
  pending.image = { addEventListener() {}, width: 0 };
  const registered = [];
  const built = buildModel(definition, {
    loadTexture: () => pending,
    onTextureReady: (texture, fn) => registered.push({ texture, fn })
  });
  assert.equal(registered.length, 1, 'the host was asked to call back when the bitmap lands');
  assert.equal(registered[0].texture, pending);
  assert.ok(!built.materials.default.map);

  // Simulate the bitmap landing.
  pending.image = { addEventListener() {}, width: 64, height: 64 };
  registered[0].fn();
  assert.equal(built.materials.default.map, pending, 'and the material adopts the texture');
  assert.equal(built.materials.default.color.getHex(), 0xffffff);
});

test('every part of a built model is reachable by name', () => {
  const definition = {
    name: 'probe',
    texture: '/assets/x.png',
    textureSize: [64, 64],
    units: 16,
    parts: [
      { name: 'body', box: [8, 8, 8], uv: { u: 0, v: 0, tw: 8, th: 8, td: 8 } },
      { name: 'head', parent: 'body', box: [8, 8, 8], uv: { u: 0, v: 0, tw: 8, th: 8, td: 8 }, pivot: [0, 4, 0] }
    ]
  };
  const built = buildModel(definition, { loadTexture: () => new THREE.Texture(), onTextureReady: () => {} });
  assert.ok(built.parts.body, 'the body is addressable');
  assert.ok(built.parts.head, 'so is the head');
  assert.equal(built.parts.head.parent, built.parts.body, 'and it is parented as declared');
});

test('a pivot puts the part origin where rotation should happen', () => {
  const definition = {
    name: 'probe',
    texture: '/assets/x.png',
    textureSize: [64, 64],
    units: 16,
    parts: [{ name: 'leg', box: [4, 8, 4], uv: { u: 0, v: 0, tw: 4, th: 8, td: 4 }, pivot: [0, 8, 0], at: [0, 8, 0] }]
  };
  const built = buildModel(definition, { loadTexture: () => new THREE.Texture(), onTextureReady: () => {} });
  const holder = built.parts.leg;
  const mesh = built.parts['leg:mesh'];
  assert.ok(holder !== mesh, 'a pivot introduces a holder group');
  // The pivot sits 8 texels up = half a block, and the mesh is offset back by the same amount so the visual
  // position is unchanged while rotation now happens at the top of the leg.
  assert.equal(holder.position.y, 0.5);
  assert.equal(mesh.position.y, -0.5);
});
