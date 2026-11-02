// 1500 Players · the new ending, "The Invasion" (see INVASION_STORY.md): the Grumbler aliens invade on day 15, the
// three islands fight them together, Gohan and Videl save each other, and the film ends with their wedding. Acts I–II
// keep their key frames (civFrames.js); this set adds the alien cast and the new Act III beats.
import * as T from 'three';
import { nameTag, bigName, caption, subtitle, banner, broadcast, fontsReady } from './civOverlay.js';
import { cube } from './civCast.js';
import { SITES } from './civWorld.js';
import { crowd, gather } from './civCrowd.js';
import { aura, energyBall, nimbus, snowfall, fairyLights, thrusterTrain, sparkles, glowMat } from './civFx.js';
import { arch, weddingCake, fireworks } from './wedProps.js';
import { LOOKS, cam, islandScene, yawTo, mapTable, hoverPod, FRAMES as CIV } from './civFrames.js';
import { actor, lens, mix, CROSS, tags, big, inHand, castSheet, headTop, ground } from './weddingFrames.js';
import { saucer, saucerSwarm, mothership, tractorBeam, gooRay, gooJelly, wreck } from './invasionProps.js';

Object.assign(LOOKS, {
  // "Not grass green. Alien green."
  invasion: { top: 0x123a26, horizon: 0x9fe07a, glow: 0xd8ff9a, sunColor: 0xeaffd0, sunI: 2.1, hemiSky: 0xb0e8a0, hemiGround: 0x2f3a2a, hemiI: 1.15, fog: 0x7aa872 },
  sunset: { top: 0x34407a, horizon: 0xff9a5c, glow: 0xffc070, sunColor: 0xffb070, sunI: 2.2, hemiSky: 0xb090c0, hemiGround: 0x4a3a40, hemiI: 1.0, fog: 0xd89070 },
  dusk: { top: 0x2c3a6e, horizon: 0xf2a066, glow: 0xffb070, sunColor: 0xffb080, sunI: 1.3, hemiSky: 0x7080b0, hemiGround: 0x3a3040, hemiI: .9, fog: 0x8a7090 },
});

const P = SITES.plateau; // the Central Plateau: the last stand, the battle and the wedding
const ALLIES = ['gi', 'saiyan', 'purpleGi', 'pocoyo', 'elly', 'pato', 'gabby', 'panda', 'cat', 'cakey', 'buu', 'bulma', 'soldier'];
/** Pato's armour at last ("It goes with my beak."): a silver chest plate and gold shoulders. */
const armour = c => { cube(c.torso, [.5, .34, .4], [0, .2, 0], { all: '#d8dde6' }); for (const s of [-1, 1]) cube(c.torso, [.16, .08, .3], [s * .26, .38, 0], { all: '#e8c04a' }); };
/** A goo blaster in a Grumbler's hand. */
const blaster = (c, side = 'R') => { const g = inHand(c, side, [.1, .1, .3], '#5a5f6e', [0, -.42, -.12]); cube(g, [.06, .06, .12], [0, 0, -.2], { all: '#7dff6a' }); return g; };
/** Krillin's Destructo Disc: a thin spinning disc of yellow light. */
const disc = (scene, p, r = .9) => { const g = new T.Group(); g.position.set(...p); scene.add(g); const m = new T.Mesh(new T.CylinderGeometry(r, r, .04, 40), glowMat(0xffe66a, .9)); g.add(m); const h = new T.Mesh(new T.CylinderGeometry(r * 1.3, r * 1.3, .02, 40), glowMat(0xfff4b0, .35)); g.add(h); return g; };

export const FRAMES = {
  'cast-aliens': castSheet(['alien', 'alien', 'alien_boss', 'alien_kid', 'alien'], 'Cast · The Grumblers: Commander Grumbleflux, his army, and Zib', { spacing: 1.35, fov: 34, camY: 1.3 }),
  'cast-wedding': castSheet(['gohan', 'videl_bride', 'elly', 'pocoyo', 'alien_kid'], 'Cast · The wedding: Gohan and Videl, Elly officiates, Pocoyo and Zib carry the rings', { spacing: 1.3, grooms: ['gohan'], fov: 34, camY: 1.2 }),
  // Acts I–II are unchanged
  ...Object.fromEntries(Object.entries(CIV).filter(([id]) => /^(0\d|1[0-5])-/.test(id) || id.startsWith('cast-'))),

  '16-invasion': {
    title: 'DAY 15 · The sky turns alien green: 500 saucers, 3,000 Grumblers', time: '7:10',
    async build() {
      await fontsReady; const { scene } = await islandScene('invasion', { sun: [.2, .5, -.8], focus: [0, 12, -10], area: 200, fogNear: 300, fogFar: 1400 });
      saucerSwarm(scene, [0, 75, -10], [170, 28, 150], 520, { rMin: 2.5, rMax: 5.5, seed: 11 });
      mothership(scene, [-10, 150, -120], 46);
      const camera = cam(46, [190, 170, 210], [0, 40, -40]);
      return { scene, camera, bloom: [.5, .6, .75], grade: 'saturate(1.12) contrast(1.06)', overlay: ctx => { banner(ctx, 'INVASION', 'DAY 15 · 500 SAUCERS · 3,000 GRUMBLERS', { color: '#5fd04a' }); subtitle(ctx, '第十五天，天空变成了绿色。不是草地的绿，是外星人的绿。', 'Day 15. The sky turned green. Not grass green. Alien green.'); } };
    },
  },

  '17-backfire': {
    title: "Twist · Frieza invited them. The Grumblers take Frieza's palace first", time: '7:30',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('invasion', { sun: [-.3, .6, .6], focus: [px, 30, pz + 10], area: 40, fogNear: 40, fogFar: 400 });
      const g = W.groundAt(px, pz), F = [px - 12, pz + 34], gF = ground(W, ...F), C = [px - 15.5, pz + 41];
      const ms = mothership(scene, [px, g + 75, pz - 6], 30, { shield: false });
      tractorBeam(scene, [px, g + 72, pz - 6], [px, g + 2, pz - 2], { radius: 16 });
      const ice = new T.MeshLambertMaterial({ color: 0x9fd6ff, emissive: 0x1a3550 });
      for (let i = 0; i < 70; i++) { const s = .6 + Math.abs(Math.sin(i * 7.1)) * 1.8, m = new T.Mesh(new T.BoxGeometry(s, s, s), ice); m.position.set(px + Math.sin(i * 2.3) * 11, g + 18 + Math.abs(Math.sin(i * 1.7)) * 40, pz - 4 + Math.cos(i * 3.1) * 8); m.rotation.set(i, i * .7, 0); scene.add(m); }
      hoverPod(scene, [F[0], gF, F[1]], yawTo(F, C));
      const fri = actor(scene, W, 'frieza', ...F, { y: gF + .25, face: mix([px, pz], C, .55), armR: [-2.9, .3], armL: [-2.9, -.3], headPitch: -.35 });
      const S = [F[0] + 3.2, F[1] - 1.2], sy = gF + 3.1; saucer(scene, [S[0], sy, S[1]], 1.3, { tilt: [.05, -.1] });
      const boss = actor(scene, W, 'alien_boss', ...S, { y: sy + .15, face: mix(F, C, .55), armR: [-1.6, .25], armL: [-.4, -.3] });
      const camera = cam(50, [C[0], gF + 1.8, C[1]], [F[0] + 2.4, gF + 4.6, F[1] - 8]);
      snowfall(scene, camera, { n: 2500, depth: 40, spread: 40, size: .12 });
      return { scene, camera, bloom: [.45, .55, .8], overlay: (ctx, { project }) => { tags(ctx, project, [[fri], [boss]], 17); broadcast(ctx, 'WORLD BROADCAST'); subtitle(ctx, '格兰博指挥官：谢谢你的邀请，弗利萨。我们就先从你的宫殿开始。　弗利萨：这可不是我们说好的！', "COMMANDER: Thank you for the invitation, Frieza. We'll start with your palace.   FRIEZA: That was NOT the deal!"); } };
    },
  },

  '18-war-council': {
    title: 'All three islands, one plan · "Break the shield and the whole fleet goes home"', time: '8:00',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [.3, .6, .75], focus: [P[0], 30, P[1]], area: 18 });
      const m = [P[0], P[1] + 2], g = ground(W, ...m), C = [m[0] + .4, m[1] + 6.4];
      mapTable(scene, [m[0], g, m[1]], 0);
      const around = (id, dx, dz, q = {}) => actor(scene, W, id, m[0] + dx, m[1] + dz, { face: mix([m[0], m[1]], C, q.k ?? .35), ...q });
      const bul = around('bulma', -.4, -1.3, { armR: [-1.4, .1], k: .5 });
      const goku = around('goku', -1.9, -.9, { armR: [-.6, .3] }), veg = around('vegeta', 1.7, -1, { ...CROSS });
      const goh = around('gohan', -2.2, .5, { k: .6 }), vid = around('videl', -1.6, 1.1, { k: .6, armL: [-.4, -.3] });
      const gab = around('gabby', 2.2, .5, { armR: [-2.4, .3], k: .6 });
      const pato = around('pato', 1.4, 1.3, { k: .8, armR: [-2.9, .2] }); armour(pato);
      const fri = around('frieza', 3.2, -1.6, { k: .25, headPitch: .2 });
      const poc = actor(scene, W, 'pocoyo', m[0] + .6, m[1] - .2, { y: g + .98, face: C, sit: true, seat: g + 1.0 });
      saucerSwarm(scene, [m[0], g + 40, m[1] - 70], [60, 12, 20], 60, { seed: 4 });
      mothership(scene, [m[0] - 20, g + 90, m[1] - 140], 30);
      const camera = lens(40, [C[0], C[1] + 2], 2.8, [m[0], m[1] - .4], 1.1, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[bul], [goku], [veg], [goh], [vid], [gab], [pato, 'Pato (in armour)'], [fri, 'Frieza (sheepish)'], [poc]], 14); subtitle(ctx, '布尔玛：他们的飞碟都靠一个大护盾。打破护盾，整个舰队就得回家。', 'BULMA: Their saucers all run on one big shield. Break the shield, and the whole fleet goes home.'); } };
    },
  },

  '19-battle': {
    title: 'The battle of the Central Plateau · three islands against three thousand Grumblers', time: '8:30',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [-.5, .55, .6], focus: [P[0], 20, P[1] - 10], area: 40, fogNear: 60, fogFar: 500 });
      const g = ground(W, ...P), front = P[1] - 11;
      const heroes = gather(260, { center: [P[0], P[1] - 4], radius: 10, groundAt: W.groundAt, face: [P[0], P[1] - 40], seed: 31, mix: ALLIES }).filter(p => p.z > front + .8);
      heroes.forEach((p, i) => { if (i % 4 === 0) p.armUp = 1; });
      scene.add(crowd(heroes, { seed: 31 }));
      const aliens = gather(520, { center: [P[0], P[1] - 26], radius: 16, groundAt: W.groundAt, face: [P[0], P[1]], seed: 32, costume: 'alien' }).filter(p => p.z < front - .8 && Math.hypot(p.x - P[0] - 4, p.z - front + 8) > 2.5);
      scene.add(crowd(aliens, { seed: 32, angry: true }));
      scene.add(crowd(gather(40, { center: [P[0] + 1, front - 3.4], radius: 4.5, groundAt: W.groundAt, face: [P[0], P[1]], seed: 33, costume: 'alien' }).filter(p => Math.hypot(p.x - P[0] - 4, p.z - front + 8) > 3.2), { seed: 33, angry: true }));
      for (let i = 0; i < 22; i++) { const x = P[0] - 11 + i, z = front + 1.6; cube(scene, [1, 1.3, .5], [x, W.groundAt(x, z) + .65, z], { all: i % 2 ? '#f27fb7' : '#e05aa0' }); }
      const goku = actor(scene, W, 'goku_ssj', P[0] + 2, front + .4, { face: [P[0] + 6, P[1] - 30], armR: [-1.6, .3], armL: [-1.6, -.3] }); aura(scene, [P[0] + 2, ground(W, P[0] + 2, front + .4), front + .4], { color: 0xffe066 });
      const veg = actor(scene, W, 'vegeta', P[0] + 4.4, front + .2, { face: [P[0] + 9, P[1] - 30], armR: [-1.6, .2] });
      const fri = actor(scene, W, 'frieza', P[0] - 1.8, front + 1.2, { face: [P[0] - 2, P[1] - 30], armR: [-1.7, .1] });
      for (const [x, z, h, tilt] of [[-6, -22, 13, .1], [3, -26, 16, -.15], [9, -18, 11, .2], [-12, -30, 18, 0], [14, -32, 20, .1]]) { const s = [P[0] + x, g + h, P[1] + z]; saucer(scene, s, 2.4, { tilt: [tilt, 0] }); const hit = [s[0] + (x > 0 ? -2 : 2), ground(W, s[0], P[1] - 6) + .5, P[1] - 6 + x * .1]; gooRay(scene, [s[0], s[1] - .5, s[2]], hit); }
      for (const [x, z] of [[-4, -8], [1, -6.5], [6, -7.5]]) { const y = ground(W, P[0] + x, P[1] + z); gooJelly(scene, [P[0] + x, y, P[1] + z]); scene.add(crowd([{ x: P[0] + x, y, z: P[1] + z, yaw: Math.PI, costume: 'pocoyo' }])); }
      saucerSwarm(scene, [P[0], g + 45, P[1] - 60], [80, 14, 30], 140, { seed: 7 });
      mothership(scene, [P[0] - 30, g + 95, P[1] - 150], 40);
      const camera = cam(56, [P[0] + 4, g + 3.2, front - 8], [P[0] + 1, g + 3.4, front + 4]);
      return { scene, camera, bloom: [.55, .55, .75], overlay: (ctx, { project }) => { bigName(ctx, project(headTop(goku).map((v, i) => i === 1 ? v + 1 : v)), 'Goku', 30); tags(ctx, project, [[veg], [fri]], 16); banner(ctx, 'THE BATTLE OF THE CENTRAL PLATEAU', '1,500 players · 3,000 Grumblers · goo rays only stick, they never hurt', { color: '#5fd04a' }); } };
    },
  },

  '20-everyone-fights': {
    title: 'Everyone fights · Krillin\'s Destructo Disc, Buu\'s candy, Pato in armour, Vegeta\'s train', time: '8:55',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [.4, .55, .7], focus: [P[0], 20, P[1]], area: 24 });
      const m = [P[0] + 3, P[1] - 6], g = ground(W, ...m), C = [m[0] + .6, m[1] + 7.2];
      const kri = actor(scene, W, 'krillin', m[0] - 1.6, m[1] + 2.4, { face: [m[0] - 4, m[1] - 10], armR: [-2.9, .2], lean: .1 });
      disc(scene, [m[0] - 3.4, g + 3.6, m[1] - 4.8], 1);
      const half = (x, z, y, tilt) => { const s = saucer(scene, [x, y, z], 2.2, { tilt }); s.scale.z *= .5; return s; };
      half(m[0] - 4.6, m[1] - 8.6, g + 7.4, [.5, .3]); half(m[0] - 2.6, m[1] - 9.2, g + 6.2, [-.4, -.5]);
      const buu = actor(scene, W, 'buu', m[0] + 1.2, m[1] - .6, { face: mix([m[0] + 4, m[1] - 10], C, .3), armL: [-2.6, -.5], armR: [-2.6, .5] });
      const sc = [m[0] + 6, g + 9, m[1] - 10]; saucer(scene, sc, 2.2, { tilt: [.2, 0] }); gooRay(scene, [sc[0], sc[1] - .5, sc[2]], [m[0] + 1.6, g + 3.2, m[1] - 1.6]);
      for (let i = 0; i < 70; i++) { const c = new T.Mesh(new T.BoxGeometry(.14, .14, .14), new T.MeshLambertMaterial({ color: [0xff6fa8, 0xffe14a, 0x7fd0ff, 0xb98bff, 0x7dff6a][i % 5], emissive: 0x222222 })); c.position.set(m[0] + 1.4 + Math.sin(i * 1.3) * 1.6, g + 2.4 + Math.abs(Math.sin(i * 2.1)) * 2.4, m[1] - 1.2 + Math.cos(i * 1.7) * 1.2); c.rotation.set(i, i * 2, 0); scene.add(c); }
      const pato = actor(scene, W, 'pato', m[0] - .2, m[1] + 2, { face: C, armR: [-2.9, .1] }); armour(pato);
      thrusterTrain(scene, [m[0] + 9, g + 6, m[1] - 3], -Math.PI / 2.4, 3);
      const veg = actor(scene, W, 'vegeta', m[0] + 9, m[1] - 3, { y: g + 7.4, face: mix([m[0] + 2, m[1] - 10], C, .4), armR: [-1.6, .2] });
      saucer(scene, [m[0] + 3.4, g + 7, m[1] - 4.4], 1.8, { tilt: [.9, .6] });
      const cats = gather(14, { center: [m[0] - 6, m[1] - 4], radius: 2.4, groundAt: W.groundAt, face: [m[0] - 5, m[1] - 10], seed: 61, mix: ['cat', 'panda', 'cakey'] }); cats.forEach(p => { p.armUp = 1; }); scene.add(crowd(cats));
      const camera = lens(52, C, 1.6, [m[0], m[1] - 2.6], 2.4, g);
      return { scene, camera, bloom: [.55, .55, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[kri], [buu], [pato, 'Pato (finally in armour)'], [veg]], 15); subtitle(ctx, '克林：气圆斩！　布欧：布欧把光线变成糖果！　旁白：每个人都在帮忙。连猫咪们也是。', 'KRILLIN: Destructo Disc!   BUU: Buu turn ray into candy!   NARRATOR: Everyone helped. Even the cats.'); } };
    },
  },

  '21-tractor-beam': {
    title: 'A tractor beam catches Videl · Gohan flies up: "I\'ve got you!" "Don\'t let go!"', time: '9:20',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [-.4, .5, .75], focus: [P[0], 25, P[1]], area: 24 });
      const m = [P[0] - 4, P[1] - 4], g = ground(W, ...m), C = [m[0] + 1.2, m[1] + 7.6];
      saucer(scene, [m[0], g + 15, m[1] - 1], 3); tractorBeam(scene, [m[0], g + 14.4, m[1] - 1], [m[0], g, m[1] - 1], { radius: 2.4, soft: true });
      const vid = actor(scene, W, 'videl', m[0], m[1] - 1, { y: g + 4.6, face: mix([m[0] + 1, m[1] + 4], C, .6), fly: true, flyLean: -.2, armR: [-2.6, .6], armL: [-.6, -.9], legL: .3, legR: -.2 });
      const goh = actor(scene, W, 'gohan', m[0] + 1.3, m[1] - .2, { y: g + 2.6, face: mix([m[0], m[1] - 1], C, .55), fly: true, flyLean: -.4, armL: [-2.9, -.3], armR: [-.5, .5], headPitch: -.4 });
            const crowdBelow = gather(60, { center: [m[0], m[1] - 4], radius: 6, inner: 2, groundAt: W.groundAt, face: [m[0], m[1] - 1], seed: 71, mix: ALLIES }).filter(p => p.z < m[1] - 1.5); crowdBelow.forEach(p => { p.armUp = 2; }); scene.add(crowd(crowdBelow));
      const camera = lens(44, [m[0] + 1.6, m[1] + 6], 2.8, [m[0] + .6, m[1] - .6], 3.8, g);
      return { scene, camera, bloom: [.3, .5, .85], overlay: (ctx, { project }) => { tags(ctx, project, [[vid], [goh]], 17); subtitle(ctx, '悟饭：抓紧！我抓住你了！　维黛尔：别放手！　悟饭：永远不会。', "GOHAN: Hold on! I've got you!   VIDEL: Don't let go!   GOHAN: Never."); } };
    },
  },

  '22-nimbus-catch': {
    title: 'The Commander blasts Gohan out of the sky · Videl catches him on the Flying Nimbus', time: '9:40',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [.3, .45, .85], focus: [P[0], 30, P[1]], area: 24 });
      const m = [P[0] + 6, P[1] + 4], g = ground(W, ...m), y = g + 9, C = [m[0] + 1.6, m[1] + 6];
      nimbus(scene, [m[0], y, m[1]], 1.4).rotation.y = Math.PI / 2;
      const vid = actor(scene, W, 'videl', m[0] - .3, m[1], { y: y + .3, face: mix([m[0] + 1, m[1]], C, .55), armL: [-1.6, -.2], armR: [-1.6, .2], lean: .2 });
      const goh = actor(scene, W, 'gohan_scarred', m[0] + .1, m[1] - .45, { y: y + 1.05, yaw: -Math.PI / 2, lie: true, armR: [-2.6, .4], armL: [-.4, -.6] });
      const B = [m[0] - 10, g + 26, m[1] - 18]; actor(scene, W, 'alien_boss', B[0], B[2], { y: B[1], face: [m[0], m[1]], armR: [-1.6, .2] }); saucer(scene, [B[0], B[1] - .3, B[2]], 1.6);
      saucerSwarm(scene, [m[0], g + 30, m[1] - 40], [40, 10, 15], 50, { seed: 9 });
      const camera = cam(42, [m[0] - .6, y + 2.6, m[1] + 4.6], [m[0], y + 1.1, m[1] - .2]);
      return { scene, camera, bloom: [.45, .55, .8], overlay: (ctx, { project }) => { tags(ctx, project, [[vid], [goh, 'Gohan']], 17); subtitle(ctx, '旁白：筋斗云只载心地善良的人。　维黛尔：你接住了我。现在我接住了你。', 'NARRATOR: The Flying Nimbus only carries people with a good heart.   VIDEL: You caught me. Now I caught you.'); } };
    },
  },

  '23-back-to-back': {
    title: 'Surrounded · "Back to back?" "Always."', time: '10:00',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [-.3, .5, .8], focus: [P[0], 20, P[1]], area: 24 });
      const m = [P[0] - 2, P[1] - 2], g = ground(W, ...m), C = [m[0] + .4, m[1] + 5.4];
      const goh = actor(scene, W, 'gohan_scarred', m[0] - .35, m[1], { face: mix([m[0] - 4, m[1] + 1], C, .5), armL: [-1.6, -.3], armR: [-1.2, .5] }); 
      const vid = actor(scene, W, 'videl', m[0] + .35, m[1] + .05, { face: mix([m[0] + 4, m[1] + 1], C, .5), armR: [-1.6, .3], armL: [-1.1, -.5] });
      const ring = []; for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * .11), r = 3 + (i % 2) * .7, x = m[0] + Math.cos(a) * r, z = m[1] + Math.sin(a) * r * .8; ring.push(actor(scene, W, i === 7 ? 'alien_boss' : 'alien', x, z, { face: m, armR: [-1.5, .2] })); }
      ring.forEach((c, i) => { if (i !== 7) blaster(c); });
      scene.add(crowd(gather(160, { center: m, radius: 12, inner: 5, groundAt: W.groundAt, face: m, seed: 81, costume: 'alien' }).filter(p => p.z < m[1] + 2), { angry: true }));
      gooRay(scene, [m[0] - 3.4, g + .8, m[1] - 2.2], [m[0] - 1.6, g + .3, m[1] - .2]); gooRay(scene, [m[0] + 3.6, g + .8, m[1] - 2], [m[0] + 1.8, g + .3, m[1] - .4]);
      const camera = lens(44, C, 1.5, [m[0], m[1] - .6], 1.2, g);
      return { scene, camera, bloom: [.5, .55, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[goh, 'Gohan'], [vid], [ring[7]]], 16); subtitle(ctx, '悟饭：背靠背？　维黛尔：一直都是。　旁白：悟饭守着维黛尔的背后，维黛尔守着悟饭的。搭档就是这样。', "GOHAN: Back to back?   VIDEL: Always.   NARRATOR: Gohan watched Videl's back. Videl watched Gohan's. That's what partners do."); } };
    },
  },

  '24-shield-break': {
    title: 'The finale · Gohan and Videl crack the shield together; the Spirit Bomb is ready', time: '10:20',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('invasion', { sun: [-.2, .6, .75], focus: [P[0], 30, P[1]], area: 30, fogNear: 80, fogFar: 600 });
      const g = ground(W, ...P), C = [P[0] + 9, P[1] + 14];
      const ms = mothership(scene, [P[0] - 6, g + 70, P[1] - 30], 34, { shieldStrength: .45 });
      const eye = [P[0] - 6, g + 70 - 34 * .07, P[1] - 30];
      const goku = actor(scene, W, 'goku_ssj', P[0], P[1], { face: C, armL: [-3.05, -.2], armR: [-3.05, .2], headPitch: -.5 }); aura(scene, [P[0], g, P[1]], { color: 0xffe066, h: 2.3, r: 1 });
      energyBall(scene, [P[0], g + 12, P[1]], 3.4, { core: 0x9fdcff, glow: 0x4aa8ff, light: 6, range: 30 });
      const ring = []; for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2, r = 4 + (i % 4) * 1.4; const x = P[0] + Math.cos(a) * r, z = P[1] + Math.sin(a) * r; ring.push({ x, z, y: W.groundAt(x, z), yaw: yawTo([x, z], [P[0], P[1] + 30]), armUp: 2 }); }
      scene.add(crowd(ring, { mix: ALLIES, seed: 91 }));
      const G = [eye[0] + 6, eye[1] - 16, eye[2] + 4];
      nimbus(scene, [G[0] + 1.8, G[1] - .9, G[2]], 1.1);
      const goh = actor(scene, W, 'gohan_scarred', G[0], G[2], { y: G[1] - .4, face: [eye[0], eye[2]], fly: true, flyLean: -.6, armL: [-2.9, -.1], armR: [-2.9, .1] }); aura(scene, [G[0], G[1] - .9, G[2]], { color: 0xffffff, r: .7, h: 1.9 });
      const vid = actor(scene, W, 'videl', G[0] + 1.8, G[2], { y: G[1] - .4, face: [eye[0], eye[2]], armR: [-2.9, .2], armL: [-2.6, -.2], headPitch: -.6 });
      gooRay(scene, [G[0] + .9, G[1] + 1.4, G[2]], [eye[0], eye[1] - .4, eye[2]], { color: 0xffe066, width: .5 });
      const crack = new T.Mesh(new T.SphereGeometry(5, 16, 10), glowMat(0xfff6c0, .7)); crack.position.set(eye[0], eye[1] - .6, eye[2]); scene.add(crack);
      const camera = cam(50, [P[0] + 58, g + 14, P[1] + 64], [P[0] - 4, g + 34, P[1] - 16]);
      return { scene, camera, bloom: [.35, .45, .85], overlay: (ctx, { project }) => { bigName(ctx, project(headTop(goku)), 'Goku', 30); tags(ctx, project, [[goh, 'Gohan'], [vid]], 17); subtitle(ctx, '悟饭：一起？　维黛尔：一起！　旁白：咔嚓。　悟空：就是现在！', 'GOHAN: Together?   VIDEL: Together!   NARRATOR: Crack.   GOKU: NOW!'); } };
    },
  },

  '25-victory': {
    title: 'Victory · the mothership spins all the way home; the littlest Grumbler stays behind', time: '10:45',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.3, .4, .85], focus: [P[0], 20, P[1]], area: 24 });
      const m = [P[0] + 1, P[1] + 3], g = ground(W, ...m), C = [m[0] + .3, m[1] + 4.6];
      const ms = mothership(scene, [P[0] - 60, g + 120, P[1] - 220], 26, { shield: false }); ms.group.rotation.set(.5, 0, .4);
      for (let i = 0; i < 14; i++) { const s = new T.Mesh(new T.SphereGeometry(4 + i * .8, 10, 8), new T.MeshLambertMaterial({ color: 0x8a8f99, transparent: true, opacity: .32 - i * .02, depthWrite: false })); s.position.set(P[0] - 60 + i * 5, g + 120 - i * 3, P[1] - 220 + i * 9); scene.add(s); }
      saucerSwarm(scene, [P[0] - 40, g + 80, P[1] - 180], [50, 20, 30], 90, { rMin: 1.2, rMax: 2.4, seed: 13 });
      const poc = actor(scene, W, 'pocoyo', m[0] - .5, m[1], { face: mix([m[0] + .5, m[1]], C, .4), armR: [-2.2, .4] });
      const zib = actor(scene, W, 'alien_kid', m[0] + .55, m[1] + .5, { face: mix([m[0] - .5, m[1]], C, .4), armL: [-2.6, -.3] });
      const cheer = gather(150, { center: [m[0], m[1] - 6], radius: 9, inner: 2.5, groundAt: W.groundAt, face: C, seed: 95, mix: ALLIES }).filter(p => p.z < m[1] - 3.5); cheer.forEach((p, i) => { p.armUp = i % 3 ? 2 : 1; }); scene.add(crowd(cheer));
      for (const [x, z] of [[-7, -3], [6, -5]]) wreck(scene, [m[0] + x, ground(W, m[0] + x, m[1] + z), m[1] + z], 2);
      const camera = lens(42, C, .9, [m[0], m[1] - 1], 1.4, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[poc], [zib, 'Zib']], 18); subtitle(ctx, '旁白：从来没人邀请最小的那个。小P优优邀请了。　小P优优：派对？', 'NARRATOR: Nobody ever invites the littlest one. Pocoyo did.   POCOYO: Party?'); } };
    },
  },

  '26-proposal': {
    title: 'Sunset on the battlefield · "Let\'s keep saving each other. Will you marry me?"', time: '11:05',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('sunset', { sun: [.35, .18, .9], focus: [P[0], 20, P[1]], area: 20, fogNear: 60, fogFar: 450 });
      const m = [P[0] - 1, P[1] + 5], g = ground(W, ...m), C = [m[0] + 3.2, m[1] + 3.2], Gh = [m[0] - .5, m[1]], Vi = [m[0] + .6, m[1] - .1];
      const goh = actor(scene, W, 'gohan_scarred', ...Gh, { y: g - .38, face: mix(Vi, C, .25), legL: -1.5, legR: 1.2, armR: [-1.5, .1], armL: [-.2, -.2], lean: .05 });
      const box = inHand(goh, 'R', [.14, .12, .14], '#d6383f'); cube(box, [.05, .05, .05], [0, .09, 0], { all: '#ffe9a8' });
      const vid = actor(scene, W, 'videl', ...Vi, { face: mix(Gh, C, .35), armL: [-1.2, .45], armR: [-1.2, -.45], headPitch: .15 });
      for (const [x, z, r] of [[-6, -6, 2.2], [5, -9, 2.6], [-10, 2, 1.8]]) wreck(scene, [m[0] + x, ground(W, m[0] + x, m[1] + z), m[1] + z], r, .6);
      const key = new T.PointLight(0xffd0a0, 8, 10); key.position.set(C[0], g + 2.2, C[1]); scene.add(key);
      const camera = lens(40, C, 1.0, [m[0], m[1] - .2], 1.0, g);
      return { scene, camera, bloom: [.5, .55, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[goh, 'Gohan'], [vid]], 17); subtitle(ctx, '悟饭：那我们就一直互相救下去吧。你愿意嫁给我吗？　维黛尔：愿意。不过你还是得教我飞。', "GOHAN: Then let's keep saving each other. Will you marry me?   VIDEL: Yes. But you still have to teach me to fly."); } };
    },
  },

  '27-wedding': {
    title: 'The biggest wedding the server has ever seen · guests from all three islands', time: '11:25',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('dusk', { sun: [.3, .25, .9], focus: [P[0], 20, P[1]], area: 24, fogNear: 80, fogFar: 500 });
      const a = [P[0], P[1] - 3], g = ground(W, ...a), C = [P[0] + .3, P[1] + 5];
      await arch(scene, [a[0], g, a[1] - .8], 0, 7.4, 3.8);
      const Gh = [a[0] - .45, a[1] + .8], Vi = [a[0] + .45, a[1] + .8];
      const goh = actor(scene, W, 'gohan', ...Gh, { face: mix(Vi, C, .7), groom: true, armL: [-.4, -.35] });
      const vid = actor(scene, W, 'videl_bride', ...Vi, { face: mix(Gh, C, .7), armR: [-.4, .35] });
      const elly = actor(scene, W, 'elly', a[0], a[1] - .3, { face: C, armL: [-1.3, -.1], armR: [-1.3, .1] });
      await weddingCake(scene, [a[0] + 6.2, ground(W, a[0] + 6.2, a[1] - 1.6), a[1] - 1.6], 6);
      const guests = []; for (let r = 0; r < 5; r++) for (let i = 0; i < 16; i++) { if (i === 7 || i === 8) continue; const x = a[0] - 7.5 + i, z = a[1] + 4.6 + r * 1.3; guests.push({ x, z, y: ground(W, x, z), yaw: Math.sin(i * 7 + r) * .15 }); }
      scene.add(crowd(guests, { mix: ALLIES, seed: 101 }));
      fairyLights(scene, [a[0] - 8, g + 5.4, a[1] + 1.6], [a[0] + 8, g + 5.4, a[1] + 1.6], { sag: 1 });
      thrusterTrain(scene, [a[0] - 12, ground(W, a[0] - 12, a[1] + 6), a[1] + 6], 0, 3);
      const disco = saucer(scene, [a[0], g + 9, a[1] + 3], 1.2, { tilt: [0, 0] }); // a Grumbler saucer, kept as the dance-floor light
      fireworks(scene, [[[a[0] + 16, g + 22, a[1] - 30], 0xff6fa8, 7], [[a[0] - 14, g + 26, a[1] - 34], 0x7fd0ff, 6], [[a[0] + 2, g + 32, a[1] - 40], 0xffe066, 8], [[a[0] - 26, g + 20, a[1] - 26], 0x9dff7a, 6]]);
      const camera = cam(50, [a[0] + 10.5, g + 7.5, a[1] + 12], [a[0] - .4, g + 1.2, a[1] + 3.2]);
      return { scene, camera, bloom: [.6, .5, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[goh], [vid], [elly]], 15); caption(ctx, "Vegeta's train brought the guests. Gabby did the flowers. Buu baked the cake.", { y: 72, size: 28 }); } };
    },
  },

  '28-vows': {
    title: 'The vows · "I promise to catch you when you fall." "I promise to never let go."', time: '11:40',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('dusk', { sun: [.3, .25, .9], focus: [P[0], 20, P[1]], area: 18, fogNear: 80, fogFar: 500 });
      const a = [P[0], P[1] - 3], g = ground(W, ...a), C = [P[0] + .2, P[1] + 3.6];
      await arch(scene, [a[0], g, a[1] - .8], 0, 7.4, 3.8);
      const Gh = [a[0] - .5, a[1] + .8], Vi = [a[0] + .5, a[1] + .8];
      const goh = actor(scene, W, 'gohan', ...Gh, { face: mix(Vi, C, .45), groom: true, armL: [-1.1, -.55], armR: [-1.1, .1] });
      const vid = actor(scene, W, 'videl_bride', ...Vi, { face: mix(Gh, C, .45), armR: [-1.1, .55], armL: [-1.1, -.1] });
      const elly = actor(scene, W, 'elly', a[0], a[1] - .4, { face: C });
      const poc = actor(scene, W, 'pocoyo', a[0] - 1.4, a[1] + 1.5, { face: C, armL: [-1.3, -.1], armR: [-1.3, .1] }); cube(poc.armR, [.4, .08, .3], [-.15, -.42, -.12], { all: '#e05aa0' });
      const zib = actor(scene, W, 'alien_kid', a[0] + 1.4, a[1] + 1.5, { face: C, armR: [-2.4, .3] });
      const fri = actor(scene, W, 'frieza', a[0] + 3.2, a[1] + 2.8, { face: mix(a, C, .6), armR: [-2.5, .4], headPitch: .2 });
      const pet = new T.MeshLambertMaterial({ color: 0xffc0dc, side: T.DoubleSide });
      for (let i = 0; i < 60; i++) { const p = new T.Mesh(new T.PlaneGeometry(.12, .12), pet); p.position.set(a[0] - 4 + Math.abs(Math.sin(i * 3.1)) * 8, g + .5 + Math.abs(Math.sin(i * 1.7)) * 4, a[1] + Math.abs(Math.sin(i * 2.3)) * 4); p.rotation.set(i, i * 2, 0); scene.add(p); }
      const key = new T.PointLight(0xffe0c0, 8, 12); key.position.set(C[0], g + 2.6, C[1] - .6); scene.add(key);
      const camera = lens(44, C, 1.6, [a[0], a[1] + .8], 1.4, g);
      return { scene, camera, bloom: [.4, .5, .8], overlay: (ctx, { project }) => { tags(ctx, project, [[goh], [vid], [elly], [poc], [zib, 'Zib'], [fri, 'Frieza ("It\'s the goo.")']], 14); subtitle(ctx, '维黛尔：我保证，你掉下来的时候我会接住你。　悟饭：我保证永远不放手。', 'VIDEL: I promise to catch you when you fall.   GOHAN: I promise to never let go.'); } };
    },
  },

  '29-goodbye': {
    title: 'Goodbye · Pocoyo waves from the top of the cake; the moral', time: '12:00',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('dusk', { sun: [.3, .2, .9], focus: [P[0], 20, P[1]], area: 20, fogNear: 80, fogFar: 500 });
      const c = [P[0] + 5, P[1] - 2], g = ground(W, ...c), C = [c[0] - 1.4, c[1] + 7.6];
      const top = await weddingCake(scene, [c[0], g, c[1]], 6);
      const poc = actor(scene, W, 'pocoyo', c[0], c[1], { y: top + .5, face: C, sit: true, seat: top + .5, armR: [-2.8, .4] });
      const dance = gather(140, { center: [c[0] - 3, c[1] + 1], radius: 7, inner: 2.2, groundAt: W.groundAt, face: [c[0] - 3, c[1] + 1], seed: 111, mix: [...ALLIES, 'alien'] }).filter(p => p.z < c[1] + 4); dance.forEach((p, i) => { p.walk = i; p.armUp = i % 4 === 0 ? 2 : undefined; });
      scene.add(crowd(dance, { seed: 111 }));
      const goh = actor(scene, W, 'gohan', c[0] - 3.4, c[1] + 2.4, { face: [c[0] - 2.6, c[1] + 2.6], groom: true, armL: [-1.4, -.4], armR: [-1.6, .2] });
      const vid = actor(scene, W, 'videl_bride', c[0] - 2.6, c[1] + 2.6, { face: [c[0] - 3.4, c[1] + 2.4], armR: [-1.4, .4], armL: [-1.6, -.2] });
      fireworks(scene, [[[c[0] + 10, g + 24, c[1] - 30], 0xff6fa8, 8], [[c[0] - 16, g + 28, c[1] - 34], 0x7fd0ff, 7], [[c[0] - 2, g + 34, c[1] - 44], 0xffe066, 9], [[c[0] + 22, g + 20, c[1] - 22], 0x9dff7a, 6]]);
      const camera = cam(46, [c[0] - 2.6, top - 1.2, c[1] + 10], [c[0] - .6, top - 1.4, c[1]]);
      return { scene, camera, bloom: [.6, .5, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[poc], [goh], [vid]], 15); subtitle(ctx, '好的团队不是从不摔倒的团队，而是会互相接住的团队。', "A good team isn't the one that never falls. It's the one that catches each other."); } };
    },
  },
};
