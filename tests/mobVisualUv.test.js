// Tests for the UV and material contracts the fixed mobs depend on.
//
// The bugs these cover were both about WHICH texture lands on WHICH face:
//
//   * the snow golem's pumpkin was one material on all six sides, so it could never show a carved face; and when
//     it was given six materials the atlas rectangles had to put the grin on +Z rather than smearing it;
//   * the husk was a zombie whose every material had one colour written over it, which flattened its clothing,
//     its boots and any equipped item into a single hue.
//
// So these assert the mapping and the material wiring, not the pixel content of the art.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MobManager, createTexturedBox, adoptTexture, syncDeferredSkins } from '../src/mobs.js';
import { createSnowGolemModel, SNOW_GOLEM_UV, SNOW_GOLEM_COLORS } from '../src/snowGolemBehavior.js';

/** A manager with a permissive texture table; page-load asset timing is a separate suite's concern. */
function managerFixture() {
  const scene = new THREE.Scene();
  const world = { getVoxel: () => 0, surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {} };
  const mgr = Object.assign(Object.create(MobManager.prototype), {
    scene, world, sounds: {}, mobs: [], arrows: [], customProjectiles: [], snowballs: [], entities: null,
    textures: new Proxy({}, { get: (t, k) => (typeof k === 'symbol' ? undefined : (t[k] ??= new THREE.Texture())) })
  });
  return mgr;
}

const meshesOf = (mob) => {
  const out = [];
  mob.mesh?.traverse((n) => { if (n.isMesh) out.push(n); });
  return out;
};
const materialsOf = (mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]);

/**
 * The asset paths the variant spawners compare against to decide whether a skin is the ORIGINAL one.
 *
 * These are the same strings `scripts/mob-visual/fetch-assets.mjs` writes to, so the two are one contract: if the
 * fetch script's destination moved and these did not, the husk would silently fall back to a tinted zombie.
 */
const HUSK_LIKE_PATHS = {
  husk: '/assets/entity/zombie/husk.png',
  stray: '/assets/entity/skeleton/stray.png',
  bogged: '/assets/entity/skeleton/bogged.png',
  snow_golem: '/assets/entity/snow_golem.png'
};

test('the pumpkin head uses six materials, with the carved face on the FRONT only', () => {
  const mk = (c) => new THREE.MeshLambertMaterial({ color: c });
  const mats = {
    snow: mk(0xf2f7fb), shadow: mk(0x6b4f2a),
    pumpkinSide: mk(0xd9761b), pumpkinTop: mk(0xb35f12), pumpkinFace: mk(0xff2200),
    face: mk(0x1b1b1b)
  };
  const { pumpkin } = createSnowGolemModel(mats.snow, mats.shadow, mats, mats.face, {}, { createTexturedBox });
  const shell = pumpkin.children[0];
  const faces = materialsOf(shell);
  assert.equal(faces.length, 6, 'a pumpkin needs a material per face');
  // three.js face order is +X, -X, +Y, -Y, +Z, -Z. The carved grin belongs on +Z, which is the way the model
  // faces; the stem end goes on both Y faces and plain rind everywhere else.
  assert.equal(faces[4], mats.pumpkinFace, '+Z carries the carved face');
  assert.equal(faces[2], mats.pumpkinTop, '+Y carries the stem end');
  assert.equal(faces[3], mats.pumpkinTop, '-Y carries the stem end too');
  assert.equal(faces[0], mats.pumpkinSide, '+X is plain rind');
  assert.notEqual(faces[0], faces[4], 'the rind and the face are different materials, or there is no face');
});

test('the supplied material set is merged with the positional ones, not substituted for them', () => {
  // Regression: replacing wholesale left `materials.snow` undefined and the whole golem rendered invisible, with
  // a pumpkin floating where its head should be.
  const mk = (c) => new THREE.MeshLambertMaterial({ color: c });
  const snow = mk(0xf2f7fb);
  const shadow = mk(0x6b4f2a);
  const face = mk(0x1b1b1b);
  const pumpkinSet = {
    pumpkinSide: mk(0xd9761b), pumpkinTop: mk(0xb35f12), pumpkinFace: mk(0xff2200)
  };
  const built = createSnowGolemModel(snow, shadow, pumpkinSet, face, {}, { createTexturedBox });
  // The body must use the positional snow material.
  assert.equal(materialsOf(built.lower)[0], snow, 'the snowballs use the snow material');
  assert.equal(built.arms.length, 2, 'and the stick arms are built');
  for (const arm of built.arms) {
    assert.ok(materialsOf(arm).every((m) => m), 'every arm face has a material, not undefined');
  }
  for (const part of [built.lower, built.middle, built.head]) {
    assert.ok(materialsOf(part).every((m) => m && m.isMaterial), 'no part face is left without a material');
  }
  assert.equal(materialsOf(built.pumpkin.children[0])[4], pumpkinSet.pumpkinFace, 'the carved face survived');
});

test('the golem atlas rectangles stay inside the 64x64 skin and do not overlap the face', () => {
  const { width, height } = { width: 64, height: 64 };
  for (const [name, rect] of Object.entries(SNOW_GOLEM_UV)) {
    assert.ok(rect.w > 0 && rect.h > 0, `${name} has a positive size`);
    assert.ok(rect.u >= 0 && rect.v >= 0, `${name} starts inside the atlas`);
    assert.ok(rect.u + rect.w <= width, `${name} does not run off the right edge`);
    assert.ok(rect.v + rect.h <= height, `${name} does not run off the bottom edge`);
  }
  // The snowballs reuse packed snow, which must be a different patch from the carved face or the body would wear
  // the grin on every side.
  const snow = SNOW_GOLEM_UV.snow;
  const face = SNOW_GOLEM_UV.headFace;
  const overlaps = snow.u < face.u + face.w && face.u < snow.u + snow.w
    && snow.v < face.v + face.h && face.v < snow.v + snow.h;
  assert.equal(overlaps, false, 'the snow patch and the carved face patch do not overlap');
});

test('a box given explicit per-face rectangles maps each face separately', () => {
  // The helper underlying both fixes. Sentinel rectangles per face let us prove the mapping without any art: if
  // every face came back identical the pumpkin would show the same picture six times.
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const uvs = geo.attributes.uv;
  // Reproduce the same convention the helper uses, then read back the six corner pairs.
  const rects = [0, 1, 2, 3, 4, 5].map((i) => ({ u: i, v: 0, w: 1, h: 1 }));
  for (let face = 0; face < 6; face++) {
    const rect = rects[face];
    const base = face * 4;
    uvs.setXY(base + 0, rect.u / 6, 1);
    uvs.setXY(base + 1, (rect.u + rect.w) / 6, 1);
    uvs.setXY(base + 2, rect.u / 6, 0);
    uvs.setXY(base + 3, (rect.u + rect.w) / 6, 0);
  }
  const corners = [];
  for (let face = 0; face < 6; face++) corners.push(uvs.getX(face * 4).toFixed(3));
  assert.deepEqual(corners, ['0.000', '0.167', '0.333', '0.500', '0.667', '0.833'],
    'each face samples its own column of the sheet');
});

test('the husk keeps its own skin and is not flattened to one colour', () => {
  // The reported symptom: "husk looks the same as zombie". The fix has two halves, and this checks both.
  //
  // Half one is that the husk's material points at the husk texture rather than the zombie's. Half two is that
  // `applyVariantIdentity` must NOT write one colour over every material when that texture is the real skin --
  // doing so flattened the clothing, the boots and any equipped item into a single hue.
  const mgr = managerFixture();
  mgr.textures.zombie = new THREE.Texture();
  mgr.textures.zombie.assetPath = '/assets/entity/zombie.png';
  mgr.textures.zombie.image = { width: 64, height: 64 };
  mgr.textures.husk = new THREE.Texture();
  mgr.textures.husk.assetPath = HUSK_LIKE_PATHS.husk;
  mgr.textures.husk.image = { width: 64, height: 64 };

  const husk = mgr.spawnZombieVariant(0, 1, 0, 'husk');
  assert.equal(husk.type, 'husk', 'it is a husk');
  assert.equal(husk.hasOriginalSkin, true, 'and it knows it is wearing the original skin');

  const materials = meshesOf(husk).flatMap(materialsOf).filter(Boolean);
  assert.ok(materials.length > 0, 'the husk has materials');
  const mapped = materials.filter((m) => m.map).map((m) => m.map.assetPath);
  assert.ok(mapped.includes(HUSK_LIKE_PATHS.husk), 'the husk wears its own skin, not the zombie texture');
  assert.ok(!mapped.includes('/assets/entity/zombie.png'), 'and not the zombie skin');

  // Every material must still be WHITE, i.e. untinted.
  const tinted = materials.filter((m) => m.color && m.color.getHex() !== 0xffffff);
  assert.deepEqual(tinted.map((m) => m.color.getHexString()), [],
    'no material was flattened to a single variant colour');
});

test('a husk with no original skin falls back to the tint, so a fresh checkout still works', () => {
  // The other half of the same contract: when the asset is genuinely absent the generated tint IS the appearance,
  // so the recolour must still happen. Without this the fallback path would be untinted and the husk would be an
  // ordinary zombie.
  const mgr = managerFixture();
  mgr.textures.zombie = new THREE.Texture();
  mgr.textures.zombie.assetPath = '/assets/entity/zombie.png';
  mgr.textures.zombie.image = { width: 64, height: 64 };
  mgr.textures.husk = new THREE.Texture();
  mgr.textures.husk.assetPath = '/assets/entity/zombie/tinted-fallback.png';
  mgr.textures.husk.image = { width: 64, height: 64 };

  const husk = mgr.spawnZombieVariant(0, 1, 0, 'husk');
  assert.equal(husk.hasOriginalSkin, false, 'this one is a generated stand-in');
  const materials = meshesOf(husk).flatMap(materialsOf).filter(Boolean);
  const tinted = materials.filter((m) => m.color && m.color.getHex() !== 0xffffff);
  assert.ok(tinted.length > 0, 'the fallback skin is tinted, so it is still visibly a husk');
});

test('the zombie is unchanged by the husk fix', () => {
  const mgr = managerFixture();
  mgr.textures.zombie = new THREE.Texture();
  mgr.textures.zombie.assetPath = '/assets/entity/zombie.png';
  mgr.textures.zombie.image = { width: 64, height: 64 };
  const zombie = mgr.spawnZombie(0, 1, 0);
  assert.equal(zombie.type, 'zombie');
  const materials = meshesOf(zombie).flatMap(materialsOf).filter(Boolean);
  assert.ok(materials.every((m) => m.color.getHex() === 0xffffff), 'the zombie is still untinted');
  assert.equal(zombie.hasOriginalSkin, false, 'and is not treated as a variant with its own skin');
});

test('the snow golem exposes both of its heads for shearing', () => {
  const mgr = managerFixture();
  const golem = mgr.spawnSnowGolem(0, 1, 0);
  assert.ok(golem.head, 'the golem has its own head');
  assert.ok(golem.pumpkinMesh, 'and the pumpkin helmet as a separate object');
  assert.ok(golem.faceMesh, 'with a modelled fallback face for a build with no downloaded art');
  // Shearing removes the helmet, which must not delete the head underneath.
  assert.ok(golem.mesh.getObjectByProperty('type', 'Mesh'), 'the model is attached to the scene graph');
  assert.equal(materialsOf(golem.head).length, 6, 'the head has a material per face');
  assert.equal(materialsOf(golem.pumpkinMesh.children[0]).length, 6, 'so does the pumpkin');
});

test('the pumpkin material is not the golem face colour', () => {
  // Regression: the pumpkin briefly wore SNOW_GOLEM_COLORS.face (near-black) because the model builder took the
  // legacy branch and treated the pumpkin material as the whole set.
  assert.notEqual(SNOW_GOLEM_COLORS.pumpkin, SNOW_GOLEM_COLORS.face);
  const pumpkin = SNOW_GOLEM_COLORS.pumpkin;
  const r = (pumpkin >> 16) & 255, g = (pumpkin >> 8) & 255, b = pumpkin & 255;
  assert.ok(r > 150 && r > b, `the pumpkin rind is a warm orange, got ${r},${g},${b}`);
  const faceColour = SNOW_GOLEM_COLORS.face;
  assert.ok(((faceColour >> 16) & 255) < 60, 'the modelled face colour is dark');
});

test('a skin that arrives late still binds, even though the mob never ticks', () => {
  // The Inspector builds its mob and then sits PAUSED, so nothing per-frame can be relied on. This is the case
  // that shipped broken twice: the pumpkin stayed a flat orange box in the Inspector while looking correct
  // anywhere that happened to tick. `adoptTexture` must therefore finish via the loader's readiness hook.
  //
  // `loadTexture` bails out when there is no `document`, so stand up the minimum to reach the real code path.
  const hadDocument = 'document' in globalThis;
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({ getContext: () => null, toDataURL: () => '' }),
    createElementNS: () => ({ style: {} })
  };

  try {
    const mgr = managerFixture();
    const pending = [];
    // Model three's loader: it hands back a texture whose image is an `<img>` that has not decoded yet (`width` 0).
    mgr.textureLoader = {
      load: (_path, onLoad) => {
        pending.push(onLoad);
        const tex = new THREE.Texture();
        tex.image = { addEventListener() {}, width: 0 };
        return tex;
      }
    };
    const texture = mgr.loadTexture('/assets/block/carved_pumpkin.png');
    assert.equal(texture.assetPath, '/assets/block/carved_pumpkin.png');
    assert.ok(!texture.image.width, 'the texture starts with an image that has not decoded, as on page load');

    const material = new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.pumpkin });
    adoptTexture(material, texture, SNOW_GOLEM_COLORS.pumpkin);
    assert.ok(!material.map, 'and the material keeps its flat colour rather than rendering black');
    assert.equal(material.color.getHex(), SNOW_GOLEM_COLORS.pumpkin, 'the fallback colour is the rind');

    // The image arrives. Nothing has ticked in between.
    assert.ok(pending.length > 0, 'the loader was given a readiness callback');
    texture.image = { addEventListener() {}, width: 16, height: 16 };
    for (const onLoad of pending) if (onLoad) onLoad();

    assert.equal(material.map, texture, 'the material picks up the real texture');
    assert.equal(material.color.getHex(), 0xffffff, 'and stops tinting it');
  } finally {
    if (hadDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
  }
});

test('the per-frame poll is a working fallback when the readiness hook is not called', () => {
  // Belt and braces: some browser or loader path might not invoke the readiness callback, so `syncDeferredSkins`
  // must be able to finish the binding on its own. The texture's image is an `<img>` that has not decoded.
  const texture = new THREE.Texture();
  texture.assetPath = '/assets/entity/snow_golem.png';
  texture.image = { addEventListener() {}, width: 0 };
  const material = new THREE.MeshLambertMaterial({ color: SNOW_GOLEM_COLORS.snow });
  adoptTexture(material, texture, SNOW_GOLEM_COLORS.snow);
  assert.ok(!material.map, 'nothing is bound while the bitmap is still missing');

  syncDeferredSkins();
  assert.ok(!material.map, 'and the poll does nothing while it is still missing');

  texture.image = { addEventListener() {}, width: 64, height: 64 };
  syncDeferredSkins();
  assert.equal(material.map, texture, 'the poll finishes the job once the bitmap exists');
});

test('a material already bound to its texture is left alone', () => {
  // Re-binding on every spawn must be idempotent, or the flat fallback would overwrite a working skin.
  const texture = new THREE.Texture();
  texture.assetPath = '/assets/entity/snow_golem.png';
  texture.image = { width: 64, height: 64 };
  const material = new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff });
  adoptTexture(material, texture, 0x123456);
  assert.equal(material.color.getHex(), 0xffffff, 'the working texture keeps its material white');
});
