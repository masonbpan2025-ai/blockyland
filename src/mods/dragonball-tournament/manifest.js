// Generated from mod.json by scripts/generate-mod-catalog.mjs.
export default {
  "id": "dragonball_tournament",
  "name": "Dragon Ball World Tournament",
  "version": "1.0.0",
  "description": "The Tenkaichi Budokai arena: an announcer host, four training grounds, Ki abilities (Kamehameha, Genki Dama, punch, dodge roll) and top-down dungeon combat.",
  "entrypoint": "./index.js",
  "mechanism": "dragonball_tournament",
  "maps": [
    "World_Martial_Arts_Tournament.json"
  ],
  "provides": {
    "mobs": [
      {
        "id": "site_manager",
        "name": "Training Site Master",
        "health": 100,
        "hostile": false,
        "dimensions": {
          "width": 0.6,
          "height": 1.95
        }
      },
      {
        "id": "tournament_host",
        "name": "Tournament Host",
        "health": 100,
        "hostile": false,
        "dimensions": {
          "width": 0.6,
          "height": 1.95
        }
      },
      {
        "id": "jackie_chun",
        "name": "Jackie Chun",
        "health": 100,
        "hostile": true,
        "dimensions": {
          "width": 0.6,
          "height": 1.85
        }
      }
    ],
    "managers": [
      {
        "id": "tournament",
        "name": "Tournament Manager"
      },
      {
        "id": "trainingSites",
        "name": "Training Sites"
      },
      {
        "id": "dragonballSkills",
        "name": "Ki Skills"
      },
      {
        "id": "dungeonMode",
        "name": "Dungeon Combat Mode"
      }
    ],
    "features": [
      "hasDragonBallSkills",
      "hasTournamentAnnouncer",
      "hasTrainingSites",
      "hasDungeonCombatMode",
      "hasOverheadHealthBars",
      "allowFistPunchAttack",
      "allowDodgeRoll"
    ]
  }
};
