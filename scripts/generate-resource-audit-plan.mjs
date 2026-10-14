// Exhaustive planning inventory, not a parity verdict. No game code is changed.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { registry } from '../src/resourceRegistry.js';
import { maxDurabilityFor } from '../src/durability.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { loadModTable } from '../src/mods/manifestFile.js';

const OUT = 'docs/block-item-audit';
const MAX_BATCH = 20;
const wiki = page => `https://minecraft.wiki/w/${encodeURIComponent(page.replaceAll(' ', '_')).replaceAll('%3A', ':')}`;
const md = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const profiles = [];
function profile(id, name, match, audits, scenes, tests) { profiles.push({ id, name, match, audits, scenes, candidateTests: tests.split(' ').map(t => `tests/${t}.test.js`).filter(existsSync) }); }

profile('flowers', 'Flowers and small decorative plants', r => !r.blockDef?.flowerPot && !r.blockDef?.crop && r.blockDef?.stage === undefined && !/^potted_|seeds$/.test(r.slug) && /dandelion|poppy|allium|azure_bluet|blue_orchid|cornflower|oxeye_daisy|lily_of_the_valley|wither_rose|tulip|eyeblossom|sunflower|rose_bush|peony|lilac|torchflower|pitcher_plant|pink_petals|wildflowers/.test(r.slug),
  ['Correct plant silhouette in inventory, held view, world and dropped form; alpha holes must reveal the background, never a black cube.', 'Substrate/support and placement failures; one/two-block height, upper-half cleanup, collision and hit selection.', 'All applicable dye, suspicious-stew, flower-pot, bee/pollination and composting uses; species-specific hazards and open/closed behavior.'],
  ['Equip actual flower in HeldItemRenderer over light and dark backdrops; swing, switch slots, drop and pick up.', 'Place on supported/unsupported terrain, remove support, place in pot, convert by recipes; show each state.'], 'item_icons itemForms placeableItems heldBlockInteraction');
profile('planters', 'Flower pots and potted states', r => r.blockDef?.flowerPot || /flower_pot|^potted_/.test(r.slug),
  ['Pot body/cavity and contained plant are separate correctly scaled models; all potted variants retain texture transparency.', 'Insert/remove supported plants with correct item return; break drops, support, water interaction and persistence.'],
  ['Empty pot → insert selected plant → extract → break; every contained species and empty/full state.'], 'smallShapes placeableItems');
profile('crops', 'Crops, stems, seeds and growth stages', r => r.blockDef?.crop || r.blockDef?.stage !== undefined || /seeds|wheat|carrots|potatoes|beetroots|cocoa|nether_wart|pumpkin_stem|melon_stem|sweet_berry_bush|cave_vines/.test(r.slug),
  ['Per-stage geometry, texture and hitbox; seeds/crop item must not be confused with placed crop states.', 'Valid farmland/support, light/water and growth conditions; deterministic random-tick fixtures and bone meal eligibility.', 'Mature/immature harvest, replant, Fortune, trampling/support loss; special stem attachment and fruit generation.'],
  ['Plant → all growth states → bone meal/invalid bone meal → harvest → replant; dry/dark/support-loss controls.'], 'farming recipeIngredients blockDropParity');
profile('aquatic', 'Aquatic plants and coral', r => r.blockDef?.waterPlant || /coral|seagrass|kelp|sea_pickle|lily_pad/.test(r.slug),
  ['Underwater silhouette/alpha, waterlogging and water-face culling; living/dead, fan/wall-fan and tall variants.', 'Required water/substrate/support; death/drying, placement direction, growth/bone meal, harvesting tool and drops.'],
  ['Place submerged and dry, drain/refill water, grow/harvest, inspect fans from both sides and cross chunk borders.'], 'hangingPlantGeometry waterFlow');
profile('saplings', 'Saplings and propagules', r => /sapling|propagule/.test(r.slug),
  ['Held/dropped plant model and hanging/rooted states.', 'Substrates, light/space, growth stages, bone meal, required multi-sapling arrangements and failed growth; tree drops.'],
  ['Equip → place → constrained/open growth → harvest; species and multi-sapling variants.'], 'treePlacement');
profile('leaves', 'Leaves', r => /leaves/.test(r.slug),
  ['Cutout textures, biome tint, hand/drop/world representations, wind only on foliage, opaque/transparent occlusion.', 'Decay, persistent state, logs/distance, waterlogging, shears/Silk Touch/Fortune drops and species-specific fruit/saplings.'],
  ['Place leaves → remove supporting log → decay; harvest with hand, shears and enchanted tool; inspect wind versus stone.'], 'terrainStability blockDropParity');
profile('fungi', 'Mushrooms and Nether fungi', r => /mushroom|fungus|mycelium/.test(r.slug),
  ['Small versus huge form, caps/stems/sides, held cutout and spores if applicable.', 'Support/light/spreading/growth/bone meal rules, huge-form clearance, harvesting and recipe/food uses.'],
  ['Place → grow with enough/insufficient space → harvest cap/stem and small form.'], 'farming');
profile('plants', 'Other vegetation, vines and ground cover', r => r.blockDef?.plant || /vine|fern|grass|bush|moss_carpet|roots|sprouts|lichen|bamboo|cactus|sugar_cane|big_dripleaf|small_dripleaf|spore_blossom|azalea/.test(r.slug) && !/grass_block|dirt_path/.test(r.slug),
  ['Correct cutout/thin/tall/hanging silhouette and attachment faces; genuine 3D forms such as cactus remain distinct.', 'Substrate/height/growth/spread, water, support loss, shears/Silk Touch and composting; hazards and special dripleaf/particle behavior.'],
  ['Equip → attach on eligible faces → grow → remove support → harvest; show hanging/tall states and relevant particles.'], 'hangingPlantGeometry smallShapes farming ambientParticles');
profile('fluids', 'Fluids, buckets and bottle contents', r => r.blockDef?.liquid || /bucket|^water$|^lava$|bubble_column/.test(r.slug),
  ['Source/flow/falling surface, reflection/refraction, held/container fill, alpha, splash/underwater transitions.', 'Scoop/place source, container replacements, source regeneration, flow/drainage, dimension rules and fluid mixing.', 'Entity transport/damage/fire, waterlogging, fish release, powder snow and milk effects as applicable.'],
  ['Fill/scoop/place/empty → break container → flow/drain; mixing, Nether placement, entity release, reload flowing state.'], 'waterFlow waterRules lava buckets bottles fishBuckets');
profile('fire', 'Fire, campfires and torches', r => /(^|_)fire$|campfire|torch/.test(r.slug),
  ['Thin/crossed/burning versus extinguished geometry, support/mounting, lit appearance, smoke, sparks, heat and light/shadows.', 'Ignition/extinguishing, fuel/cooking where applicable, spread/flammability, rain/water, soul variants and entity damage.'],
  ['Mount/ignite → lit particles/light → rain/water extinguish → support removal; campfire cook and collect.'], 'fire visualEffects');
profile('lights', 'Candles, lanterns and luminous blocks', r => r.blockDef?.candle || /lantern|end_rod|glowstone|sea_lantern|shroomlight|froglight|redstone_lamp|jack_o_lantern|light_block/.test(r.slug),
  ['Correct geometry, faces, emissive regions and light level/color; lamps must not illuminate when off.', 'Mounting, grouping/count, lighting/extinguishing, waterlogging, powered states and harvest drops.'],
  ['Place variants → light/power → measure illumination/occluded shadow → extinguish/remove; candle count and hanging variants.'], 'visualEffects candleChainGeometry');
profile('pistons', 'Pistons, observers and moving structures', r => /piston|observer|slime_block|honey_block/.test(r.slug),
  ['Retracted/extended/head/moving state geometry, facing and attachment.', 'Push limits, immovable blocks, sticky attachment, updates/timing, entity displacement, collisions and no item duplication.'],
  ['Power → push/pull chain → blocked push → sticky mixed materials → elevator/flying fixture → reload mid-cycle.'], 'advanced_redstone redstone');
profile('circuits', 'Redstone signal sources and logic', r => r.blockDef?.redstone || r.blockDef?.button || r.blockDef?.pressurePlate || r.blockDef?.sculkSensor || r.blockDef?.sculkShrieker || /redstone|lever|repeater|comparator|daylight_detector|target|tripwire/.test(r.slug),
  ['Centered mechanism, correct powered/unpowered indication, attachment/facing and wire connections.', 'Signal strength/decay, direction, update timing, delays, locking, comparators, activation thresholds and source-specific inputs.'],
  ['Activate source → wire propagation → logic/delay/lock → receiver; analog strengths, blocked links and save/reload.'], 'redstone advanced_redstone mechanismGeometry');
profile('furnaces', 'Furnaces, blast furnaces and smokers', r => /furnace|smoker/.test(r.slug) && !/minecart/.test(r.slug),
  ['Six opaque faces beside carpet/slabs, correct front/facing and lit transitions; hand/icon/drop appearances.', 'Allowed recipes, subtype cooking speed, fuel duration/container remainder, progress/cancellation, blocked output, XP, persistence and hopper IO.', 'Light/smoke/crackle and contents drops on break; each subtype needs its own authoritative behavior.'],
  ['Load → ignite → smelt → collect/XP → block output → bucket fuel → expire → break; hopper input/output and reload while burning.'], 'furnace furnaceRendering resourceBehaviorShowcase smeltingVanilla');
profile('containers', 'Containers and inventory automation', r => r.blockDef?.chest || /chest|barrel|shulker_box|hopper|dispenser|dropper|crafter/.test(r.slug) && !/boat|minecart|chestplate/.test(r.slug),
  ['Body/lid/opening geometry, lock/latch, orientation, double-container joining, held and dropped shape.', 'Capacity/stack limits, opening restrictions, contents transfer, automation rules, comparator fullness, special dispensing and trapped/ender semantics.', 'Contents drop or retained-container contents, break/open/reload races and duplication checks.'],
  ['Open/load/move slots → neighbor merge → automate/power → blocked open → break → pick up → reload contents.'], 'chest workstations_functional redstone itemStackSizes');
profile('stations', 'Crafting and processing workstations', r => !/smithing_template|armor_trim|netherite_upgrade/.test(r.slug) && /crafting_table|anvil|smithing|enchanting|grindstone|stonecutter|loom|cartography|brewing_stand|cauldron|composter|beacon|conduit|lectern|bell/.test(r.slug),
  ['Distinct non-cube geometry, UI and active/content states; orientation and selection hitbox.', 'Inputs/outputs/costs, recipes, experience/enchantment/repair semantics, invalid inputs, profession/trade interactions, power/content signals and save/load.', 'Each named workstation must exercise its unique mechanic rather than only showing a menu.'],
  ['Open → valid operation/cost → invalid operation → output/consumption → automation or profession interaction → reload/break.'], 'workstations_functional smithingParity brewingParity enchanting');
profile('doors', 'Doors and trapdoors', r => r.blockDef?.door || r.blockDef?.trapdoor || /door/.test(r.slug),
  ['Panel thickness, hinge/facing, both halves, open/closed and powered appearances; item versus placed state.', 'Wood/iron interaction differences, support, waterlogging, collision/raycast, redstone, half synchronization, drops and reload.'],
  ['Place each orientation/hinge → open/close by hand or power → pass/collide → remove support/half → reload state.'], 'doorWoodTypes doors door');
profile('fences', 'Fences, gates, walls and bars', r => r.blockDef?.fence || r.blockDef?.fenceGate || r.blockDef?.wall || /iron_bars/.test(r.slug),
  ['Neighbor connections, post/rail shape, gate open/closed geometry and correct collision height.', 'Valid connections to each neighbor class, placement/removal updates, open/powered behavior, jumping, leads and waterlogging.'],
  ['Connect/disconnect matrix → open gate → player/mob collision/jump → waterlog → break/reload.'], 'fenceGeometry wallGeometry');
profile('partial', 'Slabs, stairs and panels', r => r.blockDef?.slab || r.blockDef?.stair || r.blockDef?.pane || /slab|stairs|pane/.test(r.slug),
  ['Half/upper/double slab, inner/outer stair corners, pane connections and UV orientation; no missing adjacent full-block faces.', 'Placement face/facing, collision/raycast, waterlogging, combining slabs, connecting/removing neighbors and harvesting.'],
  ['All orientations/top/bottom/corners → join/waterlog → remove neighbor → collide/raycast → break/reload.'], 'slabGeometry stairGeometry paneCarpetGeometry furnaceRendering');
profile('textiles', 'Wool, carpets and beds', r => r.blockDef?.bed || r.blockDef?.carpet || /wool|carpet|(_|^)bed(_|$)/.test(r.slug),
  ['Every color, thin carpet/two-part bed model, hand/drop shape and neighboring-face occlusion.', 'Dye/craft, support, collision, bed occupancy/spawn/sleep rules and dimension explosion, break-both-halves and contents-free drops.'],
  ['Color variants → place/support loss → bed enter/sleep/spawn/blocked bed → unsafe-dimension bed test → harvest.'], 'bedColors paneCarpetGeometry bed');
profile('signs', 'Signs and banners', r => !/banner_pattern/.test(r.slug) && (r.blockDef?.sign || r.blockDef?.wallSign || r.blockDef?.hangingSign || r.blockDef?.banner || /sign|banner/.test(r.slug)),
  ['Standing/wall/hanging forms, text/pattern layers, orientation, held icon and drop; no opaque sprite rectangle.', 'Mounting/support, text editing/dye/glow/wax, banner patterns/loom recipes, washing, waterlogging and data persistence.'],
  ['Place/mount → edit/pattern/dye/wax → unsupported face → remove/reload; reproduce each stored visual layer.'], 'signGeometry bannerGeometry globeBannerPattern');
profile('decor', 'Decorations, heads and displays', r => r.blockDef?.head || r.blockDef?.wallHead || /head|skull|painting|item_frame|armor_stand|decorated_pot|candle_cake/.test(r.slug),
  ['Correct attached/standing/displayed object, orientation, variants and alpha; head skins, painting sizes and pot designs.', 'Attachment/support, insertion/removal/rotation, entity-vs-block handling, special skull activation, breaking and saved contents.'],
  ['Mount/display → rotate/decorate → change content → support loss → damage/break/reload.'], 'armorStand paintings smallShapes');
profile('transport', 'Rails, boats, minecarts and saddles', r => r.blockDef?.rail || /rail|minecart|boat|raft|saddle|carrot_on_a_stick|warped_fungus_on_a_stick/.test(r.slug),
  ['Rail shapes/connections/slopes, vehicle model and held item; container and mob passenger positions.', 'Placement/riding/steering/dismount, acceleration/collisions, power, fuel/container variants, item drops, drowning/damage and persistence.'],
  ['Place → ride/accelerate/turn → powered/curved/sloped track or water → passenger/container → collide/dismount/break.'], 'vehicles_transport rails riding');
profile('portals', 'Portals and dimensional blocks', r => r.blockDef?.portal || r.blockDef?.dragonEgg || r.blockDef?.endPortalFrame || /portal|gateway|dragon_egg|respawn_anchor|lodestone|dried_ghast/.test(r.slug),
  ['Portal plane/frame states, eye/charge state, particles, held/drop model where legitimately obtainable.', 'Frame construction/activation, eye/charge consumption, dimension travel or spawn semantics, cooldown/destination, teleporting egg and save/load.'],
  ['Invalid/valid frame or charge → activate → travel/use → cooldown/failure → remove/reload; newer behavior requires a version decision.'], 'netherPortal teleport bed');
profile('explosives', 'Explosives and projectile ammunition', r => /tnt|firework|fire_charge|wind_charge|arrow|snowball|egg$|ender_pearl/.test(r.slug) && !/_spawn_egg$/.test(r.slug),
  ['Held/drop/projectile appearance, launch trail, fuse/charge and explosion particles; no sprite box artifacts.', 'Launch velocity/gravity/trajectory, collision/owner attribution, embedding/pickup, damage/knockback, chain reactions and special effects.'],
  ['Launch/prime → hit wall/entity/water → embed or explode → damage/drop/pickup → cleanup; tipped/spectral and shaped firework variants.'], 'arrows windChargeBreeze visualEffects tippedArrows');
profile('weapons', 'Weapons and shields', r => r.def?.type === 'weapon' || r.def?.type === 'shield' || /bow|crossbow|trident|mace|sword|shield/.test(r.slug),
  ['Held transform, charging/blocking and projectile or melee animation, third-person attachment and durability UI.', 'Attack/draw/release cooldowns, range/accuracy, ammo/offhand, blocking, damage/knockback, durability, enchantments and repairs.'],
  ['Equip → attack/block/draw/release → valid/invalid targets and ammo → enchant/repair → item break/pickup.'], 'bow arrows durability shieldDurability');
profile('tools', 'Tools and use actions', r => r.def?.type === 'tool' || /pickaxe|shovel|axe$|hoe$|shears|brush|flint_and_steel|fishing_rod|lead|spyglass/.test(r.slug),
  ['Held model/pose, action animation, tool tiers, durability overlay and entity/rope/line/zoom visuals.', 'Correct target classes, harvest speed/tier/drop requirements, strip/till/path/shear/ignite/brush/fish/leash/zoom uses, cooldown and repair.', 'Invalid targets, creative/survival consumption, enchantments, breakage and lost/returned attached entities.'],
  ['Equip → supported/unsupported use → action progress/result → durability/enchantment matrix → repair/break; dedicated action per tool.'], 'durability toolFacts fishingParity archaeology heldBlockInteraction');
profile('armor', 'Armor and wearable equipment', r => r.def?.type === 'armor' || r.def?.armorSlot || /elytra|helmet|chestplate|leggings|boots|horse_armor|wolf_armor|turtle_shell/.test(r.slug),
  ['Icon/held/drop/equipped model, material/color and trims; full slot/variant coverage.', 'Equip slots, defense/toughness, damage/durability, enchantments, dye/trim/netherite upgrades, repairs, flight or animal equipment semantics.'],
  ['Equip → take representative damage → enchant/dye/trim → repair/upgrade → break; elytra flight and eligible animal equipment.'], 'armor armor_ui smithingParity trimVisuals armourDurability');
profile('potions', 'Potions, bottles and effect containers', r => r.def?.type === 'potion' || /potion|glass_bottle|bottle_o_enchanting/.test(r.slug),
  ['Bottle contents/color, splash/lingering form, held/drop model and effect particles; stack-specific data.', 'Brewing ingredient/order/fuel, valid/invalid transforms, effect duration/strength, drink/throw/AOE clouds, tipped arrows and container returns.'],
  ['Brew → upgrade/corrupt/extend → drink/throw → affected/unaffected entities → expiry → save/load effect/container.'], 'brewingParity itemPotions itemPotionDrinking statusEffects');
profile('food', 'Food, stews and edible blocks', r => r.def?.type === 'food' || /cake|apple|bread|beef|porkchop|chicken|mutton|rabbit|cod$|salmon$|potato|berries|stew|melon_slice|carrot/.test(r.slug),
  ['Held food/edible-block model, eating animation, portions/slices and container appearance.', 'Hunger/saturation, eating eligibility/time, effects/poison/teleport, container returns, cooking/breeding uses and no stack duplication.'],
  ['Hungry/full player → eat → nutrition/effect/container → prepare/cook where applicable; block portions and mob feeding.'], 'foodSaturation hungerModel itemPotionDrinking farming');
profile('eggs', 'Spawn eggs', r => r.def?.type === 'spawn_egg' || /_spawn_egg$/.test(r.slug),
  ['Per-mob egg colors/icon, held/drop rendering, tooltip/entity identity.', 'Correct entity/type/variant/age and placement clearance, survival/creative consumption, dispenser/spawner behavior and unsupported mob handling.'],
  ['Use on floor/wall/entity/spawner → spawn matching mob → blocked spawn → dispenser → clean up; preserve entity data.'], 'spawnEggCoverage spawnEggCatalogue');
profile('trims', 'Smithing templates and trim materials', r => /smithing_template|armor_trim|netherite_upgrade/.test(r.slug),
  ['Distinct template pattern/name/icon; material contrast on icons/doll/worn model if supported.', 'Obtainable source, template duplication, smithing slot requirements, exact output metadata, material/trim combinations and invalid inputs.'],
  ['Obtain/duplicate → trim or upgrade → inspect each slot/material → invalid recipe → save/reload metadata.'], 'smithingParity trimVisuals');
profile('books', 'Books, maps, compasses and records of state', r => /book|map|compass|clock|name_tag/.test(r.slug),
  ['Held map/book/needle/clock face and UI, display-frame form, name/enchantment/page metadata.', 'Write/read/copy/sign/enchant/explore/track/name actions, limits, orientation/dimension behavior, crafting and persistent data.'],
  ['Create → use/update state → copy/name/enchant → invalid action → display/frame → reload contents.'], 'mapItem enchanting');
profile('music', 'Music discs, horns and sound blocks', r => /music_disc|goat_horn|jukebox|note_block/.test(r.slug),
  ['Distinct icon/held/drop and loaded/playing block states.', 'Acquire/insert/play/eject, sound range/selection/timing, instrument/pitch/power semantics and cooldown; persistence and item returns.'],
  ['Insert/use → play/listen → change pitch/instrument → eject/stop → reload; every track/horn variant.'], 'musicDiscs');
profile('dyes', 'Dyes and pattern ingredients', r => /dye$|banner_pattern/.test(r.slug),
  ['Correct colors/pattern identities in all visual contexts.', 'Craft sources, apply to every eligible target, mixing/bleaching, slot/count consumption and persisted target metadata.'],
  ['Craft → dye eligible/invalid targets → mix/wash → drop/pickup → reload colored result.'], 'bannerGeometry bedColors');
profile('ores', 'Ores and raw mineral resources', r => /ore$|raw_(iron|gold|copper)|ancient_debris|netherite_scrap/.test(r.slug),
  ['Per-ore/deepslate texture faces, inventory/held/drop identity and emissive exceptions.', 'Required harvest tier, Silk Touch/Fortune, quantity/XP, raw/block conversions, smelting/blasting and world generation/loot obtainability.'],
  ['Wrong/right/enchanted tool → drop/pickup/XP → smelt → compact/decompact → reload.'], 'blockDropParity harvestVariants smeltingVanilla');
profile('wood', 'Logs, stems, wood and planks', r => /log|planks|hyphae|(_|^)wood$|stem$|stripped/.test(r.slug),
  ['Axis/end-grain/side UVs, stripped form, bark forms and species; hand/drop versus world identity.', 'Axis placement, stripping, crafting, flammability/fuel exceptions, growth/harvest, attachments and note-block use.'],
  ['Place axes → strip → break → plank/fuel/craft → unsupported transformation → reload.'], 'mesherFaceTextures treePlacement smeltingVanilla');
profile('glass', 'Glass and transparent full blocks', r => /glass/.test(r.slug),
  ['Tint/alpha and neighboring face culling without missing opaque terrain; correct refraction/ordering with fluids.', 'Color recipes, Silk Touch drops, placement/support, light and spawn/collision semantics.'],
  ['Place color matrix beside solids/water/glass → inspect all sides → normal/Silk Touch harvest → reload.'], 'paneCarpetGeometry mesherFaceTextures');
profile('snow', 'Snow, ice and frozen surfaces', r => /snow|ice$/.test(r.slug),
  ['White snow face contrast, distinct ice textures/transparency, layers/levels, held/drop form; static terrain under animated shaders.', 'Accumulation/melting/support, harvesting, powder-snow sinking/freezing/boots, slipperiness, water conversions and light/biome rules.'],
  ['Layer/accumulate → warm/light/weather → walk/fall/freeze → harvest → bucket/melt/refreeze → save/reload.'], 'snowLighting terrainStability weatherParity');
profile('gravity', 'Sand, gravel and falling materials', r => /sand$|gravel|concrete_powder|scaffolding|suspicious_sand|suspicious_gravel/.test(r.slug),
  ['Falling entity, landed block, held/drop textures and scaffold connectivity; suspicious excavation progress.', 'Gravity/support and landing, water hardening, damage/drop outcomes, tool/Fortune or brush archaeology, scaffold range/collapse.'],
  ['Place → remove support → fall/land on solid/fluid/partial shape → harvest or brush → reload mid-state.'], 'archaeology blockDropParity');
profile('copper', 'Copper variants and oxidation', r => /copper|oxidized|weathered|exposed|waxed/.test(r.slug),
  ['Oxidation/wax state colors, per-shape UVs, active bulb/grate properties and consistent item-state naming.', 'Oxidation progression, waxing/unwaxing/scraping/lightning resets, recipe conversions and state preservation; shape-specific interaction.'],
  ['Oxidize → wax → scrape/unwax → lightning → craft/place/break → reload exact state.'], 'blockItems');
profile('technical', 'Technical, command and operator-only blocks', r => /command_block|structure_block|structure_void|jigsaw|barrier|^air$|cave_air|void_air|debug_stick|^light$/.test(r.slug),
  ['Correct intended invisibility/debug display, selection and operator-only inventory form; distinguish air from missing geometry.', 'Command permissions/execution modes/conditional chains, structure save/load/rotation, jigsaw configuration and barrier/light semantics as applicable.', 'No invented survival recipes/drops; negative permission tests and state persistence are mandatory.'],
  ['Operator obtain/configure → valid operation → unauthorized/invalid operation → visualize debug state → save/reload/remove.'], 'commandParity structureTemplate');
profile('terrain', 'Stone, dirt and ordinary full building blocks', r => r.kind === 'block' || r.blockId !== null,
  ['Six faces, per-face UVs, color/material variants, icon/hand/drop model, AO/light, stable shadows and fluid/partial-neighbor culling.', 'Harvest hardness/tool/tier/drop/XP, recipes/smelting, placement/collision and special block transforms/spread/hazards.', 'Read the individual Wiki article for exceptions such as infested, farmland, sculk, sponge, budding amethyst, honey and decorated blocks; never close on generic cube checks alone.'],
  ['Equip/drop/place → neighbor/collision/light matrix → family-specific transform/use → harvest/tools → craft/reload.'], 'blockDropParity blockRegistryIntegrity terrainStability mesherFaceTextures');
profile('materials', 'Ingredients, loot and remaining special items', () => true,
  ['Correct distinct icon, transparent held/drop form, tint/metadata and stack limit; no fallback stick/black box.', 'Every source and declared recipe/smelting/trade/barter/interaction use; custom use actions, enchantment/repair eligibility and survival obtainability.', 'Read each individual article and add unique actions before closing; absence of an obvious handler is a gap, not proof of inertness.'],
  ['Obtain → equip/drop/pickup → execute every source/use → invalid recipe/target → count/metadata and save/reload.'], 'resourceInspector itemDefinitions interactionSources itemStackSizes');

const familyPages = [
  [/spawn_egg$/, 'Spawn Egg'], [/smithing_template|armor_trim/, 'Smithing Template'], [/banner_pattern/, 'Banner Pattern'],
  [/potion/, 'Potion'], [/dye$/, 'Dye'], [/music_disc/, 'Music Disc'], [/^potted_|flower_pot/, 'Flower Pot'],
  [/candle_cake/, 'Cake'], [/candle/, 'Candle'], [/wall_hanging_sign|hanging_sign/, 'Hanging Sign'], [/wall_sign|_sign$/, 'Sign'],
  [/banner/, 'Banner'], [/trapdoor/, 'Trapdoor'], [/door/, 'Door'], [/fence_gate/, 'Fence Gate'], [/fence/, 'Fence'],
  [/stairs/, 'Stairs'], [/slab/, 'Slab'], [/carpet/, 'Carpet'], [/wool/, 'Wool'], [/stained_glass_pane|glass_pane/, 'Glass Pane'],
  [/stained_glass/, 'Glass'], [/terracotta/, 'Terracotta'], [/concrete_powder/, 'Concrete Powder'], [/concrete/, 'Concrete'],
  [/shulker_box/, 'Shulker Box'], [/(^|_)bed(_|$)/, 'Bed'], [/coral.*fan/, 'Coral Fan'], [/coral.*block/, 'Coral Block'], [/coral/, 'Coral'],
  [/leaves/, 'Leaves'], [/sapling/, 'Sapling'], [/planks/, 'Planks'], [/hyphae|(^|_)wood$/, 'Wood'], [/log|stripped.*stem|^crimson_stem$|^warped_stem$/, 'Log'],
  [/^lit_furnace$|^furnace$/, 'Furnace'], [/^redstone_wire$/, 'Redstone Dust'], [/redstone_torch/, 'Redstone Torch'],
  [/head|skull/, 'Mob Head'], [/minecart/, 'Minecart'], [/chest_boat|chest_raft/, 'Boat with Chest'], [/boat|raft/, 'Boat'],
  [/helmet|chestplate|leggings|boots/, 'Armor'], [/wolf_armor/, 'Wolf Armor'], [/horse_armor/, 'Horse Armor'], [/turtle_shell/, 'Turtle Shell'],
];
const pageOverrides = { snow: 'Snow Block', snow_layer: 'Snow', wheat_crops: 'Wheat', carrots: 'Carrot', potatoes: 'Potato', beetroots: 'Beetroot',
  grass: 'Grass Block', grass_block: 'Grass Block', tall_grass: 'Grass', short_grass: 'Grass', wheat: 'Wheat',
  wheat_seeds: 'Wheat Seeds', beetroot_seeds: 'Beetroot Seeds', lit_furnace: 'Furnace', red_bed_foot: 'Bed', red_bed_head: 'Bed',
  target_block: 'Target', hay_block: 'Hay Bale', nether_portal: 'Nether Portal', piston_sticky: 'Sticky Piston',
  wooden_door: 'Door', pressure_plate: 'Pressure Plate', redstone: 'Redstone Dust', fire_charge: 'Fire Charge',
  firefly_bush: 'Firefly Bush', golden_dandelion: 'Golden Dandelion', water_bucket: 'Water Bucket', lava_bucket: 'Lava Bucket',
  beef: 'Raw Beef', porkchop: 'Raw Porkchop', chicken: 'Raw Chicken', mutton: 'Raw Mutton', rabbit: 'Raw Rabbit', cod: 'Raw Cod', salmon: 'Raw Salmon' };
const aliases = new Map();
for (const [name, id] of Object.entries(BLOCKS)) { if (!aliases.has(id)) aliases.set(id, []); aliases.get(id).push(name.toLowerCase()); }
const blockItems = new Map();
for (const [id, def] of Object.entries(ITEMS)) if (def.blockId !== undefined) { const list = blockItems.get(def.blockId) || []; list.push(id); blockItems.set(def.blockId, list); }
async function optionalCache(name) {
  try { return JSON.parse(await readFile(`.cache/mc-data/${name}.json`, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
const cache = await optionalCache('blocks');
const knownBlocks = new Map(cache.map(b => [b.name, b]));
const cachedItems = await optionalCache('items');
const knownItems = new Set(cachedItems.map(i => i.name));
const reg = registry({ fresh: true, durability: maxDurabilityFor, smelting: SMELTING_RECIPES });
const entries = [];

function add(kind, id, def) {
  const blockId = kind === 'block' ? Number(id) : def.blockId ?? null;
  const blockDef = blockId !== null ? BLOCK_DEFS[blockId] : null;
  const names = kind === 'block' ? aliases.get(blockId) || [] : [];
  const slug = kind === 'item' ? id : names.find(n => knownBlocks.has(n)) || names[0] || String(def.name).toLowerCase().replaceAll(' ', '_');
  const row = { key: `${kind === 'block' ? 'B' : 'I'}:${id}`, kind, id: kind === 'block' ? Number(id) : id, name: def.name || id, slug, aliases: names, blockId, def, blockDef };
  const p = profiles.find(p => p.match(row));
  let page = pageOverrides[slug];
  if (!page && blockDef?.crop) page = ({ wheat: 'Wheat', carrots: 'Carrot', potatoes: 'Potato', beetroots: 'Beetroot' })[blockDef.crop];
  page ||= familyPages.find(([re]) => re.test(slug))?.[1];
  page ||= def.name?.replace(/ \(.*\)/, '').replace(/^Lit /, '').replace(/ (Head|Foot|Top Open|Top|Open)$/, '') || slug.split('_').map(s => s[0]?.toUpperCase() + s.slice(1)).join(' ');
  const entry = kind === 'item' ? reg.entries.get(id) : reg.byBlockId.get(blockId);
  const facts = {};
  for (const k of ['stage','crop','mature','internal','isHead','isTop','shape','carpetHeight','light','lightColor','hardness','drop','dropItem','armorSlot','stackSize','type']) {
    const v = def[k] ?? blockDef?.[k]; if (v !== undefined) facts[k] = v;
  }
  const shapeFlags = ['plant','slab','stair','pane','carpet','door','trapdoor','fence','wall','fenceGate','candle','chest','bed','head','wallHead','sign','wallSign','hangingSign','rail','flowerPot','waterPlant','transparent','solid','redstone'];
  for (const k of shapeFlags) if (blockDef?.[k] !== undefined) facts[k] = blockDef[k];
  const known = kind === 'item' ? knownItems.has(id) : names.some(n => knownBlocks.has(n));
  const vanilla = names.map(n => knownBlocks.get(n)).find(Boolean);
  const supplementalProfiles = [];
  if (p.id !== 'copper' && blockId !== null && /copper|oxidized|weathered|exposed|waxed/.test(slug) && !/ore|raw_copper/.test(slug)) supplementalProfiles.push('copper');
  if (p.id !== 'food' && /candle_cake/.test(slug)) supplementalProfiles.push('food');
  entries.push({ key: row.key, kind, id: row.id, name: row.name, slug, aliases: names, profile: p.id, supplementalProfiles,
    wikiUrl: wiki(page), wikiPage: page, wikiStatus: 'needs-source-review',
    versionReview: known ? 'present-in-pinned-1.21.4' : (kind === 'item' ? cachedItems.length : cache.length) ? 'later-version-or-custom-review-required' : 'bootstrap-unavailable-source-review-required',
    blockId, linkedKeys: kind === 'block' ? (blockItems.get(blockId) || []).map(i => `I:${i}`) : blockId !== null ? [`B:${blockId}`] : [],
    inspectorUrl: kind === 'item' ? `/item-debug.html?resource=${encodeURIComponent(id)}` : entry ? `/${entry.kind === 'item' ? 'item' : 'block'}-debug.html?resource=${encodeURIComponent(entry.key)}` : null,
    currentMetadata: facts, currentDefinition: def, linkedBlockDefinition: kind === 'item' ? blockDef : null,
    bootstrapStateProperties: vanilla?.states || [],
    baselineSources: entry ? { crafting: entry.recipesAsResult.length, smelting: entry.smeltingFrom.length, loot: entry.lootFrom.length, blockDrops: entry.droppedBy.length } : null,
    candidateTests: [...new Set([...p.candidateTests, ...supplementalProfiles.flatMap(id => profiles.find(p => p.id === id).candidateTests)])],
    existingSpecializedShowcase: [BLOCKS.FURNACE, BLOCKS.LIT_FURNACE].includes(blockId) ? 'eight furnace scenarios + six views; requires source-based re-audit' : 'not verified; generic Inspector checks are not a behavior showcase',
    status: 'NOT_STARTED', gates: { source: 'PENDING', visuals: 'PENDING', behavior: 'PENDING', tests: 'PENDING', showcase: 'PENDING' },
    sourceReview: null, expectedClaims: [], caseIds: [], owner: null, reviewedCode: null, exclusions: [], evidence: [], notes: '' });
}
for (const [id, def] of Object.entries(BLOCK_DEFS)) add('block', id, def);
for (const [id, def] of Object.entries(ITEMS)) add('item', id, def);

// Preserve human progress on regeneration. A changed definition reopens review.
const fingerprint = row => JSON.stringify({ definition: row.currentDefinition, blockDefinition: row.linkedBlockDefinition, wiki: row.wikiUrl, aliases: row.aliases });
let previous = new Map();
try { const saved = JSON.parse(await readFile(`${OUT}/manifest.json`, 'utf8')); previous = new Map([...saved.entries, ...(saved.customModEntries || [])].map(e => [e.key, e])); } catch {}
for (const row of entries) {
  const old = previous.get(row.key);
  if (old && old.fingerprint === fingerprint(row)) for (const field of ['status','gates','evidence','notes','wikiStatus','sourceReview','expectedClaims','caseIds','owner','reviewedCode','exclusions']) row[field] = old[field] ?? row[field];
  else if (old) row.notes = `Definition changed; re-audit required. Previous status: ${old.status}. ${old.notes || ''}`;
  row.fingerprint = fingerprint(row);
}
const batches = [];
let serial = 1;
for (const p of profiles) {
  const list = entries.filter(r => r.profile === p.id).sort((a, b) => {
    const urgent = slug => /dandelion|poppy/.test(slug) ? 0 : 1;
    return (p.id === 'flowers' ? urgent(a.aliases[0] || a.id) - urgent(b.aliases[0] || b.id) : 0)
      || a.name.localeCompare(b.name, 'en') || a.key.localeCompare(b.key, 'en', { numeric: true });
  });
  for (let i = 0; i < list.length; i += MAX_BATCH) {
    const id = `A${String(serial++).padStart(3, '0')}`;
    const slice = list.slice(i, i + MAX_BATCH);
    slice.forEach(row => { row.batch = id; });
    batches.push({ id, profile: p.id, title: `${p.name} ${Math.floor(i / MAX_BATCH) + 1}`, entryKeys: slice.map(r => r.key) });
  }
}
const mods = loadModTable().mods.flatMap(m => ['blocks','items'].flatMap(kind => (m.provides?.[kind] || []).map(entry => ({ key: `${m.id}:${entry.id || entry}`, kind: kind.slice(0, -1), name: entry.name || entry.id || entry, modId: m.id, spec: m.manifestPath, wikiUrl: null, parityPolicy: 'original mod content: mod specification, not a fabricated vanilla Wiki counterpart', status: 'NOT_STARTED' }))));
for (const mod of mods) {
  const old = previous.get(mod.key);
  if (old) for (const field of ['status','gates','evidence','notes','sourceReview','expectedClaims','caseIds','owner','reviewedCode','exclusions']) if (old[field] !== undefined) mod[field] = old[field];
}
assert.equal(entries.length, Object.keys(BLOCK_DEFS).length + Object.keys(ITEMS).length);
assert.equal(new Set(entries.map(e => e.key)).size, entries.length);
assert.equal(batches.flatMap(b => b.entryKeys).length, entries.length);
assert.ok(batches.every(b => b.entryKeys.length > 0 && b.entryKeys.length <= MAX_BATCH));
assert.ok(entries.every(e => e.batch && e.profile && e.wikiUrl.startsWith('https://minecraft.wiki/w/')));
assert.ok(entries.every(e => e.linkedKeys.every(key => entries.some(other => other.key === key))));
await mkdir(OUT, { recursive: true });
const manifest = { schemaVersion: 1, inventoryDate: '2026-10-13', targetPolicy: 'Java Edition; pin Wiki revision/version per batch, bootstrap dataset pc/1.21.4 only', maxBatchSize: MAX_BATCH,
  counts: { blocks: Object.keys(BLOCK_DEFS).length, items: Object.keys(ITEMS).length, total: entries.length, batches: batches.length, customModEntries: mods.length },
  profiles: profiles.map(({ match, ...p }) => p), batches, entries, customModEntries: mods };
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const catalog = ['# Complete block and item audit inventory', '', '[Read the audit plan](../block-item-audit-plan.md). Generated from runtime definitions; regenerate with `node scripts/generate-resource-audit-plan.mjs`.', '',
  `${manifest.counts.blocks} block definitions + ${manifest.counts.items} item definitions = ${entries.length} explicit rows in ${batches.length} batches. Block/item forms are separate responsibilities even when they share a name. All rows start unreviewed; links are Wiki targets, not verified article contents.`, '',
  'Every row inherits all universal gates in the plan and its family checklist below. Metadata is the current implementation, never an assertion of Wiki correctness. Missing bootstrap state metadata means "research required", not "no states".', ''];
for (const batch of batches) {
  const p = profiles.find(p => p.id === batch.profile);
  catalog.push(`## ${batch.id} — ${batch.title}`, '', `Rows: ${batch.entryKeys.length}. Status: see manifest/tracker.`, '', '**Parity audit requirements (in addition to universal gates):**', '', ...p.audits.map(s => `- ${s}`), '', '**Required Inspector showcase:**', '', ...p.scenes.map(s => `- ${s}`), '',
    `Existing test files to inspect (coverage unverified): ${p.candidateTests.map(t => '[' + t + '](../../' + t + ')').join(', ') || 'No family test file identified; create one.'}`, '',
    '| Key / status | Defined name and aliases | Minecraft Wiki target | Related forms | Current metadata / exact variant to audit |', '| --- | --- | --- | --- | --- |');
  const supplements = [...new Set(batch.entryKeys.flatMap(key => entries.find(e => e.key === key).supplementalProfiles))];
  // Append cross-family requirements after the table, so its Markdown stays valid.
  for (const key of batch.entryKeys) {
    const row = entries.find(e => e.key === key);
    const metadata = Object.entries(row.currentMetadata).map(([k, v]) => `${k}=${v}`).join('; ') || 'Definition/source/use inventory required';
    catalog.push(`| \`${row.key}\` ${row.status} | ${md(row.name)}${row.aliases.length ? ` · ${md(row.aliases.join(', '))}` : ''} | [${md(row.wikiPage)}](${row.wikiUrl}) | ${row.linkedKeys.map(k => `\`${k}\``).join(', ') || 'No paired form declared'} | ${md(metadata)}; ${row.versionReview}${row.supplementalProfiles.length ? `; ALSO ${row.supplementalProfiles.join(', ')}` : ''} |`);
  }
  for (const id of supplements) {
    const extra = profiles.find(p => p.id === id);
    catalog.push('', `**Additional requirements for rows marked ALSO ${id}: ${extra.name}.**`, '', ...extra.audits.map(s => `- ${s}`), ...extra.scenes.map(s => `- Showcase: ${s}`));
  }
  catalog.push('');
}
catalog.push('## Original mod content appendix', '', 'These declared items/blocks have no vanilla Wiki counterpart. Audit their mod specification and the same visual, lifecycle, test and showcase gates; do not fabricate a Minecraft Wiki page or count custom rules as a vanilla parity failure.', '', '| Key | Name | Specification | Status |', '| --- | --- | --- | --- |', ...mods.map(m => `| \`${m.key}\` | ${md(m.name)} | [${m.spec}](../../${m.spec}) | ${m.status} |`), '');
await writeFile(`${OUT}/catalog.md`, catalog.join('\n'));
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
await writeFile(`${OUT}/tracker.csv`, ['key,batch,profile,kind,name,wiki_url,wiki_status,status,source,visuals,behavior,tests,showcase,evidence,notes',
  ...entries.map(e => [e.key,e.batch,e.profile,e.kind,e.name,e.wikiUrl,e.wikiStatus,e.status,...['source','visuals','behavior','tests','showcase'].map(g => e.gates[g]),e.evidence.join('; '),e.notes].map(csv).join(','))].join('\n') + '\n');
const queue = ['# Audit batch queue', '', '[Plan](../block-item-audit-plan.md) · [Full inventory](catalog.md) · [Editable manifest](manifest.json) · [Tracker export](tracker.csv)', '',
  'Complete shared family behavior and one representative before variant sweeps. Split any 20-row batch further if its mechanisms exceed one focused session. Paired forms in another batch must also pass before the family is called complete.', '',
  '| Batch | Family / slice | Rows | Status |', '| --- | --- | --- | --- |', ...batches.map(b => {
    const rows = b.entryKeys.map(key => entries.find(e => e.key === key));
    const status = rows.every(r => r.status === 'VERIFIED') ? 'VERIFIED' : rows.every(r => r.status === 'NOT_STARTED') ? 'NOT_STARTED' : 'PARTIAL';
    return `| [${b.id}](catalog.md#${b.id.toLowerCase()}--${b.title.toLowerCase().replaceAll(/[^a-z0-9 -]/g,'').replaceAll(' ','-')}) | ${b.title} | ${b.entryKeys.length} | ${status} |`;
  }), ''];
await writeFile(`${OUT}/batches.md`, queue.join('\n'));
console.log(JSON.stringify(manifest.counts, null, 2));
