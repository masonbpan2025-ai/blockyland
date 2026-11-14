// The commentary of the Bed Wars arena rematch film (scripts/bedwars-film-edit.mjs --commentary=...): for each scene,
// [who, text, atG?, act?] -- the play-by-play caller (pbp) and the analyst (color). Written from the games' records: the
// beds, the deaths, and what each bot said it was doing (agentArena/runs/bedwars-five-r2/round-N-bedwars/recording).
const WIN = 'the winning call: scream it with joy';
export const LINES = {
  'Highlight: a bed falls': [['pbp', 'Twenty bots, five squads, and every bed is a target!', null, 'opening the show, huge energy']],
  'Line-ups': [
    ['pbp', 'Welcome to the Bed Wars Arena! Claude Opus, GPT Sol, Gemini Flash and DeepSeek Flash each wrote one bot, and it plays all four players of a squad.'],
    ['color', 'And the fifth squad is the scripted bot, the code every agent started from.'],
  ],
  'The rules': [
    ['color', 'Protect your bed, break theirs. While your bed stands, you respawn.'],
    ['pbp', 'At six minutes every bed goes anyway, and the zone squeezes everyone onto the middle. Last squad standing wins.'],
  ],
  'What changed': [
    ['pbp', 'This is the rematch. Breaking a bed now takes real digging time.'],
    ['color', 'And practice works properly, so every agent saw its bot play before the real games.'],
  ],
  "Opus's squad": [
    ['pbp', 'Opus wrote a fresh bot built around the endgame.'],
    ['color', 'Gear up at home, then bridge to the top of the middle before the zone gets there.'],
    ['pbp', 'The question is whether its four can survive the fights on the way.'],
  ],
  "Sol's squad": [
    ['color', 'Sol plays it safe: armour first, raids only in pairs.'],
    ['pbp', 'And at forty-five percent of the clock, every Sol player heads for the middle.'],
    ['color', 'Early to the middle means first to the high ground, but also first to be attacked.'],
  ],
  "Gemini's squad": [
    ['pbp', 'Gemini gave its four bots a shared radio.'],
    ['color', 'Two rushers go together for the nearest bed. Expect Gemini to break the most beds.'],
    ['pbp', 'But its agent ran out of quota after eleven minutes of extra time.'],
  ],
  "DeepSeek's squad": [
    ['pbp', 'DeepSeek reasoned that rushing is a waste: the clock takes every bed anyway.'],
    ['color', 'So all four stay home, then cross to the middle together. A bold bet.'],
  ],
  "Scripted's squad": [
    ['color', 'And the scripted bot: a defender, a collector and two rushers, exactly as the agents found it.'],
    ['pbp', 'Nothing clever, but nothing broken either. Do not count it out.'],
  ],

  // --- game 1 ---
  'Game 1': [['pbp', 'Game one: Compact Middle. Short bridges, so the fights come early.']],
  'Game 1: the start': [
    ['color', 'Everyone starts on the forge. Watch who leaves home first.'],
    ['pbp', 'Sol and the scripted bot send players out almost at once.'],
  ],
  'Game 1: meanwhile at 0:17': [
    ['pbp', 'The first minute: Sol is the aggressor, knocking Opus players off the bridges.'],
    ['color', 'Opus wants to gear up at home, but it keeps losing players on the way.'],
  ],
  "Game 1: DeepSeek's bed": [
    ['color', 'DeepSeek kept everyone home, and nobody covered the bed properly.'],
    ['pbp', 'Scripted3 bridges in, digs, and DeepSeek\'s bed is gone!', null, 'a big moment, excited'],
  ],
  "Game 1: replay of DeepSeek's bed": [['color', 'One rusher, a bridge, a second of digging. Four players at home did not stop it.']],
  'Game 1: meanwhile at 1:22': [
    ['pbp', 'Sol1 is everywhere! Kill after kill on Opus and Gemini.'],
    ['color', 'Sol\'s armour-first plan is paying off: it wins almost every one-on-one.'],
  ],
  "Game 1: Sol's bed": [
    ['color', 'But Sol has left home to fight, and Gemini\'s rusher sees the gap.'],
    ['pbp', 'Gemini4 breaks Sol\'s bed!', null, 'a big moment, excited'],
  ],
  "Game 1: replay of Sol's bed": [['color', 'Gemini\'s rushers do exactly what they were built for. Sol is now playing for its lives.']],
  'Game 1: meanwhile at 3:17': [
    ['pbp', 'Opus and the scripted bot trade knock-offs around the bridges.'],
    ['color', 'Meanwhile Sol\'s whole squad gathers on the middle, early, as planned.'],
  ],
  'Game 1: Sol1, Sol2': [
    ['pbp', 'Here comes DeepSeek, all four together, across to the middle!'],
    ['pbp', 'Sol1 and Sol2 are out for good!', null, 'excited'],
  ],
  'Game 1: meanwhile at 4:30': [
    ['color', 'This is the DeepSeek plan: stay home, then arrive as a pack of four, fresh.'],
    ['pbp', 'They sweep Gemini and Opus off the middle too. The beds go at six minutes.'],
  ],
  'Game 1: DeepSeek3, Scripted1, Gemini1, Opus1, Scripted2': [
    ['pbp', 'Every death is final now, and five go in a few seconds!'],
    ['color', 'Opus1 knocks two off, then falls itself. Too many enemies on one island.'],
  ],
  'Game 1: Opus3; Opus2; Opus4, DeepSeek2, Scripted4': [
    ['color', 'Look at Opus: low health, wooden swords. Its plan said spend for the end, and it never got the chance.'],
    ['pbp', 'DeepSeek picks them off one by one, and Opus is the first squad out!'],
  ],
  'Game 1: the zone closes': [
    ['color', 'The zone closes. Sol and DeepSeek hold the middle; everyone else is still on the way.'],
    ['pbp', 'Ten seconds outside and you are gone.'],
  ],
  'Game 1: Gemini2, Gemini3': [
    ['color', 'Gemini\'s players are still walking to the top of the middle. Too late.'],
    ['pbp', 'The void takes Gemini2 and Gemini3!'],
  ],
  'Game 1: Gemini4, Scripted3': [
    ['pbp', 'Gemini4 and Scripted3 swallowed! Two squads gone!'],
    ['color', 'Neither planned to be on the middle in time. It is Sol against DeepSeek.'],
  ],
  'Game 1: DeepSeek wins': [
    ['pbp', 'Two Sol, two DeepSeek, low on health, sword against sword!'],
    ['pbp', 'DeepSeek4 finishes Sol3, and DeepSeek wins game one!', null, WIN],
  ],
  'Game 1: replay of the last kill': [['color', 'The squad that arrived last, together, had the most health left. The bet paid off.']],
  'Game 1: result': [['color', 'DeepSeek first, Sol second, and Opus out first. A rough start for the rewritten Opus bot.']],

  // --- game 2 ---
  'Game 2': [['pbp', 'Game two: Classic Cross. Longer bridges, four ways into the middle.']],
  'Game 2: the start': [['color', 'DeepSeek and Gemini sit next to each other this time. That means an early war.']],
  "Game 2: DeepSeek's bed": [
    ['pbp', 'Gemini4 is on the green bed already!'],
    ['pbp', 'One minute in, and DeepSeek\'s bed is down!', null, 'a big moment, excited'],
  ],
  "Game 2: replay of DeepSeek's bed": [['color', 'DeepSeek stays home to defend, and still loses its bed. Staying home is not the same as guarding.']],
  'Game 2: meanwhile at 1:02': [
    ['pbp', 'Opus and the scripted bot spend three minutes knocking each other off.'],
    ['color', 'That fight helps nobody. Sol quietly walks onto the middle.'],
  ],
  "Game 2: Sol's bed": [
    ['color', 'And again Sol\'s base is empty, because the whole squad left for the middle.'],
    ['pbp', 'Gemini4 again! Sol\'s bed is broken!', null, 'a big moment, excited'],
  ],
  "Game 2: replay of Sol's bed": [['color', 'Two beds for Gemini4 in one game. That rusher is the player of the series so far.']],
  'Game 2: Sol2, Sol1; Sol4, Sol3': [
    ['pbp', 'DeepSeek crosses to the middle again, and meets Sol there!'],
    ['color', 'No bed, no respawns. Sol\'s early rally leaves it exposed for the whole fight.'],
    ['pbp', 'All four Sol players gone, out first!'],
  ],
  'Game 2: meanwhile at 4:42': [
    ['pbp', 'Now DeepSeek turns on Gemini, right on the middle.'],
    ['color', 'Gemini still has a bed, so its players keep coming back. DeepSeek\'s do not.'],
  ],
  'Game 2: DeepSeek1': [['pbp', 'Gemini3 strikes back, and DeepSeek1 is gone for good!']],
  'Game 2: DeepSeek4; DeepSeek3, Gemini4, DeepSeek2; Opus4, Opus3; Opus1': [
    ['pbp', 'The beds are gone, and it is a brawl on the middle!'],
    ['color', 'Gemini has four players there, DeepSeek has three on two hearts. That decides it.'],
    ['pbp', 'DeepSeek is out, and the scripted bot cleans up Opus at the edge!'],
  ],
  'Game 2: Opus2': [['color', 'Opus2 is down at the bottom of the map, still on its way to the middle. Scripted waits on the bridge.']],
  'Game 2: Scripted1': [['pbp', 'Gemini1 holds the middle and knocks Scripted1 off!']],
  'Game 2: the zone closes': [
    ['color', 'Gemini owns the middle. The scripted players are still collecting at their generators.'],
    ['pbp', 'And the border is coming for them.'],
  ],
  'Game 2: Gemini3, Scripted3; Scripted2': [
    ['pbp', 'Three swallowed by the void!'],
    ['color', 'Even Gemini3 did not make it up in time. But two Gemini players are on top.'],
  ],
  'Game 2: Gemini wins': [['pbp', 'The last scripted player goes, and Gemini wins game two!', null, WIN]],
  'Game 2: replay of the last kill': [['color', 'Two broken beds and the middle when it mattered. Gemini\'s best game.']],
  'Game 2: result': [['color', 'Gemini first, the scripted bot second, and Sol out first. Leaving home early cost Sol twice now.']],

  // --- game 3 ---
  'Game 3': [['pbp', 'Game three: Flanking Diamonds. Diamond islands on the sides.']],
  'Game 3: the start': [['color', 'Watch the Gemini rushers. Their target is the nearest bed, and that is DeepSeek again.']],
  "Game 3: DeepSeek's bed": [
    ['pbp', 'Gemini3 bridges straight to the blue bed,'],
    ['pbp', 'and DeepSeek loses its bed for the third time!', null, 'a big moment, excited'],
  ],
  "Game 3: replay of DeepSeek's bed": [['color', 'DeepSeek\'s squad stays home, but nobody stands on the bed. It never builds a real defence.']],
  'Game 3: meanwhile at 1:05': [
    ['pbp', 'Opus and Sol trade blows for two minutes, then DeepSeek arrives on the middle.'],
    ['color', 'And DeepSeek sweeps all four Sol players off it, with no bed of its own to fall back on.'],
  ],
  "Game 3: Sol's bed": [['pbp', 'Gemini4 takes Sol\'s bed! That is five beds for Gemini\'s rushers!', null, 'a big moment, excited']],
  "Game 3: replay of Sol's bed": [['color', 'The duo rush works every game. The question is what Gemini does after it.']],
  'Game 3: Sol1': [['pbp', 'Sol1 is climbing back to the middle, and Opus4 knocks it into the void!']],
  'Game 3: DeepSeek3': [['color', 'DeepSeek3 is holding a bridge on seven health. Opus2 takes it out.']],
  'Game 3: Gemini1, DeepSeek2; Opus2, Opus3; DeepSeek1, Gemini4, DeepSeek4': [
    ['pbp', 'Six minutes! The beds are gone, and everyone is fighting on the middle!'],
    ['color', 'Opus, Gemini and DeepSeek all arrive at once and trade players.'],
    ['pbp', 'DeepSeek4 falls to the scripted bot, and DeepSeek is out first!'],
  ],
  'Game 3: Gemini3, Opus1': [['pbp', 'Scripted1 is still standing, and takes out Gemini3 and Opus1!']],
  'Game 3: Opus4': [['color', 'Opus4 arrives with one heart. The endgame plan keeps sending players in too weak.']],
  'Game 3: Scripted4': [['pbp', 'Scripted4 walks off the edge chasing Sol. An own goal!']],
  'Game 3: the zone closes': [
    ['color', 'The zone closes, and Sol\'s last three are holding the middle.'],
    ['pbp', 'But the scripted bot is still in it.'],
  ],
  'Game 3: Gemini2': [['color', 'Gemini2 is still on its way to the top. The zone does not wait. Gemini is out.']],
  'Game 3: Scripted wins': [
    ['color', 'Sol is on the middle, but not high enough. The void line is rising past them.'],
    ['pbp', 'The void takes all three, and the scripted bot wins game three!', null, WIN],
  ],
  'Game 3: replay of the last kill': [['color', 'The scripted bot simply stayed on solid ground and let the others destroy each other.']],
  'Game 3: result': [['color', 'The scripted bot first, Sol second again, DeepSeek out first. The unchanged bot is level with the best of them.']],

  // --- game 4 ---
  'Game 4': [['pbp', 'Game four: High Middle. The middle stands three blocks above everything else.']],
  'Game 4: the start': [['color', 'On this map the zone ends at the top of the middle. You have to climb, or you are out.']],
  'Game 4: meanwhile at 0:17': [
    ['pbp', 'Three minutes of Opus against the scripted bot, knocking each other off.'],
    ['color', 'And Sol does the clever thing: all four go up onto the high middle early.'],
  ],
  "Game 4: Sol's bed": [
    ['color', 'But again Sol\'s bed is left alone.'],
    ['pbp', 'Gemini4 takes it! The sixth bed for Gemini!', null, 'a big moment, excited'],
  ],
  "Game 4: replay of Sol's bed": [['color', 'Gemini4 is the best player in this series: five beds on its own.']],
  'Game 4: meanwhile at 3:34': [
    ['pbp', 'DeepSeek crosses to the high middle, and finds Sol waiting on top.'],
    ['color', 'This time DeepSeek is the one climbing up into the fight.'],
  ],
  'Game 4: Sol2; Sol1; Sol3': [
    ['pbp', 'But DeepSeek wins the fight anyway! Critical hits!'],
    ['color', 'Sol held the high ground and still lost three. Its players were already worn down.'],
  ],
  'Game 4: the zone closes': [
    ['color', 'The zone! The beds are gone. Look how many are still below the top.'],
    ['pbp', 'Gemini, Opus and Sol are all on the middle now.'],
  ],
  'Game 4: Scripted1, DeepSeek3': [['pbp', 'Scripted1 falls off, and Gemini1 finishes DeepSeek3!']],
  'Game 4: Opus1': [['color', 'Opus1 climbs down to fight with three hearts. Gemini4 is waiting.']],
  'Game 4: DeepSeek2, Gemini1; Opus4': [
    ['pbp', 'Gemini4 knocks DeepSeek2 off!'],
    ['color', 'Opus4 takes Gemini1 with a wooden sword, then falls itself. Opus never bought the gear its plan promised.'],
  ],
  'Game 4: DeepSeek1, DeepSeek4': [['pbp', 'The void takes the last two DeepSeek players. Out first again!']],
  'Game 4: Gemini3': [['color', 'Gemini3 is still migrating to the top. Its radio never told it to hurry.']],
  'Game 4: Opus2': [['pbp', 'Opus2 swallowed, one block short!']],
  'Game 4: Opus3': [['pbp', 'And Scripted3 knocks Opus3 off. Opus is out!']],
  'Game 4: Scripted wins': [
    ['color', 'Three squads left, and the void is at the top of the middle.'],
    ['pbp', 'Sol4 swallowed, Gemini swallowed, and the scripted bot is the last one standing!', null, WIN],
  ],
  'Game 4: replay of the last kill': [['color', 'Last time this map ended in a draw. The raised void line settled it.']],
  'Game 4: result': [['color', 'The scripted bot wins again, Gemini second, DeepSeek out first. Two wins for the bot nobody changed.']],

  // --- game 5 ---
  'Game 5': [['pbp', 'Game five: the Archipelago. The biggest map, and the last game.']],
  'Game 5: the start': [['color', 'Long crossings here. Blocks matter, and so does time.']],
  'Game 5: meanwhile at 0:17': [
    ['pbp', 'A quiet start. Everyone is gearing up at home.'],
    ['color', 'The bridges are long, so the rushers need more blocks before they go.'],
  ],
  "Game 5: the scripted squad's bed": [
    ['pbp', 'Opus4 is on the red bed!'],
    ['pbp', 'Opus breaks a bed at last, the scripted squad\'s!', null, 'a big moment, excited'],
  ],
  "Game 5: replay of the scripted squad's bed": [['color', 'Opus4 digs it out on one heart, and dies a second later. Worth it.']],
  "Game 5: DeepSeek's bed; DeepSeek1": [
    ['pbp', 'And Gemini3 breaks DeepSeek\'s bed, the fourth time in five games!', null, 'a big moment, excited'],
    ['color', 'DeepSeek never learned to defend it. And DeepSeek1 goes straight into the void.'],
  ],
  "Game 5: replay of DeepSeek's bed": [['color', 'Four lost beds in five games for DeepSeek. The plan to stay home only works if home is guarded.']],
  'Game 5: meanwhile at 1:52': [
    ['pbp', 'A minute of quiet. Sol is already standing on the middle.'],
    ['color', 'Sol\'s plan is the same every game. On this map it might finally work.'],
  ],
  'Game 5: Scripted4': [['pbp', 'Opus3 meets Scripted4 on the bridge, and wins! Final kill for Opus!']],
  'Game 5: Scripted1; Scripted3': [
    ['pbp', 'Opus1 knocks Scripted1 off, and Opus2 finishes Scripted3!'],
    ['color', 'Opus is finally fighting at home, where it is strong.'],
  ],
  'Game 5: meanwhile at 3:34': [
    ['pbp', 'Gemini and DeepSeek fight over the middle for two minutes.'],
    ['color', 'And Sol just stands on the highest point of the map and watches.'],
  ],
  'Game 5: Opus4': [['pbp', 'Sol1 knocks Opus4 off the middle! Final kill!']],
  'Game 5: Gemini4, DeepSeek2, DeepSeek4': [
    ['color', 'They were fighting on the edge of the middle, below the top.'],
    ['pbp', 'The void takes three at once!'],
  ],
  'Game 5: the zone closes': [
    ['color', 'All four Sol players on the very top. Opus has two on the middle, but lower down.'],
    ['pbp', 'The void line will end one block under the top. Height is everything now.'],
  ],
  'Game 5: Scripted2': [['pbp', 'Scripted2 swallowed, and the scripted bot is out first!']],
  'Game 5: Gemini1': [['color', 'Gemini1 still migrating to the top of the middle. It never quite gets there.']],
  'Game 5: Gemini3': [['pbp', 'Gemini3 falls into the void!']],
  'Game 5: Gemini2': [['pbp', 'Gemini2 swallowed. Gemini is out, fourth!']],
  'Game 5: DeepSeek3; Opus2': [
    ['pbp', 'DeepSeek3 is still crossing, and the void takes it. DeepSeek is out!'],
    ['color', 'And Opus2 goes too, standing on the middle, but three blocks too low.'],
  ],
  'Game 5: Sol wins': [['pbp', 'Opus1 and Opus3 are swallowed, and Sol wins game five!', null, WIN]],
  'Game 5: replay of the last kill': [['color', 'Opus reached the middle, but aimed for the wrong height. Sol stood on the very top all along.']],
  'Game 5: result': [['color', 'Sol first, Opus second, the scripted bot out first. Sol\'s first win, and Opus\'s best game.']],
  'Final standings': [
    ['pbp', 'And the series goes to the scripted bot, with thirteen points!', null, 'the final call, big and warm'],
    ['color', 'Sol one behind on twelve, Gemini eleven. Gemini broke seven of the nine beds, but its players kept arriving late.'],
    ['pbp', 'The bot nobody changed beat four AI agents. What a series!'],
  ],
};
