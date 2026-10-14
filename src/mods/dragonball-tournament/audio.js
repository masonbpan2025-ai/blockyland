// Synthesized sounds owned by this world, attached only while it is loaded.
export const sounds = {
  playHostSpeak() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Mic chime
    const notes = [440, 554.37, 659.25]; // A4, C#5, E5
    notes.forEach((freq, idx) => {
      const start = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.2, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  },
  playVictoryFanfare() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Triumphant motif: C4, E4, G4, C5, high G5, high C6 chord
    const sequence = [
      { f: 261.63, t: 0.0, d: 0.15 },
      { f: 329.63, t: 0.15, d: 0.15 },
      { f: 392.00, t: 0.30, d: 0.15 },
      { f: 523.25, t: 0.45, d: 0.35 },
      { f: 392.00, t: 0.85, d: 0.18 },
      { f: 523.25, t: 1.05, d: 0.65 },
      { f: 659.25, t: 1.05, d: 0.65 },
      { f: 783.99, t: 1.05, d: 0.85 },
      { f: 1046.50, t: 1.05, d: 1.0 }
    ];

    sequence.forEach(item => {
      const start = now + item.t;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(item.f, start);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, start);

      g.gain.setValueAtTime(0.28, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + item.d);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      osc.start(start);
      osc.stop(start + item.d);
    });
  },
  playKiCharge(isGenkiDama = false) {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const baseFreq = isGenkiDama ? 280 : 160;
    const targetFreq = isGenkiDama ? 880 : 420;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = isGenkiDama ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(targetFreq, now + 0.4);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq * 2, now);
    filter.frequency.linearRampToValueAtTime(targetFreq * 2, now + 0.4);
    filter.Q.setValueAtTime(4.0, now);

    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);

    osc.start();
    osc.stop(now + 0.45);
  },
  playKamehameha() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. High energy beam screech
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(620, now);
    osc1.frequency.exponentialRampToValueAtTime(140, now + 0.7);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, now);
    filter.frequency.linearRampToValueAtTime(500, now + 0.7);

    g1.gain.setValueAtTime(0.38, now);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    osc1.connect(filter);
    filter.connect(g1);
    g1.connect(this.masterGain);
    osc1.start();
    osc1.stop(now + 0.75);

    // 2. Heavy sub rumble
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(130, now);
    osc2.frequency.linearRampToValueAtTime(42, now + 0.85);

    g2.gain.setValueAtTime(0.45, now);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    osc2.connect(g2);
    g2.connect(this.masterGain);
    osc2.start();
    osc2.stop(now + 0.85);

    // 3. Energy plasma hiss
    this.noiseBurst(0.65, 1200, 2.0, 0.4);
  },
  playGenkiDamaLaunch() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(650, now + 0.45);

    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.5);
  },
  playGenkiDamaExplosion() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Massive sub-bass boom
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(25, now + 1.2);

    g.gain.setValueAtTime(0.65, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 1.2);

    // Roaring shockwave noise
    this.noiseBurst(1.1, 800, 1.2, 0.55);
    setTimeout(() => {
      if (this.ctx) this.noiseBurst(0.7, 1400, 2.5, 0.35);
    }, 180);
  },
  playKiBreak() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);

    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.25);

    this.noiseBurst(0.3, 2400, 3.0, 0.35);
  },
  playPunch() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.12);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.12);

    this.noiseBurst(0.09, 1100, 1.5, 0.25);
  },
  playRoll() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(320, now + 0.15);
    osc.frequency.linearRampToValueAtTime(120, now + 0.32);

    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.35);

    this.noiseBurst(0.28, 1600, 2.0, 0.22);
  }
};
export function registerSounds(api, game) {
  if (game?.sounds) api.extend(game.sounds, Object.fromEntries(Object.entries(sounds).map(([key, fn]) => [key, fn.bind(game.sounds)])));
}
