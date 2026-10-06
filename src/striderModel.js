import * as THREE from 'three';

import { adoptWhenReady } from './mobVisuals/modelBuilder.js';

/** The real 64x128 strider sheets: warm, and the cold variant. */
const STRIDER_SKIN_PATH = '/assets/entity/strider/strider.png';
const STRIDER_COLD_SKIN_PATH = '/assets/entity/strider/strider_cold.png';

/**
 * Apply vanilla's box UV layout to a BoxGeometry's six faces, in ATLAS PIXELS from the top-left.
 *
 * A local copy of the helper in `src/mobs.js`, which is not exported; importing the mob manager from a model module
 * would create a cycle.
 */
function applyBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  const faces = [
    { x: u + td + tw, y: v + td, w: td, h: th },
    { x: u, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw + td, y: v + td, w: tw, h: th }
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}

/** A flat plane sampling one atlas rectangle, for parts vanilla gives a zero dimension. */
function applyPlaneUVs(geo, u, v, texW, texH, tw, th) {
  const uvs = geo.attributes.uv;
  const u0 = u / texW, u1 = (u + tw) / texW;
  const v1 = 1 - v / texH, v0 = 1 - (v + th) / texH;
  uvs.setXY(0, u0, v1); uvs.setXY(1, u1, v1);
  uvs.setXY(2, u0, v0); uvs.setXY(3, u1, v0);
  uvs.needsUpdate = true;
  return geo;
}


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
export function createStriderModel(options = {}) {
  // The REAL 64x128 sheets. A texture is adopted only when one is available; the drawn skin stands until then, which
  // is both what a no-assets build renders and what this mob's suite inspects. // STRIDER_REBUILT
  const warmTex = options.loadTexture ? options.loadTexture(STRIDER_SKIN_PATH) : null;
  const coldTex = options.loadTexture ? options.loadTexture(STRIDER_COLD_SKIN_PATH) : null;
  for (const t of [warmTex, coldTex]) {
    if (t) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true; }
  }

  const mesh = new THREE.Group();

  // Six materials per coat so the body can carry its own rectangle; the drawn skin is the stand-in.
  const coat = (cold, sheet) => Array.from({ length: 6 }, (_, i) => {
    const material = new THREE.MeshLambertMaterial({ map: skin(cold, i === 4), transparent: true, alphaTest: 0.5 });
    if (sheet) adoptWhenReady(material, sheet, 0xffffff, { onTextureReady: options.onTextureReady });
    return material;
  });
  const striderWarmMat = coat(false, warmTex);
  const striderColdMat = coat(true, coldTex);

  const u = 1 / 16;
  /** A boxed part carrying the sheet rectangle vanilla gives it. */
  const boxed = (w, h, d, uu, vv, tw, th, td, material) => {
    const geo = new THREE.BoxGeometry(w * u, h * u, d * u);
    applyBoxUVs(geo, uu, vv, 64, 128, tw, th, td);
    return new THREE.Mesh(geo, material);
  };

  // The body, 16x14x16 at (0, 1, 0), carrying the sheet rectangle at (0, 0).
  const bodyMesh = boxed(16, 14, 16, 0, 0, 16, 14, 16, striderWarmMat);
  bodyMesh.name = 'strider-body';
  bodyMesh.position.set(0, 1 * u, 0);
  mesh.add(bodyMesh);

  const head = new THREE.Group();
  head.position.y = 1.2;
  mesh.add(head);

  // The six bristles: vanilla gives them a ZERO depth, so they are planes, and each carries a resting rotation.
  const hairMat = new THREE.MeshLambertMaterial({ color: 0xd4c0b6, side: THREE.DoubleSide });
  const bristles = [];
  const bristleSpecs = [
    ['right_bottom_bristle', 16, 65, -8, 4, -8, 0, 0, -1.2217305, true],
    ['right_middle_bristle', 16, 49, -8, 4, -8, 0, 0, -1.2217305, true],
    ['right_top_bristle',    16, 33, -8, 4, -8, 0, 0, -1.2217305, true],
    ['left_top_bristle',     16, 33,  8, 4, -8, 0, 0, -1.2217305, false],
    ['left_middle_bristle',  16, 49,  8, 4, -8, 0, 0, -1.2217305, false],
    ['left_bottom_bristle',  16, 65,  8, 4, -8, 0, 0, -1.2217305, false]
  ];
  for (const [name, uu, vv, x, y, z, rx, ry, rz, mirrored] of bristleSpecs) {
    // A 12x0x16 plane: 12 wide, 16 deep, no thickness at all.
    const geo = new THREE.PlaneGeometry(12 * u, 16 * u);
    applyPlaneUVs(geo, uu, vv, 64, 128, 12, 16);
    const bristle = new THREE.Mesh(geo, hairMat);
    bristle.name = name;
    bristle.position.set(x * u, y * u, z * u);
    // A PlaneGeometry stands in local XY; vanilla's bristle rectangle is 12 on X by 16 on Z, i.e. HORIZONTAL. So the
    // plane is laid flat first (a quarter turn about X), and vanilla's resting angle goes on top of that.
    // // STRIDER_BRISTLE_UPRIGHT
    bristle.rotation.set(rx - Math.PI / 2, ry, rz);
    if (mirrored) bristle.scale.x = -1;
    bodyMesh.add(bristle);
    bristles.push(bristle);
  }

  // Hip pivots at 0.7 blocks with a foot at the bottom, which is this project's convention and what the mob's suite
  // asserts. Vanilla puts the hip at 8/16 and models no separate foot, so the LEG SIZE AND RECTANGLE stay vanilla's
  // while the rig follows this project. // STRIDER_FOOT
  const footMat = new THREE.MeshLambertMaterial({ color: 0x49434b });
  const legs = [];
  for (const [name, x, uu, vv] of [['right_leg', -4, 0, 32], ['left_leg', 4, 0, 55]]) {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x * u, 0.7, 0);
    const leg = boxed(4, 16, 4, uu, vv, 4, 16, 4, striderWarmMat);
    leg.position.y = -8 * u;
    pivot.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(4 * u, 2 * u, 4 * u), footMat);
    foot.name = 'foot';
    foot.position.set(0, -1.05, 0);
    pivot.add(foot);
    mesh.add(pivot);
    legs.push(pivot);
  }

  // The saddle is this project's own, shown only when ridden.
  const saddleMesh = new THREE.Group();
  saddleMesh.name = 'saddle';
  saddleMesh.visible = false;
  mesh.add(saddleMesh);
  const leather = new THREE.MeshLambertMaterial({ color: 0x724a32 });
  const trim = new THREE.MeshLambertMaterial({ color: 0x3f2416 });
  const pad = new THREE.Mesh(new THREE.BoxGeometry(1.02, .08, .94), leather);
  pad.position.y = 1.1;
  saddleMesh.add(pad);
  for (const x of [-.515, .515]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(.025, .48, .12), trim);
    strap.position.set(x, .86, 0);
    saddleMesh.add(strap);
  }
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.65, .07, .7), trim);
  seat.position.y = 1.16;
  saddleMesh.add(seat);

  mesh.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return {
    mesh, head, bodyMesh, striderWarmMat, striderColdMat, bristles, legs,
    leftLeg: legs[0], rightLeg: legs[1], saddle: saddleMesh, saddleMesh
  };
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
