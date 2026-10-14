-- NOTE: order here doesn't matter.
--       * in the table, chests are sorted in alphabetical order
--       * in the table, items are sorted by chance, then by avg#, then alphabetically.
--       * If poolsJavaUpcoming is omitted, poolsJava is used. To omit a pool entirely, set it to {}.
--       * If the loot is the same on both editions, use the same loot table twice.

-- these values are used:
-- * in place of the keys, when the key is used as a parameter

return {
	["ancient-city"] = { -- ancient_city.json
		header = "[[Ancient City]]",
		structure = "Ancient City",
		container = "",
		structID = "ancient city",
		display = "ancient city chest",
		poolsJava = {
			{
				rolls = {5,10},
				items = {
					["enchanted-golden-apple"] = {1,2,1},
					["disc-otherside"] = {1,1,1},
					["compass"] = {1,1,2},
					["sculk-catalyst"] = {1,2,2},
					["damaged-level-enchanted-diamond-hoe"] = {1,1,2},
					["lead"] = {1,1,2},
					["diamond-horse-armor"] = {1,1,2},
					["leather"] = {1,5,2},
					["disc-13"] = {1,1,2},
					["disc-cat"] = {1,1,2},
					["level-enchanted-diamond-leggings-3"] = {1,1,2},
					["enchanted-book-rnd-swift-sneak"] = {1,1,3},
					["sculk"] = {4,10,3},
					["sculk-sensor"] = {1,3,3},
					["candle"] = {1,4,3},
					["amethyst-shard"] = {1,15,3},
					["bottle-o'-enchanting"] = {1,3,3},
					["glow-berries"] = {1,15,3},
					["level-enchanted-iron-leggings"] = {1,1,3},
					["echo-shard"] = {1,3,4},
					["disc-fragment-5"] = {1,3,4},
					["potion-of-regeneration"] = {1,3,5},
					["enchanted-book-rnd"] = {1,1,5},
					["book"] = {3,10,5},
					["bone"] = {1,15,5},
					["soul-torch"] = {1,15,5},
					["coal"] = {6,15,7},
				}
			},
			{
				rolls = {1,1},
				items = {
					["ward-armor-trim"] = {1,1,4},
					["silence-armor-trim"] = {1,1,1},
					["empty"] = {1,1,75}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {5,10},
				items = {
					["enchanted-golden-apple"] = {1,2,1},
					["disc-otherside"] = {1,1,1},
					["compass"] = {1,1,2},
					["sculk-catalyst"] = {1,2,2},
					["damaged-level-enchanted-diamond-hoe"] = {1,1,2},
					["lead"] = {1,1,2},
					["diamond-horse-armor"] = {1,1,2},
					["leather"] = {1,5,2},
					["disc-13"] = {1,1,2},
					["disc-cat"] = {1,1,2},
					["level-enchanted-diamond-leggings-3"] = {1,1,2},
					["enchanted-book-rnd-swift-sneak"] = {1,1,3},
					["sculk"] = {4,10,3},
					["sculk-sensor"] = {1,3,3},
					["candle"] = {1,4,3},
					["amethyst-shard"] = {1,15,3},
					["bottle-o'-enchanting"] = {1,3,3},
					["glow-berries"] = {1,15,3},
					["level-enchanted-iron-leggings"] = {1,1,3},
					["echo-shard"] = {1,3,4},
					["disc-fragment-5"] = {1,3,4},
					["potion-of-regeneration"] = {1,3,5},
					["enchanted-book-rnd"] = {1,1,5},
					["book"] = {3,10,5},
					["bone"] = {1,15,5},
					["soul-torch"] = {1,15,5},
					["coal"] = {6,15,7},
					}
				},
			{
				rolls = {1,1},
				items = {
					["ward-armor-trim"] = {1,1,4},
					["silence-armor-trim"] = {1,1,1},
					["empty"] = {1,1,75}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["ancient-city-ice-box"] = { -- ancient_city_ice_box.json
		header = "[[Ancient City]]",
		structure = "Ancient City",
		container = "Ice box chest",
		structID = "ancient city",
		display = "ancient city ice box chest",
		poolsJava = {
			{
				rolls = {4,10},
				items = {
					["suspicious-stew-2"] = {2,6,1},
					["golden-carrot"] = {1,10,1},
					["baked-potato"] = {1,10,1},
					["packed-ice"] = {2,6,2},
					["snowball"] = {2,6,4},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {4,10},
				items = {
					["suspicious-stew-2"] = {2,6,1},
					["golden-carrot"] = {1,10,1},
					["baked-potato"] = {1,10,1},
					["packed-ice"] = {2,6,2},
					["snowball"] = {2,6,4},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["shipwreck-map"] = { -- shipwreck_map.json in Java and shipwreck.json in Bedrock
		header = "Map",
		superheader = "[[Shipwreck]]",
		structure = "Shipwreck",
		container = "Map chest",
		structID = "shipwreck",
		display = "shipwreck map chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["buried-treasure-map"] = {1,1,1},
				}
			},
			{
				rolls = {3,3},
				items = {
					["compass"] = {1,1,1},
					["empty-map"] = {1,1,1},
					["clock"] = {1,1,1},
					["paper"] = {1,10,20},
					["feather"] = {1,5,10},
					["book"] = {1,5,5},
				}
			},
			{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["buried-treasure-map"] = {1,1,1},
				}
			},
			{
				rolls = {3,3},
				items = {
					["compass"] = {1,1,1},
					["map"] = {1,1,1},
					["clock"] = {1,1,1},
					["paper"] = {1,10,20},
					["feather"] = {1,5,10},
					["book"] = {1,5,5},
				}
			},
			{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["shipwreck-supply"] = { -- shipwreck_supply.json in Java and shipwrecksupply.json in Bedrock
		header = "Supply",
		superheader = "[[Shipwreck]]",
		structure = "Shipwreck",
		container = "Supply chest",
		structID = "shipwreck",
		display = "shipwreck supply chest",
		poolsJava = {
			{
				rolls = {3,10},
				items = {
					["paper"] = {1,12,8},
					["potato"] = {2,6,7},
					["moss-block"] = {1,4,7},
					["poisonous-potato"] = {2,6,7},
					["carrot"] = {4,8,7},
					["wheat"] = {8,21,7},
					["coal"] = {2,8,6},
					["rotten-flesh"] = {5,24,5},
					["bamboo"] = {1,3,2},
					["suspicious-stew"] = {1,1,10},
					["pumpkin"] = {1,3,2},
					["gunpowder"] = {1,5,3},
					["tnt"] = {1,2,1},
					["random-enchanted-leather-cap"] = {1,1,3},
					["random-enchanted-leather-tunic"] = {1,1,3},
					["random-enchanted-leather-pants"] = {1,1,3},
					["random-enchanted-leather-boots"] = {1,1,3},
				}
			},{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,10},
				items = {
					["paper"] = {1,12,8},
					["potato"] = {2,6,7},
					["poisonous-potato"] = {2,6,7},
					["moss-block"] = {1,4,7},
					["carrot"] = {4,8,7},
					["wheat"] = {8,21,7},
					["coal"] = {2,8,6},
					["rotten-flesh"] = {5,24,5},
					["bamboo"] = {1,3,2},
					["suspicious-stew"] = {1,1,10},
					["pumpkin"] = {1,3,2},
					["gunpowder"] = {1,5,3},
					["tnt"] = {1,2,1},
					["random-enchanted-leather-cap"] = {1,1,3},
					["random-enchanted-leather-tunic"] = {1,1,3},
					["random-enchanted-leather-pants"] = {1,1,3},
					["random-enchanted-leather-boots"] = {1,1,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			},
			{ 
				rolls = {1,1},
				items = {
					["copper-nautilus-armor"] = {1,1,100},
					["iron-nautilus-armor"] = {1,1,50},
					["golden-nautilus-armor"] = {1,1,25},
					["diamond-nautilus-armor"] = {1,1,10},
					["empty"] = {1,1,740} -- 0.2 random chance
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["shipwreck-treasure"] = { -- shipwreck_treasure.json in Java and shipwrecktreasure.json in Bedrock
		header = "Treasure",
		superheader = "[[Shipwreck]]",
		structure = "Shipwreck",
		container = "Treasure chest",
		structID = "shipwreck",
		display = "shipwreck treasure chest",
		poolsJava = {
			{
				rolls = {3,6},
				items = {
					["iron-ingot"] = {1,5,90},
					["gold-ingot"] = {1,5,10},
					["emerald"] = {1,5,40},
					["diamond"] = {1,1,5},
					["bottle-o'-enchanting"] = {1,1,5},
				}
			},
			{
				rolls = {2,5},
				items = {
					["iron-nugget"] = {1,10,50},
					["gold-nugget"] = {1,10,10},
					["lapis-lazuli"] = {1,10,20},
				}
			},{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,6},
				items = {
					["iron-ingot"] = {1,5,90},
					["gold-ingot"] = {1,5,10},
					["emerald"] = {1,5,40},
					["diamond"] = {1,1,5},
					["bottle-o'-enchanting"] = {1,1,5},
				}
			},
			{
				rolls = {2,5},
				items = {
					["iron-nugget"] = {1,10,50},
					["gold-nugget"] = {1,10,10},
					["lapis-lazuli"] = {1,10,20},
				}
			},
			{
				rolls = {1,1},
				items = {
					["coast-armor-trim"] = {2,2,1},
					["empty"] = {1,1,5}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["buried-treasure"] = { -- buried_treasure.json in Java and buriedtreasure.json in Bedrock
		header = "[[Buried Treasure]]",
		structure = "Buried Treasure",
		container = "",
		structID = "buried-treasure",
		display = "buried treasure chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["heart-of-the-sea"] = {1,1,1},
				}
			},
			{
				rolls = {5,8},
				items = {
					["iron-ingot"] = {1,4,20},
					["gold-ingot"] = {1,4,10},
					["tnt"] = {1,2,5},
				}
			},
			{
				rolls = {1,3},
				items = {
					["emerald"] = {4,8,5},
					["diamond"] = {1,2,5},
					["prismarine-crystals"] = {1,5,5},
				}
			},
			{
				rolls = {0,1},
				items = {
					["leather-tunic"] = {1,1,1},
					["iron-sword"] = {1,1,1},
					["iron-spear"] = {1,1,1},
				}
			},
			{
				rolls = {2,2},
				items = {
					["cooked-cod"] = {2,4,1},
					["cooked-salmon"] = {2,4,1},
				}
			},
			{
				rolls = {0,2},
				items = {
					["potion-of-water-breathing"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["heart-of-the-sea"] = {1,1,1},
				}
			},
			{
				rolls = {5,8},
				items = {
					["iron-ingot"] = {1,4,20},
					["gold-ingot"] = {1,4,10},
					["tnt"] = {1,5,5},
					}
				},
			{
				rolls = {1,3},
				items = {
					["emerald"] = {4,8,5},
					["diamond"] = {1,2,5},
					["prismarine-crystals"] = {1,5,5},
					}
				},
			{
				rolls = {0,1},
				items = {
					["leather-tunic"] = {1,1,1},
					["iron-sword"] = {1,1,1},
					["iron-spear"] = {1,1,1},
				}
			},
			{
				rolls = {2,2},
				items = {
					["cooked-cod"] = {2,4,1},
					["cooked-salmon"] = {2,4,1},
				}
			},
			{
				rolls = {0,2},
				items = {
					["potion-of-water-breathing"] = {1,1,15},
				}
			},
			{ 
				rolls = {1,1},
				items = {
					["copper-nautilus-armor"] = {1,1,100},
					["iron-nautilus-armor"] = {1,1,50},
					["golden-nautilus-armor"] = {1,1,25},
					["diamond-nautilus-armor"] = {1,1,10},
					["empty"] = {1,1,740} -- 0.2 random chance
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["underwater-ruin-big"] = { -- underwater_ruin_big.json
		header = "Big",
		superheader = "[[Ocean Ruins]]",
		structure = "Ocean Ruins",
		container = "Big ruins chest",
		structID = "underwater-ruins",
		display = "big underwater ruins chest",
		poolsJava = {
			{
				rolls = {2,8},
				items = {
					["coal"] = {1,4,10},
					["gold-nugget"] = {1,3,10},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10},
					["stone-spear"] = {1,1,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,1},
					["enchanted-book-rnd"] = {1,1,5},
					["leather-tunic"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["enchanted-fishing-rod"] = {1,1,5},
					["buried-treasure-map"] = {1,1,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,8},
				items = {
					["coal"] = {1,4,10},
					["stone-spear"] = {1,1,2},
					["gold-nugget"] = {1,3,10},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,1},
					["enchanted-book-rnd"] = {1,1,5},
					["leather-tunic"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["enchanted-fishing-rod"] = {1,1,5},
					["buried-treasure-map"] = {1,1,10},
				}
			},
			{ 
				rolls = {1,1},
				items = {
					["copper-nautilus-armor"] = {1,1,100},
					["iron-nautilus-armor"] = {1,1,50},
					["golden-nautilus-armor"] = {1,1,25},
					["diamond-nautilus-armor"] = {1,1,10},
					["empty"] = {1,1,925} -- 0.2 random chance
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["underwater-ruin-small"] = { -- underwater_ruin_small.json
		header = "Small",
		superheader = "[[Ocean Ruins]]",
		structure = "Ocean Ruins",
		container = "Small ruins chest",
		structID = "underwater-ruins",
		display = "small underwater ruins chest",
		poolsJava = {
			{
				rolls = {2,8},
				items = {
					["coal"] = {1,4,10},
					["stone-axe"] = {1,1,2},
					["rotten-flesh"] = {1,1,5},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10},
					["stone-spear"] = {1,1,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["leather-tunic"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["enchanted-fishing-rod"] = {1,1,5},
					["buried-treasure-map"] = {1,1,5},
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,148},
					["copper-nautilus-armor"] = {1,1,20},
					["iron-nautilus-armor"] = {1,1,10},
					["golden-nautilus-armor"] = {1,1,5},
					["diamond-nautilus-armor"] = {1,1,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,8},
				items = {
					["coal"] = {1,4,10},
					["stone-axe"] = {1,1,2},
					["stone-spear"] = {1,1,2},
					["rotten-flesh"] = {1,1,5},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["leather-tunic"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["enchanted-fishing-rod"] = {1,1,5},
					["buried-treasure-map"] = {1,1,5},
				}
			},
			{ 
				rolls = {1,1},
				items = {
					["copper-nautilus-armor"] = {1,1,100},
					["iron-nautilus-armor"] = {1,1,50},
					["golden-nautilus-armor"] = {1,1,25},
					["diamond-nautilus-armor"] = {1,1,10},
					["empty"] = {1,1,925} -- 0.2 random chance
				}
			},
		},
		poolsBedrockUpcoming = {},
	},

	["village-armorer"] = { -- village\village_armorer.json
		header = "Armorer",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Armorer's chest",
		structID = "village",
		display = "village armorer's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["iron-ingot"] = {1,3,2},
					["bread"] = {1,4,4},
					["iron-helmet"] = {1,1,1},
					["emerald"] = {1,1,1}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["iron-ingot"] = {1,3,2},
					["bread"] = {1,4,4},
					["iron-helmet"] = {1,1,1},
					["emerald"] = {1,1,1}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-butcher"] = { -- village\village_butcher.json
		header = "Butcher",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Butcher's chest",
		structID = "village",
		display = "village butcher's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["emerald"] = {1,1,1},
					["raw-porkchop"] = {1,3,6},
					["wheat"] = {1,3,6},
					["raw-beef"] = {1,3,6},
					["raw-mutton"] = {1,3,6},
					["coal"] = {1,3,3}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["emerald"] = {1,1,1},
					["raw-porkchop"] = {1,3,6},
					["wheat"] = {1,3,6},
					["raw-beef"] = {1,3,6},
					["raw-mutton"] = {1,3,6},
					["coal"] = {1,3,3}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-cartographer"] = { -- village\village_cartographer.json
		header = "Cartographer",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Cartographer's chest",
		structID = "village",
		display = "village cartographer's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["empty-map"] = {1,3,10},
					["paper"] = {1,5,15},
					["compass"] = {1,1,5},
					["bread"] = {1,4,15},
					["stick"] = {1,2,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["map"] = {1,3,10},
					["paper"] = {1,5,15},
					["compass"] = {1,1,5},
					["bread"] = {1,4,15},
					["oak-sapling"] = {1,2,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-fisherman"] = { -- village\village_fisher.json, Java-exclusive as of Java 1.14 / Bedrock 1.12
		header = "Fisherman",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Fisherman's chest",
		structID = "village",
		display = "village fisherman's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["emerald"] = {1,1,1},
					["raw-cod"] = {1,3,2},
					["raw-salmon"] = {1,3,1},
					["water-bucket"] = {1,3,1},
					["barrel"] = {1,3,1},
					["wheat-seeds"] = {1,3,3},
					["coal"] = {1,3,2}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["village-fletcher"] = { -- village\village_fletcher.json
		header = "Fletcher",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Fletcher's chest",
		structID = "village",
		display = "village fletcher's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["emerald"] = {1,1,1},
					["arrow"] = {1,3,2},
					["feather"] = {1,3,6},
					["egg"] = {1,3,2},
					["flint"] = {1,3,6},
					["stick"] = {1,3,6}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["emerald"] = {1,1,1},
					["arrow"] = {1,3,2},
					["feather"] = {1,3,6},
					["egg"] = {1,3,2},
					["flint"] = {1,3,6},
					["stick"] = {1,3,6}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-mason"] = { -- village\village_mason.json
		header = "Mason",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Mason's chest",
		structID = "village",
		display = "village mason's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["clay-ball"] = {1,3,1},
					["flower-pot"] = {1,1,1},
					["stone"] = {1,1,2},
					["stone-bricks"] = {1,1,2},
					["bread"] = {1,4,4},
					["yellow-dye"] = {1,1,1},
					["smooth-stone"] = {1,1,1},
					["emerald"] = {1,1,1}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["clay-ball"] = {1,3,1},
					["flower-pot"] = {1,1,1},
					["stone"] = {1,1,2},
					["stone-bricks"] = {1,1,2},
					["bread"] = {1,4,4},
					["yellow-dye"] = {1,1,1},
					["smooth-stone"] = {1,1,1},
					["emerald"] = {1,1,1}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-shepherd"] = { -- village\village_shepherd.json
		header = "Shepherd",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Shepherd's chest",
		structID = "village",
		display = "village shepherd's chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["white-wool"] = {1,8,6},
					["black-wool"] = {1,3,3},
					["gray-wool"] = {1,3,2},
					["brown-wool"] = {1,3,2},
					["light-gray-wool"] = {1,3,2},
					["emerald"] = {1,1,1},
					["shears"] = {1,1,1},
					["wheat"] = {1,6,6}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["white-wool"] = {1,8,6},
					["black-wool"] = {1,3,3},
					["gray-wool"] = {1,3,2},
					["brown-wool"] = {1,3,2},
					["light-gray-wool"] = {1,3,2},
					["emerald"] = {1,1,1},
					["shears"] = {1,1,1},
					["wheat"] = {1,6,6}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-tannery"] = { -- village\village_tannery.json
		header = "Tannery",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Tannery chest",
		structID = "village",
		display = "village tannery chest",
		poolsJava = {
			{
				rolls = {1,5},
				items = {
					["leather"] = {1,3,1},
					["leather-tunic"] = {1,1,2},
					["leather-boots"] = {1,1,2},
					["leather-cap"] = {1,1,2},
					["bread"] = {1,4,5},
					["leather-pants"] = {1,1,2},
					["saddle"] = {1,1,1},
					["emerald"] = {1,4,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,5},
				items = {
					["leather"] = {1,3,1},
					["leather-tunic"] = {1,1,2},
					["leather-boots"] = {1,1,2},
					["leather-cap"] = {1,1,2},
					["bread"] = {1,4,5},
					["leather-pants"] = {1,1,2},
					["saddle"] = {1,1,1},
					["emerald"] = {1,4,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-temple"] = { -- village\village_temple.json
		header = "Temple",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Temple chest",
		structID = "village",
		display = "village temple chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["redstone"] = {1,4,2},
					["bread"] = {1,4,7},
					["rotten-flesh"] = {1,4,7},
					["lapis-lazuli"] = {1,4,1},
					["gold-ingot"] = {1,4,1},
					["emerald"] = {1,4,1}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["redstone"] = {1,4,2},
					["bread"] = {1,4,7},
					["rotten-flesh"] = {1,4,7},
					["lapis-lazuli"] = {1,4,1},
					["gold-ingot"] = {1,4,1},
					["emerald"] = {1,4,1}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-toolsmith"] = { -- village\village_toolsmith.json
		header = "Toolsmith",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Toolsmith's chest",
		structID = "village",
		display = "village toolsmith's chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["diamond"] = {1,3,1},
					["iron-ingot"] = {1,5,5},
					["gold-ingot"] = {1,3,1},
					["bread"] = {1,3,15},
					["iron-pickaxe"] = {1,1,5},
					["coal"] = {1,3,1},
					["stick"] = {1,3,20},
					["iron-shovel"] = {1,1,5}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["diamond"] = {1,3,1},
					["iron-ingot"] = {1,5,5},
					["gold-ingot"] = {1,3,1},
					["bread"] = {1,3,15},
					["iron-pickaxe"] = {1,1,5},
					["coal"] = {1,3,1},
					["stick"] = {1,3,20},
					["iron-shovel"] = {1,1,5}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["village-weaponsmith"] = { -- village\village_weaponsmith.json
		header = "Weaponsmith",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Weaponsmith's chest",
		structID = "village",
		display = "village weaponsmith's chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["diamond"] = {1,3,3},
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["bread"] = {1,3,15},
					["apple"] = {1,3,15},
					["iron-pickaxe"] = {1,1,5},
					["iron-sword"] = {1,1,5},
					["iron-chestplate"] = {1,1,5},
					["iron-helmet"] = {1,1,5},
					["iron-leggings"] = {1,1,5},
					["iron-boots"] = {1,1,5},
					["obsidian"] = {3,7,5},
					["oak-sapling"] = {3,7,5},
					["saddle"] = {1,1,3},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["iron-spear"] = {1,1,5},
					["copper-spear"] = {1,1,7},
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["diamond"] = {1,3,3},
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["bread"] = {1,3,15},
					["apple"] = {1,3,15},
					["iron-pickaxe"] = {1,1,5},
					["iron-sword"] = {1,1,5},
					["iron-chestplate"] = {1,1,5},
					["iron-helmet"] = {1,1,5},
					["iron-leggings"] = {1,1,5},
					["iron-boots"] = {1,1,5},
					["obsidian"] = {3,7,5},
					["oak-sapling"] = {3,7,5},
					["saddle"] = {1,1,3},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["iron-spear"] = {1,1,5},
					["copper-spear"] = {1,1,7},
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},

	["village-desert-house"] = { -- village\village_desert_house.json
		header = "Desert House",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Desert house chest",
		structID = "village",
		display = "village desert house chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["clay-ball"] = {1,1,1},
					["green-dye"] = {1,1,1},
					["cactus"] = {1,4,10},
					["wheat"] = {1,7,10},
					["bread"] = {1,4,10},
					["book"] = {1,1,1},
					["dead-bush"] = {1,3,2},
					["emerald"] = {1,3,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["clay-ball"] = {1,1,1},
					["green-dye"] = {1,1,1},
					["cactus"] = {1,4,10},
					["wheat"] = {1,7,10},
					["bread"] = {1,4,10},
					["book"] = {1,1,1},
					["dead-bush"] = {1,3,2},
					["emerald"] = {1,3,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-plains-house"] = { -- village\village_plains_house.json
		header = "Plains house",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Plains house chest",
		structID = "village",
		display = "village plains house chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["gold-nugget"] = {1,3,1},
					["dandelion"] = {1,1,2},
					["poppy"] = {1,1,1},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["apple"] = {1,5,10},
					["book"] = {1,1,1},
					["feather"] = {1,1,1},
					["emerald"] = {1,4,2},
					["oak-sapling"] = {1,2,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["gold-nugget"] = {1,3,1},
					["dandelion"] = {1,1,2},
					["poppy"] = {1,1,1},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["apple"] = {1,5,10},
					["book"] = {1,1,1},
					["feather"] = {1,1,1},
					["emerald"] = {1,4,2},
					["oak-sapling"] = {1,2,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-savanna-house"] = { -- village\village_savanna_house.json
		header = "Savanna house",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Savanna house chest",
		structID = "village",
		display = "village savanna house chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["gold-nugget"] = {1,3,1},
					["short-grass"] = {1,1,5},
					["tall-grass"] = {1,1,5},
					["bread"] = {1,4,10},
					["wheat-seeds"] = {1,5,10},
					["emerald"] = {1,4,2},
					["acacia-sapling"] = {1,2,10},
					["saddle"] = {1,1,1},
					["torch"] = {1,2,1},
					["bucket"] = {1,1,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["gold-nugget"] = {1,3,1},
					["short-grass"] = {1,1,5},
					["tall-grass"] = {1,1,5},
					["bread"] = {1,4,10},
					["wheat-seeds"] = {1,5,10},
					["emerald"] = {1,4,2},
					["acacia-sapling"] = {1,2,10},
					["saddle"] = {1,1,1},
					["torch"] = {1,2,1},
					["bucket"] = {1,1,1}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-snowy-house"] = { -- village\village_snowy_house.json
		header = "Snowy house",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Snowy house chest",
		structID = "village",
		display = "village snowy house chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["blue-ice"] = {1,1,1},
					["snow-block"] = {1,1,4},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["beetroot-seeds"] = {1,5,10},
					["beetroot-soup"] = {1,1,1},
					["furnace"] = {1,1,1},
					["emerald"] = {1,4,1},
					["snowball"] = {1,7,10},
					["coal"] = {1,4,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["blue-ice"] = {1,1,1},
					["snow-block"] = {1,1,4},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["beetroot-seeds"] = {1,5,10},
					["beetroot-soup"] = {1,1,1},
					["furnace"] = {1,1,1},
					["emerald"] = {1,4,1},
					["snowball"] = {1,7,10},
					["coal"] = {1,4,5}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},
	["village-taiga-house"] = { -- village\village_taiga_house.json
		header = "Taiga house",
		superheader = "[[Village]]",
		structure = "Village",
		container = "Taiga house chest",
		structID = "village",
		display = "village taiga house chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["iron-nugget"] = {1,5,1},
					["fern"] = {1,1,2},
					["large-fern"] = {1,1,2},
					["potato"] = {1,7,10},
					["sweet-berries"] = {1,7,5},
					["bread"] = {1,4,10},
					["pumpkin-seeds"] = {1,5,5},
					["pumpkin-pie"] = {1,1,1},
					["emerald"] = {1,4,2},
					["spruce-sapling"] = {1,5,5},
					["spruce-sign"] = {1,1,1},
					["spruce-log"] = {1,5,10}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,8},
				items = {
					["iron-nugget"] = {1,5,1},
					["fern"] = {1,1,2},
					["large-fern"] = {1,1,2},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["pumpkin-seeds"] = {1,5,5},
					["pumpkin-pie"] = {1,1,1},
					["emerald"] = {1,4,2},
					["spruce-sapling"] = {1,5,5},
					["oak-sign"] = {1,1,1},
					["spruce-log"] = {1,5,10}
				}
            },
            {
                rolls = { 1, 1 },
                    items = {
                        ["bundle"] = { 1, 1, 1 },
						["empty"] = { 1, 1, 2 },
                    }
            }
        },
        poolsBedrockUpcoming = {}
	},

	["stronghold-altar"] = { -- stronghold_corridor.json
		header = "Altar",
		superheader = "[[Stronghold]]",
		structure = "Stronghold",
		container = "Altar chest",
		structID = "stronghold",
		display = "stronghold altar chest",
		poolsJava = {
			{
				rolls = {2,3},
				items = {
					["ender-pearl"] = {1,1,10},
					["diamond"] = {1,3,3},
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["bread"] = {1,3,15},
					["apple"] = {1,3,15},
					["iron-pickaxe"] = {1,1,5},
					["iron-sword"] = {1,1,5},
					["iron-chestplate"] = {1,1,5},
					["iron-helmet"] = {1,1,5},
					["iron-leggings"] = {1,1,5},
					["iron-boots"] = {1,1,5},
					["golden-apple"] = {1,1,1},
					["leather"] = {1,5,1},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["disc-otherside"] = {1,1,1},
					["enchanted-book"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["eye-armor-trim"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,3},
				items = {
					["ender-pearl"] = {1,1,50},
					["emerald"] = {1,3,15},
					["diamond"] = {1,3,15},
					["iron-ingot"] = {1,5,50},
					["gold-ingot"] = {1,3,25},
					["redstone"] = {4,9,25},
					["bread"] = {1,3,75},
					["apple"] = {1,3,75},
					["iron-pickaxe"] = {1,1,25},
					["iron-sword"] = {1,1,25},
					["iron-chestplate"] = {1,1,25},
					["iron-helmet"] = {1,1,25},
					["iron-leggings"] = {1,1,25},
					["iron-boots"] = {1,1,25},
					["golden-apple"] = {1,1,5},
					["leather"] = {1,5,5},
					["iron-horse-armor"] = {1,1,5},
					["copper-horse-armor"] = {1,1,5},
					["golden-horse-armor"] = {1,1,5},
					["diamond-horse-armor"] = {1,1,5},
					["disc-otherside"] = {1,1,5},
					["enchanted-book"] = {1,1,6},
				}
			},
			{
				rolls = {1,1},
				items = {
					["eye-armor-trim"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["stronghold-library"] = { -- stronghold_library.json
		header = "Library",
		superheader = "[[Stronghold]]",
		structure = "Stronghold",
		container = "Library chest",
		structID = "stronghold",
		display = "stronghold library chest",
		poolsJava = {
			{
				rolls = {2,10},
				items = {
					["book"] = {1,3,20},
					["paper"] = {2,7,20},
					["empty-map"] = {1,1,1},
					["compass"] = {1,1,1},
					["enchanted-book"] = {1,1,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["eye-armor-trim"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,10},
				items = {
					["book"] = {1,3,100},
					["paper"] = {2,7,100},
					["map"] = {1,1,5},
					["compass"] = {1,1,5},
					["enchanted-book"] = {1,1,60},
				}
			},
			{
				rolls = {1,1},
				items = {
					["eye-armor-trim"] = {1,1,1}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["stronghold-storeroom"] = { -- stronghold_crossing.json
		header = "Storeroom",
		superheader = "[[Stronghold]]",
		structure = "Stronghold",
		container = "Storeroom chest",
		structID = "stronghold",
		display = "stronghold storeroom chest",
		poolsJava = {
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["coal"] = {3,8,10},
					["bread"] = {1,3,15},
					["apple"] = {1,3,15},
					["iron-pickaxe"] = {1,1,1},
					["enchanted-book"] = {1,1,1},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,5,50},
					["gold-ingot"] = {1,3,25},
					["redstone"] = {4,9,25},
					["coal"] = {3,8,50},
					["bread"] = {1,3,75},
					["apple"] = {1,3,75},
					["iron-pickaxe"] = {1,1,5},
					["enchanted-book"] = {1,1,6},
					["ink-sac"] = {1,3,75},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["bonus"] = { -- spawn_bonus_chest.json
		header = "[[Bonus Chest]]",
		structure = "Bonus Chest",
		container = "",
		structID = "day",
		display = "bonus chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["stone-axe"] = {1,1,1},
					["wooden-axe"] = {1,1,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["stone-pickaxe"] = {1,1,1},
					["wooden-pickaxe"] = {1,1,3}
				}
			},
			{
				rolls = {3,3},
				items = {
					["apple"] = {1,2,5},
					["bread"] = {1,2,3},
					["raw-salmon"] = {1,2,3},
				}
			},
			{
				rolls = {4,4},
				items = {
					["stick"] = {1,12,10},
					["oak-planks"] = {1,12,10},
					["oak-log"] = {1,3,3},
					["spruce-log"] = {1,3,3},
					["birch-log"] = {1,3,3},
					["jungle-log"] = {1,3,3},
					["acacia-log"] = {1,3,3},
					["dark-oak-log"] = {1,3,3},
					["mangrove-log"] = {1,3,3},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["stone-axe"] = {1,1,1},
					["wooden-axe"] = {1,1,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["stone-pickaxe"] = {1,1,1},
					["wooden-pickaxe"] = {1,1,3}
				}
			},
			{
				rolls = {1,1},
				items = {
					["apple"] = {1,2,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["bread"] = {1,2,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["raw-salmon"] = {1,2,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["stick"] = {1,12,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["oak-planks"] = {1,12,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["dark-oak-log"] = {1,3,1},
					["acacia-log"] = {1,3,1},
					["mangrove-log"] = {1,3,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["oak-log"] = {1,3,1},
					["spruce-log"] = {1,3,1},
					["birch-log"] = {1,3,1},
					["jungle-log"] = {1,3,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["potato"] = {1,2,3},
					["carrot"] = {1,2,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["oak-sapling"] = {4,4,2},
					["spruce-sapling"] = {4,4,2},
					["birch-sapling"] = {4,4,2},
					["jungle-sapling"] = {4,4,4},
					["dark-oak-sapling"] = {4,4,2},
					["acacia-sapling"] = {4,4,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["melon-seeds"] = {1,2,3},
					["pumpkin-seeds"] = {1,2,3},
					["beetroot-seeds"] = {1,2,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["cactus"] = {1,2,3},
					["cocoa-beans"] = {1,2,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["brown-mushroom"] = {1,2,2},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["monster room"] = { -- simple_dungeon.json
		header = "[[Monster Room]]",
		structure = "Monster Room",
		container = "",
		structID = "Monster Room",
		display = "monster room chest",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["leather"] = {1,5,20},
					["golden-apple"] = {1,1,15},
					["enchanted-golden-apple"] = {1,1,2},
					["disc-otherside"] = {1,1,2},
					["disc-13"] = {1,1,15},
					["disc-cat"] = {1,1,15},
					["name-tag"] = {1,1,20},
					["golden-horse-armor"] = {1,1,10},
					["iron-horse-armor"] = {1,1,15},
					["copper-horse-armor"] = {1,1,15},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,10},
				}
			},
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,4,10},
					["gold-ingot"] = {1,4,5},
					["bread"] = {1,1,20},
					["wheat"] = {1,4,20},
					["bucket"] = {1,1,10},
					["redstone"] = {1,4,15},
					["coal"] = {1,4,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["bone"] = {1,8,10},
					["gunpowder"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,3},
				items = {
					["leather"] = {1,5,20},
					["golden-apple"] = {1,1,15},
					["enchanted-golden-apple"] = {1,1,2},
					["disc-13"] = {1,1,15},
					["disc-cat"] = {1,1,15},
					["disc-otherside"] = {1,1,2},
					["name-tag"] = {1,1,20},
					["golden-horse-armor"] = {1,1,10},
					["iron-horse-armor"] = {1,1,15},
					["copper-horse-armor"] = {1,1,15},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,10},
				}
			},
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,4,10},
					["gold-ingot"] = {1,4,5},
					["bread"] = {1,1,20},
					["wheat"] = {1,4,20},
					["bucket"] = {1,1,10},
					["redstone"] = {1,4,15},
					["coal"] = {1,4,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["bone"] = {1,8,10},
					["gunpowder"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["mineshaft"] = { -- abandoned_mineshaft.json - sulfur cave specific music disc is defined in a separate list below
		header = "[[Mineshaft]]",
		structure = "Mineshaft",
		container = "Chest not located in a sulfur cave",
		structID = "abandoned-mineshaft",
		display = "mineshaft chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,1},
					["name-tag"] = {1,1,30},
					["enchanted-book-rnd"] = {1,1,10},
					["iron-pickaxe"] = {1,1,5},
					["empty"] = {1,1,5},
				}
			},
			{
				rolls = {2,4},
				items = {
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["lapis-lazuli"] = {4,9,5},
					["diamond"] = {1,2,3},
					["coal"] = {3,8,10},
					["bread"] = {1,3,15},
					["glow-berries"] = {3,6,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["rail"] = {4,8,20},
					["powered-rail"] = {1,4,5},
					["detector-rail"] = {1,4,5},
					["activator-rail"] = {1,4,5},
					["torch"] = {1,16,15},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,1},
					["name-tag"] = {1,1,30},
					["enchanted-book-rnd"] = {1,1,10},
					["iron-pickaxe"] = {1,1,5},
					["empty"] = {1,1,5},
				}
			},
			{
				rolls = {2,4},
				items = {
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["lapis-lazuli"] = {4,9,5},
					["diamond"] = {1,2,3},
					["coal"] = {3,8,10},
					["bread"] = {1,3,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
					["glow-berries"] = {3,6,15},
				}
			},
			{
				rolls = {3,3},
				items = {
					["rail"] = {4,8,20},
					["powered-rail"] = {1,4,5},
					["detector-rail"] = {1,4,5},
					["activator-rail"] = {1,4,5},
					["torch"] = {1,16,15},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},

	["sulfur-cave-mineshaft"] = { -- abandoned_mineshaft.json - specific list for sulfur cave chests as they additionally generate the bounce disc
		header = "Sulfur Cave [[Mineshaft]]",
		structure = "Mineshaft",
		container = "Chest located in a [[sulfur cave]]",
		structID = "mineshaft",
		display = "mineshaft chest located in a [[sulfur cave]]",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,1},
					["name-tag"] = {1,1,30},
					["enchanted-book-rnd"] = {1,1,10},
					["iron-pickaxe"] = {1,1,5},
					["empty"] = {1,1,5},
				}
			},
			{
				rolls = {2,4},
				items = {
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["lapis-lazuli"] = {4,9,5},
					["diamond"] = {1,2,3},
					["coal"] = {3,8,10},
					["bread"] = {1,3,15},
					["glow-berries"] = {3,6,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["rail"] = {4,8,20},
					["powered-rail"] = {1,4,5},
					["detector-rail"] = {1,4,5},
					["activator-rail"] = {1,4,5},
					["torch"] = {1,16,15},
					["disc-bounce"] = {1, 1, 10},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,1},
					["name-tag"] = {1,1,30},
					["enchanted-book-rnd"] = {1,1,10},
					["iron-pickaxe"] = {1,1,5},
					["empty"] = {1,1,5},
				}
			},
			{
				rolls = {2,4},
				items = {
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {1,3,5},
					["redstone"] = {4,9,5},
					["lapis-lazuli"] = {4,9,5},
					["diamond"] = {1,2,3},
					["coal"] = {3,8,10},
					["bread"] = {1,3,15},
					["glow-berries"] = {3,6,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["rail"] = {4,8,20},
					["powered-rail"] = {1,4,5},
					["detector-rail"] = {1,4,5},
					["activator-rail"] = {1,4,5},
					["torch"] = {1,16,15},
					["disc-bounce"] = {1, 1, 10},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["nether-fortress"] = { -- nether_bridge.json
		header = "[[Nether Fortress]]",
		structure = "Nether Fortress",
		container = "",
		structID = "nether-fortress",
		display = "nether fortress chest",
		poolsJava = {
			{
				rolls = {2,4},
				items = {
					["diamond"] = {1,3,5},
					["iron-ingot"] = {1,5,5},
					["gold-ingot"] = {1,3,15},
					["golden-sword"] = {1,1,5},
					["golden-chestplate"] = {1,1,5},
					["flint-and-steel"] = {1,1,5},
					["nether-wart"] = {3,7,5},
					["saddle"] = {1,1,10},
					["golden-horse-armor"] = {1,1,8},
					["iron-horse-armor"] = {1,1,5},
					["copper-horse-armor"] = {1,1,5},
					["diamond-horse-armor"] = {1,1,3},
					["obsidian"] = {2,4,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["rib-armor-trim"] = {1,1,1},
					["empty"] = {1,1,14}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,4},
				items = {
					["diamond"] = {1,3,5},
					["iron-ingot"] = {1,5,5},
					["gold-ingot"] = {1,3,15},
					["golden-sword"] = {1,1,5},
					["golden-chestplate"] = {1,1,5},
					["flint-and-steel"] = {1,1,5},
					["nether-wart"] = {3,7,5},
					["saddle"] = {1,1,10},
					["golden-horse-armor"] = {1,1,8},
					["copper-horse-armor"] = {1,1,5},
					["iron-horse-armor"] = {1,1,5},
					["diamond-horse-armor"] = {1,1,3},
					["obsidian"] = {2,4,2},
				}
			},
			{
				rolls = {1,1},
				items = {
					["rib-armor-trim"] = {1,1,1},
					["empty"] = {1,1,14}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["desert-temple"] = { -- desert_pyramid.json
		header = "[[Desert Pyramid]]",
		structure = "Desert Pyramid",
		container = "",
		structID = "desert-temple",
		display = "desert pyramid chest",
		poolsJava = {
			{
				rolls = {2,4},
				items = {
					["diamond"] = {1,3,5},
					["iron-ingot"] = {1,5,15},
					["gold-ingot"] = {2,7,15},
					["emerald"] = {1,3,15},
					["bone"] = {4,6,25},
					["spider-eye"] = {1,3,25},
					["rotten-flesh"] = {3,7,25},
					["leather"] = {1,5,20},
					["iron-horse-armor"] = {1,1,15},
					["copper-horse-armor"] = {1,1,15},
					["golden-horse-armor"] = {1,1,10},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,20},
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,2},
					["empty"] = {1,1,15},
				}
			},
			{
				rolls = {4,4},
				items = {
					["bone"] = {1,8,10},
					["gunpowder"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
					["sand"] = {1,8,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["dune-armor-trim"] = {2,2,1},
					["empty"] = {1,1,6},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,4},
				items = {
					["diamond"] = {1,3,5},
					["iron-ingot"] = {1,5,15},
					["gold-ingot"] = {2,7,15},
					["emerald"] = {1,3,15},
					["bone"] = {4,6,25},
					["spider-eye"] = {1,3,25},
					["rotten-flesh"] = {3,7,25},
					["leather"] = {1,5,20},
					["iron-horse-armor"] = {1,1,15},
					["copper-horse-armor"] = {1,1,15},
					["golden-horse-armor"] = {1,1,10},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,20},
					["golden-apple"] = {1,1,20},
					["enchanted-golden-apple"] = {1,1,2},
					["empty"] = {1,1,15},
				}
			},
			{
				rolls = {4,4},
				items = {
					["bone"] = {1,8,10},
					["gunpowder"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
					["sand"] = {1,8,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["dune-armor-trim"] = {2,2,1},
					["empty"] = {1,1,6}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["jungle-temple"] = { -- jungle_temple.json
		header = "[[Jungle Pyramid]]",
		structure = "Jungle Pyramid",
		container = "Chest",
		structID = "jungle-temple",
		display = "jungle pyramid chest",
		poolsJava = {
			{
				rolls = {2,6},
				items = {
					["diamond"] = {1,3,3},
					["iron-ingot"] = {1,5,10},
					["gold-ingot"] = {2,7,15},
					["emerald"] = {1,3,2},
					["bone"] = {4,6,20},
					["bamboo"] = {1,3,15},
					["rotten-flesh"] = {3,7,16},
					["leather"] = {1,5,3},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["enchanted-book"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["wild-armor-trim"] = {2,2,1},
					["empty"] = {1,1,2},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,6},
				items = {
					["diamond"] = {1,3,15},
					["iron-ingot"] = {1,5,50},
					["gold-ingot"] = {2,7,75},
					["emerald"] = {1,3,10},
					["bone"] = {4,6,100},
					["rotten-flesh"] = {3,7,80},
					["bamboo"] = {1,3,75},
					["leather"] = {1,5,15},
					["iron-horse-armor"] = {1,1,5},
					["copper-horse-armor"] = {1,1,5},
					["golden-horse-armor"] = {1,1,5},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book"] = {1,1,6}
				}
			},
			{
				rolls = {1,1},
				items = {
					["wild-armor-trim"] = {2,2,1},
					["empty"] = {1,1,2}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["jungle-temple-dispenser"] = { -- jungle_temple_dispenser.json in Java and dispenser_trap.json in Bedrock
		chest_type = "dispenser",
		structure = "Jungle Pyramid",
		container = "Dispenser",
		structID = "jungle-temple",
		display = "jungle pyramid dispenser",
		poolsJava = {
			{
				rolls = {1,2},
				items = {
					["arrow"] = {2,7,30}
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,2},
				items = {
					["arrow"] = {2,7,30}
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["end-city"] = { -- end_city_treasure.json
		header = "[[End City]]",
		structure = "End City",
		container = "",
		structID = "end-city",
		display = "end city chest",
		poolsJava = {
			{
				rolls = {2,6},
				items = {
					["diamond"] = {2,7,5},
					["iron-ingot"] = {4,8,10},
					["gold-ingot"] = {2,7,15},
					["emerald"] = {2,6,2},
					["beetroot-seeds"] = {1,10,5},
					["saddle"] = {1,1,3},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["level-enchanted-diamond-sword"] = {1,1,3},
					["level-enchanted-diamond-boots"] = {1,1,3},
					["level-enchanted-diamond-chestplate"] = {1,1,3},
					["level-enchanted-diamond-leggings"] = {1,1,3},
					["level-enchanted-diamond-helmet"] = {1,1,3},
					["level-enchanted-diamond-pickaxe"] = {1,1,3},
					["level-enchanted-diamond-shovel"] = {1,1,3},
					["level-enchanted-iron-sword"] = {1,1,3},
					["level-enchanted-iron-boots"] = {1,1,3},
					["level-enchanted-iron-chestplate"] = {1,1,3},
					["level-enchanted-iron-leggings"] = {1,1,3},
					["level-enchanted-iron-helmet"] = {1,1,3},
					["level-enchanted-iron-pickaxe"] = {1,1,3},
					["level-enchanted-iron-shovel"] = {1,1,3},
					["level-enchanted-diamond-spear"] = {1,1,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["spire-armor-trim"] = {1,1,1},
					["empty"] = {1,1,14}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,6},
				items = {
					["diamond"] = {2,7,5},
					["iron-ingot"] = {4,8,10},
					["gold-ingot"] = {2,7,15},
					["emerald"] = {2,6,2},
					["beetroot-seeds"] = {1,10,5},
					["saddle"] = {1,1,3},
					["iron-horse-armor"] = {1,1,1},
					["copper-horse-armor"] = {1,1,1},
					["golden-horse-armor"] = {1,1,1},
					["diamond-horse-armor"] = {1,1,1},
					["level-enchanted-diamond-sword"] = {1,1,3},
					["level-enchanted-diamond-boots"] = {1,1,3},
					["level-enchanted-diamond-chestplate"] = {1,1,3},
					["level-enchanted-diamond-leggings"] = {1,1,3},
					["level-enchanted-diamond-helmet"] = {1,1,3},
					["level-enchanted-diamond-pickaxe"] = {1,1,3},
					["level-enchanted-diamond-shovel"] = {1,1,3},
					["level-enchanted-diamond-spear"] = {1,1,3},
					["level-enchanted-iron-sword"] = {1,1,3},
					["level-enchanted-iron-boots"] = {1,1,3},
					["level-enchanted-iron-chestplate"] = {1,1,3},
					["level-enchanted-iron-leggings"] = {1,1,3},
					["level-enchanted-iron-helmet"] = {1,1,3},
					["level-enchanted-iron-pickaxe"] = {1,1,3},
					["level-enchanted-iron-shovel"] = {1,1,3},
				}
			},
			{
				rolls = {1,1},
				items = {
					["spire-armor-trim"] = {1,1,1},
					["empty"] = {1,1,14}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["igloo"] = { -- igloo_chest.json
		header = "[[Igloo]]",
		structure = "Igloo",
		container = "",
		structID = "igloo",
		display = "igloo chest",
		poolsJava = {
			{
				rolls = {2,8},
				items = {
					["apple"] = {1,3,15},
					["coal"] = {1,4,15},
					["gold-nugget"] = {1,3,10},
					["stone-axe"] = {1,1,2},
					["rotten-flesh"] = {1,1,10},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10}
				}
			},
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,1},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,8},
				items = {
					["apple"] = {1,3,15},
					["coal"] = {1,4,15},
					["gold-nugget"] = {1,3,10},
					["stone-axe"] = {1,1,2},
					["rotten-flesh"] = {1,1,10},
					["emerald"] = {1,1,1},
					["wheat"] = {2,3,10}
				}
			},
			{
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,1},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["pillager-outpost"] = { -- pillager_outpost.json
		header = "[[Pillager Outpost]]",
		structure = "Pillager Outpost",
		container = "",
		structID = "pillager-outpost",
		display = "pillager outpost chest",
		poolsJava = {
			{
				rolls = {0,1},
				items = {
					["crossbow"] = {1,1,1},
				}
			},
			{
				rolls = {2,3},
				items = {
					["wheat"] = {3,5,7},
					["potato"] = {2,5,5},
					["carrot"] = {3,5,5}
				}
			},
			{
				rolls = {1,3},
				items = {
					["dark-oak-log"] = {2,3,1}
				}
			},
			{
				rolls = {2,3},
				items = {
					["bottle-o'-enchanting"] = {1,1,7},
					["string"] = {1,6,4},
					["arrow"] = {2,7,4},
					["tripwire-hook"] = {1,3,3},
					["iron-ingot"] = {1,3,3},
					["enchanted-book-rnd"] = {1,1,1}
				}
			},
			{
				rolls = {0,1},
				items = {
					["goat-horn"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["sentry-armor-trim"] = {2,2,1},
					["empty"] = {1,1,3},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {0,1},
				items = {
					["crossbow"] = {1,1,1},
				}
			},
			{
				rolls = {2,3},
				items = {
					["wheat"] = {3,5,7},
					["potato"] = {2,5,5},
					["carrot"] = {3,5,5}
				}
			},
			{
				rolls = {1,3},
				items = {
					["dark-oak-log"] = {2,3,1}
				}
			},
			{
				rolls = {2,3},
				items = {
					["bottle-o'-enchanting"] = {1,1,7},
					["string"] = {1,6,4},
					["arrow"] = {2,7,4},
					["tripwire-hook"] = {1,3,3},
					["iron-ingot"] = {1,3,3},
					["enchanted-book-rnd"] = {1,1,1}
				}
			},
			{
				rolls={0,1},
				items={
					["goat-horn"] = {1,1,1}
				}
			},
			{
				rolls = {1,1},
				items = {
					["sentry-armor-trim"] = {2,2,1},
					["empty"] = {1,1,3},
				}
			},
--			{
--				rolls = {1,1},
--				items = {
--					["enchanted-book-rnd-quick-charge"] = {1,1,2},
--					["empty"] = {1,1,1},
--				}
--			},
		},
		poolsBedrockUpcoming = {}
	},
	["bastion-bridge"] = { -- bastion_bridge.json
		header = "[[Bastion Remnant]]",
		structure = "Bastion Remnant",
		container = "Bridge chest",
		structID = "bastion-remnant",
		display = "bastion remnant bridge chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["lodestone"] = {1,1,1},
				}
			},
			{
				rolls = {1,2},
				items = {
					["damaged-random-enchanted-crossbow"] = {1,1,1},
					["spectral-arrow"] = {10,28,1},
					["gilded-blackstone"] = {8,12,1},
					["crying-obsidian"] = {3,8,1},
					["block-of-gold"] = {1,1,1},
					["gold-ingot"] = {4,9,1},
					["iron-ingot"] = {4,9,1},
					["golden-sword"] = {1,1,1},
					["random-enchanted-golden-chestplate"] = {1,1,1},
					["random-enchanted-golden-helmet"] = {1,1,1},
					["random-enchanted-golden-leggings"] = {1,1,1},
					["random-enchanted-golden-boots"] = {1,1,1},
					["random-enchanted-golden-axe"] = {1,1,1},
				}
			},
			{
				rolls = {2,4},
				items = {
					["string"] = {1,6,1},
					["leather"] = {1,3,1},
					["arrow"] = {5,17,1},
					["iron-nugget"] = {2,6,1},
					["gold-nugget"] = {2,6,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["lodestone"] = {1,1,1},
				}
			},
			{
				rolls = {1,2},
				items = {
					["damaged-random-enchanted-crossbow"] = {1,1,1},
					["arrow"] = {10,28,1},
					["gilded-blackstone"] = {8,12,1},
					["crying-obsidian"] = {3,8,1},
					["block-of-gold"] = {1,1,1},
					["gold-ingot"] = {4,9,1},
					["iron-ingot"] = {4,9,1},
					["golden-sword"] = {1,1,1},
					["random-enchanted-golden-chestplate"] = {1,1,1},
					["random-enchanted-golden-helmet"] = {1,1,1},
					["random-enchanted-golden-leggings"] = {1,1,1},
					["random-enchanted-golden-boots"] = {1,1,1},
					["random-enchanted-golden-axe"] = {1,1,1},
				}
			},
			{
				rolls = {2,4},
				items = {
					["string"] = {1,6,1},
					["leather"] = {1,3,1},
					["arrow"] = {5,17,1},
					["iron-nugget"] = {2,6,1},
					["gold-nugget"] = {2,6,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["bastion-hoglin-stable"] = { -- bastion_hoglin_stable.json
		header = "[[Bastion Remnant]]",
		structure = "Bastion Remnant",
		container = "Hoglin stable chest",
		structID = "bastion-remnant",
		display = "bastion remnant hoglin stable chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["damaged-random-enchanted-diamond-shovel-2"] = {1,1,15},
					["damaged-random-enchanted-diamond-pickaxe"] = {1,1,12},
					["netherite-scrap"] = {1,1,8},
					["ancient-debris"] = {1,1,12},
					["ancient-debris-2"] = {2,2,5},
					["saddle"] = {1,1,12},
					["block-of-gold"] = {2,4,16},
					["golden-carrot"] = {8,17,10},
					["golden-apple"] = {1,1,10},
				}
			},
			{
				rolls = {3,4},
				items = {
					["random-enchanted-golden-axe"] = {1,1,1},
					["crying-obsidian"] = {1,5,1},
					["glowstone"] = {3,6,1},
					["gilded-blackstone"] = {2,5,1},
					["soul-sand"] = {2,7,1},
					["crimson-nylium"] = {2,7,1},
					["gold-nugget"] = {2,8,1},
					["leather"] = {1,3,1},
					["arrow"] = {5,17,1},
					["string"] = {3,8,1},
					["raw-porkchop"] = {2,5,1},
					["cooked-porkchop"] = {2,5,1},
					["crimson-fungus"] = {2,7,1},
					["crimson-roots"] = {2,7,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["damaged-random-enchanted-diamond-shovel-2"] = {1,1,15},
					["damaged-random-enchanted-diamond-pickaxe"] = {1,1,12},
					["netherite-scrap"] = {1,1,8},
					["ancient-debris"] = {1,1,5},
					["saddle"] = {1,1,12},
					["block-of-gold"] = {2,4,16},
					["golden-carrot"] = {8,17,10},
					["golden-apple"] = {1,1,10},
				}
			},
			{
				rolls = {3,4},
				items = {
					["random-enchanted-golden-axe"] = {1,1,1},
					["crying-obsidian"] = {1,5,1},
					["glowstone"] = {3,6,1},
					["gilded-blackstone"] = {2,5,1},
					["soul-sand"] = {2,7,1},
					["crimson-nylium"] = {2,7,1},
					["gold-nugget"] = {2,8,1},
					["leather"] = {1,3,1},
					["arrow"] = {5,17,1},
					["string"] = {3,8,1},
					["raw-porkchop"] = {2,5,1},
					["cooked-porkchop"] = {2,5,1},
					["crimson-fungus"] = {2,7,1},
					["crimson-roots"] = {2,7,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["bastion-generic"] = { -- bastion_other.json
		header = "[[Bastion Remnant]]",
		structure = "Bastion Remnant",
		container = "Generic chest",
		structID = "bastion-remnant",
		display = "bastion remnant generic chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["random-enchanted-diamond-pickaxe"] = {1,1,6},
					["diamond-shovel"] = {1,1,6},
					["damaged-random-enchanted-crossbow-2"] = {1,1,6},
					["ancient-debris"] = {1,1,12},
					["netherite-scrap"] = {1,1,4},
					["spectral-arrow"] = {10,22,10},
					["snout-banner-pattern"] = {1,1,9},
					["disc-pigstep"] = {1,1,5},
					["golden-carrot"] = {6,17,12},
					["golden-apple"] = {1,1,9},
					["enchanted-book-rnd-soul-speed"] = {1,1,10},
				}
			},
			{
				rolls = {2,2},
				items = {
					["damaged-random-enchanted-iron-sword"] = {1,1,2},
					["block-of-iron"] = {1,1,2},
					["soul-speed-enchanted-golden-boots"] = {1,1,1},
					["random-enchanted-golden-axe"] = {1,1,1},
					["block-of-gold"] = {1,1,2},
					["crossbow"] = {1,1,1},
					["gold-ingot"] = {1,6,2},
					["iron-ingot"] = {1,6,2},
					["golden-sword"] = {1,1,1},
					["golden-chestplate"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["golden-leggings"] = {1,1,1},
					["golden-boots"] = {1,1,1},
					["crying-obsidian"] = {1,5,2},
				}
			},
			{
				rolls = {3,4},
				items = {
					["gilded-blackstone"] = {1,5,2},
					["iron-chain"] = {2,10,1},
					["magma-cream"] = {2,6,2},
					["bone-block"] = {3,6,1},
					["iron-nugget"] = {2,8,1},
					["obsidian"] = {4,6,1},
					["gold-nugget"] = {2,8,1},
					["string"] = {4,6,1},
					["arrow"] = {5,17,2},
					["cooked-porkchop"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["random-enchanted-diamond-pickaxe"] = {1,1,6},
					["diamond-shovel"] = {1,1,6},
					["damaged-random-enchanted-crossbow-2"] = {1,1,6},
					["ancient-debris"] = {1,1,12},
					["netherite-scrap"] = {1,1,4},
					["arrow"] = {10,22,10},
					["snout-banner-pattern"] = {1,1,9},
					["disc-pigstep"] = {1,1,5},
					["golden-carrot"] = {6,17,12},
					["golden-apple"] = {1,1,9},
					["enchanted-book-rnd-soul-speed"] = {1,1,10},
				}
			},
			{
				rolls = {2,2},
				items = {
					["damaged-random-enchanted-iron-sword"] = {1,1,2},
					["block-of-iron"] = {1,1,2},
					["soul-speed-enchanted-golden-boots"] = {1,1,1},
					["random-enchanted-golden-axe"] = {1,1,1},
					["block-of-gold"] = {1,1,2},
					["crossbow"] = {1,1,1},
					["gold-ingot"] = {1,6,2},
					["iron-ingot"] = {1,6,2},
					["golden-sword"] = {1,1,1},
					["golden-chestplate"] = {1,1,1},
					["golden-helmet"] = {1,1,1},
					["golden-leggings"] = {1,1,1},
					["golden-boots"] = {1,1,1},
					["crying-obsidian"] = {1,5,2},
				}
			},
			{
				rolls = {3,5},
				items = {
					["gilded-blackstone"] = {1,5,2},
					["iron-chain"] = {2,10,1},
					["magma-cream"] = {2,6,2},
					["bone-block"] = {3,6,1},
					["iron-nugget"] = {2,8,1},
					["obsidian"] = {4,6,1},
					["gold-nugget"] = {2,8,1},
					["string"] = {4,6,1},
					["arrow"] = {5,17,2},
					["cooked-porkchop"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
					["empty"] = {1,1,9}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["bastion-treasure"] = { -- bastion_treasure.json
		header = "[[Bastion Remnant]]",
		structure = "Bastion Remnant",
		container = "Treasure chest",
		structID = "bastion-remnant",
		display = "bastion remnant treasure chest",
		poolsJava = {
			{
				rolls = {3,3},
				items = {
					["netherite-ingot"] = {1,1,15},
					["ancient-debris"] = {1,1,10},
					["netherite-scrap"] = {1,1,8},
					["ancient-debris-2"] = {2,2,4},
					["damaged-random-enchanted-diamond-sword-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-chestplate-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-helmet-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-leggings-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-boots-2"] = {1,1,6},
					["diamond-sword"] = {1,1,6},
					["diamond-chestplate"] = {1,1,5},
					["diamond-helmet"] = {1,1,5},
					["diamond-leggings"] = {1,1,5},
					["diamond-boots"] = {1,1,5},
					["diamond"] = {2,6,5},
					["enchanted-golden-apple"] = {1,1,2},
					["damaged-random-enchanted-diamond-spear"] = {1,1,6},
					["diamond-spear"] = {1,1,6},
				}
			},
			{
				rolls = {3,4},
				items = {
					["spectral-arrow"] = {12,25,1},
					["block-of-gold"] = {2,5,1},
					["block-of-iron"] = {2,5,1},
					["gold-ingot"] = {3,9,1},
					["iron-ingot"] = {3,9,1},
					["crying-obsidian"] = {3,5,1},
					["nether-quartz"] = {8,23,1},
					["gilded-blackstone"] = {5,15,1},
					["magma-cream"] = {3,8,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,3},
				items = {
					["netherite-ingot"] = {1,1,15},
					["netherite-scrap"] = {1,1,8},
					["ancient-debris"] = {2,2,4},
					["damaged-random-enchanted-diamond-sword-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-chestplate-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-helmet-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-leggings-2"] = {1,1,6},
					["damaged-random-enchanted-diamond-boots-2"] = {1,1,6},
					["diamond-sword"] = {1,1,6},
					["diamond-chestplate"] = {1,1,5},
					["diamond-helmet"] = {1,1,5},
					["diamond-leggings"] = {1,1,5},
					["diamond-boots"] = {1,1,5},
					["diamond"] = {2,6,5},
					["enchanted-golden-apple"] = {1,1,2},
					["damaged-random-enchanted-diamond-spear"] = {1,1,6},
					["diamond-spear"] = {1,1,6},
				}
			},
			{
				rolls = {3,4},
				items = {
					["arrow"] = {12,25,1},
					["block-of-gold"] = {2,5,1},
					["block-of-iron"] = {2,5,1},
					["gold-ingot"] = {3,9,1},
					["iron-ingot"] = {3,9,1},
					["crying-obsidian"] = {3,5,1},
					["nether-quartz"] = {8,23,1},
					["gilded-blackstone"] = {5,15,1},
					["magma-cream"] = {3,8,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["snout-armor-trim"] = {1,1,1},
					["empty"] = {1,1,11}
				}
			},
			{
				rolls = {1,1},
				items = {
					["netherite-upgrade"] = {1,1,1}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["ruined-portal"] = { --ruined_portal.json
		header = "[[Ruined Portal]]",
		structure = "Ruined Portal",
		container = "",
		structID = "ruined-portal",
		display = "ruined portal chest",
		poolsJava = {
			{
				rolls = {4,8},
				items = {
					["obsidian"] = {1,2,40},
					["flint"] = {1,4,40},
					["iron-nugget"] = {9,18,40},
					["flint-and-steel"] = {1,1,40},
					["fire-charge"] = {1,1,40},
					["golden-apple"] = {1,1,15},
					["gold-nugget"] = {4,24,15},
					["random-enchanted-golden-sword"] = {1,1,15},
					["random-enchanted-golden-axe"] = {1,1,15},
					["random-enchanted-golden-hoe"] = {1,1,15},
					["random-enchanted-golden-pickaxe"] = {1,1,15},
					["random-enchanted-golden-shovel"] = {1,1,15},
					["random-enchanted-golden-helmet"] = {1,1,15},
					["random-enchanted-golden-chestplate"] = {1,1,15},
					["random-enchanted-golden-leggings"] = {1,1,15},
					["random-enchanted-golden-boots"] = {1,1,15},
					["glistering-melon-slice"] = {4,12,5},
					["golden-horse-armor"] = {1,1,5},
					["light-weighted-pressure-plate"] = {1,1,5},
					["golden-carrot"] = {4,12,5},
					["clock"] = {1,1,5},
					["gold-ingot"] = {2,8,5},
					["bell"] = {1,1,1},
					["enchanted-golden-apple"] = {1,1,1},
					["block-of-gold"] = {1,2,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,1},
					["lodestone"] = {1,2,2},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {4,8},
				items = {
					["obsidian"] = {1,2,40},
					["flint"] = {1,4,40},
					["iron-nugget"] = {9,18,40},
					["flint-and-steel"] = {1,1,40},
					["fire-charge"] = {1,1,40},
					["golden-apple"] = {1,1,15},
					["gold-nugget"] = {4,24,15},
					["random-enchanted-golden-sword"] = {1,1,15},
					["random-enchanted-golden-axe"] = {1,1,15},
					["random-enchanted-golden-hoe"] = {1,1,15},
					["random-enchanted-golden-shovel"] = {1,1,15},
					["random-enchanted-golden-pickaxe"] = {1,1,15},
					["random-enchanted-golden-boots"] = {1,1,15},
					["random-enchanted-golden-chestplate"] = {1,1,15},
					["random-enchanted-golden-helmet"] = {1,1,15},
					["random-enchanted-golden-leggings"] = {1,1,15},
					["glistering-melon-slice"] = {4,12,5},
					["golden-horse-armor"] = {1,1,5},
					["light-weighted-pressure-plate"] = {1,1,5},
					["golden-carrot"] = {4,12,5},
					["clock"] = {1,1,5},
					["gold-ingot"] = {2,8,5},
					["bell"] = {1,1,1},
					["enchanted-golden-apple"] = {1,1,1},
					["block-of-gold"] = {1,2,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["empty"] = {1,1,1},
					["lodestone"] = {1,2,2},
				}
			},
		},
		poolsBedrockUpcoming = {}
	},
	["woodland-mansion"] = { -- woodland_mansion.json
		header = "[[Woodland Mansion]]",
		structure = "Woodland Mansion",
		container = "",
		structID = "woodland-mansion",
		display = "woodland mansion chest",
		poolsJava = {
						{
				rolls = {1,3},
				items = {
					["lead"] = {1,1,20},
					["golden-apple"] = {1,1,15},
					["enchanted-golden-apple"] = {1,1,2},
					["disc-13"] = {1,1,15},
					["disc-cat"] = {1,1,15},
					["chainmail-chestplate"] = {1,1,10},
					["diamond-hoe"] = {1,1,15},
					["diamond-chestplate"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,10},
				}
			},
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,4,10},
					["gold-ingot"] = {1,4,5},
					["bread"] = {1,1,20},
					["wheat"] = {1,4,20},
					["bucket"] = {1,1,10},
					["redstone"] = {1,4,15},
					["coal"] = {1,4,15},
					["melon-seeds"] = {2,4,10},
					["pumpkin-seeds"] = {2,4,10},
					["beetroot-seeds"] = {2,4,10},
					["resin-clump"] = {2,4,50},
				}
			},
			{
				rolls = {3,3},
				items = {
					["bone"] = {1,8,10},
					["gunpowder"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
				}
			},
			{
				rolls = {1,1},
				items = {
					["vex-armor-trim"] = {1,1,1},
					["empty"] = {1,1,1}
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,3},
				items = {
					["lead"] = {1,1,100},
					["golden-apple"] = {1,1,75},
					["enchanted-golden-apple"] = {1,1,10},
					["disc-13"] = {1,1,75},
					["disc-cat"] = {1,1,75},
					["chainmail-chestplate"] = {1,1,50},
					["diamond-hoe"] = {1,1,75},
					["diamond-chestplate"] = {1,1,25},
					["enchanted-book-rnd"] = {1,1,60},
				}
			},
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,4,50},
					["gold-ingot"] = {1,4,25},
					["bread"] = {1,1,100},
					["wheat"] = {1,4,100},
					["bucket"] = {1,1,50},
					["redstone"] = {1,4,75},
					["coal"] = {1,4,75},
					["melon-seeds"] = {2,4,50},
					["pumpkin-seeds"] = {2,4,50},
					["beetroot-seeds"] = {2,4,50},
					["resin-clump"] = {2,4,50},
				}
			},
			{
				rolls = {3,3},
				items = {
					["bone"] = {1,8,50},
					["gunpowder"] = {1,8,50},
					["rotten-flesh"] = {1,8,50},
					["string"] = {1,8,50},
				}
			},
			{
				rolls = {1,1},
				items = {
					["vex-armor-trim"] = {1,1,1},
					["empty"] = {1,1,1}
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["bonus-barrel"] = { -- bonus_barrel.json from Java Edition 3D Shareware v1.34
		april_fools = true,
		chest_type = "barrel",
		header = "[[Java Edition 3D Shareware v1.34#Blocks|Bonus barrel]]",
		structure = "Bonus barrel",
		container = "",
		structID = "day",
		display = "bonus barrel",
		poolsJava = {
			{
				rolls = {1,4},
				items = {
					["level-enchanted-bow"] = {1,1,1},
					["random-effect-arrow"] = {1,20,1},
					["random-effect-tipped-arrow"] = {1,20,1},
					["random-effect-potion"] = {1,1,1},
					["random-effect-splash-potion"] = {1,1,1},
					["random-effect-lingering-potion"] = {1,1,1},
					["level-enchanted-leather-tunic"] = {1,1,1},
					["level-enchanted-leather-boots"] = {1,1,1},
					["level-enchanted-leather-cap"] = {1,1,1},
					["level-enchanted-leather-pants"] = {1,1,1},
					["level-enchanted-iron-chestplate-2"] = {1,1,1},
					["level-enchanted-iron-boots-2"] = {1,1,1},
					["level-enchanted-iron-helmet-2"] = {1,1,1},
					["level-enchanted-iron-leggings-2"] = {1,1,1},
					["level-enchanted-diamond-chestplate-2"] = {1,1,1},
					["level-enchanted-diamond-boots-2"] = {1,1,1},
					["level-enchanted-diamond-helmet-2"] = {1,1,1},
					["level-enchanted-diamond-leggings-2"] = {1,1,1},
					["level-enchanted-stone-sword"] = {1,1,1},
					["level-enchanted-iron-sword-2"] = {1,1,1},
					["level-enchanted-diamond-sword-2"] = {1,1,1},
					["random-enchanted-crossbow"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["blue-key"] = {1,1,1},
					["yellow-key"] = {1,1,2},
					["red-key"] = {1,1,5},
					["empty"] = {1,1,16},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["brushable-cold-ocean-ruins"]={
		chest_type = "suspicious block",
		header = "[[Cold Ocean Ruins]]",
		structure = "Cold Ocean Ruins",
		container = "Cold ruins suspicious gravel",
		structID = "cold-ocean-ruins",
		display = "cold ocean ruins suspicious gravel",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["blade-pottery-sherd"] = {1,1,1},
					["explorer-pottery-sherd"] = {1,1,1},
					["mourner-pottery-sherd"] = {1,1,1},
					["plenty-pottery-sherd"] = {1,1,1},
					["iron-axe"] = {1,1,1},
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["coal"] = {1,1,2},
					["gold-nugget"] = {1,1,2},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["explorer-pottery-sherd"] = {1,1,1},
					["mourner-pottery-sherd"] = {1,1,1},
					["plenty-pottery-sherd"] = {1,1,1},
					["blade-pottery-sherd"] = {1,1,1},
					["iron-axe"] = {1,1,1},
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["coal"] = {1,1,2},
					["gold-nugget"] = {1,1,2},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["brushable-desert-temple"]={
		chest_type = "suspicious block",
		header = "[[Desert Pyramid]]",
		structure = "Desert Pyramid",
		container = "Suspicious sand",
		structID = "desert-temple",
		display = "desert pyramid suspicious sand",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["archer-pottery-sherd"] = {1,1,1},
					["prize-pottery-sherd"] = {1,1,1},
					["skull-pottery-sherd"] = {1,1,1},
					["miner-pottery-sherd"] = {1,1,1},
					["diamond"] = {1,1,1},
					["tnt"] = {1,1,1},
					["gunpowder"] = {1,1,1},
					["emerald"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["archer-pottery-sherd"] = {1,1,1},
					["prize-pottery-sherd"] = {1,1,1},
					["skull-pottery-sherd"] = {1,1,1},
					["miner-pottery-sherd"] = {1,1,1},
					["diamond"] = {1,1,1},
					["emerald"] = {1,1,1},
					["tnt"] = {1,1,1},
					["gunpowder"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["brushable-desert-well"]={
		chest_type = "suspicious block",
		header = "[[Desert Well]]",
		structure = "Desert well",
		container = "Suspicious sand",
		structID = "desert-well",
		display = "desert well suspicious sand",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["arms-up-pottery-sherd"] = {1,1,2},
					["brewer-pottery-sherd"] = {1,1,2},
					["brick"] = {1,1,1},
					["emerald"] = {1,1,1},
					["stick"] = {1,1,1},
					["suspicious-stew"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["arms-up-pottery-sherd"] = {1,1,2},
					["brewer-pottery-sherd"] = {1,1,2},
					["brick"] = {1,1,1},
					["emerald"] = {1,1,1},
					["stick"] = {1,1,1},
					["suspicious-stew"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["brushable-trail-ruins"]={
		chest_type = "suspicious block",
		header = "[[Trail Ruins]]",
		structure = "Trail Ruins",
		container = "Common suspicious gravel",
		structID = "trail-ruins",
		display = "trail ruins common suspicious gravel",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["clay"] = {1,1,2},
					["brick"] = {1,1,2},
					["yellow-dye"] = {1,1,2},
					["blue-dye"] = {1,1,2},
					["light-blue-dye"] = {1,1,2},
					["white-dye"] = {1,1,2},
					["orange-dye"] = {1,1,2},
					["red-candle"] = {1,1,2},
					["green-candle"] = {1,1,2},
					["purple-candle"] = {1,1,2},
					["brown-candle"] = {1,1,2},
					["magenta-stained-glass-pane"] = {1,1,1},
					["pink-stained-glass-pane"] = {1,1,1},
					["blue-stained-glass-pane"] = {1,1,1},
					["light-blue-stained-glass-pane"] = {1,1,1},
					["red-stained-glass-pane"] = {1,1,1},
					["yellow-stained-glass-pane"] = {1,1,1},
					["purple-stained-glass-pane"] = {1,1,1},
					["spruce-hanging-sign"] = {1,1,1},
					["oak-hanging-sign"] = {1,1,1},
					["gold-nugget"] = {1,1,1},
					["coal"] = {1,1,1},
					["wheat-seeds"] = {1,1,1},
					["beetroot-seeds"] = {1,1,1},
					["dead-bush"] = {1,1,1},
					["flower-pot"] = {1,1,1},
					["string"] = {1,1,1},
					["lead"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["brick"] = {1,1,2},
					["clay"] = {1,1,2},
					["yellow-dye"] = {1,1,2},
					["blue-dye"] = {1,1,2},
					["light-blue-dye"] = {1,1,2},
					["white-dye"] = {1,1,2},
					["orange-dye"] = {1,1,2},
					["red-candle"] = {1,1,2},
					["green-candle"] = {1,1,2},
					["purple-candle"] = {1,1,2},
					["brown-candle"] = {1,1,2},
					["magenta-stained-glass-pane"] = {1,1,1},
					["pink-stained-glass-pane"] = {1,1,1},
					["blue-stained-glass-pane"] = {1,1,1},
					["light-blue-stained-glass-pane"] = {1,1,1},
					["red-stained-glass-pane"] = {1,1,1},
					["yellow-stained-glass-pane"] = {1,1,1},
					["purple-stained-glass-pane"] = {1,1,1},
					["spruce-hanging-sign"] = {1,1,1},
					["oak-hanging-sign"] = {1,1,1},
					["gold-nugget"] = {1,1,1},
					["coal"] = {1,1,1},
					["wheat-seeds"] = {1,1,1},
					["beetroot-seeds"] = {1,1,1},
					["gold-nugget"] = {1,1,1},
					["dead-bush"] = {1,1,1},
					["flower-pot"] = {1,1,1},
					["string"] = {1,1,1},
					["lead"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
    ["brushable-trail-ruins-rare"]={
		chest_type = "suspicious block",
		header = "[[Trail Ruins]]",
		structure = "Trail Ruins",
		container = "Rare suspicious gravel",
		structID = "trail-ruins",
		display = "trail ruins rare suspicious gravel",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["burn-pottery-sherd"] = {1,1,1},
					["danger-pottery-sherd"] = {1,1,1},
					["friend-pottery-sherd"] = {1,1,1},
					["heart-pottery-sherd"] = {1,1,1},
					["heartbreak-pottery-sherd"] = {1,1,1},
					["howl-pottery-sherd"] = {1,1,1},
					["sheaf-pottery-sherd"] = {1,1,1},
					["wayfinder-armor-trim"] = {1,1,1},
					["raiser-armor-trim"] = {1,1,1},
					["shaper-armor-trim"] = {1,1,1},
					["host-armor-trim"] = {1,1,1},
					["disc-relic"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["burn-pottery-sherd"] = {1,1,1},
					["danger-pottery-sherd"] = {1,1,1},
					["friend-pottery-sherd"] = {1,1,1},
					["heart-pottery-sherd"] = {1,1,1},
					["heartbreak-pottery-sherd"] = {1,1,1},
					["howl-pottery-sherd"] = {1,1,1},
					["sheaf-pottery-sherd"] = {1,1,1},
					["wayfinder-armor-trim"] = {1,1,1},
					["raiser-armor-trim"] = {1,1,1},
					["shaper-armor-trim"] = {1,1,1},
					["host-armor-trim"] = {1,1,1},
					["disc-relic"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["brushable-warm-ocean-ruins"]={
		chest_type = "suspicious block",
		header = "[[Warm Ocean Ruins]]",
		structure = "Warm ocean ruins",
		container = "Warm ruins suspicious sand",
		structID = "warm-ocean-ruins",
		display = "warm ocean ruins suspicious sand",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["angler-pottery-sherd"] = {1,1,1},
					["shelter-pottery-sherd"] = {1,1,1},
					["snort-pottery-sherd"] = {1,1,1},
					["sniffer-egg"] = {1,1,1},
					["iron-axe"] = {1,1,1},
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["coal"] = {1,1,2},
					["gold-nugget"] = {1,1,2},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["snort-pottery-sherd"] = {1,1,1},
					["angler-pottery-sherd"] = {1,1,1},
					["shelter-pottery-sherd"] = {1,1,1},
					["sniffer-egg"] = {1,1,1},
					["iron-axe"] = {1,1,1},
					["emerald"] = {1,1,2},
					["wheat"] = {1,1,2},
					["wooden-hoe"] = {1,1,2},
					["coal"] = {1,1,2},
					["gold-nugget"] = {1,1,2},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-corridor"] = { -- trial_chambers/corridor.json
		header = "Corridor",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Corridor chest",
		structID = "trial-chambers",
		display = "trial chambers corridor chest",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["tuff"] = {8,20,3},
					["scaffolding"] = {2,10,2},
					["torch"] = {3,6,2},
					["bamboo-planks"] = {3,6,2},
					["bamboo-hanging-sign"] = {1,4,2},
					["ender-pearl"] = {1,2,2},
					["damaged-stone-pickaxe"] = {1,1,2},
					["damaged-stone-axe"] = {1,1,2},
					["honeycomb"] = {2,8,1},
					["damaged-random-enchanted-iron-axe"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,3},
				items = {
					["tuff"] = {8,20,3},
					["scaffolding"] = {2,10,2},
					["torch"] = {3,6,2},
					["bamboo-planks"] = {3,6,2},
					["bamboo-hanging-sign"] = {1,4,2},
					["ender-pearl"] = {1,2,2},
					["damaged-stone-pickaxe"] = {1,1,2},
					["damaged-stone-axe"] = {1,1,2},
					["honeycomb"] = {2,8,1},
					["damaged-random-enchanted-iron-axe"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-entrance"] = { -- trial_chambers/entrance.json
		header = "Entrance",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Entrance chest",
		structID = "trial-chambers",
		display = "trial chambers entrance chest",
		poolsJava = {
			{
				rolls = {2,3},
				items = {
					["arrow"] = {5,10,10},
					["honeycomb"] = {2,8,10},
					["wooden-axe"] = {1,1,10},
					["stick"] = {2,5,5},
					["trial-key"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,3},
				items = {
					["arrow"] = {5,10,10},
					["honeycomb"] = {2,8,10},
					["wooden-axe"] = {1,1,10},
					["stick"] = {2,5,5},
					["trial-key"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-intersection-barrel"] = { -- trial_chambers/intersection_barrel.json
		chest_type = "barrel",
		header = "Barrel intersection",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Intersection barrel",
		structID = "trial-chambers",
		display = "trial chambers intersection barrel",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["bamboo-planks"] = {5,15,10},
					["baked-potato"] = {6,10,10},
					["damaged-golden-pickaxe"] = {1,1,4},
					["damaged-golden-axe"] = {1,1,4},
					["diamond"] = {1,3,1},
					["bucket"] = {1,2,1},
					["compass"] = {1,1,1},
					["damaged-diamond-pickaxe-2"] = {1,1,1},
					["damaged-random-enchanted-diamond-axe"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,3},
				items = {
					["bamboo-planks"] = {5,15,10},
					["baked-potato"] = {6,10,10},
					["damaged-golden-pickaxe"] = {1,1,4},
					["damaged-golden-axe"] = {1,1,4},
					["diamond"] = {1,3,1},
					["bucket"] = {1,2,1},
					["compass"] = {1,1,1},
					["damaged-diamond-pickaxe"] = {1,1,1},
					["damaged-random-enchanted-diamond-axe"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-intersection"] = { -- trial_chambers/intersection.json
		header = "Intersection",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Intersection chest",
		structID = "trial-chambers",
		display = "trial chambers intersection chest",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["amethyst-shard"] = {8,20,20},
					["block-of-iron"] = {1,2,20},
					["cake"] = {1,4,20},
					["diamond"] = {1,2,10},
					["block-of-emerald"] = {1,3,5},
					["damaged-diamond-pickaxe"] = {1,1,5},
					["damaged-diamond-axe"] = {1,1,5},
					["block-of-diamond"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,3},
				items = {
					["amethyst-shard"] = {8,20,20},
					["block-of-iron"] = {1,2,20},
					["cake"] = {1,4,20},
					["diamond"] = {1,2,10},
					["block-of-emerald"] = {1,3,5},
					["damaged-diamond-pickaxe"] = {1,1,5},
					["damaged-diamond-axe"] = {1,1,5},
					["block-of-diamond"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-reward"] = { -- trial_chambers/reward.json
		chest_type = "reward container",
		header = "Vault and reward chest",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Vault and reward chest",
		structID = "trial-chambers",
		display = "trial chambers vault and reward chest",
		poolsJava =  {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 20% trial_chambers/reward_common.json, all weights multiplied by 23 (reward_rare weight total)
					["arrow"] = {2,8,92},
					["tipped-arrow-poison"] = {2,8,92},
					["emerald"] = {2,4,392}, -- Added 300 to the weight because it's the same as on reward_rare table
					["wind-charge"] = {1,3,69},
					["iron-ingot"] = {1,4,69},
					["honey-bottle"] = {1,2,69},
					["ominous-bottle"] = {1,1,46},
					["wind-charge-2"] = {4,12,23},
					["diamond"] = {1,2,23},

					-- 80% trial_chambers/reward_rare.json, all weights multiplied by 100 (reward_common weight total multiplied by 4)
					-- ["emerald"] = {2,4,300}, It's the exact same as on the reward_common table, added the weight there
					["damaged-shield"] = {1,1,300},
					["level-enchanted-bow-2"] = {1,1,300},
					["level-enchanted-crossbow"] = {1,1,200},
					["level-enchanted-iron-axe"] = {1,1,200},
					["level-enchanted-iron-chestplate-0-10"] = {1,1,200},
					["golden-carrot"] = {1,2,200},
					["enchanted-book-rnd-trial-chambers"] = {1,1,200},	
					["enchanted-book-rnd-mending-trident"] = {1,1,200},
					["level-enchanted-diamond-axe"] = {1,1,100},
					["level-enchanted-diamond-chestplate-3"] = {1,1,100},
				}
			},
			{ -- trial_chambers/reward_common.json
				rolls = {1,3},
				items = {
					["arrow"] = {2,8,4},
					["tipped-arrow-poison"] = {2,8,4},
					["emerald"] = {2,4,4},
					["wind-charge"] = {1,3,3},
					["iron-ingot"] = {1,4,3},
					["honey-bottle"] = {1,2,3},
					["ominous-bottle"] = {1,1,2},
					["wind-charge-2"] = {4,12,1},
					["diamond"] = {1,2,1},
				}
			},
			{ -- 25% trial_chambers/reward_unique.json
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,4},
					["bolt-armor-trim"] = {1,1,3},
					["guster-banner-pattern"] = {1,1,2},
					["disc-precipice"] = {1,1,2},
					["trident"] = {1,1,1},
				-- 75% skip reward_unique, weight is the sum of non-empty weights multiplied by 3
					["empty"] = {1,1,36},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock =  {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 80% trial_chambers/reward_common.json, all weights multiplied by 92 (reward_rare weight total multiplied by 4)
					["arrow"] = {2,8,368},
					["tipped-arrow-poison"] = {2,8,368},
					["emerald"] = {2,4,443}, -- Added 75 to the weight because it's the same as on reward_rare table
					["wind-charge"] = {1,3,276},
					["iron-ingot"] = {1,4,276},
					["honey-bottle"] = {1,2,276},
					["ominous-bottle"] = {1,1,184},
					["wind-charge-2"] = {4,12,92},
					["diamond"] = {1,2,92},

					-- 20% trial_chambers/reward_rare.json, all weights multiplied by 25 (reward_common weight total)
					-- ["emerald"] = {2,4,75}, It's the exact same as on the reward_common table, added the weight there
					["damaged-shield"] = {1,1,75},
					["level-enchanted-bow-2"] = {1,1,75},
					["level-enchanted-crossbow"] = {1,1,50},
					["level-enchanted-iron-axe"] = {1,1,50},
					["level-enchanted-iron-chestplate-0-10"] = {1,1,50},
					["golden-carrot"] = {1,2,50},
					["enchanted-book-rnd-trial-chambers"] = {1,1,50},	
					["enchanted-book-rnd-mending-trident"] = {1,1,50},
					["level-enchanted-diamond-axe"] = {1,1,25},
					["level-enchanted-diamond-chestplate-3"] = {1,1,25},
				}
			},
			{ -- trial_chambers/reward_common.json
				rolls = {1,3},
				items = {
					["arrow"] = {2,8,4},
					["tipped-arrow-poison"] = {2,8,4},
					["emerald"] = {2,4,4},
					["wind-charge"] = {1,3,3},
					["iron-ingot"] = {1,4,3},
					["honey-bottle"] = {1,2,3},
					["ominous-bottle"] = {1,1,2},
					["wind-charge-2"] = {4,12,1},
					["diamond"] = {1,2,1},
				}
			},
			{ -- trial_chambers/reward_unique.json
				rolls = {1,1},
				items = {
					["golden-apple"] = {1,1,4},
					["bolt-armor-trim"] = {1,1,3},
					["guster-banner-pattern"] = {1,1,2},
					["disc-precipice"] = {1,1,2},
					["trident"] = {1,1,1},
					["empty"] = {1,1,36},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-reward-ominous"] = { -- trial_chambers/reward_ominous.json
		chest_type = "vault",
		header = "Ominous vault",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Ominous vault",
		structID = "trial-chambers",
		display = "trial chambers ominous vault",
		poolsJava = {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 20% trial_chambers/reward_ominous_common.json, all weights multiplied by 29 (reward_rare weight total)
					["diamond"] = {2,3,58},
					["emerald"] = {4,10,145},
					["wind-charge"] = {8,12,116},
					["tipped-arrow-strong-slowness"] = {4,12,87},
					["ominous-bottle-2"] = {1,1,29},
					-- 80% trial_chambers/reward_ominous_rare.json, all weights multiplied by 60 (reward_common weight total multiplied by 4)
					["block-of-diamond"] = {1,1,60},
					["block-of-emerald"] = {1,1,300},
					["block-of-iron"] = {1,1,240},
					["golden-apple"] = {1,1,180},
					["level-enchanted-crossbow"] = {1,1,240},
					["level-enchanted-diamond-axe-2"] = {1,1,180},
					["level-enchanted-diamond-chestplate-4"] = {1,1,180},
					["enchanted-book-rnd-trial-chambers-2"] = {1,1,120},
					["enchanted-book-rnd-breach-density"] = {1,1,120},
					["enchanted-book-rnd-wind-burst"] = {1,1,120},
				}
			},
			{ -- trial_chambers/reward_ominous_common.json
				rolls = {1,3},
				items = {
					["emerald"] = {4,10,5},
					["wind-charge"] = {8,12,4},
					["tipped-arrow-strong-slowness"] = {4,12,3},
					["diamond"] = {2,3,2},
					["ominous-bottle-2"] = {1,1,1},
				}
			},
			{ -- 75% trial_chambers/reward_ominous_unique.json, all weights multiplied by 3, except for "empty" 
				rolls = {1,1},
				items = {
					["enchanted-golden-apple"] = {1,1,9},
					["flow-armor-trim"] = {1,1,9},
					["flow-banner-pattern"] = {1,1,6},
					["disc-creator"] = {1,1,3},
					["heavy-core"] = {1,1,3},
				-- 25% skip reward_ominous_unique, weight is the sum of non-empty weights divided by 3
					["empty"] = {1,1,10},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 20% trial_chambers/reward_ominous_common.json, all weights multiplied by 29 (reward_rare weight total)
					["diamond"] = {2,3,58},
					["emerald"] = {4,10,145},
					["wind-charge"] = {8,12,116},
					["tipped-arrow-strong-slowness"] = {4,12,87},
					["ominous-bottle-2"] = {1,1,29},
					-- 80% trial_chambers/reward_ominous_rare.json, all weights multiplied by 60 (reward_common weight total multiplied by 4)
					["block-of-diamond"] = {1,1,60},
					["block-of-emerald"] = {1,1,300},
					["block-of-iron"] = {1,1,240},
					["golden-apple"] = {1,1,180},
					["level-enchanted-crossbow"] = {1,1,240},
					["level-enchanted-diamond-axe-2"] = {1,1,180},
					["level-enchanted-diamond-chestplate-4"] = {1,1,180},
					["enchanted-book-rnd-trial-chambers-2"] = {1,1,120},
					["enchanted-book-rnd-breach-density"] = {1,1,120},
					["enchanted-book-rnd-wind-burst"] = {1,1,120},
				}
			},
			{ -- trial_chambers/reward_ominous_common.json
				rolls = {1,3},
				items = {
					["emerald"] = {4,10,5},
					["wind-charge"] = {8,12,4},
					["tipped-arrow-strong-slowness"] = {4,12,3},
					["diamond"] = {2,3,2},
					["ominous-bottle-2"] = {1,1,1},
				}
			},
			{ -- trial_chambers/reward_ominous_unique.json
				rolls = {1,1},
				items = {
					["enchanted-golden-apple"] = {1,1,9},
					["flow-armor-trim"] = {1,1,9},
					["flow-banner-pattern"] = {1,1,6},
					["disc-creator"] = {1,1,3},
					["heavy-core"] = {1,1,3},
					["empty"] = {1,1,10} -- 25% chance of dropping nothing
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-supply"] = { -- trial_chambers/supply.json
		header = "Supply",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Supply chest",
		structID = "trial-chambers",
		display = "trial chambers supply chest",
		poolsJava = {
			{
				rolls = {3,5},
				items = {
					["arrow"] = {4,14,2},
					["glow-berries"] = {2,10,2},
					["baked-potato"] = {2,4,2},
					["damaged-stone-pickaxe"] = {1,1,2},
					["tuff"] = {5,10,1},
					["tipped-arrow-poison"] = {4,8,1},
					["tipped-arrow-slowness"] = {4,8,1},
					["acacia-planks"] = {3,6,1},
					["torch"] = {3,6,1},
					["bone-meal"] = {2,5,1},
					["moss-block"] = {2,5,1},
					["potion-of-strength"] = {2,2,1},
					["potion-of-regeneration"] = {2,2,1},
					["milk-bucket"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {3,5},
				items = {
					["arrow"] = {4,14,2},
					["glow-berries"] = {2,10,2},
					["baked-potato"] = {2,4,2},
					["damaged-stone-pickaxe"] = {1,1,2},
					["tuff"] = {5,10,1},
					["tipped-arrow-poison"] = {4,8,1},
					["tipped-arrow-slowness"] = {4,8,1},
					["acacia-planks"] = {3,6,1},
					["torch"] = {3,6,1},
					["bone-meal"] = {2,5,1},
					["moss-block"] = {2,5,1},
					["potion-of-strength"] = {2,2,1},
					["potion-of-regeneration"] = {2,2,1},
					["milk-bucket"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-corridor-pot"] = { -- pots/trial_chambers/corridor.json
		chest_type = "decorated pot",
		header = "Corridor pot",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Corridor pot",
		structID = "trial-chambers",
		display = "trial chambers corridor pot",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["emerald"] = {1,3,125},
					["arrow"] = {2,8,100},
					["iron-ingot"] = {1,2,100},
					["trial-key"] = {1,1,10},
					["disc-creator-music-box"] = {1,1,5},
					["diamond"] = {1,2,5},
					["block-of-emerald"] = {1,1,5},
					["block-of-diamond"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["emerald"] = {1,3,125},
					["arrow"] = {2,8,100},
					["iron-ingot"] = {1,2,100},
					["trial-key"] = {1,1,10},
					["disc-creator-music-box"] = {1,1,5},
					["diamond"] = {1,2,5},
					["block-of-emerald"] = {1,1,5},
					["block-of-diamond"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-chamber-dispenser"] = { -- dispensers/trial_chambers/chamber.json
		chest_type = "dispenser",
		header = "Chamber dispenser",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Chamber dispenser",
		structID = "trial-chambers",
		display = "trial chambers chamber dispenser",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["snowball"] = {4,8,6},
					["fire-charge"] = {4,8,6},
					["arrow"] = {4,8,4},
					["water-bucket"] = {1,1,4},
					["egg"] = {4,8,2},
					["splash-potion-of-slowness"] = {2,5,1},
					["splash-potion-of-poison"] = {2,5,1},
					["splash-potion-of-weakness"] = {2,5,1},
					["lingering-potion-of-slowness"] = {2,5,1},
					["lingering-potion-of-poison"] = {2,5,1},
					["lingering-potion-of-weakness"] = {2,5,1},
					["lingering-potion-of-healing"] = {2,5,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["snowball"] = {4,8,6},
					["fire-charge"] = {4,8,6},
					["arrow"] = {4,8,4},
					["water-bucket"] = {1,1,4},
					["egg"] = {4,8,2},
					["splash-potion-of-slowness"] = {2,5,1},
					["splash-potion-of-poison"] = {2,5,1},
					["splash-potion-of-weakness"] = {2,5,1},
					["lingering-potion-of-slowness"] = {2,5,1},
					["lingering-potion-of-poison"] = {2,5,1},
					["lingering-potion-of-weakness"] = {2,5,1},
					["lingering-potion-of-healing"] = {2,5,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-corridor-dispenser"] = { -- dispensers/trial_chambers/corridor.json
		chest_type = "dispenser",
		header = "Corridor dispenser",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Corridor dispenser",
		structID = "trial-chambers",
		display = "trial chambers corridor dispenser",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["arrow"] = {4,8,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["arrow"] = {4,8,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-water-dispenser"] = { -- dispensers/trial_chambers/water.json
		chest_type = "dispenser",
		header = "Water dispenser",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Water dispenser",
		structID = "trial-chambers",
		display = "trial chambers water dispenser",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["water-bucket"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["water-bucket"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-trial-spawner"] = { -- This is a merge of 50% spawners/trial_chamber/key and 50% spawners/trial_chamber/consumables
		chest_type = "trial spawner",
		header = "Spawner",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Trial spawner",
		structID = "trial-chambers",
		display = "trial chambers trial spawner",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["cooked-chicken"] = {1,1,3},
					["bread"] = {1,3,3},
					["baked-potato"] = {1,3,2},
					["potion-of-regeneration"] = {1,1,1},
					["potion-of-swiftness"] = {1,1,1},
					["trial-key"] = {1,1,10},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {1,1},
				items = {
					["cooked-chicken"] = {1,1,3},
					["bread"] = {1,3,3},
					["baked-potato"] = {1,3,2},
					["potion-of-regeneration"] = {1,1,1},
					["potion-of-swiftness"] = {1,1,1},
					["trial-key"] = {1,1,10},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["trial-chambers-trial-spawner-ominous"] = { -- This is a merge of 30% spawners/ominous/trial_chamber/key and 70% spawners/ominous/trial_chamber/consumables
		chest_type = "trial spawner",
		header = "Ominous Spawner",
		superheader = "[[Trial Chambers]]",
		structure = "Trial Chambers",
		container = "Ominous trial spawner",
		structID = "trial-chambers",
		display = "trial chambers ominous trial spawner",
		poolsJava = {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 30% spawners/ominous/trial_chamber/key.json
					["ominous-trial-key"]      = {1,1,30},
					-- 70% spawners/ominous/trial_chamber/consumables.json, all weights multiplied by 7
					["cooked-beef"]            = {1,2,21},
					["baked-potato"]           = {2,4,21},
					["golden-carrot"]          = {1,2,14},
					["potion-of-regeneration"] = {1,1,7},
					["potion-of-strength"]     = {1,1,7},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{ -- combination of common and rare
				rolls = {1,1},
				items = {
					-- 30% spawners/ominous/trial_chamber/key.json
					["ominous-trial-key"]      = {1,1,30},
					-- 70% spawners/ominous/trial_chamber/consumables.json, all weights multiplied by 7
					["cooked-beef"]            = {1,2,21},
					["baked-potato"]           = {2,4,21},
					["golden-carrot"]          = {1,2,14},
					["potion-of-regeneration"] = {1,1,7},
					["potion-of-strength"]     = {1,1,7},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["abandoned-camp-barrel"] = { -- abandoned_camp_barrel.json
		chest_type = "barrel",
		header = "[[Abandoned Camp]]",
		structure = "Abandoned Camp",
		container = "Barrel",
		structID = "abandoned-camp",
		display = "abandoned camp barrel",
		poolsJava = {
			{
				rolls = {4,8},
				items = {
					["arrow"] = {1,3,1},
					["bone"] = {2,4,1},
					["bowl"] = {1,2,1},
					["bread"] = {1,3,1},
					["coal"] = {2,4,1},
					["cobweb"] = {1,1,1},
					["glass-bottle"] = {1,3,1},
					["leather"] = {1,3,1},
					["rabbit-hide"] = {1,4,1},
					["string"] = {1,2,1},
					["wheat"] = {1,4,1},
					["white-candle"] = {1,3,1},
					["white-cushion"] = {1,2,1},
					["straw-bed"] = {2,4,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["bundle"] = {1,1,1},
					["wooden-axe"] = {1,1,1},
					["fishing-rod"] = {1,1,1},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {4,8},
				items = {
					["arrow"] = {1,3,1},
					["bone"] = {2,4,1},
					["bowl"] = {1,2,1},
					["bread"] = {1,3,1},
					["coal"] = {2,4,1},
					["cobweb"] = {1,1,1},
					["glass-bottle"] = {1,3,1},
					["leather"] = {1,3,1},
					["rabbit-hide"] = {1,4,1},
					["string"] = {1,2,1},
					["wheat"] = {1,4,1},
					["white-candle"] = {1,3,1},
					["white-cushion"] = {1,2,1},
					["straw-bed"] = {2,4,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["bundle"] = {1,1,1},
					["wooden-axe"] = {1,1,1},
					["fishing-rod"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["abandoned-camp-common-chest"] = { -- abandoned_camp_common_chest.json
		header = "[[Abandoned Camp]]",
		structure = "Abandoned Camp",
		container = "Common chest",
		structID = "abandoned-camp",
		display = "abandoned camp common chest",
		poolsJava = {
			{
				rolls = {4,6},
				items = {
					["arrow"] = {4,4,1},
					["empty-map"] = {1,1,1},
					["bone"] = {2,4,1},
					["cobweb"] = {1,1,1},
					["compass"] = {1,1,1},
					["empty-map-2"] = {1,2,1},
					["gunpowder"] = {2,4,1},
					["fishing-rod"] = {1,1,1},
					["flint-and-steel"] = {1,1,1},
					["glass-bottle"] = {1,4,1},
					["lead"] = {1,3,1},
					["leather"] = {1,4,1},
					["bundle"] = {1,1,1},
					["rabbit-hide"] = {1,4,1},
					["saddle"] = {1,1,1},
					["white-candle"] = {1,3,1},
				}
			},
			{
				rolls = {2,2},
				items = {
					["bow"] = {1,1,1},
					["bucket"] = {1,1,1},
					["copper-axe"] = {1,1,1},
					["copper-boots"] = {1,1,1},
					["copper-chestplate"] = {1,1,1},
					["copper-leggings"] = {1,1,1},
					["copper-spear"] = {1,1,1},
					["copper-sword"] = {1,1,1},
					["spyglass"] = {1,1,1},
					["shears"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["bamboo-camp-map"] = {1,1,1},
					["cherry-grove-camp-map"] = {1,1,1},
					["birch-forest-camp-map"] = {1,1,1},
					["dappled-forest-camp-map"] = {1,1,1},
					["flower-forest-camp-map"] = {1,1,1},
					["pale-garden-camp-map"] = {1,1,1},
					["swamp-camp-map"] = {1,1,1},
					["windswept-forest-camp-map"] = {1,1,1},
				}
			},
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {4,6},
				items = {
					["arrow"] = {4,4,1},
					["empty-map"] = {1,1,1},
					["bone"] = {2,4,1},
					["cobweb"] = {1,1,1},
					["compass"] = {1,1,1},
					["empty-map-2"] = {1,2,1},
					["gunpowder"] = {2,4,1},
					["fishing-rod"] = {1,1,1},
					["flint-and-steel"] = {1,1,1},
					["glass-bottle"] = {1,4,1},
					["lead"] = {1,3,1},
					["leather"] = {1,4,1},
					["bundle"] = {1,1,1},
					["rabbit-hide"] = {1,4,1},
					["saddle"] = {1,2,1},
					["white-candle"] = {1,3,1},
				}
			},
			{
				rolls = {2,2},
				items = {
					["bow"] = {1,1,1},
					["bucket"] = {1,1,1},
					["copper-axe"] = {1,1,1},
					["copper-boots"] = {1,1,1},
					["copper-chestplate"] = {1,1,1},
					["copper-leggings"] = {1,1,1},
					["copper-spear"] = {1,1,1},
					["copper-sword"] = {1,1,1},
					["spyglass"] = {1,1,1},
					["shears"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["bamboo-camp-map"] = {1,1,1},
					["cherry-grove-camp-map"] = {1,1,1},
					["birch-forest-camp-map"] = {1,1,1},
					["dappled-forest-camp-map"] = {1,1,1},
					["flower-forest-camp-map"] = {1,1,1},
					["pale-garden-camp-map"] = {1,1,1},
					["swamp-camp-map"] = {1,1,1},
					["windswept-forest-camp-map"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["abandoned-camp-secret-chest"] = { -- abandoned_camp_secret_chest.json
		header = "[[Abandoned Camp]]",
		structure = "Abandoned Camp",
		container = "Secret chest",
		structID = "abandoned-camp",
		display = "abandoned camp secret chest",
		poolsJava = {
			{
				rolls = {2,2},
				items = {
					["diamond"] = {1,1,1},
					["potion-of-healing"] = {1,1,1},
					["potion-of-leaping"] = {1,1,1},
					["potion-of-night-vision"] = {1,1,1},
					["potion-of-swiftness"] = {1,1,1},
				}
			},
			{
				rolls = {4,6},
				items = {
					["empty-map"] = {1,1,1},
					["copper-ingot"] = {1,2,1},
					["gold-ingot"] = {1,2,1},
					["iron-ingot"] = {1,1,1},
				}
			},
			{
				rolls = {0,1},
				items = {
					["iron-axe"] = {1,1,1},
					["iron-boots"] = {1,1,1},
					["iron-leggings"] = {1,1,1},
					["iron-spear"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["buried-ancient-city-map"] = {1,1,1},
					["buried-mineshaft-map"] = {1,1,1},
					["buried-trial-chambers-map"] = {1,1,1},
					["desert-pyramid-map"] = {1,1,1},
					["jungle-pyramid-map"] = {1,1,1},
					["warm-ocean-ruins-map"] = {1,1,1},
					["woodland-mansion-map"] = {1,1,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {
			{
				rolls = {2,2},
				items = {
					["diamond"] = {1,1,1},
					["potion-of-healing"] = {1,1,1},
					["potion-of-leaping"] = {1,1,1},
					["potion-of-night-vision"] = {1,1,1},
					["potion-of-swiftness"] = {1,1,1},
				}
			},
			{
				rolls = {4,6},
				items = {
					["empty-map"] = {1,2,1},
					["copper-ingot"] = {1,4,1},
					["gold-ingot"] = {1,4,1},
					["iron-ingot"] = {1,4,1},
				}
			},
			{
				rolls = {0,1},
				items = {
					["iron-axe"] = {1,1,1},
					["iron-boots"] = {1,1,1},
					["iron-leggings"] = {1,1,1},
					["iron-spear"] = {1,1,1},
				}
			},
			{
				rolls = {1,1},
				items = {
					["buried-ancient-city-map"] = {1,1,1},
					["buried-mineshaft-map"] = {1,1,1},
					["buried-trial-chambers-map"] = {1,1,1},
					["desert-pyramid-map"] = {1,1,1},
					["jungle-pyramid-map"] = {1,1,1},
					["warm-ocean-ruins-map"] = {1,1,1},
					["woodland-mansion-map"] = {1,1,1},
				}
			}
		},
		poolsBedrockUpcoming = {}
	},
	["moon-resuply"] = { -- chests/moon_resuply.json (23w13a_or_b, this is really how it's spelled)
		april_fools = true,
		header = "Moon Mission Resupply Crate",
		superheader = "[[Lunar Base]]",
		structure = "Lunar Base",
		container = "",
		structID = "lunar-base",
		display = "moon resupply chest",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["bucket"] = {1,1,5},
					["water-bucket"] = {1,1,2},
					["lava-bucket"] = {1,1,2},
					["dirt"] = {5,10,20},
					["sand"] = {5,64,20},
					["end-stone"] = {1,3,10},
					["gravel"] = {5,64,10},
					["grass-block"] = {1,3,15},
					["snow-block"] = {1,3,10},
				}
			},
			{
				rolls = {1,2},
				items = {
					["iron-ingot"] = {1,4,30},
					["gold-ingot"] = {1,4,30},
					["oak-log"] = {1,4,10},
					["wheat-seeds"] = {1,4,5},
					["pumpkin-seeds"] = {1,1,5},
					["beetroot-seeds"] = {1,1,5},
					["carrot"] = {1,4,5},
					["potato"] = {1,4,5},
					["oak-sapling"] = {1,4,5},
					["spruce-sapling"] = {1,4,5},
					["birch-sapling"] = {1,4,5},
					["acacia-sapling"] = {1,4,5},
					["jungle-sapling"] = {1,4,5},
				}
			},
			{
				rolls = {0,1},
				items = {
					["gunpowder"] = {1,8,5},
					["bone-meal"] = {1,8,10},
					["nether-quartz"] = {1,8,10},
					["string"] = {1,8,10},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["moon-lab"] = { -- chests/moon_lab.json (23w13a_or_b)
		april_fools = true,
		chest_type = "shulker box",
		header = "Lunar Laboratory Equipment",
		superheader = "[[Lunar Base]]",
		structure = "Lunar Base",
		container = "",
		structID = "lunar-base",
		display = "moon lab shulker box",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["elytra"] = {1,1,2},
					["golden-apple"] = {1,1,2},
					["bucket"] = {1,1,10},
					["water-bucket"] = {1,1,5},
					["lava-bucket"] = {1,1,5},
					["spyglass"] = {1,1,2},
					["diamond-pickaxe"] = {1,1,2},
					["end-stone"] = {1,4,10},
					["budding-amethyst"] = {1,1,10},
					["brain-coral-block"] = {1,4,1},
					["bubble-coral-block"] = {1,4,1},
					["fire-coral-block"] = {1,4,1},
					["horn-coral-block"] = {1,4,1},
					["tube-coral-block"] = {1,4,1},
					["villager-spawn-egg"] = {1,1,5},
					["cow-spawn-egg"] = {1,1,5},
					["sheep-spawn-egg"] = {1,1,2},
					["turtle-egg"] = {1,1,2},
					["sniffer-egg"] = {1,1,1},
					["soul-sand"] = {1,4,10},
					["echo-shard"] = {1,4,2},
					["snow-block"] = {1,4,10},
					["sculk-catalyst"] = {1,1,2},
					["heart-of-the-sea"] = {1,1,1},
					["cobweb"] = {1,4,2},
					["powder-snow-bucket"] = {1,1,2},
					["pufferfish-bucket"] = {1,1,2},
					["bell"] = {1,1,1},
				}
			},
			{
				rolls = {1,3},
				items = {
					["iron-ingot"] = {1,4,30},
					["gold-ingot"] = {1,4,30},
					["wheat-seeds"] = {1,4,5},
					["pumpkin-seeds"] = {1,1,5},
					["melon-seeds"] = {1,1,5},
					["beetroot-seeds"] = {1,1,5},
					["carrot"] = {1,4,5},
					["potato"] = {1,4,5},
					["brown-mushroom"] = {1,1,5},
					["moss-block"] = {1,1,5},
					["warped-nylium"] = {1,1,1},
					["crimson-nylium"] = {1,1,1},
					["mycelium"] = {1,1,5},
					["pointed-dripstone"] = {1,1,1},
					["red-mushroom"] = {1,1,5},
					["chorus-flower"] = {1,1,5},
					["rose-bush"] = {1,1,1},
					["sunflower"] = {1,1,1},
					["lilac"] = {1,1,1},
					["peony"] = {1,1,1},
					["dandelion"] = {1,1,1},
					["poppy"] = {1,1,1},
					["blue-orchid"] = {1,1,1},
					["allium"] = {1,1,1},
					["azure-bluet"] = {1,1,1},
					["orange-tulip"] = {1,1,1},
					["pink-tulip"] = {1,1,1},
					["red-tulip"] = {1,1,1},
					["white-tulip"] = {1,1,1},
					["oxeye-daisy"] = {1,1,1},
					["cornflower"] = {1,1,1},
					["lily-of-the-valley"] = {1,1,1},
					["pink-petals"] = {1,1,1},
					["spore-blossom"] = {1,1,2},
					["kelp"] = {1,1,5},
					["big-dripleaf"] = {1,1,1},
					["fern"] = {1,1,5},
					["large-fern"] = {1,1,1},
					["glow-berries"] = {1,1,5},
					["sweet-berries"] = {1,1,5},
					["oak-sapling"] = {1,2,5},
					["spruce-sapling"] = {1,2,5},
					["dark-oak-sapling"] = {1,4,5},
					["birch-sapling"] = {1,2,5},
					["acacia-sapling"] = {1,2,5},
					["jungle-sapling"] = {1,4,5},
					["cherry-sapling"] = {1,2,5},
					["mangrove-propagule"] = {1,2,5},
					["cactus"] = {1,4,5},
					["sugar-cane"] = {2,4,5},
					["nether-wart"] = {2,4,5},
					["cocoa-beans"] = {2,4,5},
					["sea-pickle"] = {2,4,5},
					["bamboo"] = {2,4,5},
					["wither-skeleton-skull"] = {3,3,1},
					["ender-pearl"] = {2,4,2},
				}
			},
			{
				rolls = {1,3},
				items = {
					["air-block"] = {1,4,10},
					["packed-air"] = {1,1,2},
					["gunpowder"] = {2,32,5},
					["bone-block"] = {1,8,10},
					["slimeball"] = {8,32,10},
					["redstone"] = {8,32,10},
					["glowstone-dust"] = {1,8,5},
					["lapis-lazuli"] = {5,32,10},
					["gold-ingot"] = {5,16,10},
					["diamond"] = {1,1,5},
					["ancient-debris"] = {1,1,5},
					["nether-quartz"] = {5,32,10},
					["iron-ingot"] = {5,16,10},
					["blaze-rod"] = {2,4,10},
					["prismarine-shard"] = {2,16,10},
					["prismarine-crystals"] = {1,8,10},
					["nautilus-shell"] = {1,4,2},
					["spider-eye"] = {1,3,5},
					["ghast-tear"] = {1,3,2},
					["rabbit's-foot"] = {1,3,2},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["ruined-portatol"] = { -- chests/ruined_portatol.json (24w14potato)
		april_fools = true,
		header = "[[Ruined Portatol]]",
		structure = "Ruined Portatol",
		container = "",
		structID = "ruined portatol",
		display = "ruined portatol chest",
		poolsJava = {
			{
				rolls = {1,1},
				items = {
					["iron-hoe"] = {1,1,1}
				}
			},
			{
				rolls = {4,4},
				items = {
					["potato"] = {1,8,9},
					["poisonous-potato"] = {0,4,6}
				}
			},
			{
				rolls = {4,4},
				items = {
					["bone-meal"] = {0,8,1}
				}
			},
			{
				rolls = {4,8},
				items = {
					["obsidian"] = {1,2,40},
					["flint"] = {1,4,40},
					["iron-nugget"] = {9,18,40},
					["flint-and-steel"] = {1,1,40},
					["fire-charge"] = {1,1,40},
					["gold-nugget"] = {4,24,15},
					["random-enchanted-golden-sword"] = {1,1,15},
					["random-enchanted-golden-axe"] = {1,1,15},
					["random-enchanted-golden-hoe"] = {1,1,15},
					["poisonous-pota-toes"] = {1,1,15},
					["poisonous-potato-chestplate"] = {1,1,15},
					["random-enchanted-golden-helmet"] = {1,1,15},
					["random-enchanted-golden-leggings"] = {1,1,15},
					["glistering-melon-slice"] = {4,12,5},
					["golden-horse-armor"] = {1,1,5},
					["potato-pressure-plate"] = {1,1,5},
					["potato-fruit"] = {4,12,5},
					["clock"] = {1,1,5},
					["potato-oil"] = {2,8,5},
					["bell"] = {1,1,1},
					["enchanted-golden-apple"] = {1,1,1},
					["block-of-gold"] = {1,2,1},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["village-potato"] = { -- chests/village/village_potato_house.json (24w14potato)
		april_fools = true,
		header = "[[Potato Village]]",
		structure = "Potato Village",
		container = "House chest",
		structID = "potato-village",
		display = "potato village chest",
		poolsJava = {
			{
				rolls = {3,8},
				items = {
					["potato-oil"] = {1,3,1},
					["potato-flower"] = {1,1,2},
					["poisonous-potato-oil"] = {1,1,1},
					["potato"] = {1,7,10},
					["bread"] = {1,4,10},
					["potato-fruit"] = {1,5,10},
					["book"] = {1,1,1},
					["feather"] = {1,1,1},
					["poisonous-potato"] = {1,4,2},
					["potato-sprouts"] = {1,2,5},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	},
	["potato-monster-room"] = { -- chests/simple_dungeon_potato.json (24w14potato)
		april_fools = true,
		header = "Potato [[Monster Room]]",
		structure = "Monster Room",
		container = "Chest in the [[Poisonous Potato Dimension]]",
		structID = "monster-room",
		display = "monster room chest in the [[poisonous potato dimension]]",
		poolsJava = {
			{
				rolls = {1,3},
				items = {
					["saddle"] = {1,1,20},
					["golden-apple"] = {1,1,15},
					["enchanted-golden-apple"] = {1,1,2},
					["disc-otherside"] = {1,1,2},
					["disc-13"] = {1,1,15},
					["disc-cat"] = {1,1,15},
					["name-tag"] = {1,1,20},
					["golden-horse-armor"] = {1,1,10},
					["iron-horse-armor"] = {1,1,15},
					["diamond-horse-armor"] = {1,1,5},
					["enchanted-book-rnd"] = {1,1,10},
				}
			},
			{
				rolls = {1,4},
				items = {
					["iron-ingot"] = {1,4,10},
					["gold-ingot"] = {1,4,5},
					["potato-fruit"] = {1,1,20},
					["baked-potato"] = {1,4,20},
					["bucket"] = {1,1,10},
					["poisonous-potato-oil"] = {1,4,15},
					["coal"] = {1,4,15},
					["potato"] = {2,4,10},
					["poisonous-potato"] = {2,4,10},
					["potato-oil"] = {2,4,10},
				}
			},
			{
				rolls = {3,3},
				items = {
					["bone"] = {1,8,10},
					["bone-meal"] = {1,8,10},
					["rotten-flesh"] = {1,8,10},
					["string"] = {1,8,10},
				}
			}
		},
		poolsJavaUpcoming = {},
		poolsBedrock = {},
		poolsBedrockUpcoming = {}
	}
}