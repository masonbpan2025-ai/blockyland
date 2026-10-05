import * as THREE from 'three';

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

  // Head, at the front and lower than the abdomen.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), bodyMat);
  head.position.set(0, 0.36, 0.6);
  group.add(head);

  // Eyes: the wiki's red eyes are the mob's most recognisable feature and stay visible in
  // the dark, so they are a separate emissive material rather than part of the body map.
  const eyeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.06);
  const eyeOffsets = [
    [-0.15, 0.04, 0.26], [0.15, 0.04, 0.26],
    [-0.06, 0.02, 0.27], [0.06, 0.02, 0.27]
  ];
  const eyes = eyeOffsets.map(([x, y, z]) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, y, z);
    head.add(eye);
    return eye;
  });

  // Thorax: the smaller forward body segment.
  const thorax = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.6), bodyMat);
  thorax.position.set(0, 0.4, 0.15);
  group.add(thorax);

  // Abdomen: the larger rear segment, held slightly higher.
  const abdomen = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.95), bodyMat);
  abdomen.position.set(0, 0.42, -0.55);
  group.add(abdomen);

  // Eight legs: two segments each, splayed outward so the model spans the 1.4 hitbox.
  const upperGeo = new THREE.BoxGeometry(0.34, 0.09, 0.09);
  const lowerGeo = new THREE.BoxGeometry(0.09, 0.34, 0.09);
  const legs = [];
  for (const side of [-1, 1]) {
    for (const slot of LEG_LAYOUT) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.34, 0.34, slot.z);
      hip.rotation.y = side * slot.yaw;

      const upper = new THREE.Mesh(upperGeo, bodyMat);
      // Push the upper segment outward from the hip so the leg reaches the hitbox edge.
      upper.position.set(side * 0.15, 0, 0);
      hip.add(upper);

      const knee = new THREE.Group();
      knee.position.set(side * 0.32, 0, 0);
      hip.add(knee);

      const lower = new THREE.Mesh(lowerGeo, bodyMat);
      lower.position.set(0, -0.17, 0);
      knee.add(lower);

      group.add(hip);
      // Recorded so the walk cycle can animate the upper segment and the knee together.
      legs.push({ hip, upper, knee, lower, side, baseYaw: side * slot.yaw });
    }
  }

  return { group, head, thorax, abdomen, legs, eyes };
}

/**
 * Animate the eight legs in two alternating tripods, which is how a real spider walks and
 * how the wiki model animates.
 */
export function poseSpiderLegs(spider, phase) {
  const legs = spider?.legs;
  if (!legs) return;
  legs.forEach((leg, index) => {
    // Legs 0,3,4,7 form one tripod group; 1,2,5,6 the other.
    const tripod = (index % 4 === 0 || index % 4 === 3) ? 0 : Math.PI;
    const swing = Math.sin(phase + tripod);
    leg.hip.rotation.y = leg.baseYaw + swing * 0.22;
    leg.knee.rotation.z = Math.cos(phase + tripod) * 0.35;
  });
}
