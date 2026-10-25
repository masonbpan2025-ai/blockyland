// SkyWars data pack "Volcanic Shards" (made for the sectors template). Broken shards of a volcano: blackstone and basalt, lava pools, magma dripping underneath.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Volcanic Shards"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "volcanic_shards",
    "templates": [
      "sectors"
    ],
    "name": "Volcanic Shards",
    "description": "Blackstone shards with basalt columns and lava pools, magma hanging below. Fire resistance helps.",
    "palette": {
      "surface": "minecraft:blackstone",
      "subsurface": "minecraft:basalt",
      "core": "minecraft:blackstone",
      "ores": [
        {
          "block": "minecraft:magma_block",
          "chance": 0.06
        },
        {
          "block": "minecraft:nether_gold_ore",
          "chance": 0.02
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:polished_blackstone_bricks",
      "trim": "minecraft:magma_block",
      "light": "minecraft:shroomlight"
    },
    "terrain": {
      "roughness": 0.45,
      "depth": 2.2,
      "size": 1
    },
    "decorations": [
      {
        "type": "spike",
        "block": "minecraft:basalt",
        "height": [
          3,
          6
        ],
        "width": [
          1,
          2
        ],
        "on": [
          "spawn"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "spike",
        "block": "minecraft:basalt",
        "height": [
          4,
          7
        ],
        "width": [
          1,
          2
        ],
        "on": [
          "center",
          "sector"
        ],
        "count": [
          1,
          2
        ]
      },
      {
        "type": "pool",
        "fluid": "minecraft:lava",
        "radius": 1,
        "on": [
          "center"
        ],
        "count": 1
      },
      {
        "type": "hanging",
        "block": "minecraft:magma_block",
        "length": [
          1,
          2
        ],
        "density": 0.12,
        "on": [
          "spawn",
          "center",
          "sector"
        ]
      }
    ],
    "center": {
      "feature": "beacon_tower",
      "chests": 6,
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
            "name": "minecraft:potion_of_fire_resistance",
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
            "name": "minecraft:lava_bucket",
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
            "name": "minecraft:fire_charge",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 3,
                  "max": 5
                }
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
