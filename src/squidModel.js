import * as THREE from 'three';

// Original face-specific pixel artwork. Both eyes belong to the +Z front face;
// neither the mantle nor the tentacles reuse a stretched full-body atlas.
function skin(glow, face, tentacle = false) {
  const w = tentacle ? 4 : 12, h = tentacle ? 18 : 16;
  const data = new Uint8Array(w * h * 4);
  const palette = glow ? [[18,91,84],[23,111,98],[27,127,112],[15,78,77]] : [[38,58,76],[43,65,83],[47,70,87],[34,53,71]];
  for (let y=0;y<h;y++) for(let x=0;x<w;x++) {
    let rgb=palette[(Math.floor(x/2)*7+Math.floor(y/2)*3+x*y)%4];
    if(glow && (x*13+y*7+face*5)%23<2)rgb=[121,235,199];
    if(!tentacle && face===4 && y>=9 && y<=12 && ((x>=1 && x<=3)||(x>=8 && x<=10)))rgb=[224,228,220];
    if(!tentacle && face===4 && y>=10 && y<=11 && (x===2 || x===9))rgb=[13,22,27];
    if(tentacle && x===1 && y%4<2)rgb=glow?[94,202,158]:[102,121,130];
    if(!tentacle && face===3) {
      const d=Math.max(Math.abs(x-5.5),Math.abs(y-7.5));
      rgb=d<2?[39,18,24]:d<3?[126,72,68]:d<4?[197,179,142]:rgb;
    }
    data.set([...rgb,255],((h-1-y)*w+x)*4);
  }
  const map=new THREE.DataTexture(data,w,h);
  map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;
  return map;
}
export function createSquidModel(glow=false) {
  const mesh=new THREE.Group(),visual=new THREE.Group();mesh.add(visual);
  visual.name='squid-visual';
  const materials=Array.from({length:6},(_,i)=>{
    const map=skin(glow,i);
    return new THREE.MeshLambertMaterial({map,emissiveMap:glow?map:null,emissive:glow?0xffffff:0x000000,emissiveIntensity:glow?1:0});
  });
  const mantle=new THREE.Mesh(new THREE.BoxGeometry(.75,.9,.75),materials);mantle.name='mantle';mantle.position.y=.4;visual.add(mantle);
  const map=skin(glow,4,true),tentacleMat=new THREE.MeshLambertMaterial({map,emissiveMap:glow?map:null,emissive:glow?0xffffff:0x000000,emissiveIntensity:glow?1:0});
  const tentacles=[];
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4,root=new THREE.Group();root.name=`tentacle-${i}`;
    root.position.set(Math.sin(angle)*.3125,0,Math.cos(angle)*.3125);root.rotation.y=angle;
    const arm=new THREE.Mesh(new THREE.BoxGeometry(.125,1.125,.125),tentacleMat);arm.position.y=-.5625;root.add(arm);visual.add(root);tentacles.push(root);
  }
  mesh.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  return {mesh,visual,mantle,tentacles,squidMaterials:[...materials,tentacleMat],mat:materials[4]};
}
export function poseSquid(m) {
  m.mesh.scale.setScalar(m.isBaby?.625:1);
  m.mantle.scale.set(m.isBaby?1.12:1,m.isBaby?1.05:1,m.isBaby?1.12:1);
  const angle=.15+Math.pow((Math.sin(m.swimCycle*3.5)+1)/2,2)*.9;
  for(const t of m.tentacles){t.rotation.x=angle;t.scale.y=m.isBaby?.7:1;}
  // The neutral aquatic pose faces forward; pitch follows vertical swimming.
  m.visual.rotation.x=m.inWater?(m.pitch||0):0;
  m.mesh.rotation.y=m.yaw;
  for(const mat of m.squidMaterials)mat.emissiveIntensity=m.isGlowSquid&&!(m.darkSeconds>0)?1:0;
}
