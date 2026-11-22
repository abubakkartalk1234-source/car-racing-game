// Procedural Web Audio API Supercar Sound Engine (Zero External Files)

export class SupercarAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscFund: OscillatorNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscHarm: OscillatorNode | null = null;

  private brakeGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private initialized = false;
  private muted = false;
  private currentGain = 0;

  public init(): void {
    if (this.initialized) {
      this.resume();
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.48;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Shared white noise buffer for tire screech, wind, and crash impacts
      const sampleRate = ctx.sampleRate;
      const noiseLen = sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLen, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;

      // Engine harmonic stack -> mild waveshaper -> lowpass filter -> gain -> master
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = Math.tanh(x * 2.4);
      }
      shaper.curve = curve;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 260;
      filter.Q.value = 3.2;
      this.engineFilter = filter;

      const engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      this.engineGain = engineGain;

      shaper.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);

      const oscFund = ctx.createOscillator();
      oscFund.type = 'sawtooth';
      oscFund.frequency.value = 52;
      const fundGain = ctx.createGain();
      fundGain.gain.value = 0.55;
      oscFund.connect(fundGain);
      fundGain.connect(shaper);

      const oscSub = ctx.createOscillator();
      oscSub.type = 'triangle';
      oscSub.frequency.value = 26;
      const subGain = ctx.createGain();
      subGain.gain.value = 0.65;
      oscSub.connect(subGain);
      subGain.connect(shaper);

      const oscHarm = ctx.createOscillator();
      oscHarm.type = 'sawtooth';
      oscHarm.frequency.value = 78;
      const harmGain = ctx.createGain();
      harmGain.gain.value = 0.35;
      oscHarm.connect(harmGain);
      harmGain.connect(shaper);

      oscFund.start();
      oscSub.start();
      oscHarm.start();

      this.oscFund = oscFund;
      this.oscSub = oscSub;
      this.oscHarm = oscHarm;

      // Tire brake screech noise path
      const brakeSource = ctx.createBufferSource();
      brakeSource.buffer = buffer;
      brakeSource.loop = true;
      const brakeFilter = ctx.createBiquadFilter();
      brakeFilter.type = 'bandpass';
      brakeFilter.frequency.value = 1450;
      brakeFilter.Q.value = 5.5;
      const brakeGain = ctx.createGain();
      brakeGain.gain.value = 0;
      brakeSource.connect(brakeFilter);
      brakeFilter.connect(brakeGain);
      brakeGain.connect(master);
      brakeSource.start();
      this.brakeGain = brakeGain;

      // High-speed aerodynamic wind rush
      const windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 520;
      const windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSource.start();
      this.windGain = windGain;

      this.initialized = true;
    } catch {
      // Gracefully ignore if Web Audio is blocked
    }
  }

  public resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.48, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public update(
    speedKmh: number,
    rpmRatio: number,
    isAccelerating: boolean,
    isBraking: boolean,
    active: boolean,
  ): void {
    if (!this.initialized || !this.ctx || !this.oscFund || !this.oscSub || !this.oscHarm || !this.engineFilter || !this.engineGain) {
      return;
    }

    const now = this.ctx.currentTime;

    if (!active) {
      this.currentGain += (0 - this.currentGain) * 0.12;
      this.engineGain.gain.setTargetAtTime(this.currentGain, now, 0.06);
      this.brakeGain?.gain.setTargetAtTime(0, now, 0.05);
      this.windGain?.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    // Engine frequency scales with simulated RPM (idle ~48Hz to redline ~195Hz)
    const clampedRpm = Math.max(0.12, Math.min(1.0, rpmRatio));
    const speedFactor = Math.min(1, speedKmh / 200);
    const baseFreq = 46 + clampedRpm * 138 + speedFactor * 24;

    this.oscFund.frequency.setTargetAtTime(baseFreq, now, 0.035);
    this.oscSub.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.035);
    this.oscHarm.frequency.setTargetAtTime(baseFreq * 1.505, now, 0.035);

    const filterCutoff = 220 + clampedRpm * 1650 + (isAccelerating ? 520 : 0);
    this.engineFilter.frequency.setTargetAtTime(filterCutoff, now, 0.04);

    const targetEngineGain = isAccelerating ? 0.34 : 0.16 + speedFactor * 0.08;
    this.currentGain += (targetEngineGain - this.currentGain) * 0.18;
    this.engineGain.gain.setTargetAtTime(this.currentGain, now, 0.04);

    // Tire screech when braking hard above 30 km/h
    if (this.brakeGain) {
      const screech = isBraking && speedKmh > 30 ? Math.min(0.18, ((speedKmh - 30) / 170) * 0.18) : 0;
      this.brakeGain.gain.setTargetAtTime(screech, now, 0.04);
    }

    // Aerodynamic wind above 85 km/h
    if (this.windGain) {
      const wind = speedKmh > 85 ? Math.min(0.16, ((speedKmh - 85) / 115) * 0.16) : 0;
      this.windGain.gain.setTargetAtTime(wind, now, 0.08);
    }
  }

  public playCrash(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const now = this.ctx.currentTime;

    // Sub impact thud
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.38);

    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.85, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.45);

    // Metallic crunch burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.5);
    filter.Q.value = 1.2;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.75, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + 0.56);
  }

  public playNearMiss(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.11);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playStartChime(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [440, 659.25];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.22);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.24);
    });
  }

  public playVictory(): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.24, now + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.45);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.46);
    });
  }

  public dispose(): void {
    try {
      this.oscFund?.stop();
      this.oscSub?.stop();
      this.oscHarm?.stop();
      if (this.ctx && this.ctx.state !== 'closed') {
        void this.ctx.close();
      }
    } catch {
      // Ignore cleanup errors
    }
    this.initialized = false;
  }
}
