import * as THREE from 'three';

function texture(w,h,pixel) {
  const data=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(pixel(x,y),4*(y*w+x));
  const map=new THREE.DataTexture(data,w,h);map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;return map;
}
export function blazeSkin(front=false) {
  return texture(16,16,(x,y)=>{
    const n=(x*13+y*7+x*y)%5;
    let c=[201+n*8,144+n*7,30+n*3,255];
    if(y===2||y===13)c=[165,105,22,255];
    if(front){
      if(y===8&&((x>=2&&x<=5)||(x>=10&&x<=13)))c=[255,223,99,255];
      if(y===7&&((x>=2&&x<=5)||(x>=10&&x<=13)))c=[61,38,17,255];
      if(y===4&&x>=5&&x<=10)c=[75,44,18,255];
    }
    return c;
  });
}
export function createBlazeModel(textures = {}) {
  textures.blazeFace ||= blazeSkin(true);textures.blazeCoat ||= blazeSkin();
  textures.blazeSmoke ||= texture(8,8,(x,y)=>{const d=Math.hypot(x-3.5,y-3.5);return [96,91,84,d<3.7?Math.round((1-d/4)*210):0];});
  textures.blazeFlame ||= texture(8,16,(x,y)=>{const width=(1-y/17)*3.5;const d=Math.abs(x-3.5-Math.sin(y*1.4)*.7);return [255,Math.round(215-y*8),y<5?95:12,d<width?Math.round(230*(1-y/20)):0];});
  const mesh=new THREE.Group();
  const coat=new THREE.MeshLambertMaterial({map:textures.blazeCoat,emissive:0xa66d11,emissiveIntensity:.18});
  const face=new THREE.MeshLambertMaterial({map:textures.blazeFace,emissive:0xa66d11,emissiveIntensity:.18});
  const head=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5),[coat,coat,coat,coat,face,coat]);head.position.y=1.5;mesh.add(head);
  const rodMaterial=new THREE.MeshLambertMaterial({map:textures.blazeCoat,color:0xffdf76,emissive:0xc58718,emissiveIntensity:.22});
  const tiers=[];
  for(const [i,radius] of [.56,.44,.31].entries()){
    const tier=new THREE.Group();tier.position.y=1.1-i*.36;
    for(let n=0;n<4;n++){const rod=new THREE.Mesh(new THREE.BoxGeometry(.125,.5,.125),rodMaterial);const a=n*Math.PI/2+i*.7;rod.position.set(Math.cos(a)*radius,0,Math.sin(a)*radius);tier.add(rod);}
    mesh.add(tier);tiers.push(tier);
  }
  const smoke=new THREE.Group(),flames=new THREE.Group();
  for(let i=0;i<10;i++){const puff=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.blazeSmoke,transparent:true,opacity:.6,depthWrite:false}));puff.scale.setScalar(.23);smoke.add(puff);}
  for(let i=0;i<6;i++){const flame=new THREE.Sprite(new THREE.SpriteMaterial({map:textures.blazeFlame,transparent:true,opacity:.9,depthWrite:false}));flame.scale.set(.36,.85,1);flames.add(flame);}
  flames.visible=false;mesh.add(smoke,flames);
  mesh.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  const parts={mesh,head,tiers,smoke,flames,visualTime:0};animateBlaze(parts,0);return parts;
}
export function animateBlaze(mob,dt) {
  mob.visualTime=(mob.visualTime || 0)+dt;const t=mob.visualTime;
  for(let i=0;i<3;i++){
    const tier=mob.tiers[i];tier.rotation.y=t*[1.8,-1.6,1.4][i];
    tier.position.y=1.1-i*.36+Math.cos(t*2+i)*.045;
    tier.children.forEach((rod,n)=>{rod.position.y=Math.cos(t*2+n)*.035;rod.material.emissiveIntensity=mob.charging?.65:.22;});
  }
  mob.smoke.children.forEach((p,i)=>{const age=(t*.55+i/10)%1;p.position.set(Math.sin(i*2.4+age)*.35,.15+age*1.85,Math.cos(i*2.4+age)*.35);p.scale.setScalar(.16+age*.26);p.material.opacity=.65*Math.sin(age*Math.PI);});
  mob.flames.visible=!!mob.charging;
  mob.flames.children.forEach((p,i)=>{const a=i*Math.PI/3+t*.3;p.position.set(Math.sin(a)*.36,.48+(i%3)*.32,Math.cos(a)*.36);p.scale.y=.6+.22*Math.sin(t*13+i);});
}
