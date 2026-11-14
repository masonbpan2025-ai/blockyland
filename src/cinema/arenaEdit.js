// The edit of the team battle film (arenaFilm.js), cut as a sports broadcast: a cold open of highlights, the line-ups,
// then the match called live by two commentators, with slow-motion replays of the big moments and the score (players
// left on each side) always on screen. Each scene is a stretch of game time and a camera, with its captions (an agent's
// thinking, a team chat message, a head-to-head card) and commentary lines. Times inside a scene are seconds from the
// scene's start; `atG` places a line at a moment of game time instead (a call made as the blow lands).
// arenaTimeline() lays it all out on the film's clock.
//
// The game is arena-runs/game2 (its recording is copied to public/cinema-arena/game2). The words in "thought" and
// "chat" captions are the agents' own, from that game's log; "…" marks a cut. Every call was checked against the log:
// who hit whom, for how much, and who was left standing. Kills: Bree 2 (Juno, Fay), Ivo 2 (Dara, Bree), Cole 2 (Gus,
// Ivo), Juno 1 (Eli), Dara 1 (Hana). Cole wore the game's only armour, an iron chestplate, from 5:30.
//
// The two voices (scripts/narrate-arena.mjs): `pbp` calls the play, `color` explains it.

export const COMMENTATORS = {
  pbp: { oa: 'ash', edge: 'en-US-GuyNeural', persona: 'the play-by-play commentator of a live esports broadcast of a block-building survival battle game: young, loud, fast and punchy, riding every swing; on a big moment (a player knocked out) the call explodes like a goal call, with real joy and disbelief' },
  color: { oa: 'coral', edge: 'en-US-JennyNeural', persona: 'the colour commentator and analyst on the same live esports broadcast: quick, sharp and animated, explains the tactics with excitement, a grin in her voice, never slow or dreamy' },
};

export const ARENA_EDIT = {
  id: 'arena-5v5',
  title: 'Agent Arena: Red vs Blue',
  data: '/cinema-arena/game2',
  fps: 30,
  posterTime: 128,
  scenes: [
    // --- cold open: three highlights, none showing how they end ---
    { name: 'Highlight: the last duel', dur: 4.5, g: [439.0, 440.2], cam: { type: 'pair', a: 'Cole', b: 'Ivo', angle: 1.1 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Ten AI players. Two teams. One life each!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: Ivo’s stand', dur: 3.9, g: [363.6, 365.4], cam: { type: 'group', who: ['Ivo', 'Dara', 'Bree'], angle: .9 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'Ambushes! Iron swords! Two against one!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: first blood', dur: 3.2, g: [240.9, 242.5], cam: { type: 'pair', a: 'Juno', b: 'Eli', angle: .8, rise: .8, cutaway: true }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'And a finish you have to see!', act: 'teasing, building to the title' }] },

    // --- the line-ups ---
    { name: 'Line-ups', dur: 17, g: [0, 3], cam: { type: 'aerial', dist: 120, height: 75, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'AGENT ARENA', sub: 'Survival · five a side · no respawns · last team standing wins' },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Agent Arena! In red: Ash, Bree, Cole, Dara and Eli. In blue: Fay, Gus, Hana, Ivo and Juno!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 11.0, text: 'Ten Claude agents, every one thinking for itself. And in here, nobody respawns!' },
      ] },
    { name: 'The field', dur: 7.2, g: [3, 12], cam: { type: 'aerial', at: [0, 22, 0], dist: 70, height: 42, spin: .35, angle: .4 }, mood: 'calm', tag: 'PRE-GAME',
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'Here’s the field: two camps, two quarries, and the big prize, the iron-rich quarry right in the middle!' }] },
    { name: 'Red’s game plan', dur: 8, g: [6, 30], cam: { type: 'group', who: ['Ash', 'Bree', 'Cole', 'Dara', 'Eli'], angle: 2.6 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .4, dur: 7.4, who: 'Ash', kind: 'chat', text: 'Plan: R1-3 all get wood, stone tools. Bree+Cole mine iron/coal at our quarry … Stay grouped, fight as 5 vs enemies, don\'t wander alone. Centre diamonds later.' }],
      narrate: [{ id: 'n04', who: 'color', at: .5, text: 'Red’s captain Ash keeps it simple: stay together, fight as five.' }] },
    { name: 'Blue’s game plan', dur: 8, g: [6, 30], cam: { type: 'group', who: ['Fay', 'Gus', 'Hana', 'Ivo', 'Juno'], angle: -.6 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .4, dur: 7.4, who: 'Fay', kind: 'chat', side: 'right', text: 'Stay near base until ~round 12, then group up and move to centre together; fight 5 on 1 only.' }],
      narrate: [{ id: 'n05', who: 'pbp', at: .5, text: 'Blue’s captain Fay goes the other way: stay home, gear up, then push!' }] },

    // --- the build-up ---
    { name: 'Wood and stone', dur: 7, g: [30, 150], cam: { type: 'follow', who: 'Bree', dist: 7, height: 4 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n06', who: 'pbp', at: .3, text: 'And we are underway! Wood, pickaxes, stone tools. It’s a race for gear!' }] },
    { name: 'The iron runs out', dur: 8, g: [150, 200], cam: { type: 'follow', who: 'Eli', dist: 6, height: 3.5 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 3.5, who: 'Eli', kind: 'chat', text: 'Our quarry iron is used up. Proposing we all go to centre quarry (0,22,0) together for iron/diamond, moving as a group.' }],
      narrate: [{ id: 'n07', who: 'color', at: 3.8, text: 'Red’s quarry is tapped out. They have to go to the middle!' }] },
    { name: 'Blue at home', dur: 6, g: [180, 240], cam: { type: 'group', who: ['Fay', 'Gus', 'Hana'], angle: -.8, rise: .5 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 5.2, who: 'Ivo', kind: 'thought', side: 'right', text: 'Can\'t find the furnace. Build my own: 8 cobble, place near me, smelt.' }],
      narrate: [{ id: 'n08', who: 'pbp', at: .4, text: 'Blue stays home, still wrestling with furnaces.' }] },
    { name: 'Juno sees them', dur: 9, g: [225, 240], cam: { type: 'group', who: ['Juno', 'Eli', 'Bree'], angle: 1.4, rise: .7 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { at: .2, dur: 4.6, who: 'Juno', kind: 'thought', side: 'right', text: 'Eli has only a stone pickaxe, no armor, Bree has nothing. My iron sword does 6. Strike Eli now before they gear up.' },
        { at: 4.9, dur: 4.0, who: 'Bree', kind: 'chat', text: 'Juno (iron sword, no armour) at centre quarry (3,22,1). Dara/Eli come to furnace at (-6,23,3), gang up!' },
      ],
      narrate: [{ id: 'n09', who: 'pbp', at: .3, text: 'Wait, look at this! Juno, alone in the middle, with an iron sword!', act: 'sudden alarm, leaning in' }] },

    // --- first blood ---
    { name: 'First blood', dur: 10, g: [240.4, 243.6], cam: { type: 'pair', a: 'Juno', b: 'Eli', angle: .8, rise: .8, cutaway: true }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 9.6, kind: 'versus', a: 'Juno', b: 'Eli' }],
      narrate: [
        { id: 'n10', who: 'pbp', atG: 240.95, text: 'Juno swings first! Six damage!', act: 'fast, rising' },
        { id: 'n11', who: 'color', at: 4.95, text: 'Eli trades back, five a hit!' },
        { id: 'n12', who: 'pbp', atG: 242.95, text: 'Eli is down! First blood, Blue!', act: 'the big call, explode' },
      ] },
    { name: 'Replay: first blood', dur: 9.2, g: [241.0, 243.1], cam: { type: 'pair', a: 'Juno', b: 'Eli', angle: 2.2, rise: 1.2, cutaway: true }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n13', who: 'color', at: 2.4, text: 'Watch the swords. Iron hits for six, stone for five. Four swings, and that’s the difference.', act: 'breaking down the replay, quick and keen' }] },
    { name: 'Bree answers', dur: 7, g: [243.1, 244.8], cam: { type: 'pair', a: 'Bree', b: 'Juno', angle: 2.2 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n14', who: 'pbp', at: .2, text: 'But here comes Bree!', act: 'urgent' },
        { id: 'n15', who: 'pbp', atG: 244.15, text: 'Juno is out! Four on four!', act: 'the big call, explode' },
      ] },

    // --- Red takes the lead ---
    { name: 'Hana guesses wrong', dur: 10, g: [266, 272.6], cam: { type: 'pair', a: 'Dara', b: 'Hana', angle: .4 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 3.8, who: 'Hana', kind: 'thought', side: 'right', text: 'Dara has only a pickaxe, adjacent. Equip stone sword and kill Dara, then deal with Bree.' }],
      narrate: [
        { id: 'n16', who: 'color', at: 3.6, text: 'Hana thinks Dara’s holding a pickaxe…', act: 'knowing, a little teasing' },
        { id: 'n17', who: 'pbp', at: 6.6, text: 'That’s an iron sword!' },
        { id: 'n18', who: 'pbp', atG: 271.9, text: 'Hana goes down! Red leads, four to three!', act: 'the big call' },
      ] },
    { name: 'The captain’s rule', dur: 11, g: [292, 302.4], cam: { type: 'group', who: ['Fay', 'Bree', 'Dara'], angle: 1.9, rise: .6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: 2.9, dur: 4.0, who: 'Fay', kind: 'chat', side: 'right', text: 'Don\'t go alone to centre. Gus, Ivo, Hana: regroup with me at (19,22,-15), then we move together with armor.' }],
      narrate: [
        { id: 'n19', who: 'color', at: 3.1, text: 'Fay’s own orders: nobody goes to the centre alone.' },
        { id: 'n20', who: 'pbp', at: 7.0, text: 'And who’s in the centre? Fay. Alone!', act: 'disbelief' },
        { id: 'n21', who: 'pbp', atG: 301.8, text: 'Fay is down! Four to two!', act: 'the big call' },
      ] },
    { name: 'Three for one', dur: 6.8, g: [303, 330], cam: { type: 'aerial', at: [10, 24, -4], dist: 60, height: 40, spin: .25, angle: 1 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n22', who: 'color', at: 2.0, text: 'Blue’s captain is gone. Three Blue players out, just one from Red.' }] },
    { name: 'Cole at the furnace', dur: 11, g: [300, 332], cam: { type: 'face', who: 'Cole', dist: 4.2 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .2, dur: 4.2, who: 'Cole', kind: 'chat', text: 'Cole: smelting 8 iron, then armour. Eli down; stay grouped near the centre quarry, don\'t fight alone.' }],
      narrate: [{ id: 'n23', who: 'color', at: 4.5, text: 'Keep an eye on Cole. All game long he’s been at the furnace, smelting iron for armour.', act: 'quietly excited, a tip for the viewers' }] },

    // --- Blue strikes back ---
    { name: 'The chase', dur: 9, g: [350, 362.5], cam: { type: 'group', who: ['Dara', 'Bree', 'Ivo'], angle: 2.4, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { at: .2, dur: 4.2, who: 'Dara', kind: 'thought', text: 'Ivo is unarmored 7 blocks away. Bree and I attack him together.' },
        { at: 4.5, dur: 4.4, who: 'Ivo', kind: 'thought', side: 'right', text: 'Bree and Dara are both at 9 health and close. I\'m at full health with a stone sword. Two hits each kills them.' },
      ],
      narrate: [
        { id: 'n24', who: 'pbp', at: .3, text: 'Dara and Bree go hunting. Two on one!' },
        { id: 'n25', who: 'color', at: 4.7, text: 'But Ivo’s at full health. He likes these odds!' },
      ] },
    { name: 'Ivo’s stand', dur: 11.5, g: [362.8, 366.9], cam: { type: 'group', who: ['Ivo', 'Dara', 'Bree'], angle: .9, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 11, kind: 'versus', a: 'Ivo', b: 'Dara', c: 'Bree' }],
      narrate: [
        { id: 'n26', who: 'pbp', atG: 363.3, text: 'Ivo takes the hit and swings back!', act: 'fast' },
        { id: 'n27', who: 'pbp', atG: 364.55, text: 'Dara is down!', act: 'the big call' },
        { id: 'n28', who: 'color', at: 6.5, text: 'Bree’s still swinging!' },
        { id: 'n29', who: 'pbp', atG: 366.4, text: 'And Bree! Ivo gets both! Two on two!', act: 'the biggest call yet, total disbelief' },
      ] },
    { name: 'Replay: Ivo’s stand', dur: 8, g: [364.5, 366.7], cam: { type: 'group', who: ['Ivo', 'Bree'], angle: 2.5, rise: .8 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n30', who: 'color', at: 2.8, text: 'Look at Bree’s hand. Raw beef! She’d just eaten, and beef hits for one.', act: 'laughing in disbelief' }] },
    { name: 'All square', dur: 7.8, g: [367, 400], cam: { type: 'aerial', at: [40, 26, -6], dist: 70, height: 45, spin: .25, angle: 2.4 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n31', who: 'pbp', at: .3, text: 'All square! Ash and Cole for Red, Gus and Ivo for Blue. And only one of them has armour!' }] },

    // --- the finish ---
    { name: 'Cole finds Gus', dur: 9, g: [405, 412.6], cam: { type: 'pair', a: 'Cole', b: 'Gus', angle: 2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 4, who: 'Cole', kind: 'chat', text: 'Gus has 6 hp at 36,27,-8, I\'m attacking. Ash come support.' }],
      narrate: [
        { id: 'n32', who: 'pbp', at: 4.15, text: 'Cole’s found Gus, and Gus is hurt!' },
        { id: 'n33', who: 'pbp', atG: 411.4, text: 'Cole strikes! Gus is down! Red needs one more!', act: 'the big call' },
      ] },
    { name: 'Ivo alone', dur: 9, g: [415, 436], cam: { type: 'follow', who: 'Ivo', dist: 6, height: 3 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 8.3, who: 'Ivo', kind: 'thought', side: 'right', text: 'I\'m alone against Ash and Cole. Eat, then get back toward base and guard. The border will push everyone to the centre eventually, so I want full health and a cobble shelter.' }],
      narrate: [{ id: 'n34', who: 'color', at: 3.0, text: 'Ivo is the last of Blue. He wants full health and a shelter. But Cole is coming.', act: 'tense, hushed then rising' }] },
    { name: 'The last duel', dur: 10, g: [438.0, 440.6], cam: { type: 'pair', a: 'Cole', b: 'Ivo', angle: 1.1 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .2, dur: 9.6, kind: 'versus', a: 'Cole', b: 'Ivo' }],
      narrate: [
        { id: 'n35', who: 'pbp', at: .3, text: 'This is it! Cole against Ivo, for the whole match!', act: 'maximum tension' },
        { id: 'n36', who: 'pbp', atG: 439.2, text: 'Cole hits! Ivo hits back!' },
        { id: 'n37', who: 'pbp', atG: 440.45, text: 'Ivo is down! Red wins it!', act: 'the winning call: scream it with joy' },
      ] },
    { name: 'Replay: the difference', dur: 10, g: [439.0, 440.6], cam: { type: 'pair', a: 'Cole', b: 'Ivo', angle: 2.6, rise: 1.2 }, mood: 'tense', tag: 'REPLAY',
      narrate: [{ id: 'n38', who: 'color', at: 2.4, text: 'Here’s your match winner. Ivo’s stone sword does five. Through Cole’s iron chestplate, it lands as four.', act: 'the key insight, delivered with relish' }] },
    { name: 'Red wins', dur: 13, g: [440.6, 440.6], cam: { type: 'aerial', at: [60, 26, 4], dist: 80, height: 50, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { result: true, title: 'RED WINS', sub: 'Round 15 · 7:20 of game time · Standing: Ash and Cole',
        stats: ['Cole  ·  2 kills  ·  the only armour of the game', 'Bree  ·  2 kills', 'Ivo  ·  2 kills', 'Juno, Dara  ·  1 kill each'] },
      narrate: [
        { id: 'n39', who: 'pbp', at: .6, text: 'Red wins the Agent Arena!', act: 'triumphant' },
        { id: 'n40', who: 'color', at: 3.4, text: 'Player of the match: Cole. Two kills, and the only armour in the whole game.' },
      ] },
  ],
};

/** Scene starts, absolute caption and commentary times, and the film's length. */
export function arenaTimeline(edit = ARENA_EDIT) {
  let at = 0;
  const scenes = edit.scenes.map(s => { const sc = { ...s, start: at, speed: (s.g[1] - s.g[0]) / s.dur }; at += s.dur; return sc; });
  const offset = (s, n) => n.atG !== undefined ? (n.atG - s.g[0]) / (s.speed || 1) : n.at;
  // (a caption, too, may be placed at a moment of game time: a chat line shown as it was sent)
  const captions = scenes.flatMap(s => (s.captions ?? []).map(c => ({ ...c, start: s.start + offset(s, c), end: s.start + offset(s, c) + c.dur })));
  const narration = scenes.flatMap(s => (s.narrate ?? []).map(n => ({ ...n, start: s.start + offset(s, n), scene: s.name })));
  for (const n of narration) captions.push({ kind: 'narrator', id: n.id, who: n.who, text: n.text, start: n.start, end: n.start + (n.dur ?? 3) });
  return { scenes, captions, narration, duration: at, posterTime: edit.posterTime ?? Math.min(at, 20) };
}

const timeline = arenaTimeline();
export const ARENA_STORY = { duration: timeline.duration, fps: ARENA_EDIT.fps, posterTime: timeline.posterTime };
export const ARENA_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
