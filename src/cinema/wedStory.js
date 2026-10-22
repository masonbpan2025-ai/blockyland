// 1500 Cartoon Players: Three Islands, Three Weddings · 1500名卡通玩家：三座岛，三场婚礼. The edit: one clock, every time
// in seconds. Line starts and scene spans come from wedTimeline.js, laid out from the measured voice clips by
// scripts/layout-wed.mjs.
import { LINES } from './wedLines.js';
import { START, SCENE, DURATION } from './wedTimeline.js';

export { START, SCENE };
export const WED_STORY = {
  id: 'civ-weddings', title: '1500名卡通玩家：三座岛，三场婚礼', englishTitle: 'THREE ISLANDS, THREE WEDDINGS', tagline: 'Three islands. Three couples. One very long server.',
  brand: 'BLOCKYLAND PICTURES', duration: DURATION, fps: 24, posterTime: SCENE.wedding[0] + 6,
  lines: LINES.map(line => ({ ...line, start: START[line.id] })),
  labels: [
    { from: SCENE.farm[0] + .4, to: SCENE.farm[0] + 5, text: '第一幕 · 相遇  ·  ACT I · MEETING' },
    { from: SCENE.fair[0] + .4, to: SCENE.fair[0] + 5, text: '第二幕 · 朋友与麻烦  ·  ACT II · FRIENDS, AND TROUBLE' },
    { from: SCENE.freeze[0] + .4, to: SCENE.freeze[0] + 5, text: '第三幕 · 大冰冻  ·  ACT III · THE BIG FREEZE' },
    { from: SCENE.propgoku[0] + .4, to: SCENE.propgoku[0] + 5, text: '第四幕 · 三次求婚  ·  ACT IV · THREE PROPOSALS' },
    { from: SCENE.year15[0] + .4, to: SCENE.year15[0] + 5, text: '第五幕 · 下一代  ·  ACT V · THE NEXT GENERATION' },
  ],
  moral: { zh: '爱不是赢，是每天都出现、说真话，让你爱的人自由地选择你。', en: "Love isn't winning. It's showing up, telling the truth, and letting the people you love choose you." },
};

// Review frames: the start, middle and end of every scene.
export const WED_REVIEW_TIMES = Object.values(SCENE).flatMap(([a, b]) => [a + 1.2, (a + b) / 2, b - 1.2]).map(t => Math.round(t * 10) / 10);
