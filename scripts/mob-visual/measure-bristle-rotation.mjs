// Stop guessing the strider's bristle angle by measuring which orientation produces what.
//
// Three attempts have been made at the resting rotation and the plates persist. Rather than guess a fourth time, compute
// the resulting WORLD EXTENTS for each candidate and pick the one that matches a bristle's intended shape: THIN in one
// horizontal axis, TALL vertically, and long in the other horizontal axis.
//
// A strider's bristle is a flat sheet lying along the body's length, so the wanted extents are roughly
//   X: 0.75 blocks (12 units, the shell's width)
//   Y: the sheet's 16 units distributed vertically once tilted
//   Z: thin
import * as THREE from 'three';

const u = 1 / 16;

/** The extents of a 16x12 plane under a given rotation, in blocks. */
function extents(rotX, widthUnits = 16, heightUnits = 12) {
  const geo = new THREE.PlaneGeometry(widthUnits * u, heightUnits * u);
  const mesh = new THREE.Mesh(geo);
  mesh.rotation.set(rotX, 0, 0);
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const size = box.getSize(new THREE.Vector3());
  return { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) };
}

const vanilla = -1.2217305;
const candidates = [
  ['flat, unrotated (PlaneGeometry default)', 0],
  ['quarter turn flat       (-PI/2)', -Math.PI / 2],
  ['vanilla angle alone     (-1.2217)', vanilla],
  ['flat then vanilla       (-PI/2 + a)', -Math.PI / 2 + vanilla],
  ['upright then vanilla    (PI/2 + a)', Math.PI / 2 + vanilla],
  ['upright, no vanilla     (PI/2)', Math.PI / 2]
];

console.log('  a bristle should be WIDE on X (0.75), THIN on one axis, and spread on the other');
console.log('  rotation                                 x       y       z');
for (const [label, rotX] of candidates) {
  const e = extents(rotX);
  console.log(`    ${label.padEnd(38)} ${e.x.padStart(6)}  ${e.y.padStart(6)}  ${e.z.padStart(6)}`);
}
