import { LEVELS } from '../levels.js';
import { createGame } from '../server/game.js';
import css from './style.css?raw';
import { createPainter } from './painter.js';
import { createScore } from './audio.js';

export function createDashView(api) {
  const container=document.createElement('div');container.dataset.gameMod='voxel_dash';container.style.cssText='position:fixed;inset:0;z-index:100;pointer-events:auto;background:#06161b';
  const root=container.attachShadow({mode:'open'});
  root.innerHTML=`<style>${css}</style><canvas class="world" aria-label="Minecraft themed dash course"></canvas><canvas class="world world3d" aria-label="Minecraft themed dash course in 3D" hidden></canvas><div class="shade"></div>
  <main class="shell"><header class="top"><div class="brand"><span>▣</span> VOXEL DASH</div><div class="small">${LEVELS.length} levels. ${LEVELS.length} worlds. One rhythm.</div><div><button class="ghost sound">SOUND ON</button> <button class="ghost" data-action="exit">EXIT MOD</button></div></header>
  <section class="hero"><div class="eyebrow">MINECRAFT × GEOMETRY DASH</div><h1>A new world.<span>Every beat.</span></h1><p>Leap through luminous biomes. Ride the portals.<br>Find your flow, one block at a time.</p></section>
  <nav class="levels" aria-label="Choose a level">${LEVELS.map((l,i)=>`<button class="level" data-level="${i}" aria-pressed="${i===0}"><span class="num">${String(i+2).padStart(2,'0')}</span><span class="tile" style="background:${l.color}"></span><span><div class="name">${l.name}</div><div class="sub">${l.biome} · ${l.difficulty}</div></span><span class="rating">${l.stars} ★<small data-best="${i}">BEST 0%</small></span></button>`).join('')}</nav>
  <div class="viewpick" role="group" aria-label="View"><span class="small">VIEW</span><button class="pick" data-view="2d" aria-pressed="true"><b>2D</b> Side view</button><button class="pick" data-view="3d" aria-pressed="false"><b>3D</b> Run through the world</button><div class="anglepick" hidden><canvas class="angle-preview" tabindex="0" aria-label="Camera angle preview. Drag, or use the arrow keys, to turn; scroll, or + and -, to zoom"></canvas><div class="angle-row"><span>Drag to turn · scroll to zoom</span><button class="angle-reset" type="button">RESET</button></div></div></div>
  <div class="launch"><button class="primary" data-action="start">PLAY LEVEL ▷</button><button class="ghost" data-action="practice">PRACTICE OFF</button></div>
  <footer class="footer"><span>SPACE / CLICK / TAP<br>Jump · hold to fly</span><span>P / ESC<br>Pause the run</span><span>R / C<br>Retry / checkpoint</span><span>V<br>2D / 3D view</span></footer>
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
  // The 3D view (painter3d.js): the same run, drawn as a blocky world the course winds through, behind a chase camera.
  // The level page always opens on the side view. Choosing 3D opens a small preview beside the button, where the camera
  // angle is chosen by turning the world; the angle is remembered. The 3D painter is loaded only when first asked for.
  const canvas2d=root.querySelector('canvas.world:not(.world3d)'),canvas3d=root.querySelector('canvas.world3d');
  const anglePick=root.querySelector('.anglepick'),anglePreview=root.querySelector('.angle-preview');
  let view3d=false,painter3d=null,loading3d=null,cameraAngle=null;
  try{cameraAngle=JSON.parse(localStorage.getItem('voxel_dash:camera'));}catch{}
  function setView(want){
    view3d=want;
    for(const b of root.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String((b.dataset.view==='3d')===want));
    anglePick.hidden=!want;painter3d?.setPreview(want?anglePreview:null);
    if(want&&!painter3d&&!loading3d)loading3d=import('./painter3d.js').then(({createPainter3d})=>{
      if(disposed)return;painter3d=createPainter3d(canvas3d);if(cameraAngle)painter3d.setCameraAngle(cameraAngle);painter3d.setPreview(view3d?anglePreview:null);
    }).catch(error=>{console.warn('[Voxel Dash] 3D view unavailable:',error);status('The 3D view could not start here; showing the side view.');setView(false);}).finally(()=>{loading3d=null;});
  }
  // The preview's own pixels, matched to the 3D view's resolution so it is copied across one for one.
  {const ratio=Math.min(devicePixelRatio||1,1.5);anglePreview.width=Math.round(232*ratio);anglePreview.height=Math.round(130*ratio);}
  /** Turn the camera: by a change to its angle, kept within limits by the painter, and remembered. */
  function turnCamera(change){
    if(!painter3d)return;const a=painter3d.cameraAngle;
    painter3d.setCameraAngle({azimuth:a.azimuth+(change.azimuth??0),elevation:a.elevation+(change.elevation??0),distance:a.distance*(change.zoom??1)});
    cameraAngle=painter3d.cameraAngle;try{localStorage.setItem('voxel_dash:camera',JSON.stringify(cameraAngle));}catch{}
  }
  // Dragging turns the world under the finger: right turns it right (the camera goes left), down tips it towards you.
  let drag=null;
  anglePreview.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};anglePreview.setPointerCapture(event.pointerId);event.preventDefault();anglePreview.focus();},{signal:abort.signal});
  anglePreview.addEventListener('pointermove',event=>{if(!drag)return;turnCamera({azimuth:-(event.clientX-drag.x)*0.012,elevation:(event.clientY-drag.y)*0.01});drag={x:event.clientX,y:event.clientY};},{signal:abort.signal});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])anglePreview.addEventListener(type,()=>{drag=null;},{signal:abort.signal});
  anglePreview.addEventListener('wheel',event=>{event.preventDefault();turnCamera({zoom:Math.exp(event.deltaY*0.0012)});},{signal:abort.signal,passive:false});
  anglePreview.addEventListener('keydown',event=>{
    const change={ArrowLeft:{azimuth:0.1},ArrowRight:{azimuth:-0.1},PageUp:{elevation:0.08},PageDown:{elevation:-0.08},Equal:{zoom:0.9},NumpadAdd:{zoom:0.9},Minus:{zoom:1.1},NumpadSubtract:{zoom:1.1}}[event.code];
    if(change){event.preventDefault();turnCamera(change);}
  },{signal:abort.signal});
  // The run is played here, on the page, not in a worker 30 times a second. A dash game is timing: the course moves
  // every displayed frame, and a press counts at the moment it happens. The game advances by real elapsed time -- every
  // frame, and again at each press, before the press -- in its own 240 Hz physics ticks (simulation.js), so a jump
  // is never held back to the next frame or the next worker tick (Geometry Dash 2.206's "click between frames").
  const game=createGame();let lastAdvance=performance.now();
  function advance(){
    const now=performance.now();let dt=Math.min(.25,Math.max(0,(now-lastAdvance)/1000));lastAdvance=now;
    while(dt>1e-6){const stepDt=Math.min(dt,.1);game.update(stepDt);dt-=stepDt;}
  }
  const input=intent=>{advance();game.input(0,intent);state=game.snapshot();sync();};
  const send=id=>{score.unlock();input({type:'button',id});};
  state=game.snapshot();
  // The page around the run is rewritten only when what it shows changes: the progress bar every percent, the rest
  // on a new phase, level, attempt, coin, mode or record. Rewriting it every frame cost more than drawing the course.
  const hud={};
  let shownKey='',shownPercent=-1;
  function sync() {
    if(disposed||!state)return;
    const percentNow=Math.floor(state.x/LEVELS[state.levelIndex].length*100);
    const key=[state.phase,state.levelIndex,state.practice,state.attempt,state.coins,state.mode,state.scale,state.gravity,state.checkpoint,state.best.join(),state.completed.join()].join('|');
    if(key===shownKey){
      if(percentNow!==shownPercent){shownPercent=percentNow;(hud.bar??=root.querySelector('.progress i')).style.width=`${percentNow}%`;(hud.percent??=root.querySelector('.percent')).textContent=`${percentNow}%`;}
      return;
    }
    shownKey=key;shownPercent=percentNow;
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
    if(button.dataset.view){setView(button.dataset.view==='3d');return;}
    if(button.classList.contains('angle-reset')){if(painter3d){painter3d.setCameraAngle(null);cameraAngle=painter3d.cameraAngle;try{localStorage.removeItem('voxel_dash:camera');}catch{}}return;}
    if(button.classList.contains('sound')){score.unlock();const on=score.toggle();for(const b of root.querySelectorAll('.sound'))b.textContent=`SOUND ${on?'ON':'OFF'}`;return;}
    if(button.dataset.level!==undefined){input({type:'select',level:Number(button.dataset.level)});return;}
    const action=button.dataset.action;if(action==='exit'){const title=document.getElementById('btn-title-screen');if(title)title.click();else{api.loader.closeWorld();location.assign('/');}return;}if(action)send(action);
  },{signal:abort.signal});
  for(const canvas of [canvas2d,canvas3d]){
    canvas.addEventListener('pointerdown',event=>{if(state?.phase!=='play')return;score.unlock();event.preventDefault();heldPointer=event.pointerId;event.target.setPointerCapture(event.pointerId);input({type:'jump',down:true});},{signal:abort.signal});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,event=>{if(event.pointerId===heldPointer){input({type:'jump',down:false});heldPointer=null;}},{signal:abort.signal});
  }
  for(const type of ['keydown','keyup'])window.addEventListener(type,event=>{
    if(!['Space','ArrowUp','KeyW','KeyP','Escape','KeyR','KeyC','Enter','KeyV'].includes(event.code))return;
    event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
    const down=type==='keydown';if(['Space','ArrowUp','KeyW'].includes(event.code)){score.unlock();if(down&&state?.phase==='menu')send('start');else input({type:'jump',down});}
    else if(down){if(['KeyP','Escape'].includes(event.code))send('pause');if(event.code==='KeyR')send('retry');if(event.code==='KeyC')send('checkpoint');if(event.code==='KeyV'&&state?.phase==='menu')setView(!view3d);if(event.code==='Enter')send(state?.phase==='menu'?'start':state?.phase==='paused'?'pause':'retry');}
  },{signal:abort.signal,capture:true});
  const blur=()=>{advance();game.release(0);if(state?.phase==='play')input({type:'button',id:'pause'});};
  window.addEventListener('blur',blur,{signal:abort.signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)blur();},{signal:abort.signal});
  function dispose(){if(disposed)return;disposed=true;abort.abort();painter.dispose?.();painter3d?.dispose();score.dispose();container.remove();}
  api.onDispose(dispose);
  sync();
  return {exclusiveSimulation:true,dispose,session:null,game,get state(){return state;},isModalOpen:()=>state?.phase!=='play',
    update(dt){visualTime+=Math.min(dt,.05);advance();state=game.snapshot();sync();score.update(state);},get view(){return view3d?'3d':'2d';},get cameraAngle(){return painter3d?.cameraAngle??null;},render(){
    // The side view goes on being drawn until the 3D one has loaded.
    const show3d=Boolean(view3d&&painter3d);if(canvas3d.hidden===show3d){canvas3d.hidden=!show3d;canvas2d.hidden=show3d;}
    if(show3d)painter3d.render(state,visualTime);else painter.render(state,visualTime);}};
}

