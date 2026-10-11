// The manifest, as a JS module.
//
// `mod.json` is the canonical file -- it is what a mod loader expects, what the CLI and the Inspector read
// from disk, and what `readModManifest` validates. This module is the same object in the form the BUNDLER and
// the BROWSER can both load.
//
// Why it exists: the loader used to `import manifest from './mod.json' with { type: 'json' }`. Node handles
// that (it resolves the file as JSON), so every test passed -- but Vite rewrites the specifier to
// `mod.json?import` and serves it as `text/javascript`, while the import attribute still demands JSON. Chrome
// rejects the mismatch, the whole module graph fails, `main.js` never runs, and every button on the start
// screen does nothing. A failure that is invisible to Node and total in the browser.
//
// `tests/modStructure.test.js` asserts this object and `mod.json` are identical, so the two cannot drift.
export default {
  id: 'dragonball_tournament',
  name: 'Dragon Ball World Tournament',
  version: '1.0.0',
  description: 'The Tenkaichi Budokai arena: an announcer host, four training grounds, Ki abilities (Kamehameha, Genki Dama, punch, dodge roll) and top-down dungeon combat.',
  entrypoint: './index.js',
  mechanism: 'dragonball_tournament',
  maps: ['World_Martial_Arts_Tournament.json'],
  provides: {
    mobs: [
      { id: 'tournament_host', name: 'Tournament Host', health: 20, hostile: false, dimensions: { width: 0.6, height: 1.95 } },
      { id: 'jackie_chun', name: 'Jackie Chun', health: 60, hostile: true, dimensions: { width: 0.6, height: 1.85 } },
    ],
    managers: [
      { id: 'tournament', name: 'Tournament Manager' },
      { id: 'trainingSites', name: 'Training Sites' },
      { id: 'dragonballSkills', name: 'Ki Skills' },
      { id: 'dungeonMode', name: 'Dungeon Combat Mode' },
    ],
    features: [
      'hasDragonBallSkills',
      'hasTournamentAnnouncer',
      'hasTrainingSites',
      'hasDungeonCombatMode',
      'hasOverheadHealthBars',
      'allowFistPunchAttack',
      'allowDodgeRoll',
    ],
  },
};
