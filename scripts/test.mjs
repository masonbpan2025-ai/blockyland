// Test runner: run only what you changed.
//
// `npm test` runs everything, which is the right thing before a release and the
// wrong thing while iterating on one feature.
//
//   node scripts/test.mjs --changed                 the tests nearest to the files changed in the working tree
//   node scripts/test.mjs --files src/bed.js,src/x.js   the same for the files you name (other agents' edits ignored)
//   node scripts/test.mjs --changed --list          which tests, and the import chain that picked each; runs nothing
//   node scripts/test.mjs --changed --depth 2       also tests two imports away (--deep: every test that can reach)
//   node scripts/test.mjs list                      show every area
//   node scripts/test.mjs mob                       run the mob area
//   node scripts/test.mjs mob redstone              run two areas
//   node scripts/test.mjs --all                     run everything
//   node scripts/test.mjs --match riding            run files whose path matches a string
//   node scripts/test.mjs --isolated mob            per-file processes (see ISOLATION below)
//
// CHANGED MODE (scripts/testGraph.mjs)
//   Follows imports backwards from each changed file to the tests that reach it, and runs the nearest ones: a test
//   that imports the file or names it, else the closest tier that has any. A changed or new test file runs three
//   times and must pass all three (a flaky test fails). More than --max files (default 60) are refused unless you
//   pass --yes, since a change to a file most tests import (blocks.js, world.js) selects hundreds.
//
// SLOTS (scripts/testSlots.mjs)
//   Every run takes one of BLOCKYLAND_TEST_SLOTS machine-wide slots (default: half the CPU threads), and waits
//   while other runs hold slots and less than 2 GB is free. --no-slots skips this.
//
// ISOLATION
//   Shared process (default here) is used because the Node test runner needs to
//   spawn helper processes for per-file isolation, which some sandboxes block. A
//   shared process is fine for one area; across all 71 files it is pathologically
//   slow, because state leaks between files and the total balloons from seconds to
//   minutes. Prefer area runs, and pass --isolated when your environment allows it.
import { spawn, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildGraph, reachTests, pickTests, changedFiles, isTestFile, toPosix } from './testGraph.mjs';
import { acquireSlot, DEFAULT_SLOTS } from './testSlots.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const testsDir = join(root, 'tests');

/**
 * Which test files cover which part of the code.
 *
 * A file may appear in more than one area when it genuinely covers both; keep the
 * areas aligned with the source modules so "I changed X" maps to an obvious area.
 */
export const AREAS = {
  caves: ['caveCommands', 'teleport', 'caveGeneration', 'mountainTerrain', 'worldSpawn', 'treePlacement', 'worldStructures', 'structureMonsterRoom', 'structureGeode', 'structureMineshaft', 'structureAncientCity', 'spawnEligibilityRegression', 'spawnPlacementRegression', 'mapManager', 'survivalSaveLoad'],
  end: ['endSurvival', 'endCredits', 'endPortal', 'enderDragonParity', 'endermanParity', 'endermiteParity', 'shulkerBullet', 'structureEndFeatures', 'structureEndCity', 'dragonEgg', 'survivalSaveLoad', 'mapManager', 'worldChunkCache', 'bed', 'waterRules', 'dimensionSpawns', 'bedExplosion', 'portalTravel'],
  nether: ['netherSurvival', 'nether', 'netherParity', 'netherPortal', 'netherCombat', 'netherLavaEscape', 'piglin', 'piglinBruteParity', 'blazeParity', 'striderParity', 'cubeHopParity', 'zombifiedPiglinParity', 'witherSkeletonParity', 'monsterSpawner', 'farming', 'worldStructures', 'worldSpawn', 'playerDeathRespawn', 'survivalSaveLoad', 'dimensionSpawns', 'portalTravel'],
  fishing: ['fishingParity', 'fishingExperience', 'rails', 'vehicles_transport', 'waterFlow'],
  // --- agent / terminal ---
  agent: ['multiplayerKnockback', 'replicationRunner', 'blCli', 'agentGuidance', 'cheatsCreativeDefault', 'agentPerception', 'paintings', 'geminiAgent', 'terminalControls', 'agentTerminalControls', 'forwardView', 'domWiring', 'startScreenBinding', 'playerBot', 'agentControlServer', 'agentControlBridge', 'agentControlTools', 'agentControlDocs', 'mcpPackage', 'mcpGuestJoin', 'mcpBridgingSafety', 'forgetOldKeys', 'requestTracker'],
  // --- mobs ---
  // The natural-spawning subsystem's own tests come first because they are the slowest files in the
  // area and a failure there is the most informative:
  //   mobSpawningParity            caps, the three-part light rule, generated tables, despawning
  //   mobSpawningTravel            the regression that pins the "mobs only near spawn" bug
  //   spawnPlacementRegression     collision, fluid and heightmap rules (incl. fish-on-ice)
  //   spawnEligibilityRegression   biome-boundary membership, structures, dimension eligibility
  //   spawnConstructionIntegration the real spawner + constructor wiring, pack walks, generation
  mob: ['mobCollisionGrid', 'pathBackoff', 'villagerJobSearch', 'ironGolemTargeting', 'reefMobOptimization', 'mobSpawningParity', 'lushGeneration', 'presetWildlife', 'mobStatsReport', 'mobSpawningTravel', 'spawnPlacementRegression', 'spawnEligibilityRegression', 'spawnConstructionIntegration', 'heldBlockInteraction', 'mobs', 'mobs_expansion', 'mobAnatomy', 'mobSkins', 'mobHitFeedback', 'mobUpdateIsolation', 'mobInspectorEntry', 'mobJitter', 'mobShowcase', 'mobDebugSession', 'mobDebugSessionMore', 'mobDebugLabels', 'mob_collision_breeding', 'horseBreeding', 'horseParity', 'packEquineParity', 'striderParity', 'squidParity', 'witherSkeletonParity', 'zombifiedPiglinParity', 'chicken', 'cow', 'cat', 'ghast', 'ghast-arrows', 'piglin', 'villagers_economy', 'mcData', 'hazardAvoidance', 'netherLavaEscape', 'netherLavaEscapeInspector', 'blazeParity', 'sheepParity', 'mooshroomParity', 'salmonParity', 'dolphinParity', 'endermanParity', 'slimeParity', 'wolfParity', 'spiderParity', 'caveSpiderParity', 'silverfishParity', 'endermiteParity', 'rabbitParity', 'batParity', 'musicDiscs', 'drownedDrops', 'drownedTrident', 'foxParity', 'beeParity', 'babyGrowthParity', 'spawnEggCoverage', 'mobUpdateSmoke', 'ambientLocomotion', 'cubeHopParity', 'goatParity', 'llamaParity', 'turtleParity', 'frogParity', 'tadpoleParity', 'parrotParity', 'phantomParity', 'polarBearParity', 'pandaParity', 'breedingInheritance', 'spawnVariantOptions', 'armadilloParity', 'undeadVariantsParity', 'windChargeBreeze', 'snifferParity', 'allayParity', 'groundednessSpawn', 'wanderingTraderParity', 'camelParity', 'parchedParity', 'creakingParity', 'killerBunnyParity', 'snowGolemParity', 'illusionerParity', 'undeadHorseParity', 'mobVisualAssets', 'mobVisualUv', 'mobWikiParity', 'mobShowcaseCoverage', 'waterAnimalAirSupply', 'frogspawn', 'sunlightShelter'],
  // --- redstone and machines ---
  redstone: ['redstone', 'redstoneParity', 'redstoneTutorials', 'redstoneMachines', 'advanced_redstone', 'numericBlockIdSafety', 'redstoneGames', 'doors', 'door', 'doorCollision', 'rails', 'riding', 'vehicles_transport'],
  // --- studio tools ---
  studio: ['buildingStudio', 'buildingStudioAgent', 'buildingStudioGround', 'buildingStudioSchem', 'buildingContext', 'studioBugs', 'studioEditTarget', 'studioSchematicWatch', 'gameBlockStates', 'blockEntityFidelity', 'inGameBlockEntities'],
  // --- item/block Inspector scenarios and their actual world rendering ---
  resources: ['vegetationRendering', 'atlasFiltering', 'textureAtlasResolution', 'resourceInspector', 'resourceInspectorEntry', 'resourceBehaviorShowcase', 'flowerAudit', 'resourceVisualPolicy', 'resourcePack', 'skinPack', 'furnaceRendering', 'furnace', 'mesherFaceTextures', 'paneCarpetGeometry', 'resourceGameplayScenarios', 'blockIcons', 'stainedGlass', 'biomeInspector'],
  // --- vanilla structure generation ---
  structures: ['structureEngine', 'structureInspectorSession', 'structureInspectorPage', 'structureParityDoc', 'structureTemplate', 'structureProcessors', 'structureIgloo', 'structureRuinedPortal', 'structureNetherFossil', 'structureShipwreck', 'structureOceanRuin', 'structureDesertPyramid', 'structureSwampHut', 'structureJigsaw', 'structurePieceIndex', 'structureTerrainAdaptation', 'structureTerrainWiring', 'structurePillagerOutpost', 'structureGoldenSeeds', 'structurePlacementDensity', 'structureInspectorPanels', 'structureInspectorPanelsUi', 'structureInspectorEntry', 'structureInspectorGeometry', 'worldStructures', 'structureJigsawChains', 'structureVillage', 'structureBastion', 'structureTrialChambers', 'structureAncientCity', 'structureEndCity', 'structureMansion', 'structureTrailRuins', 'structureJunglePyramid', 'structureMonument', 'villageTemple', 'portalTravel'],
  io: ['ioNbt', 'ioStructures', 'zipReader', 'blockyBuilderPortfolio'],
  // --- world, terrain, fluids ---
  world: ['worldTeardown', 'terrainWorker', 'pointerLock', 'camelFlee', 'knockbackType', 'reefPerformance', 'worldSpawn', 'worldMechanisms', 'worldChunkCache', 'chunkStreaming', 'treePlacement', 'biomes', 'biomeModalInteraction', 'nether', 'netherPortal', 'netherCombat', 'netherParity', 'water', 'waterFlow', 'settleWater', 'fallingBlocks', 'waterSplashes', 'lava', 'lavaPlacement', 'fire', 'dimensionSpawns', 'sunflower', 'biomeInspector', 'weatherShowcase'],
  // --- building and inventory ---
  build: ['creativeInventory', 'chest', 'furnace', 'armor', 'armor_ui', 'enchanting', 'item_icons', 'spawnEggCatalogue', 'workstations_functional', 'contextMenuSuppression', 'beaconManager', 'beaconBeam', 'smithing', 'smithingParity', 'trimVisuals', 'bed', 'recipeBook', 'bedExplosion'],
  // --- sharing a world with friends ---
  sharing: ['multiplayerKnockback', 'shareCode', 'shareProtocol', 'peerLink', 'resilientPeerLink', 'shareRelay', 'shareWorker', 'shareGameChannel', 'shareSkins', 'shareCombat', 'shareSession', 'shareRendezvous', 'shareServer', 'worldSyncManager', 'worldTeardown', 'pvpMechanics', 'pvpParity'],
  // --- combat, skills, progression ---
  combat: ['arrows', 'skills', 'tournament', 'dungeonMode', 'farming', 'pvpMechanics', 'pvpParity'],
  // --- rendering and effects ---
  terrain: ['terrainStability', 'lightweightShader', 'fire', 'snowLighting', 'mesherFaceTextures'],
  render: ['iceWaterShadows', 'frameCostCaches', 'graphicsSettings', 'mobLod', 'vegetationRendering', 'atlasFiltering', 'textureAtlasResolution', 'reefPerformance', 'debugTargetLine', 'visualEffects', 'lightweightShader', 'mesherParity', 'coveredShapedFaces', 'chunkBatches', 'mesherPerformance', 'meshTimeSlicing', 'mesherFaceTextures', 'progressOverlay', 'confirmDialog', 'weatherParity', 'ambientParticles'],
  // --- survival parity: how much of vanilla's content the game can express ---
  survival: ['entityPush', 'placementObstruction', 'survivalStart', 'survivalClock', 'survivalProgression', 'experienceCurveParity', 'playerDeathRespawn', 'endermanBehavior', 'survivalParity', 'mcData', 'voxelIdRange', 'vanillaRecipes', 'dataPack', 'dataPackRuntime', 'dataPackStore', 'dataPackBundle', 'dataPackPanel', 'dataPackWorldEffects', 'dataPackPresets', 'presetWildlife', 'dataPackPresetUi', 'recipeIngredients', 'recipeCoverage', 'recipeFreshness', 'contentGap', 'shapelessRecipes', 'smeltingData', 'smeltingVanilla', 'hungerModel', 'gamerules', 'difficultyWiring', 'cheatsToggle', 'commandParity', 'fishingParity', 'modStructure', 'statusEffects', 'statusEffectWikiLedger', 'statusEffectsStubs', 'fallDamage', 'effectReaders', 'miningEffects', 'enchantmentEffects', 'thornsReflect', 'waterMovement', 'sneakEdge', 'waterRules', 'swimming', 'waterPass', 'renderBudget', 'brewingParity', 'potionParity', 'mobEffects', 'lingeringPotion', 'tippedArrows', 'fireworkLaunch', 'durability', 'armourDurability', 'shieldDurability', 'materialExclusions', 'mobLootParity', 'mobDropLive', 'lootingChance', 'docsParityFigures', 'slabGeometry', 'paneCarpetGeometry', 'bedColors', 'blockItems', 'itemForms', 'placeableItems', 'stairGeometry', 'candleChainGeometry', 'fenceGeometry', 'wallGeometry', 'mechanismGeometry', 'bannerGeometry', 'doorWoodTypes', 'signGeometry', 'smallShapes', 'blockNameMatch', 'blockRegistryIntegrity', 'harvestLookup', 'harvestVariants', 'duplicateIds', 'blockDrops', 'blockDropParity', 'oreMiningDrops', 'interactionSources', 'archaeology', 'addedItems', 'itemGapDoc', 'nameParity', 'foodSaturation', 'hungerWiring', 'eating', 'globeBannerPattern', 'mapItem', 'vanillaAliases', 'fishBuckets', 'bundles', 'toolFacts', 'bottles', 'hives', 'hangingPlantGeometry', 'resourceInspector', 'resourceInspectorEntry', 'itemDefinitions', 'itemPotions', 'itemPotionDrinking', 'itemFurnaceTables', 'itemStackSizes'],
  // --- save/load ---
  mods: ['voxelDash', 'tournamentHouseRules', 'voxelDash3d', 'modStructure', 'modInspectorIsolation', 'rescueAdventure', 'modAuthority', 'campaignPresentation', 'skywars', 'skywarsClient', 'skywarsMaps', 'bedrockBridging', 'bedwars', 'bedwarsClient'],
  persist: ['mapManager', 'survivalSaveLoad', 'mobStatePersistence'],
  tooling: ['testGraph', 'testSlots', 'agentsMap', 'publicTree', 'dataLock']
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
  lines.push('', 'Options:',
    '  --changed          the tests nearest to the files changed in the working tree (git)',
    '  --files <a,b>      the same, for the files you name instead of the git list',
    '  --base <ref>       with --changed, also count files changed since <ref> (for example origin/master)',
    '  --depth <n>        with --changed, every test up to <n> imports away (default: the nearest tier)',
    '  --deep             with --changed, every test that can reach a changed file',
    '  --max <n>          refuse more than <n> files unless --yes (default 60)',
    '  --yes              run even when the selection is larger than --max',
    '  --no-repeat        do not run changed test files three times',
    '  --all              run every test file',
    '  --match <text>     run files whose name contains <text>',
    '  --isolated         one process per file (slower to start, cleaner)',
    '  --no-slots         do not wait for a machine-wide test slot',
    '  --list             show areas and their files; with --changed, the selection and why',
    '');
  return lines.join('\n');
}

/** How many times a changed or new test file runs in changed mode: a flaky test should not pass by luck. */
export const CHANGED_TEST_RUNS = 3;

/**
 * Changed mode: from changed files to the tests to run.
 * @returns {{files: string[], repeat: string[], report: string[], refused: boolean}}
 */
export function planChanged({ changed, graph, depth = 'nearest', max = 60, yes = false }) {
  const { reach, unreached } = reachTests(graph, changed);
  const { selected, skipped } = pickTests(reach, { depth });
  const report = [];
  report.push(`${changed.length} changed file(s), ${selected.size} test file(s) selected` +
    (skipped ? `, ${skipped} more further away (--depth 2 or --deep to add them)` : ''));
  const rows = [...selected].sort((a, b) => a[1].distance - b[1].distance || a[0].localeCompare(b[0]));
  const refused = rows.length > max && !yes;
  const shown = refused ? rows.slice(0, 20) : rows;
  for (const [test, { distance, chain }] of shown) {
    report.push(`  ${test}  [${distance}] ${chain.slice(1).join(' <- ') || '(changed)'}`);
  }
  if (shown.length < rows.length) report.push(`  ... and ${rows.length - shown.length} more (--list shows them all)`);
  const untested = unreached.filter(f => !isTestFile(f));
  if (untested.length) {
    report.push('', 'No unit test reaches these files (Playwright e2e or test:preflight may cover them):',
      ...untested.map(f => `  ${f}`));
  }
  const files = [...selected.keys()].sort();
  const repeat = files.filter(f => changed.includes(f));
  if (refused) {
    report.push('', `Refusing to run ${files.length} files (more than --max ${max}). ` +
      'Name fewer files with --files, use --list to see why, or pass --yes.');
  }
  return { files, repeat, report, refused };
}

function runNodeTests(files, isolated) {
  const args = ['--test'];
  if (!isolated) args.push('--test-isolation=none');
  args.push(...files);
  // stdio is inherited on purpose: piping the child's output needs platform
  // plumbing that sandboxes commonly block.
  return new Promise(resolve => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', cwd: root });
    child.on('exit', code => resolve(code ?? 1));
  });
}

async function main(argv) {
  const areas = [];
  let match = null, all = false, isolated = false, list = false;
  let changedMode = false, named = null, base = null, depth = 'nearest', max = 60, yes = false;
  let repeatChanged = true, slots = true;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') all = true;
    else if (arg === '--isolated') isolated = true;
    else if (arg === '--list' || arg === 'list') list = true;
    else if (arg === '--match') match = argv[++i];
    else if (arg === '--changed') changedMode = true;
    else if (arg === '--files') {
      changedMode = true;
      named = (argv[++i] || '').split(',').map(s => toPosix(s.trim())).filter(Boolean);
    }
    else if (arg === '--base') { changedMode = true; base = argv[++i]; }
    else if (arg === '--depth') depth = Number(argv[++i]);
    else if (arg === '--deep') depth = Infinity;
    else if (arg === '--max') max = Number(argv[++i]);
    else if (arg === '--yes') yes = true;
    else if (arg === '--no-repeat') repeatChanged = false;
    else if (arg === '--no-slots') slots = false;
    else if (arg === '--help' || arg === '-h') { console.log(usage()); return 0; }
    else if (arg.startsWith('-')) { console.error(`Unknown option: ${arg}\n`); console.error(usage()); return 2; }
    else areas.push(arg);
  }
  if (depth !== 'nearest' && !(depth >= 1)) { console.error('--depth needs a number of at least 1'); return 2; }

  let files, repeat = [], label;
  if (changedMode) {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    const changed = named ?? changedFiles(root, git, base);
    if (!changed.length) { console.log('No changed files.'); return 0; }
    const plan = planChanged({ changed, graph: buildGraph(root), depth, max, yes: yes || list });
    console.log(plan.report.join('\n'));
    if (list) return 0;
    if (plan.refused) return 2;
    if (!plan.files.length) { console.log('\nNothing to run.'); return 0; }
    files = plan.files.map(f => join(root, f));
    repeat = repeatChanged ? plan.repeat.map(f => join(root, f)) : [];
    label = named ? 'named files' : 'changed files';
    console.log('');
  } else {
    if (list) {
      for (const [name, entries] of Object.entries(AREAS)) {
        console.log(`\n${name}:`);
        for (const f of entries) console.log(`  ${f}.test.js`);
      }
      console.log(`\n(everything: ${allTestFiles().length} files)`);
      return 0;
    }
    if (!all && !areas.length && !match) {
      console.log(usage());
      return 2;
    }
    try {
      files = resolveFiles({ areas, match, all });
    } catch (err) {
      console.error(err.message);
      return 2;
    }
    label = all ? 'all' : [...areas, match ? `match:${match}` : null].filter(Boolean).join(', ');
  }
  if (!files.length) {
    console.error('No test files matched.');
    return 2;
  }

  if (slots) {
    const count = Number(process.env.BLOCKYLAND_TEST_SLOTS) || DEFAULT_SLOTS;
    await acquireSlot({ slots: count, label: `${label} (${files.length} files)` });
  }

  console.log(`Running ${files.length} file(s) for: ${label}${isolated ? ' (isolated)' : ''}\n`);
  let code = await runNodeTests(files, isolated);
  for (let run = 2; code === 0 && repeat.length && run <= CHANGED_TEST_RUNS; run++) {
    console.log(`\nChanged test file(s), run ${run} of ${CHANGED_TEST_RUNS}: ${repeat.length} file(s)\n`);
    code = await runNodeTests(repeat, isolated);
    if (code !== 0) console.error(`\nFLAKY: a changed test file passed on run 1 and failed on run ${run}.`);
  }
  return code;
}

if (process.argv[1] && process.argv[1].endsWith('test.mjs')) main(process.argv.slice(2)).then(code => process.exit(code));
