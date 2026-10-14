export function foodContainerFor(id) {
  return ['mushroom_stew','beetroot_soup','rabbit_stew','suspicious_stew'].includes(id)?'bowl':id==='honey_bottle'?'glass_bottle':null;
}
export function returnFoodContainer(game,id) {
  const container=foodContainerFor(id);if(!container)return;
  if(game.inventory.addItem(container,false,1)!==true)game.entities?.spawnDroppedItem?.(game.player.position.clone(),container,false,1);
}
