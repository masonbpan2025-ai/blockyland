// Classic cube/ship physics in Geometry Dash's 30-unit grid. See RESEARCH.md.
export const PHYSICS=Object.freeze({tick:1/240,size:30,cubeGravity:2799.36,jump:603.72,
  yellowPad:864,pinkPad:540,yellowOrb:621,fallLimit:810,shipUpLimit:432,
  shipDownLimit:-345.6,shipSwitch:103.48549461364746});
export function createSimulation(course,{speed=311.58,length=26000,maxObjectWidth=Math.max(0,...course.map(o=>o.w))}={},saved=null) {
  let x=saved?.x??0,y=saved?.y??0,vy=saved?.vy??0,angle=saved?.angle??0,
    gravity=saved?.gravity??1,mode=saved?.mode??'cube',phase='play',time=saved?.time??0,
    floor=saved?.floor??0,ceiling=saved?.ceiling??300,grounded=saved?.grounded??true,
    held=saved?.controls?.held??false,queued=saved?.controls?.queued??false,
    accumulator=saved?.controls?.accumulator??0,coins=saved?.coins??0;
  const used=new Set(saved?.used??[]);
  const intersects=(o,pad=0)=>x+30>o.x-pad&&x<o.x+o.w+pad&&y+30>o.y-pad&&y<o.y+o.h+pad;
  const die=()=>{phase='dead';held=false;queued=false;};
  function tick() {
    const d=PHYSICS.tick,oldY=y;x+=speed*d;time+=d;
    let lo=0,hi=course.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(course[mid].x<x-maxObjectWidth-60)lo=mid+1;else hi=mid;}
    const near=[];for(let i=lo;i<course.length&&course[i].x<x+60;i++)if(course[i].x+course[i].w>x-60)near.push(course[i]);
    // Coin-route gravity portals must only activate when actually touched.
    for(const o of near)if(o.type==='portal'&&!used.has(o.sourceIndex)&&intersects(o)){
      used.add(o.sourceIndex);
      if(o.gravity){gravity=o.gravity;vy*=.5;grounded=false;}
      if(o.mode){mode=o.mode;angle=0;grounded=false;
        if(mode==='ship'){
          floor=Math.max(0,Math.round((o.cy-15)/30)*30-150);ceiling=floor+300;
          y=Math.max(floor,Math.min(ceiling-30,y));vy=Math.max(-345.6,Math.min(432,vy));
        }
      }
    }
    if(mode==='cube') {
      if(grounded&&held){vy=PHYSICS.jump*gravity;grounded=false;queued=false;}
      vy-=PHYSICS.cubeGravity*gravity*d;
      vy=gravity===1?Math.max(-PHYSICS.fallLimit,vy):Math.min(PHYSICS.fallLimit,vy);
    }else {
      const v=vy*gravity,threshold=PHYSICS.shipSwitch*gravity;
      // Measured 240-Hz acceleration branches, no artificial drag.
      const acceleration=held?(v<=threshold?0.108:0.086):(v>threshold?-0.103:-0.069);
      vy=Math.max(PHYSICS.shipDownLimit,Math.min(PHYSICS.shipUpLimit,v+acceleration*54))*gravity;
    }
    y+=vy*d;grounded=false;
    // Clear world boundaries are surfaces, not invisible death planes.
    if(mode==='ship'){
      if(y<floor){y=floor;vy=Math.max(0,vy);grounded=gravity===1;}
      if(y+30>ceiling){y=ceiling-30;vy=Math.min(0,vy);grounded=gravity===-1;}
    }else if(y<0){if(gravity===1){y=0;vy=0;grounded=true;}else {y=0;vy=Math.max(0,vy);}}
    // Outer box lands, inner box kills on side impacts. Ships slide on both
    // horizontal solid faces. Surfaces resolve before spike/pit hitboxes.
    for(const o of near)if(o.type==='block'&&x+30>o.x&&x<o.x+o.w){
      const top=o.y+o.h,bottom=o.y;
      if(vy<=0&&oldY>=top-1&&y<=top&&y+30>bottom){y=top;vy=0;grounded=gravity===1;continue;}
      if(vy>=0&&oldY+30<=bottom+1&&y+30>=bottom&&y<top){
        if(mode==='ship'||gravity===-1){y=bottom-30;vy=0;grounded=gravity===-1;continue;}
      }
      const inner=mode==='ship'?10:4.5,cx=x+15,cy=y+15;
      if(cx+inner>o.x&&cx-inner<o.x+o.w&&cy+inner>o.y&&cy-inner<top){die();return;}
    }
    for(const o of near){
      const key=o.sourceIndex;
      if(o.type==='pad'&&!used.has(key)&&intersects(o,1)){
        used.add(key);grounded=false;
        if(o.pad==='gravity'){gravity*=-1;vy=PHYSICS.jump*.5*gravity;}
        else vy=(o.pad==='pink'?PHYSICS.pinkPad:PHYSICS.yellowPad)*(o.inverted?-1:1);
      }
      if(o.type==='ring'&&queued&&!used.has(key)&&intersects(o,6)){
        used.add(key);vy=PHYSICS.yellowOrb*gravity;grounded=false;queued=false;
      }
      if(o.type==='coin'&&!used.has(key)&&intersects(o)){used.add(key);coins++;}
      if(o.type==='spike'||o.type==='pit'){
        const rad=o.rotation*Math.PI/180,dx=x+15-o.cx,dy=y+15-o.cy;
        const localX=dx*Math.cos(rad)-dy*Math.sin(rad),localY=dx*Math.sin(rad)+dy*Math.cos(rad);
        const hw=o.type==='pit'?15*o.scale:3*o.scale,
          hh=o.type==='pit'?4*o.scale:(o.id===39?3:6)*o.scale;
        if(Math.abs(localX)<hw+15&&Math.abs(localY)<hh+15){die();return;}
      }
    }
    if(mode==='ship'){
      const desired=Math.atan2(-vy,speed);angle+=(desired-angle)*(1-Math.exp(-39*d));
      angle=Math.max(-Math.PI/2+.05,Math.min(Math.PI/2-.05,angle));
    }else if(grounded)angle=Math.round(angle/(Math.PI/2))*(Math.PI/2);
    else angle+=gravity*d*Math.PI*2.5;
    if(y>1500||y<-300){die();return;}
    if(x>=length){x=length;phase='complete';held=false;}
  }
  const snapshot=()=>({phase,x,y,vy,angle,gravity,mode,grounded,floor,ceiling,coins,time,jumpQueued:queued,used:[...used]});
  return {jump(down){if(down&&!held)queued=true;if(!down)queued=false;held=down;},
    release(){held=false;queued=false;},
    advance(dt){if(!Number.isFinite(dt)||dt<=0||dt>.25||phase!=='play')return;accumulator+=dt;while(accumulator+1e-9>=PHYSICS.tick&&phase==='play'){accumulator-=PHYSICS.tick;tick();}},
    snapshot,
    fork(){return createSimulation(course,{speed,length,maxObjectWidth},{...snapshot(),controls:{held,queued,accumulator}});}};
}
