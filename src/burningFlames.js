// Flames on whatever is burning -- a mob in sunlight or lava, a player set alight -- as Java draws fire on a burning
// entity: flickering sheets of fire around its body. Nothing drew them before, so a zombie burning at dawn or a player
// hit by Fire Aspect looked no different until it died or the fire went out.
import * as THREE from 'three';

/** A group of three crossed, flickering sheets, \`width\` wide and \`height\` tall, standing on the owner's feet. */
export function createFlames(width = 0.6, height = 1.8) {
  const group = new THREE.Group();
  group.name = 'flames';
  const material = new THREE.MeshBasicMaterial({
    color: 0xff8a1c, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  for (let i = 0; i < 3; i++) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.35, height * 1.05), material);
    sheet.position.y = height * 0.5;
    sheet.rotation.y = (i * Math.PI) / 3;
    // A hit's red flash is the body's, not the fire's.
    sheet.userData.noHurtTint = true;
    sheet.castShadow = false;
    group.add(sheet);
  }
  group.userData.time = 0;
  group.visible = false;
  return group;
}

/**
 * Keep \`holder\`'s flames as its burning says: made the first time it burns (\`size()\` gives its width and height),
 * shown while it burns, flickering. @returns {THREE.Group|null} the flames, or null when it has never burned
 */
export function updateFlames(holder, burning, dt, size = () => ({ width: 0.6, height: 1.8 })) {
  if (!holder) return null;
  let flames = holder.userData.flames ?? null;
  if (!flames) {
    if (!burning) return null;
    const { width = 0.6, height = 1.8 } = size() ?? {};
    flames = createFlames(width, height);
    holder.add(flames);
    holder.userData.flames = flames;
  }
  flames.visible = Boolean(burning);
  if (flames.visible) {
    const t = (flames.userData.time += dt);
    flames.scale.set(1 + Math.sin(t * 23) * 0.06, 1 + Math.sin(t * 17) * 0.1, 1);
    flames.rotation.y = t * 1.5;
  }
  return flames;
}

/** Whether a mob, or a player, is on fire now: in sunlight, in lava or fire, or set alight (heat.js). */
export const isBurning = (actor) => Boolean(actor && (actor.isBurning || actor.isOnFire || actor.fireTicks > 0));
