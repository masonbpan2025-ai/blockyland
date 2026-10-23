import * as THREE from 'three';

/**
 * Draw alpha-tested, double-sided materials in one pass.
 *
 * three.js draws a material that is `transparent` and `DoubleSide` twice, back faces and then front faces, and it
 * flips `side` and sets `needsUpdate` between the two (WebGLRenderer.renderObject). Each `needsUpdate` makes the
 * renderer look up the program again for that draw. Nearly every mob uses such a material (a skin texture with
 * `transparent: true, alphaTest: 0.5, side: DoubleSide`), so a field of animals cost hundreds of program lookups a
 * frame: measured, a third of the render time.
 *
 * The second pass only orders blending within one mesh. A material whose texels are either discarded by the alpha
 * test or drawn fully opaque blends nothing, so one pass draws the same picture. Translucent materials (opacity
 * below 1, or no alpha test) are left alone.
 */
export function isSinglePassSafe(material) {
  return !!material && material.transparent === true && material.side === THREE.DoubleSide
    && material.forceSinglePass !== true && material.alphaTest > 0 && material.opacity === 1;
}

/** Mark every safe material under `root`. Returns how many were changed. */
export function singlePassCutouts(root) {
  let changed = 0;
  root?.traverse?.((object) => {
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      if (!isSinglePassSafe(material)) continue;
      material.forceSinglePass = true;
      changed++;
    }
  });
  return changed;
}

/**
 * Keep a scene's cutout materials single-pass: anything added to the scene's root is marked when it arrives, and a
 * sweep once a second catches materials swapped in later (armour, a sheared sheep, a grown-up baby).
 *
 * @returns {(dt: number) => void} call every frame with the frame time
 */
export function keepCutoutsSinglePass(scene, intervalSeconds = 1) {
  scene.addEventListener('childadded', (event) => singlePassCutouts(event.child));
  let clock = 0;
  return (dt) => {
    clock += dt;
    if (clock < intervalSeconds) return;
    clock = 0;
    singlePassCutouts(scene);
  };
}
