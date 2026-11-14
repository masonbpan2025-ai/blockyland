# Changes to the AI-written bots after collection

The bots in this library are kept as their agents wrote them in the arena (see each bot's `SOURCE.md`). They were
written for one setting: SkyWars free-for-alls of five, and five-team Bed Wars with squads of four. The lobby's
"Bot join" plays them in every mode, with teams of one to four players, so a change was made only where a bot's own
logic could not work in a smaller team. Every change is listed here, with the test that covers it.

| Bot | File | Change | Why | Test |
| --- | --- | --- | --- | --- |
| Bed Wars / Sol | `bedwars/Sol/scriptedBot/playbooks/bedwars.mjs` (raid) | A raid needs a rush partner nearby only when the team has three or more players; a team of one or two raids alone. | Sol's raid required a partner, and a team of one or two has none (`rushPartners` is empty), so its players never raided a bed. | `tests/aiBotLibrary.test.js` |
| Every bot | the game client under them: `packages/blockyland-mcp/guestPeer.js` (`escapeWhenStuck`, which `agentArena/botHost.mjs` turns on) | With no headway toward where it is going for 8 s, a bot digs through the wall in its way (SkyWars), towers up over it with blocks (Bed Wars, where the map cannot be broken), or bridges the void; with no blocks to cross the void, the move says so. These bots also no longer walk through walls two or more blocks high (they slide along them). | In a game, a bot knocked into a notch walled on three sides, the void on the fourth, and its foe on a bridge 8 blocks off both stood still for the rest of the game. No bot's own code is changed, and an arena match or MCP agent keeps the old movement. | `tests/botEscape.test.js` |

Checked and left alone (they already handle small teams): every bot's `teamRole` gives one player the role `solo`
and two players a defender and a rusher; Opus's, Gemini's and the scripted bot's pair rush waits for a partner only
when there is one, and at most 15 s; DeepSeek keeps its squad together whatever its size; Gemini's team radio holds
whoever is on the team.
