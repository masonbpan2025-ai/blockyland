import presentation from './client/presentation.js';
import { Vector3 } from 'three';
import manifest from './manifest.js';
import html from './client/ui.html?raw';
import css from './client/style.css?raw';
import { createGamePackageView } from '../../engine/gamePackageView.js';
import { createRescueGame } from './server/game.js';
import { SceneDefinitionView } from '../../engine/sceneDefinitionView.js';

export function register(api) {
  for(const definition of manifest.provides.items)api.registerItem(definition.id,definition);
  let preview;
  for(const definition of manifest.provides.mobs){
    api.registerMob(definition.id,definition);
    api.registerMobProvider(definition.id,{dimensions:{width:.8,height:2.4},spawn(x,y,z){
      preview ||= createRescueGame({previewOnly:true});
      const view=new SceneDefinitionView(this.scene);view.apply(preview.modelDefinition(definition.id));
      const mesh=view.root;mesh.position.set(x,y,z);
      const mob={type:definition.id,mesh,health:definition.health,maxHealth:definition.health,velocity:new Vector3(),parts:{},isHostile:true};
      this.mobs.push(mob);return mob;
    },update(){},hurt(mob,damage){mob.health=Math.max(0,mob.health-damage);}});
  }
  api.registerMap('campaign',{filename:'Rescue_Adventure.json',generator:'rescue_adventure:campaign',terrainPolicy:'finite_campaign'});
  api.registerGame({name:manifest.name,
    createView(api,mapData){return createGamePackageView(api,{modId:manifest.id,html,css,presentation,seed:mapData?.seed??2026,saved:mapData?.modState?.rescue_adventure??null});}
  });
}
