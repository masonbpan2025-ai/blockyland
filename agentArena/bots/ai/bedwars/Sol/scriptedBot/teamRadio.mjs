// Shared only by our own four imports. Share a target id; each player still uses its own delayed enemy observation.
const targets = new Map();
const swings = new Map();
export const combatTeamKey = (bot) => `${bot.bedwarsState?.plan?.key ?? bot.bedwarsArena?.key ?? ''}/${bot.bedwarsState?.round ?? 0}/${bot.me?.()?.team}`;
export const teamSwingReady = (key, target, now) => now - (swings.get(`${key}/${target}`) ?? -Infinity) >= 520;
export function noteTeamSwing(key, target, now) {
  swings.set(`${key}/${target}`, now);
  if (swings.size > 256) swings.delete(swings.keys().next().value);
}
export function squadFocus(key, foes, middle, now, radius = 4.75, group = 0) {
  const candidates = foes.filter((f) => !f.dead && (f.health ?? 20) > 0
    && Math.hypot(f.x - middle.x, f.z - middle.z) <= radius && Math.abs((f.y ?? middle.y) - middle.y) < 3);
  const ownKey = `${key}/pair-${group}`, other = targets.get(`${key}/pair-${1 - group}`);
  const available = candidates.length > 1 && other && now - other.at < 2500 ? candidates.filter((f) => f.id !== other.id) : candidates;
  const prior = targets.get(ownKey);
  const retained = prior && now - prior.at < 2500 ? available.find((f) => f.id === prior.id) : null;
  if (retained) return retained;
  const selected = available.sort((a, b) => ((a.health ?? 20) * 0.18 + Math.hypot(a.x - middle.x, a.z - middle.z))
    - ((b.health ?? 20) * 0.18 + Math.hypot(b.x - middle.x, b.z - middle.z)) || a.id.localeCompare(b.id))[0] ?? null;
  if (selected) targets.set(ownKey, { id: selected.id, at: now }); else targets.delete(ownKey);
  if (targets.size > 64) targets.delete(targets.keys().next().value);
  return selected;
}
