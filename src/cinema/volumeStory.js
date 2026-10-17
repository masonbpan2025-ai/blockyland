// 一层一层数体积 · Count Volume Layer by Layer. The edit: one clock, every time in seconds.
// Line starts are laid out from the measured clips in public/cinema-volume/audio/manifest.json, leaving
// room for each build to play; the director refuses to play if a clip would run into the next line.
import { LINES } from './volumeLines.js';

const START = {
  // the fish ball
  'n-open': 6.0, 'bo-ball': 10.6, 'bo-buckets': 15.2, 'mei-hmm': 18.4, 'bo-round': 23.0, 'mei-simple': 26.0,
  // flat first
  'mei-stairs': 33.4, 'bo-count': 41.2, 'mei-hundred': 49.4, 'bo-forever': 53.8, 'mei-twin': 56.0, 'bo-rect': 62.0, 'mei-rect': 64.2, 'n-formula': 72.6,
  'mei-tiny': 81.8, 'bo-triangle': 87.4, 'n-half': 92.4,
  // the pyramid
  'mei-3d': 102.4, 'n-squares': 107.4, 'bo-120': 114.8, 'mei-quarters': 121.6, 'bo-harder': 126.4, 'mei-trick': 130.2,
  'n-fly': 135.8, 'bo-cube': 141.6, 'mei-gold': 143.4, 'mei-smaller': 153.2, 'n-seams': 157.4,
  'n-limit': 164.8, 'mei-third': 172.6, 'n-sum': 180.8,
  // the ball
  'bo-ballnow': 188.2, 'mei-circles': 190.6, 'n-radius': 196.2, 'mei-area': 202.6, 'n-archimedes': 209.8, 'mei-add': 218.2, 'n-twothirds': 226.0,
  'bo-halves': 230.4, 'mei-ball': 233.2, 'bo-six': 238.2, 'mei-905': 242.6, 'bo-905': 245.8, 'n-fill': 248.6,
  // every pointy shape
  'bo-heart': 259.8, 'mei-every': 265.6, 'mei-side': 272.2, 'n-width': 280.4, 'mei-depth': 287.2, 'n-quarter': 291.2, 'bo-myheart': 300.0, 'mei-heart': 303.2, 'n-sumall': 310.4,
  // ending
  'bo-fish': 320.8, 'n-close': 324.6,
};

export const VOLUME_STORY = {
  id: 'volume-layers', title: '一层一层数体积', englishTitle: 'COUNT VOLUME LAYER BY LAYER', tagline: 'Triangles, pyramids, cones and balls, counted one layer at a time',
  brand: 'BLOCKYLAND PICTURES', duration: 338, fps: 24, posterTime: 139.6,
  lines: LINES.map(line => ({ ...line, start: START[line.id] })),
  labels: [
    { from: 32.6, to: 39.5, text: '先数平面  ·  FLAT SHAPES FIRST' },
    { from: 101.8, to: 108.5, text: '三维：金字塔  ·  NOW IN 3D: THE PYRAMID' },
    { from: 187.6, to: 194.5, text: '球  ·  THE BALL' },
    { from: 259.2, to: 266, text: '所有尖顶的形状  ·  EVERY POINTY SHAPE' },
  ],
  moral: { zh: '再大的形状，也是一层一层加起来的。', en: 'Even the biggest shapes are just layers, added up.' },
};

// One review frame per beat: the build, the reveal, and every card.
export const VOLUME_REVIEW_TIMES = [3, 12, 19.5, 24, 29, 36, 45, 51, 58.5, 61, 66, 76, 83.5, 86.5, 90, 97, 104, 110, 117, 123, 128, 132, 137.5, 140.5, 147, 155, 160, 166, 169.5, 175, 184, 189, 193, 199, 205, 213, 221, 228, 232, 235.5, 240, 246.5, 250, 256, 262, 268, 275, 283, 289, 295, 301, 306, 313, 318, 322, 327, 335];
