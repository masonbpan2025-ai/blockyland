// Expressive pixel faces for Claude's cut. Each face is a 32×32 canvas (four times
// the 8×8 skin face) drawn on a plane just in front of the head, so brows, irises,
// lids, mouth shapes, blush and tears all read in close-up while staying blocky.
// A face is a blend of named expressions plus lip-sync and blinks from the director.
import * as T from 'three';

export const EXPRESSIONS = {
  neutral: {},
  calm: { smile: .15, eyeOpen: .92 },
  warm: { smile: .55, happy: .35, browY: -.3 },
  happy: { smile: .8, happy: .5, browY: -.5, blush: .3 },
  joy: { smile: 1, happy: 1, browY: -.8, mouthOpen: .45, teeth: 1, blush: .8 },
  excited: { smile: .9, eyeOpen: 1.2, browY: -1.2, mouthOpen: .5, teeth: 1, blush: .4 },
  sulk: { browTilt: -.55, browY: .6, eyeOpen: .72, gazeY: .55, smile: -.45, pout: 1 },
  sad: { browTilt: -1, eyeOpen: .8, gazeY: .45, smile: -.6 },
  worried: { browTilt: -.75, browY: -.2, eyeOpen: 1.05, smile: -.25 },
  cry: { browTilt: -1, eyeOpen: .12, mouthOpen: .75, smile: -1, tears: 1, blush: .55 },
  sniffle: { browTilt: -.8, eyeOpen: .82, smile: -.3, tears: .55, blush: .4, gazeY: .2 },
  hopeful: { browTilt: -.45, browY: -.4, eyeOpen: 1.08, smile: .3, tears: .25, blush: .3 },
  surprised: { browY: -1.8, eyeOpen: 1.35, mouthOpen: .55, round: 1 },
  shock: { browY: -1.5, browTilt: -.4, eyeOpen: 1.3, mouthOpen: .7, round: .6, smile: -.3 },
  curious: { browY: -.9, browTilt: .1, eyeOpen: 1.12, smile: .1, asym: .6 },
  thinking: { browTilt: .25, browY: .15, eyeOpen: .85, gazeX: -.6, gazeY: -.5, smile: 0, asym: .5 },
  knowing: { smile: .6, happy: .55, browY: -.2, asym: .8 },
  stern: { browTilt: .8, browY: .4, eyeOpen: .85, smile: -.25 },
  pained: { browTilt: -1, eyeOpen: .2, mouthOpen: .35, teeth: 1, smile: -.6 },
  relieved: { browTilt: -.35, smile: .6, happy: .4, eyeOpen: .85, blush: .2 },
  determined: { browTilt: .45, browY: .25, smile: .2, eyeOpen: 1 },
  sheepish: { browTilt: -.4, smile: .35, gazeX: .6, gazeY: .3, blush: .6 },
  wink: { smile: .75, happy: .25, wink: 1, asym: .9, browY: -.3 },
  proud: { smile: .45, happy: .2, browY: -.2, eyeOpen: .9 },
  sleepy: { eyeOpen: .04, browY: .35, smile: .05, mouthOpen: .16 },
  bored: { eyeOpen: .6, browY: .4, browTilt: -.2, smile: -.15, gazeY: .2 },
  greedy: { smile: 1, happy: .6, browY: -.9, mouthOpen: .3, teeth: 1, asym: .7 },
};
const BASE = { smile: 0, happy: 0, browY: 0, browTilt: 0, eyeOpen: 1, gazeX: 0, gazeY: 0, mouthOpen: 0, teeth: 0, round: 0, blush: 0, tears: 0, pout: 0, asym: 0, wink: 0 };

export function mixExpression(parts) {
  const out = { ...BASE };
  let total = 0; for (const [, w] of parts) total += w;
  for (const [name, w] of parts) { const e = EXPRESSIONS[name] ?? {}; for (const k in BASE) out[k] += ((e[k] ?? BASE[k]) - BASE[k]) * w / (total || 1); }
  return out;
}

const hex = (c, k = 1) => { const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; };

// look: { skin, hair, eyes, brows, style: 'bangs'|'short'|'bun'|'elder'|'cropped'|'scarf'|'helmet', lashes, beard, mustache, wrinkles, child }
export function createFace(look) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const p = canvas.getContext('2d');
  const texture = new T.CanvasTexture(canvas); texture.magFilter = texture.minFilter = T.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = T.SRGBColorSpace;
  const material = new T.MeshLambertMaterial({ map: texture, transparent: false });
  const plane = new T.Mesh(new T.PlaneGeometry(.5, .5), material);
  plane.rotation.y = Math.PI; plane.position.set(0, .25, -.2535); plane.receiveShadow = true;
  const r = (x, y, w, h, c) => { if (w <= 0 || h <= 0) return; p.fillStyle = c; p.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  let last = '';
  const kid = !!look.child, eyeW = kid ? 6 : 5, eyeH = kid ? 6 : 4, eyeTop = kid ? 14 : 14, lx = kid ? 6 : 7, rx = 32 - lx - eyeW;
  const browColor = look.brows ?? hex(look.hair, .7);

  function hairFringe() {
    const h = look.hair, dark = hex(h, .82);
    switch (look.style) {
      case 'bangs': // straight bangs with a few tips, long side locks
        r(0, 0, 32, 9, h); for (const x of [3, 9, 15, 22, 27]) r(x, 9, 3, 1, h); r(0, 9, 3, 16, h); r(29, 9, 3, 16, h); r(5, 8, 22, 1, dark); break;
      case 'bun': // centre parting, hair swept to the sides
        r(0, 0, 32, 7, h); r(15, 0, 2, 4, hex(h, 1.25)); r(0, 7, 6, 3, h); r(26, 7, 6, 3, h); r(0, 10, 2, 9, h); r(30, 10, 2, 9, h); r(6, 6, 20, 1, dark); break;
      case 'short': // tousled fringe
        r(0, 0, 32, 6, h); for (const [x, w, d] of [[2, 4, 2], [7, 5, 3], [13, 4, 1], [18, 5, 3], [24, 4, 2]]) r(x, 6, w, d, h); r(0, 6, 2, 8, h); r(30, 6, 2, 8, h); break;
      case 'cropped':
        r(0, 0, 32, 5, h); r(0, 5, 32, 1, dark); r(0, 5, 2, 7, h); r(30, 5, 2, 7, h); break;
      case 'elder': // hat brim shadow, white temples
        r(0, 0, 32, 5, hex(look.hatShadow ?? '#6e5a3a')); r(0, 5, 32, 1, hex(look.hatShadow ?? '#6e5a3a', .8)); r(0, 6, 3, 10, h); r(29, 6, 3, 10, h); break;
      case 'scarf':
        r(0, 0, 32, 7, look.scarf); r(0, 7, 32, 1, hex(look.scarf, .8)); r(0, 8, 3, 18, look.scarf); r(29, 8, 3, 18, look.scarf); r(3, 8, 5, 2, h); r(24, 8, 5, 2, h); break;
      case 'helmet':
        r(0, 0, 32, 7, '#5d6870'); r(0, 7, 32, 1, '#3b444b'); r(0, 8, 3, 14, '#4b555c'); r(29, 8, 3, 14, '#4b555c'); break;
      case 'headband':
        r(0, 0, 32, 6, h); r(0, 6, 32, 2, look.band); r(0, 8, 2, 6, h); r(30, 8, 2, 6, h); break;
    }
  }

  function eye(x, e, side) {
    const open = Math.max(0, Math.min(1.4, e.eyeOpen * (side === 'r' && e.wink ? 1 - e.wink : 1)));
    const lash = '#2a1c14';
    if (e.happy > .55 && open > .15) { // crescent smiling eyes
      r(x, eyeTop + 2, 1, 2, lash); r(x + 1, eyeTop + 1, eyeW - 2, 1, lash); r(x + eyeW - 1, eyeTop + 2, 1, 2, lash); return;
    }
    if (open < .2) { r(x, eyeTop + Math.floor(eyeH / 2), eyeW, 1, lash); if (look.lashes) r(x - 1, eyeTop + Math.floor(eyeH / 2) - 1, 1, 1, lash); return; }
    const h = Math.max(1, Math.round(eyeH * Math.min(open, 1.25))), top = eyeTop + Math.round((eyeH - h) / 2 + (open < 1 ? (eyeH - h) / 2 : 0));
    r(x, top, eyeW, h, '#f6f1ea');
    const gx = Math.round(e.gazeX * (kid ? 1.5 : 1)), gy = Math.round(e.gazeY * 1);
    const iw = kid ? 3 : 2, ix = x + Math.round((eyeW - iw) / 2) + gx + (side === 'l' ? 0 : 0);
    const ih = Math.min(h, kid ? 4 : 3), iy = Math.max(top, Math.min(top + h - ih, top + Math.round((h - ih) / 2) + gy));
    r(ix, iy, iw, ih, look.eyes ?? '#4a3020'); r(ix + (iw > 2 ? 1 : 0), iy + (ih > 2 ? 1 : 0), iw > 2 ? 1 : 1, ih > 2 ? ih - 1 : ih, '#120c08');
    if (h >= 2) r(ix, iy, 1, 1, '#ffffff');
    // upper lid line and lashes
    r(x, top - 1, eyeW, 1, lash); if (look.lashes) { r(side === 'l' ? x - 1 : x + eyeW, top - 1, 1, 1, lash); r(side === 'l' ? x - 1 : x + eyeW, top - 2, 1, 1, lash); }
    if (open < .9 && open >= .2) r(x, top, eyeW, 1, hex(look.skin, .78)); // heavy lids
    if (e.happy > .2) r(x, top + h - 1, eyeW, 1, hex(look.skin, .9)); // cheeks push up
  }

  function brows(e) {
    const y0 = eyeTop - 3 + Math.round(e.browY), tilt = e.browTilt; // tilt<0: inner ends up (sad); >0: inner ends down (cross)
    for (const [x, inner] of [[lx, lx + eyeW - 1], [rx, rx]]) {
      for (let i = 0; i < eyeW + 1; i++) {
        const px = x - (x === lx ? 1 : 0) + i, toInner = 1 - Math.abs(px - inner) / (eyeW + 1);
        const lift = (x === rx ? e.asym * -.8 : 0);
        const y = y0 + Math.round(tilt * 2.2 * toInner - (tilt < 0 ? 0 : .5) + lift);
        r(px, y, 1, look.child ? 1 : 2, browColor);
      }
    }
  }

  function mouth(e) {
    const cx = 16, y = 24 + (kid ? 0 : 0), lip = look.lip ?? hex(look.skin, .62), dark = '#3a1612';
    const open = Math.max(0, Math.min(1, e.mouthOpen)), smile = Math.max(-1, Math.min(1, e.smile));
    const baseW = kid ? 6 : 8, w = Math.round(baseW * (1 - e.round * .45 + Math.max(0, smile) * .25 - e.pout * .2));
    if (open > .12) {
      const h = Math.max(2, Math.round(1 + open * 4)), mw = Math.max(3, Math.round(w * (1 - open * .2 * e.round)));
      const x = cx - Math.floor(mw / 2), top = y - Math.round(Math.max(0, smile) * 1) - (smile < 0 ? 0 : 0);
      r(x, top, mw, h, dark);
      if (smile > .3) { r(x - 1, top - 1, 1, 1, lip); r(x + mw, top - 1, 1, 1, lip); r(x, top + h - 1, 1, 1, hex(look.skin, .95)); r(x + mw - 1, top + h - 1, 1, 1, hex(look.skin, .95)); }
      if (smile < -.3) { r(x - 1, top + h - 1, 1, 1, lip); r(x + mw, top + h - 1, 1, 1, lip); r(x, top, 1, 1, hex(look.skin, .95)); r(x + mw - 1, top, 1, 1, hex(look.skin, .95)); }
      if ((e.teeth > .5 || open > .55) && h >= 3) r(x + 1, top, mw - 2, 1, '#f3eee4');
      if (h >= 4) r(x + 1, top + h - 2, mw - 2, 1, '#a8443d');
      return;
    }
    // closed: a curve. corners lift for a smile, droop for a frown
    const lift = Math.round(smile * 2), x = cx - Math.floor(w / 2);
    r(x + 1, y + (smile > .3 ? 1 : 0), w - 2, 1, lip);
    r(x, y + (smile > .3 ? 1 : 0) - Math.max(0, lift) + Math.max(0, -lift), 1, 1, lip);
    r(x + w - 1, y + (smile > .3 ? 1 : 0) - Math.max(0, lift) + Math.max(0, -lift) - (e.asym > .5 && smile > .2 ? 1 : 0), 1, 1, lip);
    if (e.pout > .5) r(x + 2, y + 1, w - 4, 1, hex(look.skin, .8));
    if (smile > .6 && !look.beard) r(x + 2, y + 2, w - 4, 1, hex(look.skin, .86));
  }

  function draw(e) {
    const s = look.skin;
    r(0, 0, 32, 32, s);
    r(0, 28, 32, 4, hex(s, .93)); r(13, 19, 6, 1, hex(s, .9)); r(14, 20, 4, 2, hex(s, .86)); r(15, 22, 2, 1, hex(s, .8)); // jaw shade + nose
    if (look.wrinkles) { const w = hex(s, .8); r(lx - 3, eyeTop + 1, 2, 1, w); r(rx + eyeW + 1, eyeTop + 1, 2, 1, w); r(9, 9, 14, 1, w); r(11, 11, 10, 1, hex(s, .86)); r(9, 22, 1, 3, w); r(22, 22, 1, 3, w); }
    if (e.blush > .05) { p.globalAlpha = Math.min(1, e.blush) * .55; r(lx - 1, eyeTop + eyeH + 2, 4, 2, '#e97a7a'); r(rx + eyeW - 3, eyeTop + eyeH + 2, 4, 2, '#e97a7a'); p.globalAlpha = 1; }
    hairFringe();
    brows(e); eye(lx, e, 'l'); eye(rx, e, 'r');
    if (look.beard) { const b = look.beard, bs = hex(b, .86); r(4, 22, 24, 10, b); r(2, 18, 3, 10, b); r(27, 18, 3, 10, b); r(8, 29, 16, 3, bs); r(6, 21, 20, 2, b); }
    if (look.mustache || look.beard) { const m = look.mustache ?? look.beard; r(9, 21, 14, 2, m); r(8, 22, 2, 1, hex(m, .85)); r(22, 22, 2, 1, hex(m, .85)); }
    mouth(e);
    if (e.tears > .05) {
      const len = Math.round(2 + e.tears * 8), c = '#9fd6f5';
      for (const x of [lx + 1, rx + eyeW - 2]) { p.globalAlpha = .9; r(x, eyeTop + eyeH, 1, len, c); r(x + (x < 16 ? -1 : 1), eyeTop + eyeH + len - 1, 1, 1, c); p.globalAlpha = 1; r(x, eyeTop + eyeH - 1, 2, 1, '#cdeeff'); }
    }
  }

  return {
    plane,
    set(e) {
      const key = Object.keys(BASE).map(k => Math.round(e[k] * 20)).join(',');
      if (key === last) return; last = key; draw(e); texture.needsUpdate = true;
    },
  };
}
