import * as THREE from 'three';
// All scene definitions are interpreted here; gameplay packages do not allocate a renderer.
export class SceneDefinitionView {
  constructor(scene, offset=0,configureMesh=null){this.configureMesh=configureMesh;this.root=new THREE.Group();this.root.position.y=offset;scene.add(this.root);this.scene=scene;this.nodes=new Map();this.geometryKeys=new Map();}
  apply(definitions, removed=[], reset=false){
    if(reset)this.clear();for(const id of removed)this.remove(id);
    for(const def of definitions){
      let object=this.nodes.get(def.id);
      const key=JSON.stringify(def.geometry??null);
      if(!object||this.geometryKeys.get(def.id)!==key){this.remove(def.id);
        if(def.geometry){const g=def.geometry;
          if(!['box','ring'].includes(g.type))throw new Error(`Unsupported geometry ${g.type}`);
          const geometry=g.type==='box'?new THREE.BoxGeometry(...g.parameters):new THREE.RingGeometry(...g.parameters);
          geometry.translate(...g.offset);const Material=def.material?.kind==='basic'?THREE.MeshBasicMaterial:THREE.MeshStandardMaterial;object=new THREE.Mesh(geometry,new Material());this.configureMesh?.(object);
        }else object=new THREE.Group();
        this.nodes.set(def.id,object);this.geometryKeys.set(def.id,key);
      }
      object.position.fromArray(def.p);object.rotation.set(...def.r);object.scale.fromArray(def.s);object.visible=def.v;
      object.castShadow=def.castShadow??false;object.receiveShadow=def.receiveShadow??false;
      if(def.material){const m=def.material;
        if((m.kind==='basic')!==Boolean(object.material.isMeshBasicMaterial)){object.material.dispose();object.material=m.kind==='basic'?new THREE.MeshBasicMaterial():new THREE.MeshStandardMaterial();this.configureMesh?.(object);}
        if(object.material.isMeshStandardMaterial){object.material.roughness=m.roughness??.88;object.material.metalness=m.metalness??.04;}object.material.color.setHex(m.color);object.material.emissive?.setHex(m.emissive);object.material.emissiveIntensity=m.emissiveIntensity;
        object.material.opacity=m.opacity;object.material.transparent=m.transparent;object.material.depthWrite=m.depthWrite;object.material.side=m.side;object.material.blending=m.blending;}
    }
    for(const def of definitions){const object=this.nodes.get(def.id),parent=this.nodes.get(def.parent)||this.root;if(object.parent!==parent)parent.add(object);}
  }
  remove(id){const object=this.nodes.get(id);if(!object)return;object.removeFromParent();object.geometry?.dispose();object.material?.dispose();this.nodes.delete(id);this.geometryKeys.delete(id);}
  clear(){for(const id of [...this.nodes.keys()])this.remove(id);}
  dispose(){this.clear();this.root.removeFromParent();}
}
