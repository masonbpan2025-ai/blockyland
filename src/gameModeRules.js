// The four Java game modes, as their wiki pages describe them. The game had two (Survival and Creative); the
// systems audit's round 4 added Adventure and Spectator. Every rule the game asks is here, so a mode is one row.
//
// Adventure: "similar to Survival in that players receive damage from their environment, dying is possible, and
// players must manage hunger"; "blocks can be destroyed only with an item/tool that has the can_break component,
// and cannot be destroyed by the player's fist. Likewise, blocks require the can_place_on component to be placed"
// (this game has no such components, so nothing is mined or placed); still "interacting with mobs and other
// entities (for example, killing them), turning a redstone mechanism (such as a lever) on or off, and trading".
// Spectator: "fly around and observe the world without interacting with it in any way"; "can fly, go through
// blocks and entities"; "Spectators are not noticed by mobs, and do not trigger mob spawning ... nor do they prevent
// mob despawning"; "Spectators cannot take damage ... However, they can still take damage from the void or the
// /kill command"; "Spectators are always flying"; "Items in the world also cannot be picked up".

export const GAME_MODE_IDS = Object.freeze(['survival', 'creative', 'adventure', 'spectator']);
/** Java's numeric and one-letter aliases: /gamemode 2, /gamemode sp. */
export const GAME_MODE_ALIASES = Object.freeze({ 0: 'survival', s: 'survival', 1: 'creative', c: 'creative', 2: 'adventure', a: 'adventure', 3: 'spectator', sp: 'spectator' });

const RULES = {
  survival: { breakBlocks: true, placeBlocks: true, interact: true, attack: true, damage: true, hunger: true, pickUp: true, noticed: true, alwaysFlying: false, noclip: false, instantBreak: false },
  creative: { breakBlocks: true, placeBlocks: true, interact: true, attack: true, damage: false, hunger: false, pickUp: true, noticed: false, alwaysFlying: false, noclip: false, instantBreak: true },
  adventure: { breakBlocks: false, placeBlocks: false, interact: true, attack: true, damage: true, hunger: true, pickUp: true, noticed: true, alwaysFlying: false, noclip: false, instantBreak: false },
  spectator: { breakBlocks: false, placeBlocks: false, interact: false, attack: false, damage: false, hunger: false, pickUp: false, noticed: false, alwaysFlying: true, noclip: true, instantBreak: false },
};

/** A mode name from an argument ("adventure", "a", "2"), or null. */
export function resolveGameMode(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  return GAME_MODE_IDS.includes(v) ? v : GAME_MODE_ALIASES[v] ?? null;
}

/** The rules for a mode (Survival's for anything unknown). */
export const modeRules = (mode) => RULES[mode] ?? RULES.survival;

/** Survival and Adventure share health, hunger, drops and death. */
export const isSurvivalLike = (mode) => mode === 'survival' || mode === 'adventure';

/** Does this damage reach a player in this mode? A spectator only takes the void's and /kill's. */
export function takesDamage(mode, damageType = 'generic') {
  if (modeRules(mode).damage) return true;
  return mode === 'spectator' && (damageType === 'void' || damageType === 'kill' || damageType === 'out_of_world');
}

/**
 * The player as the mob, spawning and item code should see them: a spectator is a stand-in far below the world,
 * so no mob targets it, nothing spawns or stays loaded on its account, and nothing is picked up. Every other
 * field is the real player's (it is the prototype), so code that reads a name or a setting still works.
 */
export function playerAsSeenByWorld(player, vectorFactory = null) {
  if (!player || modeRules(player.gamemode).noticed || player.gamemode === 'creative') return player;
  if (player.gamemode !== 'spectator') return player;
  const far = vectorFactory ? vectorFactory(player.position.x, -100000, player.position.z) : { x: player.position.x, y: -100000, z: player.position.z };
  const decoy = Object.create(player);
  decoy.position = far;
  decoy.takeDamage = () => 0;
  decoy.isSpectatorDecoy = true;
  return decoy;
}
