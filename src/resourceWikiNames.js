// How this game's block names map onto the wiki's: the game names some block *states* as blocks of their own
// ("Oak Door Top Open", "Moist Farmland", "Wheat Stage 3"), which the wiki covers under the block's name.

/** A block state's name without the state words this game adds ("Oak Door Top Open" -> "Oak Door"). */
export function baseBlockName(name) {
  let n = String(name);
  for (let round = 0; round < 4; round++) {
    const before = n;
    n = n.replace(/\s+(Open|Top|Bottom|Head|Foot|Lit|Powered|On|Off|Active|Stage \d+|\d+)$/i, '').replace(/^(Lit|Moist|Powered|Open)\s+/i, '');
    if (n === before) break;
  }
  return n;
}
