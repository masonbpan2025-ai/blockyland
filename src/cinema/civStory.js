// 1500 Cartoon Players Simulate Civilization · 1500名卡通玩家模拟文明. The edit: one clock, every time in seconds.
// Line starts and scene spans come from civTimeline.js, laid out from the measured voice clips by scripts/layout-civ.mjs.
import { LINES } from './civLines.js';
import { START, SCENE, DURATION } from './civTimeline.js';

export { START, SCENE };
export const CIV_STORY = {
  id: 'civ-1500', title: '1500名卡通玩家模拟文明', englishTitle: '1500 CARTOON PLAYERS SIMULATE CIVILIZATION', tagline: 'Three islands. Three cartoons. One invasion.',
  brand: 'BLOCKYLAND PICTURES', duration: DURATION, fps: 24, posterTime: SCENE.wedding[0] + 8,
  lines: LINES.map(line => ({ ...line, start: START[line.id] })),
  labels: [
    { from: SCENE.day1[0] + .4, to: SCENE.day1[1] - .2, text: '第一阶段 · 第 1–7 天  ·  PHASE I · DAYS 1–7' },
    { from: SCENE.day8[0] + .4, to: SCENE.day8[0] + 6, text: '第二阶段 · 第 8–14 天  ·  PHASE II · DAYS 8–14' },
    { from: SCENE.invasion[0] + .4, to: SCENE.invasion[0] + 6, text: '第三阶段 · 第 15 天  ·  PHASE III · DAY 15: THE INVASION' },
  ],
  moral: { zh: '好的团队不是从不摔倒的团队，而是会互相接住的团队。', en: 'A good team isn’t the one that never falls. It’s the one that catches each other.' },
};

// Review frames: the start, middle and end of every scene.
export const CIV_REVIEW_TIMES = Object.values(SCENE).flatMap(([a, b]) => [a + 1.2, (a + b) / 2, b - 1.2]).map(t => Math.round(t * 10) / 10);
