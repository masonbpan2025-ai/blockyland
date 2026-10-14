import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { igniteActor } from './heat.js';
import { convertLightningPigs } from './zombifiedPiglin.js';
import { convertLightningMooshrooms } from './mooshroomBehavior.js';
import { precipitationColumn } from './weatherRules.js';

export function redirectLightning(world,strike){
  let nearest=null,distance=128*128;
  for(const s of world?.redstone?.states?.values?.()||[]){
    if(s.id!==BLOCKS.LIGHTNING_ROD||world.getVoxel(...s.p)!==s.id)continue;
    const p=new THREE.Vector3(s.p[0]+.5,s.p[1]+1,s.p[2]+.5),d=p.distanceToSquared(strike);
    if(d<=distance&&precipitationColumn(world,p.x,p.z).y===s.p[1]){nearest=p;distance=d;}
  }
  if(nearest)world.redstone.strikeRod([Math.floor(nearest.x),Math.floor(nearest.y-1),Math.floor(nearest.z)]);
  return nearest||strike;
}

export function applyLightningStrike(game,strike,random=Math.random,{natural=false}={}){
  const manager=game?.mobs,world=game?.world;if(!world)return;
  const near=p=>p&&Math.abs(p.x-strike.x)<=3&&Math.abs(p.z-strike.z)<=3&&p.y>=strike.y-3&&p.y<=strike.y+6;
  if(manager){
    const converted=new Set(manager.spawnZombifiedPiglin?convertLightningPigs(manager,strike):[]);
    convertLightningMooshrooms(manager,strike);
    for(const mob of [...manager.mobs]){
      const p=mob.mesh?.position;
      if(mob.type==='creeper'&&mob.health>0&&p&&p.distanceTo(strike)<=4)mob.charged=mob.isCharged=true;
      if(mob.health<=0||!near(p)||mob.type==='mooshroom'||converted.has(mob))continue;
      if(mob.type==='villager'&&game.difficulty!=='peaceful'){
        const p=mob.mesh.position,m=manager.spawnMob?.('witch',p.x,p.y,p.z);
        if(m){m.name=mob.name;m.persistent=mob.persistent;manager.removeDebugLabel?.(mob);mob.mesh.removeFromParent();manager.mobs.splice(manager.mobs.indexOf(mob),1);}continue;
      }
      if(mob.type==='creeper'){
        mob.charged=mob.isCharged=true;
        if(!mob.lightningAura){const aura=new THREE.Mesh(new THREE.SphereGeometry(1.05,12,8),new THREE.MeshBasicMaterial({color:0x66aaff,transparent:true,opacity:.18,depthWrite:false,wireframe:true}));aura.position.y=.85;mob.mesh.add(aura);mob.lightningAura=aura;}
      }
      igniteActor(mob,8);manager.damageMob?.(mob,5,strike,false,null,true);
    }
  }
  if(near(game.player?.position)&&!['creative','spectator'].includes(game.player.gamemode)){igniteActor(game.player,8);game.player.takeDamage?.(5);}
  // A naturally-created skeleton trap horse is not struck/burnt by its own bolt.
  const ranges={easy:[.0375,.075],normal:[.075,.2],hard:[.1125,.3375]};
  const [lo,hi]=ranges[game.difficulty]??ranges.normal;
  const regional=world.getRegionalDifficulty?.(strike.x,strike.z)??game.regionalDifficulty;
  const maximum=game.difficulty==='easy'?1.5:game.difficulty==='hard'?6.75:4;
  const minimum=game.difficulty==='easy'?.75:game.difficulty==='hard'?2.25:1.5;
  const progress=Math.max(0,Math.min(1,((regional??minimum)-minimum)/(maximum-minimum)));
  const trapChance=lo+(hi-lo)*progress;
  if(natural&&game.difficulty!=='peaceful'&&manager?.spawnMob&&random()<trapChance){const horse=manager.spawnMob('skeleton_horse',strike.x,strike.y,strike.z);if(horse)horse.isTrap=true;return;}
  if(game?.gamerules?.doFireTick===false||game.difficulty==='peaceful'||game.difficulty==='easy')return;
  for(let i=0;i<5;i++){
    const x=Math.floor(strike.x)+(i?Math.floor(random()*3)-1:0),y=Math.floor(strike.y),z=Math.floor(strike.z)+(i?Math.floor(random()*3)-1:0);
    if(world.getVoxel(x,y,z)===BLOCKS.AIR&&BLOCK_DEFS[world.getVoxel(x,y-1,z)]?.solid!==false&&world.getVoxel(x,y-1,z)!==BLOCKS.AIR)world.setVoxel?.(x,y,z,BLOCKS.FIRE);
  }
}

export function weatherSurfaceTick(world,column,x,z,random=Math.random){
  if(!world?.setVoxel||column.y<0||column.kind==='none')return;
  const y=column.y,id=world.getVoxel(x,y,z);
  const pair=world.light?.getLightPair?.(x,y+1,z);
  const blockLight=pair?.block??0;
  if(column.kind==='snow'){
    if(id===BLOCKS.WATER&&blockLight<10&&(world.getWaterLevel?.(x,y,z)??0)===0){
      if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>world.getVoxel(x+dx,y,z+dz)!==BLOCKS.WATER))world.setVoxel(x,y,z,BLOCKS.ICE);
    }else if(blockLight<10&&id!==BLOCKS.SNOW_LAYER&&id!==BLOCKS.POWDER_SNOW&&![BLOCKS.CAULDRON,BLOCKS.WATER_CAULDRON,BLOCKS.LAVA_CAULDRON,BLOCKS.POWDER_SNOW_CAULDRON].includes(id)&&BLOCK_DEFS[id]?.solid!==false&&!BLOCK_DEFS[id]?.transparent&&world.getVoxel(x,y+1,z)===BLOCKS.AIR){
      world.setVoxel(x,y+1,z,BLOCKS.SNOW_LAYER);
    }
  }
  // Slow precipitation fills one cauldron level at a time, with the wiki's
  // 5% rain / 10% snowfall chance on a precipitation tick.
  const filled=column.kind==='snow'?BLOCKS.POWDER_SNOW_CAULDRON:BLOCKS.WATER_CAULDRON;
  if((id===BLOCKS.CAULDRON||id===filled)&&random()<(column.kind==='snow'?.1:.05)){
    world.cauldronLevels??=new Map();const key=`${x},${y},${z}`;
    const level=id===BLOCKS.CAULDRON?0:world.cauldronLevels.get(key)??3;
    if(level<3){world.setVoxel(x,y,z,filled);world.cauldronLevels.set(key,level+1);}
  }
}
