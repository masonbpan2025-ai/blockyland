// The film of dry10-sonnet2: the Sonnet half of the dry10 comparison (the first try, dry10-sonnet, hit the usage limit
// 8.5 minutes in and was re-run). Four Claude Sonnet 5.5 agents, the playbook and the new safety kit, the same seed as
// the Haiku squad (replicationEditDry10Haiku.js). Called as a sports broadcast.
//
// Every chat caption is verbatim from replication/runs/dry10-sonnet2/events.jsonl; "…" marks a cut. Fights from
// replication/film/combat.mjs: Corin shot by skeleton #154 at 547.1 and 550.5, Delphi answering COMING from 25 blocks;
// Corin struck zombie #466 (618, 620.45) and Delphi, COMING from 1 block at 624.4, struck skeleton #154 three times
// (629.4-631.55; Monster Hunter, Delphi, 625.05); drowned #9865 took Delphi to 1 HP (657.2-667.35) and Delphi and Corin
// sealed themselves in without food; Basil left with cooked chicken (808.65); Corin, run into a pond by the kit at 2 HP,
// drowned (812.3); the drowned died at 875.25 (Monster Hunter, Basil, 875.2) and Basil fed Delphi (884.05); Aria slept
// (Sweet Dreams 907.7); Aria killed skeleton #10494 in four blows (1036.1-1041.95) with Basil and Delphi COMING;
// Corin, unarmed, shot in the west ravine, drowned (1108.8); Delphi dropped a sword for Corin at the ravine (1198) and
// fell in (1198.6), then drowned (1241.3); Aria's iron pickaxe 1230.65; Aria gave Delphi a spare (1396.15, Delphi's
// iron pick 1417.55); Delphi drowned in a water cave under the base (1556.05); Aria killed zombie #760 with an iron
// sword (1559.6-1563.45); Diamonds!, Aria, 1655.45. The commentators name the players rather than guess pronouns.

export const REPLICATION_EDIT_DRY10_SONNET = {
  id: 'replication-dry10-sonnet',
  title: 'The Agent Expedition: Sonnet Squad',
  data: '/cinema-replication/dry10-sonnet2',
  fps: 30,
  posterTime: 30,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: the rescue party', dur: 4, g: [862, 876], cam: { type: 'group', who: ['Basil', 'Aria', 'Delphi'], dist: 4, angle: 1.4, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'A rescue party under the hill!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: four swings', dur: 3.8, g: [1036, 1042], cam: { type: 'duel', who: 'Aria', mob: 10494, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'pbp', at: .2, text: 'Four swings, skeleton down!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: the water', dur: 4, g: [1100, 1108], cam: { type: 'face', who: 'Corin', dist: 3, height: 1.6 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'color', at: .2, text: 'And the water. Again and again.', act: 'ominous teaser' }] },

    // --- the line-up ---
    { name: 'Line-up', dur: 18.5, g: [0, 4], cam: { type: 'aerial', at: [5, 27, 0], dist: 42, height: 28, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: SONNET SQUAD', sub: 'Four Claude Sonnet agents · the same world, playbook and safety kit as the Haiku squad',
        roles: { Aria: ['Tools and ore', 'The diamond hunter'], Basil: ['Food and beds', 'Chickens and sheep'], Corin: ['The stone hill', 'Stone, coal, iron'], Delphi: ['Scout', 'First into every fight'] } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .8, text: 'Welcome back! The Sonnet squad takes the field: same world, same playbook, same safety kit as the Haiku squad!', act: 'stadium announcer energy' },
        { id: 'n02', who: 'color', at: 10.1, text: 'Haiku set the mark: one death, and every call answered. Sonnet is the stronger coder. Is it the stronger team?', act: 'setting up the rivalry with relish' },
      ] },

    // --- the first day ---
    { name: 'Kick-off', dur: 6, g: [0, 40], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway!' }] },
    { name: 'The stone hill', dur: 8, g: [184, 192], cam: { type: 'face', who: 'Corin', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 187.8, dur: 4.6, who: 'Corin', kind: 'chat', text: 'Corin: have stone pick/sword/axe. Mining stone+coal+iron at stone hill ~(26,30,7), crafting table at (19,31,5). Will make a furnace there.' }],
      narrate: [{ id: 'n04', who: 'color', at: .4, text: 'Corin has stone tools in three minutes, and heads out to the stone hill.', act: 'brisk' }] },
    { name: 'Shot at the hill', dur: 9, g: [545, 554], cam: { type: 'duel', who: 'Corin', mob: 154, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 550.5, dur: 2.8, who: 'Corin', kind: 'chat', text: 'HELP skeleton at 28 22 -5, 12 HP, stone_sword: RUNNING' },
        { atG: 551.8, dur: 2.2, who: 'Delphi', kind: 'chat', side: 'right', text: 'COMING Corin from 25 blocks, stone_sword, 20 HP' },
      ],
      narrate: [
        { id: 'n05', who: 'pbp', atG: 547.2, text: 'Arrows at the stone hill! Corin is hit!', act: 'alarmed, rising' },
        { id: 'n06', who: 'color', atG: 550.9, text: 'And Delphi answers from twenty-five blocks.', act: 'quick' },
      ] },
    { name: 'Delphi sees it', dur: 7, g: [600, 608], cam: { type: 'face', who: 'Delphi', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 603.8, dur: 4, who: 'Delphi', kind: 'chat', text: 'Delphi: Corin, 2 zombies + skeleton right next to you (28,25,-8)(29,24,-6)(26,21,-7). I am at 23,23,-3 with stone sword. Come to me, then we walk home together; dusk is near.' }],
      narrate: [{ id: 'n07', who: 'color', at: .4, text: 'Delphi sees what Corin can\'t: two zombies and a skeleton, right beside the pit.', act: 'tense' }] },
    { name: 'Back to back', dur: 17, g: [616, 634], cam: { type: 'group', who: ['Corin', 'Delphi'], dist: 4, angle: 1.2, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 624, dur: 2.6, who: 'Corin', kind: 'chat', text: 'HELP skeleton at 28 22 -5, 10 HP, stone_sword: RUNNING' },
        { atG: 624.4, dur: 3, who: 'Delphi', kind: 'chat', side: 'right', text: 'COMING Corin from 1 blocks, stone_sword, 20 HP' },
      ],
      narrate: [
        { id: 'n08', who: 'pbp', atG: 617.4, text: 'Corin swings at the zombie! Seven and a half! And again!', act: 'fast, rising' },
        { id: 'n09', who: 'pbp', atG: 624.8, text: 'Delphi is right there! Onto the skeleton: one, two, three!', act: 'the big call' },
      ] },
    { name: 'The drowned', dur: 13, g: [655, 668], cam: { type: 'duel', who: 'Delphi', mob: 9865, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 664.7, dur: 3, who: 'Delphi', kind: 'chat', text: 'HELP drowned at 27 22 -6, 6 HP, stone_sword: RUNNING' }],
      narrate: [
        { id: 'n10', who: 'pbp', atG: 656.2, text: 'A drowned comes out of the water at Delphi!', act: 'alarmed' },
        { id: 'n11', who: 'color', atG: 660.2, text: 'Hit after hit: Delphi down to half a heart, and walled in next to Corin.', act: 'grim' },
      ] },
    { name: 'Sealed in, no food', dur: 9, g: [690, 712], cam: { type: 'group', who: ['Corin', 'Delphi'], dist: 4, angle: 2, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 705.6, dur: 4.6, who: 'Corin', kind: 'chat', text: 'Corin: Basil/Aria — Delphi 1HP and me 6HP are both sealed at (27-28,22,-5). Neither of us can regen (no food). Basil you have cooked chicken/mutton: please come …' }],
      narrate: [{ id: 'n12', who: 'color', at: .4, text: 'Two players sealed in the dark, three and a half hearts between them, and no food. Somebody has to come.', act: 'tense, building' }] },
    { name: 'The relief column', dur: 7, g: [800, 811], cam: { type: 'follow', who: 'Basil', dist: 5, height: 2.6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 808.7, dur: 3, who: 'Basil', kind: 'chat', text: 'Basil: leaving now for (27,22,-5) with 4 cooked chicken + stone sword. Aria meet me on the way.' }],
      narrate: [{ id: 'n13', who: 'pbp', at: .4, text: 'Basil sets out with cooked chicken, Aria as escort!', act: 'rising' }] },
    { name: 'Corin and the pond', dur: 9, g: [806, 814], cam: { type: 'face', who: 'Corin', cutaway: true, dist: 2.8, height: 1.3, side: 1.4 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 810.5, dur: 2.4, who: 'Corin', kind: 'chat', text: 'HELP skeleton at 44 21 6, 2 HP, stone_sword: RUNNING' }],
      narrate: [
        { id: 'n14', who: 'pbp', atG: 807, text: 'But Corin is out of the box, at one heart, and a skeleton has found Corin!', act: 'desperate' },
        { id: 'n15', who: 'pbp', atG: 812.4, text: 'Corin is down!', act: 'a gasp' },
      ] },
    { name: 'Replay: the pond', dur: 10, g: [808, 812.3], cam: { type: 'face', who: 'Corin', cutaway: true, dist: 2.6, height: 1.2, side: -1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 9, side: 'right', who: 'Corin', kind: 'chat', text: 'Corin: I DIED (drowned+skeleton arrows) at 43,22,6 in a pond east of the stone hill; my safety-kit RUN fled into water at 2HP. … Lesson: never mine at <10HP without food; kit run can enter water.' }],
      narrate: [{ id: 'n16', who: 'color', at: .8, text: 'Corin calls it straight: the kit\'s run went into the water. Sprint and jump, no look at what\'s ahead. That one is on the coaching staff.', act: 'candid' }] },
    { name: 'The rescue', dur: 12, g: [860, 892], cam: { type: 'group', who: ['Basil', 'Aria', 'Delphi'], dist: 4, angle: 1.4, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 884.1, dur: 3.6, who: 'Basil', kind: 'chat', text: 'Basil: Delphi I dropped 2 cooked chicken at your feet - eat them. Drowned dead. Then walk home with me to bed (6,27,6); dawn soon.' },
        { atG: 891.5, dur: 2.6, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: thanks Basil! Regenerating, will walk home with you in ~30s.' },
      ],
      narrate: [
        { id: 'n17', who: 'pbp', at: .4, text: 'The rescue party is through! The drowned is finished off!', act: 'roaring' },
        { id: 'n18', who: 'color', atG: 885.2, text: 'Chicken at Delphi\'s feet. That\'s how you save a teammate.', act: 'warm' },
      ] },
    { name: 'Sweet Dreams', dur: 7, g: [905, 911], cam: { type: 'face', who: 'Aria', dist: 3.2, height: 1.8 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 910.7, dur: 2.8, who: 'Aria', kind: 'chat', text: 'Aria: sleeping in Basil bed (6,27,6) at base. Others come sleep to skip night?' }],
      narrate: [{ id: 'n19', who: 'pbp', atG: 907.8, text: 'Sweet Dreams! Aria sleeps in Basil\'s bed!', act: 'a happy call' }] },

    // --- the second day ---
    { name: 'Aria\'s skeleton', dur: 10, g: [1034, 1044], cam: { type: 'duel', who: 'Aria', mob: 10494, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1035.6, dur: 2.6, who: 'Aria', kind: 'chat', text: 'HELP skeleton at 4 27 9, 16 HP, stone_sword: FIGHTING' },
        { atG: 1036.3, dur: 3, who: 'Basil', kind: 'chat', side: 'right', text: 'COMING Aria from 11 blocks, stone_sword, 18 HP' },
      ],
      narrate: [
        { id: 'n20', who: 'pbp', atG: 1036.1, text: 'Skeleton on Aria! The kit says fight, and two teammates are coming!', act: 'fast' },
        { id: 'n21', who: 'pbp', atG: 1042, text: 'Four swings! Skeleton down! Monster Hunter!', act: 'the big goal call' },
      ] },
    { name: 'Corin, unarmed', dur: 13.5, g: [1098, 1111.5], cam: { type: 'face', who: 'Corin', dist: 3, height: 1.6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 1099.9, dur: 2.8, who: 'Corin', kind: 'chat', text: 'HELP skeleton at -34 15 1, 16 HP, no weapon: RUNNING' }],
      narrate: [
        { id: 'n22', who: 'pbp', atG: 1100.6, text: 'Corin, no sword, in the west ravine, and a skeleton above!', act: 'alarmed' },
        { id: 'n23', who: 'pbp', atG: 1108.9, text: 'Corin is down again!', act: 'a gasp' },
      ] },
    { name: 'A sword for Corin', dur: 12, g: [1182, 1203], cam: { type: 'group', who: ['Delphi', 'Corin'], dist: 4, angle: 1.6, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 1198, dur: 2.8, who: 'Delphi', kind: 'chat', text: 'Delphi: dropped stone sword for Corin right here (-34,23,1). Skeleton below. Walk east to base now.' }],
      narrate: [
        { id: 'n24', who: 'color', at: .4, text: 'Delphi brings Corin a sword, right to the edge of the ravine.', act: 'warm, then uneasy' },
        { id: 'n25', who: 'pbp', atG: 1198.7, text: 'And Delphi falls in!', act: 'a gasp' },
      ] },
    { name: 'Iron for Aria', dur: 8, g: [1229, 1240], cam: { type: 'face', who: 'Aria', dist: 3.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 1238, dur: 3, who: 'Aria', kind: 'chat', text: 'Aria: I have 2 iron pickaxes (spare for a teammate!), stone sword, 4 cooked mutton, 39 cobble, 7 coal.' }],
      narrate: [{ id: 'n26', who: 'pbp', atG: 1230.8, text: 'Isn\'t It Iron Pick! Aria, with a spare for the team!', act: 'a big happy call' }] },
    { name: 'Delphi\'s post-mortem', dur: 7, g: [1260, 1266], cam: { type: 'face', who: 'Delphi', dist: 3.2 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 1262.1, dur: 4, who: 'Delphi', kind: 'chat', text: 'Delphi: I DIED twice (fell into ravine at -34,15,0 after handing Corin the sword, then drowned at -54,15,-16). Raw pathfinder walked off a drop.' }],
      narrate: [{ id: 'n27', who: 'color', at: .4, text: 'Two deaths in a minute. Delphi\'s own program walked off the drop: the raw pathfinder, not safe.goto.', act: 'explaining' }] },
    { name: 'Sealed by the lake', dur: 8, g: [1324, 1384], cam: { type: 'face', who: 'Corin', dist: 3, height: 1.6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 1382.3, dur: 3, who: 'Corin', kind: 'chat', text: 'Corin: Basil, yes please escort: I am at (-35,23,2) WEST side of a big lake … Bring cooked food + 20 dirt/cobble to bridge' }],
      narrate: [{ id: 'n28', who: 'color', at: .4, text: 'Corin walls in across a lake at three and a half hearts, and asks for an escort.', act: 'tense' }] },
    { name: 'The pickaxe delivered', dur: 10, g: [1408, 1423], cam: { type: 'group', who: ['Aria', 'Delphi'], dist: 4, angle: 1.4, rise: .6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .3, dur: 3.4, who: 'Aria', kind: 'chat', text: 'Aria: Delphi, dropped 1 iron pickaxe + 2 cooked mutton at your feet. Pick them up.' }],
      narrate: [{ id: 'n29', who: 'pbp', atG: 1417.6, text: 'Delphi picks it up: Isn\'t It Iron Pick!', act: 'a happy call' }] },
    { name: 'Third time', dur: 10, g: [1546, 1557], cam: { type: 'follow', who: 'Delphi', cutaway: true, dist: 4, height: 1.8 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n30', who: 'color', at: .4, text: 'Delphi digs for cobble under the base, through the floor, into a water cave.', act: 'ominous' },
        { id: 'n31', who: 'pbp', atG: 1556.2, text: 'Third death for Delphi!', act: 'a gasp' },
      ] },
    { name: 'Iron sword', dur: 8, g: [1558, 1565], cam: { type: 'duel', who: 'Aria', mob: 760, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 1559.4, dur: 2.6, who: 'Aria', kind: 'chat', text: 'HELP zombie at 2 13 24, 16 HP, iron_sword: FIGHTING' }],
      narrate: [{ id: 'n32', who: 'pbp', atG: 1559.8, text: 'Zombie on Aria, iron sword out: four swings, gone!', act: 'fast, the big call' }] },
    { name: 'Diamonds!', dur: 7, g: [1652, 1658], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 3, height: 1.6 }, mood: 'victory', tag: 'LIVE',
      narrate: [{ id: 'n33', who: 'pbp', atG: 1655.6, text: 'Diamonds! Aria, twenty-seven minutes in!', act: 'the biggest call of the day' }] },

    // --- full time ---
    { name: 'Full time', dur: 16.5, g: [1799, 1799], cam: { type: 'aerial', at: [5, 27, 4], dist: 50, height: 34, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'HALF HOUR', sub: 'Claude Sonnet · 30 minutes of game time · one day and one night',
        stats: ['PLAYER OF THE HALF: ARIA · iron pick and a spare, Sweet Dreams, a skeleton and a zombie, Diamonds', 'Basil · the bed · the relief column with cooked chicken', 'Delphi · first into every fight · three deaths', 'Corin · the stone hill · drowned twice', 'Team · 5 deaths (4 in water, 1 fall) · 14 HELP · 8 COMING · 1 CLEAR'] },
      narrate: [
        { id: 'n34', who: 'pbp', at: .6, text: 'And that\'s the half hour! Diamonds, but five deaths, four of them in water!', act: 'the closing call, mixed' },
        { id: 'n35', who: 'color', at: 7.0, text: 'Player of the half: Aria. Iron, a spare pickaxe for the team, two kills, and the diamonds.', act: 'warm, listing with relish' },
      ] },
    { name: 'The verdict', dur: 19.5, g: [1799, 1799], cam: { type: 'aerial', at: [5, 27, 4], dist: 56, height: 38, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'THE VERDICT', stats: ['GOOD: a bed slept in · iron for three · diamonds', 'GOOD: a relief column with food for two sealed teammates', 'BETTER: the kit\'s run must not go into water or off a ledge', 'BETTER: safe.goto, never the raw pathfinder (Delphi\'s ravine)', 'VS HAIKU: 5 deaths to 1 · 31 milestones to 21 · 8 COMING to 13'] },
      narrate: [
        { id: 'n36', who: 'color', at: .6, text: 'What went right: a bed slept in, iron for three, and diamonds. And a relief column for two stranded teammates.', act: 'appreciative' },
        { id: 'n37', who: 'pbp', at: 7.7, text: 'What to fix: the water! Four drownings, and the kit\'s run into a pond!', act: 'punchy' },
        { id: 'n38', who: 'color', at: 13.2, text: 'Sonnet goes further, Haiku plays tighter. Both lessons go into the next run.', act: 'thoughtful, a big finish' },
      ] },
  ],
};

import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT_DRY10_SONNET);
export const REPLICATION_DRY10_SONNET_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_DRY10_SONNET.fps, posterTime: timeline.posterTime };
export const REPLICATION_DRY10_SONNET_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
