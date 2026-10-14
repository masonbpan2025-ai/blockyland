local sprite = require('Module:SpriteFile')

local q
local p = {

	calc_average_amount_this_item_per_pool = function(
			min_stacksize, max_stacksize,
			min_pool_rolls, max_pool_rolls,
			item_weight, pool_total_item_weight )

		local avg_stacksize = ( min_stacksize + max_stacksize ) / 2
		local avg_rolls = ( min_pool_rolls + max_pool_rolls ) / 2

		return avg_stacksize * avg_rolls * item_weight / pool_total_item_weight

	end,

	calc_chance_any_of_this_item_per_pool = function(
			min_pool_rolls, max_pool_rolls,
			item_weight, pool_total_item_weight )

		local inverse_result = 0 -- 1 - inverse_result = return value
		local inverse_item_weight = pool_total_item_weight - item_weight

		-- will be used for the division in the for loop to avoid the slightly
		-- less performant math.pow(). The divisor already includes the probability
		-- of picking any specific number of rolls.
		local cur_dividend = pool_total_item_weight
		local cur_divisor = pool_total_item_weight * (max_pool_rolls - min_pool_rolls + 1)

		for i = 0, max_pool_rolls do
			if i >= min_pool_rolls then
				inverse_result = inverse_result + cur_dividend / cur_divisor
			end
			cur_dividend = cur_dividend * inverse_item_weight -- simulate pow
			cur_divisor = cur_divisor * pool_total_item_weight -- simulate pow
		end

		return 1 - inverse_result

	end,

	java = "''[[Java Edition]]''", --mw.getCurrentFrame():preprocess("''[[Java Edition]]''") --if necessary
	['java-upcoming'] = "[[Java Edition 26.3]]",
	bedrock = "''[[Bedrock Edition]]''", --mw.getCurrentFrame():preprocess("''[[Bedrock Edition]]''")
	['bedrock-upcoming'] = "[[Bedrock Edition 26.50]]",

	-- These 'items' define which sprite, label and link to use in the table.
	-- Order within this 'items' list doesn't matter.

	items = require("Module:LootChest/items"),

	notes = {
		["abandoned-camp-map"]				  = "This map will not generate in the same biome it leads to. If a target cannot be found within a reasonable distance, the map is discarded.",
		["explorer-map"]                      = "If a target cannot be found within a reasonable distance, the map is discarded.",
		["enchant-randomly"]                  = "All enchantments are equally probable, ''including'' [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and any level of the enchantment is equally probable.",
		["enchant-randomly-efficiency"]       = "Enchanted with a random level of [[Efficiency]].",
		["enchant-randomly-mending"]          = "Enchanted with [[Mending]].",
		["enchant-unknown"]				      = "Enchanted with unknown enchantments",
		["enchant-randomly-quick-charge"]     = "Enchanted with a random level of [[Quick Charge]].",
		["enchant-randomly-soul-speed"]       = "Enchanted with a random level of [[Soul Speed]].",
		["enchant-randomly-swift-sneak"]      = "Enchanted with a random level of [[Swift Sneak]].",
		["enchant-randomly-unbreaking"]       = "Enchanted with a random level of [[Unbreaking]].",
		["enchant-randomly-trident"]          = "Enchanted with a random level of [[Mending]], [[Riptide]], [[Loyalty]], [[Channeling]], or [[Impaling]].",
		["enchant-randomly-trial-chambers"]   = "Enchanted with a random level of [[Sharpness]], [[Bane of Arthropods]], [[Efficiency]], [[Fortune]], [[Silk Touch]], or [[Feather Falling]].",
		["enchant-randomly-trial-chambers-2"] = "Enchanted with a random level of [[Knockback]], [[Punch]], [[Smite]], [[Looting]], or [[Multishot]].",
		["enchant-randomly-breach-density"]   = "Enchanted with a random level of [[Breach]], or [[Density]].",
		["enchant-randomly-wind-burst"]      = "Enchanted with level I of [[Wind Burst]].",
		["enchant-with-levels-0-10"]  = "Enchantment probabilities are the same as a level-0 to level-10 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-5-15"]  = "Enchantment probabilities are the same as a level-5 to level-15 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-5-20"]  = "Enchantment probabilities are the same as a level-5 to level-20 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-10-20"] = "Enchantment probabilities are the same as a level-10 to level-20 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-20-25"] = "Enchantment probabilities are the same as a level-20 to level-25 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-20-39"] = "Enchantment probabilities are the same as a level-20 to level-39 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that had no cap at level 30, and that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-30"]    = "Enchantment probabilities are the same as a level-30 enchantment on an [[enchanting table]] that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-30-50"] = "Enchantment probabilities are the same as a level-30 to level-50 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] that had no cap at level 30, and that was able to apply [[treasure enchantment]]s (except [[Soul Speed]], [[Swift Sneak]], and [[Wind Burst]]), and where the chance of multiple enchantments is not reduced.",
		["damaged-0.05-0.15"] = "The item has between 5% and 15% of its total durability.",
		["damaged-0.1-0.5"]   = "The item has between 10% and 50% of its total durability.",
		["damaged-0.1-0.9"]   = "The item has between 10% and 90% of its total durability.",
		["damaged-0.1-0.95"]  = "The item has between 10% and 95% of its total durability.",
		["damaged-0.15-0.45"] = "The item has between 15% and 45% of its total durability.",
		["damaged-0.15-0.8"]  = "The item has between 15% and 80% of its total durability.",
		["damaged-0.15-0.85"] = "The item has between 15% and 85% of its total durability.",
		["damaged-0.15-0.95"] = "The item has between 15% and 95% of its total durability.",
		["damaged-0.2-0.65"]  = "The item has between 20% and 65% of its total durability.",
		["damaged-0.4-0.9"]   = "The item has between 40% and 90% of its total durability.",
		["damaged-0.5-1.0"]   = "The item has between 50% and 100% of its total durability.",
		["damaged-0.8-1.0"]   = "The item has between 80% and 100% of its total durability.",
		["nothing"]           = "'Nothing' does not refer to the chance of an empty chest.  Instead, it refers to the chance that the random loot generator does not add any loot ''on a single roll''.",
		["suspicious-stew"]   = "The stew grants one of the following effects: {{in|java}}, 5–7 seconds of [[Blindness]], 7–10 seconds of [[Jump Boost]], 7-10 seconds of [[Night Vision]], 10–20 seconds of [[Poison]], 0.35-0.5 seconds of [[Saturation (effect)|Saturation]], or 6–8 seconds of [[Weakness]]; {{in|bedrock}}, 7 seconds of [[Blindness]], 5 seconds of [[Jump Boost]], 5 seconds of [[Night Vision]], 11 seconds of [[Poison]], 0.3 seconds of [[Saturation (effect)|Saturation]], or 7 seconds of [[Weakness]].",
		["suspicious-stew-2"] = "The stew grants one of the following effects: {{in|java}}, 5-7 seconds of [[Blindness]], or 7-10 seconds of [[Night Vision]]; {{in|bedrock}}, 7 seconds of [[Blindness]], or 5 seconds of [[Night Vision]].",
		["map"]               = "Named unknown map, but changed to map 0, the scale level is 1:4, Maps from the same stack are stackable, but maps that are not stacked are unstackable despite looking identical.",
		["regular-goat-horn"] = "Does not contain goat horn variants that drop from screaming goats.",
		["ominous-bottle-0-1"] = "Ominous bottle level between I and II",
		["ominous-bottle-2-4"] = "Ominous bottle level between III and V",

		-- Notes for bonus-barrel from Java Edition 3D Shareware v1.34

		["enchant-with-levels-5-10-no-treasure"] = "Enchantment probabilities are the same as a level-5 to level-10 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-10-20-no-treasure"] = "Enchantment probabilities are the same as a level-10 to level-20 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] where the chance of multiple enchantments is not reduced.",
		["enchant-with-levels-1-30-no-treasure"] = "Enchantment probabilities are the same as a level-1 to level-30 [[enchantment mechanics|enchantment]] would be on an [[enchanting table]] where the chance of multiple enchantments is not reduced.",
		["random-effect"] = "The item has a random [[effect]] applied, including empty (uncraftable), water, mundane, thick, or awkward.",
		["random-effect-arrow"] = "The arrow has an ineffective hidden [[effect]] applied, including empty, water, mundane, thick, or awkward. As it is not a tipped arrow, this has no effect except make it unstackable with arrows that do not match the hidden effect. The effect applied can be seen with {{cmd|data get entity @s}}.",
		["enchant-randomly-multishot"] = "Any level between 1 and 12 of [[Multishot]] is equally probable.",
	},

	-- <ref group='FN' name='enchant-randomly'>

	-- NOTE: order here doesn't matter.
	--		 * in the table, chests are sorted in alphabetical order
	--       * in the table, items are sorted by chance, then by avg#, then alphabetically.
	--       * If poolsJavaUpcoming is omitted, poolsJava is used. To omit a pool entirely, set it to {}.
	--       * If the loot is the same on both editions, use the same loot table twice.

	chests = require("Module:LootChest/chests"),

	-- these values are used:
	-- * in place of the keys, when the key is used as a parameter

	-- chest-param -> internally-valid-chest-param

	synonyms = {
		["desert"] = "desert-temple",
		["jungle"] = "jungle-temple",
		["nether"] = "nether-fortress",
		["nether-fortress"] = "nether-fortress",

		["armorer"]       = "village-armorer",
		["butcher"]       = "village-butcher",
		["cartographer"]  = "village-cartographer",
		["fisherman"]     = "village-fisherman",
		["fletcher"]      = "village-fletcher",
		["mason"]         = "village-mason",
		["shepherd"]      = "village-shepherd",
		["tannery"]       = "village-tannery",
		["temple"]        = "village-temple",
		["toolsmith"]     = "village-toolsmith",
		["weaponsmith"]   = "village-weaponsmith",

		["desert-house"]  = "village-desert-house",
		["plains-house"]  = "village-plains-house",
		["savanna-house"] = "village-savanna-house",
		["snowy-house"]   = "village-snowy-house",
		["taiga-house"]   = "village-taiga-house",

		["altar"] = "stronghold-altar",
		["storeroom"] = "stronghold-storeroom",
		["library"] = "stronghold-library",
		["outpost"] = "pillager-outpost",
		["mansion"] = "woodland-mansion",
		
		["trial-vault"] = "trial-chambers-reward",
		["trial-spawner"] = "trial-chambers-trial-spawner"
	},

	-- these descriptions are used:
	-- * in column <abbr> titles,
	-- * and above the table when only a single column-type is chosen

	columns = {
		["stacksize"] = 'The size of stacks (or for unstackable items, number) of this item on any given roll.',
		["weight"] = 'The weight of this item relative to other items in the pool.',
		["chance"] = 'The odds of finding any of this item in a single chest.',
		["items"] = 'The number of items expected per chest, averaged over a large number of chests.',
		["chests"] = 'The average number of chests the player should expect to search to find any of this item.'
	},

	current_frame = nil
}

p.base = function( ... )

	p.current_frame = mw.getCurrentFrame()

	local args = { ... }
	if args[1] == p.current_frame then
		args = require( 'Module:ProcessArgs' ).merge( true )
	else
		args = args[1]
	end

	-- transform args into usable list

	local chests, columns = q.massage_args( args )

	assert(#chests > 0, "no valid arguments")

	q.fill_in_chest_derivative_data( chests )

	-- construct an ordered list dictating the order of the rows

	local ordered_item_rows_java = {}
	local ordered_item_rows_java_upcoming = {}
	local ordered_item_rows_bedrock = {}
	local ordered_item_rows_bedrock_upcoming = {}

	local ret = {}

	local java_specified             = args.java                and args.java ~= '0';
	local java_upcoming_specified    = args['java-upcoming']    and args['java-upcoming'] ~= '0';
	local bedrock_specified          = args.bedrock             and args.bedrock ~= '0';
	local bedrock_upcoming_specified = args['bedrock-upcoming'] and args['bedrock-upcoming'] ~= '0';

	local any_specified = java_specified or java_upcoming_specified or bedrock_specified or bedrock_upcoming_specified

	if any_specified then

		if java_specified then
			ordered_item_rows_java = q.construct_ordered_item_rows( chests, 'Java' )
		end
		if java_upcoming_specified then
			ordered_item_rows_java_upcoming = q.construct_ordered_item_rows( chests, 'JavaUpcoming' )
		end
		if bedrock_specified then
			ordered_item_rows_bedrock = q.construct_ordered_item_rows( chests, 'Bedrock' )
		end
		if bedrock_upcoming_specified then
			ordered_item_rows_bedrock_upcoming = q.construct_ordered_item_rows( chests, 'BedrockUpcoming' )
		end

	else

		local java_excluded             = args.java                and args.java == '0';
		local java_upcoming_excluded    = args['java-upcoming']    and args['java-upcoming'] == '0';
		local bedrock_excluded          = args.bedrock             and args.bedrock == '0';
		local bedrock_upcoming_excluded = args['bedrock-upcoming'] and args['bedrock-upcoming'] == '0';

		if not java_excluded then
			ordered_item_rows_java = q.construct_ordered_item_rows( chests, 'Java' )
		end
		if not java_upcoming_excluded then
			ordered_item_rows_java_upcoming = q.construct_ordered_item_rows( chests, 'JavaUpcoming' )
		end
		if not bedrock_excluded then
			ordered_item_rows_bedrock = q.construct_ordered_item_rows( chests, 'Bedrock' )
		end
		if not bedrock_upcoming_excluded then
			ordered_item_rows_bedrock_upcoming = q.construct_ordered_item_rows( chests, 'BedrockUpcoming' )
		end

	end
	
	local java_bedrock_different = q.compare_tables(ordered_item_rows_java, ordered_item_rows_bedrock)
	local java_bedrock_upcoming_different = q.compare_tables(ordered_item_rows_java_upcoming, ordered_item_rows_bedrock_upcoming)
	local java_and_java_upcoming_different = q.compare_tables(ordered_item_rows_java, ordered_item_rows_java_upcoming)
	local bedrock_and_bedrock_upcoming_different = q.compare_tables(ordered_item_rows_bedrock, ordered_item_rows_bedrock_upcoming)
	
	if q.tablelength( ordered_item_rows_java ) > 0 and not java_bedrock_different then
		table.insert( ret, 'In ' .. p.java .. ' and ' .. p.bedrock .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_java, 'Java' ) ) )
	end

    if q.tablelength( ordered_item_rows_java ) > 0 and java_bedrock_different then
		table.insert( ret, 'In ' .. p.java .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_java, 'Java' ) ) )
    end

	if q.tablelength( ordered_item_rows_bedrock ) > 0 and java_bedrock_different then
		table.insert( ret, 'In ' .. p.bedrock .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_bedrock, 'Bedrock' ) ) )
	end

	if q.tablelength( ordered_item_rows_java_upcoming ) > 0 and java_and_java_upcoming_different and bedrock_and_bedrock_upcoming_different and not java_bedrock_upcoming_different then
		table.insert( ret, 'In ' .. p['java-upcoming'] .. ' and ' .. p['bedrock-upcoming'] .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_java_upcoming, 'JavaUpcoming') ) )
	end
		
	if q.tablelength( ordered_item_rows_java_upcoming ) > 0 and java_and_java_upcoming_different and (java_bedrock_upcoming_different or not bedrock_and_bedrock_upcoming_different) then
		table.insert( ret, 'In ' .. p['java-upcoming'] .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_java_upcoming, 'JavaUpcoming' ) ) )
	end
	
	if q.tablelength( ordered_item_rows_bedrock_upcoming ) > 0 and bedrock_and_bedrock_upcoming_different and (java_bedrock_upcoming_different or not java_and_java_upcoming_different) then
		table.insert( ret, 'In ' .. p['bedrock-upcoming'] .. ', ' .. q.lcfirst( q.print_table( chests, columns, ordered_item_rows_bedrock_upcoming, 'BedrockUpcoming' ) ) )
	end

	table.insert( ret, '<div class="reflist-upper-alpha">'..p.current_frame:extensionTag('references', '', { group = 'FN' })..'</div>' )

	return table.concat( ret, '\n\n' )
end

p.doc = function()

	local valid_args = {}
	for chest_name, val in pairs(p.chests) do
		local synonyms = {}
		for syn, orig in pairs(p.synonyms) do
			if orig == chest_name then
				table.insert( synonyms, "<code>" .. syn .. "</code>" )
			end
		end
		chest_name = "<code>" .. chest_name .. "</code>"
		if #synonyms > 0 then
			chest_name = chest_name .. " (alternative name"
			-- plurals are annoying
			if #synonyms > 1 then chest_name = chest_name .. "s" end
			chest_name = chest_name .. ": " .. table.concat( synonyms, ", " ) .. ")"
		end
		chest_name = "<li>" .. chest_name .. "</li>"
		table.insert( valid_args, chest_name )
	end
	table.sort( valid_args )
	return "<ul>" .. table.concat( valid_args, "" ) .. "</ul>"

end

p.doc2 = function()

	local valid_args = {}
	for column_name, val in pairs(p.columns) do
		table.insert( valid_args, column_name .. ": " .. val )
	end
	table.sort( valid_args )
	return table.concat( valid_args, ",\n<br>" )

end

p.base3 = function( ... )

	p.current_frame = mw.getCurrentFrame()

	local args = { ... }
	if args[1] == p.current_frame then
		args = require( 'Module:ProcessArgs' ).merge( true )
	else
		args = args[1]
	end

	local z = args[1]

	local allJavaChances = {}
	local allJavaUpcomingChances = {}
	local allBedrockChances = {}
	local allBedrockUpcomingChances = {}

	local rErr = ""

	local zT = {}
	if args[1] == "!!!ALL!!!" then
		for item_name, v in pairs( p.items ) do
			table.insert( zT, item_name )
			table.sort( zT )
		end
	else
		zT = mw.text.split( args[1], ',' )
	end

	for x, itemname in pairs( zT ) do

		if p.items[itemname] == nil then
			rErr = rErr .. "<span class='error'>Unknown item " .. itemname .. ".</span>\n"
		else

			local javaChances, javaUpcomingChances, bedrockChances, bedrockUpcomingChances

			if args.java and args.java ~= '0' then
				javaChances = q.single_item_find_values( itemname, 'poolsJava', nil, nil, args.april_fools )
				javaUpcomingChances = {}
				bedrockChances = {}
				bedrockUpcomingChances = {}
			else
				if args['java-upcoming'] and args['java-upcoming'] ~= '0' then
					javaChances = q.single_item_find_values( itemname, 'poolsJavaUpcoming', nil, nil, args.april_fools )
					javaUpcomingChances = {}
					bedrockChances = {}
					bedrockUpcomingChances = {}
				else
					if args.bedrock and args.bedrock ~= '0' then
						javaChances = q.single_item_find_values( itemname, 'poolsBedrock', nil, nil, args.april_fools )
						javaUpcomingChances = {}
						bedrockChances = {}
						bedrockUpcomingChances = {}
					else
						if args['bedrock-upcoming'] and args['bedrock-upcoming'] ~= '0' then
							javaChances = q.single_item_find_values( itemname, 'poolsBedrockUpcoming', nil, nil, args.april_fools )
							javaUpcomingChances = {}
							bedrockChances = {}
							bedrockUpcomingChances = {}
						else
							javaChances = q.single_item_find_values( itemname, 'poolsJava', nil, nil, args.april_fools )
							javaUpcomingChances = q.single_item_find_values( itemname, 'poolsJavaUpcoming', javaChances, nil, args.april_fools )
							bedrockChances = q.single_item_find_values( itemname, 'poolsBedrock', nil, nil, args.april_fools )
							bedrockUpcomingChances = q.single_item_find_values( itemname, 'poolsBedrockUpcoming', javaChances, bedrockChances, args.april_fools )
						end
					end
				end
			end

			local any_current = q.tablelength( javaChances ) > 0
			local any_changes_upcoming = q.tablelength( javaUpcomingChances ) > 0 and q.compare_tables( javaChances, javaUpcomingChances )
			local any_standard = any_current or any_changes_upcoming

			local any_bedrock_current = q.tablelength( bedrockChances ) > 0
			local any_bedrock_upcoming = q.tablelength( bedrockUpcomingChances ) > 0 and q.compare_tables( bedrockChances, bedrockUpcomingChances )
			local any_bedrock = any_bedrock_current or any_bedrock_upcoming

			if any_current then
				table.insert( allJavaChances, { name = itemname, chances = javaChances } )
			end
			if any_changes_upcoming then
				table.insert( allJavaUpcomingChances, { name = itemname, chances = javaUpcomingChances } )
			end
			if any_bedrock_current then
				table.insert( allBedrockChances, { name = itemname, chances = bedrockChances } )
			end
			if any_bedrock_upcoming then
				table.insert( allBedrockUpcomingChances, { name = itemname, chances = bedrockUpcomingChances } )
			end

		end
	end

	local java_bedrock_different = q.compare_tables(allJavaChances, allBedrockChances)
	local java_bedrock_upcoming_different = q.compare_tables(allJavaUpcomingChances, allBedrockUpcomingChances)

	local output = rErr .. '{| class="wikitable sortable mw-collapsible" \n! Item \n! Structure \n! Container \n! Quantity \n! Chance \n'
	if q.tablelength( allJavaChances ) > 0 and not java_bedrock_different then
		output = output .. '|-\n!colspan=5|' .. p['java'] .. ' and ' .. p['bedrock'] .. ' \n' .. p.print_base3_table( allJavaChances )
	end
	if q.tablelength( allJavaChances ) > 0 and java_bedrock_different then
		output = output .. '|-\n!colspan=5|' .. p['java'] .. ' \n' .. p.print_base3_table( allJavaChances )
	end
	if q.tablelength( allBedrockChances ) > 0 and java_bedrock_different then
		output = output .. '|-\n!colspan=5|' .. p.bedrock .. ' \n' .. p.print_base3_table( allBedrockChances )
	end
	if q.tablelength( allJavaUpcomingChances ) > 0 and not java_bedrock_upcoming_different then
		output = output .. '|-\n!colspan=5|' .. p['java-upcoming'] .. ' and ' .. p['bedrock-upcoming'] .. ' \n' .. p.print_base3_table( allJavaUpcomingChances )
	end
	if q.tablelength( allJavaUpcomingChances ) > 0 and java_bedrock_upcoming_different then
		output = output .. '|-\n!colspan=5|' .. p['java-upcoming'] .. ' \n' .. p.print_base3_table( allJavaUpcomingChances )
	end
	if q.tablelength( allBedrockUpcomingChances ) > 0 and java_bedrock_upcoming_different then
		output = output .. '|-\n!colspan=5|' .. p['bedrock-upcoming'] .. ' \n' .. p.print_base3_table( allBedrockUpcomingChances )
	end
	output = output .. '|}' .. p.current_frame:extensionTag( 'references', "", { group="FN" } )

	return output
end

p.print_base3_table = function ( allChances )
	local html = ""
	for k, v in pairs( allChances ) do
		html = html .. p.base3_sub(v.name, v.chances)
	end
	return html
end

p.base3_sub = function( itemname, chances )
	local html = {}
	local item_display_name = ''
	local output = ""
	local lang = mw.getContentLanguage()

	if p.items[itemname].title ~= nil then
		item_display_name = p.items[itemname].title
	else
		item_display_name = q.titlecase( string.gsub( itemname, '-', ' ' ) )
	end

	local objectList = {}
	local ns = q.tablelength( chances )
	local s = 0
	local m = 0

	local rn = 0

	for stacksize, chest_details in pairs( chances ) do
		s = s + 1

		local nc = q.tablelength( chest_details )
		local c = 0
		for k, chest in pairs( chest_details ) do
			c = c + 1
			rn = rn + 1
            local containerText = p.chests[chest.chest_name].container
            if string.len(containerText) == 0 then
                containerText = 'Chest'
            end
			local r = ""
			local json = {
				['item'] = item_display_name,
				['structure'] = p.chests[chest.chest_name].structure,
				['container'] = containerText,
				['stacksize'] = stacksize,
				['chance'] = chest.chance
			}
			json = require('Module:NiceJSON').wrap(json, 'pre', 'chest-json')

			r = r .. '|' .. string.gsub( containerText, ' ', '&nbsp;' ) .. '\n|' .. stacksize .. '\n|' .. lang:formatNum( math.floor( chest.chance*1000 + 0.5 ) /10 ) .. '%' .. json .. '\n'
			if ns ~= s or nc ~= c then
				r = r
			end

			table.insert( objectList , { p.chests[chest.chest_name].structID , p.chests[chest.chest_name].structure, r } )

		end
		m = m + nc
	end
	table.sort( objectList, function(a,b) return a[1] < b[1] end )
	local struct = ""
	local t = ""
	local nt = 1
	local ntt = 0
	for v, w  in pairs( objectList ) do
		ntt = ntt + 1
		if w[1] ~= struct then
			if t ~= "" then
				output = output .. "|rowspan=" .. nt .. t
			end
			t = "|'''" .. sprite.link({name='EnvSprite', w[2],  id = w[1] }) .. "'''\n" .. w[3]
			struct = w[1]
			nt = 1
		else
			t = t .. w[3]
			nt = nt + 1
		end
		if ntt == m then
			output = output .. "|rowspan=" .. nt .. t
		else
			t = t .. '|-' .. '\n'
		end
	end

	return "|-\n| rowspan=" .. m .. "|'''" .. p.getItem(itemname, item_display_name) .. "'''\n" .. output

end

p.getItem = function( itemname, item_display_name )
	local s = ""
	local k = item_display_name
	local link = item_display_name
	local m = itemname

	if p.items[itemname].title ~= nil then
		k = p.items[itemname].title
	end
	if p.items[itemname].link ~= nil then
		link = p.items[itemname].link
	end
	if p.items[itemname].id ~= nil then
		m = p.items[itemname].id
	end

	if p.items[itemname][1] == "item" then
		s = sprite.link({name='ItemSprite', link, k ,id=m})
		--s = p.current_frame:expandTemplate{ title = 'ItemLink', args = { link , k , id = m } }
	elseif p.items[itemname][1] == "block" then
		s = sprite.link({name='BlockSprite', link, k ,id=m})
		--s = p.current_frame:expandTemplate{ title = 'BlockLink', args = { link , k , id = m } }
	end

	if p.items[itemname].note and p.notes[p.items[itemname].note] then
		s = s .. p.current_frame:extensionTag( 'ref', p.notes[p.items[itemname].note], { group='FN', name=p.items[itemname].note } )
	end

	if p.items[itemname].note1 and p.notes[p.items[itemname].note1] then
		if p.items[itemname].note == nil or p.notes[p.items[itemname].note] == nil or p.items[itemname].note ~= p.items[itemname].note1 then
			s = s .. p.current_frame:extensionTag( 'ref', p.notes[p.items[itemname].note1], { group='FN', name=p.items[itemname].note1 } )
		end
	end

	return s

end








q = {

	tablelength = function(T)
		local count = 0
		for _ in pairs(T) do count = count + 1 end
		return count
	end,

	deepcopy = function(orig)
	    local orig_type = type(orig)
	    local copy
	    if orig_type == 'table' then
	        copy = {}
	        for orig_key, orig_value in next, orig, nil do
	            copy[q.deepcopy(orig_key)] = q.deepcopy(orig_value)
	        end
	        setmetatable(copy, q.deepcopy(getmetatable(orig)))
	    else -- number, string, boolean, etc
	        copy = orig
	    end
	    return copy
	end,
	
	frac = function(x,y)
		return '<sup>'..x..'</sup>&frasl;<sub>'..y..'</sub>'
	end,

	single_item_find_values = function( itemname, poolsKey, exclusions_param, other_exclusions_param, allow_april_fools )

		local chances = {}

		local exclusions = q.deepcopy(exclusions_param or {})
		local other_exclusions = q.deepcopy(other_exclusions_param or {})

		for stacksize, other_exclusion_list in pairs(other_exclusions) do
			if exclusions[stacksize] == nil then
				exclusions[stacksize] = {}
			end
			for _, other_exclusion in pairs(other_exclusion_list) do
				local already_in_here = false
				for _, exclusion in pairs(exclusions[stacksize]) do
					if exclusion["chest_name"] == other_exclusion["chest_name"] and exclusion["chance"] == other_exclusion["chance"] then
						already_in_here = true
						break
					end
				end
				if not already_in_here then
					table.insert( exclusions[stacksize], other_exclusion )
				end
			end
		end

		for chest_name, chest in pairs( p.chests ) do
			if allow_april_fools or not chest.april_fools then
				local poolchances = {}
				for k, pool in pairs( chest[poolsKey] or chest.poolsJava or {} ) do
					local poolitem = pool.items[itemname]
					if poolitem ~= nil then
	
						local stacksize = poolitem[1]
						if poolitem[1] ~= poolitem[2] then
							stacksize = stacksize .. "–" .. poolitem[2]
						end
	
						local itemweight = poolitem[3]
	
						local pool_total_item_weight = 0
						for itemname, item in pairs(pool.items) do
							pool_total_item_weight = pool_total_item_weight + item[3]
						end
	
						local chance = p.calc_chance_any_of_this_item_per_pool(
							pool.rolls[1], pool.rolls[2],
							itemweight, pool_total_item_weight )
	
						if poolchances[stacksize] == nil then
							poolchances[stacksize] = chance
						else
							poolchances[stacksize] = poolchances[stacksize] + (1 - poolchances[stacksize]) * chance
						end
					end
				end
				for stacksize, chance in pairs( poolchances ) do
					local excluded = false
					for _, exclusion in pairs( exclusions[stacksize] or {} ) do
						if exclusion["chest_name"] == chest_name and exclusion["chance"] == chance then
							excluded = true
							break
						end
					end
					if not excluded then
						if chances[stacksize] == nil then
							chances[stacksize] = {}
						end
						table.insert( chances[stacksize], { ["chance"]=chance, ["chest_name"]=chest_name, ["chest_type"]=( chest.chest_type or "chest" ) } )
					end
				end
			end
		end

		return chances

	end,

	massage_args = function( args )

		-- find what columns to put

		local columns = {}

		for k, _arg in pairs(args) do
			if p.columns[_arg] ~= nil then
				columns[_arg] = true
			end
		end

		if q.tablelength(columns) == 0 then
			for column_name, v in pairs(p.columns) do
				columns[column_name] = true
			end
		end

		-- find what chests to show

		local chests = {}

		for k, _arg in pairs(args) do
			if p.chests[_arg] ~= nil then
				table.insert( chests, _arg )
			elseif p.synonyms[_arg] ~= nil then
				table.insert( chests, p.synonyms[_arg] )
			end
		end

		if q.tablelength(chests) == 0 then
            for chest, k in pairs(p.chests) do
                table.insert( chests, chest)
            end
        end

		table.sort( chests )

		return chests, columns

	end,

	sort_items = function( e1, e2 )

		if e1.chanceany ~= e2.chanceany then return ( e1.chanceany > e2.chanceany ) end
		if e1.avgamount ~= e2.avgamount then return ( e1.avgamount > e2.avgamount ) end

		if e1.material == nil then

			e1.material = 0
			if string.find( e1.itemname, "leather" ) ~= nil then e1.material = 1 end
			if string.find( e1.itemname, "iron" ) ~= nil then e1.material = 2 end
			if string.find( e1.itemname, "gold" ) ~= nil then e1.material = 3 end
			if string.find( e1.itemname, "diamond" ) ~= nil then e1.material = 4 end
			if string.find( e1.itemname, "netherite" ) ~= nil then e1.material = 5 end
			e1.armor = 0
			if string.find( e1.itemname, "helmet" ) ~= nil or string.find( e1.itemname, "cap" ) ~= nil then e1.armor = 1 end
			if string.find( e1.itemname, "chestplate" ) ~= nil or string.find( e1.itemname, "tunic" ) ~= nil then e1.armor = 2 end
			if string.find( e1.itemname, "leggings" ) ~= nil or string.find( e1.itemname, "pants" ) ~= nil then e1.armor = 3 end
			if string.find( e1.itemname, "boots" ) ~= nil then e1.armor = 4 end

		end

		if e2.material == nil then

			e2.material = 0
			if string.find( e2.itemname, "leather" ) ~= nil then e2.material = 1 end
			if string.find( e2.itemname, "iron" ) ~= nil then e2.material = 2 end
			if string.find( e2.itemname, "gold" ) ~= nil then e2.material = 3 end
			if string.find( e2.itemname, "diamond" ) ~= nil then e2.material = 4 end
			e2.armor = 0
			if string.find( e2.itemname, "helmet" ) ~= nil or string.find( e2.itemname, "cap" ) ~= nil then e2.armor = 1 end
			if string.find( e2.itemname, "chestplate" ) ~= nil or string.find( e2.itemname, "tunic" ) ~= nil then e2.armor = 2 end
			if string.find( e2.itemname, "leggings" ) ~= nil or string.find( e2.itemname, "pants" ) ~= nil then e2.armor = 3 end
			if string.find( e2.itemname, "boots" ) ~= nil then e2.armor = 4 end

		end

		if e1.material ~= e2.material then return ( e1.material < e2.material ) end
		if e1.armor ~= e2.armor then return ( e1.armor < e2.armor ) end

		return ( e1.itemname < e2.itemname )

	end,

	fill_in_chest_derivative_data = function( chest_names )

		for k, chest_name in pairs(chest_names) do
			local chest = p.chests[chest_name]
			if chest == nil then break end

			chest.allRollsJava = {}
			chest.itemDataJava = {}
			for k, pool in pairs( chest.poolsJava or {} ) do
				table.insert( chest.allRollsJava, ( pool.rolls[1] == pool.rolls[2] and pool.rolls[1] or pool.rolls[1]..'–'..pool.rolls[2] ) )

				local total_weight = 0
				for itemname, item in pairs(pool.items) do
					total_weight = total_weight + item[3]
				end
				pool.totalweight = total_weight

				q.fill_in_chest_item_details( chest.itemDataJava, pool, #chest.allRollsJava )
			end

			chest.allRollsJavaUpcoming = {}
			chest.itemDataJavaUpcoming = {}
			for k, pool in pairs( chest.poolsJavaUpcoming or chest.poolsJava or {} ) do
				table.insert( chest.allRollsJavaUpcoming, ( pool.rolls[1] == pool.rolls[2] and pool.rolls[1] or pool.rolls[1]..'–'..pool.rolls[2] ) )

				local total_weight = 0
				for itemname, item in pairs(pool.items) do
					total_weight = total_weight + item[3]
				end
				pool.totalweight = total_weight

				q.fill_in_chest_item_details( chest.itemDataJavaUpcoming, pool, #chest.allRollsJavaUpcoming )
			end

			chest.allRollsBedrock = {}
			chest.itemDataBedrock = {}
			for k, pool in pairs( chest.poolsBedrock or chest.poolsJava or {} ) do
				table.insert( chest.allRollsBedrock, ( pool.rolls[1] == pool.rolls[2] and pool.rolls[1] or pool.rolls[1]..'–'..pool.rolls[2] ) )

				local total_weight = 0
				for itemname, item in pairs(pool.items) do
					total_weight = total_weight + item[3]
				end
				pool.totalweight = total_weight

				q.fill_in_chest_item_details( chest.itemDataBedrock, pool, #chest.allRollsBedrock )
			end

			chest.allRollsBedrockUpcoming = {}
			chest.itemDataBedrockUpcoming = {}
			for k, pool in pairs( chest.poolsBedrockUpcoming or chest.poolsJava or {} ) do
				table.insert( chest.allRollsBedrockUpcoming, ( pool.rolls[1] == pool.rolls[2] and pool.rolls[1] or pool.rolls[1]..'–'..pool.rolls[2] ) )

				local total_weight = 0
				for itemname, item in pairs(pool.items) do
					total_weight = total_weight + item[3]
				end
				pool.totalweight = total_weight

				q.fill_in_chest_item_details( chest.itemDataBedrockUpcoming, pool, #chest.allRollsBedrockUpcoming )
			end
		end
	end,

	fill_in_chest_item_details = function( data, pool, ct )
		for item_name, item in pairs(pool.items) do
			if p.items[item_name] then
				local min_stacksize = item[1]
				local max_stacksize = item[2]
				local min_pool_rolls = pool.rolls[1]
				local max_pool_rolls = pool.rolls[2]
				local item_weight = item[3]

				if data[item_name] == nil then
					data[item_name] = {
						avgamount = 0,
						chanceany = 0,
						itemname = item_name,
						sortsize = {},
						sortweight = {},
						sizes = {},
						weights = {},
					}
					for i = 1, ct-1 do
						data[item_name].sortsize[i] = 0
						data[item_name].sortweight[i] = 0
						data[item_name].sizes[i] = '—'
						data[item_name].weights[i] = '—'
					end
				end

				data[item_name].avgamount = data[item_name].avgamount + p.calc_average_amount_this_item_per_pool(
					min_stacksize, max_stacksize,
					min_pool_rolls, max_pool_rolls,
					item_weight, pool.totalweight )

				data[item_name].chanceany = data[item_name].chanceany + (1 - data[item_name].chanceany) * p.calc_chance_any_of_this_item_per_pool(
					min_pool_rolls, max_pool_rolls,
					item_weight, pool.totalweight )

				data[item_name].sortsize[ct] = ( min_stacksize + max_stacksize ) / 2
				data[item_name].sortweight[ct] = item_weight;
				data[item_name].sizes[ct] = ( min_stacksize == max_stacksize and min_stacksize or min_stacksize .. '–' .. max_stacksize )
				data[item_name].weights[ct] = q.frac(item_weight, pool.totalweight) --p.current_frame:expandTemplate{ title = 'frac', args = { item_weight, pool.totalweight } }
			end
		end

		for item_name, d in pairs(data) do
			if not d.sizes[ct] then
				d.sortsize[ct] = 0
				d.sortweight[ct] = 0
				d.sizes[ct] = '—'
				d.weights[ct] = '—'
			end
		end
	end,

	construct_ordered_items_from_first_chest = function( chest_names, suffix )
		local items_from_first_table = {}
		local item_chests = {}
		local item_names_ordered = {}
		for item_name, item in pairs( p.chests[chest_names[1]]['itemData'..suffix] ) do
			table.insert( items_from_first_table, item )
		end

		table.sort( items_from_first_table, q.sort_items )

		for k, item in pairs( items_from_first_table ) do
			table.insert( item_names_ordered, item.itemname )
			item_chests[item.itemname] = true
		end

		return item_names_ordered, item_chests
	end,

	get_ordered_items_from_other_chests = function( chest_names, item_chests, suffix )
		local items_not_from_first_table = {}

		for chest_idx = 2, #chest_names do
			for item_name, item in pairs( p.chests[chest_names[chest_idx]]['itemData'..suffix] ) do
				if item_chests[item_name] == nil then
					p.items[item_name].itemname = item_name
					table.insert( items_not_from_first_table, p.chests[chest_names[chest_idx]]['itemData'..suffix][item_name] )
					item_chests[item_name] = true
				end
			end
		end

		table.sort( items_not_from_first_table, q.sort_items )

		return items_not_from_first_table
	end,

	add_other_items_to_first_list = function( chest_names, item_names_ordered, item_chests, items_not_from_first_table )
		for k, item in pairs( items_not_from_first_table ) do
			table.insert( item_names_ordered, item.itemname )
		end

		return item_names_ordered
	end,

	set_up_ordered_item_rows = function( chest_names, item_names_ordered, suffix )
		for k, itemname in pairs(item_names_ordered) do
			item_names_ordered[k] = {itemname}
			for chest_idx = 1, #chest_names do
				if suffix == 'JavaUpcoming' or p.chests[chest_names[chest_idx]]['pools'..suffix] ~= nil then
					local item_data = p.chests[chest_names[chest_idx]]['itemData'..suffix][itemname]
					if item_data == nil then
						table.insert( item_names_ordered[k], false )
					else
						table.insert( item_names_ordered[k], item_data )
					end
				end
			end
		end

		return item_names_ordered
	end,

	construct_ordered_item_rows = function( chest_names, suffix )
		-- for the first chest, sort its by chance desc, then by avg amount desc, then alphabetically asc
		local item_names_ordered, item_chests = q.construct_ordered_items_from_first_chest( chest_names, suffix )

		if #chest_names > 1 then
			-- after that, sort all the remaining items in list order
			local items_not_from_first_table = q.get_ordered_items_from_other_chests( chest_names, item_chests, suffix )
			item_names_ordered = q.add_other_items_to_first_list( chest_names, item_names_ordered, item_chests, items_not_from_first_table )
		end

		-- set up item_names_ordered so that each is a row, representing chest values
		item_names_ordered = q.set_up_ordered_item_rows( chest_names, item_names_ordered, suffix )

		return item_names_ordered
	end,

	print_table = function( chest_names, columns, ordered_item_rows, suffix )
		local html = {}
		local json = {
			gameVersion = suffix,
			chestNames = chest_names,
			loot = {}
		}
		for _,chestname in ipairs(chest_names) do
			json.loot[chestname] = p.chests[chestname]
		end

		local use_roll_row = false
		local use_superheader = false
		local superheader_sizes = {}
		for i = 1, #chest_names do
			local sh = p.chests[chest_names[i]].superheader
			if sh ~= nil then
				if superheader_sizes[sh] == nil then
					superheader_sizes[sh] = 0
				end
				superheader_sizes[sh] = superheader_sizes[sh] + 1

				if #chest_names > 1 then
					use_superheader = true
				end
			end
			local allRolls = p.chests[chest_names[i]]['allRolls'..suffix]
			if #allRolls > 1 then
				use_roll_row = true
			end
		end
		if columns['stacksize'] == nil and columns['weight'] == nil then
			use_roll_row = false
		end

		local rowspan = ( #chest_names > 1 and 1 or 0 ) + ( use_superheader and 1 or 0 ) + 1
		local hide_col_description = rowspan > 1 and q.tablelength(columns) == 1
		if use_roll_row then
			rowspan = rowspan + 1
		end

		if q.tablelength(columns) == 1 then
			for column_name, v in pairs(columns) do
				table.insert( html, "Values represent " )
				table.insert( html, p.columns[column_name]:lower() )
				table.insert( html, "\n" )
			end
		end

		if #chest_names == 1 then

			if q.tablelength(columns) == 1 then
				table.insert( html, "<br>" )
			end

			local chest_name = chest_names[1]
			local allRolls = p.chests[chest_name]['allRolls'..suffix]

			local display_name = p.chests[chest_name].display

			chest_name = chest_name:gsub( "-", " " )

			table.insert( html, "Each " )
			table.insert( html, display_name or chest_name .. " chest" )
			table.insert( html, " contains " )
			if #allRolls == 1 then
				table.insert( html, allRolls[1] )
				if allRolls[1] == 1 then
					table.insert( html, " item stack, " )
				else
					table.insert( html, " item stacks, " )
				end			else
				table.insert( html, ' items drawn from ' )
				table.insert( html, #allRolls )
				table.insert( html, ' pools, ' )
			end
			table.insert( html, " with the following distribution: \n" )
		end

		table.insert( html, '<div style="overflow:auto">\n' )
		table.insert( html, '<table class="wikitable sortable mw-collapsible jquery-tablesorter">\n' )
		table.insert( html, "<tr>\n" )
		table.insert( html, "<th rowspan=" )
		table.insert( html, ( rowspan - ( hide_col_description and 1 or 0 ) ) )
		table.insert( html, "> Item </th>\n" )

		local superheader_cols_used = {}

		if #chest_names > 1 then
			local row1, row2 = {}, {}

			for i = 1, #chest_names do

				if suffix == 'JavaUpcoming' or p.chests[chest_names[i]]['pools'..suffix] ~= nil then
					local allRolls = p.chests[chest_names[i]]['allRolls'..suffix]
					local colspan = q.tablelength(columns)
					local allRollsSpan = #allRolls == 0 and 1 or #allRolls
					if columns['stacksize'] ~= nil then
						colspan = colspan - 1 + allRollsSpan
					end
					if columns['weight'] ~= nil then
						colspan = colspan - 1 + allRollsSpan
					end
					local row = row1

					rowspan = 1
					if use_superheader then
						sh = p.chests[chest_names[i]].superheader
						if sh ~= nil then
							if superheader_cols_used[sh] == nil then
								table.insert( row, "<th colspan=" )
								table.insert( row, ( colspan * superheader_sizes[sh] ) )
								table.insert( row, ">" )
								table.insert( row, sh )
								table.insert( row, "</th>\n" )
								superheader_cols_used[sh] = 0
							end
							row = row2
						else
							rowspan = rowspan + 1
						end
					end
					if use_roll_row and hide_col_description and #allRolls < 2 then
						rowspan = rowspan + 1
					end

					table.insert( row, "<th colspan=" )
					table.insert( row, colspan )
					if rowspan > 1 then
						table.insert( row, " rowspan=" )
						table.insert( row, rowspan )
					end
					table.insert( row, ">" )
					table.insert( row, p.chests[ chest_names[i] ].header )
					if #allRolls > 0 then
						table.insert( row, ' <br><span style="font-weight:normal; font-style:italic; font-size:11px;">(' )
						if #allRolls == 1 then
							table.insert( row, allRolls[1] )
						else
							local s = ( #allRolls > 2 and ', ' or ' ' )
							for i = 1, #allRolls-1 do
								table.insert( row, allRolls[i] )
								table.insert( row, s )
							end
							table.insert( row, 'and ' )
							table.insert( row, allRolls[#allRolls] )
						end
						table.insert( row, ' stacks)</span>' )
					end
					table.insert( row, "</th>\n" )
				end
			end

			table.insert( html, table.concat( row1 ) )
			table.insert( html, "</tr><tr>\n" )
			if #row2 then
				table.insert( html, table.concat( row2 ) )
				table.insert( html, "</tr><tr>\n" )
			end
		end

		if not hide_col_description then
			local headersort_th_open
			if use_roll_row then
				headersort_th_open = "<th rowspan='2' class='headersort' role='columnheader button' data-sort-type='number'> <abbr title='"
			else
				headersort_th_open = "<th class='headersort' role='columnheader button' data-sort-type='number'> <abbr title='"
			end
			for i = 1, #chest_names do
				if suffix == 'JavaUpcoming' or p.chests[chest_names[i]]['pools'..suffix] ~= nil then
					local allRolls = p.chests[chest_names[i]]['allRolls'..suffix]
					local allRollsSpan = #allRolls == 0 and 1 or #allRolls
					local headersort_th_colspan_open
					if #allRolls > 1 then
						headersort_th_colspan_open = "<th colspan='" .. allRollsSpan .. "' role='columnheader'> <abbr title='"
					else
						headersort_th_colspan_open = headersort_th_open
					end

					if columns['stacksize'] ~= nil then
						table.insert( html, headersort_th_colspan_open )
						table.insert( html, p.columns['stacksize'] )
						table.insert( html, "'> Stack Size </abbr>")
						table.insert( html, "</th>\n" )
					end
					if columns['weight'] ~= nil then
						table.insert( html, headersort_th_colspan_open )
						table.insert( html, p.columns['weight'] )
						table.insert( html, "'> Weight </abbr>")
						table.insert( html, "</th>\n" )
					end
					if columns['chance'] ~= nil then
						table.insert( html, headersort_th_open )
						table.insert( html, p.columns['chance'] )
						table.insert( html, "'> Chance </abbr>")
						table.insert( html, "</th>\n" )
					end
					local arg1 = table.concat(chest_names)
					local chest_type = p.chests[chest_names[i]].chest_type or "chest"
					if columns['items'] ~= nil then
						table.insert( html, headersort_th_open )
						table.insert( html, p.columns['items'] )
						if chest_type == "suspicious block" then
							table.insert( html, "'> Avg.<br>per block </abbr>")
						elseif chest_type == "decorated pot" then
							table.insert( html, "'> Avg.<br>per pot </abbr>")
						elseif chest_type == "dispenser" then
							table.insert( html, "'> Avg.<br>per dispenser </abbr>")
						elseif chest_type == "barrel" then
							table.insert( html, "'> Avg.<br>per barrel </abbr>")
						elseif chest_type == "shulker box" then
							table.insert( html, "'> Avg.<br>per shulker box </abbr>")
						elseif chest_type == "trial spawner" then
							table.insert( html, "'> Avg.<br>per spawner </abbr>")
						elseif chest_type == "vault" then
							table.insert( html, "'> Avg.<br>per vault </abbr>")
						elseif chest_type == "reward container" then
							table.insert( html, "'> Avg.<br>per container </abbr>")
						else
							table.insert( html, "'> Avg.<br>per chest </abbr>")
						end
						table.insert( html, "</th>\n" )
					end
					if columns['chests'] ~= nil then
						table.insert( html, headersort_th_open )
						table.insert( html, p.columns['chests'] )
						if chest_type == "suspicious block" then
							table.insert( html, "'> Avg. # blocks<br>to brush </abbr>")
						elseif chest_type == "decorated pot" then
							table.insert( html, "'> Avg. # pots<br>to break </abbr>")
						elseif chest_type == "dispenser" then
							table.insert( html, "'> Avg. # dispensers<br>to open </abbr>")
						elseif chest_type == "barrel" then
							table.insert( html, "'> Avg. # barrels<br>to open </abbr>")
						elseif chest_type == "shulker box" then
							table.insert( html, "'> Avg. # shulker boxes<br>to open </abbr>")
						elseif chest_type == "trial spawner" then
							table.insert( html, "'> Avg. # spawners<br>to defeat </abbr>")
						elseif chest_type == "vault" then
							table.insert( html, "'> Avg. # vaults<br>to open </abbr>")
						elseif chest_type == "reward container" then
							table.insert( html, "'> Avg. # containers<br>to loot </abbr>")
						else
							table.insert( html, "'> Avg. # chests<br>to search </abbr>")
						end
						table.insert( html, "</th>\n" )
					end
				end
			end
			table.insert( html, "</tr><tr>\n" )
		end

		if use_roll_row then
			local rowcols = ( columns['stacksize'] ~= nil and 1 or 0 ) + ( columns['weight'] ~= nil and 1 or 0 )
			for i = 1, #chest_names do
				local allRolls = p.chests[chest_names[i]]['allRolls'..suffix]
				if #allRolls > 1 then
					for j = 1, rowcols do
						for k = 1, #allRolls do
							table.insert( html, "<th class='headersort' role='columnheader button' data-sort-type='number' style='font-weight:normal'><abbr title='The chest draws " )
							table.insert( html, allRolls[k] )
							table.insert( html, " stack(s) randomly from this pool.'>" )
							table.insert( html, allRolls[k] )
							table.insert( html, "×</abbr></th>\n" )
						end
					end
				end
			end
			table.insert( html, "</tr><tr>\n" )
		end

		for i = 1, #ordered_item_rows do
			if type( ordered_item_rows[i] ) == "table" then
				for j = 1, #ordered_item_rows[i] do

					local chest_item = ordered_item_rows[i][j]

					if type( chest_item ) == "table" then

						local avg_amount = string.format("%.3f", chest_item.avgamount)
						local chance_any = string.format("%.1f", chest_item.chanceany*100) .. "%"
						local num_chests = string.format("%.1f", 1/chest_item.chanceany)

						table.insert( html, "\n" )
						if columns['stacksize'] ~= nil then
							for k = 1, #chest_item.sizes do
								table.insert( html, "<td style='text-align:center;' data-sort-value='" )
								table.insert( html, ( chest_item.sortsize[k] == 0 and "9e99" or chest_item.sortsize[k] ) )
								table.insert( html, "'>" )
								table.insert( html, chest_item.sizes[k] )
								table.insert( html, "</td>" )
							end
						end
						if columns['weight'] ~= nil then
							for k = 1, #chest_item.sizes do
								table.insert( html, "<td style='text-align:center;' data-sort-value='" )
								table.insert( html, ( chest_item.sortweight[k] == 0 and "9e99" or chest_item.sortweight[k] ) )
								table.insert( html, "'>" )
								table.insert( html, chest_item.weights[k] )
								table.insert( html, "</td>" )
							end
						end
						if columns['chance'] ~= nil then
							table.insert( html, "<td style='text-align:center;'>" )
							table.insert( html, chance_any )
							table.insert( html, "</td>" )
						end
						if columns['items'] ~= nil then
							table.insert( html, "<td style='text-align:center;'>" )
							table.insert( html, avg_amount )
							table.insert( html, "</td>" )
						end
						if columns['chests'] ~= nil then
							table.insert( html, "<td style='text-align:center;'>" )
							table.insert( html, num_chests )
							table.insert( html, "</td>" )
						end

					elseif type( chest_item ) == "boolean" then
						local allRolls = p.chests[chest_names[j-1]]['allRolls'..suffix]
						local allRollsSpan = #allRolls == 0 and 1 or #allRolls

						table.insert( html, "\n" )
						if columns['stacksize'] ~= nil then
							for k = 1, allRollsSpan do
								table.insert( html, "<td data-sort-value='9e99' style='text-align:center;'>—</td>" )
							end
						end
						if columns['weight'] ~= nil then
							for k = 1, allRollsSpan do
								table.insert( html, "<td data-sort-value='9e99' style='text-align:center;'>—</td>" )
							end
						end
						if columns['chance'] ~= nil then
							table.insert( html, "<td data-sort-value='9e99' style='text-align:center;'>—</td>" )
						end
						if columns['items'] ~= nil then
							table.insert( html, "<td data-sort-value='9e99' style='text-align:center;'>—</td>" )
						end
						if columns['chests'] ~= nil then
							table.insert( html, "<td data-sort-value='9e99' style='text-align:center;'>—</td>" )
						end
					else
						if i > 1 then
							table.insert( html, "</tr><tr>" )
						end

						local item = p.items[chest_item]

						table.insert( html, "\n<td>" )
						local image, spriteCat = sprite.link{
							id = item.id or chest_item,
							link = item.link or string.gsub(chest_item,'-',' '),
							text = item.title or q.titlecase(string.gsub(chest_item,'-',' ')),
							wrap = 'true',
							name = ( item[1] == 'item' and 'ItemSprite' or 'BlockSprite' )
						}
						table.insert( html, image )
						table.insert( html, spriteCat )

						if item.note and p.notes[item.note] then
							table.insert( html, p.current_frame:extensionTag( 'ref', p.notes[item.note], { group='FN', name=item.note } ) )
						end

						if item.note1 and p.notes[item.note1] then
							if item.note == nil or p.notes[item.note] == nil or item.note ~= item.note1 then
								table.insert( html, p.current_frame:extensionTag( 'ref', p.notes[item.note1], { group='FN', name=item.note1 } ) )
							end
						end

						table.insert( html, "</td>" )
					end

					if j == #ordered_item_rows[i] then
						table.insert( html, "</tr>" )
					end

				end
				table.insert( html, "\n" )
			end
		end

		table.insert( html, "</table>")
		table.insert(html, require('Module:NiceJSON').wrap(json, 'pre', 'chestcontents-json'))
		table.insert(html, "</div>")

		return table.concat( html )

	end,

	titlecase = function( str )
		local buf = {}
		for word in string.gfind(str, "%S+") do
			if word == "and" then
				table.insert( buf, word )
			else
				local first, rest = string.sub( word, 1, 1 ), string.sub( word, 2 )
				table.insert( buf, string.upper(first) .. string.lower(rest) )
			end
		end
		return table.concat( buf, " " )
	end,

	lcfirst = function( str )
		return ( string.gsub( str, "^%u", string.lower ) )
	end,

	compare_tables = function( a, b )
		local seen = {}
		for k, v in pairs( a ) do
			if type( v ) ~= type( b[k] ) then
				return true
			end
			if type( v ) == 'table' then
				if q.compare_tables( v, b[k] ) then
					return true
				end
			elseif v ~= b[k] then
				return true
			end
			seen[k] = true
		end
		for k, v in pairs( b ) do
			if not seen[k] then
				return true
			end
		end
		return false
	end,
}

string.lpad = function(str, len, char)
	if char == nil then char = ' ' end
	return string.rep(char, len - #(''..str)) .. str
end

return p