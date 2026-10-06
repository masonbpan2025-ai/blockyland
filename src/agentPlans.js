import { BLOCKS } from './blocks.js';

// Validate model output before executing any part of a plan.
export function validatePlan(plan, depth = 0, budget = { steps: 0, operations: 0 }) {
  if (++budget.steps > 64) throw new Error('Plan has too many steps.');
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || depth > 4) throw new Error('Invalid agent plan.');
  const actions = ['build', 'edit', 'destroy', 'message', 'build_stairs', 'build_ladder', 'weather', 'time', 'summon', 'give', 'gamemode', 'heal', 'clear', 'light', 'multi', 'fill_water', 'voxel_art'];
  if (!actions.includes(plan.action)) throw new Error(`Unsupported action: ${plan.action}`);
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const vector = (v, size = 3) => Array.isArray(v) && v.length === size && v.every(n => integer(n, -64, 64));
  if (plan.action === 'multi') {
    if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 16) throw new Error('A multi plan needs 1–16 steps.');
    plan.steps.forEach(step => validatePlan(step, depth + 1, budget));
  }
  if (plan.dimensions && !['width', 'height', 'depth'].every(k => integer(plan.dimensions[k], 1, 64))) throw new Error('Dimensions must be integers from 1 to 64.');
  if (plan.offset && !vector(plan.offset)) throw new Error('Invalid edit offset.');
  if (plan.action === 'edit' && (!plan.targetStructure || !plan.operations?.length)) throw new Error('An edit needs a target structure and operations.');
  if (plan.action === 'destroy' && !plan.targetStructure) throw new Error('Destroy needs a target structure.');
  if (plan.action === 'build' && !plan.structureType && !plan.operations?.length) throw new Error('Build needs a structure type or operations.');
  const presets = ['stairs', 'staircase', 'ladder', 'aquarium', 'greenhouse', 'skyscraper', 'spaceship', 'lighthouse', 'statue', 'geometric', 'castle', 'tower', 'pyramid', 'pond', 'pool', 'bunker', 'bridge', 'wall', 'house'];
  if (plan.action === 'build' && !plan.operations?.length && !presets.includes(plan.structureType)) throw new Error('Custom builds require voxel operations; no substitute structure was built.');
  if (plan.operations) {
    if (!Array.isArray(plan.operations) || plan.operations.length > 256) throw new Error('Too many operations.');
    for (const op of plan.operations) {
      if (++budget.operations > 256) throw new Error('Plan has too many operations.');
      if (!op || !['fill_box', 'hollow_box', 'frame', 'cylinder', 'sphere', 'dome', 'set_voxels', 'replace_blocks'].includes(op.type)) throw new Error(`Unsupported voxel operation: ${op?.type}`);
      const block = name => typeof name === 'string' && Object.hasOwn(BLOCKS, name.toUpperCase().trim().replace(/\s+/g, '_'));
      for (const key of ['block', 'fill', 'from']) if (op[key] !== undefined && !block(op[key])) throw new Error(`Unknown block: ${op[key]}`);
      if (op.type === 'replace_blocks' && !block(op.from)) throw new Error('replace_blocks needs a source block.');
      for (const key of ['min', 'max']) if (op[key] && !vector(op[key])) throw new Error(`Invalid ${key} coordinates.`);
      if (op.center && !vector(op.center, op.type === 'sphere' ? 3 : 2)) throw new Error('Invalid center.');
      for (const key of ['minY', 'maxY', 'baseY']) if (op[key] !== undefined && !integer(op[key], -64, 64)) throw new Error(`Invalid ${key}.`);
      if (op.radius !== undefined && (!Number.isFinite(op.radius) || op.radius <= 0 || op.radius > 64)) throw new Error('Invalid radius.');
      if (op.type === 'set_voxels' && (!Array.isArray(op.voxels) || op.voxels.length > 32768 || !op.voxels.every(v => vector([v.x, v.y, v.z])))) throw new Error('Invalid voxel list.');
      if (op.voxels?.some(v => v.block !== undefined && !block(v.block))) throw new Error('Unknown voxel block.');
    }
  }
  const enums = { weather: ['clear', 'rain', 'thunder'], time: ['day', 'night', 'sunset', 'sunrise'] };
  if (enums[plan.action] && !enums[plan.action].includes(plan[plan.action])) throw new Error(`Invalid ${plan.action}.`);
  if (plan.action === 'gamemode' && !['creative', 'survival'].includes(plan.mode)) throw new Error('Invalid game mode.');
  for (const key of ['radius', 'depth']) if (plan[key] !== undefined && !integer(plan[key], 0, 32)) throw new Error(`Invalid ${key}.`);
  if (plan.action === 'summon' && (!Array.isArray(plan.mobs) || plan.mobs.length > 16 || !plan.mobs.every(m => ['villager', 'iron_golem', 'pillager', 'zombie', 'pig', 'cow', 'sheep', 'creeper', 'skeleton', 'salmon', 'dolphin', 'octopus', 'axolotl'].includes(m.type) && integer(m.count, 1, 30)))) throw new Error('Invalid mobs.');
  if (plan.action === 'give' && (!Array.isArray(plan.giveItems) || plan.giveItems.length > 32 || !plan.giveItems.every(i => typeof i.name === 'string' && integer(i.count, 1, 640)))) throw new Error('Invalid items.');
  return plan;
}
