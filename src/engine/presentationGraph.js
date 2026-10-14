// Serializable scene definitions. These are data handles, never GPU meshes or browser objects.
import { Vector2, Vector3, Euler, Color } from 'three';

export function createPresentationGraph() {
  let nextId = 1;
  class Node {
    constructor() { this.id = nextId++; this.children = []; this.parent = null; this.position = new Vector3(); this.rotation = new Euler(); this.scale = new Vector3(1,1,1); this.visible = true; this.userData = {}; }
    add(...nodes) { for (const node of nodes) { node.parent?.remove(node); node.parent = this; this.children.push(node); } return this; }
    remove(...nodes) { for (const node of nodes) { const i=this.children.indexOf(node); if(i>=0) {this.children.splice(i,1);node.parent=null;} } }
    clear() { this.remove(...this.children); }
    traverse(callback) { callback(this); for(const node of this.children) node.traverse(callback); }
  }
  class Geometry {
    constructor(type, ...parameters) { this.type=type;this.parameters=parameters;this.offset=[0,0,0]; }
    clone() { const g=new Geometry(this.type,...this.parameters);g.offset=[...this.offset];return g; }
    translate(x,y,z) { this.offset=[x,y,z]; return this; }
    dispose() {}
  }
  class Material {
    constructor(options={}) { Object.assign(this,options);this.color=new Color(options.color??0xffffff);this.emissive=new Color(options.emissive??0);this.opacity=options.opacity??1; }
    dispose() {}
  }
  class Shape extends Node { constructor(geometry,material) {super();this.geometry=geometry;this.material=material;} }
  const api={Group:Node,Scene:Node,Object3D:Node,Mesh:Shape,Vector2,Vector3,Color,
    BoxGeometry:class extends Geometry {constructor(...p){super('box',...p);}},
    RingGeometry:class extends Geometry {constructor(...p){super('ring',...p);}},
    MeshBasicMaterial:class extends Material{constructor(o){super(o);this.kind='basic';}},MeshStandardMaterial:class extends Material{constructor(o){super(o);this.kind='standard';}},DoubleSide:2,AdditiveBlending:2};
  function snapshot(root) {
    const nodes=[];
    root?.traverse(node => nodes.push({id:node.id,parent:node.parent?.id??null,
      p:node.position.toArray(),r:[node.rotation.x,node.rotation.y,node.rotation.z],s:node.scale.toArray(),v:node.visible,
      ...(node.geometry?{castShadow:node.castShadow??false,receiveShadow:node.receiveShadow??false,geometry:{type:node.geometry.type,parameters:node.geometry.parameters,offset:node.geometry.offset},
        material:{color:node.material.color.getHex(),emissive:node.material.emissive.getHex(),emissiveIntensity:node.material.emissiveIntensity??0,
          kind:node.material.kind??'standard',roughness:node.material.roughness??.88,metalness:node.material.metalness??.04,opacity:node.material.opacity,transparent:node.material.transparent??false,depthWrite:node.material.depthWrite??true,
          side:node.material.side??0,blending:node.material.blending??1}}:{})}));
    return nodes;
  }
  return { api, snapshot };
}

export function createUiState() {
  const elements=new Map();
  const get=id=>{if(!elements.has(id))elements.set(id,{textContent:null,hidden:null,style:{},attributes:{},classList:{toggle(){}},setAttribute(key,value){this.attributes[key]=String(value);},addEventListener(){},blur(){}});return elements.get(id);};
  const snapshot=()=>Object.fromEntries([...elements].map(([id,e])=>[id,{text:e.textContent,hidden:e.hidden,disabled:e.disabled??null,style:{...e.style},attributes:{...e.attributes}}]));
  return { get, snapshot };
}
