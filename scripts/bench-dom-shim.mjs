/**
 * Headless DOM shim for running world/mesher code in Node.
 *
 * The real `three` package works in Node -- it only needs a minimal `document`/`window` for the
 * canvas that TextureManager creates and for a few texture calls. Stubbing three itself is
 * unnecessary and fragile, so this shims the DOM instead and imports the real library.
 *
 * Import this BEFORE importing any src/ module that touches three or the DOM:
 *
 *   import { installDomShim } from './bench-dom-shim.mjs';
 *   installDomShim();
 *   const { World } = await import('../src/world.js');
 */

function makeContext2D() {
  const base = {
    imageSmoothingEnabled: false,
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1,
    font: '10px sans-serif', lineWidth: 1, globalCompositeOperation: 'source-over',
    textAlign: 'left', textBaseline: 'alphabetic',
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // Any canvas method returns a benign value; getImageData needs a real buffer.
      if (prop === 'getImageData') {
        return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      }
      if (prop === 'createImageData') {
        return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h });
      }
      if (prop === 'measureText') return () => ({ width: 0 });
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function makeCanvas() {
  return {
    width: 0, height: 0, style: {}, nodeName: 'CANVAS',
    getContext: () => makeContext2D(),
    toDataURL: () => 'data:image/png;base64,',
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, appendChild() {},
  };
}

export function installDomShim() {
  if (globalThis.__DOM_SHIM_INSTALLED__) return;
  globalThis.__DOM_SHIM_INSTALLED__ = true;

  const noop = () => {};
  const makeElement = (tag) => {
    if (tag === 'canvas') return makeCanvas();
    return {
      nodeName: String(tag).toUpperCase(), style: { setProperty: noop }, dataset: {},
      children: [], innerHTML: '', textContent: '', width: 0, height: 0,
      appendChild() {}, removeChild() {}, remove() {}, setAttribute() {}, getAttribute() { return null; },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
      classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      querySelector() { return null; }, querySelectorAll() { return []; },
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 1920, height: 1080, top: 0, left: 0, right: 1920, bottom: 1080 }),
      focus: noop, blur: noop, click: noop, insertBefore() {}, cloneNode() { return makeElement(tag); },
    };
  };

  globalThis.document = {
    createElement: makeElement,
    createElementNS: (_ns, tag) => makeElement(tag),
    createTextNode: () => makeElement('text'),
    getElementById: () => null,
    getElementsByClassName: () => [],
    getElementsByTagName: () => [],
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop, removeEventListener: noop,
    body: makeElement('body'),
    head: makeElement('head'),
    documentElement: makeElement('html'),
    fonts: { ready: Promise.resolve(), add() {} },
    createDocumentFragment: () => makeElement('fragment'),
  };

  const listeners = new Map();
  globalThis.window = {
    innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener: noop,
    requestAnimationFrame: (fn) => setTimeout(() => fn(performance.now()), 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    location: { href: 'http://localhost/', search: '', hash: '', pathname: '/' },
    navigator: { userAgent: 'node', language: 'en', clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => null, setItem: noop, removeItem: noop, clear: noop },
    performance: globalThis.performance,
    alert: noop, confirm: () => false, prompt: () => null,
    dispatchEvent: noop,
  };
  globalThis.self = globalThis.window;

  // Node >= 21 defines some of these as getter-only globals (navigator especially), so a plain
  // assignment throws. Only fill in what is missing, and never fight an existing definition.
  const defineIfAbsent = (name, value) => {
    const existing = Object.getOwnPropertyDescriptor(globalThis, name);
    if (existing && (existing.get || existing.set)) return; // a getter we must not clobber
    if (existing && !existing.writable && !existing.configurable) return;
    try {
      Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
    } catch { /* non-configurable; leave the platform's own value in place */ }
  };

  defineIfAbsent('navigator', globalThis.window.navigator);
  defineIfAbsent('localStorage', globalThis.window.localStorage);
  defineIfAbsent('requestAnimationFrame', globalThis.window.requestAnimationFrame);
  defineIfAbsent('cancelAnimationFrame', globalThis.window.cancelAnimationFrame);
  defineIfAbsent('getComputedStyle', globalThis.window.getComputedStyle);

  globalThis.Image = class {
    constructor() { this.width = 16; this.height = 16; this.onload = null; this.onerror = null; }
    set src(_v) { if (this.onload) setTimeout(() => this.onload(), 0); }
    addEventListener() {}
  };
  globalThis.createImageBitmap = async () => ({ width: 16, height: 16, close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return makeContext2D(); }
  };
  globalThis.HTMLCanvasElement = class {};
  globalThis.HTMLElement = class {};
  globalThis.AudioContext = class {
    constructor() { this.state = 'running'; this.destination = {}; this.currentTime = 0; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createOscillator() { return { frequency: { value: 440 }, connect() {}, start() {}, stop() {}, type: 'sine' }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(1) }; }
    decodeAudioData() { return Promise.resolve({}); }
    resume() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  };
  globalThis.webkitAudioContext = globalThis.AudioContext;
}
