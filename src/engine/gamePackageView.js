import {CampaignPresentation} from './campaignPresentation.js';
import * as THREE from 'three';
import { ModClientSession } from './modClientSession.js';
import { SceneDefinitionView } from './sceneDefinitionView.js';
import { installVoxelCampaign } from './voxelCampaign.js';

export function createGamePackageView(api,{modId,html,css,seed=2026,saved=null,presentation:profile=null}) {
  const game=api.game,container=document.createElement('div');container.dataset.gameMod=modId;
  container.style.cssText='position:fixed;inset:0;pointer-events:auto;z-index:100';
  const shadow=container.attachShadow({mode:'open'});shadow.innerHTML=`<style>:host{color:#fff}button{pointer-events:auto}${css}</style>${html}`;document.body.append(container);
  const toolbar=document.createElement('div');toolbar.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);pointer-events:auto;z-index:20;display:flex;gap:6px;max-width:calc(100vw - 16px);flex-wrap:wrap;justify-content:center';
  toolbar.innerHTML='<button data-session="host">HOST NEW ONLINE</button><button data-session="join">JOIN ROOM</button><button data-session="load">LOAD RUN</button><button data-session="save">SAVE RUN</button><button data-session="exit">MAIN MENU</button><span data-room></span>';
  shadow.append(toolbar);
  const previousBackground=game.scene.background?.clone?.(),previousFog=game.scene.fog?{near:game.scene.fog.near,far:game.scene.fog.far}:null;
  const camera=new THREE.OrthographicCamera(-24,24,16,-16,.1,170);
  const presentation=profile?new CampaignPresentation(game,camera,profile):null;
  const view=new SceneDefinitionView(game.scene,20,mesh=>presentation?.configureMesh(mesh));
  const follow=new THREE.Vector3();let hasFollow=false;
  let state,terrain=[],disposed=false,terrainSeed=null,zoom=profile?.zoom??16;
  if(document.pointerLockElement)document.exitPointerLock();
  const abort=new AbortController(),savedVisibility=[];
  for(const element of document.querySelectorAll('#hud,#status-bars,#hotbar,#crosshair,#chat-messages')){savedVisibility.push([element,element.style.display]);element.style.display='none';}
  api.extend(game.player,{controlsDisabled:true});
  const error=message=>{const status=shadow.querySelector('[data-room]');status.textContent=message;status.style.color='#ffdb94';const toast=shadow.querySelector('#toast');toast.textContent=message;toast.style.opacity='1';};
  const session=new ModClientSession(modId,{seed,saved},frame=>{
    if(disposed)return;
    try{
      if(frame.terrain&&(terrainSeed!==frame.state.seed||frame.reset)){terrain=frame.terrain;if(terrainSeed!==frame.state.seed){presentation?.clearTerrain();installVoxelCampaign(game,terrain,frame.state.seed,{decorativeProps:Boolean(presentation)});presentation?.installTerrain(terrain);terrainSeed=frame.state.seed;}}
      view.apply(frame.scene,frame.removed,frame.reset);state=frame.state;
      for(const [id,def]of Object.entries(state.ui)){const element=shadow.getElementById(id);if(!element)continue;if(def.hidden!==null)element.hidden=def.hidden;
        if(def.text!==null&&!['map','mode-choice','difficulty-choice','ui','overlay','boss','victory','story-dialog'].includes(id)&&element.tagName!=='SECTION'&&element.childElementCount===0)element.textContent=def.text;
        if(element.tagName==='BUTTON'&&def.disabled!==null)element.disabled=def.disabled;
        Object.assign(element.style,def.style);for(const [key,value]of Object.entries(def.attributes??{}))element.setAttribute(key,value);}
      for(const event of state.events??[])if(event.type==='tone')game.sounds?.playTone(event.frequency,event.duration);
      if(!hasFollow)updateCamera();drawMap();
    }catch(e){error(e.message);}
  },error);
  function updateCamera(dt=1/30){if(!state?.players.length)return;const alive=state.players.filter(p=>p.hp>0),players=alive.length?alive:state.players;
    const x=players.reduce((sum,p)=>sum+p.x,0)/players.length,z=players.reduce((sum,p)=>sum+p.z,0)/players.length;
    const desired=new THREE.Vector3(x,21.6,z);
    if(!hasFollow){follow.copy(desired);hasFollow=true;}else follow.lerp(desired,1-Math.exp(-dt*8));
    const distance=players.length>1?Math.hypot(players[0].x-players[1].x,players[0].z-players[1].z):0;
    const span=zoom+Math.min(7,distance*.35),aspect=innerWidth/innerHeight;camera.left=-span*aspect;camera.right=span*aspect;camera.top=span;camera.bottom=-span;camera.updateProjectionMatrix();camera.position.copy(follow).add(new THREE.Vector3(25,32,25));camera.lookAt(follow);
    game.player.position.set(x,21,z);
    if(presentation)presentation.update(state,follow);else{game.scene.background.setHex(0x142431);if(game.scene.fog){game.scene.fog.near=80;game.scene.fog.far=200;}}
    if(state.objective){const target=new THREE.Vector3(state.objective.x,23,state.objective.z).project(camera),marker=shadow.getElementById('marker');marker.style.left=Math.max(45,Math.min(innerWidth-45,(target.x*.5+.5)*innerWidth))+'px';marker.style.top=Math.max(145,Math.min(innerHeight-135,(-target.y*.5+.5)*innerHeight))+'px';}

  }
  function drawMap(){const canvas=shadow.getElementById('map'),ctx=canvas.getContext('2d');ctx.fillStyle='#071014';ctx.fillRect(0,0,256,192);
    for(const tile of terrain){const visible=state.players.some(p=>p.hp>0&&Math.hypot(tile.x*2+1-p.x,tile.z*2+1-p.z)<p.sight);tile.seen ||= visible;if(!tile.seen)continue;
      ctx.globalAlpha=visible?1:.22;ctx.fillStyle=tile.wet?'#386b93':['#567b36','#aa7142','#375950','#b4cdd1','#403948'][tile.b];ctx.fillRect(tile.x*2,tile.z*2,2,2);}
    ctx.globalAlpha=1;for(const p of state.players){ctx.fillStyle=p.name==='Mason'?'#fff':'#d49aff';ctx.fillRect(p.x-2,p.z-2,4,4);}
  }
  shadow.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;
    if(button.dataset.session){const action=button.dataset.session;
      if(action==='exit'){api.loader.closeWorld();game.ui?.returnToMainMenu?.();location.href='/';}
      if(action==='host'||action==='join'){session.options.seed=state?.seed??seed;session.options.difficulty=state?.difficulty??'normal';const room=action==='join'?prompt('Room code'):null;if(action==='join'&&!room)return;session.connect(room).then(info=>{shadow.querySelector('[data-room]').textContent=`ROOM ${info.room} · ${info.slot===0?'Mason':'Jayden'}`;}).catch(e=>error(e.message));}
      if(action==='load'){try{const saved=JSON.parse(localStorage.getItem(`${modId}:save`));if(!saved)throw new Error('No saved run');session.restore(saved);}catch(e){error(e.message);}}
      if(action==='save')session.save().then(data=>{localStorage.setItem(`${modId}:save`,JSON.stringify(data));error('Run saved. Use LOAD RUN to resume it.');}).catch(e=>error(e.message));
      return;
    }
    if(button.id)session.input({type:'button',id:button.id},0);
  },{signal:abort.signal});
  const keys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL','KeyU','KeyN','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backslash','Backspace','KeyP','KeyM','Escape']);
  for(const name of ['keydown','keyup'])window.addEventListener(name,event=>{
    if(!keys.has(event.code))return;event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
    if(event.code==='KeyM'&&name==='keydown'){shadow.getElementById('mapbox').classList.toggle('expanded');return;}
    if(event.code==='KeyP'||event.code==='Escape'){if(name==='keydown')session.input({type:'button',id:'pause-button'});return;}
    const p2=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Backslash','Backspace'].includes(event.code);
    if(event.code==='Enter'&&state?.phase==='intro'&&name==='keydown'){session.input({type:'button',id:'story-next'},0);return;}
    session.input({type:'key',code:event.code,down:name==='keydown'},session.socket?session.slot:p2?1:0);
  },{capture:true,signal:abort.signal});
  window.addEventListener('blur',()=>{session.release(0);if(!session.socket)session.release(1);},{signal:abort.signal});
  window.addEventListener('wheel',event=>{if(state?.phase!=='play')return;event.preventDefault();zoom=Math.max(11,Math.min(30,zoom+event.deltaY*.008));updateCamera();},{passive:false,signal:abort.signal});
  const dispose=()=>{if(disposed)return;disposed=true;abort.abort();session.dispose();view.dispose();presentation?.dispose();container.remove();if(previousBackground)game.scene.background.copy(previousBackground);if(previousFog&&game.scene.fog)Object.assign(game.scene.fog,previousFog);for(const [element,display]of savedVisibility)element.style.display=display;};
  api.onDispose(dispose);
  return {dispose,exclusiveSimulation:true,camera,update(dt){updateCamera(dt);},render:()=>presentation?presentation.render():(game.renderer.clear(),game.renderer.render(game.scene,camera)),presentation,isModalOpen:()=>state?.phase!=='play',session,get state(){return state;}};
}
