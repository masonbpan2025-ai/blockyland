import {COURSES,COURSE_META,LEVELS} from '../src/mods/voxel-dash/levels.js';
import {createSimulation} from '../src/mods/voxel-dash/server/simulation.js';
import {writeFile,mkdir} from 'node:fs/promises';
const only=process.argv[2]===undefined?null:Number(process.argv[2]);
const solutions=[];
for(let level=0;level<5;level++){
  if(only!==null&&level!==only)continue;
  const course=COURSES[level],meta=COURSE_META[level],byId=new Map(course.map(o=>[o.sourceIndex,o]));
  let states=[{sim:createSimulation(course,meta),path:null,held:false}],winner;
  for(let frame=0;frame<Math.ceil(meta.length/meta.speed*60)+5;frame++){
    const unique=new Map();
    for(const node of states)for(const held of [false,true]){
      const sim=node.sim.fork();sim.jump(held);sim.advance(1/60);const s=sim.snapshot();
      if(s.phase==='dead')continue;
      const path={previous:node.path,held};
      if(s.phase==='complete'){winner={sim,path};break;}
      const activeUsed=s.used.filter(id=>{const o=byId.get(id);return o&&o.x+o.w>s.x-30;});
      const key=[Math.round(s.y),Math.round(s.vy/12),s.mode,s.gravity,s.grounded,held,s.jumpQueued,activeUsed.join('.')].join('/');
      if(!unique.has(key))unique.set(key,{sim,path,held});
    }
    if(winner)break;
    states=[...unique.values()];
    if(!states.length)throw new Error(`${LEVELS[level].name}: no surviving path at frame ${frame}`);
    // Keep varied height/velocity buckets instead of favoring a single route.
    if(states.length>300){const stride=states.length/300;states=Array.from({length:300},(_,i)=>states[Math.floor(i*stride)]);}
    if(frame%600===0)console.log(`${LEVELS[level].name}: ${frame/60}s, ${states.length} paths, x=${states[0].sim.snapshot().x.toFixed(1)}`);
  }
  if(!winner)throw new Error(`No complete path for ${LEVELS[level].name}`);
  const actions=[];for(let path=winner.path;path;path=path.previous)actions.push(path.held);actions.reverse();
  const replay=createSimulation(course,meta);for(const held of actions){replay.jump(held);replay.advance(1/60);}
  if(replay.snapshot().phase!=='complete')throw new Error('Search path failed sequential control replay');
  console.log(`PASS ${LEVELS[level].name}: ${actions.length} frames; ${replay.snapshot().coins} coins.`);
  solutions.push({level,actions});
}
await mkdir('.tmp/voxel-dash-research',{recursive:true});await writeFile(`.tmp/voxel-dash-research/solutions-${only??'all'}.json`,JSON.stringify(solutions));
