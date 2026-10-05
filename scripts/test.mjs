// Test runner: run only the area you changed.
//
// `npm test` runs everything, which is the right thing before a release and the
// wrong thing while iterating on one feature. This maps named areas to the test
// files that cover them, so a change to mobs runs the mob tests and nothing else.
//
//   node scripts/test.mjs list              show every area
//   node scripts/test.mjs mob               run the mob area
//   node scripts/test.mjs mob redstone      run two areas
//   node scripts/test.mjs --all             run everything
//   node scripts/test.mjs --match riding    run files whose path matches a string
//   node scripts/test.mjs --isolated mob    per-file processes (see ISOLATION below)
//
// ISOLATION
//   Shared process (default here) is used because the Node test runner needs to
//   spawn helper processes for per-file isolation, which some sandboxes block. A
//   shared process is fine for one area; across all 71 files it is pathologically
//   slow, because state leaks between files and the total balloons from seconds to
//   minutes. Prefer area runs, and pass --isolated when your environment allows it.
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'tests');

/**
 * Which test files cover which part of the code.
 *
 * A file may appear in more than one area when it genuinely covers both; keep the
 * areas aligned with the source modules so "I changed X" maps to an obvious area.
 */
export const AREAS = {
  // --- agent / terminal ---
  agent: ['agentGuidance', 'agentProviders', 'answerShapes', 'planRecovery', 'thinkingStream', 'geminiAgent', 'terminalControls', 'forwardView', 'domWiring'],
  // --- mobs ---
  mob: ['mobs', 'mobs_expansion', 'mobAnatomy', 'mobSkins', 'mobHitFeedback', 'mobUpdateIsolation', 'mobInspectorEntry', 'mobJitter', 'mobShowcase', 'mobDebugSession', 'mobDebugSessionMore', 'mobDebugLabels', 'mob_collision_breeding', 'horseBreeding', 'horseParity', 'packEquineParity', 'striderParity', 'squidParity', 'witherSkeletonParity', 'zombifiedPiglinParity', 'chicken', 'cow', 'cat', 'ghast', 'ghast-arrows', 'piglin', 'villagers_economy', 'mcData', 'hazardAvoidance', 'netherLavaEscape', 'netherLavaEscapeInspector', 'blazeParity', 'sheepParity', 'mooshroomParity', 'salmonParity', 'dolphinParity', 'endermanParity', 'slimeParity', 'wolfParity', 'spiderParity', 'caveSpiderParity', 'silverfishParity', 'endermiteParity', 'rabbitParity', 'batParity', 'musicDiscs', 'drownedDrops', 'foxParity', 'beeParity', 'babyGrowthParity', 'spawnEggCoverage', 'mobUpdateSmoke', 'ambientLocomotion', 'cubeHopParity', 'goatParity', 'llamaParity', 'turtleParity', 'frogParity', 'tadpoleParity', 'parrotParity', 'phantomParity', 'polarBearParity', 'pandaParity', 'breedingInheritance', 'spawnVariantOptions', 'armadilloParity', 'undeadVariantsParity', 'windChargeBreeze', 'snifferParity', 'allayParity', 'groundednessSpawn', 'wanderingTraderParity', 'camelParity', 'parchedParity', 'creakingParity', 'killerBunnyParity', 'snowGolemParity', 'illusionerParity', 'undeadHorseParity'],
  // --- redstone and machines ---
  redstone: ['redstone', 'advanced_redstone', 'redstoneGames', 'doors', 'door', 'rails', 'riding', 'vehicles_transport'],
  // --- studio tools ---
  studio: ['buildingStudio', 'buildingStudioAgent', 'buildingContext', 'studioBugs', 'studioEditTarget'],
  // --- vanilla structure generation ---
  structures: ['structureEngine', 'structureInspectorSession', 'structureInspectorPage', 'structureParityDoc', 'structureTemplate', 'structureProcessors', 'structureIgloo', 'structureRuinedPortal', 'structureNetherFossil', 'structureShipwreck', 'structureOceanRuin', 'structureDesertPyramid', 'structureSwampHut', 'structureJigsaw', 'structurePieceIndex', 'structureTerrainAdaptation', 'structureTerrainWiring', 'structurePillagerOutpost', 'structureGoldenSeeds', 'structurePlacementDensity', 'structureInspectorPanels', 'structureInspectorPanelsUi'],
  // --- world, terrain, fluids ---
  world: ['worldSpawn', 'worldMechanisms', 'worldChunkCache', 'chunkStreaming', 'treePlacement', 'biomes', 'biomeModalInteraction', 'nether', 'netherPortal', 'netherCombat', 'netherParity', 'water', 'waterFlow', 'waterSplashes', 'lava', 'fire'],
  // --- building and inventory ---
  build: ['creativeInventory', 'chest', 'furnace', 'armor', 'armor_ui', 'enchanting', 'item_icons', 'spawnEggCatalogue', 'workstations_functional', 'beaconManager', 'smithing', 'bed'],
  // --- combat, skills, progression ---
  combat: ['arrows', 'skills', 'tournament', 'dungeonMode', 'farming'],
  // --- rendering and effects ---
  render: ['visualEffects', 'lightweightShader', 'mesherParity', 'mesherPerformance', 'meshTimeSlicing', 'mesherFaceTextures', 'progressOverlay', 'confirmDialog'],
  // --- survival parity: how much of vanilla's content the game can express ---
  survival: ['survivalParity', 'mcData', 'voxelIdRange', 'vanillaRecipes', 'recipeCoverage', 'recipeFreshness', 'contentGap', 'shapelessRecipes', 'smeltingData', 'hungerModel', 'statusEffects', 'statusEffectsStubs', 'fallDamage', 'effectReaders', 'miningEffects', 'enchantmentEffects', 'thornsReflect', 'waterMovement', 'brewingParity', 'tippedArrows', 'fireworkLaunch', 'durability', 'armourDurability', 'shieldDurability', 'materialExclusions', 'mobLootParity', 'mobDropLive', 'lootingChance', 'docsParityFigures', 'slabGeometry', 'paneCarpetGeometry', 'bedColors', 'blockItems', 'itemForms', 'placeableItems', 'stairGeometry', 'candleChainGeometry', 'fenceGeometry', 'wallGeometry', 'mechanismGeometry', 'bannerGeometry', 'doorWoodTypes', 'signGeometry', 'smallShapes', 'blockNameMatch', 'blockRegistryIntegrity', 'harvestLookup', 'duplicateIds', 'blockDrops', 'interactionSources', 'toolFacts', 'bottles', 'hives', 'hangingPlantGeometry', 'resourceInspector', 'resourceInspectorEntry', 'itemDefinitions', 'itemPotions', 'itemPotionDrinking', 'itemFurnaceTables', 'itemStackSizes'],
  // --- save/load ---
  persist: ['mapManager', 'mobStatePersistence']
};

function allTestFiles() {
  return readdirSync(testsDir).filter(f => f.endsWith('.test.js'));
}

/** Resolve area names / patterns into a list of test file paths. */
export function resolveFiles({ areas = [], match = null, all = false } = {}) {
  const onDisk = allTestFiles();
  const wanted = new Set();

  if (all) {
    for (const f of onDisk) wanted.add(f);
  }
  for (const area of areas) {
    const entries = AREAS[area];
    if (!entries) {
      throw new Error(`Unknown area "${area}". Known areas: ${Object.keys(AREAS).join(', ')}`);
    }
    for (const name of entries) {
      const file = `${name}.test.js`;
      if (onDisk.includes(file)) wanted.add(file);
    }
  }
  if (match) {
    for (const f of onDisk) if (f.includes(match)) wanted.add(f);
  }

  return [...wanted].sort().map(f => join(testsDir, f));
}

function usage() {
  const lines = ['Usage: node scripts/test.mjs [options] [area...]', '', 'Areas:'];
  for (const [name, files] of Object.entries(AREAS)) {
    lines.push(`  ${name.padEnd(10)} ${files.length} file(s)`);
  }
  lines.push('', 'Options:', '  --all              run every test file', '  --match <text>     run files whose name contains <text>', '  --isolated         one process per file (slower to start, cleaner)', '  --list             show areas and the files they cover', '');
  return lines.join('\n');
}

function main(argv) {
  const areas = [];
  let match = null;
  let all = false;
  let isolated = false;
  let list = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') all = true;
    else if (arg === '--isolated') isolated = true;
    else if (arg === '--list' || arg === 'list') list = true;
    else if (arg === '--match') match = argv[++i];
    else if (arg === '--help' || arg === '-h') { console.log(usage()); return 0; }
    else if (arg.startsWith('-')) { console.error(`Unknown option: ${arg}\n`); console.error(usage()); return 2; }
    else areas.push(arg);
  }

  if (list) {
    for (const [name, files] of Object.entries(AREAS)) {
      console.log(`\n${name}:`);
      for (const f of files) console.log(`  ${f}.test.js`);
    }
    console.log(`\n(everything: ${allTestFiles().length} files)`);
    return 0;
  }

  if (!all && !areas.length && !match) {
    console.log(usage());
    return 2;
  }

  let files;
  try {
    files = resolveFiles({ areas, match, all });
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  if (!files.length) {
    console.error('No test files matched.');
    return 2;
  }

  const args = ['--test'];
  if (!isolated) args.push('--test-isolation=none');
  args.push(...files);

  const label = all ? 'all' : [...areas, match ? `match:${match}` : null].filter(Boolean).join(', ');
  console.log(`Running ${files.length} file(s) for: ${label}${isolated ? ' (isolated)' : ''}\n`);

  // stdio is inherited on purpose: piping the child's output needs platform
  // plumbing that sandboxes commonly block.
  const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root });
  child.on('exit', code => process.exit(code ?? 1));
}

if (process.argv[1] && process.argv[1].endsWith('test.mjs')) main(process.argv.slice(2));
