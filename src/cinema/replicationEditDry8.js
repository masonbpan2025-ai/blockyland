// The edit of the replication film for run dry8 (replication/runs/dry8, 2026-11-05): four Claude agents (Sonnet 5.5)
// with the team playbook and the safety kit (replication/agent/docs/strategy.md, kit/safety.js), the first 30 minutes
// of survival Blockyland, called as a sports broadcast. Scenes map film time onto stretches of game time (seconds from
// the start of the run, `g`); `atG` places a call at a moment of game time.
//
// Every quote is an agent's own, verbatim from the run's chat (events.jsonl) or its program output; times, deaths,
// milestones, positions and health are checked against the recording (public/cinema-replication/dry8/recording.json).
// Facts used: 2 deaths (Basil 660.8 s, skeleton, at 14,22,1; Aria 1559.2 s, skeleton, at -11,14,-1); iron pickaxes
// Basil 538, Delphi 664.6, Corin 813.4, Aria 853.0; Delphi Suit Up 896.2; Delphi's bed 427; Monster Hunter 1281 is Basil's
// (the server logged it as Delphi's, a bug since fixed: Basil's iron sword took skeleton #102 from 9 health to dead at
// 1280.7, the skeleton that killed Basil at 660.8). The fights come from replication/film/combat.mjs: skeleton #102 hit
// Basil 5 times from 648.9; skeleton #5261 hit Aria from 1544; Delphi swung at #5261 14 times from 1733.6 holding a dirt
// block (1 damage a hit) and pulled out at 8.8 health. A duel camera's mob is its id in the recording.
// Aria's kit reflex fled a zombie at 8,7,-3 (701.5); Basil at 1 HP from 1720 s. Earlier runs without the playbook:
// 9-11 deaths in 30 minutes.
//
// The commentators name the players rather than guess pronouns.

export const REPLICATION_EDIT_DRY8 = {
  id: 'replication-dry8',
  title: 'The Agent Expedition: Rematch',
  data: '/cinema-replication/dry8',
  fps: 30,
  posterTime: 26,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: Basil down', dur: 3.8, g: [655, 661], cam: { type: 'duel', who: 'Basil', mob: 102, dist: 2.4, height: 1.5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'A skeleton in the dusk!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: the hand-off', dur: 3.8, g: [868, 878], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi'], dist: 4, angle: 2.2, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'A hand-off gone wrong!', act: 'rapid-fire teaser, laughing' }] },
    { name: 'Highlight: the rescue party', dur: 4, g: [1700, 1712], cam: { type: 'group', who: ['Aria', 'Corin', 'Delphi'], dist: 4.5, angle: .9, rise: .45 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'And a rescue party! It’s the rematch!', act: 'teasing, building to the title' }] },

    // --- the line-up ---
    { name: 'Line-up', dur: 17, g: [0, 4], cam: { type: 'aerial', at: [5, 26, 0], dist: 42, height: 28, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: REMATCH', sub: 'Same four Claude agents · a new playbook · a safety kit · one goal: defeat the Ender Dragon',
        roles: { Aria: ['Wood and tools', 'Called the plays'], Basil: ['Stone, coal and iron', 'The miner'], Corin: ['Food', 'Chickens and mutton'], Delphi: ['Scout and sheep', 'Wool for beds'] } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .8, text: 'Welcome back to the Agent Expedition! It’s the rematch: Aria, Basil, Corin and Delphi!', act: 'stadium announcer energy, names punched out' },
        { id: 'n02', who: 'color', at: 7.6, text: 'Last time out, nine to eleven deaths in half an hour. This time they’ve got a playbook, and a safety kit that runs and shouts for help on its own.', act: 'setting up the storyline with relish' },
      ] },

    // --- kick-off ---
    { name: 'Kick-off', dur: 6, g: [0, 40], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway! Day one, the clock is running!' }] },
    { name: 'Aria calls the plays', dur: 9, g: [50, 62], cam: { type: 'face', who: 'Aria', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 8.4, who: 'Aria', kind: 'chat', text: 'Aria: I take WOOD first (logs near spawn at -1,26,-4), then crafting/tools. Suggest: Basil=stone/coal/iron mining, Corin=food (chickens near spawn), Delphi=scout+sheep(east 55,32,-11). Base near spawn.' }],
      narrate: [{ id: 'n04', who: 'pbp', at: .4, text: 'Aria takes the captain’s armband! Wood for Aria, mining for Basil, food for Corin, and Delphi heads for the sheep!', act: 'excited, like a captain calling a set play' }] },
    { name: 'First HELP call', dur: 10, g: [96, 106], cam: { type: 'follow', who: 'Corin', dist: 5, height: 2.6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: 4.5, dur: 5.2, who: 'Corin', kind: 'chat', text: 'HELP zombie at 15 26 2, 16 HP' }],
      narrate: [{ id: 'n05', who: 'color', at: 3.6, text: 'There’s the safety kit! A zombie lands a hit, and Corin’s bot runs and calls for help by itself.', act: 'delighted, pointing it out' }] },
    { name: 'Delphi goes east', dur: 8, g: [120, 240], cam: { type: 'follow', who: 'Delphi', dist: 7, height: 3.6 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Delphi', kind: 'chat', text: 'Delphi: have 3 wool + 4 raw mutton (for bed). ~9 sheep remain at x65-95,y22-33,z-12..-19, east of spawn. Heading back to base; need a furnace for the mutton.' }],
      narrate: [{ id: 'n06', who: 'pbp', at: .4, text: 'Delphi out on the wing, fifty blocks east: wool and mutton! That’s a bed in the making!' }] },
    { name: 'Stone Age', dur: 6.5, g: [175, 182], cam: { type: 'face', who: 'Basil', dist: 3.4, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n07', who: 'pbp', at: .4, text: 'Stone Age for Basil! Getting an Upgrade! The tools are coming!', act: 'rapid, gleeful' }] },
    { name: 'Delphi’s bed', dur: 8, g: [420, 432], cam: { type: 'face', who: 'Delphi', dist: 3.2 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Delphi', kind: 'chat', text: 'Delphi: bed placed at 7,27,-9 near Aria table (spawn point set). Have 4 raw mutton, wooden tools. Anyone need wool? 9 sheep east. Going to mine cobble/coal now.' }],
      narrate: [{ id: 'n08', who: 'color', at: .4, text: 'A bed, seven minutes in! That sets Delphi’s respawn point. No beds last time, and that cost them dearly.', act: 'approving, knowing' }] },
    { name: 'Basil shares the stone', dur: 8, g: [432, 444], cam: { type: 'face', who: 'Basil', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Basil', kind: 'chat', text: 'Basil: FURNACE at 6,24,6 (table 7,26,7) smelting 4 iron. Coal/iron ore + stone are right under spawn at y20-21 (3,21,2). I have 97 cobble: Corin come take 8+, anyone needing cobble ask.' }],
      narrate: [{ id: 'n09', who: 'pbp', at: .4, text: 'Basil’s got the furnace going, iron in the oven, and ninety-seven cobble for anyone who asks! That’s a team player!' }] },
    { name: 'Iron Pick: Basil', dur: 8.4, g: [536, 541], cam: { type: 'face', who: 'Basil', dist: 3.4, height: 1.8 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n10', who: 'pbp', atG: 538.1, text: 'Isn’t It Iron Pick! Basil is first to iron! Nine minutes!', act: 'the big goal call, total joy' }] },

    // --- the first death ---
    { name: 'Aria goes deep', dur: 7, g: [560, 640], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 4.5, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n11', who: 'color', at: .4, text: 'Meanwhile Aria has gone deep. Y five, near the lava, mining coal and iron.', act: 'a little uneasy' }] },
    { name: 'Basil at dusk', dur: 7, g: [610, 646], cam: { type: 'follow', who: 'Basil', dist: 5, height: 2.4 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n12', who: 'color', at: .4, text: 'And Basil keeps a long mining script running as the sun goes down. Skeletons wake up at dusk.', act: 'ominous, building' }] },
    { name: 'DOWN: Basil', dur: 14.5, g: [647.5, 662], cam: { type: 'duel', who: 'Basil', mob: 102, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .7, dur: 3, who: 'Basil', kind: 'chat', text: 'HELP skeleton at 14 22 1, 16 HP' }],
      narrate: [
        { id: 'n13', who: 'pbp', atG: 649.1, text: 'Arrows! Basil is taking arrows!', act: 'alarmed, rising fast' },
        { id: 'n13b', who: 'pbp', atG: 655.8, text: 'Another one! Three hearts left! Get out of there, Basil!', act: 'urgent, shouting over the crowd' },
        { id: 'n14', who: 'pbp', atG: 660.9, text: 'Basil is down!', act: 'a gasp, the big miss' },
      ] },
    { name: 'Replay: Basil', dur: 10, g: [655, 661], cam: { type: 'duel', who: 'Basil', mob: 102, side: -1, dist: 2.2, height: 1.3 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 9, who: 'Basil', kind: 'chat', text: 'Basil: I DIED at 14,22,1 (skeleton, long mining script at dusk). Lost iron pick, 70 cobble, 6 raw iron. My 11 raw iron are smelting in furnace 6,24,6 (take them, use for armor). Not going back alone.' }],
      narrate: [{ id: 'n15', who: 'color', at: .8, text: 'Look at the post-match interview, in chat, thirty seconds later. Owns the mistake, gives away the iron, and: not going back alone. Textbook.', act: 'admiring, explaining' }] },

    // --- the reflex ---
    { name: 'The reflex', dur: 9, g: [697, 706], cam: { type: 'duel', who: 'Aria', mob: 5494, cutaway: true, dist: 2.4, height: 1.4 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { at: .4, dur: 3.4, who: 'Aria', kind: 'chat', text: 'HELP zombie at 8 7 -3, 18 HP' },
        { at: 4, dur: 3.8, who: 'Aria', kind: 'code', text: 'ERROR Error: stopped: fled from zombie at 8 7 -3\n    at S.goto (program-1.js:106:42)' },
      ] ,
      narrate: [{ id: 'n16', who: 'color', at: .4, text: 'Down at y seven, a zombie hits Aria, with no sword in hand. The kit takes over: run, shout, and stop the program. Aria lives.', act: 'thrilled, breaking down the play' }] },
    { name: 'Delphi recovers the gear', dur: 8, g: [712, 724], cam: { type: 'follow', who: 'Delphi', dist: 4.5, height: 2.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Delphi', kind: 'chat', text: 'Delphi: I picked up Basil loot: iron pickaxe, ~180 cobble, 6 raw iron. Basil: I will drop the iron pickaxe+cobble by table 7,26,7 for you.' }],
      narrate: [{ id: 'n17', who: 'pbp', at: .4, text: 'And Delphi goes back in for Basil’s gear! Iron pickaxe recovered! What a teammate!', act: 'roaring approval' }] },

    // --- the great hand-off ---
    { name: 'The hand-off', dur: 10, g: [805, 880], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi', 'Aria'], dist: 3.4, angle: 1.6, rise: .75 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { at: .3, dur: 4.6, who: 'Corin', kind: 'chat', text: 'Corin: I have the iron pickaxe + 128 cobble (picked up by accident).', side: 'right' },
        { at: 5, dur: 4.8, who: 'Basil', kind: 'chat', text: 'Basil: all four of us are within 5 blocks and there are NO dropped items visible to me. Items get auto-picked up by whoever is closest.' },
      ],
      narrate: [
        { id: 'n18', who: 'pbp', at: .3, text: 'Delphi drops the pickaxe for Basil, and Corin walks off with it!', act: 'incredulous, laughing' },
        { id: 'n19', who: 'color', at: 5.2, text: 'Dropped items go to whoever stands closest. Four players round one table, and the pickaxe goes on tour!', act: 'amused, explaining the rule' },
      ] },
    { name: 'Suit Up: Delphi', dur: 7, g: [893, 899], cam: { type: 'face', who: 'Delphi', dist: 3.2, height: 1.7 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n20', who: 'pbp', atG: 896.3, text: 'Suit Up! Delphi puts on the iron chestplate!', act: 'a big happy call' }] },
    { name: 'SLEEP', dur: 7, g: [940, 950], cam: { type: 'group', dist: 4, angle: 1.6, rise: 1.1 }, mood: 'calm', tag: 'LIVE',
      captions: [{ at: .3, dur: 6.4, who: 'Delphi', kind: 'chat', text: 'SLEEP: beds at 7,27,-9 (mine). Everyone with a bed place it near and sleep to skip night.' }],
      narrate: [{ id: 'n21', who: 'color', at: .5, text: 'But the night only skips when everyone’s in bed, and Delphi has the only one. Long night ahead.', act: 'wry' }] },
    { name: 'The night', dur: 10, g: [960, 1210], cam: { type: 'group', dist: 4.5, angle: 2.4, rise: 1.2, spin: .25 }, mood: 'calm', tag: 'TIME-LAPSE',
      captions: [{ at: .4, dur: 8.6, who: 'Aria', kind: 'chat', text: 'Aria: Basil, I will buddy with you at dawn (t~0). Meet at 7,26,5. Have torches, bucket, iron pick.' }],
      narrate: [{ id: 'n22', who: 'pbp', at: .4, text: 'Everyone safe at base for the night, and the pairs are set for dawn: Aria with Basil, Delphi with Corin!', act: 'upbeat, tactical' }] },

    // --- the second half ---
    { name: 'Dawn: the buddies', dur: 8, g: [1213, 1232], cam: { type: 'group', who: ['Aria', 'Basil'], dist: 4, angle: 2.6, rise: .5 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Basil', kind: 'chat', text: 'Basil: dawn, at 6,25,8 with iron pick+sword. Aria, ready to go mining together? Plan: staircase down near 3,21,3 area, I scan/guard.' }],
      narrate: [{ id: 'n23', who: 'color', at: .4, text: 'The buddy system: one mines, one stands guard. Straight out of the playbook.', act: 'approving' }] },
    { name: 'Basil’s revenge', dur: 12.6, g: [1274, 1285], cam: { type: 'duel', who: 'Basil', mob: 102, cutaway: true, dist: 3, height: 2 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { at: .3, dur: 3.9, who: 'Basil', kind: 'code', text: "await bot.equip(bot.inventory.findInventoryItem(R.itemsByName.iron_sword.id),'hand');\nconst name=global.KILL||'skeleton';\n…\nif(e.position.distanceTo(bot.entity.position)<4){await bot.attack(e);hits++;}" },
        { at: 4.4, dur: 2.6, who: 'Basil', kind: 'chat', text: 'HELP skeleton at 11 22 8, 16 HP' },
      ],
      narrate: [
        { id: 'n24', who: 'color', at: .3, text: 'The skeleton that took Basil down never moved. Basil writes a kill script, draws the iron sword, and goes back!', act: 'building, a grudge match' },
        { id: 'n24b', who: 'pbp', atG: 1280.8, text: 'Revenge! One swing and it’s gone! Monster Hunter for Basil!', act: 'the big goal call, total joy' },
      ] },
    { name: 'Delphi’s iron', dur: 8, g: [1380, 1470], cam: { type: 'follow', who: 'Delphi', cutaway: true, dist: 4.5, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n25', who: 'color', at: .4, text: 'Delphi mines a big iron vein under the base. Fifteen raw iron, in a cave full of mobs.', act: 'impressed, a touch nervous' }] },

    // --- the second death ---
    { name: 'Aria follows the ore', dur: 7, g: [1528, 1540], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 4.5, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n26', who: 'color', at: .4, text: 'Now Aria’s ore script follows the iron, out of the tunnel and into an open cave.', act: 'ominous' }] },
    { name: 'DOWN: Aria', dur: 15, g: [1540.5, 1561], cam: { type: 'duel', who: 'Aria', mob: 5261, cutaway: true, side: -1, dist: 5, height: 1.6 }, mood: 'battle', tag: 'LIVE',
      captions: [{ at: .9, dur: 3, who: 'Aria', kind: 'chat', text: 'HELP skeleton at -12 16 -4, 16 HP' }],
      narrate: [
        { id: 'n27', who: 'pbp', at: .9, text: 'Aria has called for help, a skeleton in the dark!', act: 'urgent' },
        { id: 'n27b', who: 'pbp', atG: 1549.7, text: 'Two hearts left, and nobody can get there in time!', act: 'desperate, rising' },
        { id: 'n28', who: 'pbp', atG: 1559.3, text: 'Aria is down!', act: 'a gasp' },
      ] },
    { name: 'Replay: Aria', dur: 10, g: [1549, 1559.2], cam: { type: 'duel', who: 'Aria', mob: 5261, cutaway: true, side: 1, dist: 4, height: 1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 9, side: 'right', who: 'Aria', kind: 'chat', text: 'Aria: DIED to skeleton at -11,14,-2 (ore script wandered into cave). Lost iron pick/sword/bucket. Alive at spawn, no gear. Not going back alone.' }],
      narrate: [{ id: 'n29', who: 'color', at: 1.1, text: 'A skeleton shoots from the dark, where no one can reach it. Aria says it straight: the script wandered into the cave. And again: not going back alone.', act: 'explaining, sympathetic' }] },

    // --- the rescue party ---
    { name: 'Corin feeds the team', dur: 8, g: [1678, 1690], cam: { type: 'face', who: 'Corin', dist: 3 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Corin', kind: 'chat', text: 'Corin: Delphi, tossed you 1 cooked mutton. Basil: 5 HP, get out of the cave to base NOW and eat.' }],
      narrate: [{ id: 'n30', who: 'pbp', at: .4, text: 'Corin is back from the east with cooked mutton, and feeding the team!', act: 'warm, rising' }] },
    { name: 'The rescue party', dur: 9, g: [1694, 1712], cam: { type: 'group', who: ['Aria', 'Corin', 'Delphi'], dist: 4, angle: .9, rise: .45 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { at: .3, dur: 4.2, who: 'Delphi', kind: 'chat', text: 'Delphi: iron sword + helmet/chest/legs, HP 18. Aria: I go with you for your gear at -11,14,-2. Meet 0,26,0 now.' },
        { at: 4.6, dur: 4.2, who: 'Corin', kind: 'chat', text: 'Corin: joining you at 0,26,0 for the gear run (iron sword, shield).', side: 'right' },
      ],
      narrate: [{ id: 'n31', who: 'pbp', at: .4, text: 'Here comes the rescue party! Delphi in iron, Corin with a shield, going in together for Aria’s gear!', act: 'big build-up, crowd rising' }] },
    { name: 'Basil hangs on', dur: 10, g: [1712, 1724], cam: { type: 'duel', who: 'Basil', mob: 17795, cutaway: true, bias: .15, dist: 2, height: 1.2 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { at: 2.1, dur: 2.6, who: 'Basil', kind: 'chat', text: 'HELP skeleton at 3 20 -1, 1 HP' },
        { at: 4.9, dur: 5, who: 'Basil', kind: 'chat', text: 'Basil: HP 1, food 16, sealed in a stone hole at 9,18,-3 (cave under spawn). … Do not come into the cave for me alone.' },
      ],
      narrate: [{ id: 'n32', who: 'color', atG: 1715.4, text: 'An arrow takes Basil to half a heart! Basil walls up in a stone hole, and tells the team: don’t come in alone.', act: 'tense, admiring' }] },
    { name: 'Delphi goes in', dur: 16.5, g: [1733, 1749.5], cam: { type: 'duel', who: 'Delphi', mob: 5261, cutaway: true, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { at: .3, dur: 3.4, who: 'Delphi', kind: 'chat', text: 'Delphi: heading down to -11,14,-2 with Corin; Aria stay at base.' },
        { at: 4.2, dur: 4.4, who: 'Delphi', kind: 'code', text: "const s=bot.nearestEntity(e=>e.name==='skeleton');\nfor(let k=0;k<30&&s.isValid;k++){if(bot.health<9)return 'low';\n  …\n  await bot.attack(s);await bot.waitForTicks(10)}" },
      ],
      narrate: [
        { id: 'n39', who: 'pbp', at: .45, text: 'Delphi goes in after the skeleton, one on one!', act: 'big build-up' },
        { id: 'n40', who: 'color', atG: 1738.6, text: 'But look at Delphi’s hand. That’s a block of dirt! The iron sword is still in the pack. One damage a swing.', act: 'half laughing, half horrified' },
        { id: 'n41', who: 'pbp', atG: 1745.6, text: 'Four hearts left for Delphi, and the skeleton is still standing!', act: 'tense, rising' },
      ] },
    { name: 'The retreat', dur: 8, g: [1760, 1775], cam: { type: 'follow', who: 'Delphi', dist: 4.5, height: 2.4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ at: .3, dur: 7.4, who: 'Delphi', kind: 'chat', text: 'Delphi: aborted gear run, skeletons took me to 9 HP (arrows in open cave). Back at 0,25,2. Need food. Idea: tunnel in from the side with cover, or shield.' }],
      narrate: [{ id: 'n33', who: 'pbp', at: .7, text: 'Arrows from the dark, and Delphi calls it off! No heroics, no third death!', act: 'relieved, punchy' }] },

    // --- full time ---
    { name: 'Full time', dur: 16.5, g: [1799, 1799], cam: { type: 'aerial', at: [5, 26, 2], dist: 52, height: 36, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'HALF HOUR', sub: '30 minutes of game time · one day and one night · the dragon still waits',
        stats: ['PLAYER OF THE HALF: DELPHI · bed, chestplate, 15 iron, Basil’s gear', 'Basil · first iron pickaxe (8:58) · went back and beat the skeleton', 'Aria · called the plays · saved by the reflex at y 7', 'Corin · food for the team · in the rescue party', 'Team · 2 deaths (earlier runs: 9-11) · 4 × iron pick · 19 HELP and COMING calls'] },
      narrate: [
        { id: 'n34', who: 'pbp', at: .6, text: 'And that’s the half hour! Two deaths! Every run before this had nine or more!', act: 'the closing call, triumphant' },
        { id: 'n35', who: 'color', at: 7.0, text: 'Player of the half: Delphi. A bed, the first chestplate, fifteen iron, and Basil’s gear brought home.', act: 'warm, listing with relish' },
      ] },
    { name: 'The verdict', dur: 19.5, g: [1799, 1799], cam: { type: 'aerial', at: [5, 26, 2], dist: 58, height: 40, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'THE VERDICT', stats: ['GOOD: the safety kit ran and shouted for help · 2 deaths, not 9-11', 'GOOD: buddies, a rescue party, food and gear shared · iron for all four', 'BETTER: draw the sword before a fight (Delphi swung a dirt block) · fight in pairs', 'BETTER: mine in your own tunnels; caves hide archers', 'NEXT: diamonds, obsidian, the Nether'] },
      narrate: [
        { id: 'n36', who: 'color', at: .6, text: 'What went right: the kit kept them alive, and they played as a team: buddies, a rescue party, food on the way.' },
        { id: 'n37', who: 'pbp', at: 6.9, text: 'What to fix: draw the sword before you fight, and stay out of the caves! Both deaths were skeletons in the dark!', act: 'punchy' },
        { id: 'n38', who: 'color', at: 13.8, text: 'No diamonds yet. Next half: diamonds, obsidian, and the Nether!', act: 'big finish, upbeat' },
      ] },
  ],
};

import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT_DRY8);
export const REPLICATION_DRY8_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_DRY8.fps, posterTime: timeline.posterTime };
export const REPLICATION_DRY8_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
