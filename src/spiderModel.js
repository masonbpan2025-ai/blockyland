import * as THREE from 'three';
import { createEntityBox, createBoxFromFaces } from './mobVisuals/entityBox.js';

/**
 * Spider model.
 *
 * Reference: https://minecraft.wiki/w/Spider
 *
 * Built from the wiki's proportions rather than by scaling another mob: a spider is wider
 * than it is tall (1.4 x 0.9), with a small head, a thorax, a larger abdomen and eight legs.
 * The model is authored to fit that 1.4 x 0.9 hitbox.
 */

/** Wiki: spiders are 1.4 blocks wide and 0.9 blocks tall. */
export const SPIDER_HITBOX = { width: 1.4, height: 0.9 };

/**
 * The eight leg attachment points, as offsets from the body centre.
 *
 * Four per side. The wiki model splays the front pair forward and the rear pair backward,
 * which is what makes the silhouette read as a spider rather than a beetle.
 */
const LEG_LAYOUT = [
  { x: -0.62, z: 0.34, yaw: -0.7 },
  { x: -0.66, z: 0.12, yaw: -0.25 },
  { x: -0.66, z: -0.12, yaw: 0.25 },
  { x: -0.62, z: -0.34, yaw: 0.7 }
];

/**
 * Build a spider group.
 *
 * @param {THREE.Material} bodyMat dark body material
 * @param {THREE.Material} eyeMat glowing eye material
 * @param {Function} [createCanvas] unused here; kept so the signature matches the other
 *   model builders in this file and tests can call it uniformly.
 */
export function createSpiderModel(bodyMat, eyeMat) {
  const group = new THREE.Group();

  // Every part is UV-mapped to the real 64x32 spider skin, so binding the texture dresses the whole animal. The
  // previous model used plain boxes with a flat colour, which is why a skin could not be applied to it at all.
  const box = (w, h, d, u, v, tw, th, td) => new THREE.Mesh(
    createEntityBox(w, h, d, u, v, tw, th, td, { texW: 64, texH: 32 }), bodyMat);

  // Head: 8x8x8 at (32,4).
  const head = box(0.5, 0.5, 0.5, 32, 4, 8, 8, 8);
  head.position.set(0, 0.36, 0.6);
  group.add(head);

  // Eyes: red, and the mob's most recognisable feature, so they keep a separate emissive material rather than
  // coming from the body map. Eight of them, in the two rows a real spider has.
  const eyeGeo = new THREE.BoxGeometry(0.07, 0.06, 0.04);
  const eyeOffsets = [
    [-0.11, 0.07, 0.26], [0.11, 0.07, 0.26],
    [-0.04, 0.05, 0.27], [0.04, 0.05, 0.27],
    [-0.15, 0.01, 0.24], [0.15, 0.01, 0.24],
    [-0.06, -0.01, 0.27], [0.06, -0.01, 0.27]
  ];
  const eyes = eyeOffsets.map(([x, y, z]) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, y, z);
    head.add(eye);
    return eye;
  });

  // Thorax: 6x6x6 at (0,0), the smaller forward segment.
  const thorax = box(0.6, 0.6, 0.6, 0, 0, 6, 6, 6);
  thorax.position.set(0, 0.4, 0.15);
  group.add(thorax);

  // Abdomen: 10 wide, 8 tall, 12 deep at (0, 12) on 64x32 atlas.
  const abdomen = new THREE.Mesh(createBoxFromFaces(0.9, 0.7, 1.1, [
    { x: 0, y: 24, w: 12, h: 8 },    // +X right
    { x: 22, y: 24, w: 12, h: 8 },   // -X left
    { x: 12, y: 12, w: 10, h: 12 },  // +Y top
    { x: 22, y: 12, w: 10, h: 12 },  // -Y bottom
    { x: 12, y: 24, w: 10, h: 8 },   // +Z front
    { x: 34, y: 24, w: 10, h: 8 }    // -Z back
  ], { texW: 64, texH: 32 }), bodyMat);
  abdomen.position.set(0, 0.45, -0.6);
  group.add(abdomen);

  // Eight legs, each TWO segments hinged at knee and hip, matching Minecraft's anatomy:
  // - Upper segment attaches directly to the thorax (no gap between leg and body).
  // - All 4 leg pairs attach along the thorax length (none floating behind or detached).
  // - The knee joint sits exactly at the tip of the upper segment (no gap between upper and lower leg).
  // - Legs splay forward and backward, arched upward at the hip and downward at the knee.
  const upperLen = 0.50;
  const lowerLen = 0.55;
  const upperGeo = createEntityBox(upperLen, 0.09, 0.09, 18, 0, 16, 2, 2, { texW: 64, texH: 32 });
  const lowerGeo = createEntityBox(lowerLen, 0.08, 0.08, 18, 0, 16, 2, 2, { texW: 64, texH: 32 });
  const zOffsets = [0.32, 0.21, 0.10, -0.01];
  const splayAngles = [0.70, 0.28, -0.28, -0.70];
  const legs = [];

  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const baseYaw = -side * splayAngles[i];
      const baseKneeZ = side * -0.75;

      // The hip attaches into the side of the thorax (width 0.6 -> wall at x = +-0.30).
      // Placing hip at +-0.28 penetrates 0.02 into the body, guaranteeing zero gap.
      const hip = new THREE.Group();
      hip.position.set(side * 0.28, 0.38, zOffsets[i]);
      hip.rotation.y = baseYaw;
      hip.rotation.z = side * 0.22; // upper leg arches slightly up

      // Upper segment runs outward from hip origin (x=0) to x = side * upperLen.
      const upper = new THREE.Mesh(upperGeo, bodyMat);
      upper.position.set(side * (upperLen / 2), 0, 0);
      hip.add(upper);

      // Knee joint sits PRECISELY at the outer end of the upper segment.
      const knee = new THREE.Group();
      knee.position.set(side * (upperLen / 2), 0, 0);
      knee.rotation.z = baseKneeZ; // bends downward towards the ground
      upper.add(knee);

      // Lower segment runs outward from knee origin (x=0) to x = side * lowerLen.
      const lower = new THREE.Mesh(lowerGeo, bodyMat);
      lower.position.set(side * (lowerLen / 2), 0, 0);
      knee.add(lower);

      group.add(hip);
      legs.push({ hip, upper, knee, lower, baseYaw, baseKneeZ, side });
    }
  }

  return { group, head, thorax, abdomen, legs, eyes };
}
export function poseSpiderLegs(spider, phase) {
  const legs = spider?.legs;
  if (!legs) return;
  legs.forEach((leg, index) => {
    // Legs 0,3,4,7 form one tripod group; 1,2,5,6 the other.
    const tripod = (index % 4 === 0 || index % 4 === 3) ? 0 : Math.PI;
    const swing = Math.sin(phase + tripod);
    leg.hip.rotation.y = leg.baseYaw + swing * 0.22;
    const baseKneeZ = leg.baseKneeZ ?? ((leg.side || 1) * -0.75);
    leg.knee.rotation.z = baseKneeZ + (leg.side || 1) * Math.cos(phase + tripod) * 0.20;
  });
}
