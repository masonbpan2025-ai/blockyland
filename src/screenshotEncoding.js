/**
 * The player's view as a small JPEG, for an AI app (Agent Control's screenshot tool and the view sent with a request).
 * Images are a hint, not the main context, so the long edge is capped and the quality kept moderate.
 * @returns {{mimeType: 'image/jpeg', base64: string}|null}
 */
export function encodeScreenshotDataUrl(canvas, { maxWidth = 1024, quality = 0.72 } = {}) {
  if (!canvas || typeof canvas.width !== 'number' || canvas.width <= 0) return null;

  const scale = Math.min(1, maxWidth / canvas.width);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  let dataUrl;

  if (typeof document !== 'undefined' && document.createElement) {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const ctx = target.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, width, height);
    dataUrl = target.toDataURL('image/jpeg', quality);
  } else if (typeof canvas.toDataURL === 'function') {
    // Headless/test path: use the canvas as-is.
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  } else {
    return null;
  }

  const base64 = String(dataUrl).split(',')[1];
  if (!base64) return null;
  return { mimeType: 'image/jpeg', base64 };
}
