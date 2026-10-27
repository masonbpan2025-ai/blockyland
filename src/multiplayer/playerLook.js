// What another player can see of this one, beyond where it stands: the armour it wears, what is in its off hand,
// a raised shield, a drawn bow or food at its mouth, flames, invisibility, and a fishing line out. Sent with every
// position (worldSyncManager.js), checked by the host (shareProtocol.js sanitizePlayerState), and drawn on the
// avatar (remotePlayerManager.js updateLook).
//
// Only the held item went before: a player in full netherite looked bare to everyone else, and a shield in the off
// hand, or one raised, was invisible.

export const ARMOR_ORDER = Object.freeze(['head', 'chest', 'legs', 'feet']);

/** One armour piece as it is seen: the item, and its trim when it has one. */
function seenPiece(item) {
  if (!item?.id) return null;
  const piece = { id: item.id };
  if (item.trim?.pattern && item.trim?.material) piece.trim = { pattern: item.trim.pattern, material: item.trim.material };
  return piece;
}

/**
 * This player's look, for the others.
 * @returns {{armor:(object|null)[], offhand:(string|number|null), blocking:boolean, using:('bow'|'eat'|null),
 *   burning:boolean, invisible:boolean, bobber:(number[]|null)}}
 */
export function lookOf(game) {
  const inventory = game?.inventory, player = game?.player;
  const bobber = game?.fishing?.bobber?.position;
  return {
    armor: ARMOR_ORDER.map((slot) => seenPiece(inventory?.armor?.[slot])),
    offhand: inventory?.offhand?.id ?? null,
    blocking: Boolean(player?.isBlocking),
    // A drawn bow is held out in both hands; food and potions are held to the mouth.
    using: game?.bow?.drawing ? 'bow' : game?.eating?.eating ? 'eat' : null,
    burning: Boolean(player?.isOnFire || player?.fireTicks > 0),
    invisible: Boolean(player?.hasStatusEffect?.('invisibility')),
    bobber: bobber ? [bobber.x, bobber.y, bobber.z].map((n) => Number(n.toFixed(2))) : null,
  };
}
