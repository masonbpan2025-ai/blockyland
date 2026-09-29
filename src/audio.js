// Web Audio API Procedural Sound Engine
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.soundEnabled = true;
    this.musicEnabled = true;
    this.nextMusicTime = 0;
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Helper: Create a short noise burst with bandpass filtering
  noiseBurst(duration, filterFreq, q = 1, gainVal = 0.3) {
    if (!this.soundEnabled || !this.ctx) return;
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);
    filter.Q.setValueAtTime(q, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start();
    noise.stop(this.ctx.currentTime + duration);
  }

  playStep(soundType = 'grass') {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (soundType === 'grass') {
      this.noiseBurst(0.08, 900 + Math.random() * 200, 1.2, 0.15);
    } else if (soundType === 'stone') {
      this.noiseBurst(0.06, 1800 + Math.random() * 300, 2.5, 0.25);
    } else if (soundType === 'wood') {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140 + Math.random() * 30, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      g.gain.setValueAtTime(0.3, now);
      g.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(now + 0.08);
    } else if (soundType === 'sand') {
      this.noiseBurst(0.1, 700 + Math.random() * 100, 0.8, 0.18);
    } else if (soundType === 'water') {
      this.noiseBurst(0.12, 1200, 1.5, 0.2);
    }
  }

  playDig(soundType = 'grass') {
    this.ensureContext();
    this.playStep(soundType);
  }

  playBreak(soundType = 'grass') {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Crunchy crackle burst
    this.noiseBurst(0.2, 1200 + Math.random() * 400, 1.2, 0.35);

    // Resonant block thud
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.15);
  }

  playPlace(soundType = 'wood') {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.1);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.1);

    this.noiseBurst(0.07, 1400, 2, 0.15);
  }

  playSplash() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Bubbling water splash noise burst
    this.noiseBurst(0.25, 1100 + Math.random() * 200, 1.8, 0.35);

    // Deep water displacement resonant drop
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.18);
  }

  playFall() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    this.noiseBurst(0.12, 500, 1.0, 0.25);
  }

  playHurt() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Classic player "Oof!" vowel formant
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.18);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, now);
    filter.Q.setValueAtTime(3.0, now);

    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.18);
  }

  playExplosion() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Sub-bass boom
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    g.gain.setValueAtTime(0.6, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.8);

    // Deep roar noise decay
    this.noiseBurst(0.9, 350, 0.7, 0.6);
  }

  playBowShoot() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(350, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.12);

    this.noiseBurst(0.08, 2200, 1.5, 0.2);
  }

  // Classic Villager "Hrmm?" sound with dual nasal vowel formant filters
  playVillager() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    // Intonation pitch curve: drops then lifts slightly at the end
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(150, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(175, now + 0.35);

    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(380, now);
    f1.Q.setValueAtTime(4, now);

    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(f1);
    f1.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.35);
  }

  playIronGolem() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Heavy metallic clang
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.25);

    this.noiseBurst(0.18, 2400, 4, 0.25);
  }

  playPillager() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, now);

    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.25);
  }

  playZombie() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(85, now);
    osc.frequency.linearRampToValueAtTime(70, now + 0.35);
    osc.frequency.linearRampToValueAtTime(60, now + 0.6);

    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(320, now);
    f.Q.setValueAtTime(3, now);

    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.6);
  }

  playClick() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.03);
  }

  playLevelUp() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const notes = [261.6, 329.6, 392.0, 523.3]; // C4, E4, G4, C5
    notes.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.1;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.25, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  playEat() {
    this.ensureContext();
    this.noiseBurst(0.08, 1600, 2, 0.2);
  }

  // --- Rain & Weather Audio ---
  startRainSound() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx || this.rainSource) return;

    try {
      // 2 seconds buffer of white/pink noise looped
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Pink noise filter approximation
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
      }

      this.rainSource = this.ctx.createBufferSource();
      this.rainSource.buffer = buffer;
      this.rainSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, this.ctx.currentTime);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
      this.rainGain.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 1.0);

      this.rainSource.connect(filter);
      filter.connect(this.rainGain);
      this.rainGain.connect(this.masterGain);

      this.rainSource.start();
    } catch (e) {
      console.warn('Failed to start rain sound:', e);
    }
  }

  stopRainSound() {
    if (!this.rainSource || !this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      this.rainGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
      const oldSource = this.rainSource;
      setTimeout(() => {
        try { oldSource.stop(); } catch (e) {}
      }, 900);
      this.rainSource = null;
      this.rainGain = null;
    } catch (e) {}
  }

  playThunder() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Thunder crack
    this.noiseBurst(0.3, 350, 0.8, 0.45);

    // Deep low-frequency rumble
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 2.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, now);
    filter.frequency.linearRampToValueAtTime(60, now + 2.2);

    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 2.4);
  }

  playMagic() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    freqs.forEach((freq, idx) => {
      const start = this.ctx.currentTime + idx * 0.06;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.18, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }
}

