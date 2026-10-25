// SkyWars data pack "Cherry Grove" (made for the sectors template). Pink cherry groves on calcite-veined islands; honey and berries.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Cherry Grove"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "cherry_grove",
    "templates": [
      "sectors"
    ],
    "name": "Cherry Grove",
    "description": "Cherry trees and pink petals on calcite-veined islands; honey and sweet berries in the chests.",
    "palette": {
      "surface": "minecraft:grass_block",
      "subsurface": "minecraft:dirt",
      "core": "minecraft:stone",
      "ores": [
        {
          "block": "minecraft:calcite",
          "chance": 0.1
        },
        {
          "block": "minecraft:iron_ore",
          "chance": 0.02
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:cherry_log",
      "trim": "minecraft:cherry_planks",
      "light": "minecraft:lantern"
    },
    "terrain": {
      "roughness": 0.2,
      "depth": 1.6,
      "size": 1
    },
    "decorations": [
      {
        "type": "tree",
        "kind": "cherry",
        "on": [
          "spawn",
          "sector"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "tree",
        "kind": "cherry",
        "on": [
          "center"
        ],
        "count": 1
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:pink_petals",
          "minecraft:pink_petals",
          "minecraft:short_grass",
          "minecraft:allium"
        ],
        "density": 0.25,
        "on": [
          "spawn",
          "center",
          "sector"
        ]
      }
    ],
    "center": {
      "feature": "lamp_posts",
      "chests": 6,
      "enchanting_tables": 1,
      "anvils": 1
    }
  },
  "data/skywars/loot_table/chests/island.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": {
          "min": 1,
          "max": 2
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:honey_bottle",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 1,
                  "max": 2
                }
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:sweet_berries",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 4,
                  "max": 8
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
        "rolls": {
          "min": 0,
          "max": 1
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:splash_potion_of_healing",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 2
              }
            ]
          },
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
            "type": "minecraft:empty",
            "weight": 1
          }
        ]
      }
    ]
  }
};
