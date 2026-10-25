// SkyWars data pack "Sweet Slices" (made for the sectors template). An homage to Hypixel's Desserted Islands: frosting, sponge and chocolate, candy canes and cakes.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Sweet Slices"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "sweet_slices",
    "templates": [
      "sectors"
    ],
    "name": "Sweet Slices",
    "description": "Hypixel's Desserted Islands remembered: frosted cake islands, candy canes and cakes; cookies to eat.",
    "palette": {
      "surface": "minecraft:white_wool",
      "subsurface": "minecraft:pink_terracotta",
      "core": "minecraft:brown_terracotta",
      "ores": [
        {
          "block": "minecraft:red_wool",
          "chance": 0.05
        },
        {
          "block": "minecraft:yellow_wool",
          "chance": 0.03
        }
      ],
      "cage": "minecraft:pink_stained_glass",
      "accent": "minecraft:red_wool",
      "trim": "minecraft:white_wool",
      "light": "minecraft:glowstone"
    },
    "terrain": {
      "roughness": 0.1,
      "depth": 1.2,
      "size": 1
    },
    "decorations": [
      {
        "type": "striped_pillar",
        "blocks": [
          "minecraft:red_wool",
          "minecraft:white_wool"
        ],
        "height": [
          4,
          6
        ],
        "on": [
          "center"
        ],
        "count": [
          3,
          4
        ]
      },
      {
        "type": "striped_pillar",
        "blocks": [
          "minecraft:red_wool",
          "minecraft:white_wool"
        ],
        "height": [
          3,
          4
        ],
        "on": [
          "sector"
        ],
        "count": 1
      },
      {
        "type": "plants",
        "blocks": [
          "minecraft:cake"
        ],
        "density": 0.04,
        "on": [
          "spawn",
          "center",
          "sector"
        ]
      },
      {
        "type": "boulder",
        "block": "minecraft:pink_wool",
        "size": 1,
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
            "name": "minecraft:cookie",
            "weight": 3,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": {
                  "min": 6,
                  "max": 12
                }
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:golden_carrot",
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
            "name": "minecraft:cake",
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
  "data/skywars/loot_table/chests/mid.json": {
    "type": "minecraft:chest",
    "pools": [
      {
        "rolls": 1,
        "entries": [
          {
            "type": "minecraft:item",
            "name": "minecraft:pumpkin_pie",
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
            "name": "minecraft:golden_apple",
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
  }
};
