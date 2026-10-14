import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BLOCKS,ITEMS} from '../src/blocks.js';
import {WeatherClock,captureWeatherState,restoreWeatherState} from '../src/weatherClock.js';
import {WeatherManager} from '../src/weather.js';
import {precipitationForBiome,precipitationColumn,precipitationAt,exposedToRain} from '../src/weatherRules.js';
import {weatherSurfaceTick,applyLightningStrike,redirectLightning} from '../src/weatherGameplay.js';
import {igniteActor,applyHeat} from '../src/heat.js';
import {isWaterNearby} from '../src/farming.js';
import {Redstone} from '../src/redstone.js';
import {useBucket} from '../src/buckets.js';
import {useGlassBottle} from '../src/bottles.js';
import {World,Chunk} from '../src/world.js';
import {Sky} from '../src/sky.js';
import {runCommand,buildCommandContext} from '../src/commandRunner.js';

function random(seed=123){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function grid(biome='plains'){
  const edits=new Map(),chunks=new Map();for(let cx=-2;cx<=2;cx++)for(let cz=-2;cz<=2;cz++)chunks.set(`${cx},${cz}`,{cx,cz,weatherRevision:0});
  const w={selectedBiome:biome,dimension:'overworld',seaLevel:22,maxHeight:64,chunks,
    getBiome(){return this.selectedBiome;},getChunk(cx,cz){return chunks.get(`${cx},${cz}`);},
    getVoxel(x,y,z){return edits.get(`${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`)??(y===0?BLOCKS.STONE:BLOCKS.AIR);},
    setVoxel(x,y,z,id){edits.set(`${x},${y},${z}`,id);this.getChunk(Math.floor(x/16),Math.floor(z/16)).weatherRevision++;},getWaterLevel(){return 0;},getLavaLevel(){return 0;}};
  return w;
}
function fixture(biome='plains'){
  const world=grid(biome),scene=new THREE.Scene(),audio={starts:0,stops:0,thunder:0,end:0,startRainSound(){this.starts++;},stopRainSound(){this.stops++;},setRainVolume(v){this.volume=v;},playThunder(){this.thunder++;},playEndFlash(){this.end++;}};
  const weather=new WeatherManager(scene,audio,{random:()=>.5,particleRandom:random()});
  const game={world,gamerules:{doWeatherCycle:false,doFireTick:false},difficulty:'normal',player:{position:new THREE.Vector3(0,3,0),gamemode:'creative'}};
  world.game=game;game.weather=weather;weather.game=game;
  const ambient=new THREE.HemisphereLight(),sun=new THREE.DirectionalLight(),fog=new THREE.Fog(0x88bbee,90,128),background=new THREE.Color(0x88bbee);
  const tick=dt=>{ambient.intensity=1.75;sun.intensity=2.15;background.setHex(0x88bbee);weather.update(dt,game.player.position,ambient,sun,fog,background);};
  return {world,scene,audio,weather,game,tick,ambient,sun,fog,background};
}

for(const biome of ['frozen_peaks','jagged_peaks','grove','snowy_slopes','snowy_plains','snowy_taiga','ice_spikes','frozen_river'])test(`${biome}: rain weather becomes snowfall`,()=>assert.equal(precipitationForBiome(biome),'snow'));
for(const biome of ['desert','badlands','savanna','nether_wastes','crimson_forest','the_end'])test(`${biome}: no precipitation`,()=>assert.equal(precipitationForBiome(biome),'none'));
test('temperate rain becomes snow at high climate altitude',()=>{assert.equal(precipitationForBiome('taiga',22),'rain');assert.equal(precipitationForBiome('taiga',60),'snow');});
for(const roof of [BLOCKS.STONE,BLOCKS.GLASS,BLOCKS.OAK_LEAVES,BLOCKS.OAK_SLAB,BLOCKS.SNOW_LAYER])test(`roof ${roof} stops rain at the actual surface`,()=>{
  const w=grid();w.setVoxel(0,6,0,roof);assert.equal(precipitationAt(w,.5,3,.5),'none');assert.equal(precipitationAt(w,.5,8,.5),'rain');
});
test('rain is not emitted into water and unloaded columns are not generated',()=>{const w=grid();w.setVoxel(0,2,0,BLOCKS.WATER);assert.equal(precipitationAt(w,.5,2.3,.5),'none');assert.equal(precipitationColumn(w,1000,1000).kind,'none');assert.equal(w.chunks.size,25);});
test('independent rain and thunder clocks, and duration bounds',()=>{
  for(const sample of [0,.999999]){const c=new WeatherClock(()=>sample);assert.ok(c.rainTicks>=12000&&c.rainTicks<=180000);c.set('rain');assert.ok(c.rainTicks>=12000&&c.rainTicks<=24000);c.set('thunder');assert.ok(c.thunderTicks>=3600&&c.thunderTicks<=15600);}
  const c=new WeatherClock(()=>0);c.rainTicks=2;c.thunderTicks=4;c.advance(.1);assert.equal(c.type,'rain');c.advance(.1);assert.equal(c.type,'thunder');c.advance(180);assert.equal(c.type,'rain');
});
test('disabled weather cycle freezes timers but manual commands still change weather',()=>{const c=new WeatherClock(()=>0);c.advance(9000,false);assert.equal(c.type,'clear');c.set('thunder',2);c.advance(9000,false);assert.equal(c.type,'thunder');assert.equal(c.rainTicks,40);c.advance(2);assert.equal(c.type,'clear');});
test('clear duration holds both weather clocks; sleeping during clear does not postpone rain',()=>{const c=new WeatherClock(()=>0);c.set('clear',5);c.advance(4);assert.equal(c.clearTicks,20);assert.equal(c.type,'clear');c.advance(1);assert.equal(c.clearTicks,0);const timer=c.rainTicks;c.resetAfterSleep();assert.equal(c.rainTicks,timer);c.set('rain');c.resetAfterSleep();assert.equal(c.type,'clear');});
test('invalid durations/types leave the weather unchanged',()=>{const c=new WeatherClock();for(const args of [['snow'],['rain',-2],['rain',Infinity],['rain',1000001]])assert.equal(c.set(...args),false);assert.equal(c.type,'clear');});
test('weather save snapshots call isRaining and restore legacy/new maps',()=>{
  assert.equal(captureWeatherState({isRaining:()=>false,weatherType:'clear'}).isRaining,false);
  const f=fixture();f.weather.setWeather('thunder',120);f.world.cauldronLevels=new Map([['1,1,1',2]]);const raw=JSON.parse(JSON.stringify(captureWeatherState(f.weather)));
  f.weather.setWeather('clear');restoreWeatherState(f.weather,raw);assert.equal(f.weather.weatherType,'thunder');assert.equal(f.weather.clock.rainTicks,2400);assert.equal(f.world.cauldronLevels.get('1,1,1'),2);
  restoreWeatherState(f.weather,{isRaining:false});assert.equal(f.weather.weatherType,'clear');restoreWeatherState(f.weather,{isRaining:true});assert.equal(f.weather.weatherType,'rain');f.weather.dispose();
});
test('snowflakes drift and fall slowly; rain uses distinct fast streak geometry',()=>{
  const f=fixture('frozen_peaks');f.weather.setWeather('rain');f.tick(.1);assert.ok(f.weather.snowMesh.visible);assert.equal(f.weather.rainMesh.visible,false);assert.equal(f.audio.starts,0);
  const i=10,y=f.weather.particles[i*3+1],x=f.weather.particles[i*3];f.tick(.1);assert.ok(y-f.weather.particles[i*3+1]>.1&&y-f.weather.particles[i*3+1]<.4);assert.notEqual(f.weather.particles[i*3],x);
  f.world.selectedBiome='plains';f.weather.columns.clear();f.tick(.1);assert.ok(f.weather.rainMesh.visible);assert.equal(f.weather.snowMesh.visible,false);assert.equal(f.audio.starts,1);f.weather.dispose();
});
test('every rain streak and snowflake stays outside a house, including its glass roof',()=>{
  for(const biome of ['plains','frozen_peaks']){const f=fixture(biome);for(let x=-5;x<=5;x++)for(let z=-5;z<=5;z++)f.world.setVoxel(x,6,z,BLOCKS.GLASS);
    f.weather.setWeather('rain');f.tick(.5);assert.equal(f.weather.precipitationAt(0,3,0),'none');assert.equal(f.audio.volume,biome==='plains'?.12:undefined);
    const meshes=[f.weather.rainMesh,f.weather.snowMesh];for(const mesh of meshes){const attr=mesh.geometry.attributes.position;for(let i=0;i<mesh.geometry.drawRange.count;i++){const x=attr.getX(i)+mesh.position.x,y=attr.getY(i)+mesh.position.y,z=attr.getZ(i)+mesh.position.z;if(Math.abs(x)<=4.8&&Math.abs(z)<=4.8)assert.ok(y>=7,`${biome} particle leaked through roof at ${x},${y},${z}`);}}
    f.weather.dispose();
  }
});
test('real Chunk edits invalidate the roof cache immediately',()=>{const f=fixture(),w=new World(1,'plains'),c=new Chunk(0,0);w.chunks.set('0,0',c);f.game.world=w;f.weather.setWeather('rain');assert.equal(f.weather.isRainingAt(.5,3,.5),true);c.setVoxel(0,6,0,BLOCKS.GLASS);assert.equal(f.weather.isRainingAt(.5,3,.5),false);c.setVoxel(0,6,0,BLOCKS.AIR);assert.equal(f.weather.isRainingAt(.5,3,.5),true);f.weather.dispose();});
test('dry biome stays dry but overcast sky and light still change globally',()=>{const f=fixture('desert');f.weather.setWeather('thunder');f.tick(.5);assert.equal(f.weather.rainMesh.visible,false);assert.equal(f.weather.snowMesh.visible,false);assert.ok(f.sun.intensity<2.15);assert.equal(f.audio.starts,0);f.weather.dispose();});
test('weather cannot leak precipitation, thunder or flash into Nether/End',()=>{const f=fixture();f.weather.setWeather('thunder');for(const dim of ['nether','end']){f.world.dimension=dim;f.weather.lightningTimer=0;f.tick(1);assert.equal(f.weather.isRaining(),false);assert.equal(f.weather.rainMesh.visible,false);assert.equal(f.audio.thunder,0);assert.equal(f.ambient.intensity,1.75);assert.equal(f.weather.triggerLightning(),false);}f.weather.dispose();});
test('natural lightning skips snowy/dry columns, lands on the heightmap in rainy biomes',()=>{
  const f=fixture();f.world.chunks=new Map([['0,0',{cx:0,cz:0}]]);f.weather.game.world.getChunk=(x,z)=>x===0&&z===0?f.world.chunks.get('0,0'):null;
  for(const biome of ['desert','frozen_peaks']){f.world.selectedBiome=biome;f.weather.columns.clear();assert.equal(f.weather.naturalLightning(),false);}
  f.world.selectedBiome='plains';f.weather.columns.clear();f.world.setVoxel(8,9,8,BLOCKS.STONE);assert.equal(f.weather.naturalLightning(),true);assert.equal(f.weather.visuals.bolts[0].group.position.y,10);assert.equal(f.audio.thunder,1);f.weather.dispose();
});
test('visible branching bolt and multi-pulse flash expire even after weather clears',()=>{const f=fixture();f.weather.triggerLightning(null,null,new THREE.Vector3(4,1,0));assert.ok(f.weather.visuals.bolts[0].group.children.length>=5);assert.ok(f.weather.isFlashing);f.tick(.05);assert.equal(f.ambient.intensity,2.2);f.weather.setWeather('clear');f.tick(.5);assert.equal(f.weather.isFlashing,false);assert.equal(f.weather.visuals.bolts.length,0);f.weather.dispose();});
test('sky flashes with shaders on and off, even for manual lightning in clear weather',()=>{const f=fixture(),sky=new Sky(f.scene);f.weather.triggerLightning();for(const enhanced of [false,true]){sky.uniforms.uEnhanced.value=Number(enhanced);sky.update(0,{position:new THREE.Vector3()},f.weather,false);assert.equal(sky.uniforms.uFlash.value,1);}f.weather.dispose();});
test('lightning schedule accounts for loaded chunks when a storm starts',()=>{const f=fixture();f.weather.setWeather('thunder');assert.ok(f.weather.lightningTimer<150);f.weather.dispose();});
test('enhanced End flash has a sky pulse and sound but no rain, bolt or damage',()=>{const f=fixture();f.world.dimension='end';assert.equal(f.weather.triggerEndFlash(),false);f.weather.enhanced=true;f.weather.endFlashTimer=0;f.tick(.1);assert.ok(f.weather.visuals.endMesh.visible);assert.ok(f.weather.visuals.endPulse>0);assert.equal(f.audio.end,1);assert.equal(f.audio.thunder,0);assert.equal(f.weather.rainMesh.visible,false);f.weather.enhanced=false;f.tick(.1);assert.equal(f.weather.visuals.endMesh.visible,false);f.weather.dispose();});
test('rain hydrates only open temperate farmland and extinguishes actors; snow does neither',()=>{const f=fixture();f.weather.setWeather('rain');f.world.setVoxel(0,1,0,BLOCKS.FARMLAND);assert.ok(isWaterNearby(f.world,0,1,0,f.game));f.world.setVoxel(0,6,0,BLOCKS.GLASS);assert.equal(isWaterNearby(f.world,0,1,0,f.game),false);f.world.setVoxel(0,6,0,BLOCKS.AIR);f.world.selectedBiome='frozen_peaks';f.weather.columns.clear();assert.equal(isWaterNearby(f.world,0,1,0,f.game),false);
  const actor={};igniteActor(actor,8);applyHeat(f.world,actor,new THREE.Vector3(0,3,0),.1,()=>{});assert.ok(actor.isOnFire);f.world.selectedBiome='plains';f.weather.columns.clear();applyHeat(f.world,actor,new THREE.Vector3(0,3,0),.1,()=>{});assert.equal(actor.isOnFire,false);f.weather.dispose();
});
test('surface snowfall replaces missing layers, freezes exposed source edges, respects lamps/roofs',()=>{const w=grid('frozen_peaks');weatherSurfaceTick(w,precipitationColumn(w,0,0),0,0);assert.equal(w.getVoxel(0,1,0),BLOCKS.SNOW_LAYER);weatherSurfaceTick(w,precipitationColumn(w,0,0),0,0);assert.equal(w.getVoxel(0,2,0),BLOCKS.AIR);
  w.setVoxel(2,1,2,BLOCKS.WATER);weatherSurfaceTick(w,precipitationColumn(w,2,2),2,2);assert.equal(w.getVoxel(2,1,2),BLOCKS.ICE);
  w.setVoxel(3,1,3,BLOCKS.WATER);w.light={getLightPair:()=>({block:12})};weatherSurfaceTick(w,precipitationColumn(w,3,3),3,3);assert.equal(w.getVoxel(3,1,3),BLOCKS.WATER);
  w.setVoxel(4,6,4,BLOCKS.GLASS);delete w.light;weatherSurfaceTick(w,precipitationColumn(w,4,4),4,4);assert.equal(w.getVoxel(4,1,4),BLOCKS.AIR);assert.equal(w.getVoxel(4,7,4),BLOCKS.AIR);
});
test('cauldrons fill one level per successful rain/snow tick, never mix fluids',()=>{for(const [biome,filled] of [['plains',BLOCKS.WATER_CAULDRON],['frozen_peaks',BLOCKS.POWDER_SNOW_CAULDRON]]){const w=grid(biome);w.setVoxel(0,1,0,BLOCKS.CAULDRON);for(let n=1;n<=3;n++){weatherSurfaceTick(w,precipitationColumn(w,0,0),0,0,()=>0);assert.equal(w.getVoxel(0,1,0),filled);assert.equal(w.cauldronLevels.get('0,1,0'),n);}assert.equal(w.getVoxel(0,2,0),BLOCKS.AIR);w.setVoxel(1,1,1,BLOCKS.LAVA_CAULDRON);weatherSurfaceTick(w,precipitationColumn(w,1,1),1,1,()=>0);assert.equal(w.getVoxel(1,1,1),BLOCKS.LAVA_CAULDRON);}});
function inventory(id){return {activeSlot:0,hotbar:[{id,isBlock:false,count:1}],storage:[],getActiveItem(){return this.hotbar[0];},addItem(id,isBlock,count){this.storage.push({id,isBlock,count});return true;}};}
test('weather-collected water and powder snow can be retrieved; bottles consume one level',()=>{const w=grid(),hit={x:0,y:1,z:0};w.setVoxel(0,1,0,BLOCKS.WATER_CAULDRON);w.cauldronLevels=new Map([['0,1,0',1]]);assert.equal(useBucket(w,inventory('bucket'),'survival',hit),false);const bottle=inventory('glass_bottle');assert.ok(useGlassBottle(w,bottle,'survival',hit));assert.equal(bottle.hotbar[0].id,'water_bottle');assert.equal(w.getVoxel(0,1,0),BLOCKS.CAULDRON);
  w.setVoxel(0,1,0,BLOCKS.POWDER_SNOW_CAULDRON);w.cauldronLevels.set('0,1,0',3);const bucket=inventory('bucket');assert.ok(useBucket(w,bucket,'survival',hit));assert.equal(bucket.hotbar[0].id,'powder_snow_bucket');assert.equal(w.getVoxel(0,1,0),BLOCKS.CAULDRON);assert.equal(ITEMS.powder_snow_bucket.isBlock,false);
});
test('lightning rod redirects only when exposed and powers neighbouring redstone for 8 game ticks',()=>{const w=grid();w.redstone=new Redstone(w);w.setVoxel(0,3,0,BLOCKS.LIGHTNING_ROD);w.redstone.notify(0,3,0);const strike=new THREE.Vector3(30,1,0);assert.deepEqual(redirectLightning(w,strike).toArray(),[.5,4,.5]);assert.equal(w.redstone.output(w.redstone.state([0,3,0]),[0,2,0]),15);for(let i=0;i<3;i++)w.redstone.tick();assert.equal(w.redstone.state([0,3,0]).output,15);w.redstone.tick();assert.equal(w.redstone.state([0,3,0]).output,0);w.setVoxel(0,8,0,BLOCKS.GLASS);assert.equal(redirectLightning(w,strike),strike);assert.equal(redirectLightning(w,new THREE.Vector3(150,1,0)).x,150);});
function actors(){const f=fixture(),manager={game:f.game,mobs:[],spawnMob(type,x,y,z){const mesh=new THREE.Group();mesh.position.set(x,y,z);const m={type,mesh,health:20};this.mobs.push(m);return m;},spawnZombifiedPiglin(x,y,z){return this.spawnMob('zombified_piglin',x,y,z);},damageMob(m,n){m.health-=n;}};f.game.mobs=manager;return {...f,manager};}
test('lightning deals five damage, ignites actors, charges creepers and converts pigs/villagers',()=>{const f=actors();const zombie=f.manager.spawnMob('zombie',0,1,0),creeper=f.manager.spawnMob('creeper',1,1,0),pig=f.manager.spawnMob('pig',2,1,0),villager=f.manager.spawnMob('villager',-2,1,0);pig.name='Piggy';applyLightningStrike(f.game,new THREE.Vector3(0,1,0));assert.equal(zombie.health,15);assert.ok(zombie.isOnFire);assert.ok(creeper.charged);assert.equal(creeper.health,15);assert.ok(f.manager.mobs.some(m=>m.type==='zombified_piglin'&&m.name==='Piggy'));assert.ok(!f.manager.mobs.includes(pig));assert.ok(!f.manager.mobs.includes(villager));assert.ok(f.manager.mobs.some(m=>m.type==='witch'));f.weather.dispose();});
test('natural skeleton traps and fire respect difficulty/fire rule; manual bolts do not spawn traps',()=>{const f=actors();f.game.gamerules.doFireTick=true;applyLightningStrike(f.game,new THREE.Vector3(0,1,0),()=>0,{natural:true});assert.ok(f.manager.mobs.some(m=>m.type==='skeleton_horse'&&m.isTrap));assert.equal(f.world.getVoxel(0,1,0),BLOCKS.AIR);f.manager.mobs=[];applyLightningStrike(f.game,new THREE.Vector3(0,1,0),()=>0);assert.equal(f.manager.mobs.length,0);assert.equal(f.world.getVoxel(0,1,0),BLOCKS.FIRE);f.world.setVoxel(0,1,0,BLOCKS.AIR);f.game.gamerules.doFireTick=false;applyLightningStrike(f.game,new THREE.Vector3(0,1,0),()=>.5);assert.equal(f.world.getVoxel(0,1,0),BLOCKS.AIR);f.weather.dispose();});
test('/weather accepts a duration and rejects invalid requests without mutating state',()=>{const f=fixture();f.game.settings={gameMode:'creative',cheats:true};f.game.ui={addChatMessage(){}};const ctx=buildCommandContext(f.game);runCommand(ctx,'/weather thunder 90s');assert.equal(f.weather.weatherType,'thunder');assert.equal(f.weather.clock.rainTicks,1800);runCommand(ctx,'/weather snow');runCommand(ctx,'/weather clear -5');assert.equal(f.weather.weatherType,'thunder');f.weather.dispose();});

