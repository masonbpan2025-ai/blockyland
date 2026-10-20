// 1500 Players · documentary overlays, drawn on the 2D canvas after the 3D render: player name tags,
// bold one-word captions, the DAY title card with island population counters, map pins, a RECORDING badge,
// world-broadcast and HUD banners, and the closing credits.
const BASE = import.meta.env?.BASE_URL ?? '/';
export const fontsReady = (async () => {
  try { const f = new FontFace('Minecraft', `url(${BASE}assets/fonts/Minecraft.otf)`); await f.load(); document.fonts.add(f); } catch { /* falls back to a system font */ }
})();

/** A Minecraft name tag: translucent dark box, white text, scaled by distance. */
export function nameTag(ctx, xy, text, { size = 18, color = '#ffffff', alpha = .38 } = {}) {
  if (!xy) return; ctx.save(); ctx.font = `${size}px Minecraft, monospace`; const w = ctx.measureText(text).width;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.fillRect(xy[0] - w / 2 - size * .3, xy[1] - size * 1.15, w + size * .6, size * 1.3);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text, xy[0], xy[1] - size * .2); ctx.restore();
}
/** The big floating name over a player in close-ups (white, outlined, slightly transparent). */
export function bigName(ctx, xy, text, size = 46) {
  if (!xy) return; ctx.save(); ctx.font = `${size}px Minecraft, monospace`; ctx.textAlign = 'center'; ctx.globalAlpha = .82;
  ctx.lineWidth = size * .14; ctx.strokeStyle = 'rgba(30,30,30,.55)'; ctx.strokeText(text, ...xy); ctx.fillStyle = '#f4f4f4'; ctx.fillText(text, ...xy); ctx.restore();
}
/** The editor's punchy caption: one short phrase, heavy rounded type, white with a dark outline, bottom centre. */
export function caption(ctx, text, { W = 1280, H = 720, y = H - 58, size = 40, color = '#ffffff', italic = false } = {}) {
  ctx.save(); ctx.font = `${italic ? 'italic ' : ''}900 ${size}px "Arial Rounded MT Bold", "Nunito", "Segoe UI Black", Arial, sans-serif`; ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * .22; ctx.strokeStyle = '#1d1d24'; ctx.strokeText(text, W / 2, y); ctx.fillStyle = color; ctx.fillText(text, W / 2, y); ctx.restore();
}
/** Narrator subtitle: a smaller two-line caption with Chinese above English. */
export function subtitle(ctx, zh, en, { W = 1280, H = 720 } = {}) {
  ctx.save(); ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const [text, y, size, font] of [[zh, H - 76, 26, '"Microsoft YaHei", "PingFang SC", sans-serif'], [en, H - 40, 24, '"Segoe UI", Arial, sans-serif']]) {
    if (!text) continue; ctx.font = `600 ${size}px ${font}`; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,10,14,.85)'; ctx.strokeText(text, W / 2, y); ctx.fillStyle = '#fbf7ea'; ctx.fillText(text, W / 2, y);
  }
  ctx.restore();
}
const ICON = { hot: ['#c96a3c', '#e58a4c', '#a8512b'], temperate: ['#5aa543', '#7fc35a', '#7a5a3a'], cold: ['#bfe2f2', '#e8f6fb', '#7fb7d6'] };
/** A little isometric block icon (sand / grass / ice) for the population counters. */
export function blockIcon(ctx, x, y, s, kind) {
  const [top, left, right] = ICON[kind]; ctx.save();
  ctx.fillStyle = top; ctx.beginPath(); ctx.moveTo(x, y - s * .5); ctx.lineTo(x + s * .5, y - s * .25); ctx.lineTo(x, y); ctx.lineTo(x - s * .5, y - s * .25); ctx.fill();
  ctx.fillStyle = left; ctx.beginPath(); ctx.moveTo(x - s * .5, y - s * .25); ctx.lineTo(x, y); ctx.lineTo(x, y + s * .55); ctx.lineTo(x - s * .5, y + s * .3); ctx.fill();
  ctx.fillStyle = right; ctx.beginPath(); ctx.moveTo(x + s * .5, y - s * .25); ctx.lineTo(x, y); ctx.lineTo(x, y + s * .55); ctx.lineTo(x + s * .5, y + s * .3); ctx.fill(); ctx.restore();
}
/** Population counters across the top: hot, temperate, cold. */
export function counters(ctx, [hot, temperate, cold], { W = 1280 } = {}) {
  ctx.save(); ctx.font = '34px Minecraft, monospace'; ctx.textBaseline = 'middle';
  [[hot, 'hot'], [temperate, 'temperate'], [cold, 'cold']].forEach(([n, kind], i) => {
    const x = W * (.18 + i * .32); blockIcon(ctx, x - 34, 44, 40, kind);
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeText(String(n), x, 46); ctx.fillStyle = '#ffffff'; ctx.globalAlpha = .9; ctx.fillText(String(n), x, 46); ctx.globalAlpha = 1;
  }); ctx.restore();
}
/** The DAY title card: blurred scene behind (done by the caller's grade), big pixel text with a soft shadow. */
export function dayCard(ctx, text, { W = 1280, H = 720 } = {}) {
  ctx.save(); ctx.fillStyle = 'rgba(255,240,225,.18)'; ctx.fillRect(0, 0, W, H);
  ctx.font = '120px Minecraft, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(60,40,40,.35)'; ctx.fillText(text, W / 2 + 6, H / 2 + 8); ctx.fillStyle = '#ffffff'; ctx.fillText(text, W / 2, H / 2); ctx.restore();
}
/** A map pin: a player head (drawn by `face`) in a white frame with a label underneath. */
export function mapPin(ctx, xy, label, face, { size = 46, sub } = {}) {
  if (!xy) return; const [x, y] = xy; ctx.save();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x - size / 2 - 3, y - size - 3, size + 6, size + 6); face(ctx, x - size / 2, y - size, size);
  ctx.beginPath(); ctx.moveTo(x - 7, y + 3); ctx.lineTo(x + 7, y + 3); ctx.lineTo(x, y + 13); ctx.fillStyle = '#e04646'; ctx.fill();
  ctx.font = '16px Minecraft, monospace'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(label, x, y + 32); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + 32);
  if (sub) { ctx.font = '13px Minecraft, monospace'; ctx.strokeText(sub, x, y + 49); ctx.fillStyle = '#ffe28a'; ctx.fillText(sub, x, y + 49); }
  ctx.restore();
}
export function recording(ctx) {
  ctx.save(); ctx.fillStyle = '#e02424'; ctx.beginPath(); ctx.arc(22, 22, 7, 0, Math.PI * 2); ctx.fill();
  ctx.font = '13px Minecraft, monospace'; ctx.fillStyle = '#fff'; ctx.fillText('RECORDING', 36, 27); ctx.restore();
}
/** A player-view HUD strip: hotbar and a chat log, for the RECORDING point-of-view clips. */
export function hud(ctx, chat = [], { W = 1280, H = 720 } = {}) {
  ctx.save(); const x0 = W / 2 - 182; ctx.fillStyle = 'rgba(20,20,20,.55)'; ctx.fillRect(x0, H - 46, 364, 40);
  for (let i = 0; i < 9; i++) { ctx.strokeStyle = i === 0 ? '#ffffff' : 'rgba(160,160,160,.8)'; ctx.lineWidth = i === 0 ? 3 : 2; ctx.strokeRect(x0 + 2 + i * 40, H - 44, 40, 36); }
  ctx.font = '15px Minecraft, monospace'; chat.forEach((line, i) => { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(8, H - 150 + i * 20, ctx.measureText(line).width + 10, 20); ctx.fillStyle = '#fff'; ctx.fillText(line, 13, H - 135 + i * 20); });
  ctx.restore();
}
/** The server-wide red/purple announcement banner. */
export function banner(ctx, text, sub, { W = 1280, color = '#ff4b6e' } = {}) {
  ctx.save(); ctx.textAlign = 'center'; ctx.font = '54px Minecraft, monospace'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,0,20,.75)';
  ctx.strokeText(text, W / 2, 200); ctx.fillStyle = color; ctx.fillText(text, W / 2, 200);
  if (sub) { ctx.font = '26px Minecraft, monospace'; ctx.lineWidth = 6; ctx.strokeText(sub, W / 2, 246); ctx.fillStyle = '#ffffff'; ctx.fillText(sub, W / 2, 246); }
  ctx.restore();
}
/** Live broadcast frame: a LIVE bug and a viewer count, as if on every player's feed. */
export function broadcast(ctx, title, { W = 1280 } = {}) {
  ctx.save(); ctx.fillStyle = '#d61f2c'; ctx.fillRect(24, 22, 74, 30); ctx.font = '18px Minecraft, monospace'; ctx.fillStyle = '#fff'; ctx.fillText('LIVE', 38, 44);
  ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(98, 22, 128, 30); ctx.fillStyle = '#fff'; ctx.fillText('👁 1,500', 110, 44);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(24, 60, ctx.measureText(title).width + 24, 28); ctx.fillStyle = '#ffd36b'; ctx.fillText(title, 36, 80); ctx.restore();
}
export function letterbox(ctx, { W = 1280, H = 720, bar = 22 } = {}) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar); }
