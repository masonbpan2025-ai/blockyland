// SkyWars data pack "Sky Ruins" (made for the archipelago template). Mossy ruins on every connector island: broken walls to hide behind from bows.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Sky Ruins"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "sky_ruins",
    "templates": [
      "archipelago"
    ],
    "name": "Sky Ruins",
    "description": "Moss and broken stone-brick walls to hide behind, azaleas, hanging roots; the connector chests hold the treasure.",
    "palette": {
      "surface": "minecraft:moss_block",
      "subsurface": "minecraft:dirt",
      "core": "minecraft:stone",
      "ores": [
        {
          "block": "minecraft:mossy_cobblestone",
          "chance": 0.1
        },
        {
          "block": "minecraft:coal_ore",
          "chance": 0.03
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:stone_bricks",
      "trim": "minecraft:mossy_stone_bricks",
      "light": "minecraft:lantern"
    },
    "terrain": {
      "roughness": 0.4,
      "depth": 1.5,
      "size": 1
    },
    "decorations": [
      {
        "type": "ruin",
        "blocks": [
          "minecraft:stone_bricks",
          "minecraft:mossy_stone_bricks",
          "minecraft:cracked_stone_bricks",
          "minecraft:mossy_cobblestone"
        ],
        "height": [
          1,
          3
        ],
        "on": [
          "mid"
        ],
        "count": 1
      },
      {
        "type": "ruin",
        "blocks": [
          "minecraft:stone_bricks",
          "minecraft:mossy_stone_bricks",
          "minecraft:cracked_stone_bricks",
          "minecraft:mossy_cobblestone"
        ],
        "height": [
          2,
          3
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
        "type": "tree",
        "kind": "azalea",
        "on": [
          "spawn"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:moss_carpet",
          "minecraft:short_grass"
        ],
        "density": 0.2,
        "on": [
          "spawn",
          "center",
          "mid"
        ]
      },
      {
        "type": "hanging",
        "block": "minecraft:hanging_roots",
        "length": [
          1,
          2
        ],
        "density": 0.2,
        "on": [
          "spawn",
          "mid",
          "center"
        ]
      }
    ],
    "center": {
      "feature": "lamp_posts",
      "chests": 4,
      "enchanting_tables": 1,
      "anvils": 2
    },
    "template_options": {
      "mid_islands": 8
    }
  },
  "data/skywars/loot_table/chests/mid.json": {
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
            "name": "minecraft:golden_apple",
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
            "name": "minecraft:ender_pearl",
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
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:enchanted_golden_apple",
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
            "weight": 9
          }
        ]
      }
    ]
  }
};
