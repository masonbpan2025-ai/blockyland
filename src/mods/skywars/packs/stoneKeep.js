// SkyWars data pack "Stone Keep" (made for the citadel template). A stone-brick castle on a grass hill; shields and axes for a siege.
// Laid out as a data pack: path -> JSON (src/mods/skywars/packs.js reads it).
export default {
  "pack.mcmeta": {
    "pack": {
      "pack_format": 61,
      "description": "SkyWars: Stone Keep"
    }
  },
  "data/skywars/skywars/arena.json": {
    "id": "stone_keep",
    "templates": [
      "citadel"
    ],
    "name": "Stone Keep",
    "description": "A stone-brick castle on green islands, with lanterns on the towers. Shields and axes for the siege.",
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
          "chance": 0.03
        }
      ],
      "cage": "minecraft:glass",
      "accent": "minecraft:stone_bricks",
      "trim": "minecraft:chiseled_stone_bricks",
      "light": "minecraft:lantern"
    },
    "terrain": {
      "roughness": 0.15,
      "depth": 1.8,
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
        "type": "plants",
        "blocks": [
          "minecraft:short_grass",
          "minecraft:oxeye_daisy",
          "minecraft:dandelion"
        ],
        "density": 0.15,
        "on": [
          "spawn",
          "center"
        ]
      }
    ],
    "center": {
      "feature": "none",
      "enchanting_tables": 1,
      "anvils": 2
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
            "name": "minecraft:shield",
            "weight": 2,
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
            "name": "minecraft:iron_axe",
            "weight": 1,
            "functions": [
              {
                "function": "minecraft:set_count",
                "count": 1
              },
              {
                "function": "minecraft:set_enchantments",
                "enchantments": {
                  "minecraft:sharpness": 1
                }
              }
            ]
          },
          {
            "type": "minecraft:item",
            "name": "minecraft:crossbow",
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
