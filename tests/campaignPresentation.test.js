import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SightMask} from '../src/engine/sightMask.js';
import {SceneDefinitionView} from '../src/engine/sceneDefinitionView.js';
import {createPresentationGraph} from '../src/engine/presentationGraph.js';

test('Sight has a soft boundary and follows the union of living heroes',()=>{
  const mask=new SightMask(4);mask.update([{x:0,z:0,sight:16,hp:180}]);
  assert.equal(mask.amount(0,0),1);assert.equal(mask.amount(12,0),1);assert.equal(mask.amount(14,0),.5);assert.equal(mask.amount(16,0),0);
  mask.update([{x:0,z:0,sight:16,hp:180},{x:30,z:0,sight:20,hp:180}]);
  assert.equal(mask.amount(30,0),1);assert.equal(mask.amount(47,0)>.1,true);
  mask.update([{x:0,z:0,sight:16,hp:180},{x:30,z:0,sight:20,hp:0}]);assert.equal(mask.amount(30,0),0);
});

test('Scene definitions retain casting/receiving shadows and unlit effect materials',()=>{
  const graph=createPresentationGraph(),T=graph.api,root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:0x123456,roughness:.88,metalness:.04}));
  mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  const ring=new T.Mesh(new T.RingGeometry(0,1,32),new T.MeshBasicMaterial({color:0x07101a,transparent:true,opacity:.3,depthWrite:false}));root.add(ring);
  const scene=new THREE.Scene(),mask=new SightMask(),view=new SceneDefinitionView(scene,20,m=>mask.patch(m.material));
  view.apply(graph.snapshot(root));const actor=view.nodes.get(mesh.id),shadow=view.nodes.get(ring.id),material=actor.material;
  assert.equal(actor.castShadow,true);assert.equal(actor.receiveShadow,true);assert.equal(material.roughness,.88);
  assert.equal(shadow.material.isMeshBasicMaterial,true);
  view.apply(graph.snapshot(root));assert.equal(actor.material,material,'Transform frames must not recreate materials');
  view.dispose();assert.equal(scene.children.length,0);
});
