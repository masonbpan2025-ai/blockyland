import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TextureManager } from '../src/textures.js';
import { resourcePackManager } from '../src/resourcePackManager.js';
import { configureAtlasTexture, filterAtlasMaterial } from '../src/atlasFiltering.js';

function cleanListeners(t) {
  const previous = new Set(resourcePackManager.listeners);
  t.after(() => { for (const listener of resourcePackManager.listeners) if (!previous.has(listener)) resourcePackManager.listeners.delete(listener); });
}

test('all world atlas materials get mip filtering without losing existing shader effects', async t => {
  cleanListeners(t);
  const tm = new TextureManager();
  await tm.init();
  assert.equal(tm.atlasTexture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(tm.atlasTexture.magFilter, THREE.NearestFilter);
  assert.equal(tm.atlasTexture.generateMipmaps, true);
  for (const material of [tm.opaqueMaterial, tm.transparentMaterial, tm.cutoutMaterial, tm.lightMaterial, tm.lightDistanceMaterial]) {
    assert.equal(material.map, tm.atlasTexture);
    const shader = {
      vertexShader: 'void main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <map_pars_fragment>\nvoid main() {\n#include <map_fragment>\n#include <opaque_fragment>\n}',
      uniforms: {}
    };
    material.onBeforeCompile(shader, {});
    assert.match(shader.fragmentShader, /sampleBlockAtlas\( vMapUv \)/);
    assert.equal(shader.uniforms.blockAtlasMaxMip.value, Math.log2(tm.tileSize));
    if (material !== tm.lightDistanceMaterial) assert.match(shader.fragmentShader, /vBlockEmission/);
    else assert.match(shader.fragmentShader, /distance\(vLightOrigin, referencePosition\)/);
  }
});

test('a 64x to 16x pack change replaces every material map and refreshes sampling dimensions', async t => {
  cleanListeners(t);
  await resourcePackManager.resetToDefault();
  const tm = new TextureManager();
  await tm.init();
  const previous = tm.atlasTexture;
  const compiled = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '#include <map_pars_fragment>\n#include <map_fragment>' };
  tm.opaqueMaterial.onBeforeCompile(compiled, {});
  assert.equal(compiled.uniforms.blockAtlasMaxMip.value, 6);
  let disposed = false;
  previous.addEventListener('dispose', () => { disposed = true; });
  try {
    await resourcePackManager.reorderPacks([]);
    await tm.rebuildAtlas();
    assert.equal(disposed, true);
    assert.notEqual(tm.atlasTexture, previous);
    assert.equal(tm.atlasTexture.generateMipmaps, true);
    assert.deepEqual(compiled.uniforms.blockAtlasSize.value.toArray(), [512, 512], 'already-compiled shaders receive resized atlas dimensions');
    assert.equal(compiled.uniforms.blockAtlasMaxMip.value, 4, 'cached programs receive the new mip limit without recompiling');
    for (const material of [tm.opaqueMaterial, tm.transparentMaterial, tm.cutoutMaterial, tm.lightMaterial, tm.lightDistanceMaterial]) {
      assert.equal(material.map, tm.atlasTexture);
      const shader = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: '#include <map_pars_fragment>\n#include <map_fragment>\nvoid main() {}' };
      material.onBeforeCompile(shader, {});
      assert.deepEqual(shader.uniforms.blockAtlasSize.value.toArray(), [512, 512]);
      assert.equal(shader.uniforms.blockAtlasMaxMip.value, 4);
    }
    const current = tm.atlasTexture, version = current.version;
    await tm.rebuildAtlas();
    assert.equal(tm.atlasTexture, current, 'same-size reload reuses its texture');
    assert.ok(current.version > version, 'same-size reload uploads pixels and regenerates mips');
  } finally { await resourcePackManager.resetToDefault(); }
});

test('tile-aware filtering composes custom material hooks and keeps shader cache identities distinct', () => {
  const manager = { atlasCanvas: { width: 2048, height: 2048 }, tileSize: 64, atlasGridSize: 32 };
  const material = new THREE.MeshBasicMaterial();
  material.onBeforeCompile = shader => { shader.uniforms.existing = { value: 7 }; };
  material.customProgramCacheKey = () => 'existing-effect';
  filterAtlasMaterial(material, manager);
  const shader = { uniforms: {}, fragmentShader: '#include <map_pars_fragment>\n#include <map_fragment>' };
  material.onBeforeCompile(shader, {});
  assert.equal(shader.uniforms.existing.value, 7);
  assert.match(material.customProgramCacheKey(), /^existing-effect\|/);
  const texture = configureAtlasTexture(new THREE.Texture());
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
});
