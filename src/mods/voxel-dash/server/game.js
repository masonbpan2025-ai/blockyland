import {LEVELS,COURSES,COURSE_META} from '../levels.js';
import {createSimulation} from './simulation.js';
export function createGame(options={}) {
  let levelIndex=0,phase='menu',run=createSimulation(COURSES[0],COURSE_META[0]),attempt=0,practice=false,checkpoint=null;
  const best=LEVELS.map(()=>0),completed=LEVELS.map(()=>false);
  function start(retry=false){if(!retry){attempt=0;checkpoint=null;}attempt++;phase='play';run=createSimulation(COURSES[levelIndex],COURSE_META[levelIndex],retry&&practice?checkpoint:null);}
  function input(slot,intent){
    if(slot!==0||!intent||typeof intent!=='object')return false;
    if(intent.type==='select'&&Number.isInteger(intent.level)&&LEVELS[intent.level]){levelIndex=intent.level;run=createSimulation(COURSES[levelIndex],COURSE_META[levelIndex]);phase='menu';checkpoint=null;return true;}
    if(intent.type==='jump'&&typeof intent.down==='boolean'){if(intent.down&&phase==='dead')start(true);if(phase==='play')run.jump(intent.down);return true;}
    if(intent.type!=='button')return false;
    switch(intent.id){
      case 'start':start();return true;
      case 'retry':start(true);return true;
      case 'menu':phase='menu';run.release();return true;
      case 'pause':if(phase==='play'){phase='paused';run.release();}else if(phase==='paused')phase='play';return true;
      case 'practice':if(phase!=='menu')return false;practice=!practice;checkpoint=null;return true;
      case 'checkpoint':if(!practice||phase!=='play')return false;checkpoint=run.snapshot();return true;
      default:return false;
    }
  }
  return {input,release(slot){if(slot===0)run.release();},update(dt){
    if(phase!=='play')return;run.advance(dt);const s=run.snapshot();phase=s.phase;
    if(phase==='dead')best[levelIndex]=Math.max(best[levelIndex],Math.floor(s.x/COURSE_META[levelIndex].length*100));
    if(phase==='complete'){best[levelIndex]=100;if(!practice)completed[levelIndex]=true;}
  },snapshot(){return {...run.snapshot(),seed:options.seed??534796017,scene:[],terrain:[],phase,levelIndex,attempt,practice,checkpoint:checkpoint?.x??null,best:[...best],completed:[...completed],length:COURSE_META[levelIndex].length,speed:COURSE_META[levelIndex].speed};}};
}
