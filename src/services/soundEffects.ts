/**
 * High-fidelity synthesized audio feedback for camera interactions
 * using Web Audio API (zero external asset dependencies).
 */

class SoundEffectsEngine {
  private static instance: SoundEffectsEngine;
  private ctx: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): SoundEffectsEngine {
    if (!SoundEffectsEngine.instance) {
      SoundEffectsEngine.instance = new SoundEffectsEngine();
    }
    return SoundEffectsEngine.instance;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Realistic mechanical shutter sound (curtain open + close click)
   */
  public playShutterSound() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. First Click: Curtain release click (filtered white noise + low punch)
      const bufferSize = ctx.sampleRate * 0.05;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2200, now);
      filter.Q.setValueAtTime(3, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.8, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      whiteNoise.start(now);

      // Low mechanical body thump
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.06);

      oscGain.gain.setValueAtTime(0.6, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);

      // 2. Second Click: Curtain close (after 45ms)
      const secondNow = now + 0.045;
      const secondNoise = ctx.createBufferSource();
      secondNoise.buffer = noiseBuffer;

      const secondFilter = ctx.createBiquadFilter();
      secondFilter.type = 'highpass';
      secondFilter.frequency.setValueAtTime(3200, secondNow);

      const secondGain = ctx.createGain();
      secondGain.gain.setValueAtTime(0.7, secondNow);
      secondGain.gain.exponentialRampToValueAtTime(0.01, secondNow + 0.035);

      secondNoise.connect(secondFilter);
      secondFilter.connect(secondGain);
      secondGain.connect(ctx.destination);
      secondNoise.start(secondNow);
    } catch (e) {
      console.warn('Audio shutter error:', e);
    }
  }

  /**
   * Focus lock confirmation beep (two subtle high tones)
   */
  public playFocusBeep() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, now);
      osc.frequency.setValueAtTime(2400, now + 0.04);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.setValueAtTime(0.15, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {}
  }

  /**
   * Timer countdown beep (short 1000Hz tick, or 2000Hz final cue)
   */
  public playTimerBeep(isFinal: boolean = false) {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isFinal ? 2400 : 1200, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + (isFinal ? 0.25 : 0.08));

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + (isFinal ? 0.25 : 0.08));
    } catch (e) {}
  }

  /**
   * Tactile tick when changing modes or adjusting dials
   */
  public playTick() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.015);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.015);
    } catch (e) {}
  }

  /**
   * Video Recording Start chime
   */
  public playVideoStart() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(900, now);
      osc.frequency.setValueAtTime(1400, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }

  /**
   * Video Recording Stop chime
   */
  public playVideoStop() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.setValueAtTime(900, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {}
  }
}

export const SoundEffects = SoundEffectsEngine.getInstance();
