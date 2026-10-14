// A finite controller uses the engine's collision query and swept movement, with game-owned permissions.
export function gridPassable({ map, width, depth, cellSize }, x, z, fromY, radius, allowed = () => true) {
  for (const [dx, dz] of [[-radius,-radius],[-radius,radius],[radius,-radius],[radius,radius]]) {
    const cx = Math.floor((x + dx) / cellSize), cz = Math.floor((z + dz) / cellSize);
    if (cx < 0 || cz < 0 || cx >= width || cz >= depth) return false;
    const tile = map[cz * width + cx];
    if (!tile || tile.block || tile.wet || Math.abs(tile.h - fromY) > 0.86 || !allowed(tile)) return false;
  }
  return true;
}

export function moveController(entity, dx, dz, { floor, passable }) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .22));
  for (let i = 0; i < steps; i++) {
    if (passable(entity.x + dx / steps, entity.z, floor(entity.x, entity.z), entity.r)) entity.x += dx / steps;
    if (passable(entity.x, entity.z + dz / steps, floor(entity.x, entity.z), entity.r)) entity.z += dz / steps;
  }
}
