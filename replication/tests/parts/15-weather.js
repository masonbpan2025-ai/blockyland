// Part 15: weather on the server. A thunderstorm at noon (fixture: /weather thunder 120): the bot sees rain and
// thunder (Mineflayer's isRaining, rainState, thunderState); monsters spawn in daylight, because "in a thunderstorm the
// sky light level is reduced by 10 for the purposes of hostile mob spawning" (wiki, Thunderstorm); natural lightning
// strikes (1/100000 per loaded chunk per tick); and when the storm's timer runs out the rain stops and the bot hears
// the 'rain' event.
// timeout: 170
/* setup: (() => {
  fixture.site('Ada'); fixture.time(6000);
  server.overworldWeather.setWeather('thunder', 120);
  // tell the test about each bolt (the agents get no such message: they see and hear nothing of it but its effects)
  const W = server.overworldWeather, trigger = W.triggerLightning;
  W.triggerLightning = (...a) => { const r = trigger(...a); if (r && a[2]) server.toPlayer(fixture.P('Ada'), 'FIXTURE lightning ' + a[2].x.toFixed(0) + ',' + a[2].z.toFixed(0), 'fixture'); return r; };
  return true;
})() */
await bot.waitForTicks(4);
const start = { isRaining: bot.isRaining, rainState: bot.rainState, thunderState: bot.thunderState, timeOfDay: bot.time.timeOfDay };
let rainEvents = 0; bot.on('rain', () => { rainEvents++; });
const hostiles = new Set(); let hostileAtDay = 0;
const t0 = Date.now();
while (Date.now() - t0 < 140000 && bot.isRaining) {
  for (const e of Object.values(bot.entities)) if (e.type === 'hostile' && !hostiles.has(e.id)) { hostiles.add(e.id); if (bot.time.timeOfDay < 12000) hostileAtDay++; }
  await bot.waitForTicks(20);
}
const bolts = bot.received.filter(m => m.kind === 'fixture' && /lightning/.test(m.text)).length;
const stoppedAfter = +((Date.now() - t0) / 1000).toFixed(0);
return {
  ok: start.isRaining && start.thunderState === 1 && hostileAtDay > 0 && bolts >= 1 && !bot.isRaining && rainEvents >= 1 && stoppedAfter >= 100 && stoppedAfter <= 135,
  start, hostileAtDay, bolts, rainStoppedAfterSeconds: stoppedAfter, rainEvents, endTimeOfDay: bot.time.timeOfDay,
};
