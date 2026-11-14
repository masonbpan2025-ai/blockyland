// The arena's round keeper and its small HTTP API, which each player's MCP server calls.
//
//   GET  /look?player=Ash          what Ash sees now
//   POST /act {player, thought, plan, chat}
//                                  hand in Ash's plan; answers once the round has been played, with what Ash sees then
//   GET  /status                   the round, who has planned, who is alive
//
// A round is played once every living player has handed in a plan, or ROUND_WAIT after the first plan came in, so one
// slow player cannot hold the game up. A player who did not plan keeps working through the last plan.
import { createServer } from 'node:http';

export function createArenaServer(sim, { port = 47700, roundWaitMs = 150_000, onRound = null, log = () => {} } = {}) {
  const waiting = new Map(); // name -> [resolve]
  const planned = new Set();
  let timer = null;
  let playing = false;

  const alive = () => sim.players.filter(e => e.alive).map(e => e.name);

  async function playRound(reason) {
    if (playing) return;
    playing = true;
    clearTimeout(timer); timer = null;
    const absent = alive().filter(n => !planned.has(n));
    log(`round ${sim.round + 1}: ${reason}${absent.length ? `; no new plan from ${absent.join(', ')}` : ''}`);
    try {
      await sim.playRound();
      await onRound?.(sim);
    } catch (error) {
      log(`round failed: ${error.stack || error}`);
    }
    planned.clear();
    const answers = [...waiting.entries()];
    waiting.clear();
    playing = false;
    for (const [name, resolvers] of answers) {
      const view = sim.observe(name);
      for (const resolve of resolvers) resolve(view);
    }
  }

  function maybePlay() {
    if (playing || sim.over) return;
    const names = alive();
    if (names.length && names.every(n => planned.has(n))) playRound('everyone has planned');
    else if (!timer && planned.size) timer = setTimeout(() => playRound('waited long enough'), roundWaitMs);
  }

  async function act(body) {
    const name = String(body?.player || '');
    const entry = sim.byName(name);
    if (!entry) return { status: 404, body: { error: `No player called ${name}.` } };
    if (sim.over) return { status: 200, body: { game_over: sim.over, view: sim.observe(name) } };
    if (!entry.alive) return { status: 200, body: { eliminated: true, killed_by: entry.killedBy, view: sim.observe(name) } };
    if (!Array.isArray(body.plan) || !body.plan.length) return { status: 400, body: { error: 'plan must be a list of 1 to 6 commands.' } };
    if (!String(body.thought || '').trim()) return { status: 400, body: { error: 'thought is required: say what you are thinking and why.' } };
    const accepted = sim.submit(name, { thought: body.thought, plan: body.plan, chat: body.chat });
    // A plan with nothing usable in it is answered at once, so the player can fix it before the round is played.
    if (!accepted.accepted?.length) return { status: 200, body: { planned: false, rejected: accepted.rejected, hint: 'None of the steps could be used; fix them and call act again. The round has not been played yet.' } };
    planned.add(name);
    const view = await new Promise((resolve) => {
      if (!waiting.has(name)) waiting.set(name, []);
      waiting.get(name).push(resolve);
      maybePlay();
    });
    return { status: 200, body: { planned: true, rejected: accepted.rejected, view } };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && url.pathname === '/look') {
        const name = url.searchParams.get('player');
        if (!sim.byName(name)) return send(404, { error: `No player called ${name}.` });
        return send(200, sim.observe(name));
      }
      if (req.method === 'GET' && url.pathname === '/status') {
        return send(200, { round: sim.round, over: sim.over, alive: alive(), planned: [...planned], playing });
      }
      if (req.method === 'POST' && url.pathname === '/act') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const result = await act(JSON.parse(raw || '{}'));
        return send(result.status, result.body);
      }
      send(404, { error: 'Not found' });
    } catch (error) {
      send(500, { error: String(error?.message || error) });
    }
  });

  return {
    listen: () => new Promise((resolve) => server.listen(port, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => { clearTimeout(timer); server.close(() => resolve()); }),
    act, playRound,
  };
}
