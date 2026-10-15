// Advancements earned by playing.
//
// The 126 advancements were data (systemsWikiData.js) that only `/advancement grant` could award: crafting a table did
// not earn "Minecraft", killing a zombie did not earn "Monster Hunter". Found by the wiki-tutorial play-test (the
// Advancement guide and its tabs walk through earning each one). This tracker awards them from what the player has and
// does, with the criteria the wiki's Advancement page gives:
//  - items: "Have X in your inventory" (checked as the inventory changes);
//  - dimensions: "Enter the Nether" / "Enter the End";
//  - events reported by the game through `advancementEvent` (a kill, a meal, a trade, a bred animal, ...);
//  - places: inside a structure (structureIdAt), each Nether biome, a Nether trip of 7000 Overworld blocks, levitating
//    50 blocks, a strider ride on Overworld lava. The Nether and End tabs of the Advancement guide walk through these.
// Advancements whose triggers this game cannot produce stay unearned rather than being faked.
import { WIKI_ADVANCEMENTS } from './systemsWikiData.js';
import { BLOCKS } from './blocks.js';

const BLOCK_NAME = new Map();
for (const [k, v] of Object.entries(BLOCKS)) if (!BLOCK_NAME.has(v)) BLOCK_NAME.set(v, k.toLowerCase());

const ARMOR = ['helmet', 'chestplate', 'leggings', 'boots'];
/** Inventory criteria: any one of these items (or all, with `all: true`). */
export const ITEM_CRITERIA = {
  'story/root': ['crafting_table'],
  'story/mine_stone': ['cobblestone', 'cobbled_deepslate', 'blackstone'],
  'story/upgrade_tools': ['stone_pickaxe'],
  'story/smelt_iron': ['iron_ingot'],
  'story/obtain_armor': ARMOR.map((p) => `iron_${p}`),
  'story/lava_bucket': ['lava_bucket'],
  'story/iron_tools': ['iron_pickaxe'],
  'story/form_obsidian': ['obsidian'],
  'story/mine_diamond': ['diamond'],
  'story/shiny_gear': ARMOR.map((p) => `diamond_${p}`),
  'nether/obtain_ancient_debris': ['ancient_debris'],
  'nether/obtain_crying_obsidian': ['crying_obsidian'],
  'nether/get_wither_skull': ['wither_skeleton_skull'],
  'nether/obtain_blaze_rod': ['blaze_rod'],
  'end/dragon_egg': ['dragon_egg'],
  'end/dragon_breath': ['dragon_breath'],
  'end/elytra': ['elytra'],
  'husbandry/obtain_sniffer_egg': ['sniffer_egg'],
  'husbandry/obtain_netherite_hoe': ['netherite_hoe'],
};
export const ALL_ITEM_CRITERIA = {
  'nether/netherite_armor': ARMOR.map((p) => `netherite_${p}`),
  'husbandry/froglights': ['ochre_froglight', 'verdant_froglight', 'pearlescent_froglight'],
};
export const DIMENSION_CRITERIA = { nether: ['nether/root', 'story/enter_the_nether'], the_end: ['end/root', 'story/enter_the_end'] };

/** The hostile monsters "Monster Hunter" and "Monsters Hunted" count (Java's kill_a_mob list, 1.21.4). */
export const HOSTILE_MOBS = ['blaze', 'bogged', 'breeze', 'cave_spider', 'creeper', 'drowned', 'elder_guardian', 'ender_dragon', 'enderman', 'endermite', 'evoker', 'ghast', 'guardian', 'hoglin', 'husk', 'magma_cube', 'phantom', 'piglin', 'piglin_brute', 'pillager', 'ravager', 'shulker', 'silverfish', 'skeleton', 'slime', 'spider', 'stray', 'vex', 'vindicator', 'witch', 'wither', 'wither_skeleton', 'zoglin', 'zombie', 'zombie_villager', 'zombified_piglin', 'creaking'];
/** "Two by Two": every breedable animal (Java 1.21.4). */
export const BREEDABLE = ['armadillo', 'axolotl', 'bee', 'camel', 'cat', 'chicken', 'cow', 'donkey', 'fox', 'frog', 'goat', 'hoglin', 'horse', 'llama', 'mooshroom', 'mule', 'ocelot', 'panda', 'pig', 'rabbit', 'sheep', 'sniffer', 'strider', 'turtle', 'wolf'];

/** "A Furious Cocktail" and "How Did We Get Here?": every listed effect active at once (wiki, Java 1.21.4). */
export const COCKTAIL_EFFECTS = ['fire_resistance', 'invisibility', 'jump_boost', 'night_vision', 'poison', 'regeneration', 'resistance', 'slow_falling', 'slowness', 'speed', 'strength', 'water_breathing', 'weakness', 'infested', 'oozing', 'weaving', 'wind_charged'];
export const ALL_EFFECTS = [...COCKTAIL_EFFECTS, 'absorption', 'bad_omen', 'blindness', 'conduit_power', 'darkness', 'dolphins_grace', 'glowing', 'haste', 'hero_of_the_village', 'hunger', 'levitation', 'mining_fatigue', 'nausea', 'raid_omen', 'trial_omen', 'wither'];
const EFFECT_ALIASES = { swiftness: 'speed', leaping: 'jump_boost', slow_falling: 'slow_falling' };

/** Structures you "enter" for an advancement, by the ids structureIdAt answers with. */
export const STRUCTURE_CRITERIA = {
  'nether/find_fortress': ['fortress', 'nether_fortress'],
  'nether/find_bastion': ['bastion_remnant', 'bastion'],
  'end/find_end_city': ['end_city'],
  'story/follow_ender_eye': ['stronghold'],
};
/** "Hot Tourist Destinations": every Nether biome (Java 1.21.4). */
export const NETHER_BIOMES = ['nether_wastes', 'soul_sand_valley', 'crimson_forest', 'warped_forest', 'basalt_deltas'];
/** "Subspace Bubble": "travel between two points in the Overworld with a minimum horizontal distance of 7,000 blocks". */
export const FAST_TRAVEL_BLOCKS = 7000;
const isGoldenArmour = (s) => typeof s?.id === 'string' && s.id.startsWith('golden_') && /_(helmet|chestplate|leggings|boots)$/.test(s.id);

let active = null;
/** Report a game event to the tracker of the running game, if any. */
export function advancementEvent(type, data = {}) { try { active?.event(type, data); } catch (e) { console.error('advancement event', type, e); } }

export class AdvancementTracker {
  constructor(game) {
    this.game = game;
    this.byId = new Map(WIKI_ADVANCEMENTS.map((a) => [a.id, a]));
    this.timer = 0;
    this.log = [];
    this.progress = { killed: new Set(), bred: new Set(), eaten: new Set(), netherBiomes: new Set() };
    this.lastDimension = null; this.netherEntry = null; this.levitationStart = null; this.striderRideStart = null; this.slowTimer = 0;
    this.seenTamed = new WeakSet();
    active = this;
  }
  get earned() { const p = this.game.player; return p ? (p.advancements ??= new Set()) : new Set(); }
  has(id) { return this.earned.has(id); }

  grant(id) {
    const a = this.byId.get(id);
    if (!a || this.has(id)) return false;
    this.earned.add(id);
    this.log.push({ id, title: a.title });
    this.game.ui?.addChatMessage?.(`Player has made the advancement <span style="color:#55ff55">[${a.title}]</span>`, 'system');
    this.game.sounds?.playLevelUp?.();
    return true;
  }

  /** Inventory and dimension checks, four times a second. */
  update(dt) {
    active = this;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const inv = this.game.inventory, player = this.game.player;
    if (!inv || !player) return;
    const held = new Set();
    const name = (s) => (typeof s.id === 'number' ? (BLOCK_NAME.get(s.id) ?? s.id) : s.id);
    for (const s of [...(inv.hotbar ?? []), ...(inv.storage ?? []), inv.offhand, ...Object.values(inv.armor ?? {})]) if (s) held.add(String(name(s)));
    for (const [id, items] of Object.entries(ITEM_CRITERIA)) if (!this.has(id) && items.some((i) => held.has(i))) this.grant(id);
    for (const [id, items] of Object.entries(ALL_ITEM_CRITERIA)) if (!this.has(id) && items.every((i) => held.has(i))) this.grant(id);
    const dim = this.game.currentDimension ?? this.game.world?.dimension;
    for (const id of DIMENSION_CRITERIA[dim] ?? []) this.grant(id);
    const effects = new Set([...(player.statusEffects?.keys?.() ?? [])].map((e) => EFFECT_ALIASES[e] ?? e));
    if (effects.size >= COCKTAIL_EFFECTS.length && COCKTAIL_EFFECTS.every((e) => effects.has(e))) this.grant('nether/all_potions');
    if (effects.size >= ALL_EFFECTS.length && ALL_EFFECTS.every((e) => effects.has(e))) this.grant('nether/all_effects');
    this.travelCriteria(dim, player);
    this.slowTimer -= 0.25;
    if (this.slowTimer <= 0) { this.slowTimer = 1; this.placeCriteria(dim, player); }
    // Taming happens in several places; any mob newly owned by the player counts once.
    for (const mob of this.game.mobs?.mobs ?? []) {
      if (mob?.isTamed && (mob.owner === player || mob.ownerIsPlayer || mob.owner?.isPlayerEntity) && !this.seenTamed.has(mob)) { this.seenTamed.add(mob); this.event('tame', { type: mob.type }); }
    }
  }

  /** Dimension changes (Subspace Bubble), levitation (Great View From Up Here), an Overworld strider ride. */
  travelCriteria(dim, player) {
    const p = player.position; if (!p) return;
    if (this.lastDimension === 'overworld' && dim === 'nether') this.netherEntry = this.lastOverworld ?? { x: p.x, z: p.z };
    if (this.lastDimension === 'nether' && dim === 'overworld' && this.netherEntry) {
      if (Math.hypot(p.x - this.netherEntry.x, p.z - this.netherEntry.z) >= FAST_TRAVEL_BLOCKS) this.grant('nether/fast_travel');
      this.netherEntry = null;
    }
    if (dim === 'overworld') this.lastOverworld = { x: p.x, z: p.z };
    this.lastDimension = dim;
    // "Levitate up 50 blocks from the attacks of a Shulker": measured from where the levitation began.
    const levitating = player.statusEffects?.has?.('levitation');
    if (levitating) {
      this.levitationStart ??= p.y;
      if (p.y - this.levitationStart >= 50) this.grant('end/levitate');
    } else this.levitationStart = null;
    // "Feels Like Home": a strider ride of 50 blocks on Overworld lava.
    const mount = player.ridingMob;
    if (dim === 'overworld' && mount?.type === 'strider') {
      this.striderRideStart ??= { x: p.x, z: p.z };
      if (Math.hypot(p.x - this.striderRideStart.x, p.z - this.striderRideStart.z) >= 50) this.grant('nether/ride_strider_in_overworld_lava');
    } else this.striderRideStart = null;
  }

  /** Where the player is: inside a structure, and which Nether biome. Once a second. */
  placeCriteria(dim, player) {
    const p = player.position; if (!p) return;
    const here = this.game.structureIdAt?.(p.x, p.y, p.z);
    if (here) for (const [id, ids] of Object.entries(STRUCTURE_CRITERIA)) if (ids.includes(here)) this.grant(id);
    if (dim === 'nether') {
      const biome = this.game.world?.getBiome?.(p.x, p.z);
      if (NETHER_BIOMES.includes(biome)) {
        this.progress.netherBiomes.add(biome);
        if (NETHER_BIOMES.every((b) => this.progress.netherBiomes.has(b))) this.grant('nether/explore_nether');
      }
    }
  }

  event(type, data) {
    switch (type) {
      case 'kill': {
        this.grant('adventure/root');
        if (HOSTILE_MOBS.includes(data.type)) {
          this.grant('adventure/kill_a_mob');
          this.progress.killed.add(data.type);
          if (HOSTILE_MOBS.filter((m) => m !== 'ender_dragon' && m !== 'wither' && m !== 'elder_guardian' && m !== 'creaking').every((m) => this.progress.killed.has(m))) this.grant('adventure/kill_all_mobs');
        }
        if (data.type === 'skeleton' && data.distance >= 50 && data.projectile) this.grant('adventure/sniper_duel');
        if (data.type === 'ghast' && data.fireball) this.grant('nether/return_to_sender');
        // "Rescue a Ghast from the Nether, bring it safely home to the Overworld... and then kill it."
        if (data.type === 'ghast' && data.dimension === 'overworld') this.grant('nether/uneasy_alliance');
        if (data.type === 'ender_dragon') this.grant('end/kill_dragon');
        break;
      }
      case 'killed_by': this.grant('adventure/root'); break;
      case 'eat': this.grant('husbandry/root'); this.progress.eaten.add(data.item); break;
      case 'sleep': this.grant('adventure/sleep_in_bed'); break;
      case 'trade': this.grant('adventure/trade'); break;
      case 'enchant': this.grant('story/enchant_item'); break;
      case 'brew': this.grant('nether/brew_potion'); break;
      case 'plant': this.grant('husbandry/plant_seed'); break;
      case 'fish': this.grant('husbandry/fishy_business'); break;
      case 'breed': {
        this.grant('husbandry/breed_an_animal');
        this.progress.bred.add(data.type);
        if (BREEDABLE.every((m) => this.progress.bred.has(m))) this.grant('husbandry/bred_all_animals');
        break;
      }
      case 'tame': this.grant('husbandry/tame_an_animal'); break;
      case 'shoot_hit': this.grant('adventure/shoot_arrow'); break;
      case 'crossbow': this.grant('adventure/ol_betsy'); break;
      case 'deflect': this.grant('story/deflect_arrow'); break;
      case 'totem': this.grant('adventure/totem_of_undying'); break;
      case 'lodestone': this.grant('adventure/use_lodestone'); break;
      case 'brush_armadillo': this.grant('adventure/brush_armadillo'); break;
      case 'cure_zombie_villager': this.grant('story/cure_zombie_villager'); break;
      case 'summon_iron_golem': this.grant('adventure/summon_iron_golem'); break;
      case 'summon_wither': this.grant('nether/summon_wither'); break;
      case 'end_gateway': this.grant('end/enter_end_gateway'); break;
      case 'respawn_dragon': this.grant('end/respawn_dragon'); break;
      case 'ride_strider': this.grant('nether/ride_strider'); break;
      case 'charge_respawn_anchor': this.grant('nether/charge_respawn_anchor'); break;
      case 'beacon': this.grant('nether/create_beacon'); if (data.tier >= 4) this.grant('nether/create_full_beacon'); break;
      // "Oh Shiny": distract a piglin with gold "while not wearing golden armor".
      case 'distract_piglin': {
        const armour = Object.values(this.game.inventory?.armor ?? {});
        if (!armour.some(isGoldenArmour)) this.grant('nether/distract_piglin');
        break;
      }
      // "War Pigs": loot a chest in a bastion remnant.
      case 'open_loot_chest': if (['bastion_remnant', 'bastion'].includes(this.game.structureIdAt?.(data.x, data.y, data.z))) this.grant('nether/loot_bastion'); break;
      case 'follow_ender_eye': this.grant('story/follow_ender_eye'); break;
      case 'wax_on': this.grant('husbandry/wax_on'); break;
      case 'wax_off': this.grant('husbandry/wax_off'); break;
      default: break;
    }
  }
}
