import { BLOCKS } from '../../src/blocks.js';
import { createHungerState, addExhaustion, tickHunger } from '../../src/hunger.js';
import { Player } from '../../src/player.js';
import { Chunk } from '../../src/world.js';

// This fixture owns a disposable, deterministic world in this browser only.
// Terrain/resources/mobs are setup, never bot rewards. All progression starts
// empty-handed and runs PlayerBot directly, without terminal dispatch or AI.
export function createSurvivalFixture(game) {
  const bot=game.playerBot, steps=[], checks=[];
  game.lifecycle.phase='loading'; // suspend RAF; the driver below owns fixed ticks
  game.worldReady=true; game.worldGenerated=true;
  game.applyWorldSettings({gameMode:'survival',difficulty:'normal',cheats:false});
  game.mobs.clearMobs(); game.inventory.clearAll();
  game.world.isFlatWorld=true;
  game.world.chunks.clear();game.world.chunkCache.fill(null);
  for(let cx=-2;cx<=2;cx++) for(let cz=-2;cz<=2;cz++) {
    game.world.chunks.set(`${cx},${cz}`,new Chunk(cx,cz));game.world.light.initChunk(cx,cz);
  }
  for(let x=-4;x<24;x++) for(let z=-4;z<24;z++) for(let y=0;y<9;y++) game.world.setVoxel(x,y,z,y===0?BLOCKS.GRASS_BLOCK:BLOCKS.AIR);
  for(let x=4;x<7;x++) for(let z=2;z<10;z++) game.world.setVoxel(x,1,z,BLOCKS.OAK_LOG);
  for(let x=5;x<9;x++) for(let z=12;z<16;z++) game.world.setVoxel(x,1,z,BLOCKS.STONE);
  game.world.setVoxel(9,1,12,BLOCKS.COAL_ORE);
  game.player.position.set(.5,1,.5);game.player.velocity.set(0,0,0);game.player.onGround=true;
  game.player.health=20; game.player.hunger=20; game.player.saturation=5; game.player.exhaustion=0;
  game.ui.closeGeminiTerminal();
  let ticks=0;
  function step(dt=1/30) {
    ticks++; bot.tick(dt); game.player.update(dt); game.updateRaycast(); bot.afterRaycast(); game.updateMining(dt);
    game.mobs.update(dt,game.player); game.entities.update(dt,game.player,game.inventory);
    game.furnaceManager.update(dt); game.bedManager.update(dt);
    game.worldTime=(game.worldTime+dt*20)%24000;
  }
  async function drive(promise,maxTicks=6000) {
    let done=false,result,error;
    promise.then(r=>{done=true;result=r;},e=>{done=true;error=e;});
    for(let i=0;i<maxTicks&&!done;i++){
      step();await Promise.resolve();
      if(i>0&&i%1000===0) console.log('[Survival fixture] progress',JSON.stringify({state:bot.snapshot(),target:bot.task?.target,dig:bot.task?.dig,path:bot.task?.path.length,position:game.player.position.toArray(),ray:game.targetBlock,controls:game.player.botControls}));
    }
    if(!done){bot.stop('Fixture tick budget exceeded.');throw new Error('Fixture tick budget exceeded.');}
    if(error) throw error; return result;
  }
  async function run(command) {
    const started=ticks;let result;
    try { result=await drive(bot.run(command)); } catch(e) { result={ok:false,message:e.message}; }
    steps.push({command,result,ticks:ticks-started,position:game.player.position.toArray(),health:game.player.health,hunger:game.player.hunger});
    console.log('[Survival fixture]',JSON.stringify(command),result.ok,result.message);
    if(!result.ok) throw new Error(`${JSON.stringify(command)}: ${result.message}`);
    return result;
  }
  async function wait(seconds){for(let i=0;i<seconds*30;i++){step();await Promise.resolve();}}
  function check(name,ok,observed,expected){checks.push({name,ok:!!ok,observed,expected});}
  function inventory(){return [...game.inventory.hotbar,...game.inventory.storage].filter(Boolean).map(s=>({...s}));}
  return {game,bot,steps,checks,step,run,wait,check,inventory,get ticks(){return ticks;}};
}

export async function runBasicSurvival(game) {
  const f=createSurvivalFixture(game), {bot,run,check}=f;
  let failure=null;
  try {
    check('empty initial inventory',f.inventory().length===0,f.inventory(),[]);
    await run('jump'); await run('test movement');
    await run('mine 24 oak log');
    check('logs picked up',bot.itemCount(BLOCKS.OAK_LOG)===24,bot.itemCount(BLOCKS.OAK_LOG),24);
    await run({type:'craft',item:'oak_planks',count:24});
    await run({type:'craft',item:'crafting_table'});
    await run({type:'goto',position:[2,1,1]});
    await run({type:'place',item:'crafting_table',position:[1,1,1]});
    await run({type:'craft',item:'stick',count:3});
    await run({type:'craft',item:'wooden_pickaxe'});
    await run('mine 16 stone');
    check('stone yields cobblestone',bot.itemCount(BLOCKS.COBBLESTONE)===16,bot.itemCount(BLOCKS.COBBLESTONE),16);
    await run({type:'goto',position:[2,1,1]});
    await run({type:'craft',item:'stone_pickaxe'});
    await run({type:'craft',item:'stone_sword'});
    await run({type:'craft',item:'furnace'});
    await run({type:'place',item:'furnace',position:[3,1,1]});
    await run('mine 1 coal ore');
    await run('equip stone sword');
    // Three white adult sheep provide the real combat/loot/food/bed chain.
    for(let i=0;i<3;i++) {
      game.mobs.spawnSheep(10+i*2,1,10,{woolColor:'white'});
      await run('attack sheep'); await f.wait(2);
    }
    check('wool collected from sheep',bot.itemCount(BLOCKS.WHITE_WOOL)===3,bot.itemCount(BLOCKS.WHITE_WOOL),3);
    check('raw food collected',bot.itemCount('mutton')>=3,bot.itemCount('mutton'),'>=3');
    await run({type:'goto',position:[2,1,1]});
    // Request the reachable recipe so a game parity defect is observable rather
    // than papered over with a supplied bed or invented recipe.
    await run({type:'craft',item:'red_bed'});
    check('white wool produces white bed',bot.itemCount('white_bed')===1, {red:bot.itemCount('red_bed'),white:bot.itemCount('white_bed')},{white:1,red:0});
    const xpBefore=game.player.exp??0;
    await run({type:'cook',item:'mutton',count:3,fuel:'coal',position:[3,1,1]});
    check('three cooked mutton collected',bot.itemCount('cooked_mutton')===3,bot.itemCount('cooked_mutton'),3);
    check('smelting grants XP', (game.player.exp??0)>xpBefore,{before:xpBefore,after:game.player.exp??0},'increase');
    // Set hunger only for a separate eating probe, not to supply progression.
    game.player.hunger=12;game.player.saturation=0;game.player.health=10;game.player.ensureHungerState();
    const beforeFood=bot.itemCount('cooked_mutton');
    await run({type:'eat',item:'cooked_mutton'});
    check('eating restores food and consumes one',game.player.hunger===18&&bot.itemCount('cooked_mutton')===beforeFood-1,{hunger:game.player.hunger,count:bot.itemCount('cooked_mutton')},{hunger:18,count:beforeFood-1});
    // A 4×4 shelter: two-high perimeter, a two-high doorway, and a full roof.
    const shell=[];
    for(let y=1;y<=2;y++) for(let x=12;x<=15;x++) for(let z=3;z<=6;z++) if((x===12||x===15||z===3||z===6)&&!(x===13&&z===3)) shell.push([x,y,z]);
    for(let x=12;x<=15;x++) for(let z=3;z<=6;z++) shell.push([x,3,z]);
    for(const pos of shell) {
      // Walk around the outer perimeter to keep the supporting face visible.
      let stand=pos[2]===3?[pos[0],1,1]:pos[2]===6?[pos[0],1,8]:pos[0]===12?[10,1,pos[2]]:[17,1,pos[2]];
      if(pos[1]===3&&pos[0]>12&&pos[0]<15&&pos[2]>3&&pos[2]<6) stand=[13,1,4];
      await run({type:'goto',position:stand}); await run({type:'place',item:'oak_planks',position:pos});
    }
    check('shelter walls and roof',shell.every(([x,y,z])=>game.world.getVoxel(x,y,z)===BLOCKS.OAK_PLANKS),shell.length,'38 blocks');
    await run({type:'goto',position:[13,1,2]});
    await run({type:'place',item:'red_bed',position:[13,1,4]});
    const bed=game.bedManager.getBed(13,1,4);
    check('two-block bed registered',!!bed,bed,'foot and head');
    await run({type:'goto',position:[13,1,2]});
    game.worldTime=14000;
    await run({type:'sleep',position:[13,1,4]}); await f.wait(6);
    check('sleep reaches morning',!game.player.isSleeping&&game.worldTime<1000,{sleeping:game.player.isSleeping,time:game.worldTime},'awake at dawn');
    check('bed sets respawn',!!game.player.bedSpawnPosition,game.player.bedSpawnPosition?.toArray(),'safe bed spawn');
  } catch(e) {failure=e.message;}
  // Precise hunger probes use the same production modules, outside progression.
  const saturation=createHungerState();addExhaustion(saturation,4);
  check('four exhaustion costs one saturation',saturation.saturation===4,saturation.saturation,4);
  for(const hunger of [20,19]) {
    const state=createHungerState({hunger,saturation:5});const delta=tickHunger(state,.1,{health:10});
    check(`regeneration exhaustion per HP at hunger ${hunger}`,Math.abs(state.exhaustion/delta.heal-6)<.001,state.exhaustion/delta.heal,6);
  }
  const hungry=Object.create(Player.prototype);Object.assign(hungry,{game:{difficulty:'hard'},health:.02,maxHealth:20,hunger:0,saturation:0,exhaustion:0});
  for(let i=0;i<100;i++)hungry.updateHungerModel(.1);
  check('Hard starvation reaches zero',hungry.health===0,hungry.health,0);
  check('bot released controls',!bot.active&&game.player.botControls===null,bot.snapshot(),'inactive');
  check('terminal stayed closed',!game.ui.isGeminiOpen(),game.ui.isGeminiOpen(),false);
  return {failure,steps:f.steps,checks:f.checks,inventory:f.inventory(),simulationSeconds:f.ticks/30,settings:game.settings};
}
