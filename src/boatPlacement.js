import * as THREE from 'three';
import { isBoatItem, boatHasChest } from './boatModel.js';
import { findBoatPlacement } from './waterContact.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export function useBoat(game, item) {
  if (item?.isBlock || !isBoatItem(item?.id)) return false;
  const origin = new THREE.Vector3(game.player.position.x, game.player.position.y + (game.player.eyeHeight ?? 1.62), game.player.position.z);
  const direction = game.camera.getWorldDirection(new THREE.Vector3());
  let point = findBoatPlacement(game.world, origin, direction);
  if (!point && game.targetBlock) {
    const b = game.targetBlock, n = b.normal ?? { x: 0, y: 1, z: 0 };
    point = [b.x+n.x+0.5, b.y+n.y, b.z+n.z+0.5];
    const id = game.world.getVoxel(Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2]));
    if (id !== BLOCKS.AIR && BLOCK_DEFS[id]?.solid !== false) point = null;
  }
  if (point) {
    game.railSystem.spawnBoat(point, { subType: item.id, hasChest: boatHasChest(item.id) });
    game.sounds?.playPlace?.('wood');
    game.ui?.addChatMessage?.('Boat placed. Right-click to ride; W/S to row, A/D to steer.', 'system');
    if (game.player.gamemode !== 'creative') {
      game.inventory.consumeActiveItem(); game.ui?.updateHotbar?.();
    }
  }
  return true;
}
