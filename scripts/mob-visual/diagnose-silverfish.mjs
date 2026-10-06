// Report the silverfish's computed centring values directly, so the arithmetic can be checked rather than inferred.
import * as THREE from 'three';
import { createSilverfishModel } from '../../src/silverfishBehavior.js';

const texture = new THREE.Texture();
texture.assetPath = '/assets/entity/silverfish.png';

for (const loadTexture of [undefined, () => texture]) {
  const model = createSilverfishModel(new THREE.MeshLambertMaterial(), new THREE.MeshBasicMaterial(),
    loadTexture ? { loadTexture, onTextureReady: () => {} } : {});
  const root = new THREE.Group();
  root.add(model.group);
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const body = model.group.children[0];
  console.log(`  loadTexture=${Boolean(loadTexture)}  body.position=(${body.position.x.toFixed(2)},${body.position.y.toFixed(2)},${body.position.z.toFixed(2)})`
    + `  bounds y=[${bounds.min.y.toFixed(2)}, ${bounds.max.y.toFixed(2)}]`
    + `  legs=${model.legs.length}`
    + `  leg0 world y=${model.legs[0]?.mesh.getWorldPosition(new THREE.Vector3()).y.toFixed(2) ?? 'n/a'}`);
}
