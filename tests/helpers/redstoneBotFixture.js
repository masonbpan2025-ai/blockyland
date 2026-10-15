import * as THREE from 'three';
import {World,Chunk} from '../../src/world.js';
import {BLOCKS as B} from '../../src/blocks.js';
import {Player} from '../../src/player.js';
import {PlayerBot} from '../../src/playerBot.js';
import {Inventory} from '../../src/inventory.js';
import {ChestManager} from '../../src/chest.js';

// Real PlayerBot, player physics, inventory, loaded chunks and Redstone. The
// small raycast/interaction adapter has the same control path as Game.
export function redstoneBotFixture(position=[-2.5,1,3.5]){
 const world=new World(4289),camera=new THREE.PerspectiveCamera(),events=[],commands=[],actors=[];
 for(let x=-2;x<3;x++)for(let z=-2;z<3;z++){const c=new Chunk(x,z);world.chunks.set(world.chunkKey(x,z),c);for(let a=0;a<16;a++)for(let b=0;b<16;b++)c.setVoxel(a,0,b,B.STONE);}
 const sounds={playStep(){},playJump(){},playClick(){},playPop(){}};
 const player=new Player(camera,{addEventListener(){},requestPointerLock(){}},world,sounds);player.position.set(...position);player.onGround=true;player.gamemode='creative';
 const inventory=new Inventory(sounds);
 const game={world,camera,player,inventory,sounds,worldReady:true,mobs:{mobs:[]},entities:{droppedItems:[],spawnDroppedItem(){}},ui:{isGeminiOpen:()=>true,isModalOpen:()=>false,updateHotbar(){},addChatMessage(){}},targetBlock:null,isMouseDown:false};
 player.game=game;player.inventory=inventory;world.game=game;world.redstone.game=game;game.chestManager=new ChestManager(game);
 game.handleRightClick=()=>{const b=game.targetBlock;if(b){const message=world.redstone.interact([b.x,b.y,b.z],false,null);events.push({tick:world.redstone.tickNumber,kind:'interaction',message,position:[b.x,b.y,b.z]});}};
 const bot=new PlayerBot(game,{log(){}});game.playerBot=bot;
 function step(dt=.05){
   bot.tick(dt);player.update(dt);
   const eye=player.position.clone().add(new THREE.Vector3(0,player.eyeHeight||1.62,0));
   const direction=new THREE.Vector3(-Math.sin(player.yaw)*Math.cos(player.pitch),Math.sin(player.pitch),-Math.cos(player.yaw)*Math.cos(player.pitch));
   camera.position.copy(eye);camera.getWorldDirection=v=>v.copy(direction);game.targetBlock=null;
   for(let d=0;d<5;d+=.025){const p=eye.clone().addScaledVector(direction,d),x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z),id=world.getVoxel(x,y,z);if(id!==B.AIR){game.targetBlock={x,y,z,blockId:id};break;}}
   bot.afterRaycast();world.redstone.update(dt,[player,...actors]);
 }
 async function run(command){commands.push(command);const result=bot.run(command);for(let i=0;i<3600&&bot.active;i++)step();if(bot.active)throw new Error('Bot did not settle');const value=await result;if(!value.ok)throw new Error(value.message);return value;}
 function ticks(n){for(let i=0;i<n;i++)step(.1);}
 return{world,game,player,inventory,bot,events,commands,actors,run,ticks,step};
}
