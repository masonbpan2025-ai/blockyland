// The edit of the replication film (replicationFilm.js): the first 30 minutes of four Claude agents (Sonnet 5.5) playing
// survival Blockyland together toward the Ender Dragon, run sonnet30 (replication/runs/sonnet30, 2026-11-04), called as
// a sports broadcast. Scenes map film time onto stretches of game time (seconds from the start of the run); `atG`
// places a call at a moment of game time.
//
// Every quote is an agent's own, from the run: its chat (events.jsonl), its working notes between actions (its
// transcript) and the team's shared notes (workspaces/shared). "…" marks a cut. Facts checked against the log:
// milestones and deaths with their times, final kits from the last save, and Corin's death in lava (see
// replication/film/build.mjs CORRECTIONS).
//
// The two voices (scripts/narrate-replication.mjs): `pbp` calls the play, `color` explains it.

export const COMMENTATORS = {
  pbp: { oa: 'ash', edge: 'en-US-GuyNeural', persona: 'the play-by-play commentator of a live esports broadcast of a block-building survival game played by four AI agents: young, loud, fast and punchy; a milestone gets a call like a goal, a death a gasp' },
  color: { oa: 'coral', edge: 'en-US-JennyNeural', persona: 'the colour commentator and analyst on the same broadcast: quick, sharp and animated, explains the agents\' strategy, code and teamwork with excitement and a grin, never slow or dreamy' },
};

export const REPLICATION_EDIT = {
  id: 'replication-sonnet30',
  title: 'The Agent Expedition',
  data: '/cinema-replication/sonnet30',
  fps: 30,
  posterTime: 30,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: diamonds', dur: 4, g: [423.5, 425.5], cam: { type: 'face', who: 'Corin', cutaway: true, dist: 3.2 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Diamonds, seven minutes in!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: the long night', dur: 3.6, g: [762, 766], cam: { type: 'follow', who: 'Delphi', cutaway: true, dist: 5, height: 1.6 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'A night to forget!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: the plan', dur: 3.6, g: [140, 143], cam: { type: 'group', who: ['Aria', 'Basil'], angle: 1.2, rise: .6 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'And four AIs who have to work it out together!', act: 'teasing, building to the title' }] },

    // --- the line-up ---
    { name: 'Line-up', dur: 16.5, g: [0, 4], cam: { type: 'aerial', at: [4, 26, -4], dist: 45, height: 30, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION', sub: 'Four Claude agents · one survival world · one goal: defeat the Ender Dragon',
        roles: { Aria: ['Food and stone tools'], Basil: ['Wood and crafting', 'The planner'], Corin: ['Iron and coal'], Delphi: ['Explorer: Nether and stronghold'] } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .8, text: 'Welcome to the Agent Expedition! Aria, Basil, Corin and Delphi: four Claude agents, one brand-new world!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 9.2, text: 'The goal is to beat the Ender Dragon. No buttons: every move is code they write themselves.' },
      ] },

    // --- kick-off ---
    { name: 'Kick-off', dur: 7, g: [0, 30], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .4, dur: 6.2, who: 'Aria', kind: 'thought', text: 'Starting by gathering wood. The shared folder is empty and all four of us are at spawn.' }],
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway! Day one, the clock is running!' }] },
    { name: 'First wood', dur: 9, g: [30, 110], cam: { type: 'follow', who: 'Aria', dist: 6, height: 3.5 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .4, dur: 7.2, who: 'Aria', kind: 'code', text: 'for (let i = 0; i < 8; i++) {\n  const b = bot.findBlock({ matching: x => x.name.endsWith(\'_log\') })\n  await bot.pathfinder.goto(new goals.GoalNear(b.position…, 2))\n  await bot.dig(bot.blockAt(b.position)); got++\n}' }],
      narrate: [{ id: 'n04', who: 'color', at: .5, text: 'Here’s Aria’s first wood program: find a log, walk to it, chop it, eight times. Eight logs in seventy seconds!' }] },
    { name: 'Basil calls the plays', dur: 9, g: [138, 150], cam: { type: 'face', who: 'Basil', dist: 3.4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 8.4, who: 'Basil', kind: 'chat', text: 'Suggest: Aria=food/stone tools, Corin=iron/coal, Delphi=explore; I do wood+crafting table. Notes in shared/plan.md' }],
      narrate: [{ id: 'n05', who: 'pbp', at: .4, text: 'Basil takes charge! Wood for him, food for Aria, iron for Corin, and Delphi goes exploring!', act: 'excited, like a captain calling a set play' }] },
    { name: 'Stone Age', dur: 7, g: [130, 162], cam: { type: 'group', angle: 2.4, rise: .8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n06', who: 'pbp', at: .6, text: 'Stone Age! Stone Age! Stone Age! They’re falling like dominoes!', act: 'rapid, gleeful' }] },

    // --- the first lesson ---
    { name: 'Basil stuck', dur: 9, g: [172, 183.9], cam: { type: 'face', who: 'Basil', cutaway: true, dist: 3 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n07', who: 'color', at: .3, text: 'Wait, where’s Basil? He’s inside the rock, and his health is falling!', act: 'alarmed' },
        { id: 'n08', who: 'pbp', at: 4.6, text: 'Basil can’t get out! He’s suffocating in the wall!', act: 'a gasp, rising' },
      ] },
    { name: 'Replay: two programs', dur: 9.6, g: [178, 183.4], cam: { type: 'face', who: 'Basil', cutaway: true, dist: 3.2, side: -1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .6, dur: 7.8, who: 'Basil', kind: 'thought', text: 'I died earlier (suffocated, apparently because two of my programs ran at once) and lost my tools.' }],
      narrate: [{ id: 'n09', who: 'color', at: 1.0, text: 'Here’s the catch in this game. A program that times out keeps on running. Basil started a new one, and the old one dug him into a wall.', act: 'explaining a key rule with relish' }] },

    // --- Corin's rush ---
    { name: 'Corin goes for iron', dur: 8, g: [296, 340], cam: { type: 'follow', who: 'Corin', dist: 6, height: 3.4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Corin', kind: 'code', text: 'await H.go(tb.position.x, tb.position.y, tb.position.z, 3)\nawait H.craft(\'iron_pickaxe\', 1, tb)\nawait H.craft(\'iron_sword\', 1, tb)' }],
      narrate: [{ id: 'n10', who: 'pbp', at: .3, text: 'Corin is flying! Iron smelted, iron pickaxe, iron sword, five and a half minutes in!' }] },
    { name: 'Corin digs down', dur: 7, g: [345, 421], cam: { type: 'follow', who: 'Corin', cutaway: true, dist: 5, height: 2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n11', who: 'color', at: .4, text: 'And now he digs. His pathfinder may dig through anything, and it goes straight down after the ore. Down to the bedrock.' }] },
    { name: 'Diamonds!', dur: 8.6, g: [423, 427], cam: { type: 'face', who: 'Corin', cutaway: true, dist: 4.2, height: 2.2 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n12', who: 'pbp', atG: 424.9, text: 'Diamonds! Corin has diamonds! The first diamonds of the expedition!', act: 'the big goal call, total joy' }] },
    { name: 'The lava', dur: 13.5, g: [446, 458], cam: { type: 'fixed', who: 'Corin', from: [3, 4, -2], at: [-2.5, 1.6, -7.5], cutaway: true, fov: 55 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n13', who: 'color', at: .3, text: 'But look where he’s standing. Y one, on the bedrock, and there’s lava in the rock right beside him!', act: 'worried, rising' },
        { id: 'n14', who: 'pbp', atG: 454.5, text: 'The lava pours in! Corin is gone, and the diamonds go with him!', act: 'anguished call' },
      ] },
    { name: 'Replay: the lava', dur: 10, g: [451, 456.9], cam: { type: 'face', who: 'Corin', cutaway: true, dist: 3.4, side: -1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .6, dur: 7.8, who: 'Corin', kind: 'note', text: 'pathfinder with canDig digs straight down to y=1 chasing ores near spawn … cap depth, don\'t mine below y~10 casually … stash spare tools in a chest at spawn.' }],
      narrate: [{ id: 'n15', who: 'color', at: 1.0, text: 'Twenty health gone in two seconds. And Corin writes the lesson for the whole team: cap your depth, and keep spare tools in a chest.', act: 'admiring the honesty' }] },

    // --- the middle game ---
    { name: 'Delphi’s iron', dur: 8, g: [574, 592], cam: { type: 'follow', who: 'Delphi', dist: 6, height: 3.4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Delphi', kind: 'chat', text: 'iron pickaxe done. Heading to mine more iron (bucket/armor) then diamonds below y14. Table+furnace near (8,29,-2).' }],
      narrate: [{ id: 'n16', who: 'pbp', at: .3, text: 'Delphi has iron too, and tells everyone where the furnace is. That’s team play!' }] },
    { name: 'Night falls', dur: 7, g: [560, 700], cam: { type: 'aerial', dist: 50, height: 34, spin: .3, angle: .6 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n17', who: 'color', at: .4, text: 'And here comes the night. Skeletons, zombies, creepers, and nobody has built a shelter.', act: 'ominous but quick' }] },
    { name: 'Delphi’s long night', dur: 15, g: [740, 960], cam: { type: 'aerial', at: [-3, 26, 8], dist: 26, height: 24, spin: .2, angle: .8 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n18', who: 'pbp', at: .3, text: 'A skeleton gets Delphi!', act: 'a gasp' },
        { id: 'n19', who: 'pbp', at: 3.0, text: 'And again! And she drowns!', act: 'disbelief' },
        { id: 'n20', who: 'color', at: 6.4, text: 'Every time she respawns, she walks straight back into the dark!', act: 'bewildered, fast' },
        { id: 'n21', who: 'pbp', at: 10.6, text: 'Seven deaths in one night! Somebody stop this!', act: 'half laughing, half horrified' },
      ] },
    { name: 'Delphi works it out', dur: 10, g: [1240, 1252], cam: { type: 'face', who: 'Delphi', dist: 3.4 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .3, dur: 9.4, who: 'Delphi', kind: 'chat', text: 'bad news, I died several times to skeletons at night (a runaway mining loop) and lost my kit … Lesson: timed-out programs keep running, add abort flags.' }],
      narrate: [{ id: 'n22', who: 'color', at: .6, text: 'She works it out herself. An old mining loop was still running, marching her back to the skeletons. And she tells the team.', act: 'impressed' }] },

    // --- the quiet achiever ---
    { name: 'Aria suits up', dur: 10, g: [828, 834], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 5, height: 2 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n23', who: 'pbp', atG: 830.9, text: 'And quietly, Aria! Iron pickaxe, iron helmet: Suit Up!', act: 'a big happy call' }] },
    { name: 'The shared notes', dur: 10, g: [1300, 1400], cam: { type: 'aerial', dist: 45, height: 32, spin: .3, angle: 2.6 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .3, dur: 9.4, who: 'Aria', kind: 'note', text: 'Have iron pickaxe, iron sword, iron helmet, bucket, 64+ cobble, 6 coal … Next: food (animals), then diamonds/obsidian help. Someone needs diamond pickaxe for obsidian (Corin found diamonds).' }],
      narrate: [{ id: 'n24', who: 'color', at: .5, text: 'This is the teamwork. One shared notes file: bases, furnaces, dangers, lessons. And Aria is already thinking about obsidian and the Nether.', act: 'enthusiastic' }] },
    { name: 'Late drama', dur: 10, g: [1460, 1560], cam: { type: 'group', angle: 1.2, rise: .9 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n25', who: 'pbp', at: .3, text: 'Late drama! Corin drowns! Basil drowns!', act: 'quick-fire' },
        { id: 'n26', who: 'color', at: 4.5, text: 'Basil’s old hunting program again, still chasing chickens after he’d moved on.', act: 'wry' },
      ] },

    // --- full time ---
    { name: 'Full time', dur: 15, g: [1796, 1796], cam: { type: 'aerial', at: [4, 26, -6], dist: 55, height: 38, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'HALF HOUR', sub: '30 minutes of game time · one day and one night · the dragon still waits',
        stats: ['PLAYER OF THE HALF: ARIA · iron sword, pickaxe, helmet, bucket', 'Corin · first iron pick (5:37), first diamonds (7:05)', 'Basil · the plan and the shared notes', 'Delphi · iron pick, then seven deaths in one night', 'Team · 4 × Stone Age · 4 × iron pick · 11 deaths · Nether: not yet'] },
      narrate: [
        { id: 'n27', who: 'pbp', at: .6, text: 'And that’s the half hour! The dragon lives to fight another day!', act: 'the closing call' },
        { id: 'n28', who: 'color', at: 5.3, text: 'Player of the half: Aria. No deaths, and the best kit in the team: iron sword, iron pickaxe, iron helmet.' },
      ] },
    { name: 'The verdict', dur: 18, g: [1796, 1796], cam: { type: 'aerial', at: [4, 26, -6], dist: 60, height: 40, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'THE VERDICT', stats: ['GOOD: split the work · shared bases, furnaces and dangers · reported every failure', 'GOOD: reusable helpers in code · iron for all four in 16 minutes', 'BETTER: stop old programs before starting new ones', 'BETTER: a shelter or bed before night · spare tools in a chest', 'BETTER: never dig to bedrock beside lava'] },
      narrate: [
        { id: 'n29', who: 'color', at: .6, text: 'What went right: they split the work, shared what they found, and owned every mistake.' },
        { id: 'n30', who: 'pbp', at: 6.0, text: 'What to fix: kill your old programs! Most of those eleven deaths were runaway code.', act: 'punchy' },
        { id: 'n31', who: 'color', at: 11.8, text: 'Build a shelter before night, keep spares in a chest, and next time we’re going to the Nether!', act: 'big finish, upbeat' },
      ] },
  ],
};

// For scripts/render-film.mjs: the film's length and frame rate, and the frames its preview reviews (one per scene).
import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT);
export const REPLICATION_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT.fps, posterTime: timeline.posterTime };
export const REPLICATION_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
