export const AudioEngine = {
  ctx: null as AudioContext | null,
  musicGain: null as GainNode | null,
  musicFilter: null as BiquadFilterNode | null,
  musicLfo: null as OscillatorNode | null,
  musicLfoGain: null as GainNode | null,
  musicOscA: null as OscillatorNode | null,
  musicOscB: null as OscillatorNode | null,
  musicStarted: false,
  musicBaseGain: 0.016,
  musicMaxGain: 0.065,
  musicBaseLfoHz: 0.08,
  musicTrackEl: null as HTMLAudioElement | null,
  musicTrackReady: false,
  roomToneEl: null as HTMLAudioElement | null,
  playerBreathEl: null as HTMLAudioElement | null,
  endingAudioEl: null as HTMLAudioElement | null,
  lastJinnLaughAt: 0,
  dangerTickTimer: null as number | null,
  dangerTickTension: 0,
  dangerTickBaseGain: 0.006,
  dangerTickMaxGain: 0.035,
  dangerTickRateMinHz: 1.2,
  dangerTickRateMaxHz: 12,
  
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }
  },

  playExternalOneShot(path: string, volume: number, playbackRate = 1) {
    const clip = new Audio(path);
    clip.preload = "auto";
    clip.volume = Math.max(0, Math.min(1, volume));
    clip.playbackRate = Math.max(0.5, Math.min(2, playbackRate));
    void clip.play().catch(() => {
      // If the file is missing or autoplay is blocked, stay silent.
    });
  },

  audioUrl(fileName: string) {
    return `/zones/${encodeURIComponent(fileName)}`;
  },

  ensureRoomToneLoop() {
    if (this.roomToneEl) return;
    const tone = new Audio(this.audioUrl("background audio 2.mp3"));
    tone.loop = true;
    tone.preload = "auto";
    tone.volume = 0.06;
    this.roomToneEl = tone;
  },

  updateRoomTone(tension: number) {
    this.ensureRoomToneLoop();
    const t = Math.max(0, Math.min(1, tension));
    if (!this.roomToneEl) return;
    this.roomToneEl.volume = Math.max(0.04, Math.min(0.26, 0.06 + t * 0.2));
    this.roomToneEl.playbackRate = Math.max(0.92, Math.min(1.2, 0.94 + t * 0.24));
    if (this.roomToneEl.paused) {
      void this.roomToneEl.play().catch(() => {
        // Optional external file may be missing.
      });
    }
  },

  ensurePlayerBreathLoop() {
    if (this.playerBreathEl) return;
    const breath = new Audio(this.audioUrl("breath.mp3"));
    breath.loop = true;
    breath.preload = "auto";
    breath.volume = 0.05;
    this.playerBreathEl = breath;
  },

  updatePlayerBreathing(tension: number) {
    const t = Math.max(0, Math.min(1, tension));
    this.ensurePlayerBreathLoop();
    if (!this.playerBreathEl) return;
    if (t < 0.48) {
      if (!this.playerBreathEl.paused) {
        this.playerBreathEl.pause();
        this.playerBreathEl.currentTime = 0;
      }
      return;
    }
    const near = (t - 0.48) / 0.52;
    this.playerBreathEl.volume = Math.max(0.04, Math.min(0.35, 0.06 + near * 0.29));
    this.playerBreathEl.playbackRate = Math.max(0.9, Math.min(1.35, 0.95 + near * 0.35));
    if (this.playerBreathEl.paused) {
      void this.playerBreathEl.play().catch(() => {
        // Optional external file may be missing.
      });
    }
  },

  playJinnLaugh(intensity: number) {
    const now = performance.now();
    if (now - this.lastJinnLaughAt < 8000) return;
    this.lastJinnLaughAt = now;
    const t = Math.max(0, Math.min(1, intensity));
    this.playExternalOneShot(this.audioUrl("ghost sound.mp3"), 0.16 + t * 0.28, 0.9 + t * 0.22);
  },

  playPlayerScream(intensity: number) {
    const t = Math.max(0, Math.min(1, intensity));
    this.playExternalOneShot(this.audioUrl("girl scream or player scream.mp3"), 0.2 + t * 0.45, 0.95 + t * 0.12);
  },

  playEndingScreenAudio(isLoss: boolean) {
    this.stopEndingScreenAudio();
    const clip = new Audio(this.audioUrl(isLoss ? "ghost sound 3 a bit long.mp3" : "background audio 2.mp3"));
    clip.preload = "auto";
    clip.loop = !isLoss;
    clip.volume = isLoss ? 0.22 : 0.12;
    clip.playbackRate = isLoss ? 0.95 : 1;
    this.endingAudioEl = clip;
    void clip.play().catch(() => {
      // Optional, in case autoplay or file loading is blocked.
    });
  },

  stopEndingScreenAudio() {
    if (!this.endingAudioEl) return;
    this.endingAudioEl.pause();
    this.endingAudioEl.currentTime = 0;
    this.endingAudioEl = null;
  },

  footstep() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, this.ctx.currentTime); // 80hz low thud
    osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  },

  doorRattle() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.8; // 0.8s
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
        // burst noise simulating rattle
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    // Bandpass filter for rattle freq
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 300; 
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.018, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    noise.start();
  },

  whisper() {
    if (!this.ctx) return;
    // Simple white noise with tremolo to simulate whispering
    const bufferSize = this.ctx.sampleRate * 2.0; 
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 1000;
    
    const tremolo = this.ctx.createOscillator();
    tremolo.type = "sine";
    tremolo.frequency.value = 5; 
    
    const tremoloGain = this.ctx.createGain();
    tremolo.connect(tremoloGain.gain);
    
    noise.connect(filter);
    filter.connect(tremoloGain);
    tremoloGain.connect(this.ctx.destination);
    
    tremolo.start();
    noise.start();
  },

  heartbeat() {
    const ctx = this.ctx;
    if (!ctx) return;
    const playThump = (time: number, freq: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.exponentialRampToValueAtTime(10, time + 0.15);
        gain.gain.setValueAtTime(vol * 2.5, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.15);
    };
    playThump(ctx.currentTime, 55, 1.0);
    playThump(ctx.currentTime + 0.22, 50, 0.7);
  },

  panicBreathing(intensity: number) {
    if (!this.ctx || intensity < 0.1) return;
    const ctx = this.ctx;
    const dur = 0.5 / (0.4 + intensity);

    const playBreath = (isIn: boolean) => {
      const noise = ctx.createBufferSource();
      const bufferSize = ctx.sampleRate * dur;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0; i<bufferSize; i++) data[i] = Math.random()*2-1;
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = isIn ? "lowpass" : "bandpass";
      filter.frequency.value = isIn ? 350 : 750;
      filter.Q.value = 2.5; // Added resonance for 'throaty' feel

      const gain = ctx.createGain();
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(intensity * 0.2, now + dur * 0.3);
      gain.gain.linearRampToValueAtTime(0, now + dur);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);
    };

    playBreath(true);
    setTimeout(() => playBreath(false), dur * 1000 + 40);
  },

  jinnGrowl(intensity: number) {
    if (!this.ctx || intensity < 0.15) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const dur = 0.8 + Math.random() * 0.4;

    const osc = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gainNode = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(45, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + dur);

    mod.type = "square";
    mod.frequency.setValueAtTime(30, now);
    modGain.gain.setValueAtTime(40, now);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, now);
    filter.Q.value = 10;

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(intensity * 0.4, now + dur * 0.2);
    gainNode.gain.linearRampToValueAtTime(0, now + dur);

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    mod.start(now);
    osc.stop(now + dur);
    mod.stop(now + dur);
  },

  adhanDistant() {
    if (!this.ctx) return; // Simple sine simulation for Adhan
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(466, this.ctx.currentTime + 1);
    osc.frequency.linearRampToValueAtTime(440, this.ctx.currentTime + 2);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime); // very distant
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 3);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 3);
  },

  jumpScare() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    
    osc.type = "square";
    osc.frequency.setValueAtTime(800, this.ctx.currentTime); // 800hz square
    
    gainNode.gain.setValueAtTime(2, this.ctx.currentTime); // instant loud
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.5); // fast decay
    
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.5);
  },

  ensureMusicTrack() {
    if (this.musicTrackEl) return;
    const track = new Audio(this.audioUrl("background audio.mp3"));
    track.loop = true;
    track.preload = "auto";
    track.volume = 0.18;
    track.addEventListener("canplaythrough", () => {
      this.musicTrackReady = true;
    });
    track.addEventListener("error", () => {
      this.musicTrackReady = false;
    });
    this.musicTrackEl = track;
  },

  playDangerTick(intensity: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.max(0, Math.min(1, intensity));
    const tick = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    tick.type = "square";
    tick.frequency.setValueAtTime(1900 + t * 1000, now);
    tick.frequency.exponentialRampToValueAtTime(1200 + t * 550, now + 0.03);

    filter.type = "highpass";
    filter.frequency.value = 1350;
    filter.Q.value = 1.1;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(this.dangerTickBaseGain + t * this.dangerTickMaxGain, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);

    tick.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    tick.start(now);
    tick.stop(now + 0.06);
  },

  startDangerTickLoop() {
    if (!this.ctx || !this.musicStarted) return;
    if (this.dangerTickTimer !== null) {
      window.clearTimeout(this.dangerTickTimer);
      this.dangerTickTimer = null;
    }

    const loop = () => {
      if (!this.musicStarted) return;
      const t = Math.max(0, Math.min(1, this.dangerTickTension));
      if (t > 0.62) {
        const nearT = (t - 0.62) / 0.38;
        this.playDangerTick(nearT);
      }
      const rateHz = this.dangerTickRateMinHz + t * (this.dangerTickRateMaxHz - this.dangerTickRateMinHz);
      const intervalMs = Math.max(70, 1000 / rateHz);
      this.dangerTickTimer = window.setTimeout(loop, intervalMs);
    };

    loop();
  },

  startHorrorMusic() {
    if (!this.ctx || this.musicStarted) return;
    const ctx = this.ctx;

    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    oscA.type = "sine";
    oscB.type = "triangle";
    oscA.frequency.value = 78;
    oscB.frequency.value = 117;
    oscB.detune.value = -4;

    filter.type = "lowpass";
    filter.frequency.value = 760;
    filter.Q.value = 0.9;

    gain.gain.value = 0.02;

    lfo.type = "sine";
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 28;

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    oscA.start();
    oscB.start();
    lfo.start();

    this.musicOscA = oscA;
    this.musicOscB = oscB;
    this.musicFilter = filter;
    this.musicGain = gain;
    this.musicLfo = lfo;
    this.musicLfoGain = lfoGain;
    this.musicStarted = true;
    this.dangerTickTension = 0;
    this.startDangerTickLoop();
    this.ensureMusicTrack();
    if (this.musicTrackEl) {
      this.musicTrackEl.volume = 0.16;
      this.musicTrackEl.playbackRate = 0.95;
      void this.musicTrackEl.play().catch(() => {
        // Ignore autoplay/file errors; synth bed continues as fallback.
      });
    }
  },

  configureHorrorMusic(profile: "easy" | "medium" | "hard" | "impossible") {
    if (profile === "easy") {
      this.musicBaseGain = 0.012;
      this.musicMaxGain = 0.05;
      this.musicBaseLfoHz = 0.07;
      this.dangerTickBaseGain = 0.005;
      this.dangerTickMaxGain = 0.02;
      this.dangerTickRateMinHz = 1;
      this.dangerTickRateMaxHz = 8;
    } else if (profile === "medium") {
      this.musicBaseGain = 0.016;
      this.musicMaxGain = 0.065;
      this.musicBaseLfoHz = 0.08;
      this.dangerTickBaseGain = 0.006;
      this.dangerTickMaxGain = 0.035;
      this.dangerTickRateMinHz = 1.2;
      this.dangerTickRateMaxHz = 12;
    } else if (profile === "hard") {
      this.musicBaseGain = 0.02;
      this.musicMaxGain = 0.075;
      this.musicBaseLfoHz = 0.095;
      this.dangerTickBaseGain = 0.008;
      this.dangerTickMaxGain = 0.046;
      this.dangerTickRateMinHz = 1.5;
      this.dangerTickRateMaxHz = 14;
    } else {
      this.musicBaseGain = 0.024;
      this.musicMaxGain = 0.082;
      this.musicBaseLfoHz = 0.11;
      this.dangerTickBaseGain = 0.01;
      this.dangerTickMaxGain = 0.056;
      this.dangerTickRateMinHz = 1.8;
      this.dangerTickRateMaxHz = 16;
    }
  },

  updateHorrorMusic(tension: number) {
    if (!this.ctx || !this.musicStarted || !this.musicGain || !this.musicFilter || !this.musicOscA || !this.musicOscB || !this.musicLfo) return;
    const ctx = this.ctx;
    const t = Math.max(0, Math.min(1, tension));
    const now = ctx.currentTime;
    this.dangerTickTension = t;

    const targetGain = this.musicBaseGain + t * this.musicMaxGain;
    const targetCutoff = 680 + t * 980;
    const targetLfoHz = this.musicBaseLfoHz + t * 0.24;
    const targetA = 72 + t * 16;
    const targetB = 108 + t * 21;

    this.musicGain.gain.setTargetAtTime(targetGain, now, 0.2);
    this.musicFilter.frequency.setTargetAtTime(targetCutoff, now, 0.2);
    this.musicLfo.frequency.setTargetAtTime(targetLfoHz, now, 0.2);
    this.musicOscA.frequency.setTargetAtTime(targetA, now, 0.18);
    this.musicOscB.frequency.setTargetAtTime(targetB, now, 0.18);

    if (this.musicTrackEl) {
      this.musicTrackEl.volume = Math.max(0.08, Math.min(0.34, 0.14 + t * 0.2));
      this.musicTrackEl.playbackRate = Math.max(0.9, Math.min(1.45, 0.94 + t * 0.44));
    }
    this.updateRoomTone(t);
    this.updatePlayerBreathing(t);
  },

  stopHorrorMusic() {
    if (!this.ctx || !this.musicStarted) return;
    const ctx = this.ctx;
    const stopAt = ctx.currentTime + 0.5;

    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    }

    this.musicOscA?.stop(stopAt);
    this.musicOscB?.stop(stopAt);
    this.musicLfo?.stop(stopAt);
    if (this.dangerTickTimer !== null) {
      window.clearTimeout(this.dangerTickTimer);
      this.dangerTickTimer = null;
    }
    if (this.musicTrackEl) {
      this.musicTrackEl.pause();
      this.musicTrackEl.currentTime = 0;
    }
    if (this.roomToneEl) {
      this.roomToneEl.pause();
      this.roomToneEl.currentTime = 0;
    }
    if (this.playerBreathEl) {
      this.playerBreathEl.pause();
      this.playerBreathEl.currentTime = 0;
    }
    this.stopEndingScreenAudio();

    this.musicOscA = null;
    this.musicOscB = null;
    this.musicLfo = null;
    this.musicLfoGain = null;
    this.musicFilter = null;
    this.musicGain = null;
    this.dangerTickTension = 0;
    this.musicStarted = false;
  },

  lightFailureBuzz(intensity: number) {
    if (!this.ctx) return;
    const t = Math.max(0.1, Math.min(1, intensity));
    this.playExternalOneShot(this.audioUrl("ghost sound 2.mp3"), 0.06 + t * 0.1, 0.95 + t * 0.08);
  },

  horrorSting(intensity: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.max(0.15, Math.min(1, intensity));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180 + t * 220, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.45);

    filter.type = "lowpass";
    filter.frequency.value = 1300;
    filter.Q.value = 5;

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.07 + t * 0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  },

  pakistaniHorrorMotif(intensity: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = Math.max(0.1, Math.min(1, intensity));

    const notes = [247, 294, 262]; // B3, D4, C4 for a haunting regional motif
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = i === 2 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq + t * 20, now + i * 0.19);

      filter.type = "bandpass";
      filter.frequency.value = 500 + i * 180;
      filter.Q.value = 2.5;

      gain.gain.setValueAtTime(0.0001, now + i * 0.19);
      gain.gain.linearRampToValueAtTime(0.012 + t * 0.025, now + i * 0.19 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.19 + 0.35);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.19);
      osc.stop(now + i * 0.19 + 0.38);
    });

    const dhol = ctx.createOscillator();
    const dholGain = ctx.createGain();
    dhol.type = "sine";
    dhol.frequency.setValueAtTime(85, now);
    dhol.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    dholGain.gain.setValueAtTime(0.0001, now);
    dholGain.gain.linearRampToValueAtTime(0.03 + t * 0.04, now + 0.01);
    dholGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    dhol.connect(dholGain);
    dholGain.connect(ctx.destination);
    dhol.start(now);
    dhol.stop(now + 0.22);
  }
};
