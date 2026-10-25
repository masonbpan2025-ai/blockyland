// SkyWars data pack "Mushroom Isles" (made for the archipelago template). Mycelium islands under huge mushrooms; four semi-middle islands as in Mineplex maps.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Mushroom Isles"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "mushroom_isles",
    "templates": [
      "archipelago"
    ],
    "name": "Mushroom Isles",
    "description": "Mycelium under huge red and brown mushrooms, four semi-middle islands, mushroom stew to eat.",
    "palette": {
      "surface": "minecraft:mycelium",
      "subsurface": "minecraft:dirt",
      "core": "minecraft:stone",
      "ores": [
        {
          "block": "minecraft:coal_ore",
          "chance": 0.05
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:mushroom_stem",
      "trim": "minecraft:brown_mushroom_block",
      "light": "minecraft:shroomlight"
    },
    "terrain": {
      "roughness": 0.25,
      "depth": 1.6,
      "size": 1.05
    },
    "decorations": [
      {
        "type": "huge_mushroom",
        "kind": "red",
        "on": [
          "spawn"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "huge_mushroom",
        "kind": "brown",
        "on": [
          "center"
        ],
        "count": 1
      },
      {
        "type": "huge_mushroom",
        "kind": "red",
        "on": [
          "center",
          "mid"
        ],
        "count": [
          0,
          1
        ]
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:red_mushroom",
          "minecraft:brown_mushroom"
        ],
        "density": 0.12,
        "on": [
          "spawn",
          "center",
          "mid"
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
      "mid_islands": 4
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
            "name": "minecraft:mushroom_stew",
            "weight": 3,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:red_mushroom",
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
            "type": "minecraft:item",
            "name": "minecraft:brown_mushroom",
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
  "data/skywars/loot_table/chests/mid.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:golden_apple",
            "weight": 1,
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
            "type": "minecraft:empty",
            "weight": 1
          }
        ]
      }
    ]
  }
};
