// The eight Bed Wars teams, in Hypixel's order and colours (Red, Blue, Green, Yellow, Aqua, White, Pink, Gray), and the
// blocks each one builds with: its wool, its terracotta ("hardened clay"), its glass and its bed.
import { BLOCKS } from '../../blocks.js';

export const TEAMS = Object.freeze([
  { id: 'red', name: 'Red', letter: 'R', color: '#ff5555', wool: BLOCKS.RED_WOOL, clay: BLOCKS.RED_TERRACOTTA, glass: 'RED_STAINED_GLASS', bed: 'RED_BED' },
  { id: 'blue', name: 'Blue', letter: 'B', color: '#5555ff', wool: BLOCKS.BLUE_WOOL, clay: BLOCKS.BLUE_TERRACOTTA, glass: 'BLUE_STAINED_GLASS', bed: 'BLUE_BED' },
  { id: 'green', name: 'Green', letter: 'G', color: '#55ff55', wool: BLOCKS.LIME_WOOL, clay: 'LIME_TERRACOTTA', glass: 'LIME_STAINED_GLASS', bed: 'LIME_BED' },
  { id: 'yellow', name: 'Yellow', letter: 'Y', color: '#ffff55', wool: BLOCKS.YELLOW_WOOL, clay: 'YELLOW_TERRACOTTA', glass: 'YELLOW_STAINED_GLASS', bed: 'YELLOW_BED' },
  { id: 'aqua', name: 'Aqua', letter: 'A', color: '#55ffff', wool: BLOCKS.CYAN_WOOL, clay: 'CYAN_TERRACOTTA', glass: 'CYAN_STAINED_GLASS', bed: 'CYAN_BED' },
  { id: 'white', name: 'White', letter: 'W', color: '#ffffff', wool: BLOCKS.WHITE_WOOL, clay: 'WHITE_TERRACOTTA', glass: 'WHITE_STAINED_GLASS', bed: 'WHITE_BED' },
  { id: 'pink', name: 'Pink', letter: 'P', color: '#ff55ff', wool: BLOCKS.PINK_WOOL, clay: 'PINK_TERRACOTTA', glass: 'PINK_STAINED_GLASS', bed: 'PINK_BED' },
  { id: 'gray', name: 'Gray', letter: 'S', color: '#aaaaaa', wool: BLOCKS.GRAY_WOOL, clay: 'GRAY_TERRACOTTA', glass: 'GRAY_STAINED_GLASS', bed: 'GRAY_BED' },
].map((team) => {
  // Blocks named by string are looked up here, with a fallback, so a colour this build lacks still builds.
  const block = (value, fallback) => (typeof value === 'number' ? value : BLOCKS[value] ?? fallback);
  return Object.freeze({
    ...team,
    wool: block(team.wool, BLOCKS.WHITE_WOOL),
    clay: block(team.clay, BLOCKS.TERRACOTTA),
    glass: block(team.glass, BLOCKS.GLASS),
    bedFoot: block(team.bed, BLOCKS.RED_BED),
    bedHead: block(`${team.bed}_HEAD`, BLOCKS.RED_BED_HEAD),
  });
}));

export const TEAM_IDS = Object.freeze(TEAMS.map((t) => t.id));
export const teamById = (id) => TEAMS.find((t) => t.id === id) ?? null;

/**
 * The modes, as Hypixel's queues: how many teams, and how many players a team holds. Solo and Doubles have eight teams
 * and the cheaper prices; 3v3v3v3 and 4v4v4v4 have four and the dearer ones (shop.js). "Duel" is the 4v4 mode's two
 * teams, here for two friends or two pairs.
 */
export const MODES = Object.freeze({
  solo: { id: 'solo', name: 'Solo', teams: 8, size: 1, prices: 'small' },
  doubles: { id: 'doubles', name: 'Doubles', teams: 8, size: 2, prices: 'small' },
  threes: { id: 'threes', name: '3v3v3v3', teams: 4, size: 3, prices: 'large' },
  fours: { id: 'fours', name: '4v4v4v4', teams: 4, size: 4, prices: 'large' },
  duel: { id: 'duel', name: '4v4', teams: 2, size: 4, prices: 'large' },
});
export const MODE_IDS = Object.freeze(Object.keys(MODES));
