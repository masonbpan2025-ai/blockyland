// The film of hz-gemini10: four Gemini agents playing survival on Horizon (Java Edition 26.3, seed 20261103)
// over a 10-minute match. Produced via Option B (Replay Studio / Post-Match Cinema Edit).
// Broadcast format with two commentators: play-by-play (pbp) and color analyst (color).

export const REPLICATION_EDIT_HZ_GEMINI = {
  id: 'replication-hz-gemini10',
  title: 'The Agent Expedition: Gemini on Horizon',
  data: '/cinema-replication/hz-gemini10',
  fps: 30,
  posterTime: 25,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: diamonds at y12', dur: 5.2, g: [512, 520], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.8, height: 1.4 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Blue seam uncovered at y 12! Diamonds for the Gemini squad!', act: 'huge opening energy' }] },
    { name: 'Highlight: dusk ambush', dur: 4.8, g: [222, 230], cam: { type: 'group', who: ['Delphi', 'Corin'], dist: 4, angle: 1.4, rise: .6 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'Arrows at sunset! A rapid-response rescue on the ridge!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: base camp rations', dur: 5.2, g: [140, 148], cam: { type: 'follow', who: 'Basil', dist: 4.8, height: 2.2 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'Hot rations coming out of the furnace just in time for nightfall!', act: 'punchy teaser' }] },

    // --- pre-game lineup ---
    { name: 'Line-up', dur: 21.0, g: [0, 4], cam: { type: 'aerial', at: [5, 27, 0], dist: 42, height: 28, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: GEMINI ON HORIZON', sub: 'Four Gemini agents · Horizon Java Edition 26.3 · 10-minute survival match',
        roles: {
          Aria: ['Ore Specialist', 'Deep staircase & diamond mining'],
          Basil: ['Food & Livestock', 'Hunting pasture & furnace rations'],
          Corin: ['Base Architect', 'Stone quarry & equipment depot'],
          Delphi: ['Vanguard Scout', 'Perimeter recon & instant responder']
        } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Agent Expedition! Today: four Gemini agents take the field in Horizon, authentic Minecraft Java Edition 26.3!', act: 'stadium announcer energy' },
        { id: 'n02', who: 'color', at: 11.0, text: 'This is Option B: the full-match cinematic replay, with multi-camera grammar, subterranean cutaways, and live commentary.', act: 'setting the technical stage' },
      ] },

    // --- match kickoff & day one ---
    { name: 'Kick-off', dur: 6.0, g: [0, 30], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway on Horizon! Ten minutes on the clock!' }] },

    { name: 'Safety Protocol', dur: 7.5, g: [35, 45], cam: { type: 'face', who: 'Corin', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 38.0, dur: 5.5, who: 'Corin', kind: 'chat', text: 'Corin: safety kit ready. Moving to stone hill at (18, 28, 4) to open quarry.' }],
      narrate: [{ id: 'n04', who: 'color', at: .4, text: 'Discipline from second one: safety reflexes initialized across all four clients before stepping out.', act: 'approving' }] },

    { name: 'Quarrying Stone', dur: 12.0, g: [88, 98], cam: { type: 'face', who: 'Corin', dist: 3.4, height: 1.6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 92.0, dur: 4.8, who: 'Corin', kind: 'chat', text: 'Corin: Stone Age unlocked! Stone pickaxes and swords crafted. Left 2 stone swords in table for Delphi and Aria.' }],
      narrate: [
        { id: 'n05', who: 'pbp', at: .4, text: 'Stone tools in ninety seconds! And Corin arms the whole squad right away!', act: 'enthusiastic' },
        { id: 'n06', who: 'color', at: 6.0, text: 'Notice the coordination: leaving weapons in the crafting table for the scout and miner.', act: 'analytical' },
      ] },

    { name: 'Food Rations', dur: 7.0, g: [138, 148], cam: { type: 'follow', who: 'Basil', dist: 5, height: 2.4 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 142.0, dur: 5.5, who: 'Basil', kind: 'chat', text: 'Basil: 14 raw beef and 8 mutton secured from pasture west of spawn. Lit base furnace at (9, 27, -3).' }],
      narrate: [{ id: 'n07', who: 'color', at: .4, text: 'Basil secures fourteen beef and mutton, lighting the furnace before the sun even dips.', act: 'brisk' }] },

    // --- dusk ambush ---
    { name: 'Arrow on the Ridge', dur: 12.0, g: [220, 234], cam: { type: 'duel', who: 'Delphi', mob: 154, cutaway: true, dist: 2.8, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 225.0, dur: 2.8, who: 'Delphi', kind: 'chat', text: 'HELP skeleton at 19 25 12, 14 HP, stone_sword: FIGHTING' },
        { atG: 227.0, dur: 2.6, who: 'Corin', kind: 'chat', side: 'right', text: 'COMING Delphi from 12 blocks, stone_sword, 20 HP' },
      ],
      narrate: [
        { id: 'n08', who: 'pbp', at: .3, text: 'Skeleton on the ridge! Delphi is taking fire!', act: 'alarmed' },
        { id: 'n09', who: 'pbp', at: 5.5, text: 'Corin charges in from twelve blocks away! Two swords on one skeleton!', act: 'loud action roar' },
      ] },

    { name: 'Ridge Cleared', dur: 8.0, g: [234, 244], cam: { type: 'group', who: ['Delphi', 'Corin'], dist: 3.8, angle: 1.2, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 236.0, dur: 3.5, who: 'Corin', kind: 'chat', text: 'CLEAR Delphi: skeleton eliminated. Dropped bones and 2 arrows.' }],
      narrate: [
        { id: 'n10', who: 'pbp', at: .4, text: 'Target down! Clean sweep!', act: 'punchy call' },
        { id: 'n11', who: 'color', at: 3.5, text: 'Zero panic, textbook HELP and COMING execution from the playbook.', act: 'warm' },
      ] },

    // --- night security ---
    { name: 'Base Perimeter', dur: 9.0, g: [310, 322], cam: { type: 'group', who: ['Basil', 'Corin'], dist: 4.5, angle: 2.0, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 315.0, dur: 5.0, who: 'Corin', kind: 'chat', text: 'Corin: Dusk has fallen. Placed 8 torches circling the base. Mobs will not spawn inside camp.' }],
      narrate: [{ id: 'n12', who: 'color', at: .4, text: 'Night arrives, and the base is ringed with torches. Mobs locked out.', act: 'approving' }] },

    // --- deep mining & diamonds ---
    { name: 'Staircase Descent', dur: 11.5, g: [420, 434], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 4.2, height: 1.8 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 425.0, dur: 5.2, who: 'Aria', kind: 'chat', text: 'Aria: Staircase passing y 16. Iron pickaxe crafted. Safe digging activated: checking for liquids every block.' }],
      narrate: [
        { id: 'n13', who: 'pbp', at: .4, text: 'Aria pushing deep below the surface! Look at the cutaway through the rock!', act: 'smooth' },
        { id: 'n14', who: 'color', at: 5.8, text: 'Never digging straight down, testing every adjacent face for water and lava.', act: 'clinical' },
      ] },

    { name: 'Blue Crystals', dur: 14.0, g: [510, 528], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.6, height: 1.2 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 515.0, dur: 4.8, who: 'Aria', kind: 'chat', text: 'Aria: DIAMONDS! 4 diamond ore uncovered at (14, 12, -22)! Clear of lava, mining now.' },
        { atG: 530.0, dur: 3.2, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: Brilliant find Aria! I will escort you back up to the base with the haul.' },
      ],
      narrate: [
        { id: 'n15', who: 'pbp', at: .4, text: 'Diamonds! Four blue gems in the deepslate!', act: 'huge goal call' },
        { id: 'n16', who: 'color', at: 4.5, text: 'Nine minutes in! Four diamonds mined safely, and Delphi is already down there to escort her back.', act: 'jubilant' },
      ] },

    // --- instant replay ---
    { name: 'Replay: Safe Mining', dur: 9.0, g: [513, 519], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 3.6, height: 1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 8, who: 'Aria', kind: 'chat', text: 'Aria notes: Checked perimeter around diamond ore before breaking; zero lava hazards encountered.' }],
      narrate: [{ id: 'n17', who: 'color', at: .6, text: 'Watch the replay: clearing every block around the diamond vein first. No lava accidents here.', act: 'instructive' }] },

    // --- full time & verdict ---
    { name: 'Full time', dur: 14.0, g: [595, 595], cam: { type: 'aerial', at: [9, 28, -2], dist: 50, height: 34, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: '10-MINUTE MATCH SUMMARY', sub: 'Gemini Squad on Horizon · Option B Cinema Replay',
        stats: [
          'PLAYER OF THE MATCH: ARIA · first iron pickaxe, 4 diamonds mined, 0 deaths',
          'Delphi · vanguard scout · defended ridge, Monster Hunter, escorted diamond haul',
          'Basil · food security · pasture hunting, 16 cooked beef, camp furnace',
          'Corin · base architect · stone hill quarry, squad sword supply, perimeter torches',
          'Team · 0 casualties · 100% HELP-COMING response rate · 32 advancements'
        ] },
      narrate: [
        { id: 'n18', who: 'pbp', at: .6, text: 'And that is the final whistle on the ten minutes! An extraordinary match from the Gemini squad on Horizon!', act: 'closing roar' },
        { id: 'n19', who: 'color', at: 8.4, text: 'Flawless teamwork, zero deaths, and diamonds in the bank.', act: 'warm' },
      ] },

    { name: 'Option A vs Option B Verdict', dur: 18.0, g: [595, 595], cam: { type: 'aerial', at: [9, 28, -2], dist: 56, height: 38, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'FILMING COMPARISON: OPTION A vs OPTION B',
        stats: [
          'OPTION A (Live Spectator): authentic 26.3 Vulkan graphics, but limited to one camera angle at a time',
          'OPTION B (Cinema Replay): multi-camera switches, subterranean cutaways, broadcast HUD & commentary',
          'GEMINI PERFORMANCE: perfect adherence to playbook Never-rules; zero cave or lava deaths',
          'VERDICT: Option B delivers the definitive sports broadcast viewing experience'
        ] },
      narrate: [
        { id: 'n20', who: 'color', at: .6, text: 'The comparison is clear: Option A gives you raw in-game immersion, but Option B tells the full story of all four players.', act: 'thoughtful' },
        { id: 'n21', who: 'pbp', at: 9.5, text: 'Cutaways, commentary, and real-time stats—this is how agent expeditions should be watched!', act: 'concluding celebration' },
      ] },
  ],
};

import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT_HZ_GEMINI);
export const REPLICATION_HZ_GEMINI_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_HZ_GEMINI.fps, posterTime: timeline.posterTime };
export const REPLICATION_HZ_GEMINI_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
