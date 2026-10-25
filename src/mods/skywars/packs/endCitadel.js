// SkyWars data pack "End Citadel" (made for the citadel template). An End city of purpur over end stone, obsidian pillars with end rods; more ender pearls.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: End Citadel"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "end_citadel",
    "templates": [
      "citadel"
    ],
    "name": "End Citadel",
    "description": "Purpur towers on end stone, obsidian pillars crowned with end rods, and more ender pearls than anywhere.",
    "palette": {
      "surface": "minecraft:end_stone",
      "subsurface": "minecraft:end_stone",
      "core": "minecraft:end_stone",
      "ores": [
        {
          "block": "minecraft:obsidian",
          "chance": 0.05
        }
      ],
      "cage": "minecraft:purple_stained_glass",
      "accent": "minecraft:purpur_block",
      "trim": "minecraft:purpur_pillar",
      "light": "minecraft:end_rod"
    },
    "terrain": {
      "roughness": 0.3,
      "depth": 1.7,
      "size": 1
    },
    "decorations": [
      {
        "type": "spike",
        "block": "minecraft:obsidian",
        "height": [
          3,
          5
        ],
        "cap": "minecraft:crying_obsidian",
        "on": [
          "spawn"
        ],
        "count": 1
      },
      {
        "type": "spike",
        "block": "minecraft:obsidian",
        "height": [
          5,
          8
        ],
        "width": 2,
        "cap": "minecraft:end_rod",
        "on": [
          "center"
        ],
        "count": [
          1,
          2
        ]
      }
    ],
    "center": {
      "feature": "none",
      "enchanting_tables": 1,
      "anvils": 1,
      "brewing_stand": true
    }
  },
  "data/skywars/loot_table/chests/island.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:ender_pearl",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:chorus_fruit",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 2,
                  "max": 4
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "data/skywars/loot_table/chests/center.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:ender_pearl",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 2,
                  "max": 3
                }
              }
            ]
          }
        ]
      }
    ]
  }
};
