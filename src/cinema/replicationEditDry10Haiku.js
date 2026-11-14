// The film of dry10-haiku: the same 30 minutes as dry8, four Claude Haiku 5.5 agents, the playbook and the new safety
// kit (it fights or runs by gear, and sends armed teammates to a HELP call). Called as a sports broadcast.
//
// Every chat caption is verbatim from the run's log (replication/runs/dry10-haiku/events.jsonl); "…" marks a cut. The
// fights come from replication/film/combat.mjs (recording.json `combat`): Aria shot by skeleton #163 for 9 at 263.9;
// a creeper exploded beside Basil at 387.85 and Basil killed zombie #446 in 8 blows (397.45, Monster Hunter 397.8);
// phantoms over the base from night 1; at 1184.4 Basil's HELP got three COMINGs in 0.45 s, and Delphi (#1912) and
// Corin (#1824) killed two phantoms at 1204.4-1206.1; Aria, hit at 1223.05, was run 30 blocks out by the kit and
// escorted home by Delphi and Corin (1247-1345); Basil found diamonds (1428.75) and two staircases were stopped by the
// cave check (1491, 1587); phantom kills by Delphi (#3186, 1654.6), Basil (#3252, 1685.55), Corin (#3284, 1714.45);
// Corin shot to 6 HP at 1718.95; Basil walled in at 9 HP (1748.85), ran at 3 HP (1757) and died of a 13-block fall
// (1760.7): the kit's run ignored the drop. Iron pickaxes: Basil 742.25, Corin 787.85. The commentators name the players
// rather than guess pronouns.

export const REPLICATION_EDIT_DRY10_HAIKU = {
  id: 'replication-dry10-haiku',
  title: 'The Agent Expedition: Haiku Squad',
  data: '/cinema-replication/dry10-haiku',
  fps: 30,
  posterTime: 30,
  scenes: [
    // --- cold open ---
    { name: 'Highlight: three answer', dur: 4, g: [1184, 1190], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi', 'Aria'], dist: 4, angle: 1.2, rise: .5 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'One call, three answers!', act: 'opening the show, huge energy' }] },
    { name: 'Highlight: the escort', dur: 3.8, g: [1278, 1290], cam: { type: 'group', who: ['Aria', 'Corin', 'Delphi'], dist: 4, angle: 2.2, rise: .5 }, mood: 'tense', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'An escort across open ground!', act: 'rapid-fire teaser' }] },
    { name: 'Highlight: the last stand', dur: 4, g: [1752, 1760], cam: { type: 'face', who: 'Basil', dist: 3, height: 1.6 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'And a night battle on the roof!', act: 'teasing, building to the title' }] },

    // --- the line-up ---
    { name: 'Line-up', dur: 18.5, g: [0, 4], cam: { type: 'aerial', at: [5, 27, 0], dist: 42, height: 28, spin: .25, angle: 2.2 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: HAIKU SQUAD', sub: 'Four Claude Haiku agents · the playbook · the new safety kit: fight or run by your gear, and help each other',
        roles: { Aria: ['Food and hunting', 'Stays near the table'], Basil: ['The miner', 'Stone, coal, iron'], Corin: ['The base', 'Table, furnace, chest'], Delphi: ['The scout', 'Coal, water, mobs'] } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .8, text: 'Welcome to the Agent Expedition! Today the squad runs on Claude Haiku, the small, fast model. Same world, same playbook!', act: 'stadium announcer energy' },
        { id: 'n02', who: 'color', at: 10.1, text: 'And a new safety kit: fight or run by your gear, and when a teammate calls for help, the armed ones come.', act: 'setting up the storyline with relish' },
      ] },

    // --- the first day ---
    { name: 'Kick-off', dur: 6, g: [0, 40], cam: { type: 'group', angle: .8, rise: .7 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n03', who: 'pbp', at: .3, text: 'And we are underway! Day one!' }] },
    { name: 'The miner', dur: 8, g: [40, 52], cam: { type: 'face', who: 'Basil', dist: 3.2 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 43.05, dur: 6.5, who: 'Basil', kind: 'chat', text: 'Basil here: safety kit installed. I am the Miner. No tools yet, so I am cutting 6 logs for a crafting table and wooden pickaxe, then stone.' }],
      narrate: [{ id: 'n04', who: 'color', at: .4, text: 'Basil takes the pickaxe: the miner. Corin builds the base, Delphi scouts, Aria hunts.', act: 'brisk, informative' }] },
    { name: 'Stone Age', dur: 6.5, g: [204, 212], cam: { type: 'face', who: 'Basil', dist: 3.4, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      narrate: [{ id: 'n05', who: 'pbp', atG: 207.8, text: 'Stone Age for Basil!', act: 'rapid, gleeful' }] },
    { name: 'Arrow in the open', dur: 13, g: [259, 272], cam: { type: 'face', who: 'Aria', dist: 3.6, height: 1.9 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 263.7, dur: 2.8, who: 'Aria', kind: 'chat', text: 'HELP skeleton at -6 21 16, 11 HP, wooden_sword: RUNNING' },
        { atG: 266.5, dur: 2.5, who: 'Basil', kind: 'chat', side: 'right', text: "CAN'T HELP Aria: no stone sword or better (none)" },
      ],
      narrate: [
        { id: 'n06', who: 'pbp', atG: 260.2, text: 'Aria out hunting chickens, and a skeleton has the range!', act: 'rising' },
        { id: 'n07', who: 'pbp', atG: 264.1, text: 'Nine damage! Aria runs!', act: 'alarmed' },
        { id: 'n08', who: 'color', atG: 267.5, text: 'And nobody can come: no stone swords yet. They say so at once.', act: 'explaining, quick' },
      ] },
    { name: 'The lesson', dur: 8, g: [288, 296], cam: { type: 'follow', who: 'Aria', dist: 5, height: 2.4 }, mood: 'calm', tag: 'LIVE',
      captions: [{ atG: 290.6, dur: 6.8, who: 'Aria', kind: 'chat', text: 'Aria: skeleton attack at about (-6,21,17) while hunting chickens; I am at 10 HP … Lesson: chickens took me 35 blocks out. Hunting only within 15 blocks of the table from now.' }],
      narrate: [{ id: 'n09', who: 'color', at: .4, text: 'Lesson learned on the spot: hunt within fifteen blocks of the table.', act: 'approving' }] },
    { name: 'Basil draws the sword', dur: 16, g: [385, 401], cam: { type: 'duel', who: 'Basil', mob: 446, side: -1, dist: 2.6, height: 1.5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 387.7, dur: 3, who: 'Basil', kind: 'chat', text: 'HELP zombie at -3 15 -14, 15 HP, stone_sword: FIGHTING' },
        { atG: 388.6, dur: 3, who: 'Corin', kind: 'chat', side: 'right', text: 'COMING Basil from 15 blocks, stone_sword, 20 HP' },
      ],
      narrate: [
        { id: 'n10', who: 'pbp', atG: 385.4, text: 'Underground, a creeper blows up beside Basil, and a zombie steps in!', act: 'fast, rising' },
        { id: 'n11', who: 'color', atG: 391.1, text: 'Basil has a stone sword and fifteen health: the kit says fight.', act: 'quick, tactical' },
        { id: 'n12', who: 'pbp', atG: 397.5, text: 'Eight swings, zombie down! Monster Hunter!', act: 'the big goal call' },
      ] },
    { name: 'The sword that never arrived', dur: 11, g: [705, 770], cam: { type: 'group', who: ['Corin', 'Aria', 'Basil'], dist: 4, angle: 1.4, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { at: .3, dur: 4.6, who: 'Corin', kind: 'chat', text: 'Corin: tossed a stone sword to Aria by the furnace. Aria, pick it up.' },
        { at: 5.2, dur: 5.4, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin: Aria, I just put a STONE SWORD in the main chest at 9 27 -5 … I tossed one at the furnace earlier and it did not reach you; sorry, that was my error.' },
      ],
      narrate: [{ id: 'n13', who: 'color', at: .4, text: 'The hand-off curse is back! The tossed sword never reaches Aria. So: the chest. That part of the playbook works.', act: 'amused, explaining' }] },
    { name: 'Iron Pick: Basil', dur: 8, g: [740, 745], cam: { type: 'face', who: 'Basil', dist: 3.4, height: 1.8 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n14', who: 'pbp', atG: 742.4, text: 'Isn\'t It Iron Pick! Basil, twelve minutes in!', act: 'a big happy call' }] },
    { name: 'Phantoms', dur: 9, g: [1020, 1036], cam: { type: 'group', dist: 5, angle: 2.4, rise: 1.4 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 1027.4, dur: 6.2, who: 'Corin', kind: 'chat', text: 'Corin: 6 PHANTOMS circle at y 33-36 over the base … Phantoms dive at whoever is in the open. I am at 20 HP in the base with an iron sword. Do not walk out until light' }],
      narrate: [{ id: 'n15', who: 'color', at: .4, text: 'Night, and no beds. Phantoms gather over the base, and the team holds inside.', act: 'ominous' }] },
    { name: 'Dawn siege', dur: 8, g: [1158, 1180], cam: { type: 'aerial', who: ['Basil', 'Corin', 'Delphi', 'Aria'], dist: 22, height: 16, spin: .3 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 1160.1, dur: 6.4, who: 'Delphi', kind: 'chat', text: 'Delphi: dawn check. About 12 PHANTOMS hover at y 32-35 over the base (x 1-10, z -4..0).' }],
      narrate: [{ id: 'n16', who: 'pbp', at: .4, text: 'Dawn, and twelve phantoms hang over the base!', act: 'tense, rising' }] },
    { name: 'Three answer the call', dur: 12, g: [1183, 1195], cam: { type: 'group', who: ['Basil', 'Corin', 'Delphi', 'Aria'], dist: 3.6, angle: 1.2, rise: .55 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1184.4, dur: 2.6, who: 'Basil', kind: 'chat', text: 'HELP phantom at 7 26 -2, 17 HP, stone_sword: RUNNING' },
        { atG: 1184.75, dur: 3.2, who: 'Delphi', kind: 'chat', side: 'right', text: 'COMING Basil from 2 blocks, stone_sword, 20 HP' },
        { atG: 1187.2, dur: 2.8, who: 'Corin', kind: 'chat', side: 'right', text: 'COMING Basil from 3 blocks, iron_sword, 20 HP' },
      ],
      narrate: [
        { id: 'n17', who: 'pbp', atG: 1184.6, text: 'Basil calls, and three answer: Delphi, Corin, Aria, inside half a second!', act: 'huge, a crowd on its feet' },
        { id: 'n18', who: 'color', atG: 1191.1, text: 'Each kit checks its own sword and health, and comes.', act: 'admiring' },
      ] },
    { name: 'Phantoms down', dur: 9, g: [1199, 1208], cam: { type: 'group', who: ['Delphi', 'Corin'], dist: 4.5, angle: .6, rise: .3 }, mood: 'battle', tag: 'LIVE',
      narrate: [
        { id: 'n19', who: 'color', at: .3, text: 'Two phantoms dive low over the team.', act: 'tense' },
        { id: 'n20', who: 'pbp', atG: 1204.3, text: 'Delphi strikes! Corin strikes! Two phantoms down!', act: 'the big call' },
      ] },
    { name: 'Aria blown away', dur: 8, g: [1222, 1240], cam: { type: 'follow', who: 'Aria', dist: 5, height: 2.6 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 1223.2, dur: 2.8, who: 'Aria', kind: 'chat', text: 'HELP phantom at 11 32 -9, 11 HP, stone_sword: RUNNING' },
        { atG: 1238.3, dur: 4.4, who: 'Aria', kind: 'chat', text: 'Aria: the kit ran me NE to about (36,34,-17), 8.7 HP … I will NOT walk back alone over open ground: please come and escort me to the table' },
      ],
      narrate: [{ id: 'n21', who: 'color', at: .4, text: 'An arrow takes Aria to five hearts, and the kit runs. Thirty blocks out, alone in the open.', act: 'concerned' }] },
    { name: 'The escort', dur: 10, g: [1274, 1300], cam: { type: 'group', who: ['Aria', 'Corin', 'Delphi'], dist: 4.5, angle: 2.2, rise: .55 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { at: .3, dur: 4.6, who: 'Delphi', kind: 'chat', text: 'Delphi: Aria, stay where you are … I am leaving the base now to come to you with stone sword, 16 HP. Corin, come too (iron sword), we go together along the surface.' },
        { atG: 1287, dur: 4.4, who: 'Delphi', kind: 'chat', side: 'right', text: 'Delphi: with Aria now at (35,34,-16) … We walk back to the table together; Corin and I walk on each side of you.' },
      ],
      narrate: [
        { id: 'n22', who: 'pbp', at: .4, text: 'An escort mission! Delphi and Corin go out together to bring Aria home!', act: 'big build-up' },
        { id: 'n23', who: 'color', at: 6.3, text: 'One on each side of Aria. The buddy system, by the book.', act: 'approving' },
      ] },
    { name: 'Wrong way, Corin', dur: 9, g: [1300, 1346], cam: { type: 'group', who: ['Aria', 'Corin', 'Delphi'], dist: 4.5, angle: 1, rise: .6 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 1300.8, dur: 3.6, who: 'Delphi', kind: 'chat', text: 'Delphi: Aria is still at (34,34,-15). Corin, you went ahead: please go back to Aria and walk her in.' },
        { atG: 1312.3, dur: 3.4, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin: I am back at Aria (34 34 -15). I walked home by mistake and came back for you.' },
      ],
      narrate: [{ id: 'n24', who: 'color', at: .4, text: 'Well, almost. Corin walks home without Aria, turns around, comes back. And Aria is home!', act: 'laughing, warm' }] },
    { name: 'Diamonds below', dur: 7, g: [1425, 1432], cam: { type: 'face', who: 'Basil', dist: 3.2 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 1428.8, dur: 3.2, who: 'Basil', kind: 'chat', text: 'Basil: DIAMONDS found under the base: (8,12,-5), (6,13,-5), (8,11,-3), (5,12,2), (7,13,3), (10,12,-1), (2,13,-2), (12,12,2).' }],
      narrate: [{ id: 'n25', who: 'pbp', atG: 1428.9, text: 'Diamonds! Eight of them, right under the base!', act: 'thrilled' }] },
    { name: 'The cave check', dur: 9, g: [1458, 1495], cam: { type: 'follow', who: 'Basil', cutaway: true, dist: 4, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      captions: [{ atG: 1491.3, dur: 4.4, who: 'Basil', kind: 'chat', text: 'Basil: STAIRCASE STOPPED. Dug 6 steps from 10 27 0 going -z; at 10 22 -5 there is an open CAVE … so the stairs cannot go on that way.' }],
      narrate: [{ id: 'n26', who: 'color', at: .4, text: 'But they sit in cave country. The staircase hits an open cave, and Basil stops. Last time, both deaths were caves.', act: 'approving, knowing' }] },
    { name: 'Buddy on the stairs', dur: 9, g: [1565, 1590], cam: { type: 'group', who: ['Basil', 'Corin'], dist: 4, angle: 1.6, rise: .6 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 1565.9, dur: 3.8, who: 'Corin', kind: 'chat', text: 'Corin: READY at 7 27 -1. I am on top of the stair as buddy, 20 HP, iron sword, 2 torches, 16 cobblestone, 51 dirt.' },
        { atG: 1587.6, dur: 3.6, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: second stair stopped at 6 25 -2 … The cave check refuses to dig next to them, which is what we want.' },
      ],
      narrate: [{ id: 'n27', who: 'pbp', at: .4, text: 'Second try, Corin on watch at the top, and the cave check says no again!', act: 'brisk' }] },
    { name: 'Delphi\'s phantom', dur: 8, g: [1652, 1660], cam: { type: 'duel', who: 'Delphi', mob: 3186, dist: 3, height: 1.4 }, mood: 'battle', tag: 'LIVE',
      captions: [{ atG: 1655, dur: 3, who: 'Corin', kind: 'chat', side: 'right', text: 'COMING Delphi from 3 blocks, iron_sword, 20 HP' }],
      narrate: [{ id: 'n28', who: 'pbp', atG: 1654.7, text: 'A phantom dives on Delphi: one swing, gone! And two teammates already on the way!', act: 'fast, the big call' }] },
    { name: 'Basil\'s three swings', dur: 7, g: [1681, 1688], cam: { type: 'duel', who: 'Basil', mob: 3252, dist: 3, height: 1.4 }, mood: 'battle', tag: 'LIVE',
      narrate: [{ id: 'n29', who: 'pbp', atG: 1684.2, text: 'Basil: one, two, three! Phantom down!', act: 'counting it out, explode' }] },
    { name: 'Corin at three hearts', dur: 12, g: [1710, 1722], cam: { type: 'face', who: 'Corin', dist: 3, height: 1.6 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1713.8, dur: 3.4, who: 'Corin', kind: 'chat', text: 'Corin: IRON SWORD for Delphi is in the MAIN CHEST (9 27 -5). Delphi, take it.' },
        { atG: 1719.1, dur: 2.8, who: 'Corin', kind: 'chat', side: 'right', text: 'BACKING OFF Basil, 6 HP' },
      ],
      narrate: [
        { id: 'n30', who: 'color', at: .3, text: 'Corin leaves an iron sword in the chest for Delphi, mid-battle.', act: 'admiring' },
        { id: 'n31', who: 'pbp', atG: 1714.6, text: 'Corin kills another phantom! But an arrow from the dark: Corin down to three hearts, and backs off!', act: 'rising, then alarmed' },
      ] },
    { name: 'The last stand', dur: 17, g: [1747, 1764], cam: { type: 'face', who: 'Basil', dist: 3, height: 1.6 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1748.9, dur: 3, who: 'Basil', kind: 'chat', text: 'HELP phantom at 8 35 1, 9 HP, stone_sword: WALLED IN' },
        { atG: 1757, dur: 2.6, who: 'Basil', kind: 'chat', text: 'HELP phantom at 8 35 -5, 3 HP, stone_sword: RUNNING' },
      ],
      narrate: [
        { id: 'n32', who: 'pbp', atG: 1749, text: 'Basil walls in up top at four and a half hearts!', act: 'urgent' },
        { id: 'n33', who: 'color', atG: 1753.3, text: 'Arrows and phantoms from every side!', act: 'tense' },
        { id: 'n34', who: 'pbp', atG: 1757.2, text: 'One and a half! The kit runs!', act: 'desperate' },
        { id: 'n35', who: 'pbp', atG: 1760.8, text: 'Over the edge! Basil is down!', act: 'a gasp' },
      ] },
    { name: 'Replay: the fall', dur: 10, g: [1755.5, 1760.8], cam: { type: 'follow', who: 'Basil', dist: 6, height: 3.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 9, who: 'Basil', kind: 'chat', text: 'Basil: DIED at 20 23 11 (fall, I was fleeing phantoms at 3 HP around 8 35 1 to 12 34 -8) … Lesson: at 9 HP I should have fled to base at once' }],
      narrate: [{ id: 'n36', who: 'color', at: .8, text: 'Watch the run: straight off the roof, thirteen blocks down. The kit sprints without looking at the drop. That one is on the coaching staff, and it gets fixed.', act: 'candid, explaining' }] },
    { name: 'Back from the dead', dur: 9, g: [1772, 1790], cam: { type: 'group', who: ['Aria', 'Basil'], dist: 4.5, angle: 1.4, rise: .6 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 1776.2, dur: 3, who: 'Basil', kind: 'chat', text: 'COMING Aria from 10 blocks, stone_sword, 20 HP' },
        { atG: 1788.5, dur: 2.6, who: 'Basil', kind: 'chat', side: 'right', text: 'CLEAR Aria: fought 2' },
      ],
      narrate: [{ id: 'n37', who: 'pbp', at: .4, text: 'Aria fights on, and Basil, back from the dead, comes running to help!', act: 'roaring' }] },

    // --- full time ---
    { name: 'Full time', dur: 16.5, g: [1799, 1799], cam: { type: 'aerial', at: [9, 28, -2], dist: 50, height: 34, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: 'HALF HOUR', sub: 'Claude Haiku · 30 minutes of game time · one day and one night',
        stats: ['PLAYER OF THE HALF: CORIN · base, iron sword, swords for Aria and Delphi, the escort, 2 phantoms', 'Basil · first iron pickaxe (12:22) · found the diamonds · Monster Hunter', 'Delphi · scout · led the escort · Monster Hunter', 'Aria · hurt early · escorted home · fought to the final whistle', 'Team · 1 death (a fall) · 13 HELP · 13 COMING · 12 CLEAR or BACKING OFF'] },
      narrate: [
        { id: 'n38', who: 'pbp', at: .6, text: 'And that\'s the half hour! One death, and it was a fall, not a fight!', act: 'the closing call' },
        { id: 'n39', who: 'color', at: 7.0, text: 'Player of the half: Corin. The base, the swords for the team, the escort, and two phantoms.', act: 'warm, listing with relish' },
      ] },
    { name: 'The verdict', dur: 19.5, g: [1799, 1799], cam: { type: 'aerial', at: [9, 28, -2], dist: 56, height: 38, spin: .3, angle: 2.4 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'THE VERDICT', stats: ['GOOD: every call answered at once · fights together · an escort home', 'GOOD: no cave deaths · the cave check stopped the stairs twice', 'BETTER: the kit\'s run must not go off a ledge (Basil\'s fall)', 'BETTER: beds before night · the phantoms never left the base', 'SLOWER: iron at 12:22, no armour, diamonds found but not mined'] },
      narrate: [
        { id: 'n40', who: 'color', at: .6, text: 'What went right: they played as a team. Every call answered, an escort home, and they stayed out of the caves.', act: 'appreciative' },
        { id: 'n41', who: 'pbp', at: 7.2, text: 'What to fix: the run that went off the roof, and beds before night!', act: 'punchy' },
        { id: 'n42', who: 'color', at: 13.2, text: 'Fewer milestones than the Sonnet squad, but one death to their five. That is teamwork.', act: 'thoughtful, a teaser for the comparison' },
      ] },
  ],
};

import { arenaTimeline } from './arenaEdit.js';
const timeline = arenaTimeline(REPLICATION_EDIT_DRY10_HAIKU);
export const REPLICATION_DRY10_HAIKU_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_DRY10_HAIKU.fps, posterTime: timeline.posterTime };
export const REPLICATION_DRY10_HAIKU_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
