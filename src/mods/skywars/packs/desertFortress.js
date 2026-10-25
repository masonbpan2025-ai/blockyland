// SkyWars data pack "Desert Fortress" (made for the citadel template). Sandstone towers among cacti; TNT and flint and steel to take them down.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Desert Fortress"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "desert_fortress",
    "templates": [
      "citadel"
    ],
    "name": "Desert Fortress",
    "description": "A sandstone fortress among cacti and dead bushes. TNT and flint and steel in the chests.",
    "palette": {
      "surface": "minecraft:sand",
      "subsurface": "minecraft:sandstone",
      "core": "minecraft:sandstone",
      "ores": [
        {
          "block": "minecraft:gold_ore",
          "chance": 0.02
        },
        {
          "block": "minecraft:terracotta",
          "chance": 0.08
        }
      ],
      "cage": "minecraft:orange_stained_glass",
      "accent": "minecraft:cut_sandstone",
      "trim": "minecraft:chiseled_sandstone",
      "light": "minecraft:glowstone"
    },
    "terrain": {
      "roughness": 0.25,
      "depth": 1.5,
      "size": 1
    },
    "decorations": [
      {
        "type": "spike",
        "block": "minecraft:cactus",
        "height": [
          1,
          3
        ],
        "on": [
          "spawn"
        ],
        "count": [
          1,
          2
        ]
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:dead_bush"
        ],
        "density": 0.05,
        "on": [
          "spawn",
          "center"
        ]
      }
    ],
    "center": {
      "feature": "none",
      "enchanting_tables": 1,
      "anvils": 1
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
            "name": "minecraft:tnt",
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
            "type": "minecraft:item",
            "name": "minecraft:flint_and_steel",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
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
        "rolls": {
          "min": 0,
          "max": 1
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:tnt",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 4,
                  "max": 6
                }
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:potion_of_fire_resistance",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
              }
            ]
          },
          {
            "type": "minecraft:empty",
            "weight": 1
          }
        ]
      }
    ]
  }
};
