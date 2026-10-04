import { spawnNaturalStrider } from './striderBehavior.js';
export function installStriderInspector(session,log){
  const panel=document.createElement('section');panel.id='strider-controls';
  panel.innerHTML='<label>Strider controls</label><label for="strider-item">Strider item</label><select id="strider-item"><option value="saddle">Saddle</option><option value="empty">Empty hand / mount</option><option value="warped_fungus_on_a_stick">Warped fungus on a stick</option><option value="warped_fungus">Warped fungus / breed</option><option value="shears">Shears / remove saddle</option><option value="golden_dandelion">Golden dandelion / age lock</option><option value="lead">Lead</option></select><div class="row"><button id="strider-use">Use Strider item</button><button id="strider-boost">Boost Strider</button><button id="strider-dismount">Dismount Strider</button><button id="strider-mate">Add Strider mate</button><button id="strider-baby">Add baby jockey</button></div><label for="strider-heading">Ride heading</label><input id="strider-heading" type="range" min="-180" max="180" value="0"><p>Adults need a saddle. Hold the fungus stick to move automatically; turn with Ride heading. Fungus feeds before mounting. Run showcase checks lava, water, rain, breeding, growth and both jockeys.</p>';
  document.querySelector('aside').append(panel);
  const refresh=()=>panel.hidden=session.mob?.type!=='strider';
  for(const id of ['mob','reset'])document.getElementById(id).addEventListener(id==='mob'?'change':'click',refresh);
  panel.querySelector('#strider-use').onclick=()=>{const id=panel.querySelector('#strider-item').value;session.inventory.active=id==='empty'?null:{id,count:64,durability:100};const ok=session.manager.animalBehaviors.interact(session.mob,session.player,session.inventory);log(ok?'Strider interaction accepted':'Item held; Strider cannot use it in this state');};
  panel.querySelector('#strider-boost').onclick=()=>log(session.manager.animalBehaviors.handleActiveItemUse(session.player,session.inventory)?'Strider boost started':'Hold fungus stick while riding; wait for an active boost to finish');
  panel.querySelector('#strider-dismount').onclick=()=>session.manager.animalBehaviors.dismount(session.player);
  panel.querySelector('#strider-heading').oninput=e=>session.player.yaw=+e.target.value*Math.PI/180;
  panel.querySelector('#strider-mate').onclick=()=>{const p=session.mob.mesh.position;const m=session.manager.spawnStrider(p.x+1.3,p.y,p.z);m.inLove=30;log('Mate added in love mode; feed the subject warped fungus.');};
  panel.querySelector('#strider-baby').onclick=()=>{const random=session.manager.random;session.manager.random=()=>0;const p=session.mob.mesh.position;spawnNaturalStrider(session.manager,p.x+3,p.y,p.z);session.manager.random=random;log('Baby jockey added.');};
  refresh();
}
