// Independent wiki-tutorial play-testing, inside the real game.
//
// Every scenario runs the real `Game`: `animate()` itself is driven at a fixed 1/30 s step, so physics, the
// player bot, raycasting, mining, mobs, dropped items, furnaces, beds, farming, redstone, water and the clock all
// run exactly as they do when a person plays. Only the drawing is switched off (it changes nothing in play).
//
// Rules the scenarios follow, so a pass means the bot actually played:
//  - setup shapes the WORLD (terrain, mobs, time of day); it never hands the bot what the tutorial makes it earn;
//  - when a tutorial presupposes items (a brewing guide assumes the ingredients), the scenario gives them and says
//    so in `given`, which the report lists;
//  - every check carries the wiki sentence it tests.
import { BLOCKS } from '../../src/blocks.js';
import { Chunk } from '../../src/world.js';

export function createPlaytest(game, {
  radius = 2, ground = BLOCKS.GRASS_BLOCK, dirtDepth = 3, groundY = 4, gameMode = 'survival', difficulty = 'normal',
  time = 1000, spawning = false, dt = 1 / 30,
} = {}) {
  const bot = game.playerBot, steps = [], checks = [], given = [], notes = [];
  // A clean world of real chunks around the origin, flat ground of the requested block, stone below.
  game.applyWorldSettings?.({ gameMode, difficulty, cheats: false });
  game.difficulty = difficulty;
  game.mobs.clearMobs?.(); game.mobs.mobs.length = 0;
  game.inventory.clearAll?.();
  for (const d of game.entities.droppedItems || []) { if (game.entities.itemVisuals?.release) game.entities.itemVisuals.release(d.group); else d.group?.removeFromParent?.(); }
  game.entities.droppedItems.length = 0;
  game.world.generationMode = spawning ? 'normal' : 'authored';
  game.world.isFlatWorld = true;
  game.world.chunks.clear(); game.world.chunkCache?.fill(null);
  game.world.light?.clear?.();
  for (let cx = -radius - 2; cx <= radius + 1; cx++) for (let cz = -radius - 2; cz <= radius + 1; cz++) {
    const c = new Chunk(cx, cz); game.world.chunks.set(`${cx},${cz}`, c); game.world.light?.initChunk?.(cx, cz);
  }
  const lo = -radius * 16 - 32, hi = (radius + 2) * 16;
  for (let x = lo; x < hi; x++) for (let z = lo; z < hi; z++) {
    for (let y = 0; y <= groundY; y++) {
      const id = y === groundY ? ground : y >= groundY - dirtDepth ? BLOCKS.DIRT : y === 0 ? BLOCKS.BEDROCK : BLOCKS.STONE;
      game.world.setVoxel(x, y, z, id);
    }
  }
  game.world.water?.reset?.(); game.world.light?.relightAll?.();
  for (const c of game.world.chunks.values()) c.dirty = true;
  game.player.position.set(0.5, groundY + 1, 0.5); game.player.velocity.set(0, 0, 0); game.player.onGround = true;
  game.player.yaw = 0; game.player.pitch = 0;
  // This world's spawn: the game sets it when a world is created, and the harness made a new one.
  game.player.spawnPosition = game.player.position.clone(); game.player.bedSpawnPosition = null; game.player.commandSpawnPosition = null;
  game.player.deathDropsDone = false;
  game.player.health = game.player.maxHealth = 20; game.player.isDead = false;
  game.player.hunger = 20; game.player.saturation = 5; game.player.exhaustion = 0; game.player.ensureHungerState?.();
  if (game.player._hungerState) Object.assign(game.player._hungerState, { hunger: 20, saturation: 5, exhaustion: 0 });
  game.player.statusEffects?.clear?.(); game.player.activeEffects?.clear?.(); game.player.fireTicks = 0; game.player.fallDistance = 0;
  game.worldTime = time;
  game.ui.closeGeminiTerminal?.();
  game.lifecycle.phase = 'ready'; game.worldReady = true; game.worldGenerated = true;

  // Every hit the player takes, so a death in the middle of a tutorial can be explained.
  const damageLog = [], realTakeDamage = game.player.takeDamage;
  game.player.takeDamage = function (amount, sourcePos, type, attacker) {
    const before = this.health; const r = realTakeDamage.call(this, amount, sourcePos, type, attacker);
    if (this.health < before) { damageLog.push({ tick: ticks, amount: +(before - this.health).toFixed(2), type, by: attacker?.type ?? null, hp: +this.health.toFixed(1) }); console.log(`[playtest] hurt ${JSON.stringify(damageLog.at(-1))}`); }
    return r;
  };
  // The game loop, unchanged except that nothing is drawn and time advances by exactly `dt`.
  const realRaf = window.requestAnimationFrame, realDelta = game.clock.getDelta, realRender = game.shader.render, realHeld = game.heldItemRenderer?.render;
  window.requestAnimationFrame = () => 0;
  game.clock.getDelta = () => dt;
  game.shader.render = () => {};
  if (game.heldItemRenderer) game.heldItemRenderer.render = () => {};
  let ticks = 0, miningTicks = 0;
  // Ticks in which mining progressed (the break overlay advanced, or the block broke): how long mining actually took
  // in play, without the walking and aiming between blocks.
  function step() {
    ticks++; const before = game.miningTime || 0; game.animate();
    if ((game.miningTime || 0) > before || (before > 0 && !game.miningTime)) miningTicks++;
  }
  /** Hold attack on one block, aiming at it the way a player does, until it breaks. The game decides the time. */
  async function breakBlock(x, y, z, { maxTicks = 900 } = {}) {
    const id = game.world.getVoxel(x, y, z); let n = 0, aimedAt = null;
    for (; n < maxTicks && game.world.getVoxel(x, y, z) === id; n++) {
      // Aim at the middle of the nearest open face that looks toward the eyes, as a player does: the centre of a
      // block below and to the side lies behind the block above it from where the player stands.
      const eye = game.player.position.clone(); eye.y += game.player.eyeHeight || 1.62;
      let aim = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }, best = Infinity;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const c = { x: x + 0.5 + dx * 0.49, y: y + 0.5 + dy * 0.49, z: z + 0.5 + dz * 0.49 };
        if ((eye.x - c.x) * dx + (eye.y - c.y) * dy + (eye.z - c.z) * dz <= 0) continue; // faces away
        const open = game.world.getVoxel(x + dx, y + dy, z + dz);
        if (open !== BLOCKS.AIR && open !== BLOCKS.WATER) continue;
        const d = Math.hypot(eye.x - c.x, eye.y - c.y, eye.z - c.z);
        if (d < best) { best = d; aim = c; }
      }
      bot.lookAt(aim);
      game.isMouseDown = true; step();
      aimedAt = game.targetBlock ? [game.targetBlock.x, game.targetBlock.y, game.targetBlock.z] : null;
      if (n % 20 === 0) await Promise.resolve();
    }
    game.isMouseDown = false; step();
    const broken = game.world.getVoxel(x, y, z) !== id;
    console.log(`[playtest] ${broken ? 'ok ' : 'ERR'} break ${x} ${y} ${z} by hand (${(n * dt).toFixed(2)}s)${broken ? '' : ` aimed at ${JSON.stringify(aimedAt)} from ${game.player.position.toArray().map((v) => +v.toFixed(2))}, block ${id}`}`);
    return { broken, seconds: n * dt, aimedAt };
  }
  function release() {
    window.requestAnimationFrame = realRaf; game.clock.getDelta = realDelta; game.shader.render = realRender; game.player.takeDamage = realTakeDamage;
    if (game.heldItemRenderer && realHeld) game.heldItemRenderer.render = realHeld;
  }
  async function drive(promise, maxTicks = 4500) {
    let done = false, result, error;
    promise.then((r) => { done = true; result = r; }, (e) => { done = true; error = e; });
    for (let i = 0; i < maxTicks && !done; i++) { step(); if (i % 50 === 0) await Promise.resolve(); else await Promise.resolve(); }
    if (!done) { bot.stop('Play-test tick budget exceeded.'); await Promise.resolve(); return { ok: false, message: `did not finish in ${maxTicks} ticks` }; }
    if (error) return { ok: false, message: error.message };
    return result;
  }
  /** Run a bot command as a player would type it. Returns the bot's result; never throws. */
  async function run(command, { maxTicks, expectFail = false } = {}) {
    if (steps.length >= 400) throw new Error('scenario issued 400 bot commands; stopping a runaway loop');
    const started = ticks; let result;
    try { result = await drive(bot.run(command), maxTicks); } catch (e) { result = { ok: false, message: e.message }; }
    const entry = { command, ok: !!result?.ok, message: result?.message, ticks: ticks - started, at: game.player.position.toArray().map((v) => +v.toFixed(2)) };
    steps.push(entry);
    console.log(`[playtest] ${entry.ok ? "ok " : "ERR"} ${typeof command === "string" ? command : JSON.stringify(command)} (${(entry.ticks * dt).toFixed(1)}s) ${entry.ok ? "" : entry.message + ` [at ${entry.at.join(' ')}, hp ${(+game.player.health).toFixed(1)}${game.player.isDead ? ' DEAD: ' + (game.player.lastDamageCause ?? game.player.deathMessage ?? '') : ''}]`}`);
    if (!result?.ok && !expectFail) notes.push(`bot: ${typeof command === 'string' ? command : JSON.stringify(command)} -> ${result?.message}`);
    return result ?? { ok: false };
  }
  async function wait(seconds) { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { step(); if (i % 20 === 0) await Promise.resolve(); } }
  function check(name, ok, observed, expected, wiki = '', known = undefined) { console.log(`[check] ${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' observed=' + JSON.stringify(observed)}`); checks.push({ name, ok: !!ok, observed, expected, wiki, ...(known && !ok ? { known } : {}) }); return !!ok; }
  function give(id, count = 1, isBlock = typeof id === 'number') { game.inventory.addItem(id, isBlock, count); given.push(`${count} ${typeof id === 'number' ? `block ${id}` : id}`); }
  function set(x, y, z, id) { game.world.setVoxel(x, y, z, id); }
  function fill(x1, y1, z1, x2, y2, z2, id) { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (let z = Math.min(z1, z2); z <= Math.max(z1, z2); z++) set(x, y, z, id); }
  function count(id) { return bot.itemCount(id); }
  function inventory() { return [...game.inventory.hotbar, ...game.inventory.storage].filter(Boolean).map((s) => ({ id: s.id, isBlock: s.isBlock, count: s.count })); }
  function spawn(type, x, y, z, options) { return game.mobs.spawnMob(type, x, y, z, options); }
  return { game, bot, world: game.world, player: game.player, inventory: game.inventory, steps, checks, given, notes,
    step, run, wait, drive, breakBlock, check, give, set, fill, count, items: inventory, spawn, release, get ticks() { return ticks; }, get miningTicks() { return miningTicks; }, resetMining() { miningTicks = 0; }, dt };
}

/** Run the named scenarios (all when `ids` is empty) and return one report per scenario. */
export async function runScenarios(game, scenarios, ids = []) {
  const reports = [];
  for (const scenario of scenarios) {
    if (ids.length && !ids.some((id) => scenario.id === id || scenario.id.startsWith(id))) continue;
    const t = createPlaytest(game, scenario.world || {});
    const started = performance.now();
    let error = null;
    // A watchdog: a scenario awaiting something the stepped game never delivers fails instead of hanging the run.
    const limitMs = scenario.limitMs ?? 240000;
    let watchdog;
    const timeout = new Promise((_, reject) => { watchdog = setTimeout(() => reject(new Error(`scenario exceeded ${limitMs / 1000} s of wall time (a wait on something that never came?)`)), limitMs); });
    try { await Promise.race([scenario.run(t), timeout]); } catch (e) { error = `${e.message}\n${String(e.stack || '').split('\n').slice(1, 4).join('\n')}`; }
    clearTimeout(watchdog);
    t.release();
    try { game.playerBot.stop('scenario finished'); } catch {}
    reports.push({ id: scenario.id, tutorial: scenario.tutorial, wiki: scenario.wiki, error, ms: Math.round(performance.now() - started),
      simulatedSeconds: +(t.ticks * t.dt).toFixed(1), passed: t.checks.filter((c) => c.ok).length, failed: t.checks.filter((c) => !c.ok).length,
      checks: t.checks, given: t.given, notes: t.notes, steps: t.steps });
  }
  return reports;
}
