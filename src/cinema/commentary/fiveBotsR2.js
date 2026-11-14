// The commentary of the five-bots SkyWars rematch film (scripts/skywars-film-edit.mjs --commentary=...): for each scene,
// [who, text, atG?, act?] -- the play-by-play caller (pbp) and the analyst (color). Written from the games' records: the
// eliminations and what each bot said it was doing (agentArena/runs/five-bots-r2/round-N-skywars/recording/events.jsonl).
export const LINES = {
  'Highlight': [['pbp', 'The five bots are back, and this time the zone closes in!', null, 'opening the show, huge energy']],
  'Line-ups': [
    ['pbp', 'Welcome back to the Scripted Arena! The same five bots, on the same five maps.'],
    ['color', 'Nobody touched the code. The only change is the closing zone, so no game can end in a draw.'],
  ],
  'What changed': [
    ['color', 'Last time two of the five games ran out the clock, with bots hiding on their own islands.'],
    ['pbp', 'Now, from about five minutes, the border shrinks and the void rises. Somebody has to win.'],
  ],
  "Opus's bot": [
    ['color', 'Opus prices every chest, and plays the third party: let two fight, then finish the winner.'],
    ['pbp', 'It is the only bot that carries ender pearls to save itself from a fall.'],
    ['color', 'Its weakness last time: it went for the middle early, and got caught on bridges.'],
  ],
  "Sol's bot": [
    ['color', 'Sol did the most engineering: its own route finder, fifty-three tests, five practice games.'],
    ['pbp', 'And a simple rule for fights: pick the wounded player who is alone.'],
    ['color', 'The risk is that it spends a long time building, and shows up late to every fight.'],
  ],
  "Gemini's bot": [
    ['pbp', 'Gemini called its plan the vulture: let them fight, then pick off whoever is left!'],
    ['color', 'It loots the outer chests, stays away from the middle, and harasses with snowballs and the bow.'],
    ['pbp', 'That plan won it the first series.'],
  ],
  "DeepSeek's bot": [
    ['color', 'DeepSeek built a careful one: a block budget for every bridge, and the cheapest route across.'],
    ['pbp', 'Careful with blocks, yes. But it also likes to hunt, sometimes far from home.'],
  ],
  'Game 1': [['pbp', 'Game one: the Classic Ring.']],
  'Game 1: the race': [['color', 'Everyone opens their own chests first. Watch who heads for the middle.']],
  'Game 1: Opus out': [
    ['pbp', 'Opus goes straight for the middle chests,'],
    ['pbp', 'and a snowball from DeepSeek knocks it off! Opus is out first!', 18.5],
  ],
  'Game 1: DeepSeek out': [
    ['color', 'DeepSeek wandered fifty blocks to loot another spawn. That costs health it does not have.'],
    ['pbp', 'The scripted bot crits it with the axe. DeepSeek is slain!', 21.6],
  ],
  'Game 1: Sol out': [
    ['color', 'Sol tries to leave the exposed bridge, exactly what its plan says.'],
    ['pbp', 'Too late! Scripted knocks it into the void!', 37.4],
  ],
  'Game 1: Scripted wins': [
    ['color', 'Gemini is down to four hearts, and eating on the edge.'],
    ['pbp', 'One hit, Gemini goes over, and the scripted bot wins game one!', null, 'the winning call: scream it with joy'],
  ],
  'Game 1: replay': [['color', 'Gemini stepped back to heal, and stepped back onto nothing. The scripted bot ate a golden apple first.']],
  'Game 1: result': [['pbp', 'Sixty-seven seconds! The bot nobody changed takes the first game.']],
  'Game 2': [['pbp', 'Game two: Sectors.']],
  'Game 2: the race': [['color', 'Opus has a diamond sword already from the middle. That changes everything.']],
  'Game 2: DeepSeek out': [
    ['pbp', 'DeepSeek goes hunting Opus with the bow, on a bridge,'],
    ['pbp', 'and Opus knocks it straight off! DeepSeek is out!', 20.5],
  ],
  'Game 2: Opus out': [
    ['color', 'Now Opus chases Sol across a bridge. Sol simply waits at the end of it.'],
    ['pbp', 'One hit, Opus falls! The diamond sword goes with it!', 26.5],
  ],
  'Game 2: Sol out': [
    ['color', 'Sol is down to seven health against a diamond sword.'],
    ['pbp', 'Scripted knocks Sol into the void!', 59.5],
  ],
  'Game 2: Scripted wins': [
    ['color', 'Gemini looted the outer chests all game, and now has to fight the leader alone.'],
    ['pbp', 'Off the edge again! Scripted wins game two!', null, 'the winning call: scream it with joy'],
  ],
  'Game 2: replay': [['color', 'Same story: Gemini comes to the scripted bot, on its ground. The vulture waited a bit too long.']],
  'Game 2: result': [['pbp', 'Two from two for the scripted bot, both in about seventy seconds!']],
  'Game 3': [['pbp', 'Game three: the Archipelago, the map that ended in a draw last time.']],
  'Game 3: the race': [['color', 'Lots of small islands here. Every crossing is a bridge, and every bridge is a risk.']],
  'Game 3: Sol out': [
    ['pbp', 'Sol is routing over the bridges to the middle chests,'],
    ['pbp', 'and Gemini snowballs it off! Sol is gone!', 19.5],
  ],
  'Game 3: Scripted out': [
    ['color', 'Now Opus plays the third party. It shoots from the high ground.'],
    ['pbp', 'An arrow, and the scripted bot is in the void!', 30.6],
  ],
  'Game 3: DeepSeek out': [
    ['pbp', 'DeepSeek throws eggs at Opus, and Opus pearls straight at it!'],
    ['color', 'Bow, pearl, sword. That is Opus at its best.'],
  ],
  'Game 3: Gemini wins': [
    ['color', 'Opus is climbing down a ledge, and Gemini has been waiting with a diamond sword.'],
    ['pbp', 'The vulture strikes! Opus goes over, and Gemini wins game three!', null, 'the winning call: scream it with joy'],
  ],
  'Game 3: replay': [['color', 'This is the plan working: let Opus clean up the others, then hit it while it is climbing.']],
  'Game 3: result': [['pbp', 'Forty-eight seconds! The draw from last time is now a Gemini win.']],
  'Game 4': [['pbp', 'Game four: Twin Peaks.']],
  'Game 4: the race': [['color', 'Two tall peaks and deep drops. Height matters on this map.']],
  'Game 4: Gemini, Opus out': [
    ['pbp', 'DeepSeek knocks Gemini off the peak!'],
    ['pbp', 'And Scripted knocks Opus off too! Opus throws a pearl, but it is not enough!', 21],
  ],
  'Game 4: Scripted out': [
    ['color', 'Look at Sol: it builds a backstop on the exposed bridge before it fights.'],
    ['pbp', 'Diamond sword, and the scripted bot is slain!', 61.6],
  ],
  'Game 4: meanwhile at 1:00': [
    ['color', 'Two left. DeepSeek is down to eight health, and backs away to solid ground.'],
    ['pbp', 'Sol loots the centre and gears up. It knows it is the stronger one now.'],
  ],
  'Game 4: Sol wins': [
    ['color', 'Sol\'s rule: hunt the wounded player who is alone. That is DeepSeek, on two hearts.'],
    ['pbp', 'An arrow, and Sol wins game four!', null, 'the winning call: scream it with joy'],
  ],
  'Game 4: replay': [['color', 'Patience. Sol waited for the full kit, then finished it from range.']],
  'Game 4: result': [['pbp', 'Sol\'s first win in either series!']],
  'Game 5': [['pbp', 'Game five: Sky Tiers. Last time, a draw after eight minutes.']],
  'Game 5: the race': [['color', 'Tiers of islands, high and low. The middle stands tall.']],
  'Game 5: Sol out': [
    ['pbp', 'Opus comes in with the diamond sword. A critical hit!'],
    ['pbp', 'Sol is slain! Opus is hunting today.', 37.7],
  ],
  'Game 5: Scripted out': [
    ['color', 'Opus waits below the scripted bot as it climbs down.'],
    ['pbp', 'And knocks it off! Two down for Opus!', 68.7],
  ],
  'Game 5: meanwhile at 1:06': [
    ['color', 'Three left, and for three minutes nobody fights. Everyone just loots.'],
    ['pbp', 'Last time this is exactly how it ended: a draw. Not today.'],
  ],
  'Game 5: the zone closes': [
    ['color', 'The zone! Gemini stands on the middle\'s top. Opus is down under the islands.'],
    ['pbp', 'And under an island counts as the void!'],
  ],
  'Game 5: Gemini wins': [
    ['color', 'DeepSeek fell back to lower ground, and the void is rising past it.'],
    ['pbp', 'The void takes them, and Gemini wins game five!', null, 'the winning call: scream it with joy'],
  ],
  'Game 5: replay': [['color', 'None of these bots was written for the zone. Gemini simply stood in the right place.']],
  'Game 5: result': [['pbp', 'The zone settles it after six minutes forty!']],
  'Final standings': [
    ['pbp', 'The rematch goes to Gemini, with fourteen points!', null, 'the final call, big and warm'],
    ['color', 'The scripted bot second on twelve, with two wins. Sol, Opus and DeepSeek share third on eight.'],
  ],
};
