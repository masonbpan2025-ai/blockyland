// SkyWars data pack "Tropical Atoll" (made for the archipelago template). Sand atolls with palms, a lagoon in the middle, and eight connector islands on the way in.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Tropical Atoll"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "tropical_atoll",
    "templates": [
      "archipelago"
    ],
    "name": "Tropical Atoll",
    "description": "Sandy atolls with palms, a lagoon in the middle and eight small islands between. Rods, buckets and a trident.",
    "palette": {
      "surface": "minecraft:sand",
      "subsurface": "minecraft:sandstone",
      "core": "minecraft:sandstone",
      "ores": [
        {
          "block": "minecraft:prismarine",
          "chance": 0.04
        },
        {
          "block": "minecraft:gold_ore",
          "chance": 0.015
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:jungle_log",
      "trim": "minecraft:jungle_planks",
      "light": "minecraft:sea_lantern"
    },
    "terrain": {
      "roughness": 0.3,
      "depth": 1.4,
      "size": 1
    },
    "decorations": [
      {
        "type": "tree",
        "kind": "jungle",
        "on": [
          "spawn"
        ],
        "count": 1
      },
      {
        "type": "tree",
        "kind": "jungle",
        "on": [
          "mid"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "tree",
        "kind": "jungle",
        "on": [
          "center"
        ],
        "count": [
          1,
          2
        ]
      },
      {
        "type": "pool",
        "fluid": "minecraft:water",
        "radius": 1,
        "on": [
          "center"
        ],
        "count": [
          1,
          2
        ]
      },
      {
        "type": "boulder",
        "block": "minecraft:prismarine",
        "size": 1,
        "on": [
          "center"
        ],
        "count": [
          0,
          1
        ]
      }
    ],
    "center": {
      "feature": "none",
      "chests": 4,
      "enchanting_tables": 1,
      "anvils": 1
    },
    "template_options": {
      "mid_islands": 8
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
            "name": "minecraft:fishing_rod",
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
            "name": "minecraft:water_bucket",
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
            "name": "minecraft:cooked_cod",
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
          }
        ]
      }
    ]
  },
  "data/skywars/loot_table/chests/mid.json": {
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
            "name": "minecraft:water_bucket",
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
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:trident",
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
            "name": "minecraft:splash_potion_of_healing",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 2
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
  }
};
