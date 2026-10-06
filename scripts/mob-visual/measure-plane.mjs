// Measure what the builder's `plane` actually produces, instead of reasoning about it.
//
// Every plane orientation in this project has been chosen by eye, and two came out wrong. This prints the geometry's
// bounding box after construction, which says unambiguously which world axes the panel spans.
import * as THREE from 'three';
import { buildModel } from '../../src/mobVisuals/modelBuilder.js';

const cases = [
  { label: 'bat wing  [7, 2]  (vanilla 0 x 5 x 8)', plane: [7, 2], at: [0, 0, 0] },
  { label: 'bat ear   [5, 3]  (vanilla 3 x 5 x 0)', plane: [5, 3], at: [0, 0, 0] },
  { label: 'frog layer[9, 7]  (vanilla 7 x 0 x 9)', plane: [9, 7], at: [0, 0, 0], rotate: [-Math.PI / 2, 0, 0] },
  { label: 'frog tongue[7,4]  (vanilla 4 x 0 x 7)', plane: [7, 4], at: [0, 0, 0], rotate: [-Math.PI / 2, 0, 0] }
];

for (const c of cases) {
  const def = {
    textureSize: [64, 64],
    parts: [{ name: 'p', plane: c.plane, uv: { u: 0, v: 0, tw: c.plane[0], th: c.plane[1] }, at: c.at, rotate: c.rotate }]
  };
  const built = buildModel(def, {
    materials: { default: new THREE.MeshLambertMaterial() },
    textureContext: { texW: 64, texH: 64 }
  });
  built.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(built.group);
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log(`  ${c.label.padEnd(40)} spans x=${size.x.toFixed(3)} y=${size.y.toFixed(3)} z=${size.z.toFixed(3)}`);
}
