// SkyWars data pack "Nether Rift" (made for the classic template). A shard of the Nether: nylium and netherrack, huge fungi, basalt columns and lava pools in the middle.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Nether Rift"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "nether_rift",
    "templates": [
      "classic"
    ],
    "name": "Nether Rift",
    "description": "Crimson nylium over netherrack, huge fungi, basalt columns and lava pools in the middle; a brewing stand.",
    "palette": {
      "surface": "minecraft:crimson_nylium",
      "subsurface": "minecraft:netherrack",
      "core": "minecraft:blackstone",
      "ores": [
        {
          "block": "minecraft:nether_quartz_ore",
          "chance": 0.05
        },
        {
          "block": "minecraft:nether_gold_ore",
          "chance": 0.03
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:basalt",
      "trim": "minecraft:nether_bricks",
      "light": "minecraft:shroomlight"
    },
    "terrain": {
      "roughness": 0.35,
      "depth": 1.8,
      "size": 1
    },
    "decorations": [
      {
        "type": "huge_fungus",
        "kind": "crimson",
        "on": [
          "spawn"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "huge_fungus",
        "kind": "warped",
        "on": [
          "center"
        ],
        "count": [
          1,
          2
        ]
      },
      {
        "type": "spike",
        "block": "minecraft:basalt",
        "height": [
          3,
          6
        ],
        "on": [
          "center"
        ],
        "count": [
          2,
          3
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
        "type": "plants",
        "blocks": [
          "minecraft:crimson_roots"
        ],
        "density": 0.12,
        "on": [
          "spawn",
          "center"
        ]
      },
      {
        "type": "hanging",
        "block": "minecraft:glowstone",
        "length": 1,
        "density": 0.08,
        "on": [
          "spawn",
          "center"
        ]
      }
    ],
    "center": {
      "feature": "beacon_tower",
      "chests": 4,
      "enchanting_tables": 1,
      "anvils": 1,
      "brewing_stand": true
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
            "name": "minecraft:fire_charge",
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
            "name": "minecraft:obsidian",
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
          },
          {
            "type": "minecraft:empty",
            "weight": 1
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
            "name": "minecraft:flint_and_steel",
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
            "weight": 2
          }
        ]
      }
    ]
  }
};
