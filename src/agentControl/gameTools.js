// The game side of Agent Control: what each tool does in the player's world (protocol.js lists the tools).
//
// These reuse the Agent Terminal's machinery instead of copying it: run_plan goes through WorldAgent.runPlan, the plan
// language is the one the built-in vendor models wrote (PLAN_JSON_SCHEMA and the rules in buildSystemPrompt), and
// look_around assembles the same world description those models were given. So an outside AI app gets exactly the
// powers the terminal's own AI had, and a fix to either serves both.
import { BLOCK_DEFS, ITEMS } from '../blocks.js';
import { validatePlan } from '../agentPlans.js';
import { formatPerception } from '../agentPerception.js';
import { explainFailure } from '../agentCapabilities.js';
import { buildCommandContext, runCommand } from '../commandRunner.js';
import { PLAN_JSON_SCHEMA } from '../worldAgent.js';
import { toolError } from './protocol.js';

/** A failure with one of protocol.js's error kinds. */
export class ToolFailure extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

const DESTRUCTIVE_ACTIONS = new Set(['destroy', 'clear']);
const DESTRUCTIVE_COMMANDS = new Set(['fill', 'setblock', 'clone', 'kill', 'clear']);

/** Every action in a plan, including the steps of a "multi". */
export function planActions(plan, out = []) {
  if (!plan || typeof plan !== 'object') return out;
  if (typeof plan.action === 'string') out.push(plan.action);
  if (Array.isArray(plan.steps)) for (const step of plan.steps) planActions(step, out);
  return out;
}

export function commandName(line) {
  return String(line).trim().replace(/^\//, '').split(/\s+/)[0].toLowerCase();
}

function itemLabel(item) {
  if (!item) return null;
  const name = item.name || BLOCK_DEFS[item.id]?.name || ITEMS[item.id]?.name || String(item.id);
  return { name, count: item.count ?? 1 };
}

/** The world around the player as text: the world sections of the terminal's own system prompt. */
export function describeWorld(agent) {
  const game = agent.game;
  const player = game?.player;
  const p = player?.position || { x: 0, y: 0, z: 0 };
  const facing = typeof player?.yaw === 'number' ? agent.describeFacing(player.yaw) : 'unknown';
  const buildings = agent.builtBuildings?.length
    ? agent.builtBuildings.map(s => JSON.stringify(agent.buildingContext(s))).join('\n')
    : 'None yet.';
  const surface = agent.buildSurfaceMap();
  const target = agent.describeTargetBlock();
  const ahead = agent.describeForwardView();
  const aheadText = !ahead
    ? 'DIRECTLY AHEAD: unavailable.'
    : ahead.openAir
      ? `DIRECTLY AHEAD (player faces ${ahead.facing}): clear for 24 blocks — open air, open sky or a drop-off.`
      : `DIRECTLY AHEAD (player faces ${ahead.facing}): first hits ${ahead.firstHit.name} at (${ahead.firstHit.x}, ${ahead.firstHit.y}, ${ahead.firstHit.z}), about ${ahead.firstHit.distance.toFixed(0)} blocks away. Further along: ${ahead.blocks.join(', ')}.`;
  return [
    `PLAYER: at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}), facing ${facing}. Game mode: ${player?.gamemode || 'creative'}. Weather: ${game?.weather?.weatherType || 'clear'}. Time: ${game?.worldTime ?? 6000} (0-24000; 6000 midday, 18000 midnight).`,
    '',
    'BUILDINGS MADE THIS SESSION (ids for edit, destroy, build_stairs):',
    buildings,
    `Last referenced building id: ${agent.lastReferencedBuilding?.id || agent.lastBuiltBuilding?.id || 'none'}.`,
    '',
    agent.buildStudioBuildingContext() || '',
    surface
      ? `LOCAL TERRAIN (one character per block column, 33x33 centred on the player; the first row is 16 blocks north/-Z and each row is +1 Z; the first column is 16 blocks west/-X and each column is +1 X):\n${surface.rows.join('\n')}\nLegend: ${surface.legend}`
      : 'LOCAL TERRAIN: unavailable.',
    agent.describeWaterline(),
    '',
    target ? `CROSSHAIR: on ${target.name} at (${target.coordinates.join(', ')})${target.face ? `, ${target.face} face` : ''}.` : 'CROSSHAIR: not on a block.',
    aheadText,
    '',
    formatPerception(agent.perceive({ fresh: true })),
  ].join('\n');
}

/**
 * The plan language: the rules and schema of the terminal's system prompt, from "RESOLVING WHAT THE PLAYER MEANS" on,
 * so there is one copy of them. The prompt asked the model to reply with a JSON plan; here that plan goes to run_plan.
 */
export function planReference(agent) {
  const prompt = agent.buildSystemPrompt();
  const start = prompt.indexOf('RESOLVING WHAT THE PLAYER MEANS:');
  const rules = start >= 0 ? prompt.slice(start) : `PLAN SCHEMA:\n${PLAN_JSON_SCHEMA}`;
  return [
    'HOW THIS MAPS TO TOOLS: wherever the text below says to "return" or "reply with" a JSON plan, pass that plan to',
    'run_plan. A plain answer ("message") can go through say instead. Build a large project as several run_plan calls,',
    'one part each, using look_around between them. Coordinates in operations are relative to the building\'s placement',
    'box, as described below.',
    '',
    rules,
  ].join('\n');
}

/** Run one tool. Returns { result, images? } or throws ToolFailure. */
export async function runGameTool(name, args, ctx) {
  const { game, agent, ui } = ctx;
  if (!game || !agent) throw new ToolFailure('state', 'The game is still starting. Try again in a moment.');
  const inWorld = () => {
    if (!game.player || !game.world) throw new ToolFailure('state', 'No world is open: the player is on the start screen. Ask them to start or load a world.');
  };

  switch (name) {
    case 'get_state': {
      inWorld();
      const player = game.player;
      const target = agent.describeTargetBlock();
      return { result: {
        position: ['x', 'y', 'z'].map(k => Math.round(player.position[k] * 10) / 10),
        facing: typeof player.yaw === 'number' ? agent.describeFacing(player.yaw) : 'unknown',
        dimension: game.currentDimension || 'overworld',
        gameMode: player.gamemode,
        health: player.health, food: player.hunger,
        time: game.worldTime, weather: game.weather?.weatherType || 'clear',
        heldItem: itemLabel(game.inventory?.getActiveItem?.()),
        hotbar: (game.inventory?.hotbar || []).map(itemLabel),
        crosshair: target ? { block: target.name, position: target.coordinates, face: target.face } : null,
        agentBusy: !!agent.isExecuting,
      } };
    }
    case 'look_around': {
      inWorld();
      agent.turnId += 1;
      agent.surfaceMapCache = null;
      agent.perceptionCache = null;
      return { result: { description: describeWorld(agent) } };
    }
    case 'screenshot': {
      inWorld();
      if (!ctx.allowScreenshots?.()) throw new ToolFailure('denied', 'The player turned screenshots off in Connect AI. Use look_around instead.');
      const shot = game.captureCurrentView?.();
      if (!shot?.base64) throw new ToolFailure('failed', 'The game could not capture its view (the 3D view may not be drawn yet).');
      return { result: { note: 'The player\'s current view.' }, images: [{ mimeType: shot.mimeType || 'image/jpeg', data: shot.base64 }] };
    }
    case 'plan_reference':
      inWorld();
      return { result: { reference: planReference(agent) } };
    case 'run_plan':
      inWorld();
      return runPlanTool(args, ctx);
    case 'run_command':
      inWorld();
      return runCommandTool(args, ctx);
    case 'say': {
      ui?.addAgentReply?.(args.text, ctx.clientLabel?.());
      agent.conversationHistory?.push({ role: 'assistant', text: args.text, timestamp: Date.now() });
      return { result: { shown: true } };
    }
    default:
      throw new ToolFailure('unknown', `The game has no tool ${name}.`);
  }
}

async function runPlanTool({ plan, request = '', confirm = false }, ctx) {
  const { agent, game } = ctx;
  // The same rule as the Agent Terminal itself (sessionSettings.allowsAgentTerminal): Creative, or cheats on.
  // run_command needs no such check: each command applies its own permission, as when the player types it.
  if (typeof game.allowsAgentTerminal === 'function' && !game.allowsAgentTerminal()) {
    throw new ToolFailure('denied', 'This world is in Survival with cheats off, where the Agent Terminal cannot change the world. Ask the player to switch to Creative or turn cheats on. You can still look around and give advice with say.');
  }
  const actions = planActions(plan);
  const destructive = actions.filter(a => DESTRUCTIVE_ACTIONS.has(a));
  if (destructive.length && !confirm) {
    throw new ToolFailure('confirm', `This plan ${destructive.includes('destroy') ? 'destroys a building' : 'clears terrain'}. Pass confirm: true only if the player asked for that.`);
  }
  try {
    validatePlan(plan);
  } catch (err) {
    throw new ToolFailure('usage', `The plan is not valid: ${err.message} See plan_reference.`);
  }
  if (agent.isExecuting) throw new ToolFailure('busy', 'The game is still carrying out an earlier request. Wait a moment and try again.');

  const lines = [];
  const previousLog = agent.onLog;
  const previousLabel = agent.chatLabel;
  agent.chatLabel = ctx.clientLabel?.() || 'Your AI app';
  agent.onLog = (message, type) => {
    lines.push(`${type}: ${message}`);
    previousLog?.(message, type);
  };
  agent.isExecuting = true;
  agent.turnId += 1;
  agent.surfaceMapCache = null;
  agent.perceptionCache = null;
  agent.lastError = null;
  agent.log(`🔌 ${ctx.clientLabel?.() || 'Your AI app'}: ${plan.explanation || plan.action}`, 'prompt');
  try {
    await agent.runPlan(plan, request || plan.explanation || '');
    // In Building Studio the result replaces the open build, as when the terminal's own presets build
    // (WorldAgent.executePrompt): otherwise it would be built but not attached to the studio.
    let studio = null;
    if (game.buildingStudio?.isActive && typeof game.buildingStudio.adoptFromPlan === 'function' && game.buildingStudio.adoptFromPlan(plan)) {
      studio = 'The build is open in Building Studio; the player can save it as a .schem file.';
      agent.log(`[Building Studio] "${plan.buildingType || plan.name}" is on screen — click 💾 Save to write it as a .schem file the studio watches.`, 'success');
    }
    agent.conversationHistory?.push(
      { role: 'user', text: request || '(request from an AI app)', timestamp: Date.now() },
      { role: 'assistant', text: JSON.stringify({ status: 'completed', action: plan.action, explanation: plan.explanation }), timestamp: Date.now() },
    );
    const buildings = (agent.builtBuildings || []).slice(-8).map(b => ({
      id: b.id, name: b.name, type: b.type,
      origin: [b.startX, b.baseY, b.startZ], size: [b.width, b.height, b.depth],
    }));
    return { result: { ok: true, actions, log: lines.slice(-30), buildings, ...(studio ? { studio } : {}) } };
  } catch (err) {
    const explanation = explainFailure(err, { prompt: request });
    agent.log(`Could not finish that: ${explanation.summary}`, 'error');
    throw new ToolFailure('failed', `${explanation.summary} (${err.message}). Log: ${lines.slice(-10).join(' | ')}`);
  } finally {
    agent.onLog = previousLog;
    agent.chatLabel = previousLabel;
    agent.isExecuting = false;
    agent.onComplete?.();
  }
}

async function runCommandTool({ command, confirm = false }, ctx) {
  const { game, agent } = ctx;
  const name = commandName(command);
  if (DESTRUCTIVE_COMMANDS.has(name) && !confirm) {
    throw new ToolFailure('confirm', `/${name} can remove or overwrite things. Pass confirm: true only if the player asked for that.`);
  }
  const clean = command.trim().startsWith('/') ? command.trim() : `/${command.trim()}`;
  const output = [];
  const context = buildCommandContext(game);
  context.say = (text, kind = 'system') => {
    output.push(text);
    if (kind === 'error') context.failed = true;
    game.ui?.addChatMessage?.(text, kind);
  };
  agent.log(`🔌 ${ctx.clientLabel?.() || 'Your AI app'}: ${clean}`, 'prompt');
  let handled = await runCommand(context, clean);
  if (!handled && typeof game.runManagerCommand === 'function') handled = Boolean(await game.runManagerCommand(clean, context));
  if (!handled) throw new ToolFailure('unknown', `The game does not know ${clean.split(/\s+/)[0]}.${output.length ? ` It said: ${output.join(' ')}` : ''}`);
  if (context.failed) throw new ToolFailure('failed', output.join(' ') || `${clean} failed.`);
  return { result: { ok: true, output } };
}

/** For the bridge: a thrown error as a protocol error object. */
export function asToolError(err) {
  if (err instanceof ToolFailure) return toolError(err.kind, err.message);
  return toolError('failed', err?.message || String(err));
}
