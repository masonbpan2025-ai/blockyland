import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { DEBUG_MOBS } from '../src/mobDebugSession.js';
import { MobManager } from '../src/mobs.js';
import { ModApi, ModLoader } from '../src/mods/loader.js';
import { inspectorContent } from '../src/mods/inspectorSelector.js';
import { inspectorSources } from '../src/mods/inspectorScope.js';
import { buildRegistry, resourceReport } from '../src/resourceRegistry.js';

test('actual Inspector mob catalog is core by default and mod selection contains only owned mobs', () => {
  const core = inspectorContent('mob', DEBUG_MOBS);
  for (const id of ['tournament_host', 'site_manager', 'jackie_chun']) assert.ok(!core.content.includes(id));
  const mod = inspectorContent('mob', DEBUG_MOBS, 'dragonball_tournament');
  assert.deepEqual(mod.content.map(entry => entry.name).sort(), [
    'dragonball_tournament:jackie_chun', 'dragonball_tournament:site_manager', 'dragonball_tournament:tournament_host',
  ]);
  assert.deepEqual(inspectorContent('mob', DEBUG_MOBS, 'missing').content, DEBUG_MOBS);
});

test('resource Inspector never turns mod mobs into items and handles a world without resources', () => {
  const selected = buildRegistry(inspectorSources({modId: 'dragonball_tournament'}));
  assert.equal(selected.entries.size, 0);
  assert.ok([...selected.allEntries.keys()].every(key => !key.startsWith('dragonball_tournament:')));
  const manifests = [{id:'a', name:'A', provides:{items:[{id:'food',name:'A food'}],mobs:['mob']}},
    {id:'b', name:'B', provides:{blocks:[{id:'block',name:'B block'}]}}];
  const a = buildRegistry(inspectorSources({modId:'a',manifests}));
  assert.deepEqual([...a.entries.keys()], ['a:food']);
  assert.ok([...a.allEntries.values()].some(entry => entry.scope === 'core'));
});

test('Rescue resources use the complete shared Inspector record shape', () => {
  const selected=buildRegistry(inspectorSources({modId:'rescue_adventure'}));
  assert.equal(selected.entries.size,8);
  for(const entry of selected.entries.values()) {
    const report=resourceReport(entry,selected);
    assert.equal(entry.modId,'rescue_adventure');
    assert.deepEqual(report.sources.smithing,[]);assert.deepEqual(report.sources.interaction,[]);
    assert.equal(typeof report.stackSizeApplied,'number');
  }
});

test('the shipped mod installs real mob providers and withdraws code, textures, callbacks and entities', async () => {
  const scene = new THREE.Scene();
  const mobs = Object.assign(Object.create(MobManager.prototype), {scene, mobs:[], textures:{}, sounds:{}, entities:{}});
  const originalPunch = () => {};
  const game = {scene, mobs, sounds:{}, player:{position:new THREE.Vector3(),onPunch:originalPunch}, ui:{}};
  mobs.game = game;
  const loader = new ModLoader();
  assert.equal(typeof mobs.spawnTournamentHost, 'undefined');
  assert.equal((await loader.load('dragonball_tournament',{game})).ok, true);
  const host = mobs.spawnMob('dragonball_tournament:tournament_host',0,0,0);
  assert.equal(host.modId, 'dragonball_tournament');
  assert.equal(host.contentId, 'dragonball_tournament:tournament_host');
  assert.ok(scene.children.includes(host.mesh));
  assert.equal(typeof game.sounds.playHostSpeak, 'function');
  const events = game.dragonballSkills.events;
  let delayedEffects = 0;
  loader.get('dragonball_tournament').api.schedule(() => delayedEffects++, 10);
  loader.unload('dragonball_tournament');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(delayedEffects, 0, 'leaving a world cancels pending mod spawns and actions');
  assert.equal(typeof mobs.spawnTournamentHost, 'undefined');
  assert.equal(mobs.mobProviders.size, 0);
  assert.equal(mobs.mobs.length, 0);
  assert.equal(scene.children.length, 0);
  assert.equal(mobs.textures.tournament_host, undefined);
  assert.equal(game.sounds.playHostSpeak, undefined);
  assert.equal(game.modRuntime, undefined);
  assert.equal(game.player.onPunch, originalPunch);
  assert.equal(events.signal.aborted, true);
  assert.equal((await loader.load('dragonball_tournament',{game})).ok, true);
  loader.unload('dragonball_tournament');
});

test('failed registration rolls back installed providers and attachments', async () => {
  const game = {old:'original'};
  const loader = new ModLoader({mods:[{id:'broken',name:'Broken',directory:'x',entrypoint:'index.js'}], importModule:async()=>({register(api){
    api.registerMob('partial'); api.attach('old','modified'); throw new Error('failure');
  }})});
  assert.equal((await loader.load('broken',{game})).ok, false);
  assert.equal(game.old, 'original');
  assert.equal(loader.registry.has('mob','broken:partial'), false);
});

test('core mob implementation and catalog contain no tournament content definitions', () => {
  const source = readFileSync(new URL('../src/mobs.js',import.meta.url),'utf8');
  assert.doesNotMatch(source, /tournament_host|site_manager|jackie_chun|createHostTexture|spawnJackieChun/);
  const main = readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main, /spawnTournamentHost|\.tournament\b|\.dragonballSkills\b|\.trainingSites\b|\.dungeonMode\b/);
});


test('unloading a mod never removes a core mob with the same local path',()=>{
  const scene=new THREE.Scene(),core={type:'zombie',contentId:'minecraft:zombie',mesh:new THREE.Group()};scene.add(core.mesh);
  const manager={scene,mobs:[core],mobProviders:new Map()};
  const loader=new ModLoader({mods:[]}),api=new ModApi({registry:loader.registry,loader,game:{mobs:manager},modId:'rescue_adventure'});
  const provider={spawn(){const mob={type:'zombie',mesh:new THREE.Group()};this.mobs.push(mob);this.scene.add(mob.mesh);return mob;}};
  api.registerMobProvider('zombie',provider);provider.spawn.call(manager);
  assert.equal(manager.mobs.length,2);api.dispose();
  assert.deepEqual(manager.mobs,[core]);assert.equal(scene.children.length,1);assert.equal(manager.mobProviders.size,0);
});
