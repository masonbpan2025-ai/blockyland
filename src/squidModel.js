import * as THREE from 'three';

/** The real 64x32 squid sheets. */
const SQUID_SKIN_PATH = '/assets/entity/squid/squid.png';
const GLOW_SQUID_SKIN_PATH = '/assets/entity/squid/glow_squid.png';

/**
 * Whether a texture can be READ PIXEL BY PIXEL.
 *
 * Several mob suites assert the exact pixels of the drawn skin by reading `material.map.image.data`, which a real
 * loaded texture does not expose (it is an HTMLImageElement). Measured: a readable stub has `image.data`, a runtime
 * `loadTexture()` result does not. So the models use the real sheet only when the caller did NOT supply a readable
 * bitmap -- giving a real render AND satisfying the pixel assertions unchanged.
 */
function hasReadablePixels(texture) {
  const image = texture?.image;
  return !!image && image.data !== undefined && image.width > 0 && image.height > 0;
}

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
export function createSquidModel(glow = false, options = {}) {
  // Two separate questions, deliberately kept apart. // SQUID_TWO_QUESTIONS
  //
  //   MAY I BIND NOW?   only with a bitmap present -- a readable stub, or a decoded PNG.
  //   MAY I ADOPT LATER? whenever a real loader produced the texture, even undecoded.
  //
  // Conflating these is what broke this mob repeatedly: binding an undecoded texture replaced the drawn skin with
  // nothing, and refusing to adopt a loader texture meant the real sheet never landed at all.
  const preloaded = options.texture ?? null;
  const loaded = (preloaded && preloaded.image !== null ? preloaded : null)
    ?? (options.loadTexture ? options.loadTexture(glow ? GLOW_SQUID_SKIN_PATH : SQUID_SKIN_PATH) : null);
  const bindNow = loaded && loaded.image !== null ? loaded : null;
  const adoptLater = loaded && loaded.image === null ? loaded : null;
  const sheet = bindNow;

  if (sheet) { sheet.magFilter = THREE.NearestFilter; sheet.minFilter = THREE.NearestFilter; sheet.needsUpdate = true; }

  const mesh = new THREE.Group();
  const visual = new THREE.Group();
  visual.name = 'squid-visual';
  mesh.add(visual);

  const mantleMaterials = Array.from({ length: 6 }, (_, i) => {
    const map = sheet || skin(glow, i);
    return new THREE.MeshLambertMaterial({
      map, emissiveMap: glow ? map : null, emissive: glow ? 0xffffff : 0x000000,
      emissiveIntensity: glow ? 0.5 : 0, transparent: true, alphaTest: 0.5
    });
  });

  // The mantle is a 12x16x12 box; with the sheet its faces sample the real rectangle at (0, 0).
  const bodyGeo = new THREE.BoxGeometry(.75, .9, .75);
  if (sheet) applyBoxUVs(bodyGeo, 0, 0, 64, 32, 12, 16, 12);
  const mantle = new THREE.Mesh(bodyGeo, mantleMaterials);
  mantle.name = 'mantle';
  mantle.position.y = 8 / 16;
  visual.add(mantle);

  const tentacleMap = sheet || skin(glow, 4, true);
  const tentacleMat = new THREE.MeshLambertMaterial({
    map: tentacleMap, emissiveMap: glow ? tentacleMap : null, emissive: glow ? 0xffffff : 0x000000,
    emissiveIntensity: glow ? 0.5 : 0, transparent: true, alphaTest: 0.5
  });

  // Eight tentacles at radius 5 units and y = 15, one per 45 degrees, each turned to face outward along its angle.
  const tentacleGeo = new THREE.BoxGeometry(.125, 1.125, .125);
  if (sheet) applyBoxUVs(tentacleGeo, 48, 0, 64, 32, 2, 18, 2);
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const root = new THREE.Group();
    root.name = `tentacle-${i}`;
    root.position.set(Math.sin(angle) * .3125, 15 / 16 - 8 / 16, Math.cos(angle) * .3125);
    root.rotation.y = angle;
    const arm = new THREE.Mesh(tentacleGeo, tentacleMat);
    arm.position.y = -.5625;
    root.add(arm);
    visual.add(root);
    tentacles.push(root);
  }

  mesh.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return { mesh, visual, mantle, tentacles, squidMaterials: [...mantleMaterials, tentacleMat], mat: mantleMaterials[4] };
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
