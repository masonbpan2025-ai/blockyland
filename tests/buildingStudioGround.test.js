// Building Studio is not a world. There is no terrain, only an invisible ground marked by a grid: the player
// stands and builds on it, cannot go below it, and nothing can be placed under it. It is daytime and clear, and
// stays that way unless the player asks the Agent Terminal for a different time or weather.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { BuildingStudioManager, STUDIO_GROUND_Y } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';
import { WorldAgent } from '../src/worldAgent.js';

function studioWorld() {
  const world = new World();
  world.generationMode = 'authored';
  world.floorY = STUDIO_GROUND_Y;
  return world;
}

function studioGame() {
  const world = new World();
  world.generationMode = 'authored';
  const weatherCalls = [];
  return {
    world,
    scene: new THREE.Scene(),
    player: { position: new THREE.Vector3(30, 40, 30), velocity: new THREE.Vector3(1, 1, 1), yaw: 0, pitch: 0.4, gamemode: 'creative', isFlying: true },
    gamerules: { doDaylightCycle: true, doWeatherCycle: true, doMobSpawning: true, keepInventory: true },
    worldTime: 18000,
    weather: { setWeather: w => weatherCalls.push(w) },
    weatherCalls,
    loadChunksAroundPlayer() {},
    refreshDirtyChunks() {}
  };
}

test('the ground is invisible and solid: below it reads as a barrier that is never stored', () => {
  const world = studioWorld();
  assert.equal(world.getVoxel(0, STUDIO_GROUND_Y - 1, 0), BLOCKS.BARRIER, 'something to stand on and build against');
  assert.equal(world.getVoxel(123, 1, -456), BLOCKS.BARRIER, 'everywhere, not just near the origin');
  assert.equal(world.getVoxel(0, STUDIO_GROUND_Y, 0), BLOCKS.AIR, 'and open air on top');
  world.setVoxel(0, STUDIO_GROUND_Y, 0, BLOCKS.STONE);
  const chunk = world.getChunk(0, 0);
  for (let y = 0; y < STUDIO_GROUND_Y; y++) assert.equal(chunk.getVoxel(0, y, 0), BLOCKS.AIR, 'the chunk holds no ground blocks, so nothing is meshed');
});

test('nothing can be built below the ground', () => {
  const world = studioWorld();
  world.setVoxel(2, STUDIO_GROUND_Y - 1, 2, BLOCKS.STONE);
  world.setVoxel(2, 0, 2, BLOCKS.STONE);
  assert.equal(world.getChunk(0, 0)?.getVoxel(2, STUDIO_GROUND_Y - 1, 2) ?? BLOCKS.AIR, BLOCKS.AIR);
  world.setVoxel(2, STUDIO_GROUND_Y, 2, BLOCKS.STONE);
  assert.equal(world.getVoxel(2, STUDIO_GROUND_Y, 2), BLOCKS.STONE, 'the first layer above it is fine');
});

test('there is no terrain: a studio chunk is empty air above the ground', () => {
  const world = studioWorld();
  world.getOrCreateChunk(3, -2);
  for (let y = STUDIO_GROUND_Y; y < 40; y++) assert.equal(world.getVoxel(50, y, -20), BLOCKS.AIR);
});

test('an ordinary world has no such ground', () => {
  const world = new World();
  world.generationMode = 'authored';
  assert.equal(world.floorY, -Infinity);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.AIR);
  world.setVoxel(0, 1, 0, BLOCKS.STONE);
  assert.equal(world.getVoxel(0, 1, 0), BLOCKS.STONE);
});

test('entering the studio sets the ground, the grid, daytime and clear skies, and stands the player on it', () => {
  const game = studioGame();
  const studio = new BuildingStudioManager(game);
  game.buildingStudio = studio;
  studio.enterStudio();

  assert.equal(game.world.floorY, STUDIO_GROUND_Y);
  const grid = game.scene.getObjectByName('building-studio-ground');
  assert.ok(grid, 'a grid marks where the ground is');
  assert.ok(Math.abs(grid.position.y - STUDIO_GROUND_Y) < 0.01);

  assert.equal(game.worldTime, 6000, 'it starts at midday');
  assert.equal(game.gamerules.doDaylightCycle, false, 'and the clock holds until the player asks for another time');
  assert.equal(game.gamerules.doWeatherCycle, false);
  assert.equal(game.gamerules.doMobSpawning, false);
  assert.deepEqual(game.weatherCalls, ['clear']);

  assert.equal(game.player.position.y, STUDIO_GROUND_Y, 'standing on the ground');
  assert.equal(game.player.isFlying, false, 'not flying, but free to start');
  assert.equal(game.player.gamemode, 'creative');
  // Yaw 0 looks toward -Z; the build origin is at +Z.
  assert.equal(game.player.yaw, Math.PI);
});

test('the grid follows the player in whole steps so its lines stay on block edges', () => {
  const game = studioGame();
  const studio = new BuildingStudioManager(game);
  studio.enterStudio();
  game.player.position.set(203.7, 20, -91.2);
  studio.update();
  const grid = game.scene.getObjectByName('building-studio-ground');
  assert.equal(grid.position.x, 200);
  assert.equal(grid.position.z, -88);
});

test('leaving the studio removes the ground and the grid and gives the player their rules back', () => {
  const game = studioGame();
  const studio = new BuildingStudioManager(game);
  studio.enterStudio();
  studio.exitStudio();
  assert.equal(game.world.floorY, -Infinity);
  assert.equal(game.scene.getObjectByName('building-studio-ground'), undefined);
  assert.deepEqual(game.gamerules, { doDaylightCycle: true, doWeatherCycle: true, doMobSpawning: true, keepInventory: true });
});

test('rebuilding a parametric building clears its old blocks back to air, not to grass and dirt', () => {
  const game = studioGame();
  const studio = new BuildingStudioManager(game);
  studio.enterStudio();
  studio.currentBuilding = BuildingLibrary.getAllBuildings().find(b => b.id === 'stairs');
  studio.currentParameters = { ...Object.fromEntries((studio.currentBuilding.parameters || []).map(p => [p.id, p.default])) };
  studio.rebuildCurrentBuilding();
  const first = [...studio.placedVoxels];
  assert.ok(first.length > 0);
  assert.ok(first.every(v => v.y >= STUDIO_GROUND_Y), 'the building stands on the ground');
  studio.clearCurrentBuilding();
  for (const v of first) assert.equal(game.world.getVoxel(v.x, v.y, v.z), BLOCKS.AIR);
});

test('the agent builds on the ground, not into it', async () => {
  const game = studioGame();
  game.sounds = { playMagic() {}, playLevelUp() {}, playClick() {} };
  game.rebuildChunkMesh = () => {};
  const studio = new BuildingStudioManager(game);
  game.buildingStudio = studio;
  studio.enterStudio();
  const agent = new WorldAgent(game);
  const spot = agent.calculateSafePlacement(4, 3, 4);
  assert.equal(spot.baseY, STUDIO_GROUND_Y, 'the bottom layer sits on the ground instead of replacing it');
});

test('starting Building Studio does not generate a world', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8');
  const start = main.slice(main.indexOf('async startBuildingStudio()'), main.indexOf('failWorldStart(err) {'));
  assert.doesNotMatch(start, /loadWorldProgressively/, 'no terrain generation or progress bar');
  assert.match(start, /generationMode = 'authored'/, 'missing chunks are empty air');
  assert.match(start, /teardownWorld\(this\)/, 'and nothing is left over from an earlier world');
});

test('the day clock honours doDaylightCycle, which the time requests rely on in the studio', () => {
  const main = readFileSync(resolve(process.cwd(), 'src/main.js'), 'utf8');
  assert.match(main, /doDaylightCycle !== false/);
});
