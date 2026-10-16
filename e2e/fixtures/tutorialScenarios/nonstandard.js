// Non-standard survival tutorials (special worlds and rule sets), played in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, setHunger } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'nonstandard.rules',
    tutorial: 'Hardcore mode; Ultra hardcore survival; Half hearted hardcore; Gathering resources on Peaceful difficulty; Speedrun; Adventure survival',
    wiki: W('Hardcore mode'),
    async run(t) {
      const { game, player } = t;
      // Hardcore: "if you die, you cannot respawn. Instead, the game will switch you to spectator mode".
      game.applyWorldSettings({ gameMode: 'survival', difficulty: 'easy', hardcore: true });
      const locked = game.settings.difficulty;
      player.position.set(3.5, 5, 3.5); player.takeDamage(40, null, 'generic'); await t.wait(1);
      const dead = player.isDead;
      player.respawn(); await t.wait(0.5);
      t.check('Hardcore is locked to Hard; dying leaves the player a spectator where they fell', locked === 'hard' && dead && player.gamemode === 'spectator' && Math.abs(player.position.x - 3.5) < 1,
        { difficulty: locked, died: dead, gamemode: player.gamemode, x: +player.position.x.toFixed(1) }, { difficulty: 'hard', gamemode: 'spectator' });
      game.applyWorldSettings({ gameMode: 'survival', difficulty: 'normal', hardcore: false }); player.setGameMode('survival');
      if (player.isDead) player.respawn();
      player.isDead = false; player.health = 20; player.position.set(0.5, 5, 0.5); await t.wait(0.5);
      // Ultra hardcore: "the player cannot naturally regenerate health"; golden apples still heal.
      game.gamerules = { ...(game.gamerules ?? {}), naturalRegeneration: false };
      game.commandState && (game.commandState.gamerules = { ...(game.commandState.gamerules ?? {}), naturalRegeneration: false });
      player.health = 10; setHunger(player, 20, 5); await t.wait(8);
      const noRegen = player.health;
      t.give('golden_apple', 1); await t.run('eat golden apple'); await t.wait(5);
      t.check('with natural regeneration off, a fed player stays hurt; a golden apple still heals', noRegen === 10 && player.health > 10, { after8s: noRegen, afterGoldenApple: player.health }, { after8s: 10, afterGoldenApple: '> 10' });
      game.gamerules = { ...(game.gamerules ?? {}), naturalRegeneration: true };
      game.commandState && (game.commandState.gamerules = { ...(game.commandState.gamerules ?? {}), naturalRegeneration: true });
    },
  },
  {
    id: 'nonstandard.worlds',
    tutorial: 'Accessing the void; Thunderstorm survival; Mushroom fields survival; Nether survival; Starting in the Nether; Desert survival; Snowy biome survival; Superflat survival; Flat survival; Skyblock; Island survival',
    wiki: W('Accessing the void'),
    async run(t) {
      const { game, player } = t;
      // The void: 4 damage every half second once 64 blocks below the world, and nothing pulls the player back.
      player.health = 20; player.position.set(0.5, -66, 0.5); player.velocity.set(0, 0, 0);
      const hp = []; for (let i = 0; i < 4; i++) { await t.wait(0.5); hp.push(+player.health.toFixed(1)); }
      t.check('the void takes 4 health every half second and does not rescue the player', hp[3] <= 20 - 12 && player.position.y < -64, { health: hp, y: Math.round(player.position.y) }, 'about 4 per 0.5 s, still in the void');
      player.fallDistance = 0; player.velocity.set(0, 0, 0); player.position.set(0.5, 5, 0.5);
      if (player.isDead || player.health <= 0) player.respawn();
      player.fallDistance = 0; player.isDead = false; player.health = 20; player.position.set(0.5, 5, 0.5); player.velocity.set(0, 0, 0); await t.wait(1);
      // Thunderstorm survival: lightning "only deals 5 HP damage, but it will set you on fire".
      const { applyLightningStrike } = await import('/src/weatherGameplay.js');
      player.health = 20; player.invulnerableTimer = 0; applyLightningStrike(game, { x: player.position.x, y: player.position.y, z: player.position.z });
      const struck = 20 - player.health, burning = (player.fireTicks ?? player.fireSeconds ?? player.burnTime ?? 0) > 0 || player.isOnFire === true || player.onFire === true;
      t.check("lightning deals 5 and sets the player on fire", struck === 5 && burning, { damage: struck, burning }, { damage: 5, burning: true });
      player.fireTicks = 0; player.health = 20;
      // Thunderstorms "darken the world enough to allow monster spawning during the day".
      const { monsterIsDarkEnoughToSpawn } = await import('/src/spawning/mobSpawnPredicates.js');
      const rnd = { nextInt: (n) => Math.floor(Math.random() * n) };
      const rate = (thunder) => { let n = 0; for (let i = 0; i < 4000; i++) if (monsterIsDarkEnoughToSpawn({ skyLight: 15, blockLight: 0, skyDarken: 0, thunder, dimension: 'overworld', random: rnd })) n++; return n / 4000; };
      const clear = rate(false), storm = rate(true);
      t.check('in a thunderstorm open ground at noon is dark enough for monsters; in clear weather it is not', clear === 0 && storm > 0.1, { clear, thunder: +storm.toFixed(3) }, { clear: 0, thunder: '> 0' });
      // Mushroom fields: "only mooshrooms spawn in the mushroom fields" (no hostile mobs).
      const { biomeSpawnsFor } = await import('/src/spawning/biomeSpawnResolver.js');
      const monsters = biomeSpawnsFor('mushroom_fields', 'monster');
      t.check('nothing hostile spawns naturally in mushroom fields', Array.isArray(monsters) && monsters.length === 0, monsters?.map?.((m) => m.type ?? m.mob ?? m), []);
      // Nether survival: "any crying obsidian must be removed from the frame, as that is not a valid frame block".
      const { lightPortal } = await import('/src/netherPortal.js');
      const frame = (x0, z, corner) => { for (const [x, y] of [[x0 + 1, 5], [x0 + 2, 5], [x0, 6], [x0, 7], [x0, 8], [x0 + 3, 6], [x0 + 3, 7], [x0 + 3, 8], [x0 + 1, 9], [x0 + 2, 9]]) t.set(x, y, z, BLOCKS.OBSIDIAN); if (corner) t.set(x0, 7, z, BLOCKS.CRYING_OBSIDIAN); };
      frame(10, 10, false); frame(20, 10, true);
      const good = lightPortal(t.world, 11, 6, 10).success, bad = lightPortal(t.world, 21, 6, 10).success;
      t.check('a frame with crying obsidian in it does not light', good && !bad, { obsidian: good, withCryingObsidian: bad }, { obsidian: true, withCryingObsidian: false });
      t.notes.push('Desert, snowy, superflat, flat, skyblock and island survival are the newcomer tutorials played in a different landscape; the world border (30,000,000 blocks) is outside this game\'s worlds.');
    },
  },
];
