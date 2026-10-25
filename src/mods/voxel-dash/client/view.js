import { ModClientSession } from '../../../engine/modClientSession.js';
import { LEVELS } from '../levels.js';
import css from './style.css?raw';
import { createPainter } from './painter.js';
import { createScore } from './audio.js';

export function createDashView(api) {
  const container=document.createElement('div');container.dataset.gameMod='voxel_dash';container.style.cssText='position:fixed;inset:0;z-index:100;pointer-events:auto;background:#06161b';
  const root=container.attachShadow({mode:'open'});
  root.innerHTML=`<style>${css}</style><canvas class="world" aria-label="Minecraft themed dash course"></canvas><div class="shade"></div>
  <main class="shell"><header class="top"><div class="brand"><span>▣</span> VOXEL DASH</div><div class="small">${LEVELS.length} levels. ${LEVELS.length} worlds. One rhythm.</div><div><button class="ghost sound">SOUND ON</button> <button class="ghost" data-action="exit">EXIT MOD</button></div></header>
  <section class="hero"><div class="eyebrow">MINECRAFT × GEOMETRY DASH</div><h1>A new world.<span>Every beat.</span></h1><p>Leap through luminous biomes. Ride the portals.<br>Find your flow, one block at a time.</p></section>
  <nav class="levels" aria-label="Choose a level">${LEVELS.map((l,i)=>`<button class="level" data-level="${i}" aria-pressed="${i===0}"><span class="num">${String(i+2).padStart(2,'0')}</span><span class="tile" style="background:${l.color}"></span><span><div class="name">${l.name}</div><div class="sub">${l.biome} · ${l.difficulty}</div></span><span class="rating">${l.stars} ★<small data-best="${i}">BEST 0%</small></span></button>`).join('')}</nav>
  <div class="launch"><button class="primary" data-action="start">PLAY LEVEL ▷</button><button class="ghost" data-action="practice">PRACTICE OFF</button></div>
  <footer class="footer"><span>SPACE / CLICK / TAP<br>Jump · hold to fly</span><span>P / ESC<br>Pause the run</span><span>R / C<br>Retry / checkpoint</span></footer>
  <aside class="preview-label"><div class="eyebrow">02 / SUNLIT MEADOW</div><h2>Back On Track</h2><p>Find your rhythm</p><div class="small">Original level layout · Minecraft biome</div></aside></main>
  <section class="hud" hidden><div class="hud-top"><div><div class="hud-title"></div><div class="hud-sub"></div></div><div class="progress"><i></i></div><span class="percent">0%</span><button class="ghost" data-action="pause">Ⅱ PAUSE</button><button class="ghost sound">SOUND ON</button></div><div class="hint"></div></section>
  <section class="dialog" hidden role="dialog" aria-modal="true" aria-label="Run status"><article><div class="badge"></div><h2></h2><p></p><div class="launch"><button class="primary" data-action="retry">TRY AGAIN ▷</button><button class="ghost" data-action="menu">LEVELS</button></div></article></section><div class="status" role="status"></div>`;
  document.body.append(container);
  if(document.pointerLockElement)document.exitPointerLock();
  if(api.game?.player)api.extend(api.game.player,{controlsDisabled:true});
  const abort=new AbortController(),painter=createPainter(root.querySelector('canvas')),score=createScore();
  let state,disposed=false,visualTime=0,lastPhase='',heldPointer=null;
  let savedBest=LEVELS.map(()=>0),savedDone=LEVELS.map(()=>false);
  try{const saved=JSON.parse(localStorage.getItem('voxel_dash:original-records'));if(saved){savedBest=LEVELS.map((_,i)=>Math.max(0,Math.min(100,Number(saved.best?.[i])||0)));savedDone=LEVELS.map((_,i)=>saved.done?.[i]===true);}}catch{}
  const status=message=>{root.querySelector('.status').textContent=message;};
  const session=new ModClientSession('voxel_dash',{},frame=>{state=frame.state;sync();},status);
  const send=id=>{score.unlock();session.input({type:'button',id});};
  function sync() {
    if(disposed||!state)return;
    const l=LEVELS[state.levelIndex],menu=state.phase==='menu',modal=['dead','paused','complete'].includes(state.phase),percent=Math.floor(state.x/l.length*100);
    container.style.setProperty('--accent',l.color);
    root.querySelector('.shell').hidden=!menu;root.querySelector('.shade').hidden=!menu;root.querySelector('.hud').hidden=menu;root.querySelector('.dialog').hidden=!modal;
    for(const button of root.querySelectorAll('[data-level]')){const chosen=Number(button.dataset.level)===state.levelIndex;button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));}
    const label=root.querySelector('.preview-label');label.querySelector('.eyebrow').textContent=`${String(state.levelIndex+2).padStart(2,'0')} / ${l.biome.toUpperCase()}`;label.querySelector('h2').textContent=l.name;label.querySelector('p').textContent=l.tag;
    root.querySelector('[data-action="practice"]').textContent=`PRACTICE ${state.practice?'ON':'OFF'}`;
    root.querySelector('.hud-title').textContent=l.name;root.querySelector('.hud-sub').textContent=`${l.biome.toUpperCase()} · ATTEMPT ${state.attempt} · ${state.coins}/3 COINS${state.practice?' · PRACTICE':''}`;
    root.querySelector('.progress i').style.width=`${percent}%`;root.querySelector('.percent').textContent=`${percent}%`;
    root.querySelector('.hint').textContent=state.mode==='ship'?'SHIP FLIGHT · HOLD TO RISE · RELEASE TO FALL':state.mode==='ball'?'BALL · TAP TO ROLL TO THE OTHER SIDE':state.mode==='ufo'?'UFO · TAP TO FLAP':state.scale<1?'MINI · SMALLER JUMPS, TIGHTER GAPS':state.gravity===-1?'GRAVITY REVERSED · JUMP FROM THE CEILING':state.practice?'SPACE TO JUMP · C TO SET A PRACTICE CHECKPOINT':l.mechanic.toUpperCase();
    if(modal){const d=root.querySelector('.dialog');d.querySelector('.badge').textContent=state.phase==='complete'?'BIOME CONQUERED':state.phase==='paused'?'TAKE A BREATH':`ATTEMPT ${state.attempt}`;d.querySelector('h2').textContent=state.phase==='complete'?'Level complete!':state.phase==='paused'?'In the pause.':'One more jump.';d.querySelector('p').textContent=state.phase==='complete'?`${state.practice?'Practice finish':`${l.stars} stars earned`} · ${state.coins}/3 secret coins collected`:state.phase==='paused'?`${l.name} · ${percent}% through the biome`:`${percent}% complete · Your next run starts ${state.checkpoint!==null&&state.practice?'at your checkpoint':'at the beginning'}.`;const primary=d.querySelector('.primary');primary.dataset.action=state.phase==='paused'?'pause':'retry';primary.textContent=state.phase==='paused'?'RESUME ▷':state.phase==='complete'?'PLAY AGAIN ▷':'TRY AGAIN ▷';}
    if(state.phase!==lastPhase&&['dead','complete'].includes(state.phase)){
      for(let i=0;i<LEVELS.length;i++){savedBest[i]=Math.max(savedBest[i],state.best[i]);savedDone[i] ||= state.completed[i];}
      try{localStorage.setItem('voxel_dash:original-records',JSON.stringify({best:savedBest,done:savedDone}));}catch{status('Browser storage unavailable; records last for this session.');}
    }
    for(const el of root.querySelectorAll('[data-best]')){const i=Number(el.dataset.best);el.textContent=savedDone[i]?'COMPLETE ✓':`BEST ${Math.max(savedBest[i],state.best[i])}%`;}
    lastPhase=state.phase;
  }
  root.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
    if(button.classList.contains('sound')){score.unlock();const on=score.toggle();for(const b of root.querySelectorAll('.sound'))b.textContent=`SOUND ${on?'ON':'OFF'}`;return;}
    if(button.dataset.level!==undefined){session.input({type:'select',level:Number(button.dataset.level)});return;}
    const action=button.dataset.action;if(action==='exit'){const title=document.getElementById('btn-title-screen');if(title)title.click();else{api.loader.closeWorld();location.assign('/');}return;}if(action)send(action);
  },{signal:abort.signal});
  root.querySelector('canvas').addEventListener('pointerdown',event=>{if(state?.phase!=='play')return;score.unlock();event.preventDefault();heldPointer=event.pointerId;event.target.setPointerCapture(event.pointerId);session.input({type:'jump',down:true});},{signal:abort.signal});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])root.querySelector('canvas').addEventListener(type,event=>{if(event.pointerId===heldPointer){session.input({type:'jump',down:false});heldPointer=null;}},{signal:abort.signal});
  for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
    if(!['Space','ArrowUp','KeyW','KeyP','Escape','KeyR','KeyC','Enter'].includes(event.code))return;
    event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
    const down=type==='keydown';if(['Space','ArrowUp','KeyW'].includes(event.code)){score.unlock();if(down&&state?.phase==='menu')send('start');else session.input({type:'jump',down});}
    else if(down){if(['KeyP','Escape'].includes(event.code))send('pause');if(event.code==='KeyR')send('retry');if(event.code==='KeyC')send('checkpoint');if(event.code==='Enter')send(state?.phase==='menu'?'start':state?.phase==='paused'?'pause':'retry');}
  },{signal:abort.signal,capture:true});
  const blur=()=>{session.release(0);if(state?.phase==='play')session.input({type:'button',id:'pause'});};
  window.addEventListener('blur',blur,{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();},{signal:abort.signal});
  function dispose(){if(disposed)return;disposed=true;abort.abort();session.dispose();score.dispose();container.remove();}
  api.onDispose(dispose);
  return {exclusiveSimulation:true,dispose,session,get state(){return state;},isModalOpen:()=>state?.phase!=='play',update(dt){visualTime+=Math.min(dt,.05);score.update(state??{phase:'menu'});},render(){painter.render(state,visualTime);}};
}

