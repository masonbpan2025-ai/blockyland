import {isZombifiedPiglin,setZombifiedBaby,syncZombifiedEquipment,clearZombifiedAnger,mountZombified} from './zombifiedPiglin.js';
export function installZombifiedInspector(session,log){
 const panel=document.createElement('section');panel.id='zombified-controls';panel.innerHTML='<label>Zombified piglin controls</label><label for="zp-age">Age</label><select id="zp-age"><option value="adult">Adult</option><option value="baby">Baby (never grows)</option></select><label for="zp-weapon">Weapon</label><select id="zp-weapon"><option>golden_sword</option><option>golden_spear</option><option>crossbow</option><option>golden_axe</option><option value="none">Unarmed</option></select><label for="zp-difficulty">Difficulty</label><select id="zp-difficulty"><option>normal</option><option>easy</option><option>hard</option><option>peaceful</option></select><div class="row"><button id="zp-peer">Add peer</button><button id="zp-calm">Forgive target</button><button id="zp-jockey">Chicken jockey</button></div><p>Combat mode alone does not provoke this neutral mob. Hit it to start retaliation; peers join the same target.</p>';
 document.querySelector('aside').append(panel);
 const refresh=()=>{panel.hidden=!isZombifiedPiglin(session.mob);if(!panel.hidden){panel.querySelector('#zp-age').value=session.mob.isBaby?'baby':'adult';panel.querySelector('#zp-weapon').value=session.mob.weapon||'none';panel.querySelector('#zp-difficulty').value=session.manager.game.difficulty;}};
 for(const id of ['mob','reset'])document.getElementById(id).addEventListener(id==='mob'?'change':'click',refresh);
 panel.querySelector('#zp-age').onchange=e=>setZombifiedBaby(session.mob,e.target.value==='baby');
 panel.querySelector('#zp-weapon').onchange=e=>{session.mob.weapon=e.target.value==='none'?null:e.target.value;delete session.mob.equipment.weapon;syncZombifiedEquipment(session.mob);};
 panel.querySelector('#zp-difficulty').onchange=e=>session.manager.game.difficulty=e.target.value;
 panel.querySelector('#zp-peer').onclick=()=>{const p=session.mob.mesh.position;session.manager.spawnZombifiedPiglin(p.x+3,p.y,p.z,{natural:false});log('Peer added; provoke the subject to recruit it.');};
 panel.querySelector('#zp-calm').onclick=()=>{for(const m of session.manager.mobs)if(isZombifiedPiglin(m))clearZombifiedAnger(m);log('Targets forgiven.');};
 panel.querySelector('#zp-jockey').onclick=()=>{if(session.mob.jockeyMount)return;const p=session.mob.mesh.position;setZombifiedBaby(session.mob,true);mountZombified(session.mob,session.manager.spawnChicken(p.x,p.y,p.z));refresh();};refresh();
}
