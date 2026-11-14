// The bots the lobby's "Bot join" plays (server/houseBotsVite.js, agentArena/botHost.mjs): for each game, the four bots
// AI models wrote in the arena (collected here by collect.mjs) and the scripted bot they all started from. Each is a
// module exporting ScriptedBotSession (agentArena/scriptedBot/scriptedBot.mjs's shape: a session class whose house brain
// plays its playbooks).
//
// SkyWars: every bot that joins is one of the five, drawn at random. Bed Wars: every team is played by one of the five,
// drawn for the team when its first bot joins; its later bots are the same one (a squad shares a strategy, and some, such
// as Gemini's team radio, coordinate in memory).
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const scripted = path.resolve(here, '..', '..', 'scriptedBot', 'scriptedBot.mjs');
const entry = (game, name) => path.join(here, game, name, 'scriptedBot', 'scriptedBot.mjs');

/** The bots of each game: name, the model that wrote it, the run it comes from, and its entry module (an absolute path). */
export const AI_BOTS = Object.freeze({
  skywars: Object.freeze([
    { name: 'Opus', model: 'Claude Opus 5.5', run: 'five-bots', entry: entry('skywars', 'Opus') },
    { name: 'Sol', model: 'GPT-6.1 Sol', run: 'five-bots', entry: entry('skywars', 'Sol') },
    { name: 'Gemini', model: 'Gemini 3.8 Flash', run: 'five-bots', entry: entry('skywars', 'Gemini') },
    { name: 'DeepSeek', model: 'DeepSeek V4.1 Flash', run: 'five-bots', entry: entry('skywars', 'DeepSeek') },
    { name: 'Scripted', model: 'the scripted bot', run: null, entry: scripted },
  ].map(Object.freeze)),
  bedwars: Object.freeze([
    { name: 'Opus', model: 'Claude Opus 5.5', run: 'bedwars-five-r2', entry: entry('bedwars', 'Opus') },
    { name: 'Sol', model: 'GPT-6.1 Sol', run: 'bedwars-five-r2', entry: entry('bedwars', 'Sol') },
    { name: 'Gemini', model: 'Gemini 3.8 Flash', run: 'bedwars-five-r2', entry: entry('bedwars', 'Gemini') },
    { name: 'DeepSeek', model: 'DeepSeek V4.1 Flash', run: 'bedwars-five-r2', entry: entry('bedwars', 'DeepSeek') },
    { name: 'Scripted', model: 'the scripted bot', run: null, entry: scripted },
  ].map(Object.freeze)),
});

/** One of a game's bots, by name (any case), or null. */
export function aiBot(game, name) {
  return AI_BOTS[game]?.find((b) => b.name.toLowerCase() === String(name ?? '').toLowerCase()) ?? null;
}

/** One of a game's bots drawn at random (`random` returns [0, 1), as Math.random). */
export function drawBot(game, random = Math.random) {
  const list = AI_BOTS[game];
  if (!list?.length) throw new Error(`no bots for ${game}`);
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

/** The URL to import a bot's entry from. */
export const entryUrl = (bot) => pathToFileURL(bot.entry).href;
