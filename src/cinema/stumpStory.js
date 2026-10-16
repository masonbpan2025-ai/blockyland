// 守株待兔 · Waiting by the Stump — Claude. The edit: one clock, every time in seconds.
// Line starts are laid out from the measured clips in public/cinema-stump/audio/manifest.json;
// the director refuses to play if a clip would run into the next line.
import { LINES } from './stumpLines.js';

const START = {
  open: 5.4, 'li-morning': 16.8, 'farmer-back': 21.3, 'n-rabbit': 24.6, 'farmer-whoa': 32.9, 'farmer-dinner': 36.6, 'farmer-idea': 41.0, 'n-waited': 48.2,
  'hu-what': 53.0, 'li-rabbits': 55.2, 'hu-really': 57.0, 'li-weeds': 59.8, 'farmer-letthem': 63.5, 'n-days': 67.4,
  'n-harvest': 84.0, 'hu-more': 92.0, 'farmer-notone': 94.6, 'li-seeds': 97.0, 'farmer-hoe': 104.2, close: 115.0,
};

export const STUMP_STORY = {
  id: 'stump-claude', title: '守株待兔', englishTitle: 'WAITING BY THE STUMP', tagline: 'An old fable about luck, and the work that comes after',
  duration: 127, fps: 24, posterTime: 36.9,
  lines: LINES.map(line => ({ ...line, start: START[line.id] })),
  labels: [{ from: 59.0, to: 65.8, text: '几天以后  ·  A FEW DAYS LATER' }, { from: 83.8, to: 90.5, text: '秋收  ·  HARVEST TIME' }],
  moral: { zh: '偶然的好运，不能代替辛勤的劳动。', en: 'A lucky chance is no substitute for honest work.' },
};

export const STUMP_REVIEW_TIMES = [3, 13, 18, 22, 26, 28.8, 30.5, 33.5, 37.5, 42, 47.4, 50, 54, 56, 57.3, 61, 64.5, 69, 73, 77, 80.8, 82, 85, 89, 92.8, 95, 97, 99.8, 105, 109, 113, 118, 124];
