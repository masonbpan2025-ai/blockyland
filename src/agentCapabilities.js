// Turn an agent failure into advice the player can act on.
//
// Why this exists: when a request could not be carried out the terminal printed the
// raw reason — "Unsupported action: execute_javascript", "Structure not found:
// made_up_id" — which tells the player what the code objected to, not what they can
// do instead. Every failure should name the limitation and offer a way forward.

/** What the world engine genuinely supports, and what to try instead. */
export const CAPABILITIES = {
  build: {
    summary: 'You can build and edit voxel structures: any shape expressible as boxes, cylinders, spheres, domes and frames, from a template or described in words.',
    alternatives: [
      'describe the shape in terms of blocks and sizes ("a 20-block oak pier over the water")',
      'ask for it with an explicit structure type ("build a castle")'
    ]
  },
  edit: {
    summary: 'Existing structures can be edited in place: add, remove, replace blocks, extend them, or attach stairs and ladders.',
    alternatives: [
      'name the structure you mean, or say "the one I just built"',
      'open it in Structure Studio and change its parameters there'
    ]
  },
  fluids: {
    summary: 'Source water and lava flow, spread, fall and can be placed or collected with buckets. Water solidifies lava into obsidian.',
    alternatives: [
      'ask for a pond, pool or aquarium, which come pre-filled',
      'place water with a bucket and let it spread'
    ]
  },
  terrain: {
    summary: 'Terrain can be cleared, levelled and lit, but the world generator itself is fixed.',
    alternatives: ['clear an area and build on the flat ground', 'start a new world for different terrain']
  },
  mobs: {
    summary: 'Built-in mobs can be summoned and custom mobs designed in Mob Studio, with body type, colours, ears, tails, face markings, behaviour and a few skills.',
    alternatives: [
      'design the creature in Mob Studio and adjust it with the parameter sliders',
      'summon one of the built-in mobs instead'
    ]
  },
  weather: {
    summary: 'Weather can be set to clear, rain or thunder, and the time of day changed.',
    alternatives: ['use the chips-free terminal: "make it rain", "set time to night"']
  },
  inventory: {
    summary: 'Items can be given, and crafting and villager trades are available.',
    alternatives: ['open the creative inventory with E and search for the item']
  },
  agentLimits: {
    summary: 'This is a single-player voxel game running in the browser. There is no redstone logic simulation, no scripting, no multiplayer and no persistence beyond saved worlds.',
    alternatives: [
      'build something visual that suggests the behaviour',
      'save the world with /save and load it again later'
    ]
  }
};

/** Things players commonly ask for that the engine cannot do, with a way forward. */
const IMPOSSIBLE_PATTERNS = [
  // Transport and credential failures come first. "DeepSeek API HTTP 401" contains
  // "API", which the scripting rule below would otherwise match, answering an auth
  // failure with advice about code.
  {
    match: /API HTTP (401|403)/i,
    summary: 'The API key was rejected.',
    alternatives: ['re-enter the key in Settings', 'switch to another vendor that has a key saved']
  },
  {
    match: /API HTTP 402/i,
    summary: 'The account is out of credit.',
    alternatives: ['top up with the vendor', 'switch to another vendor', 'switch to Offline Mode in Settings']
  },
  {
    match: /API HTTP 429/i,
    summary: 'The vendor is rate limiting requests.',
    alternatives: ['wait a moment and retry', 'lower the reasoning effort in Settings']
  },
  {
    match: /API HTTP 400/i,
    summary: 'The vendor rejected the request itself.',
    alternatives: ['confirm this model is available on the key', 'pick a different model in Settings']
  },
  {
    match: /sent nothing|stopped sending data|failed after/i,
    summary: 'The connection to the vendor stalled or failed.',
    alternatives: ['retry the request', 'check the network or the API status page', 'switch vendor or use Offline Mode']
  },
  {
    match: /no json plan|not a usable plan|empty response|was malformed|was truncated|finish reason/i,
    summary: 'The model did not return a usable instruction.',
    alternatives: ['try again — this is usually transient', 'use a shorter, more direct request', 'adjust the reasoning effort in Settings']
  },
  {
    match: /\b(multiplayer|multi-player|another player|other players|with (my )?friends?|play together|play with me|co-?op|pvp|lan|join (my|a) (friend|server)|server)\b/i,
    summary: 'There is no multiplayer — each browser tab is its own isolated single-player world.',
    alternatives: ['save the world with /save and share the file', 'build the arena anyway so it is ready if that ever changes']
  },
  {
    match: /\b(redstone (circuit|logic|machine|contraption)|logic gate|piston (machine|door)|automate|automation|wireless)\b/i,
    summary: 'There is no redstone logic simulation: lamps and torches light up, but circuits do not compute.',
    alternatives: ['build a decorative version of the machine', 'place redstone lamps and torches for the look of it']
  },
  {
    match: /\b(script|javascript|typescript|python|program|plugin|mods?\b|shaderpack|compile)\b|execute_javascript|unsupported action/i,
    summary: 'The agent cannot run code or install mods — it only issues the game\u2019s own build and world actions.',
    alternatives: [
      'describe the result you want in blocks and the agent will build it',
      'ask for an existing structure type by name',
      'ask a question about the world, which is always answerable'
    ]
  },
  {
    match: /\b(port(al)?|new dimension|nether|end dimension|another world)\b/i,
    summary: 'There is one generated overworld; extra dimensions and portals are not implemented.',
    alternatives: ['build a portal frame as a landmark', 'start a new world for a different landscape']
  },
  {
    match: /\b(music|sound ?track|song|import(ing)?\b[^.!?]{0,24}\b(model|texture|skin|asset)|custom (model|texture|skin|asset)|upload)\b/i,
    summary: 'Sounds are synthesised and block textures come from a fixed atlas, so nothing can be imported.',
    alternatives: ['ask for the build itself', 'use one of the existing block textures to approximate the look']
  },
  {
    match: /\b(golem army|spawn \d{3,}|hundreds of|thousands of|infinite)\b/i,
    summary: 'There are practical limits: 30 mobs per summon group and 256 operations per request.',
    alternatives: ['ask for them in several smaller requests', 'build a smaller representative scene']
  },
  {
    match: /execute_javascript|eval|unsupported action/i,
    summary: 'The model asked for an action this game does not have.',
    alternatives: [
      'rephrase as a build ("build a lighthouse")',
      'ask a question about the world, which is always answerable',
      'say what you want to happen in plain words and the agent will pick a supported action'
    ]
  },
  {
    match: /structure not found/i,
    summary: 'That structure is not in the agent\u2019s memory for this session.',
    alternatives: [
      'name a structure you built in this session',
      'open it in Structure Studio, where the agent can see and edit it',
      'build it first, then edit it'
    ]
  },
  {
    match: /no tracked blocks|did not select any blocks/i,
    summary: 'There was nothing the agent could change there.',
    alternatives: ['check the coordinates are inside the build', 'name the structure you want changed']
  },
  {
    match: /exceeds world height/i,
    summary: 'The build would go outside the world, which is 1 to 63 blocks tall.',
    alternatives: ['ask for a shorter structure', 'build it in several pieces from the ground up']
  }
];

/**
 * Explain a failure and suggest what to do next.
 *
 * @param {Error|string} error
 * @param {{prompt?:string}} [context]
 * @returns {{summary:string, alternatives:string[], advice:string}}
 */
export function explainFailure(error, context = {}) {
  const raw = typeof error === 'string' ? error : (error?.message || String(error || 'Unknown error'));
  const prompt = String(context.prompt || '');

  // A request-level impossibility is more useful than the generic message.
  for (const entry of IMPOSSIBLE_PATTERNS) {
    if (entry.match.test(raw) || entry.match.test(prompt)) {
      return finalise(entry.summary, entry.alternatives, raw);
    }
  }

  return finalise(
    'That request could not be carried out with the actions this game provides.',
    CAPABILITIES.agentLimits.alternatives,
    raw
  );
}

function finalise(summary, alternatives, raw) {
  const list = (alternatives || []).filter(Boolean);
  const advice = [summary, ...list.map(item => `• ${item}`)].join('\n');
  return { summary, alternatives: list, advice, reason: raw };
}

/** One-line version for the chat HUD, where a bulleted list would be noise. */
export function explainFailureBriefly(error, context = {}) {
  const { summary, alternatives } = explainFailure(error, context);
  const first = alternatives[0] ? ` Try: ${alternatives[0]}.` : '';
  return `${summary}${first}`;
}
