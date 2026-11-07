// The Weather Inspector's showcase (weather-inspector.html): every weather rule the game claims to share with
// Minecraft Java, each one run against the game's own weather code on a small stand-in world, with the wiki's words
// beside it and a view the page shows while it runs (a biome, a weather, sometimes a roof, a rod or a bolt).
//
// DOM-free, so tests/weatherShowcase.test.js runs every scenario in Node exactly as the page does. Expected values
// come from the Minecraft Wiki (Weather, Rain, Thunderstorm, Lightning, Cauldron, Farmland) and from Java's
// ServerLevel, never from the code under test.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { WeatherClock, WEATHER_DURATIONS } from './weatherClock.js';
import { WeatherManager } from './weather.js';
import { precipitationForBiome, precipitationColumn, precipitationAt } from './weatherRules.js';
import { weatherSurfaceTick, applyLightningStrike, redirectLightning } from './weatherGameplay.js';
import { igniteActor, applyHeat } from './heat.js';
import { isWaterNearby } from './farming.js';
import { Redstone } from './redstone.js';
import { skyDarkenFor, skyDarkenForDimension } from './spawning/spawnClock.js';
import { monsterIsDarkEnoughToSpawn } from './spawning/mobSpawnPredicates.js';

/** A flat 5x5-chunk stand-in world of one biome: stone at y 0, air above, and whatever a scenario places. */
export function standInWorld(biome = 'plains') {
  const edits = new Map(), chunks = new Map();
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) chunks.set(`${cx},${cz}`, { cx, cz, weatherRevision: 0 });
  return {
    selectedBiome: biome, dimension: 'overworld', seaLevel: 22, maxHeight: 64, chunks,
    getBiome() { return this.selectedBiome; },
    getChunk(cx, cz) { return chunks.get(`${cx},${cz}`); },
    getVoxel(x, y, z) { return edits.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`) ?? (y === 0 ? BLOCKS.STONE : BLOCKS.AIR); },
    setVoxel(x, y, z, id) { edits.set(`${x},${y},${z}`, id); const c = this.getChunk(Math.floor(x / 16), Math.floor(z / 16)); if (c) c.weatherRevision++; },
    getWaterLevel() { return 0; }, getLavaLevel() { return 0; },
  };
}

/** The game's WeatherManager on a stand-in world, with a fixed random, a sound stub and lights to draw with. */
export function standInWeather(biome = 'plains', { random = () => 0.5 } = {}) {
  const world = standInWorld(biome);
  const sounds = { starts: 0, thunder: 0, startRainSound() { this.starts++; }, stopRainSound() {}, setRainVolume() {}, playThunder() { this.thunder++; }, playEndFlash() {} };
  // Particles need a spread of numbers (a fixed one stacks every drop on one spot); the rules get the fixed random.
  let seed = 123; const particleRandom = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const weather = new WeatherManager(new THREE.Scene(), sounds, { random, particleRandom });
  const game = { world, weather, gamerules: { doWeatherCycle: false, doFireTick: true }, difficulty: 'normal',
    player: { position: new THREE.Vector3(0.5, 1, 0.5), gamemode: 'creative', health: 20 } };
  world.game = game; weather.game = game;
  const ambient = new THREE.HemisphereLight(), sun = new THREE.DirectionalLight(), fog = new THREE.Fog(0x88bbee, 90, 128), background = new THREE.Color(0x88bbee);
  const tick = (dt) => { ambient.intensity = 1.75; sun.intensity = 2.15; background.setHex(0x88bbee); weather.update(dt, game.player.position, ambient, sun, fog, background); };
  return { world, weather, game, sounds, tick, ambient, sun };
}

/** A mob manager stand-in: the mobs a strike may hit, and the spawns it may cause. */
function withMobs(f) {
  const manager = { game: f.game, mobs: [],
    spawnMob(type, x, y, z) { const mesh = new THREE.Group(); mesh.position.set(x, y, z); const m = { type, mesh, health: 20 }; this.mobs.push(m); return m; },
    spawnZombifiedPiglin(x, y, z) { return this.spawnMob('zombified_piglin', x, y, z); },
    damageMob(m, n) { m.health -= n; } };
  f.game.mobs = manager;
  return manager;
}

/** A player stand-in that records the damage it takes. */
function standInPlayer(x, y, z, gamemode = 'survival') {
  return { position: new THREE.Vector3(x, y, z), gamemode, health: 20, isDead: false, hits: [],
    takeDamage(amount, source, type) { this.hits.push({ amount, type }); this.health -= amount; } };
}

/** java.util.Random's nextInt with a fixed answer: `top` gives n - 1, else 0. */
const fixedInt = (top) => ({ nextInt: (n) => (top ? n - 1 : 0) });

/** One result: every check of the scenario, with what was seen. */
function verdict(checks) {
  const failed = checks.filter(([ok]) => !ok);
  return { ok: failed.length === 0, detail: checks.map(([ok, text]) => `${ok ? '✓' : '✗'} ${text}`).join('\n') };
}

const SNOWY = ['snowy_plains', 'snowy_taiga', 'ice_spikes', 'frozen_river', 'grove', 'snowy_slopes', 'jagged_peaks', 'frozen_peaks'];
const DRY = ['desert', 'savanna', 'badlands'];

/**
 * Every scenario: `{ id, group, title, wiki, view, run }`. `view` is what the page shows while it runs:
 * `{ biome, weather: 'clear' | 'rain' | 'thunder', night?, props?: [{dx, dy, dz, block}], bolt?: {dx, dz} }` with
 * offsets from the spawn's surface. `run()` returns `{ ok, detail }`.
 */
export function weatherScenarios() {
  return [
    // --- Precipitation ---
    { id: 'rain-temperate', group: 'Precipitation', title: 'Rain falls in temperate biomes',
      wiki: 'Rain: "Rain occurs in all biomes except those that are snowy or too dry."',
      view: { biome: 'plains', weather: 'rain' },
      run() {
        const f = standInWeather('plains'); f.weather.setWeather('rain'); f.tick(0.1);
        const r = verdict([
          [precipitationForBiome('plains') === 'rain', `plains: ${precipitationForBiome('plains')}`],
          [precipitationForBiome('forest') === 'rain', `forest: ${precipitationForBiome('forest')}`],
          [f.weather.precipitationAt(0.5, 3, 0.5) === 'rain', 'the open ground is rained on'],
          [f.weather.rainMesh.visible && !f.weather.snowMesh.visible, 'rain streaks drawn, no snowflakes'],
          [f.sounds.starts === 1, 'the rain sound starts'],
        ]);
        f.weather.dispose(); return r;
      } },
    { id: 'snow-cold', group: 'Precipitation', title: 'Snow falls instead in snowy biomes',
      wiki: 'Snowfall: "Snow falls instead of rain in snowy biomes ... when the temperature is below 0.15."',
      view: { biome: 'snowy_plains', weather: 'rain' },
      run() {
        const f = standInWeather('snowy_plains'); f.weather.setWeather('rain'); f.tick(0.1);
        const kinds = SNOWY.map((b) => [b, precipitationForBiome(b)]);
        const r = verdict([
          ...kinds.map(([b, k]) => [k === 'snow', `${b}: ${k}`]),
          [f.weather.snowMesh.visible && !f.weather.rainMesh.visible, 'snowflakes drawn, no rain streaks'],
          [f.sounds.starts === 0, 'snow is silent (no rain sound)'],
        ]);
        f.weather.dispose(); return r;
      } },
    { id: 'dry-biomes', group: 'Precipitation', title: 'Deserts, savannas and badlands stay dry, but the sky darkens',
      wiki: 'Rain: "In deserts, savannas and badlands ... it does not rain, but the sky still darkens."',
      view: { biome: 'desert', weather: 'thunder' },
      run() {
        const f = standInWeather('desert'); f.weather.setWeather('thunder'); f.tick(0.5);
        const r = verdict([
          ...DRY.map((b) => [precipitationForBiome(b) === 'none', `${b}: ${precipitationForBiome(b)}`]),
          [!f.weather.rainMesh.visible && !f.weather.snowMesh.visible, 'nothing falls'],
          [f.sun.intensity < 2.15, `the sun dims anyway (${f.sun.intensity.toFixed(2)} of 2.15)`],
        ]);
        f.weather.dispose(); return r;
      } },
    { id: 'altitude-snow', group: 'Precipitation', title: 'Rain turns to snow high up',
      wiki: 'Biome: temperature falls by 0.00125 per block above y 80, so high mountains of a rainy biome get snow.',
      view: { biome: 'jagged_peaks', weather: 'rain' },
      run() {
        // The world is 64 high, so heights above its sea level count four times (src/weatherRules.js).
        const low = precipitationForBiome('taiga', 22), high = precipitationForBiome('taiga', 60), plains = precipitationForBiome('plains', 60);
        return verdict([[low === 'rain', `taiga at sea level: ${low}`], [high === 'snow', `taiga 38 blocks up: ${high}`], [plains === 'rain', `warm plains at the same height: ${plains}`]]);
      } },
    { id: 'roof', group: 'Precipitation', title: 'A roof keeps the rain off, even glass, leaves or a slab',
      wiki: 'Rain: "Rain ... is blocked by any block that blocks motion, including glass and leaves."',
      view: { biome: 'plains', weather: 'rain', props: roofProps(BLOCKS.GLASS) },
      run() {
        const checks = [];
        for (const [name, block] of [['stone', BLOCKS.STONE], ['glass', BLOCKS.GLASS], ['oak leaves', BLOCKS.OAK_LEAVES], ['oak slab', BLOCKS.OAK_SLAB]]) {
          const w = standInWorld(); w.setVoxel(0, 6, 0, block);
          checks.push([precipitationAt(w, 0.5, 3, 0.5) === 'none' && precipitationAt(w, 0.5, 8, 0.5) === 'rain', `${name} roof: dry under it, wet on top`]);
        }
        return verdict(checks);
      } },
    { id: 'other-dimensions', group: 'Precipitation', title: 'No weather in the Nether or the End',
      wiki: 'Weather: "Weather does not occur in the Nether or the End."',
      view: { biome: 'nether_wastes', weather: 'thunder' },
      run() {
        const checks = [];
        for (const dim of ['nether', 'end']) {
          const f = standInWeather(); f.weather.setWeather('thunder'); f.world.dimension = dim; f.weather.lightningTimer = 0; f.tick(1);
          checks.push([!f.weather.isRaining() && !f.weather.rainMesh.visible, `${dim}: no rain while the Overworld storms`]);
          checks.push([f.weather.triggerLightning() === false && f.sounds.thunder === 0, `${dim}: no lightning, no thunder`]);
          f.weather.dispose();
        }
        return verdict(checks);
      } },

    // --- The weather cycle ---
    { id: 'durations', group: 'Weather cycle', title: 'How long clear skies, rain and storms last',
      wiki: 'Weather: clear 12000-180000 ticks (0.5-7.5 days), rain 12000-24000 ticks, thunder 3600-15600 ticks, with thunder on its own timer.',
      view: { biome: 'plains', weather: 'clear' },
      run() {
        const checks = [
          [String(WEATHER_DURATIONS.clear) === '12000,180000', `clear: ${WEATHER_DURATIONS.clear.join('-')} ticks`],
          [String(WEATHER_DURATIONS.rain) === '12000,24000', `rain: ${WEATHER_DURATIONS.rain.join('-')} ticks`],
          [String(WEATHER_DURATIONS.thunder) === '3600,15600', `thunder: ${WEATHER_DURATIONS.thunder.join('-')} ticks`],
        ];
        for (const sample of [0, 0.999999]) {
          const c = new WeatherClock(() => sample); c.set('rain');
          checks.push([c.rainTicks >= 12000 && c.rainTicks <= 24000, `a rain spell drawn at ${sample}: ${c.rainTicks} ticks`]);
        }
        const c = new WeatherClock(() => 0); c.rainTicks = 2; c.thunderTicks = 4; c.advance(0.1);
        checks.push([c.type === 'rain', 'rain starts when its timer runs out']);
        c.advance(0.1); checks.push([c.type === 'thunder', 'thunder joins when its own timer runs out']);
        return verdict(checks);
      } },
    { id: 'thunder-needs-rain', group: 'Weather cycle', title: 'A thunderstorm happens only while it rains',
      wiki: 'Thunderstorm: "A thunderstorm occurs when both the rain and thunder flags are on."',
      view: { biome: 'plains', weather: 'thunder' },
      run() {
        const c = new WeatherClock(() => 0); c.raining = false; c.thundering = true;
        const dry = c.type; c.raining = true; const wet = c.type;
        return verdict([[dry === 'clear', `thunder flag on, rain off: ${dry}`], [wet === 'thunder', `both on: ${wet}`]]);
      } },
    { id: 'sleep', group: 'Weather cycle', title: 'Sleeping through rain clears it',
      wiki: 'Bed: "Sleeping ... also clears the weather" (when the weather cycle is on).',
      view: { biome: 'plains', weather: 'rain', night: true },
      run() {
        const f = standInWeather(); f.game.gamerules.doWeatherCycle = true; f.weather.setWeather('rain'); f.weather.resetAfterSleep();
        const after = f.weather.weatherType;
        const g = standInWeather(); g.game.gamerules.doWeatherCycle = false; g.weather.setWeather('rain'); g.weather.resetAfterSleep();
        const frozen = g.weather.weatherType;
        f.weather.dispose(); g.weather.dispose();
        return verdict([[after === 'clear', `doWeatherCycle on: ${after} after sleeping`], [frozen === 'rain', `doWeatherCycle off: still ${frozen}`]]);
      } },
    { id: 'weather-cycle-rule', group: 'Weather cycle', title: 'doWeatherCycle false freezes the weather; /weather still works',
      wiki: 'Game rule doWeatherCycle: "Whether the weather can change naturally."',
      view: { biome: 'plains', weather: 'clear' },
      run() {
        const c = new WeatherClock(() => 0); c.advance(9000, false); const frozen = c.type;
        c.set('thunder', 2); c.advance(9000, false); const held = c.type; c.advance(2); const ended = c.type;
        return verdict([[frozen === 'clear', `9000 s frozen: still ${frozen}`], [held === 'thunder', `a /weather thunder 2 holds while frozen: ${held}`], [ended === 'clear', `then runs out when the cycle runs: ${ended}`]]);
      } },

    // --- Light and mobs ---
    { id: 'sky-darken', group: 'Light and mobs', title: 'Rain darkens the sky by 3, a storm by 5',
      wiki: 'Light: "Rain reduces the sky light by 3, thunderstorms by 5" (a floor at night, not added to it).',
      view: { biome: 'plains', weather: 'rain' },
      run() {
        const noon = 6000, midnight = 18000;
        const v = { clear: skyDarkenFor(noon, {}), rain: skyDarkenFor(noon, { rain: true }), thunder: skyDarkenFor(noon, { rain: true, thunder: true }), night: skyDarkenFor(midnight, { rain: true, thunder: true }), nether: skyDarkenForDimension('nether', noon, { rain: true }) };
        return verdict([[v.clear === 0, `clear noon: ${v.clear}`], [v.rain === 3, `rainy noon: ${v.rain}`], [v.thunder === 5, `stormy noon: ${v.thunder}`], [v.night === 11, `stormy midnight: ${v.night} (not 16)`], [v.nether === 0, `the Nether: ${v.nether}`]]);
      } },
    { id: 'storm-monsters', group: 'Light and mobs', title: 'Monsters spawn in daylight during a thunderstorm',
      wiki: 'Thunderstorm: "the sky light level is reduced by 10 for the purposes of hostile mob spawning", so they spawn in daytime.',
      view: { biome: 'plains', weather: 'thunder' },
      run() {
        // Full daylight (sky 15), no torches; the dice at their most permissive.
        const open = { skyLight: 15, blockLight: 0, skyDarken: 0, dimension: 'overworld' };
        const clear = monsterIsDarkEnoughToSpawn({ ...open, thunder: false }, fixedInt(true));
        const storm = monsterIsDarkEnoughToSpawn({ ...open, thunder: true }, fixedInt(true));
        const torch = monsterIsDarkEnoughToSpawn({ ...open, blockLight: 1, thunder: true }, fixedInt(true));
        return verdict([[!clear, `clear noon in the open: ${clear ? 'spawns' : 'no spawn'}`], [storm, `stormy noon in the open: ${storm ? 'spawns' : 'no spawn'}`], [!torch, `storm next to a torch (block light 1): ${torch ? 'spawns' : 'no spawn'}`]]);
      } },
    { id: 'extinguish', group: 'Light and mobs', title: 'Rain puts out burning mobs and players',
      wiki: 'Rain: "Rain extinguishes burning mobs and players" (not under a roof).',
      view: { biome: 'plains', weather: 'rain' },
      run() {
        const f = standInWeather(); f.weather.setWeather('rain');
        const out = {}; igniteActor(out, 8); applyHeat(f.world, out, new THREE.Vector3(0, 3, 0), 0.1, () => {});
        const roofed = {}; f.world.setVoxel(5, 6, 5, BLOCKS.STONE); igniteActor(roofed, 8); applyHeat(f.world, roofed, new THREE.Vector3(5, 3, 5), 0.1, () => {});
        f.weather.dispose();
        return verdict([[out.isOnFire === false, 'in the open: put out'], [roofed.isOnFire === true, 'under a roof: still burning']]);
      } },

    // --- Lightning ---
    { id: 'lightning-rate', group: 'Lightning', title: 'How often lightning strikes',
      wiki: 'Thunderstorm: "each loaded chunk has a 1⁄100000 chance each tick to be struck by lightning."',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 6, dz: -4 } },
      run() {
        const f = standInWeather(); // 25 chunks; random 0.5 makes the wait (100000 / (25 x 20)) ln 2 seconds
        const wait = f.weather.nextLightningDelay(), expected = 100000 / (25 * 20) * Math.LN2;
        f.weather.dispose();
        return verdict([[Math.abs(wait - expected) < 1e-6, `median wait with 25 chunks: ${wait.toFixed(1)} s (expected ${expected.toFixed(1)} s)`]]);
      } },
    { id: 'lightning-region', group: 'Lightning', title: 'A bolt strikes everyone in a 6x12x6 box',
      wiki: 'Lightning: "all entities within a 6x12x6 region ... with the bottom edge 3 below the target block are struck".',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 3, dz: 3 } },
      run() {
        const f = standInWeather(); withMobs(f);
        const at = new THREE.Vector3(0, 10, 0);
        const cases = [['9 above', standInPlayer(0, 18.5, 0), 1], ['10 above', standInPlayer(0, 19.5, 0), 0], ['3 below', standInPlayer(0, 7.5, 0), 1], ['4 below', standInPlayer(0, 6.5, 0), 0], ['3.5 aside', standInPlayer(3.5, 10, 0), 0]];
        f.game.players = cases.map((c) => c[1]); applyLightningStrike(f.game, at); f.weather.dispose();
        return verdict(cases.map(([name, p, want]) => [p.hits.length === want, `${name}: ${p.hits.length ? 'struck' : 'missed'}`]));
      } },
    { id: 'lightning-damage', group: 'Lightning', title: 'Lightning deals 5 damage and sets you on fire',
      wiki: 'Lightning: "deals 5 damage ... and sets them on fire"; creative players are unharmed.',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 0, dz: 3 } },
      run() {
        const f = standInWeather(); withMobs(f);
        const a = standInPlayer(0, 1, 0), creative = standInPlayer(1, 1, 0, 'creative'), zombie = f.game.mobs.spawnMob('zombie', -1, 1, 0);
        f.game.players = [a, creative]; applyLightningStrike(f.game, new THREE.Vector3(0, 1, 0)); f.weather.dispose();
        return verdict([[a.hits[0]?.amount === 5 && a.isOnFire, `survival player: ${a.hits[0]?.amount ?? 0} damage, ${a.isOnFire ? 'burning' : 'not burning'}`],
          [a.hits[0]?.type === 'lightning_bolt', `the damage is "${a.hits[0]?.type}" ("was struck by lightning")`],
          [creative.hits.length === 0, 'creative player: unharmed'], [zombie.health === 15 && zombie.isOnFire, `zombie: ${20 - zombie.health} damage, ${zombie.isOnFire ? 'burning' : 'not burning'}`]]);
      } },
    { id: 'lightning-conversions', group: 'Lightning', title: 'Charged creepers, zombified piglins and witches',
      wiki: 'Lightning: creepers become charged creepers, pigs become zombified piglins, villagers become witches.',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: -3, dz: 2 } },
      run() {
        const f = standInWeather(); const m = withMobs(f);
        const creeper = m.spawnMob('creeper', 1, 1, 0), pig = m.spawnMob('pig', 2, 1, 0); pig.name = 'Piggy'; m.spawnMob('villager', -2, 1, 0);
        applyLightningStrike(f.game, new THREE.Vector3(0, 1, 0)); f.weather.dispose();
        const types = m.mobs.map((x) => x.type);
        return verdict([[creeper.charged === true, `creeper: ${creeper.charged ? 'charged' : 'not charged'}`],
          [!types.includes('pig') && m.mobs.some((x) => x.type === 'zombified_piglin' && x.name === 'Piggy'), 'pig "Piggy": a zombified piglin that keeps its name'],
          [!types.includes('villager') && types.includes('witch'), 'villager: a witch']]);
      } },
    { id: 'lightning-fire', group: 'Lightning', title: 'Lightning starts fires, except on Easy',
      wiki: 'Lightning: "If the difficulty is Normal or Hard ... lightning sets fire"; doFireTick false stops it.',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 4, dz: 0 } },
      run() {
        const fire = (difficulty, doFireTick = true) => { const f = standInWeather(); withMobs(f); f.game.difficulty = difficulty; f.game.gamerules.doFireTick = doFireTick;
          applyLightningStrike(f.game, new THREE.Vector3(0.5, 1, 0.5), () => 0.5); const lit = f.world.getVoxel(0, 1, 0) === BLOCKS.FIRE; f.weather.dispose(); return lit; };
        const v = { normal: fire('normal'), hard: fire('hard'), easy: fire('easy'), rule: fire('normal', false) };
        return verdict([[v.normal, `Normal: ${v.normal ? 'fire' : 'no fire'}`], [v.hard, `Hard: ${v.hard ? 'fire' : 'no fire'}`], [!v.easy, `Easy: ${v.easy ? 'fire' : 'no fire'}`], [!v.rule, `doFireTick false: ${v.rule ? 'fire' : 'no fire'}`]]);
      } },
    { id: 'skeleton-trap', group: 'Lightning', title: 'Natural bolts can bring a skeleton trap',
      wiki: 'Skeleton Horse: a natural lightning strike may spawn a skeleton trap horse (by regional difficulty); /summon bolts never do.',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 2, dz: -3 } },
      run() {
        const trap = (natural, random) => { const f = standInWeather(); const m = withMobs(f); applyLightningStrike(f.game, new THREE.Vector3(0, 1, 0), random, { natural }); f.weather.dispose(); return m.mobs.some((x) => x.type === 'skeleton_horse' && x.isTrap); };
        const v = { lucky: trap(true, () => 0), unlucky: trap(true, () => 0.99), manual: trap(false, () => 0) };
        return verdict([[v.lucky, `natural bolt, lucky roll: ${v.lucky ? 'trap horse' : 'nothing'}`], [!v.unlucky, `natural bolt, unlucky roll: ${v.unlucky ? 'trap horse' : 'nothing'}`], [!v.manual, `summoned bolt: ${v.manual ? 'trap horse' : 'nothing'}`]]);
      } },
    { id: 'lightning-rod', group: 'Lightning', title: 'A lightning rod takes the bolt and gives a redstone pulse',
      wiki: 'Lightning Rod: "redirects lightning ... within 128 blocks" and "emits a redstone signal of 15 for 8 game ticks".',
      view: { biome: 'plains', weather: 'thunder', props: [{ dx: 3, dy: 1, dz: 0, block: BLOCKS.LIGHTNING_ROD }], bolt: { dx: 3, dz: 0 } },
      run() {
        const w = standInWorld(); w.redstone = new Redstone(w); w.setVoxel(0, 3, 0, BLOCKS.LIGHTNING_ROD); w.redstone.notify(0, 3, 0);
        const hit = redirectLightning(w, new THREE.Vector3(30, 1, 0));
        const power = w.redstone.output(w.redstone.state([0, 3, 0]), [0, 2, 0]);
        for (let i = 0; i < 4; i++) w.redstone.tick();
        const after = w.redstone.state([0, 3, 0]).output;
        const far = redirectLightning(w, new THREE.Vector3(150, 1, 0)).x;
        w.setVoxel(0, 8, 0, BLOCKS.GLASS); const covered = redirectLightning(w, new THREE.Vector3(30, 1, 0)).x;
        return verdict([[hit.x === 0.5 && hit.y === 4, `a bolt 30 blocks away lands on the rod (${hit.x}, ${hit.y}, ${hit.z})`], [power === 15, `signal ${power}`], [after === 0, `off after 8 game ticks (${after})`],
          [far === 150, 'a bolt 150 blocks away is not pulled in'], [covered === 30, 'a rod under a roof takes nothing']]);
      } },
    { id: 'lightning-targets', group: 'Lightning', title: 'Lightning finds whoever stands in the open nearby',
      wiki: 'Java ServerLevel.findLightningTargetAround: a rod first, else a living entity that can see the sky within 3 blocks.',
      view: { biome: 'plains', weather: 'thunder', bolt: { dx: 1, dz: 1 } },
      run() {
        const land = (setup) => { const f = standInWeather(); const m = withMobs(f); setup(f, m); let at = null;
          f.weather.triggerLightning = (a, s, strike) => { at = strike.clone(); return true; }; f.weather.setWeather('thunder'); f.weather.naturalLightning(); f.weather.dispose(); return at; };
        // The fixed random picks chunk (0,0) and its column (8, 8).
        const open = land((f, m) => m.spawnMob('zombie', 10.5, 1, 9.5));
        const roofed = land((f, m) => { m.spawnMob('zombie', 10.5, 1, 9.5); f.world.setVoxel(10, 4, 9, BLOCKS.STONE); });
        const far = land((f, m) => m.spawnMob('cow', 12.5, 1, 8.5));
        return verdict([[open?.x === 10.5 && open?.z === 9.5, `a zombie 2 blocks off the column is struck (${open?.x}, ${open?.z})`],
          [roofed?.x === 8.5, `a roofed zombie is passed over (bolt at ${roofed?.x}, ${roofed?.z})`], [far?.x === 8.5, `a cow 4 blocks away is passed over (bolt at ${far?.x}, ${far?.z})`]]);
      } },
    { id: 'lightning-columns', group: 'Lightning', title: 'No lightning where it snows or never rains',
      wiki: 'Thunderstorm: "Lightning does not strike in snowy biomes or deserts" -- only where it rains.',
      view: { biome: 'snowy_plains', weather: 'thunder' },
      run() {
        const strikes = (biome) => { const f = standInWeather(biome); f.weather.triggerLightning = () => true; f.weather.setWeather('thunder'); const r = f.weather.naturalLightning(); f.weather.dispose(); return r; };
        const v = { plains: strikes('plains'), snowy: strikes('snowy_plains'), desert: strikes('desert') };
        return verdict([[v.plains, `plains: ${v.plains ? 'strikes' : 'none'}`], [!v.snowy, `snowy plains: ${v.snowy ? 'strikes' : 'none'}`], [!v.desert, `desert: ${v.desert ? 'strikes' : 'none'}`]]);
      } },

    // --- Surfaces ---
    { id: 'farmland', group: 'Surfaces', title: 'Rain waters farmland that is open to the sky',
      wiki: 'Farmland: "Rain also hydrates farmland" when nothing covers it.',
      view: { biome: 'plains', weather: 'rain', props: [{ dx: 2, dy: 0, dz: 2, block: BLOCKS.FARMLAND }, { dx: 3, dy: 0, dz: 2, block: BLOCKS.FARMLAND }] },
      run() {
        const f = standInWeather(); f.weather.setWeather('rain'); f.world.setVoxel(0, 1, 0, BLOCKS.FARMLAND);
        const open = isWaterNearby(f.world, 0, 1, 0, f.game);
        f.world.setVoxel(0, 6, 0, BLOCKS.GLASS); const covered = isWaterNearby(f.world, 0, 1, 0, f.game);
        f.world.setVoxel(0, 6, 0, BLOCKS.AIR); f.world.selectedBiome = 'snowy_plains'; f.weather.columns.clear(); const snowing = isWaterNearby(f.world, 0, 1, 0, f.game);
        f.weather.dispose();
        return verdict([[open, `open farmland in rain: ${open ? 'wet' : 'dry'}`], [!covered, `under glass: ${covered ? 'wet' : 'dry'}`], [!snowing, `in snowfall: ${snowing ? 'wet' : 'dry'}`]]);
      } },
    { id: 'cauldrons', group: 'Surfaces', title: 'Cauldrons fill with rain water or powder snow',
      wiki: 'Cauldron: a cauldron in rain fills one level with a 5% chance per precipitation tick; in snow, powder snow with 10%.',
      view: { biome: 'plains', weather: 'rain', props: [{ dx: 2, dy: 1, dz: 0, block: BLOCKS.CAULDRON }] },
      run() {
        const fill = (biome, roll) => { const w = standInWorld(biome); w.setVoxel(0, 1, 0, BLOCKS.CAULDRON); weatherSurfaceTick(w, precipitationColumn(w, 0, 0), 0, 0, () => roll); return w.getVoxel(0, 1, 0); };
        const v = { rainIn: fill('plains', 0.049), rainOut: fill('plains', 0.051), snowIn: fill('snowy_plains', 0.099), snowOut: fill('snowy_plains', 0.101) };
        const w = standInWorld(); w.setVoxel(0, 1, 0, BLOCKS.CAULDRON); for (let i = 0; i < 5; i++) weatherSurfaceTick(w, precipitationColumn(w, 0, 0), 0, 0, () => 0);
        return verdict([[v.rainIn === BLOCKS.WATER_CAULDRON, 'rain, roll under 5%: water cauldron'], [v.rainOut === BLOCKS.CAULDRON, 'rain, roll over 5%: still empty'],
          [v.snowIn === BLOCKS.POWDER_SNOW_CAULDRON, 'snow, roll under 10%: powder snow cauldron'], [v.snowOut === BLOCKS.CAULDRON, 'snow, roll over 10%: still empty'],
          [w.cauldronLevels?.get('0,1,0') === 3, `five lucky ticks: level ${w.cauldronLevels?.get('0,1,0')} (full is 3)`]]);
      } },
    { id: 'snow-and-ice', group: 'Surfaces', title: 'Snowfall lays snow and freezes still water',
      wiki: 'Snowfall: "places snow layers on the top surface ... and freezes water source blocks into ice", not near light 10+ or under a roof.',
      view: { biome: 'snowy_plains', weather: 'rain' },
      run() {
        const w = standInWorld('snowy_plains');
        weatherSurfaceTick(w, precipitationColumn(w, 0, 0), 0, 0); const layer = w.getVoxel(0, 1, 0);
        weatherSurfaceTick(w, precipitationColumn(w, 0, 0), 0, 0); const stacked = w.getVoxel(0, 2, 0);
        w.setVoxel(2, 1, 2, BLOCKS.WATER); weatherSurfaceTick(w, precipitationColumn(w, 2, 2), 2, 2); const ice = w.getVoxel(2, 1, 2);
        w.setVoxel(3, 1, 3, BLOCKS.WATER); w.light = { getLightPair: () => ({ block: 12 }) }; weatherSurfaceTick(w, precipitationColumn(w, 3, 3), 3, 3); const lit = w.getVoxel(3, 1, 3); delete w.light;
        w.setVoxel(4, 6, 4, BLOCKS.GLASS); weatherSurfaceTick(w, precipitationColumn(w, 4, 4), 4, 4); const roofed = w.getVoxel(4, 1, 4);
        const rain = standInWorld('plains'); weatherSurfaceTick(rain, precipitationColumn(rain, 0, 0), 0, 0); const rainy = rain.getVoxel(0, 1, 0);
        return verdict([[layer === BLOCKS.SNOW_LAYER, 'open ground: a snow layer'], [stacked === BLOCKS.AIR, 'a second tick does not stack a second layer'],
          [ice === BLOCKS.ICE, 'still water at an edge: ice'], [lit === BLOCKS.WATER, 'water by a light of 12: stays water'],
          [roofed === BLOCKS.AIR, 'under a glass roof: nothing'], [rainy === BLOCKS.AIR, 'rain in plains lays no snow']]);
      } },
  ];
}

/** A 5x5 roof of one block, 4 above the spawn's surface: what the page shows for the roof scenario. */
function roofProps(block) {
  const props = [];
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) props.push({ dx, dy: 4, dz, block });
  for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let dy = 1; dy <= 3; dy++) props.push({ dx, dy, dz, block: BLOCKS.OAK_LOG });
  return props;
}

/** Run every scenario (or the ones named); a scenario that throws fails with the error. */
export function runWeatherShowcase(ids = null) {
  return weatherScenarios().filter((s) => !ids || ids.includes(s.id)).map((s) => {
    let result;
    try { result = s.run(); } catch (error) { result = { ok: false, detail: `threw: ${error?.message ?? error}` }; }
    return { id: s.id, group: s.group, title: s.title, wiki: s.wiki, ...result };
  });
}
