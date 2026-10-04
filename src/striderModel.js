import * as THREE from 'three';

// Original pixel artwork: six separate faces avoid repeating eyes on the back.
function skin(cold, front) {
  const pixels=new Uint8Array(16*16*4);
  const palette=cold?[[103,83,119],[107,87,124],[112,90,128],[96,78,112]]:[[153,51,61],[160,56,66],[167,61,71],[143,48,58]];
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    let rgb=palette[(Math.floor(x/2)*13+Math.floor(y/2)*7+x*y)%4];
    if(front){
      if(y>=5&&y<=7&&(x===3||x===12))rgb=[234,224,204];
      if(y===6&&(x===4||x===11))rgb=[35,24,31];
      const mouthY=cold?(x<6||x>9?12:11):(x<6||x>9?11:12);
      if(x>=4&&x<=11&&y===mouthY)rgb=[51,30,44];
    }
    const i=((15-y)*16+x)*4;pixels.set([...rgb,255],i);
  }
  const map=new THREE.DataTexture(pixels,16,16);map.magFilter=map.minFilter=THREE.NearestFilter;map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;return map;
}
export function createStriderModel(){
  const mesh=new THREE.Group(),head=new THREE.Group();head.position.y=1.2;mesh.add(head);
  const materials=cold=>Array.from({length:6},(_,i)=>new THREE.MeshLambertMaterial({map:skin(cold,i===4)}));
  const striderWarmMat=materials(false),striderColdMat=materials(true);
  const bodyMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),striderWarmMat);bodyMesh.name='strider-body';head.add(bodyMesh);
  const bristles=[];
  const hairMat=new THREE.MeshLambertMaterial({color:0xd4c0b6,side:THREE.DoubleSide});
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const root=new THREE.Group();root.position.set(side*.5,.4,.3-i*.3);root.rotation.z=side*(.25+i*.12);
    const strand=new THREE.Mesh(new THREE.PlaneGeometry(.045,.7),hairMat);strand.position.y=-.35;root.add(strand);head.add(root);bristles.push(root);
  }
  const legMat=new THREE.MeshLambertMaterial({color:0x49434b}),footMat=new THREE.MeshLambertMaterial({color:0x37343c});
  const legs=[];
  for(const x of [-.25,.25]){const pivot=new THREE.Group();pivot.position.set(x,.7,0);mesh.add(pivot);
    const leg=new THREE.Mesh(new THREE.BoxGeometry(.25,.7,.25),legMat);leg.position.y=-.35;pivot.add(leg);
    const foot=new THREE.Mesh(new THREE.BoxGeometry(.26,.09,.27),footMat);foot.position.set(0,-.655,.03);foot.name='foot';pivot.add(foot);legs.push(pivot);}
  const saddleMesh=new THREE.Group();saddleMesh.name='saddle';saddleMesh.visible=false;head.add(saddleMesh);
  const leather=new THREE.MeshLambertMaterial({color:0x724a32}),trim=new THREE.MeshLambertMaterial({color:0xb88c59});
  const pad=new THREE.Mesh(new THREE.BoxGeometry(1.02,.08,.94),leather);pad.position.y=.52;saddleMesh.add(pad);
  for(const x of [-.515,.515]){const strap=new THREE.Mesh(new THREE.BoxGeometry(.025,.48,.12),trim);strap.position.set(x,.26,0);saddleMesh.add(strap);}
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.65,.07,.7),trim);seat.position.y=.59;saddleMesh.add(seat);
  mesh.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  return {mesh,head,bodyMesh,striderWarmMat,striderColdMat,bristles,legs,leftLeg:legs[0],rightLeg:legs[1],saddleMesh};
}
export function poseStrider(m,dt){
  m.striderClock=(m.striderClock||0)+dt;
  m.bodyMesh.material=m.isCold?m.striderColdMat:m.striderWarmMat;
  const speed=Math.hypot(m.velocity.x,m.velocity.z),phase=m.striderClock*(speed>0.1?6:1);
  m.head.position.set(m.isCold?Math.sin(m.striderClock*35)*.025:0,1.2-(m.isCold?.08:0)+Math.cos(phase*2)*Math.min(.025,speed*.01),0);
  m.legs.forEach((l,i)=>{l.rotation.x=Math.sin(phase+i*Math.PI)*Math.min(.5,speed*.12);l.scale.y=m.isCold?.9:1;l.position.y=m.isCold?.63:.7;});
  m.bristles.forEach((b,i)=>b.rotation.x=Math.sin(phase+i)*.12);
  m.saddleMesh.visible=!!m.isSaddled;
}
