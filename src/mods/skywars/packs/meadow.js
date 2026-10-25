// SkyWars data pack "Meadow" (made for the classic template). The classic look: grass islands with oaks and flowers, birches in the middle, lamp posts of glowstone.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Meadow"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "meadow",
    "templates": [
      "classic"
    ],
    "name": "Meadow",
    "description": "Grass and flowers, oaks on the spawn islands, birches and glowstone lamps in the middle.",
    "palette": {
      "surface": "minecraft:grass_block",
      "subsurface": "minecraft:dirt",
      "core": "minecraft:stone",
      "ores": [
        {
          "block": "minecraft:coal_ore",
          "chance": 0.04
        },
        {
          "block": "minecraft:iron_ore",
          "chance": 0.025
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:oak_log",
      "trim": "minecraft:oak_planks",
      "light": "minecraft:glowstone"
    },
    "terrain": {
      "roughness": 0.2,
      "depth": 1.6,
      "size": 1
    },
    "decorations": [
      {
        "type": "tree",
        "kind": "oak",
        "on": [
          "spawn"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "tree",
        "kind": "birch",
        "on": [
          "center"
        ],
        "count": [
          2,
          3
        ]
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:short_grass",
          "minecraft:short_grass",
          "minecraft:poppy",
          "minecraft:dandelion",
          "minecraft:cornflower"
        ],
        "density": 0.18,
        "on": [
          "spawn",
          "center"
        ]
      }
    ],
    "center": {
      "feature": "lamp_posts",
      "chests": 4,
      "enchanting_tables": 1,
      "anvils": 1
    }
  },
  "data/skywars/loot_table/chests/island.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": {
          "min": 0,
          "max": 1
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:apple",
            "weight": 3,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 2,
                  "max": 4
                }
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:bread",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 2,
                  "max": 4
                }
              }
            ]
          },
          {
            "type": "minecraft:empty",
            "weight": 2
          }
        ]
      }
    ]
  },
  "data/skywars/loot_table/chests/center.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": {
          "min": 0,
          "max": 1
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:golden_apple",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:experience_bottle",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 3,
                  "max": 6
                }
              }
            ]
          },
          {
            "type": "minecraft:empty",
            "weight": 3
          }
        ]
      }
    ]
  }
};
