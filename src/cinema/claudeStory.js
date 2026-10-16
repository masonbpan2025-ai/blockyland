// 塞翁失马 · We'll See — Claude's cut. The edit: one clock, every time in seconds.
// Line start times were laid out from the measured clip lengths in
// public/cinema-claude/audio/manifest.json; claudeFilm.js refuses to play if two
// voices would overlap or a clip would run into the next line.
import { LINES } from './claudeLines.js';

const START = {
  open: 5.4, 'bo-wagon': 12.0, 'mei-no': 16.9, 'mom-chance': 20.6, 'mei-worst': 26.2, 'gp-worst': 31.2, 'mei-how': 35.7, 'gp-story': 38.3,
  'p-run': 44.6, 'n-terrible': 51.3, 'o-bad1': 54.8, 'p-return': 58.4, 'n-wonderful': 64.0, 'o-good1': 67.1,
  'p-fall': 70.6, 'n-poor': 76.4, 'o-bad2': 79.7, 'p-war': 82.4, 'n-stays': 89.6, 'o-good2': 93.0, 'o-see': 95.0,
  'mei-which': 98.6, 'gp-over': 102.9, 'dad-wheel': 108.2, 'bo-ruined': 110.1, 'mei-remember': 119.8, 'bo-ranaway': 122.9, 'mei-see': 124.8, 'bo-see': 129.5,
  'n-workshop': 133.0, 'c-fix': 137.4, 'dad-every': 142.5, 'c-stay': 144.1,
  'n-evening': 153.8, 'dad-stay': 157.6, 'bo-good': 161.8, 'mei-final': 163.9, close: 168.0,
};

export const CLAUDE_STORY = {
  id: 'well-see-claude', title: '塞翁失马', englishTitle: 'WE’LL SEE', tagline: 'An old story, for a family facing something new',
  storybook: 'parable', labels: [{ from: 44.6, to: 96.9, text: '爷爷的故事  ·  GRANDPA’S STORY' }],
  duration: 178, fps: 24, posterTime: 124.9,
  lines: LINES.map(line => ({ ...line, start: START[line.id] })),
  // Scene clock: which set is on screen. Dissolves render both sides.
  scenes: [
    { name: 'home', start: 0, end: 43.8 },
    { name: 'parable', start: 43.8, end: 97.5 },
    { name: 'home', start: 97.5, end: 132.3 },
    { name: 'workshop', start: 132.3, end: 152.9 },
    { name: 'evening', start: 152.9, end: 178 },
  ],
  moral: { zh: '塞翁失马，焉知非福。', en: 'The old man lost his horse. Who could say it wasn’t a blessing?' },
};

export const CLAUDE_REVIEW_TIMES = [3, 13, 18, 23, 33, 40, 47, 52, 56, 61, 65, 68, 73.6, 78, 85, 90, 94.5, 100, 107.6, 111, 117, 120, 125, 129, 131, 135, 140, 146, 151, 155, 160, 165, 170, 175];
