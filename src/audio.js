// Web Audio API Procedural Sound Engine
export class SoundEngine {
  /** Declarative game presentation sound through the shared engine audio context. */
  playTone(frequency, duration=.09) {
    if(!Number.isFinite(frequency)||frequency<=0||!Number.isFinite(duration))return;
    this.ensureContext();if(!this.soundEnabled||!this.ctx)return;
    const time=this.ctx.currentTime,oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain();
    oscillator.type='triangle';oscillator.frequency.value=Math.min(12000,frequency);
    gain.gain.setValueAtTime(.08,time);gain.gain.exponentialRampToValueAtTime(.001,time+Math.max(.01,Math.min(2,duration)));
    oscillator.connect(gain);gain.connect(this.masterGain);oscillator.start(time);oscillator.stop(time+Math.max(.02,Math.min(2,duration)));
  }
  playDonkey(kind='ambient',baby=false) {
    this.ensureContext();if(!this.ctx||!this.soundEnabled)return;
    const t=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    const pitch=(baby?1.5:1)*(kind==='death'?95:150);
    osc.type='sawtooth';osc.frequency.setValueAtTime(pitch,t);osc.frequency.linearRampToValueAtTime(pitch*1.8,t+.15);osc.frequency.linearRampToValueAtTime(pitch*.7,t+.4);
    gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(kind==='chest'?.04:.07,t+.05);gain.gain.exponentialRampToValueAtTime(.001,t+.45);
    osc.connect(gain);gain.connect(this.masterGain);osc.start(t);osc.stop(t+.46);
  }
  playWitherSkeleton(kind='idle') {
    if(!this.ctx || !this.soundEnabled)return;
    const oscillator=this.ctx.createOscillator(),gain=this.ctx.createGain(),time=this.ctx.currentTime;
    oscillator.type='triangle';oscillator.frequency.setValueAtTime(kind==='death'?95:kind==='hurt'?140:180,time);
    oscillator.frequency.exponentialRampToValueAtTime(45,time+.18);
    gain.gain.setValueAtTime(.09,time);gain.gain.exponentialRampToValueAtTime(.001,time+.2);
    oscillator.connect(gain);gain.connect(this.masterGain || this.ctx.destination);oscillator.start(time);oscillator.stop(time+.21);
  }
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

  playDoor(open = true, isIron = false) {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    if (isIron) {
      // Metallic clank and scrape
      this.noiseBurst(0.12, open ? 3200 : 2600, 4.0, 0.28);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(open ? 480 : 360, now);
      osc.frequency.exponentialRampToValueAtTime(open ? 240 : 180, now + 0.12);
      g.gain.setValueAtTime(0.25, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(now + 0.12);
    } else {
      // Wood creak and latch thud
      this.noiseBurst(0.09, open ? 1200 : 900, 1.8, 0.22);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(open ? 180 : 140, now);
      osc.frequency.exponentialRampToValueAtTime(open ? 120 : 90, now + 0.1);
      g.gain.setValueAtTime(0.2, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start();
      osc.stop(now + 0.1);
    }
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

  playDragonRoar() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(75, now + 0.6);
    osc.frequency.linearRampToValueAtTime(40, now + 1.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.linearRampToValueAtTime(850, now + 0.35);
    filter.frequency.linearRampToValueAtTime(180, now + 1.2);

    g.gain.setValueAtTime(0.55, now);
    g.gain.exponentialRampToValueAtTime(0.005, now + 1.2);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 1.2);

    this.noiseBurst(1.1, 260, 1.2, 0.5);
  }

  playDragonFlap() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    this.noiseBurst(0.22, 160, 0.8, 0.3);
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

  playCow() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(130, now + 0.2);
    osc.frequency.linearRampToValueAtTime(90, now + 0.55);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.55);
  }

  playSheep() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(200, now + 0.4);
    // Vibrato
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(12, now);
    lfoGain.gain.setValueAtTime(15, now);
    lfo.connect(osc.frequency);
    lfo.start(); lfo.stop(now + 0.4);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.4);
  }

  playChicken() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.12);
  }

  playPig() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.linearRampToValueAtTime(130, now + 0.18);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.18);
  }

  playStrider(kind = 'idle') {
    this.ensureContext();if(!this.soundEnabled||!this.ctx)return;
    const now=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(kind==='retreat'?340:180,now);
    osc.frequency.exponentialRampToValueAtTime(kind==='retreat'?160:90,now+.35);
    gain.gain.setValueAtTime(.12,now);gain.gain.exponentialRampToValueAtTime(.001,now+.4);
    osc.connect(gain);gain.connect(this.masterGain);osc.start();osc.stop(now+.4);
  }

  playHorse() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.linearRampToValueAtTime(520, now + 0.25);
    osc.frequency.linearRampToValueAtTime(340, now + 0.6);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.6);
  }

  playWolf() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.15);
  }

  playCat() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.linearRampToValueAtTime(650, now + 0.18);
    osc.frequency.linearRampToValueAtTime(380, now + 0.45);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.45);
  }

  playGhast() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 0.7);
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.7);
  }

  playBlaze() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    this.noiseBurst(0.3, 1200, 3, 0.25);
  }

  playWitch() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.15);
    osc.frequency.linearRampToValueAtTime(550, now + 0.3);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.35);
  }

  playGuardian() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(750, now + 0.5);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.5);
  }

  playPhantom() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(750, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.4);
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.4);
  }

  playRaidHorn() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(145, now + 1.2);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(450, now);
    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.4, now + 0.3);
    g.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    osc.connect(f); f.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 1.5);
  }

  playWardenHeartbeat() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.2);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.2);
  }

  playWardenShriek() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(1400, now + 0.4);
    osc.frequency.exponentialRampToValueAtTime(300, now + 1.0);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 1.0);
  }

  playWardenSonicBoom() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.8);
    g.gain.setValueAtTime(0.5, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.8);
    this.noiseBurst(0.5, 400, 2, 0.4);
  }

  playWitherShoot() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.35);
  }

  playWitherSpawn() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 2.0);
    g.gain.setValueAtTime(0.05, now);
    g.gain.linearRampToValueAtTime(0.45, now + 2.0);
    g.gain.exponentialRampToValueAtTime(0.01, now + 2.4);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 2.4);
  }

  playShears() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    this.noiseBurst(0.04, 3000, 5, 0.25);
    setTimeout(() => this.noiseBurst(0.04, 2800, 5, 0.22), 80);
  }

  playMilk() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.15);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.connect(g); g.connect(this.masterGain);
    osc.start(); osc.stop(now + 0.15);
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

  playPop() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.07);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.07);
  }

  playBedBounce() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.2);
  }

  playSleep() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.4);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.5);
  }

  playFurnaceCrackle() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400 + Math.random() * 600;
    filter.Q.value = 2.5;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
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

  setRainVolume(volume) {
    if(this.rainGain&&this.ctx)this.rainGain.gain.setTargetAtTime(Math.max(.001,.18*volume),this.ctx.currentTime,.15);
  }

  playEndFlash() {
    this.ensureContext();
    if(!this.soundEnabled||!this.ctx)return;
    this.noiseBurst(.6,220,.2,.25);
    const now=this.ctx.currentTime,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(180,now);osc.frequency.exponentialRampToValueAtTime(45,now+.8);
    gain.gain.setValueAtTime(.16,now);gain.gain.exponentialRampToValueAtTime(.001,now+1.2);
    osc.connect(gain);gain.connect(this.masterGain);osc.start(now);osc.stop(now+1.2);
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

  // Enderman teleport warp sound
  playEndermanTeleport() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.35);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, now);
    filter.Q.setValueAtTime(4.0, now);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.35);

    this.noiseBurst(0.2, 1200, 3, 0.2);
  }

  // Enderman growl / hurt sound
  playEndermanHurt() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(85, now + 0.25);

    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(450, now);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(f);
    f.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.25);
  }

  // Tournament Host microphone speak sound


  // Firework rocket launch sound (rising whistling whoosh)
  playFireworkLaunch() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.6);
    g.gain.setValueAtTime(0.05, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.6);

    this.noiseBurst(0.5, 900, 1.0, 0.15);
  }

  // Firework burst / explosion sound (deep crackle & blast)
  playFireworkExplode() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Deep blast
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.4);

    // Crackling sparkles
    this.noiseBurst(0.45, 1600, 1.5, 0.4);
    setTimeout(() => {
      if (this.ctx) this.noiseBurst(0.25, 2200, 2.5, 0.25);
    }, 120);
  }

  // Grand Victory Fanfare for World Martial Arts Champion


  // Ki Gathering Charge Sound (electric hum and rising resonance)


  // Kamehameha firing sound (massive laser beam roar and sub-bass rumble)


  // Genki Dama throw sound


  // Genki Dama colossal bomb explosion sound


  // Ki Charge Interrupted / Counter-Hit snap sound


  // Melee Punch Swoosh & Impact


  // Minecraft Dungeons Dodge Roll Whoosh


  // Minecraft Chest Open (creaking wooden lid opening)
  playChestOpen() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.26);

    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.3);

    this.noiseBurst(0.22, 950, 2.5, 0.16);
  }

  // Minecraft Chest Close (solid wooden lid snap/thump)
  playChestClose() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.14);

    this.noiseBurst(0.1, 750, 1.8, 0.24);
  }

  // Minecraft Shield Block (heavy wooden impact and metallic ring)
  playShieldBlock() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.16);

    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.18);

    this.noiseBurst(0.14, 1350, 2.2, 0.32);
  }

  // Minecraft Armor Equip (metallic/leather clink and buckle)
  playArmorEquip() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);

    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.1);

    this.noiseBurst(0.08, 2200, 1.8, 0.2);
  }

  // Minecraft Hoe Tilling (earthy scrape and crisp thud)
  playHoe() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Resonant dirt scrape
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260 + Math.random() * 40, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.14);

    this.noiseBurst(0.12, 1100 + Math.random() * 200, 1.5, 0.3);
  }

  // Minecraft Crop Planting (soft crisp rustle)
  playPlant() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400 + Math.random() * 80, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.09);

    this.noiseBurst(0.07, 2400 + Math.random() * 400, 2.0, 0.22);
  }

  // Minecraft Bone Meal Sparkle / Chime
  playBoneMeal() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 3 ascending magical twinkle frequencies
    const notes = [620, 880, 1175];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const noteStart = now + idx * 0.045;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteStart);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.08, noteStart + 0.12);

      g.gain.setValueAtTime(0.18, noteStart);
      g.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.14);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(noteStart);
      osc.stop(noteStart + 0.14);
    });

    this.noiseBurst(0.09, 3200, 3.0, 0.12);
  }

  // Minecraft Experience Orb Pickup Ding
  playXpPickup(pitchMultiplier = 1.0) {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    const baseFreq = (850 + Math.random() * 80) * Math.min(2.0, Math.max(0.6, pitchMultiplier));
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.05, now + 0.08);

    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.1);
  }

  // Minecraft Player Level Up Fanfare
  playLevelUp() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Harmonic fanfare notes: C5, E5, G5, C6
    const chord = [523.25, 659.25, 783.99, 1046.50];
    chord.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const noteStart = now + idx * 0.08;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteStart);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, noteStart + 0.35);

      g.gain.setValueAtTime(0.22, noteStart);
      g.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.4);

      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(noteStart);
      osc.stop(noteStart + 0.4);
    });
  }

  // Minecraft Enchanting Table Sound (ethereal magical sweep)
  playEnchant() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Mystic resonance
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.22);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.45);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.25);
    filter.Q.setValueAtTime(4.0, now);

    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);

    osc.start();
    osc.stop(now + 0.5);

    this.noiseBurst(0.18, 4200, 3.5, 0.2);
  }

  // --- Nether Portal Audio Effects ------------------------------------------

  playPortalIgnite() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Flint strike click
    this.noiseBurst(0.06, 3400, 3.0, 0.3);

    // Eerie dimensional ignition whoosh
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.35);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.7);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.7);
    filter.Q.setValueAtTime(3.5, now);

    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.35, now + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);

    osc.start();
    osc.stop(now + 0.75);
  }

  playPortalTravel() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Dimensional warp drone & frequency glide
    const freqs = [65.4, 98.0, 130.8, 196.0];
    freqs.forEach((baseFreq, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = i % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.5);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.7, now + 1.2);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(300 + i * 200, now);
      filter.frequency.exponentialRampToValueAtTime(800 + i * 400, now + 0.6);
      filter.frequency.exponentialRampToValueAtTime(200, now + 1.2);
      filter.Q.setValueAtTime(4.0, now);

      g.gain.setValueAtTime(0.02, now);
      g.gain.linearRampToValueAtTime(0.18, now + 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);

      osc.start();
      osc.stop(now + 1.3);
    });

    // Swirling ethereal wind burst
    this.noiseBurst(1.1, 850, 1.8, 0.25);
  }

  playPortalAmbience() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(75, now);
    osc.frequency.linearRampToValueAtTime(88, now + 0.5);
    osc.frequency.linearRampToValueAtTime(72, now + 1.0);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(280, now);
    filter.Q.setValueAtTime(2.0, now);

    g.gain.setValueAtTime(0.01, now);
    g.gain.linearRampToValueAtTime(0.12, now + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc.connect(filter);
    filter.connect(g);
    g.connect(this.masterGain);

    osc.start();
    osc.stop(now + 1.0);
  }

  playPortalBreak() {
    this.ensureContext();
    if (!this.soundEnabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    // High crystalline glass break
    this.noiseBurst(0.25, 2600, 2.5, 0.35);

    // Ethereal dissolving pitch
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.3);

    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(g);
    g.connect(this.masterGain);

    osc.start();
    osc.stop(now + 0.3);
  }
  playSquid(kind='idle',glow=false,baby=false) {
    this.ensureContext();if(!this.soundEnabled||!this.ctx)return;
    const now=this.ctx.currentTime,osc=this.ctx.createOscillator(),g=this.ctx.createGain();
    osc.type='sine';const pitch=(glow?270:135)*(baby?1.5:1);
    osc.frequency.setValueAtTime(pitch,now);osc.frequency.exponentialRampToValueAtTime(kind==='death'?pitch*.35:kind==='ink'?pitch*1.8:pitch*.7,now+.35);
    g.gain.setValueAtTime(.001,now);g.gain.linearRampToValueAtTime(glow?.06:.04,now+.05);g.gain.exponentialRampToValueAtTime(.001,now+.4);
    osc.connect(g);g.connect(this.masterGain);osc.start();osc.stop(now+.4);
    if(kind==='ink')this.noiseBurst(.2,glow?900:400,1,.08);
  }
}

