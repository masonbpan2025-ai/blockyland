// The browser half of trim drawing: put a trim onto the icon an <img> is showing.
//
// The painting is `applyTrimToImage` in `trimVisuals.js`, which works on a plain RGBA buffer and is what the tests
// run. This file only moves pixels between an <img> and a canvas, and remembers the result so an inventory that
// redraws on every click does not recompose the same icon each time.
import { trimOf } from './smithing.js';
import { applyTrimToImage, armourSlotOf, trimColorFor } from './trimVisuals.js';

const composed = new Map();   // key -> data URL, once finished
const pending = new Map();    // key -> Promise<string>, while the base icon loads

function iconKey(src, item, trim) {
  return [src, item.id, trim.pattern, trimColorFor(item.id, trim)].join('|');
}

function compose(src, item, trim) {
  return new Promise((resolve, reject) => {
    const base = new Image();
    base.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = base.naturalWidth;
        canvas.height = base.naturalHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(base, 0, 0);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyTrimToImage(image, item.id, trim);
        ctx.putImageData(image, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    base.onerror = () => reject(new Error(`icon failed to load: ${src}`));
    base.src = src;
  });
}

/**
 * Show an item's trim on the icon an <img> already has.
 *
 * Safe to call on any item: one with no trim, or that is not armour, is left exactly as it is. The image keeps
 * its original source until the composed icon is ready, so a slow load shows the untrimmed piece rather than a
 * blank. `data-trim-pattern` and `data-trim-material` are set at once so a test or the bot can read the trim off
 * the element without waiting on pixels, and `data-trimmed` is set to `true` once the icon itself shows it.
 */
export function decorateTrimIcon(img, item) {
  if (!img || !item || !armourSlotOf(item.id)) return;
  const trim = trimOf(item);
  if (!trim) return;
  const src = img.currentSrc || img.src;
  if (!src) return;
  const key = iconKey(src, item, trim);
  img.dataset.trimPattern = trim.pattern;
  img.dataset.trimMaterial = trim.material;
  img.dataset.trimKey = key;

  const done = composed.get(key);
  if (done) {
    img.src = done;
    img.dataset.trimmed = 'true';
    return;
  }
  let promise = pending.get(key);
  if (!promise) {
    promise = compose(src, item, trim).then((url) => {
      composed.set(key, url);
      pending.delete(key);
      return url;
    }, (error) => {
      pending.delete(key);
      throw error;
    });
    pending.set(key, promise);
  }
  promise.then((url) => {
    // The element may have been given another item while the icon composed.
    if (img.dataset.trimKey !== key) return;
    img.src = url;
    img.dataset.trimmed = 'true';
  }).catch(() => { /* the untrimmed icon stays, which is the honest fallback */ });
}
