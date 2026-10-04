import { isSquid } from './squidBehavior.js';
export function installSquidInspector(session,log) {
  const box=document.createElement('fieldset');box.id='squid-controls';
  const legend=document.createElement('legend');legend.textContent='Squid interactions';box.append(legend);
  for(const [label,id] of [['Toggle baby','baby'],['Golden dandelion','golden_dandelion'],['Attach lead','lead'],['Name tag','name_tag']]){
    const button=document.createElement('button');button.textContent=label;button.onclick=()=>{const m=session.mob;if(!isSquid(m))return;
      if(id==='baby'){m.isBaby=!m.isBaby;m.babyGrowthTimer=1200;m.ageLocked=false;m.mesh.scale.setScalar(m.isBaby?.625:1);}
      else{session.inventory.active={id,count:64,customName:'Aquarium Squid'};const ok=session.manager.animalBehaviors.interact(m,session.player,session.inventory);log(ok?label+' applied':label+' unavailable');}
    };box.append(button);
  }
  document.querySelector('aside').append(box);
  const sync=()=>{box.hidden=!isSquid(session.mob);};document.getElementById('mob').addEventListener('change',sync);sync();
}
