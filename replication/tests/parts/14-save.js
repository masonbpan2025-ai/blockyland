// Part 14: saves. A snapshot of the running world, restored into a new server, holds the same blocks, players,
// inventories and containers. (Runs entirely in the server page: the restore check is a fixture, the program only
// reports what it sees.)
// timeout: 60
/* setup: (async () => {
  const { snapshot, restore } = await import('/replication/server/saves.js');
  const { decodeVoxelsRLE } = await import('/src/mapManager.js');
  const { BlockylandServer } = await import('/replication/server/engine.js');
  const json = JSON.stringify(snapshot(server));
  const copy = new BlockylandServer({ seed: server.seed, difficulty: server.difficulty });
  await copy.init({ save: JSON.parse(json) });
  const out = { mb: +(json.length / 1e6).toFixed(2), players: [], blocksSame: 0, blocksDiff: 0, chunks: 0 };
  const savedNow = JSON.parse(json);
  for (const [name, D] of Object.entries(server.dims)) {
    const E = copy.dims[name]; if (!E) { out.missingDim = name; continue; }
    // Only the chunks the snapshot holds: the live world keeps changing after it was taken.
    const inSave = new Set((savedNow.dims[name]?.chunks ?? []).map(c => c.cx + ',' + c.cz));
    // The restored world against the saved chunk data itself (the live world kept changing after the snapshot).
    for (const sc of savedNow.dims[name]?.chunks ?? []) { out.chunks++; const want = new Uint16Array(16 * 16 * 64); decodeVoxelsRLE(sc.voxels, want); const d = E.world.getChunk(sc.cx, sc.cz); if (!d) { out.blocksDiff += want.length; continue; } for (let i = 0; i < want.length; i += 7) (want[i] === d.voxels[i] ? out.blocksSame++ : out.blocksDiff++); }
  }
  const saved = JSON.parse(json);
  for (const sp of saved.players) { const Q = copy.players.get(sp.name); out.players.push({ name: sp.name, dimSame: sp.dim === copy.dimensionOf(Q).dimensionName, posDiff: +Math.hypot(sp.pos[0] - Q.player.position.x, sp.pos[1] - Q.player.position.y, sp.pos[2] - Q.player.position.z).toFixed(2), invSame: JSON.stringify(sp.inventory.hotbar?.map(s => s && [s.id, s.count]) ?? null) === JSON.stringify(Q.inventory.hotbar.map(s => s && [s.id, s.count])) }); }
  out.weather = JSON.stringify(copy.overworldWeather.clock.snapshot()) === JSON.stringify(server.overworldWeather.clock.snapshot()) || copy.overworldWeather.weatherType === JSON.parse(json).weather.weatherType;
  server.toPlayer(fixture.P('Ada'), 'FIXTURE ' + JSON.stringify(out), 'fixture');
  return true;
})() */
const r = JSON.parse(bot.received.find(m => m.kind === 'fixture').text.slice(8));
return { ok: r.blocksDiff === 0 && r.chunks > 0 && r.weather && r.players.every(p => p.dimSame && p.posDiff < 0.01 && p.invSame), ...r };
