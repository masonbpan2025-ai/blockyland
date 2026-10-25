// This player's skin, as the other players in a shared world receive it: a 64x64 PNG data URL and the arm model.
//
// The skin a player wears may be a generated one (a data URL), an imported file (a `blob:` URL, which only this
// browser can open), a legacy 64x32 skin or an HD one. Whatever it is, it is redrawn here as a 64x64 PNG, which every
// other browser can show and the host can check (shareProtocol.js sanitizeSkin).
import { convert64x32to64x64Canvas } from '../skinManager.js';
import { MAX_SKIN_CHARS } from './shareProtocol.js';

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('the skin image could not be read'));
  img.src = url;
});

/**
 * @param {{dataUrl?: string, model?: string}|null} skin the skin manager's equipped skin
 * @returns {Promise<{png: string, model: 'default'|'slim'}|null>} null when there is no image to share
 */
export async function shareableSkin(skin) {
  if (!skin?.dataUrl || typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const img = await loadImage(skin.dataUrl);
  let canvas;
  if (img.width === 64 && img.height === 32) {
    canvas = convert64x32to64x64Canvas(img);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // An HD skin (128x128, 256x256) comes down to the standard size; a legacy-shaped HD skin keeps its 2:1 layout.
    ctx.drawImage(img, 0, 0, 64, img.width === img.height * 2 ? 32 : 64);
  }
  const png = canvas?.toDataURL('image/png');
  if (!png || png.length > MAX_SKIN_CHARS) return null;
  return { png, model: skin.model === 'slim' ? 'slim' : 'default' };
}
