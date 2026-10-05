import { poseWitherSkeleton } from './witherSkeletonModel.js';
import { syncWitherEquipment } from './witherSkeleton.js';
export function installWitherSkeletonInspector(session,log) {
  const panel=document.createElement('fieldset');panel.id='wither-skeleton-controls';
  const legend=document.createElement('legend');legend.textContent='Wither Skeleton equipment';panel.append(legend);
  const add=(label,action)=>{const button=document.createElement('button');button.textContent=label;button.onclick=()=>{if(session.mob?.type!=='wither_skeleton')return;action(session.mob);syncWitherEquipment(session.mob);poseWitherSkeleton(session.mob);log(label);};panel.append(button);};
  for(const [label,weapon] of [['Stone sword','stone_sword'],['Bow (command equipment)','bow'],['Unarmed',null]])add(label,m=>{delete m.equipment.weapon;m.weapon=weapon;});
  add('Switch dominant hand',m=>{m.leftHanded=!m.leftHanded;});
  document.querySelector('aside').append(panel);
  const refresh=()=>{panel.hidden=document.getElementById('mob').value!=='wither_skeleton';};document.getElementById('mob').addEventListener('change',refresh);refresh();
}
