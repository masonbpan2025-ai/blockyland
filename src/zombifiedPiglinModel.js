import * as THREE from 'three';

import { adoptWhenReady } from './mobVisuals/modelBuilder.js';

/** The real 64x64 zombified piglin sheet -- the player model with its own skin. */
const ZOMBIFIED_PIGLIN_SKIN_PATH = '/assets/entity/piglin/zombified_piglin.png';

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


// Original 16px skin tiles. Bone, torn flesh and rot are deliberately asymmetric.
function tile(kind, face = 0) {
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const px=Math.floor(x/2),py=Math.floor(y/2);
    const patches=['PPPPPPPP','PPGGPPPP','PPPGGPPP','PPPPPPPP','PPPPGGPP','GPPPGPPP','GGPPPPPP','PPPPPPGG'];
    const skull=['BBBBGPPP','BBBBGGPP','BKBBGPPP','BBBBGPPP','BBBPGPPP','BBBPPPPP','BBBGGPPP','BBBGGGPP'];
    const ribs=['BPPPPPPP','BGPPPPPP','BBBGPPPP','BGPPPPPP','BBBGPPPP','BGGPPPPP','BBBPGPPP','GPPPPPPP'];
    let code=patches[py][px];
    if(kind==='skull'&&face===4)code=skull[py][px];
    if(kind==='skull'&&face===1)code=px<5?'B':code;
    if(kind==='skull'&&face===2&&px<4)code='B';
    if(kind==='ribs'&&face===4)code=ribs[py][px];
    let c=code==='G'?0x657c43:code==='B'?0xbac0b3:code==='K'?0x292c26:0xe29289;
    if(kind==='cloth')c=(px+py)%4?0x704632:0x805039;
    const n=((px*13+py*17+face*3)%7-3)*4,i=(y*16+x)*4;
    for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,((c>>(16-8*k))&255)+n));
    data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, 16, 16);
  t.magFilter = t.minFilter = THREE.NearestFilter;t.flipY=true;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
export function createZombifiedPiglinModel(cache = {}, options = {}) {
  // The REAL sheet. A texture is adopted only when a loader is available; the drawn tiles stand until it decodes,
  // which is both what a no-assets build renders and what this mob's suite inspects. // ZP_REAL_SHEET
  const sheet = options.loadTexture ? options.loadTexture(ZOMBIFIED_PIGLIN_SKIN_PATH) : null;
  if (sheet) { sheet.magFilter = THREE.NearestFilter; sheet.minFilter = THREE.NearestFilter; sheet.needsUpdate = true; }
  const mesh = new THREE.Group();
  const materials = kind => Array.from({length: 6}, (_, face) => new THREE.MeshLambertMaterial({map: cache['zp-' + kind + face] ||= tile(kind, face)}));
  const flesh = materials('flesh'), skull = materials('skull'), ribs = materials('ribs'), cloth = materials('cloth');
  /**
   * A boxed part carrying the player rectangle vanilla gives it. Six materials so it keeps the drawn look until the
   * sheet is ready, then all six adopt it.
   */
  const textured = (parent, name, size, pos, mat, uu, vv, tw, th, td) => {
    const geo = new THREE.BoxGeometry(...size);
    applyBoxUVs(geo, uu, vv, 64, 64, tw, th, td);
    const part = new THREE.Mesh(geo, mat);
    part.name = name;
    part.position.set(...pos);
    parent.add(part);
    if (sheet) {
      const materials = Array.isArray(mat) ? mat : [mat];
      for (const material of materials) {
        adoptWhenReady(material, sheet, 0xffffff, { onTextureReady: options.onTextureReady });
      }
    }
    return part;
  };
  const bone = new THREE.MeshLambertMaterial({color: 0xe4dbbb}), dark = new THREE.MeshLambertMaterial({color: 0x43382b});
  const box = (parent, name, size, pos, mat) => {const part = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);part.name=name;part.position.set(...pos);parent.add(part);return part;};
  // The head carries the player rectangle at (0, 0): 8x8x8.
    const head = textured(mesh, 'head', [.625,.5,.5], [0,1.625,0], skull, 0, 0, 8, 8, 8);
  textured(head,'snout',[.25,.18,.19],[0,-.08,.34],materials('flesh'), 31, 1, 4, 3, 1);
  for (const x of [-.07,.07]) box(head,'nostril',[.035,.04,.014],[x,-.07,.442],dark);
  box(head,'remaining-tusk',[.055,.11,.055],[.15,-.09,.35],bone);
  textured(head,'left-ear',[.10,.28,.18],[.35,-.015,0],materials('flesh'), 51, 6, 1, 5, 4).rotation.z=.3;
  textured(head,'torn-ear',[.10,.08,.09],[-.35,.04,0],materials('flesh'), 51, 6, 1, 2, 2).rotation.z=-.25;
  // The torso carries the player rectangle at (16, 16): 8x12x4.
    textured(mesh, 'torso', [.5,.75,.25], [0,1.125,0], ribs, 16, 16, 8, 12, 4);
  box(mesh,'loincloth',[.51,.22,.27],[0,.81,0],cloth);
  const limb = (name,x,y,mat,uu,vv,tw,th,td) => {const pivot=new THREE.Group();pivot.name=name;pivot.position.set(x,y,0);mesh.add(pivot);textured(pivot,name+'-skin',[.25,.75,.25],[0,-.375,0],mat,uu,vv,tw,th,td);return pivot;};
  const leftArm=limb('left-arm',-.375,1.5,materials('flesh'), 32, 48, 4, 12, 4),
        rightArm=limb('right-arm',.375,1.5,materials('ribs'), 40, 16, 4, 12, 4);
  const leftLeg=limb('left-leg',-.125,.75,materials('flesh'), 16, 48, 4, 12, 4),
        rightLeg=limb('right-leg',.125,.75,materials('flesh'), 0, 16, 4, 12, 4);
  for(const leg of [leftLeg,rightLeg])box(leg,'dark-sole',[.251,.045,.251],[0,-.73,0],dark);
  box(leftLeg,'exposed-shin',[.1,.38,.014],[-.04,-.38,.132],bone);
  leftArm.rotation.x=rightArm.rotation.x=-1.2;
  mesh.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
  return {mesh,head,leftArm,rightArm,leftLeg,rightLeg};
}
export function syncZombifiedWeapon(mob) {
  const id=mob.equipment?.weapon?.id ?? mob.weapon ?? null;
  if(mob.weaponMesh?.userData.itemId===id)return;
  if(mob.weaponMesh){mob.weaponMesh.removeFromParent();mob.weaponMesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
  mob.weaponMesh=null;if(!id)return;
  // The weapon can be a picked-up BLOCK, whose id is a number and has no string methods. Shape and
  // colour are chosen from the NAME form; a block matches none of them and takes the plain default.
  const weaponId=typeof id==='string'?id:'';
  const group=new THREE.Group();group.userData.itemId=id;mob.rightArm.add(group);mob.weaponMesh=group;
  group.position.set(0,-.65,.1);group.rotation.x=weaponId.includes('spear')?-.3:1.2;
  const gold=new THREE.MeshLambertMaterial({color:weaponId.startsWith('golden_')?0xe9bd3a:weaponId.startsWith('diamond_')?0x58d9db:0xc5c7cc});
  const wood=new THREE.MeshLambertMaterial({color:0x69452c});
  const part=(size,pos,mat)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);m.position.set(...pos);group.add(m);};
  if(weaponId.includes('spear')){part([.045,1.4,.045],[0,.4,0],wood);part([.09,.3,.07],[0,1.2,0],gold);group.rotation.x=-.3;}
  else if(weaponId==='crossbow'){part([.55,.07,.09],[0,.05,.15],wood);part([.06,.15,.36],[0,0,0],wood);}
  else if(weaponId.includes('axe')){part([.06,.55,.06],[0,.2,0],wood);part([.28,.25,.08],[.09,.55,0],gold);}
  else if(weaponId.includes('sword')){
    part([.065,.24,.065],[0,.05,0],wood);part([.24,.06,.09],[0,.2,0],gold);
    const edge=new THREE.MeshLambertMaterial({color:0x685229});
    part([.15,.5,.07],[0,.48,0],edge);part([.10,.5,.075],[0,.48,.002],gold);part([.075,.075,.07],[0,.76,0],gold);
  }
  else part([.06,.6,.06],[0,.25,0],wood);
}
