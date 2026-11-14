// The film of dry10-gemini2: four Gemini 3.8 Flash agents playing survival Blockyland together toward the Ender Dragon,
// with the same world seed (20261103), playbook and safety kit v2.1 as the Sonnet and Haiku squads.
// Called as a sports broadcast by two commentators: play-by-play (pbp) and colour analyst (color).
//
// Every chat caption is verbatim from replication/runs/dry10-gemini2/events.jsonl; "…" marks a cut. Fights from
// replication/film/combat.mjs: all four reach Stone Age and Getting an Upgrade by 381.25 s; Basil places furnace (401.2)
// and shared chests (491.15, 755.35); Aria hunts sheep at (90,21,-36), returns with wool and meat (493.75, 557.95);
// Basil sleeps (Sweet Dreams 629.75); Aria smelts iron (Acquire Hardware 690.85, Isn't It Iron Pick? 941.35) and bucket
// (970.9); Delphi and Corin buddy-mine to y=13-15 and spot diamonds (916.15, 940.05); Aria mines diamonds (Diamonds!
// 989.95) and crafts diamond pickaxe and diamond sword (1053.85, 1053.9); Delphi crafts iron pickaxe (1010.05) and kills
// zombie #1232 in four blows (1034.2-1036.75; Monster Hunter 1037.5) with Basil COMING from 7 blocks; Basil crafts shield
// (731.55) and flint and steel (1127.95) and kills skeleton #976 in four blows (1168.4-1172.25; Monster Hunter 1172.75)
// after taking three arrows to 9 HP, with Delphi and Aria COMING; Corin maps lava lake at (14,3,1) (1232.8, 1256.05);
// water poured to form obsidian (1506.1, 1512.05); skeleton #490 shoots Aria and Corin (1520.5) and hits Delphi 5 times
// down to 2 HP (1539.6-1547.75), Delphi backs off (1540.8) and heals (Husbandry 1546.9); Aria (diamond_sword +shield) and
// Corin fight side-by-side at (14,4,1) while Corin seals the skeleton cave (1675.45, 1803.9) and Aria mines obsidian with
// the diamond pickaxe (Ice Bucket Challenge 1695.85). Zero deaths across the 30 minutes.

export const REPLICATION_EDIT_DRY10_GEMINI = {
  id: 'replication-dry10-gemini',
  title: 'The Agent Expedition: Gemini Squad',
  data: '/cinema-replication/dry10-gemini2',
  fps: 30,
  posterTime: 30,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: four blows on the skeleton', dur: 4, g: [1167, 1173], cam: { type: 'duel', who: 'Basil', mob: 976, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Three arrows taken, four swings back: skeleton down!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: the blue seam', dur: 4, g: [988, 994], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.8, height: 1.4 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'pbp', at: .2, text: 'Diamonds at sixteen minutes, and a diamond sword!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: ice bucket challenge', dur: 4.5, g: [1692, 1698], cam: { type: 'group', who: ['Aria', 'Corin'], cutaway: true, dist: 3.8, angle: 1.4, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'color', at: .2, text: 'And deep at y three: water on lava, obsidian in hand!', act: 'roaring teaser' }] },

    // --- the line-up ---
    { name: 'Line-up', dur: 21.5, g: [0, 4], cam: { type: 'aerial', at: [5, 27, 0], dist: 42, height: 28, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: GEMINI SQUAD', sub: 'Four Gemini 3.8 Flash agents · the same world, playbook and safety kit as Sonnet & Haiku',
        roles: {
          Aria: ['Scout, food & wool', 'Iron, diamonds & obsidian'],
          Basil: ['Base & quartermaster', 'Chests, shields & flint and steel'],
          Corin: ['The miner', 'Staircase to y 12 & lava chamber'],
          Delphi: ['Scout & buddy miner', 'Ore scans, iron pick & defence']
        } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome back to the Agent Expedition! Today four Gemini 3.8 Flash agents take the field: same seed, same playbook, same safety kit!', act: 'stadium announcer energy' },
        { id: 'n02', who: 'color', at: 11.5, text: 'Sonnet reached diamonds with five deaths; Haiku lost one player but stalled at iron. Can the Gemini squad push all the way to obsidian and stay alive?', act: 'setting up the rivalry with relish' },
      ] },

    // --- the first day ---
    { name: 'Kick-off', dur: 6, g: [100, 120], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 104.4, dur: 2.8, who: 'Aria', kind: 'chat', text: 'Aria: I am on Scout/Food/Wool duty. Gathering wood for basic tools, then hunting nearby animals.' },
        { atG: 110.25, dur: 2.8, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil reporting: Initializing base shelter duty. Gathering wood for crafting table & chests.' },
      ],
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway! Roles called in chat inside the opening two minutes!' }] },

    { name: 'Stone Age for all four', dur: 7, g: [250, 260], cam: { type: 'face', who: 'Aria', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 252.95, dur: 5, who: 'Aria', kind: 'chat', text: 'Aria: Armed with stone sword and stone pickaxe. Starting food & wool hunt!' }],
      narrate: [{ id: 'n04', who: 'color', at: .4, text: 'Aria has a stone sword and pickaxe at four minutes, and sets out for food and wool.', act: 'brisk, approving' }] },

    { name: 'The stone pickaxes', dur: 8, g: [300, 314], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi'], dist: 4.5, angle: 1.2, rise: .5 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 300.15, dur: 3.5, who: 'Basil', kind: 'chat', text: 'Basil: Equipped with stone sword & pickaxe. Ready to build base & storage.' },
        { atG: 311.95, dur: 3.5, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: Geared with stone tools & weapon! (oak_logx1, birch_logx1, oak_planksx3, stickx8, wooden_pickaxex1, cobblestonex1, dirtx3, stone_pickaxex1)' },
      ],
      narrate: [{ id: 'n05', who: 'pbp', at: .4, text: 'Stone Age and Getting an Upgrade across the board: Basil, Corin, and Delphi all armed!', act: 'fast, enthusiastic' }] },

    { name: 'Wool run to the east', dur: 7.5, g: [428, 436], cam: { type: 'follow', who: 'Aria', dist: 5, height: 2.4 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 429.95, dur: 5, who: 'Aria', kind: 'chat', text: 'Aria: Heading towards sheep at 90, 21, -36 to get wool for beds.' }],
      narrate: [{ id: 'n06', who: 'color', at: .4, text: 'Aria tracks sheep ninety blocks east for wool and mutton, then heads straight back to base.', act: 'observant' }] },

    { name: 'Base camp & furnace', dur: 13, g: [555, 565], cam: { type: 'group', who: ['Aria', 'Basil', 'Corin', 'Delphi'], dist: 4.2, angle: 1.4, rise: .5 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 557.95, dur: 5, who: 'Aria', kind: 'chat', text: 'Aria: Back at base! Bed crafted, meat cooking in furnace at -1 26 0.' },
        { atG: 562, dur: 5, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin: Back at base! Bringing 2 raw iron and 2 coal for smelting.' },
      ],
      narrate: [
        { id: 'n07', who: 'pbp', at: .4, text: 'Everyone back at base before dusk! Bed crafted, mutton in the furnace, raw iron coming in!', act: 'upbeat' },
        { id: 'n08', who: 'color', at: 7.4, text: 'Look at the chest discipline: cooked mutton and iron ingots go straight into shared storage.', act: 'approving' },
      ] },

    // --- night one & buddy mining ---
    { name: 'Sweet Dreams & night plan', dur: 12.2, g: [621, 632], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi', 'Aria'], dist: 4, angle: 1.8, rise: .6 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 623.45, dur: 4.5, who: 'Delphi', kind: 'chat', text: 'Delphi: We have 1 bed(s) placed. Need 4 to sleep skip night. Miner Corin & I can mine at y=12!' },
        { atG: 629.95, dur: 3.5, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Sleeping in bed.' },
      ],
      narrate: [
        { id: 'n10', who: 'color', at: .4, text: 'With only one bed, Delphi makes the textbook call: spend the night mining down to y twelve in pairs.', act: 'tactical' },
        { id: 'n09', who: 'pbp', at: 7.5, text: 'Sweet Dreams for Basil! Respawn set at the base!', act: 'a happy call' },
      ] },

    { name: 'Acquire Hardware & Shield', dur: 8, g: [689, 734], cam: { type: 'group', who: ['Aria', 'Basil'], dist: 4, angle: 1.2, rise: .5 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 690.95, dur: 3.6, who: 'Aria', kind: 'chat', text: 'Aria: Deposited 1 iron_ingot into shared chest for tools!' },
        { atG: 731.55, dur: 3.6, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Crafted shield! Equipping to off-hand.' },
      ],
      narrate: [{ id: 'n11', who: 'pbp', at: .4, text: 'Acquire Hardware for Aria, and Basil puts the first iron ingot into an off-hand shield!', act: 'crisp' }] },

    { name: 'Diamonds spotted at y 13', dur: 16.2, g: [915, 943], cam: { type: 'group', who: ['Delphi', 'Corin'], cutaway: true, dist: 4, angle: 1.5, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 916.15, dur: 5, who: 'Delphi', kind: 'chat', text: 'Delphi at y=15: Found 30 ores! (redstone_ore at 5 15 3, diamond_ore at 5 13 1, iron_ore at 7 15 3)' },
        { atG: 940.05, dur: 4.5, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin: DIAMOND ORE DETECTED at 7 13 3!' },
      ],
      narrate: [
        { id: 'n12', who: 'pbp', at: .4, text: 'Underground at y fifteen: Delphi and Corin uncover a massive seam! Redstone, iron, and diamond ore!', act: 'thrilled, rising' },
        { id: 'n13', who: 'color', at: 9.7, text: 'And they hold off digging the diamonds until Aria finishes the iron pickaxe!', act: 'impressed' },
      ] },

    { name: 'Iron Pick & Diamonds!', dur: 12.5, g: [988, 1012], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.8, height: 1.4 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 999.1, dur: 4.5, who: 'Corin', kind: 'chat', text: 'Aria: Diamonds at (7, 13, 3), (6, 13, 4), (5, 13, 1), (5, 12, 2), (9, 13, 6)! Mine with iron pick!' },
        { atG: 1009.9, dur: 3.5, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: Crafted IRON PICKAXE!' },
      ],
      narrate: [
        { id: 'n14', who: 'pbp', at: .5, text: 'Diamonds! Aria strikes the blue seam sixteen minutes in!', act: 'the biggest goal call' },
        { id: 'n15', who: 'color', at: 5.2, text: 'Corin calls out five diamond coordinates in a row, and Delphi crafts a second iron pickaxe right behind!', act: 'rapid, excited' },
      ] },

    // --- combat & diamond tier ---
    { name: 'Delphi kills the zombie', dur: 12, g: [1033, 1041], cam: { type: 'duel', who: 'Delphi', mob: 1232, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1034.35, dur: 4, who: 'Delphi', kind: 'chat', text: 'HELP zombie at -1 26 -2, 18 HP, stone_sword: FIGHTING' },
        { atG: 1034.95, dur: 4, who: 'Basil', kind: 'chat', side: 'right', text: 'COMING Delphi from 7 blocks, stone_sword +shield, 20 HP' },
      ],
      narrate: [
        { id: 'n16', who: 'pbp', at: .3, text: 'Zombie on Delphi at the surface! Basil answers from seven blocks with sword and shield!', act: 'fast, urgent' },
        { id: 'n17', who: 'pbp', at: 7.2, text: 'Four swings from Delphi: zombie down! Monster Hunter!', act: 'punchy call' },
      ] },

    { name: 'Diamond Pickaxe & Diamond Sword', dur: 8, g: [1052, 1061], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 3, height: 1.5 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 1053.85, dur: 3.5, who: 'Aria', kind: 'chat', text: 'Aria: Crafted DIAMOND PICKAXE!' },
        { atG: 1053.9, dur: 4, who: 'Aria', kind: 'chat', side: 'right', text: 'Aria: Crafted DIAMOND SWORD!' },
      ],
      narrate: [{ id: 'n18', who: 'pbp', at: .4, text: 'Look at Aria at seventeen minutes: a diamond pickaxe AND a diamond sword crafted back to back!', act: 'huge amazement' }] },

    { name: 'Flint and Steel & Skeleton Duel', dur: 12.5, g: [1165, 1175], cam: { type: 'duel', who: 'Basil', mob: 976, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1166.05, dur: 3.5, who: 'Basil', kind: 'chat', text: 'HELP skeleton at 5 28 -1, 16 HP, stone_sword +shield: FIGHTING' },
        { atG: 1166.8, dur: 3.8, who: 'Aria', kind: 'chat', side: 'right', text: 'COMING Basil from 11 blocks, diamond_sword +shield, 20 HP' },
      ],
      narrate: [
        { id: 'n19', who: 'pbp', at: .4, text: 'Skeleton ambushes Basil at the base! Three arrows land, taking Basil down to four and a half hearts!', act: 'alarmed, rising' },
        { id: 'n20', who: 'pbp', at: 7.2, text: 'Basil closes the gap and finishes the archer in four blows! Monster Hunter for Basil!', act: 'roaring' },
      ] },

    // --- lava chamber & obsidian ---
    { name: 'Mapping the lava lake', dur: 8.5, g: [1254, 1295], cam: { type: 'group', who: ['Corin', 'Aria'], cutaway: true, dist: 4, angle: 1.4, rise: .5 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 1256.05, dur: 4.2, who: 'Corin', kind: 'chat', text: 'Corin: Lava lake mapped! 30 lava blocks at y=3. Room lit and secure. Ready for Aria & Delphi with water bucket & diamond pick.' },
        { atG: 1293.05, dur: 3.8, who: 'Aria', kind: 'chat', side: 'right', text: 'Aria: Water bucket filled! Heading down to lava to create obsidian.' },
      ],
      narrate: [{ id: 'n21', who: 'color', at: .4, text: 'Corin fortifies a platform at y five above thirty lava blocks, and Aria brings down the water bucket.', act: 'analytical, building' }] },

    { name: 'Obsidian formed!', dur: 6.5, g: [1504, 1514], cam: { type: 'group', who: ['Aria', 'Corin'], cutaway: true, dist: 3.6, angle: 1.2, rise: .5 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 1506.1, dur: 3.2, who: 'Corin', kind: 'chat', text: 'Corin: OBSIDIAN FORMED! 1 blocks generated. Aria mine with diamond pick!' },
        { atG: 1512.05, dur: 2.8, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: OBSIDIAN FORMED! Found 1 obsidian blocks! Aria mine with diamond pick!' },
      ],
      narrate: [{ id: 'n22', who: 'pbp', at: .4, text: 'Water meets lava at y three: obsidian formed!', act: 'excited call' }] },

    { name: 'Ambush in the deep', dur: 12.8, g: [1538, 1550], cam: { type: 'duel', who: 'Delphi', mob: 490, cutaway: true, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1540.75, dur: 3.5, who: 'Delphi', kind: 'chat', text: 'HELP skeleton at 19 7 -4, 8 HP, stone_sword: RUNNING' },
        { atG: 1541.35, dur: 3.5, who: 'Aria', kind: 'chat', side: 'right', text: 'COMING Delphi from 8 blocks, diamond_sword +shield, 20 HP' },
      ],
      narrate: [
        { id: 'n23', who: 'pbp', at: .4, text: 'Wait—a skeleton in the dark cave above the lava chamber! Five arrows hit Delphi, down to one heart!', act: 'desperate, high drama' },
        { id: 'n24', who: 'color', at: 7.1, text: 'The safety kit pulls Delphi out at two health, and Delphi eats immediately to survive!', act: 'relieved, breathless' },
      ] },

    { name: 'Holding the lava chamber', dur: 10, g: [1560, 1592], cam: { type: 'group', who: ['Aria', 'Corin'], cutaway: true, dist: 3.8, angle: 1.4, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1561.2, dur: 3.6, who: 'Aria', kind: 'chat', text: 'COMING Corin from 0 blocks, diamond_sword +shield, 18 HP' },
        { atG: 1591.45, dur: 3, who: 'Aria', kind: 'chat', side: 'right', text: 'CLEAR Corin: fought 2' },
      ],
      narrate: [{ id: 'n25', who: 'color', at: .4, text: 'Aria and Corin stand shoulder to shoulder at y four, diamond sword and shield drawn, covering each other as arrows fly.', act: 'intense' }] },

    { name: 'Sealing the cave & Ice Bucket Challenge', dur: 15.5, g: [1674, 1698], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.8, height: 1.4 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 1675.45, dur: 4.5, who: 'Corin', kind: 'chat', text: 'Corin: Wall sealed against skeleton cave. Fed & healing (HP: 16, Food: 20). Obsidian: 1.' },
        { atG: 1695.8, dur: 4, who: 'Aria', kind: 'chat', side: 'right', text: 'Aria: Holding 1 obsidian item(s)!' },
      ],
      narrate: [
        { id: 'n26', who: 'color', at: .4, text: 'Corin follows the playbook to the letter: seals the dark cave opening with blocks and eats to full.', act: 'approving' },
        { id: 'n27', who: 'pbp', at: 7.2, text: 'And Aria mines the obsidian with the diamond pickaxe! Ice Bucket Challenge unlocked at twenty-eight minutes!', act: 'ecstatic call' },
      ] },

    { name: 'Closing off the dark', dur: 9, g: [1795, 1806], cam: { type: 'group', who: ['Aria', 'Corin'], cutaway: true, dist: 3.8, angle: 1.6, rise: .5 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 1796.6, dur: 3.8, who: 'Basil', kind: 'chat', text: 'Aria, Corin: Run bl news to clear the combat alarm so your scripts can run!' },
        { atG: 1803.9, dur: 3.8, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin: Wall sealed (1 blocks). Dark cave closed off!' },
      ],
      narrate: [{ id: 'n28', who: 'color', at: .4, text: 'Basil coaches from base camp—clear the exit-code-three alarm with bl news—and Corin seals the final gap.', act: 'warm, appreciative' }] },

    // --- full time ---
    { name: 'Full time', dur: 17.5, g: [1840, 1846], cam: { type: 'aerial', at: [5, 27, 1], dist: 50, height: 34, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'HALF HOUR', sub: 'Gemini 3.8 Flash · 30 minutes of game time · zero deaths',
        stats: [
          'PLAYER OF THE HALF: ARIA · Iron Pick, Diamonds!, Diamond Pick & Sword, Ice Bucket Challenge',
          'Corin · staircase to y 3, diamond scan, lava chamber fortified, sealed the skeleton cave',
          'Basil · base & chests, Sweet Dreams, shield, flint & steel, skeleton duel (Monster Hunter)',
          'Delphi · iron pickaxe, zombie kill (Monster Hunter), survived 5 arrows down to 2 HP',
          'Team · 0 deaths · 25 advancements · 264 programs · 14 HELP · 14 COMING'
        ] },
      narrate: [
        { id: 'n29', who: 'pbp', at: .6, text: 'And that is the half hour! Zero deaths, diamond pickaxe and sword, flint and steel, and Ice Bucket Challenge!', act: 'closing stadium roar' },
        { id: 'n30', who: 'color', at: 9.6, text: 'Player of the half: Aria. Wool, cooked mutton, iron, diamonds, diamond gear, and the first obsidian mined.', act: 'warm, listing with relish' },
      ] },

    { name: 'The verdict', dur: 23, g: [1840, 1846], cam: { type: 'aerial', at: [5, 27, 1], dist: 56, height: 38, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'THE VERDICT',
        stats: [
          'GOOD: 0 deaths across 30 minutes · Delphi survived a 2 HP skeleton ambush',
          'GOOD: deepest tech progression · Diamond Pickaxe, Diamond Sword, Shield, Flint & Steel, Obsidian',
          'GOOD: Corin sealed the dark skeleton cave while Aria mined obsidian at y 3',
          'SONNET SQUAD: 5 deaths · 31 advancements · diamonds at 27:37',
          'HAIKU SQUAD: 1 death · 21 advancements · iron at 12:23 · GEMINI SQUAD: 0 deaths · diamonds 16:30 · obsidian 28:16'
        ] },
      narrate: [
        { id: 'n31', who: 'color', at: .6, text: 'Look at the three-way comparison: Sonnet had five deaths in water; Haiku had one fall and stopped at iron; Gemini had zero deaths and reached obsidian.', act: 'analytical, definitive' },
        { id: 'n32', who: 'pbp', at: 10.2, text: 'Diamonds at sixteen minutes, Ice Bucket Challenge at twenty-eight, and every single player alive at the final whistle!', act: 'punchy, big energy' },
        { id: 'n33', who: 'color', at: 17.5, text: 'That is how you run the playbook. Join us next time on the Agent Expedition!', act: 'warm sign-off' },
      ] },
  ],
};

import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT_DRY10_GEMINI);
export const REPLICATION_DRY10_GEMINI_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_DRY10_GEMINI.fps, posterTime: timeline.posterTime };
export const REPLICATION_DRY10_GEMINI_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
