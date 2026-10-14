import * as THREE from 'three';
export function createRuntime(game, activateWorld = null) {
  return {
    isModalOpen() {
      const tournament = game.tournament;
      return Boolean(tournament?.setupModal && !tournament.setupModal.classList.contains('hidden'))
        || Boolean(tournament?.championOverlay?.classList.contains('visible'));
    },
    activate: mapData => activateWorld?.(game, mapData),
    update(dt) {
    if (game.tournament && (game.mechanisms ? game.mechanisms.isFeatureEnabled('hasTournamentAnnouncer') : game.tournament.isTournamentMap)) {
      game.tournament.update(dt, game.player);
    }
    if (game.dragonballSkills && (game.mechanisms ? game.mechanisms.isFeatureEnabled('hasDragonBallSkills') : game.dragonballSkills.enabled)) {
      game.dragonballSkills.update(dt);
    }
    if (game.trainingSites && (game.mechanisms ? game.mechanisms.isFeatureEnabled('hasTrainingSites') : game.tournament?.isTournamentMap)) {
      game.trainingSites.update(dt, game.player);
    }
    if (game.dungeonMode && (game.mechanisms ? game.mechanisms.isFeatureEnabled('hasDungeonCombatMode') : game.tournament?.isTournamentMap)) {
      game.dungeonMode.update(dt);
    }

    },
    constrainMovement(player, newPos) {
    // Prevent player from leaving the battle stage during tournament combat
    if (game?.tournament?.isTournamentMap && game.tournament.state === 'FIGHTING') {
      const tm = game.tournament;
      const minX = (tm.stageMinX ?? -8.5) + 0.35;
      const maxX = (tm.stageMaxX ?? 8.5) - 0.35;
      const minZ = (tm.stageMinZ ?? -8.5) + 0.35;
      const maxZ = (tm.stageMaxZ ?? 8.5) - 0.35;
      const minY = tm.stageMinY ?? 24.0;

      if (newPos.x < minX) { newPos.x = minX; if (player.velocity.x < 0) player.velocity.x = 0; }
      else if (newPos.x > maxX) { newPos.x = maxX; if (player.velocity.x > 0) player.velocity.x = 0; }

      if (newPos.z < minZ) { newPos.z = minZ; if (player.velocity.z < 0) player.velocity.z = 0; }
      else if (newPos.z > maxZ) { newPos.z = maxZ; if (player.velocity.z > 0) player.velocity.z = 0; }

      if (newPos.y < minY) {
        newPos.y = minY;
        if (player.velocity.y < 0) {
          player.velocity.y = 0;
          player.onGround = true;
        }
      }
    }

    },
    canChangeGameMode() {
      if (!game.tournament?.isTournamentMap) return true;
      game.ui?.addChatMessage('The World Martial Arts Tournament is survival mode only!', 'system');
      return false;
    },
    keepInventoryOnDeath: () => !!game.tournament?.isTournamentMap,
    onPlayerDeath() {
      if (game.dungeonMode?.isActive) game.dungeonMode.exitDungeonMode(false);
      if (!game.tournament?.isTournamentMap) return false;
      game.tournament.handlePlayerDeath?.();
      return true;
    },
    respawn(player) {
      if (!game.tournament?.isTournamentMap) return false;
      player.position.copy(game.tournament.hostPosition || new THREE.Vector3(3.5, 24, 10.5));
      game.tournament.reset?.();
      return true;
    },
  };
}
