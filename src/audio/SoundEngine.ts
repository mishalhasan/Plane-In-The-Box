/**
 * Procedural Web Audio synthesizer for mechanical music-box clicks/chimes,
 * lid pop-out spring & harp flourish, miniature turbofan Doppler flight whoosh,
 * and skywriting finale chord. Requires zero external audio files.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private jetSource: AudioBufferSourceNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private jetGain: GainNode | null = null;
  private smokeGain: GainNode | null = null;
  private turbineOsc: OscillatorNode | null = null;
  private turbineGain: GainNode | null = null;

  private muted = false;
  private noteIndex = 0;

  // Dreamy celestial music-box melody in D major / Lydian warmth
  private readonly melodyHz = [
    587.33, 739.99, 880.0, 1174.66, 1108.73, 880.0, 739.99, 659.25,
    587.33, 659.25, 739.99, 987.77, 880.0, 1174.66, 1318.51, 1479.98,
    1174.66, 987.77, 1174.66, 1479.98, 1760.0, 1479.98, 1661.22, 1760.0
  ];

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (!this.muted) {
      this.ensureContext();
    }
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
    return this.muted;
  }

  public unlock(): void {
    this.ensureContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.72;
        this.masterGain.connect(this.ctx.destination);

        // Warm subtle ambience delay for music-box chimes
        this.delayNode = this.ctx.createDelay(0.5);
        this.delayNode.delayTime.value = 0.21;
        this.delayFeedback = this.ctx.createGain();
        this.delayFeedback.gain.value = 0.24;

        const delayFilter = this.ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 2800;

        this.delayNode.connect(delayFilter);
        delayFilter.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        delayFilter.connect(this.masterGain);

        this.noiseBuffer = this.createPinkNoiseBuffer(this.ctx, 2.5);
        this.setupContinuousFlightNodes();
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.09;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  private setupContinuousFlightNodes(): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;

    // Jet airflow whoosh
    this.jetSource = this.ctx.createBufferSource();
    this.jetSource.buffer = this.noiseBuffer;
    this.jetSource.loop = true;

    this.jetFilter = this.ctx.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.frequency.value = 520;
    this.jetFilter.Q.value = 0.85;

    this.jetGain = this.ctx.createGain();
    this.jetGain.gain.value = 0;

    this.jetSource.connect(this.jetFilter);
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(this.masterGain);
    this.jetSource.start();

    // Airy skywriting hiss layer
    const smokeSource = this.ctx.createBufferSource();
    smokeSource.buffer = this.noiseBuffer;
    smokeSource.loop = true;

    const smokeFilter = this.ctx.createBiquadFilter();
    smokeFilter.type = 'highpass';
    smokeFilter.frequency.value = 1900;

    this.smokeGain = this.ctx.createGain();
    this.smokeGain.gain.value = 0;

    smokeSource.connect(smokeFilter);
    smokeFilter.connect(this.smokeGain);
    this.smokeGain.connect(this.masterGain);
    smokeSource.start();

    // Subtle miniature turbofan hum
    this.turbineOsc = this.ctx.createOscillator();
    this.turbineOsc.type = 'triangle';
    this.turbineOsc.frequency.value = 360;

    const turbineFilter = this.ctx.createBiquadFilter();
    turbineFilter.type = 'lowpass';
    turbineFilter.frequency.value = 800;

    this.turbineGain = this.ctx.createGain();
    this.turbineGain.gain.value = 0;

    this.turbineOsc.connect(turbineFilter);
    turbineFilter.connect(this.turbineGain);
    this.turbineGain.connect(this.masterGain);
    this.turbineOsc.start();
  }

  /**
   * Plays a crisp mechanical gear click + music-box bell note as the crank advances.
   */
  public triggerCrankStep(windProgress: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;

    // 1. Mechanical brass ratchet click
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = this.noiseBuffer;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 1650 + windProgress * 550;
    clickFilter.Q.value = 3.2;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.22, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    clickSrc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.masterGain);
    clickSrc.start(now);
    clickSrc.stop(now + 0.032);

    // 2. Music-box tine pluck every 2nd click for musical pacing
    if (this.noteIndex % 2 === 0) {
      const idx = Math.floor(this.noteIndex / 2) % this.melodyHz.length;
      const freq = this.melodyHz[idx] * (windProgress > 0.86 ? 1.0 : 1.0);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const overtone = ctx.createOscillator();
      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2.99, now);

      const tineGain = ctx.createGain();
      tineGain.gain.setValueAtTime(0.001, now);
      tineGain.gain.linearRampToValueAtTime(0.11, now + 0.005);
      tineGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.75);

      const overtoneGain = ctx.createGain();
      overtoneGain.gain.setValueAtTime(0.025, now);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.14);

      osc.connect(tineGain);
      overtone.connect(overtoneGain);
      overtoneGain.connect(tineGain);

      tineGain.connect(this.masterGain);
      if (this.delayNode) tineGain.connect(this.delayNode);

      osc.start(now);
      overtone.start(now);
      osc.stop(now + 0.78);
      overtone.stop(now + 0.18);
    }

    this.noteIndex++;
  }

  public triggerLatchSnap(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(3400, now + 0.045);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public triggerPopOut(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    // 1. Warm wooden cabinet pop resonance
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(135, now);
    thump.frequency.exponentialRampToValueAtTime(46, now + 0.24);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.32, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    thump.connect(thumpGain);
    thumpGain.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.3);

    // 2. Playful helical spring boing
    const spring = ctx.createOscillator();
    spring.type = 'sine';
    spring.frequency.setValueAtTime(180, now + 0.02);
    spring.frequency.exponentialRampToValueAtTime(460, now + 0.22);
    spring.frequency.linearRampToValueAtTime(390, now + 0.35);

    const springGain = ctx.createGain();
    springGain.gain.setValueAtTime(0.11, now + 0.02);
    springGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    spring.connect(springGain);
    springGain.connect(this.masterGain);
    spring.start(now + 0.02);
    spring.stop(now + 0.4);

    // 3. Shimmering harp glissando flourish
    const chord = [587.33, 739.99, 880.0, 1108.73, 1318.51, 1479.98, 1760.0];
    chord.forEach((freq, i) => {
      const t = now + 0.04 + i * 0.045;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 1.35);

      osc.connect(g);
      g.connect(this.masterGain!);
      if (this.delayNode) g.connect(this.delayNode);
      osc.start(t);
      osc.stop(t + 1.4);
    });
  }

  public updateFlightAudio(
    active: boolean,
    speed: number,
    distanceToCamera: number,
    emittingSmoke: boolean
  ): void {
    if (!this.ctx || !this.jetGain || !this.jetFilter || !this.turbineGain || !this.turbineOsc || !this.smokeGain) {
      return;
    }
    const now = this.ctx.currentTime;

    if (!active || this.muted) {
      this.jetGain.gain.setTargetAtTime(0, now, 0.12);
      this.turbineGain.gain.setTargetAtTime(0, now, 0.12);
      this.smokeGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const proximity = Math.min(1.6, Math.max(0.28, 11.5 / Math.max(4.0, distanceToCamera)));
    const normSpeed = Math.min(1.5, Math.max(0.4, speed / 7.5));

    this.jetFilter.frequency.setTargetAtTime(380 + normSpeed * 380 * proximity, now, 0.08);
    this.jetGain.gain.setTargetAtTime(0.075 * proximity * normSpeed, now, 0.08);

    this.turbineOsc.frequency.setTargetAtTime(310 + normSpeed * 145 * proximity, now, 0.08);
    this.turbineGain.gain.setTargetAtTime(0.016 * proximity, now, 0.1);

    this.smokeGain.gain.setTargetAtTime(emittingSmoke ? 0.032 : 0.0, now, 0.06);
  }

  public triggerFinaleChord(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;
    const now = ctx.currentTime;

    const notes = [293.66, 440.0, 587.33, 739.99, 880.0, 1108.73];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx < 2 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0005, now);
      g.gain.linearRampToValueAtTime(idx < 2 ? 0.045 : 0.035, now + 0.65);
      g.gain.exponentialRampToValueAtTime(0.0006, now + 3.8);

      osc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain!);
      if (this.delayNode) g.connect(this.delayNode);

      osc.start(now);
      osc.stop(now + 3.9);
    });
  }

  public resetMelody(): void {
    this.noteIndex = 0;
  }
}
