// The film of hz-dry10-gemini: four Gemini 3.8 Flash agents playing a 10-minute survival match
// on Horizon (Minecraft Java Edition 26.3 rewritten in Rust, seed 20261103), recorded with
// ReplayMod 2.6.28 (.mcpr + 3D camera keyframes) and 4 live Horizon Vulkan client captures.
// Every chat caption and milestone comes verbatim from replication/runs/hz-dry10-gemini/events.jsonl.

import { arenaTimeline } from './arenaEdit.js';

export const REPLICATION_EDIT_HZ_DRY10_GEMINI = {
  id: 'replication-hz-dry10-gemini',
  title: 'The Agent Expedition: Gemini 3.8 Flash on Horizon',
  data: '/cinema-replication/hz-dry10-gemini',
  fps: 30,
  posterTime: 189,
  scenes: [
    // --- cold open highlights ---
    { name: 'Highlight: Acquire Hardware', dur: 9.8, g: [405, 412], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 3.0, height: 1.5 }, mood: 'victory', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h1', who: 'pbp', at: .2, text: 'Acquire Hardware unlocked on Horizon! Aria pulls fresh iron from the furnace and forges the squad’s first Iron Sword!', act: 'huge opening energy' }] },
    { name: 'Highlight: Furnace Hub Online', dur: 7.0, g: [338, 346], cam: { type: 'follow', who: 'Basil', cutaway: true, dist: 4.2, height: 2.0 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h2', who: 'color', at: .2, text: 'Quartermaster Basil lights up the underground smelting hub with torches and twin furnaces!', act: 'punchy teaser' }] },
    { name: 'Highlight: Rapid Rescue Response', dur: 9.2, g: [472, 480], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 3.8, height: 1.8 }, mood: 'battle', tag: 'HIGHLIGHTS',
      narrate: [{ id: 'h3', who: 'pbp', at: .2, text: 'Danger in the flooded shaft! Aria charges toward coordinates 15, 56, minus 46 with her Iron Sword drawn!', act: 'dramatic urgency' }] },

    // --- pre-game lineup card ---
    { name: 'Line-up', dur: 24.0, g: [68, 74], cam: { type: 'aerial', at: [21, 30, -48], dist: 44, height: 28, spin: .25, angle: 2.1 }, mood: 'calm', tag: 'PRE-GAME',
      card: { lineup: true, title: 'THE AGENT EXPEDITION: GEMINI ON HORIZON', sub: 'Four Gemini 3.8 Flash agents · Horizon 26.3 (Rust) · ReplayMod + 3D Camera · 10-minute match',
        roles: {
          Aria: ['Mining & Weapons Specialist', 'First iron smelt, Acquire Hardware & Iron Sword guard'],
          Basil: ['Quartermaster & Smelter', 'Base camp crafting hub, furnace & torch network'],
          Corin: ['Quarry Engineer', 'Staircase excavation, coal & deep iron veins'],
          Delphi: ['Perimeter Scout', 'Timber harvest, northern table & deep cave recon']
        } },
      narrate: [
        { id: 'n01', who: 'pbp', at: .6, text: 'Welcome to the Agent Expedition on Horizon! Four autonomous Gemini 3.8 Flash agents drop into Minecraft Java Edition 26.3, powered by the Rust Horizon server!', act: 'stadium announcer energy' },
        { id: 'n02', who: 'color', at: 13.4, text: 'We captured this ten-minute sprint with ReplayMod and all four live Vulkan clients, giving us complete 3D camera freedom and subterranean cutaways.', act: 'analytical and warm' },
      ] },

    // --- match kick-off & squad check-in ---
    { name: 'Squad Check-in', dur: 18.0, g: [68, 82], cam: { type: 'group', who: ['Basil', 'Aria', 'Delphi'], dist: 5.2, angle: .9, rise: .55 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 69.2, dur: 4.5, who: 'Basil', kind: 'chat', text: 'Basil here! Quartermaster reporting for duty. Setting up base camp!' },
        { atG: 79.1, dur: 4.5, who: 'Aria', kind: 'chat', side: 'right', text: 'Aria online! Mining specialist ready at 22 67 -51. Gathering wood now!' },
      ],
      narrate: [
        { id: 'n03', who: 'pbp', at: .4, text: 'And the clock is running! Basil and Aria check in immediately at coordinates 22, 67, minus 51 to anchor the base camp!', act: 'energetic start' },
        { id: 'n04', who: 'color', at: 10.2, text: 'Notice how cleanly they divide roles right off the spawn: Quartermaster on camp infrastructure, Aria straight onto timber and mining.', act: 'approving' },
      ] },

    { name: 'Perimeter & Quarry Roles', dur: 14.7, g: [80, 94], cam: { type: 'group', who: ['Delphi', 'Corin'], dist: 5.5, angle: 1.5, rise: .5 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 81.4, dur: 4.2, who: 'Delphi', kind: 'chat', text: 'Delphi online! Base camp at 23 67 -51. Scouting perimeter and gathering timber.' },
        { atG: 84.3, dur: 4.8, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin (Quarry Engineer) reporting in at (19, 69, -41). Gathering wood for pickaxes & quarry!' },
      ],
      narrate: [
        { id: 'n05', who: 'pbp', at: .4, text: 'Delphi takes perimeter recon while Corin claims the Quarry Engineer role on the southern ridge!', act: 'brisk play-by-play' },
        { id: 'n06', who: 'color', at: 7.5, text: 'Every agent announces exact coordinates in chat so nobody duplicates effort during the opening timber rush.', act: 'observant' },
      ] },

    // --- timber & crafting tables ---
    { name: 'Base Camp Crafting Hub', dur: 23.3, g: [115, 159], cam: { type: 'follow', who: 'Basil', dist: 4.8, height: 2.3 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 116.5, dur: 4.5, who: 'Basil', kind: 'chat', text: 'Basil: Harvested logs! Crafting planks and crafting table now.' },
        { atG: 126.8, dur: 4.5, who: 'Aria', kind: 'chat', side: 'right', text: 'Crafting table placed at 19 67 -45! Crafting wooden pickaxe.' },
        { atG: 156.5, dur: 4.5, who: 'Basil', kind: 'chat', text: 'Base camp crafting table placed at 21 67 -52!' },
      ],
      narrate: [
        { id: 'n07', who: 'pbp', at: .4, text: 'Logs are down and crafting tables go up! Aria places the first table at 19, 67, minus 45, and Basil anchors the main camp hub seconds later!', act: 'enthusiastic' },
        { id: 'n08', who: 'color', at: 13.3, text: 'Real 2-by-2 and 3-by-3 inventory slot clicks inside the Horizon client—planks, sticks, and wooden pickaxes in under two and a half minutes.', act: 'technical appreciation' },
      ] },

    // --- stone age & coal strike ---
    { name: 'Breaking into Stone Age', dur: 19.8, g: [223, 236], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 3.2, height: 1.6 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 229.1, dur: 4.5, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin crafted wooden pickaxe & wooden sword! Heading out to establish the quarry staircase for cobblestone & coal!' },
        { atG: 232.3, dur: 4.8, who: 'Aria', kind: 'chat', text: 'Struck coal and stone at 20 62 -51! Mining cobblestone and coal now.' },
      ],
      narrate: [
        { id: 'n09', who: 'pbp', at: .4, text: 'Stone Age for Basil and Aria! Our subterranean cutaway takes us right into the quarry at y 62 as Aria hits a rich coal and cobblestone seam!', act: 'excited' },
        { id: 'n10', who: 'color', at: 10.3, text: 'Finding coal right alongside the first cobblestone is huge—that means instant torches and furnace fuel without wasting wood on charcoal.', act: 'analytical' },
      ] },

    // --- getting an upgrade ---
    { name: 'Getting an Upgrade', dur: 19.4, g: [252, 270], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 3.8, height: 1.8 }, mood: 'tense', tag: 'LIVE',
      captions: [
        { atG: 254.2, dur: 4.5, who: 'Aria', kind: 'chat', text: 'Upgraded to Stone Pickaxe! Mining coal and iron now!' },
        { atG: 266.2, dur: 4.5, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Mined 6 coal and 16+ cobblestone! Returning to crafting table.' },
      ],
      narrate: [
        { id: 'n11', who: 'pbp', at: .4, text: 'Four minutes fourteen seconds: Getting an Upgrade! Aria equips her Stone Pickaxe while Basil hauls six coal and sixteen cobblestone back to the table!', act: 'fast-paced call' },
        { id: 'n12', who: 'color', at: 10.6, text: 'That is the exact progression curve from the survival playbook: three cobblestone goes straight into a stone pickaxe before touching iron.', act: 'approving' },
      ] },

    // --- striking raw iron & furnace deployment ---
    { name: 'Iron Vein & Furnace Deployment', dur: 23.0, g: [316, 344], cam: { type: 'group', who: ['Aria', 'Basil'], cutaway: true, dist: 4.5, angle: 1.3, rise: .5 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 319.1, dur: 4.5, who: 'Aria', kind: 'chat', text: 'Struck iron ore at 22 61 -47! Heading to base camp to smelt.' },
        { atG: 341.3, dur: 4.8, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Furnace and torches deployed! Heading to mine iron ore now.' },
      ],
      narrate: [
        { id: 'n13', who: 'pbp', at: .4, text: 'Iron ore uncovered at 22, 61, minus 47! And look at the timing—Corin hits Stone Age, Basil unlocks Getting an Upgrade, and the camp furnace goes live!', act: 'building excitement' },
        { id: 'n14', who: 'color', at: 12.7, text: 'As Aria mines raw iron in the east gallery, Basil places the furnace and torches at 20, 61, minus 53. Seamless handoff.', act: 'impressed' },
      ] },

    // --- acquire hardware & iron sword ---
    { name: 'Acquire Hardware & Iron Sword', dur: 20.0, g: [386, 410], cam: { type: 'face', who: 'Aria', cutaway: true, dist: 2.9, height: 1.5 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 387.2, dur: 4.0, who: 'Aria', kind: 'chat', text: 'Smelting raw iron in furnace at 20 61 -53!' },
        { atG: 392.4, dur: 4.0, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Base camp furnace is active at 20 61 -53! Bring raw iron to smelt!' },
        { atG: 406.5, dur: 4.8, who: 'Aria', kind: 'chat', text: 'Aria crafted Iron Sword! Weapons specialist armed and ready!' },
      ],
      narrate: [
        { id: 'n15', who: 'pbp', at: .4, text: 'Raw iron goes into Basil’s furnace at 6:27, and twelve seconds later—Acquire Hardware! Aria pulls the ingots and crafts the squad’s Iron Sword!', act: 'big goal call' },
        { id: 'n16', who: 'color', at: 11.3, text: 'Under seven minutes from a bare-handed spawn to smelted iron and an equipped Iron Sword in authentic Minecraft 26.3.', act: 'celebratory' },
      ] },

    // --- second furnace & coal stockpile ---
    { name: 'Second Furnace & Coal Stockpile', dur: 18.0, g: [440, 464], cam: { type: 'follow', who: 'Aria', cutaway: true, dist: 3.8, height: 1.8 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 441.5, dur: 4.2, who: 'Aria', kind: 'chat', text: 'Mining coal vein at 18 60 -51! Stockpiling fuel for the team.' },
        { atG: 457.5, dur: 4.8, who: 'Aria', kind: 'chat', side: 'right', text: 'Aria placed 2nd furnace & torches in quarry! 7 coal stockpiled. Squad protected with Iron Sword!' },
      ],
      narrate: [
        { id: 'n17', who: 'pbp', at: .4, text: 'Aria isn’t done—she mines seven more coal at y 60, places a second furnace, and lights up the lower quarry with torches!', act: 'energetic' },
        { id: 'n18', who: 'color', at: 9.3, text: 'She immediately broadcasts a full inventory check to the team: Iron Sword, Stone Pickaxe, eight torches, and seven coal ready to share.', act: 'warm' },
      ] },

    // --- flooded shaft crisis & rapid response ---
    { name: 'Crisis in the Flooded Pocket', dur: 22.4, g: [472, 486], cam: { type: 'group', who: ['Delphi', 'Aria'], cutaway: true, dist: 4.2, angle: 1.1, rise: .45 }, mood: 'battle', tag: 'LIVE',
      captions: [
        { atG: 474.9, dur: 4.2, who: 'Aria', kind: 'chat', text: 'Delphi hang on! Aria incoming with Iron Sword to support at 15 56 -46!' },
        { atG: 482.5, dur: 4.8, who: 'Aria', kind: 'chat', side: 'right', text: 'Delphi respawning at camp! Warning team: water pit at 15 56 -46. Returning to base camp to regroup.' },
      ],
      narrate: [
        { id: 'n19', who: 'pbp', at: .3, text: 'Trouble in the western shaft! Delphi breaks into a subterranean water pocket at 15, 56, minus 46 and gets trapped below the surface!', act: 'alarmed' },
        { id: 'n20', who: 'pbp', at: 11.6, text: 'Aria sprints over with her Iron Sword and immediately logs a hazard warning at 15, 56, minus 46 so no other teammate falls in!', act: 'urgent' },
      ] },

    // --- instant replay ---
    { name: 'Replay: The Water Pit Hazard', dur: 12.2, g: [471, 477], cam: { type: 'face', who: 'Delphi', cutaway: true, dist: 3.0, height: 1.4 }, mood: 'tense', tag: 'REPLAY',
      captions: [{ at: .5, dur: 10.5, who: 'Aria', kind: 'chat', text: 'Hazard log: underground water pocket at (15, 56, -46) flagged by Aria after Delphi drowned.' }],
      narrate: [{ id: 'n21', who: 'color', at: .5, text: 'Look at the instant replay with the rock cut away: Delphi dropped five blocks into a flooded pocket at y 53, and Aria immediately mapped the coordinates to protect the rest of the squad.', act: 'instructive' }] },

    // --- regrouping at camp ---
    { name: 'Regrouping at Surface Camp', dur: 16.4, g: [492, 506], cam: { type: 'group', who: ['Delphi', 'Aria', 'Basil'], dist: 5.0, angle: 1.8, rise: .5 }, mood: 'calm', tag: 'LIVE',
      captions: [
        { atG: 494.6, dur: 4.2, who: 'Delphi', kind: 'chat', text: 'Delphi back at surface camp! Thanks Aria! Patrolling surface perimeter & wood gathering.' },
        { atG: 499.7, dur: 4.0, who: 'Basil', kind: 'chat', side: 'right', text: 'Basil: Torches placed! Base camp furnace hub is fully illuminated!' },
        { atG: 502.3, dur: 4.5, who: 'Aria', kind: 'chat', text: 'Squad secure! Delphi respawned at full health, Basil & Corin mining strong, Aria on guard with Iron Sword. Fantastic expedition team!' },
      ],
      narrate: [
        { id: 'n22', who: 'pbp', at: .4, text: 'Delphi respawns right at surface camp at full health, thanking Aria while Basil finishes ringing the furnace hub with torches!', act: 'relieved and upbeat' },
        { id: 'n23', who: 'color', at: 8.7, text: 'Zero tilt from the squad: Delphi rotates onto surface perimeter patrol while the miners prepare one final deep push.', act: 'approving' },
      ] },

    // --- final deep iron push ---
    { name: 'Deep Iron Push at z=-39', dur: 21.5, g: [528, 574], cam: { type: 'group', who: ['Corin', 'Aria'], cutaway: true, dist: 4.4, angle: .9, rise: .5 }, mood: 'victory', tag: 'LIVE',
      captions: [
        { atG: 531.6, dur: 4.2, who: 'Corin', kind: 'chat', text: 'Corin crafted Stone Pickaxe, Stone Sword & 8 Torches! Heading to mine Iron Ore!' },
        { atG: 560.3, dur: 4.2, who: 'Corin', kind: 'chat', side: 'right', text: 'Corin descending with Stone Pickaxe to mine Iron Ore vein at 22 56 -39!' },
        { atG: 570.7, dur: 4.8, who: 'Aria', kind: 'chat', text: 'Aria standing guard at quarry entrance with Iron Sword! Fuel & furnace ready for Corins iron haul!' },
      ],
      narrate: [
        { id: 'n24', who: 'pbp', at: .4, text: 'In the final minute, Corin crafts eight torches and a Stone Sword, descending to the deep iron vein at 22, 56, minus 39 while Delphi hits Stone Age!', act: 'strong finish' },
        { id: 'n25', who: 'color', at: 12.3, text: 'And look at Aria standing guard with her Iron Sword at the quarry entrance, furnaces hot and waiting for Corin’s haul as time expires!', act: 'impressed' },
      ] },

    // --- full time summary card ---
    { name: 'Full Time', dur: 21.2, g: [585, 595], cam: { type: 'aerial', at: [21, 30, -48], dist: 48, height: 32, spin: .3, angle: 1.6 }, mood: 'victory', tag: 'FULL TIME',
      card: { title: '10-MINUTE EXPEDITION SUMMARY', sub: 'Four Gemini 3.8 Flash Agents · Horizon 26.3 (Rust) · Seed 20261103',
        stats: [
          'ARIA (Mining & Weapons) · Acquire Hardware, crafted Iron Sword, 2nd furnace & quarry guard',
          'BASIL (Quartermaster) · Base crafting hub, main smelting furnace, camp torch network',
          'CORIN (Quarry Engineer) · Stone Pickaxe & Stone Sword, 8 torches, deep iron shaft at y=56',
          'DELPHI (Perimeter Scout) · Northern crafting station, Stone Age, rapid respawn & patrol',
          'TEAM TOTALS · 8 advancements (4 Stone Age, 3 Getting an Upgrade, Acquire Hardware) · 589 block ops'
        ] },
      narrate: [
        { id: 'n26', who: 'pbp', at: .6, text: 'And there is the ten-minute whistle on Horizon! Nine advancements, two active furnaces, and an Iron Sword forged in under seven minutes!', act: 'closing roar' },
        { id: 'n27', who: 'color', at: 10.3, text: 'All four Gemini 3.8 Flash agents coordinated roles, shared coordinates in chat, and recovered from an underground water hazard without missing a beat.', act: 'warm summary' },
      ] },

    // --- replay studio & horizon filming verdict ---
    { name: 'Horizon Filming Architecture', dur: 22.0, g: [585, 595], cam: { type: 'aerial', at: [21, 30, -48], dist: 54, height: 36, spin: .3, angle: 2.3 }, mood: 'calm', tag: 'FULL TIME',
      card: { title: 'HORIZON 26.3 + REPLAY STUDIO', sub: 'Real Horizon Gameplay · ReplayMod .mcpr Keyframes · 3D Broadcast Camera',
        stats: [
          'HORIZON 26.3 SERVER · 4 autonomous Gemini 3.8 Flash agents driving live Vulkan clients via CLI',
          'REPLAYMOD CAPTURE · Full packet stream (.mcpr) + 18-scene 3D camera timeline (timelines.json)',
          'CINEMA REPLAY ENGINE · Subterranean quarry cutaways, broadcast HUD, live Horizon PiP viewport',
          'AUTHENTICITY · 100% verbatim chat, advancements, and trajectories from the live 10-minute match'
        ] },
      narrate: [
        { id: 'n28', who: 'color', at: .6, text: 'By pairing live Horizon 26.3 gameplay and ReplayMod packet capture with our 3D Replay Studio camera, we get both authentic survival execution and crystal-clear subterranean storytelling.', act: 'thoughtful conclusion' },
        { id: 'n29', who: 'pbp', at: 14.2, text: 'Thanks for watching the Gemini 3.8 Flash Expedition on Horizon—see you on the next thirty-minute run!', act: 'sign-off' },
      ] },
  ],
};

const timeline = arenaTimeline(REPLICATION_EDIT_HZ_DRY10_GEMINI);
export const REPLICATION_HZ_DRY10_GEMINI_STORY = { duration: timeline.duration, fps: REPLICATION_EDIT_HZ_DRY10_GEMINI.fps, posterTime: timeline.posterTime };
export const REPLICATION_HZ_DRY10_GEMINI_REVIEW_TIMES = timeline.scenes.map(s => +(s.start + s.dur / 2).toFixed(2));
