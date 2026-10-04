import * as THREE from 'three';
export const HORSE_COATS=[0xe3e0d7,0xcbb68b,0x98532d,0x70452f,0x292825,0x827e78,0x443027];
export const HORSE_MARKINGS=['none','white','whitefield','whitedots','blackdots'];
function texture(color,marking=0){
 const data=new Uint8Array(32*32*4);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){
  const noise=((x*37+y*53+x*y*11)%17-8)*1.3;
  const spot=(Math.floor(x/3)*7+Math.floor(y/3)*11)%13<3;
  const patch=marking===2&&((x>5&&x<19&&y>9)||(x>23&&y<14));
  const c=patch||(marking===3&&spot)?0xe9e6df:marking===4&&spot?0x292725:color,i=(y*32+x)*4;
  for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,((c>>(16-k*8))&255)+noise));data[i+3]=255;
 }
 const t=new THREE.DataTexture(data,32,32);t.magFilter=t.minFilter=THREE.NearestFilter;t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;return t;
}
// Original pixel textures and articulated cuboids; no remote assets or canvas dependency.
export function createHorseModel(coat=3,marking=0,cache={}){
 const mesh=new THREE.Group();
 const material=(key,color,pattern=0)=>new THREE.MeshLambertMaterial({map:cache[key] ||= texture(color,pattern)});
 const skin=material(`equine-${coat}`,HORSE_COATS[coat]),bodySkin=material(`equine-${coat}-${marking}`,HORSE_COATS[coat],marking);
 const dark=new THREE.MeshLambertMaterial({color:coat===1?0x6a5137:0x28221d}),white=new THREE.MeshLambertMaterial({color:0xe9e4db});
 const box=(parent,name,size,pos,mat)=>{const p=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);p.name=name;p.position.set(...pos);parent.add(p);return p;};
 box(mesh,'torso',[.625,.625,1.375],[0,1.03,-.06],bodySkin);
 const head=new THREE.Group();head.name='neck-pivot';head.position.set(0,1.0,.46);mesh.add(head);
 box(head,'neck',[.25,.7,.38],[0,.24,.02],skin).rotation.x=.48;
 const skull=new THREE.Group();skull.position.set(0,.43,.22);skull.rotation.x=.48;head.add(skull);
 box(skull,'head',[.31,.31,.43],[0,0,.09],skin);box(skull,'muzzle',[.29,.22,.32],[0,-.025,.38],skin);box(skull,'nose',[.295,.13,.09],[0,-.06,.56],dark);
 for(const side of [-1,1]){box(skull,'ear',[.085,.2,.085],[side*.105,.23,-.045],skin);box(skull,'eye-white',[.012,.095,.085],[side*.161,.055,.19],white);box(skull,'eye',[.014,.065,.046],[side*.17,.05,.21],dark);}
 box(head,'mane',[.08,.73,.12],[0,.23,-.18],dark).rotation.x=.48;
 if(marking===1)box(skull,'blaze',[.09,.012,.62],[0,.162,.19],white);
 const legs=[];
 for(const z of [.46,-.55])for(const x of [-.22,.22]){const leg=new THREE.Group();leg.name='leg-pivot';leg.position.set(x,.82,z);mesh.add(leg);legs.push(leg);box(leg,'leg',[.19,.73,.19],[0,-.36,0],skin);if(marking===1)box(leg,'stocking',[.195,.25,.195],[0,-.63,0],white);box(leg,'hoof',[.205,.105,.22],[0,-.77,.005],dark);}
 const tail=new THREE.Group();tail.position.set(0,1.28,-.75);mesh.add(tail);tail.rotation.x=-.35;box(tail,'tail',[.13,.52,.13],[0,-.23,-.025],dark);
 const saddleMesh=new THREE.Group();mesh.add(saddleMesh);saddleMesh.visible=false;
 const leather=new THREE.MeshLambertMaterial({color:0x693d25});box(saddleMesh,'saddle-seat',[.68,.1,.55],[0,1.38,-.08],leather);
 for(const x of [-.35,.35]){box(saddleMesh,'saddle-flap',[.06,.4,.42],[x,1.19,-.08],leather);box(saddleMesh,'stirrup',[.07,.13,.16],[x,.95,-.05],dark);}
 const armorMat=new THREE.MeshLambertMaterial({color:0xb8c5ce});const armorMesh=box(mesh,'armor',[.65,.65,1.4],[0,1.03,-.06],armorMat);armorMesh.visible=false;
 const headArmorMesh=box(skull,'head-armor',[.33,.33,.43],[0,0,.08],armorMat);headArmorMesh.visible=false;
 const bridleMesh=new THREE.Group();skull.add(bridleMesh);bridleMesh.visible=false;
 box(bridleMesh,'nose-band',[.31,.24,.055],[0,-.025,.43],leather);
 for(const side of [-1,1])box(bridleMesh,'cheek-strap',[.02,.05,.42],[side*.17,0,.22],leather);
 box(armorMesh,'neck-armor',[.28,.65,.4],[0,.34,.53],armorMat).rotation.x=.48;
 mesh.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});return {mesh,head,legs,tail,saddleMesh,armorMesh,headArmorMesh,bridleMesh};
}
