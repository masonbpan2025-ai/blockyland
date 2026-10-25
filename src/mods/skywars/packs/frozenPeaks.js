// SkyWars data pack "Frozen Peaks" (made for the classic template). Snow islands with spruces, ice spikes in the middle and icicles hanging under every island.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Frozen Peaks"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "frozen_peaks",
    "templates": [
      "classic"
    ],
    "name": "Frozen Peaks",
    "description": "Snow-capped islands, spruces, ice spikes in the middle and icicles below. Snowballs in every chest.",
    "palette": {
      "surface": "minecraft:snow_block",
      "subsurface": "minecraft:snow_block",
      "core": "minecraft:stone",
      "ores": [
        {
          "block": "minecraft:iron_ore",
          "chance": 0.03
        },
        {
          "block": "minecraft:lapis_ore",
          "chance": 0.02
        },
        {
          "block": "minecraft:packed_ice",
          "chance": 0.06
        }
      ],
      "cage": "minecraft:light_blue_stained_glass",
      "accent": "minecraft:packed_ice",
      "trim": "minecraft:spruce_planks",
      "light": "minecraft:lantern"
    },
    "terrain": {
      "roughness": 0.3,
      "depth": 2,
      "size": 1
    },
    "decorations": [
      {
        "type": "tree",
        "kind": "spruce",
        "on": [
          "spawn"
        ],
        "count": 1
      },
      {
        "type": "tree",
        "kind": "spruce",
        "on": [
          "center"
        ],
        "count": [
          2,
          3
        ]
      },
      {
        "type": "spike",
        "block": "minecraft:packed_ice",
        "height": [
          4,
          8
        ],
        "width": [
          1,
          2
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
        "type": "hanging",
        "block": "minecraft:ice",
        "length": [
          1,
          3
        ],
        "density": 0.25,
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
            "name": "minecraft:snowball",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 8,
                  "max": 16
                }
              }
            ]
          }
        ]
      },
      {
        "rolls": {
          "min": 0,
          "max": 1
        },
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:packed_ice",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 8,
                  "max": 12
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
            "name": "minecraft:splash_potion_of_swiftness",
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
            "name": "minecraft:snowball",
            "weight": 2,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 16
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
