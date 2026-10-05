import { isSquid } from './squidBehavior.js';
export function mobBounds(manager, mob) {
  const base = manager.getMobDimensions(mob.type);
  const scale = mob.isBaby ? (isSquid(mob) ? .625 : mob.type==='horse' ? .7 : .5) : 1;
  return { width: (mob.width || base.width) * scale, height: (mob.height || base.height) * scale };
}

// Sweep relative motion so a fast chase or sprint cannot tunnel through a body.
function sweepContact(manager, mob, player, half, ph) {
  const a = mob.contactStart, b = manager.playerContactStart;
  if (!a || !b || a.distanceTo(mob.mesh.position) > 16 || b.distanceTo(player.position) > 16) return;
  const height = mobBounds(manager, mob).height;
  if (a.y + height <= b.y || b.y + ph <= a.y) return;
  const relative = a.clone().sub(b);
  if (Math.abs(relative.x) < half && Math.abs(relative.z) < half) return;
  const end = mob.mesh.position.clone().sub(player.position);
  if (Math.abs(end.x) < half && Math.abs(end.z) < half) return;
  const velocity = end.sub(relative);
  let enter = 0, leave = 1;
  for (const axis of ['x', 'z']) {
    if (Math.abs(velocity[axis]) < 1e-9) { if (Math.abs(relative[axis]) >= half) return; continue; }
    const t1 = (-half - relative[axis]) / velocity[axis], t2 = (half - relative[axis]) / velocity[axis];
    enter = Math.max(enter, Math.min(t1, t2)); leave = Math.min(leave, Math.max(t1, t2));
  }
  if (enter > leave || enter < 0 || enter >= 1) return;
  const mp = a.clone().lerp(mob.mesh.position, Math.max(0, enter - 0.0001));
  const pp = b.clone().lerp(player.position, Math.max(0, enter - 0.0001));
  mp.y = mob.mesh.position.y; pp.y = player.position.y;
  if (!manager.checkMobCollision(mob, mp) && !player.checkCollision?.(pp)) { mob.mesh.position.copy(mp); player.position.copy(pp); }
}

// AABB minimum translation, not a radial impulse: corners are solid too.
export function separatePlayerFromMobs(manager, player, dt) {
  if (!player?.position || player.isDead || player.gamemode === 'spectator') return;
  const playerStart = player.position.clone();
  let pushBudget = Math.max(0, Math.min(dt, 0.1)) * 0.8;
  const pw = player.width || 0.6, ph = player.isSneaking ? 1.5 : (player.height || 1.8);
  for (const mob of manager.mobs) {
    if (mob.health > 0 && !mob.dying && mob.mesh && mob.rider !== player && !mob.vehicle) sweepContact(manager, mob, player, (pw + mobBounds(manager, mob).width) / 2, ph);
  }
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const mob of manager.mobs) {
      if (mob.health <= 0 || mob.dying || !mob.mesh || mob.rider === player || mob.vehicle) continue;
      const p = mob.mesh.position, b = mobBounds(manager, mob);
      if (p.y + b.height <= player.position.y || player.position.y + ph <= p.y) continue;
      const half = (pw + b.width) / 2;
      const dx = p.x - player.position.x, dz = p.z - player.position.z;
      const ox = half - Math.abs(dx), oz = half - Math.abs(dz);
      if (ox <= 0 || oz <= 0) continue;
      const axes = ox < oz ? ['x', 'z'] : ['z', 'x'];
      let resolved = false;
      for (const axis of axes) {
        const delta = p[axis] - player.position[axis];
        const sign = Math.sign(delta) || Math.sign((mob.contactStart?.[axis] ?? 1) - player.position[axis]) || 1;
        const overlap = half - Math.abs(delta) + 0.0001;
        let push = b.width > pw + 0.05 ? Math.min(overlap * 0.35, pushBudget) : 0;
        const pp = player.position.clone(); pp[axis] -= sign * push;
        if (player.checkCollision?.(pp)) push = 0;
        const mp = p.clone(); mp[axis] += sign * (overlap - push);
        if (manager.checkMobCollision(mob, mp)) continue;
        p.copy(mp);
        player.position[axis] -= sign * push;
        pushBudget -= push;
        if (mob.velocity?.[axis] * sign < 0) mob.velocity[axis] = 0;
        if (player.velocity?.[axis] * sign > 0) player.velocity[axis] = 0;
        changed = resolved = true;
        break;
      }
      if (!resolved) {
        // A body pinned against terrain stops the player at its contact face.
        for (const axis of axes) {
          const sign = Math.sign(p[axis] - player.position[axis]) || 1;
          const pp = player.position.clone(); pp[axis] = p[axis] - sign * (half + 0.0001);
          if (!player.checkCollision?.(pp)) { player.position.copy(pp); if (player.velocity) player.velocity[axis] = 0; changed = true; break; }
        }
      }
    }
    if (!changed) break;
  }
  manager.playerContactStart = player.position.clone();
  if (!playerStart.equals(player.position)) player.updateCameraAndModel?.(0);
}
