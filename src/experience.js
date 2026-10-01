// Minecraft Experience & Leveling Formulas (Vanilla 1.8+)
// Reference: https://minecraft.wiki/w/Experience

/**
 * Returns the exact XP required to advance from `level` to `level + 1`.
 */
export function getXpToNextLevel(level) {
  if (level <= 15) {
    return 2 * level + 7;
  }
  if (level <= 29) {
    return 5 * level - 38;
  }
  return 9 * level - 158;
}

/**
 * Returns total cumulative XP required to reach `level` from 0.
 */
export function getTotalXpForLevel(level) {
  if (level <= 0) return 0;
  if (level <= 16) {
    return level * level + 6 * level;
  }
  if (level <= 31) {
    return Math.floor(2.5 * level * level - 40.5 * level + 360);
  }
  return Math.floor(4.5 * level * level - 162.5 * level + 2220);
}

/**
 * Calculates current level from total accumulated experience points.
 */
export function getLevelFromTotalXp(totalXp) {
  if (totalXp <= 0) return 0;
  let level = 0;
  while (true) {
    const nextReq = getXpToNextLevel(level);
    if (totalXp >= nextReq) {
      totalXp -= nextReq;
      level++;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Adds experience points to player, handling progressive level-ups.
 * @param {object} player - Player object with .exp and .level
 * @param {number} amount - XP points to add
 * @param {object} sounds - Sound engine for level up / ding sounds
 * @param {object} ui - UI manager to update stats & HUD
 */
export function addPlayerExperience(player, amount, sounds = null, ui = null) {
  if (!player || amount <= 0) return { level: player?.level ?? 0, exp: player?.exp ?? 0, leveledUp: false };

  player.exp = (player.exp || 0) + amount;
  let leveledUp = false;

  while (true) {
    const needed = getXpToNextLevel(player.level || 0);
    if (player.exp >= needed) {
      player.exp -= needed;
      player.level = (player.level || 0) + 1;
      leveledUp = true;
    } else {
      break;
    }
  }

  if (leveledUp && sounds?.playLevelUp) {
    sounds.playLevelUp();
  }

  if (ui?.updateStats) {
    ui.updateStats();
  }

  return { level: player.level, exp: player.exp, leveledUp };
}

/**
 * Consumes experience levels from the player (e.g. for enchanting).
 * @param {object} player
 * @param {number} levelsToConsume
 * @param {object} ui
 */
export function consumePlayerLevels(player, levelsToConsume, ui = null) {
  if (!player || levelsToConsume <= 0) return true;
  if ((player.level || 0) < levelsToConsume) return false;

  player.level -= levelsToConsume;

  if (ui?.updateStats) {
    ui.updateStats();
  }
  return true;
}

/**
 * Returns fractional progress [0.0..1.0] of current level's XP bar.
 */
export function getExpProgress(player) {
  if (!player) return 0;
  const needed = getXpToNextLevel(player.level || 0);
  if (needed <= 0) return 0;
  return Math.min(1.0, Math.max(0.0, (player.exp || 0) / needed));
}
