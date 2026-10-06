// Explain a failure the way a helpful senior player would.
//
// The agent should feel like an experienced friend sitting next to you: it says
// what went wrong in plain words, reassures when it is not your fault, and always
// offers the next thing to try. It never answers with a bare error, and it never
// makes the player decode jargon to find out what to do.

/** What the world engine genuinely supports, in plain terms. */
export const CAPABILITIES = {
  build: {
    summary: 'I can build and edit pretty much anything — any shape you can make from boxes, cylinders, spheres, domes and frames, either from a template or just described in words.',
    alternatives: [
      'describe it in blocks and sizes, like "a 20-block oak pier out over the water"',
      'or name a ready-made one — castle, tower, lighthouse, bridge, house, pyramid and more'
    ]
  },
  edit: {
    summary: 'Anything you have built I can change in place: add to it, trim it, swap the blocks, or bolt on stairs and ladders.',
    alternatives: [
      'name the build you mean, or just say "the one I just made"',
      'open it in Structure Studio and drag the sliders to reshape it'
    ]
  },
  fluids: {
    summary: 'Water and lava behave properly here — they spread and fall, and you can scoop them up with a bucket. Water turns lava into obsidian, same as you would expect.',
    alternatives: [
      'ask for a pond, pool or aquarium and I will fill it for you',
      'or place water with a bucket and let it run'
    ]
  },
  terrain: {
    summary: 'I can clear ground, level it and light it up — but I cannot rewrite the landscape generator itself.',
    alternatives: [
      'clear a patch and build on the flat ground',
      'start a fresh world if you want different scenery'
    ]
  },
  mobs: {
    summary: 'I can summon the creatures the game already has — overworld, nether and bosses alike.',
    alternatives: [
      'name the creature and I will place it near you',
      'ask for a group of them and I will spread them out'
    ]
  },
  weather: {
    summary: 'I can change the weather and the time of day whenever you like.',
    alternatives: ['just say "make it rain" or "set it to night"']
  },
  inventory: {
    summary: 'I can hand you items, and crafting and villager trading both work.',
    alternatives: ['press E for the creative inventory and search for what you want']
  },
  redstone: {
    summary: 'Redstone is fully simulated. Levers, buttons, pressure plates, redstone wire, torches, repeaters, comparators, observers, redstone lamps, pistons and sticky pistons, dispensers, droppers, hoppers, note blocks, daylight detectors, target blocks, powered TNT and iron doors all work, and signals propagate with ticks and delays like the real thing.',
    alternatives: [
      'ask for a circuit by what it should do — "a piston door", "a lamp that turns on at night", "a floor that opens"',
      'or ask for a hidden door, a trap, an automatic farm or a redstone game'
    ]
  },
  transport: {
    summary: 'Rails, minecarts and boats are being built out.',
    alternatives: [
      'ask for a rail line and I will lay it',
      'or ask for a boat on a lake'
    ]
  },
  agentLimits: {
    summary: 'This is a single-player voxel game in your browser. There is no scripting, no multiplayer, and the world generator itself is fixed.',
    alternatives: [
      'tell me what you are actually after and I will find the closest thing that works',
      'build a visual version — most ideas look great even without the mechanics'
    ]
  }
};

/**
 * Requests that cannot be satisfied as asked.
 *
 * Ordered deliberately: connection and key problems are checked before the general
 * feature rules, because "DeepSeek API HTTP 401" contains "API" and would otherwise
 * be answered with advice about running code.
 */
const IMPOSSIBLE_PATTERNS = [
  {
    match: /API HTTP (401|403)/i,
    summary: 'The key was turned down, so nothing was ever sent. That is a settings thing, not something you did.',
    alternatives: [
      're-enter the key in ⚙️ Settings',
      'or switch to another vendor whose key already works'
    ]
  },
  {
    match: /API HTTP 402|insufficient_quota|out of credit|current quota/i,
    summary: 'The account has run out of credit, so the request never went through.',
    alternatives: [
      'top up your credit balance with the vendor and ask me again',
      'switch to Google Gemini in Settings (Google AI Studio provides a free tier without a credit card)',
      'or flip on Offline Mode in Settings and I will build from my built-in rules instead'
    ]
  },
  {
    match: /API HTTP 429/i,
    summary: 'The vendor is asking us to slow down — that is a temporary limit, or an account with no credit balance.',
    alternatives: [
      'if using OpenAI, make sure your account has a positive credit balance in Billing',
      'switch to Google Gemini in Settings (it includes a free tier with no payment needed)',
      'give it a few seconds and ask again',
      'lower the reasoning effort in Settings so each request costs less'
    ]
  },
  {
    match: /API HTTP (400|404)/i,
    summary: 'The vendor refused the request or the model was not found. Most of the time that means the model selected in Settings is not available on this key.',
    alternatives: [
      'pick a different model in Settings (such as Gemini 2.5 Flash)',
      'or switch vendor'
    ]
  },
  {
    match: /sent nothing|stopped sending data|failed after|idle timeout|network|fetch failed/i,
    summary: 'The connection dropped part-way through. Nothing in your world was changed.',
    alternatives: [
      'ask me again — this nearly always works on the retry',
      'if it keeps happening, check your connection',
      'or switch to Offline Mode, which needs no connection at all'
    ]
  },
  {
    match: /no json plan|not a usable plan|empty response|was malformed|was truncated|finish reason/i,
    summary: 'The model got itself in a tangle and never sent me a usable instruction, so nothing was executed. Nothing is broken.',
    alternatives: [
      'ask again — this is almost always a one-off',
      'say it in fewer words, which gives the model less to trip over',
      'or change the reasoning effort in Settings'
    ]
  },
  {
    match: /\b(multiplayer|multi-player|another player|other players|with (my )?friends?|play together|play with me|co-?op|pvp|lan|join (my|a) (friend|server)|server)\b/i,
    summary: 'I have to be straight with you: there is no multiplayer here. Each browser tab is its own single-player world, so nobody can drop in.',
    alternatives: [
      'save the world with /save and pass the file to a friend so they can have a look',
      'or build the arena anyway — it will be ready if that ever changes'
    ]
  },
  {
    match: /\b(redstone (logic|circuit)|logic circuit|circuit that counts|computer|cpu)\b/i,
    summary: 'The redstone here powers lamps, doors and pistons, but it does not think — full logic circuits are beyond what this simulator can do.',
    alternatives: [
      'ask for simpler wiring with levers, repeaters and pistons',
      'or build the layout visually as a decorative machine'
    ]
  },
  {
    match: /\b(script|javascript|typescript|python|program|plugin|mods?\b|shaderpack|compile)\b|execute_javascript|unsupported action|unsupported voxel/i,
    summary: 'I cannot run code or install mods — I only work through the game\u2019s own building blocks.',
    alternatives: [
      'tell me the end result you want and I will build it directly',
      'or name an existing structure and I will place it',
      'and ask me anything about the world — questions always work'
    ]
  },
  {
    match: /\b(port(al)?|new dimension|nether|end dimension|another world)\b/i,
    summary: 'There is one world here — extra dimensions and working portals are not something this engine has.',
    alternatives: [
      'I can build a portal frame as a landmark, which looks the part',
      'or start a new world when you want a different landscape'
    ]
  },
  {
    match: /\b(music|sound ?track|song|import(ing)?\b[^.!?]{0,24}\b(model|texture|skin|asset)|custom (model|texture|skin|asset)|upload)\b/i,
    summary: 'The sounds are generated in code and the block textures come from a fixed set, so I cannot bring in outside files.',
    alternatives: [
      'I can still build the thing itself',
      'or pick the nearest existing block texture — at a distance it reads the same'
    ]
  },
  {
    match: /\b(golem army|spawn \d{3,}|hundreds of|thousands of|infinite)\b/i,
    summary: 'That is more than one request can carry — I cap out at 30 of a creature per group and 256 building operations at a time.',
    alternatives: [
      'ask me in a few smaller batches and we will get there',
      'or I can build a smaller scene that reads the same way'
    ]
  },
  {
    match: /structure not found/i,
    summary: 'I have lost track of that build — it is not one I made this session, so I cannot safely change it.',
    alternatives: [
      'name a structure I built while we have been playing',
      'open it in Structure Studio, where I can see and edit it properly',
      'or build it again and I will take it from there'
    ]
  },
  {
    match: /no tracked blocks|did not select any blocks/i,
    summary: 'There was nothing of mine to change in that spot, so I left it alone rather than guessing.',
    alternatives: [
      'check the coordinates actually land inside the build',
      'or name the structure you want changed'
    ]
  },
  {
    match: /exceeds world height/i,
    summary: 'That would run out of world — there are 63 blocks of height to play with.',
    alternatives: [
      'ask me for a shorter version',
      'or we can build it in stages from the ground up'
    ]
  }
];

/**
 * Explain a failure the way a senior player would.
 *
 * @param {Error|string} error
 * @param {{prompt?:string}} [context]
 * @returns {{summary:string, alternatives:string[], advice:string, technical:string, reason:string}}
 */
export function explainFailure(error, context = {}) {
  const raw = typeof error === 'string' ? error : (error?.message || String(error || 'Something went wrong'));
  const prompt = String(context.prompt || '');

  // A limitation of the game is more useful to name than the generic message.
  for (const entry of IMPOSSIBLE_PATTERNS) {
    if (entry.match.test(raw) || entry.match.test(prompt)) {
      return finalise(entry.summary, entry.alternatives, raw);
    }
  }

  return finalise(
    'I could not pull that one off with the tools I have here, and I would rather tell you than pretend it worked.',
    CAPABILITIES.agentLimits.alternatives,
    raw
  );
}

function finalise(summary, alternatives, raw) {
  const list = (alternatives || []).filter(Boolean);
  const advice = [summary, ...list.map(item => `• ${item}`)].join('\n');
  return { summary, alternatives: list, advice, technical: raw, reason: raw };
}

/**
 * One line for the chat HUD, where a bulleted list is noise.
 *
 * Keeps the voice but trims to a single suggestion so the HUD stays readable.
 */
export function explainFailureBriefly(error, context = {}) {
  const { summary, alternatives } = explainFailure(error, context);
  const first = alternatives[0] ? ` Try this: ${alternatives[0]}` : '';
  return `${summary}${first}`;
}

/**
 * Is this failure the machinery misbehaving rather than the player's own doing?
 *
 * Used to keep the tone honest and kind: a dropped connection or a confused model
 * should be visibly not their fault, whereas a limitation of the game is simply a
 * limitation.
 */
export function isExternalFailure(error) {
  const raw = typeof error === 'string' ? error : (error?.message || '');
  return /API HTTP|sent nothing|stopped sending data|failed after|idle timeout|network|fetch failed|finish reason|no json plan|was malformed|was truncated/i.test(raw);
}
