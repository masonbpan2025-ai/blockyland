import { BLOCKS } from './blocks.js';
import { validatePlayerCommand } from './playerBot.js';
import { PAINTING_BY_ID } from './paintings.js';

const WALL_SIDES = ['north', 'south', 'east', 'west'];

/**
 * build_in_stages: a site and its parts. Each part is a box inside the site that is written later in its own
 * request, so the plan itself carries no operations. A site may be larger than one build (128 x 128) because a
 * town is; each part is still at most 64 on a side, like any build.
 */
function validateStagedPlan(plan) {
  const int = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (typeof plan.name !== 'string' || !plan.name.trim() || plan.name.length > 80) throw new Error('A staged build needs a short name.');
  const site = plan.site;
  if (!site || !int(site.width, 1, 128) || !int(site.depth, 1, 128) || !int(site.height, 1, 64)) throw new Error('A staged build needs a site of at most 128 x 64 x 128.');
  if (plan.theme !== undefined && (typeof plan.theme !== 'string' || plan.theme.length > 600)) throw new Error('The theme must be a short description.');
  if (!Array.isArray(plan.stages) || !plan.stages.length || plan.stages.length > 24) throw new Error('A staged build needs 1-24 stages.');
  for (const stage of plan.stages) {
    if (!stage || typeof stage.name !== 'string' || !stage.name.trim() || stage.name.length > 80) throw new Error('Every stage needs a short name.');
    if (stage.description !== undefined && (typeof stage.description !== 'string' || stage.description.length > 800)) throw new Error(`The description of "${stage.name}" is too long.`);
    const s = stage.size, o = stage.offset;
    if (!s || !int(s.width, 1, 64) || !int(s.height, 1, 64) || !int(s.depth, 1, 64)) throw new Error(`"${stage.name}" needs a size of at most 64 per side.`);
    if (!Array.isArray(o) || o.length !== 3 || !o.every(n => int(n, 0, 127))) throw new Error(`"${stage.name}" needs an offset [x, y, z] inside the site.`);
    if (o[0] + s.width > site.width || o[1] + s.height > site.height || o[2] + s.depth > site.depth) throw new Error(`"${stage.name}" does not fit inside the site.`);
  }
  return plan;
}

/** hang_paintings: where (a target id, walls of it, or exact spots), how many, how big and which pictures. */
function validatePaintingPlan(plan) {
  if (plan.target !== undefined && (typeof plan.target !== 'string' || plan.target.length > 64)) throw new Error('A painting target must be a short id such as current_room.');
  if (plan.walls !== undefined && (!Array.isArray(plan.walls) || !plan.walls.every(w => WALL_SIDES.includes(String(w).toLowerCase())))) throw new Error('Walls must be north, south, east or west.');
  if (plan.count !== undefined && !(Number.isInteger(plan.count) && plan.count >= 1 && plan.count <= 32)) throw new Error('Painting count must be 1-32.');
  if (plan.size !== undefined && !['small', 'medium', 'large', 'any'].includes(plan.size)) throw new Error('Painting size must be small, medium, large or any.');
  if (plan.variants !== undefined && (!Array.isArray(plan.variants) || plan.variants.length > 32 || !plan.variants.every(v => PAINTING_BY_ID[v]))) throw new Error('Unknown painting variant.');
  if (plan.spots !== undefined) {
    const coordinate = n => Number.isInteger(n) && Math.abs(n) <= 30000000;
    if (!Array.isArray(plan.spots) || plan.spots.length > 32 || !plan.spots.every(s => s && coordinate(s.x) && coordinate(s.y) && coordinate(s.z) && WALL_SIDES.includes(s.facing) && (s.variant === undefined || PAINTING_BY_ID[s.variant]))) {
      throw new Error('Painting spots need integer x, y, z, a facing (north/south/east/west) and a known variant.');
    }
  }
  return plan;
}

// Validate model output before executing any part of a plan.
export function validatePlan(plan, depth = 0, budget = { steps: 0, operations: 0 }) {
  if (++budget.steps > 64) throw new Error('Plan has too many steps.');
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || depth > 4) throw new Error('Invalid agent plan.');
  const actions = ['build', 'edit', 'destroy', 'message', 'build_stairs', 'build_ladder', 'weather', 'time', 'summon', 'give', 'gamemode', 'heal', 'clear', 'light', 'multi', 'fill_water', 'voxel_art', 'player_control', 'hang_paintings', 'build_in_stages'];
  if (!actions.includes(plan.action)) throw new Error(`Unsupported action: ${plan.action}`);
  if (plan.action === 'hang_paintings') return validatePaintingPlan(plan);
  if (plan.action === 'build_in_stages') return validateStagedPlan(plan);
  if (plan.action === 'player_control') {
    if (typeof plan.command !== 'string' || !plan.command.trim() || plan.command.length > 256) throw new Error('Player control requires a short command string.');
    validatePlayerCommand(plan.command);
    return plan;
  }
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const vector = (v, size = 3) => Array.isArray(v) && v.length === size && v.every(n => integer(n, -64, 64));
  if (plan.action === 'multi') {
    if (!Array.isArray(plan.steps) || !plan.steps.length || plan.steps.length > 16) throw new Error('A multi plan needs 1–16 steps.');
    plan.steps.forEach(step => validatePlan(step, depth + 1, budget));
  }
  if (plan.dimensions && !['width', 'height', 'depth'].every(k => integer(plan.dimensions[k], 1, 64))) throw new Error('Dimensions must be integers from 1 to 64.');
  if (plan.offset && !vector(plan.offset)) throw new Error('Invalid edit offset.');
  // The target of an edit or a destroy arrives as `targetBuilding` (the field the executor and the prompt
  // both use) or as `targetStructure` (the spelling some plans use). Accepting only one of them rejected
  // every studio edit with "An edit needs a target structure" while the target sat right there.
  const target = plan.targetStructure ?? plan.targetBuilding;
  if (plan.action === 'edit' && (!target || !plan.operations?.length)) throw new Error('An edit needs a target structure and operations.');
  if (plan.action === 'destroy' && !target) throw new Error('Destroy needs a target structure.');
  // The name of the requested structure arrives under two spellings: the built-in builder sets
  // `buildingType` (which is what the executor reads) while model-facing plans and the prompt schema say
  // `structureType`. Reading only the latter rejected every offline plan -- "Build needs a structure type or
  // operations" for a lighthouse -- because the local builder never used that word.
  const structure = plan.structureType ?? plan.buildingType;
  if (plan.action === 'build' && !structure && !plan.operations?.length) throw new Error('Build needs a structure type or operations.');
  const presets = ['stairs', 'staircase', 'ladder', 'aquarium', 'greenhouse', 'skyscraper', 'spaceship', 'lighthouse', 'statue', 'geometric', 'castle', 'tower', 'pyramid', 'pond', 'pool', 'bunker', 'bridge', 'wall', 'house'];
  if (plan.action === 'build' && !plan.operations?.length && !presets.includes(structure)) throw new Error('Custom builds require voxel operations; no substitute structure was built.');
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
