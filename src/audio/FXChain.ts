import { BaseAudioContext, MasterPlugin, EQParams, CompressorParams, LimiterParams, MaximizerParams, ReverbParams, ExciterParams, VinylParams } from '../types';

export class FXChain {
  public input: GainNode;
  public output: GainNode;
  private ctx: BaseAudioContext;

  private eqNode: BiquadFilterNode[]; // Low, Mid, High
  private compNode: DynamicsCompressorNode;
  private limiterNode: DynamicsCompressorNode;

  // New DSP Nodes for expanded modules
  private maximizerNode: DynamicsCompressorNode;
  
  // Reverb path (Algorithmic feedback delay)
  private reverbDry: GainNode;
  private reverbWet: GainNode;
  private reverbDelay: DelayNode;
  private reverbFeedback: GainNode;
  private reverbFilter: BiquadFilterNode;

  // Exciter path (Highpass -> Waveshaper -> Wet mix)
  private exciterFilter: BiquadFilterNode;
  private exciterShaper: WaveShaperNode;
  private exciterWet: GainNode;

  // Vinyl path (Wow/flutter pitch modulation delay + bandpass vintage filter)
  private vinylDelay: DelayNode;
  private vinylLFO: OscillatorNode;
  private vinylLFOGain: GainNode;
  private vinylBandpass: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // 1. Create 3-band EQ
    const eqLow = ctx.createBiquadFilter();
    eqLow.type = 'lowshelf';
    eqLow.frequency.value = 100;
    eqLow.gain.value = 0;

    const eqMid = ctx.createBiquadFilter();
    eqMid.type = 'peaking';
    eqMid.frequency.value = 1000;
    eqMid.Q.value = 1.0;
    eqMid.gain.value = 0;

    const eqHigh = ctx.createBiquadFilter();
    eqHigh.type = 'highshelf';
    eqHigh.frequency.value = 8000;
    eqHigh.gain.value = 0;

    this.eqNode = [eqLow, eqMid, eqHigh];

    // 2. Compressor
    this.compNode = ctx.createDynamicsCompressor();
    this.compNode.threshold.value = -20;
    this.compNode.ratio.value = 4;
    this.compNode.attack.value = 0.01;
    this.compNode.release.value = 0.1;

    // 3. Limiter
    this.limiterNode = ctx.createDynamicsCompressor();
    this.limiterNode.threshold.value = -6;
    this.limiterNode.ratio.value = 20;
    this.limiterNode.attack.value = 0.003;
    this.limiterNode.release.value = 0.05;

    // 4. Maximizer (high ratio fast limiter)
    this.maximizerNode = ctx.createDynamicsCompressor();
    this.maximizerNode.threshold.value = -0.1;
    this.maximizerNode.ratio.value = 20;
    this.maximizerNode.attack.value = 0.001;
    this.maximizerNode.release.value = 0.05;

    // 5. Reverb (feedback delay network simulation)
    this.reverbDry = ctx.createGain();
    this.reverbWet = ctx.createGain();
    this.reverbDelay = ctx.createDelay(1.0);
    this.reverbFeedback = ctx.createGain();
    this.reverbFilter = ctx.createBiquadFilter();

    this.reverbDry.gain.value = 1.0;
    this.reverbWet.gain.value = 0.0;
    this.reverbDelay.delayTime.value = 0.15;
    this.reverbFeedback.gain.value = 0.5;
    this.reverbFilter.type = 'lowpass';
    this.reverbFilter.frequency.value = 2000;

    // 6. Exciter (highpass -> saturation shaper)
    this.exciterFilter = ctx.createBiquadFilter();
    this.exciterFilter.type = 'highpass';
    this.exciterFilter.frequency.value = 4000;

    this.exciterShaper = ctx.createWaveShaper();
    this.exciterShaper.curve = this.makeDistortionCurve(15);
    this.exciterShaper.oversample = '4x';

    this.exciterWet = ctx.createGain();
    this.exciterWet.gain.value = 0.0;

    // 7. Vinyl (vibrato wow delay & optional crackle low/high pass filter)
    this.vinylDelay = ctx.createDelay(0.1);
    this.vinylDelay.delayTime.value = 0.01; // 10ms base delay
    
    this.vinylLFO = ctx.createOscillator();
    this.vinylLFOGain = ctx.createGain();
    this.vinylLFO.type = 'sine';
    this.vinylLFO.frequency.value = 0.5; // 0.5 Hz default wow rate
    this.vinylLFOGain.gain.value = 0.0; // depth controlled dynamically

    this.vinylBandpass = ctx.createBiquadFilter();
    this.vinylBandpass.type = 'bandpass';
    this.vinylBandpass.frequency.value = 1000; // standard bandpass baseline
    this.vinylBandpass.Q.value = 0.1; // wide bandpass by default (inactive state)

    // Connections:
    // Input -> EQ -> Compressor -> Limiter -> Maximizer -> Vinyl Delay -> (Wet/Dry Paths) -> Output

    // Serial part:
    this.input.connect(eqLow);
    eqLow.connect(eqMid);
    eqMid.connect(eqHigh);
    eqHigh.connect(this.compNode);
    this.compNode.connect(this.limiterNode);
    this.limiterNode.connect(this.maximizerNode);
    this.maximizerNode.connect(this.vinylDelay);
    this.vinylDelay.connect(this.vinylBandpass);

    // Parallel Reverb Path:
    this.vinylBandpass.connect(this.reverbDry);
    this.reverbDry.connect(this.output);

    this.vinylBandpass.connect(this.reverbWet);
    this.reverbWet.connect(this.reverbDelay);
    this.reverbDelay.connect(this.reverbFilter);
    this.reverbFilter.connect(this.reverbFeedback);
    this.reverbFeedback.connect(this.reverbDelay); // feedback loop
    this.reverbFilter.connect(this.output); // wet output

    // Parallel Exciter Path:
    this.vinylBandpass.connect(this.exciterFilter);
    this.exciterFilter.connect(this.exciterShaper);
    this.exciterShaper.connect(this.exciterWet);
    this.exciterWet.connect(this.output);

    // Start Wow LFO
    this.vinylLFO.connect(this.vinylLFOGain);
    this.vinylLFOGain.connect(this.vinylDelay.delayTime);
    try {
      this.vinylLFO.start();
    } catch (e) {
      // already started or offline ctx
    }
  }

  private makeDistortionCurve(amount: number): Float32Array {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  public updateSettings(plugins: MasterPlugin[]): void {
    const now = this.ctx.currentTime;

    // Reset defaults first (bypass mode)
    this.eqNode[0].gain.setTargetAtTime(0, now, 0.01);
    this.eqNode[1].gain.setTargetAtTime(0, now, 0.01);
    this.eqNode[2].gain.setTargetAtTime(0, now, 0.01);

    this.compNode.threshold.setTargetAtTime(0, now, 0.01);
    this.compNode.ratio.setTargetAtTime(1, now, 0.01);

    this.limiterNode.threshold.setTargetAtTime(0, now, 0.01);
    this.limiterNode.ratio.setTargetAtTime(1, now, 0.01);

    this.maximizerNode.threshold.setTargetAtTime(0, now, 0.01);
    this.maximizerNode.ratio.setTargetAtTime(1, now, 0.01);

    this.reverbDry.gain.setTargetAtTime(1.0, now, 0.01);
    this.reverbWet.gain.setTargetAtTime(0.0, now, 0.01);

    this.exciterWet.gain.setTargetAtTime(0.0, now, 0.01);
    this.vinylLFOGain.gain.setTargetAtTime(0.0, now, 0.01);
    this.vinylBandpass.Q.value = 0.1; // wide open

    // Apply active plugins
    plugins.forEach((plugin) => {
      if (!plugin.enabled) return;

      const p = plugin.params;

      if (plugin.type === 'eq') {
        const eqParams = p as EQParams;
        this.eqNode[0].gain.setTargetAtTime(eqParams.low, now, 0.01);
        if (eqParams.lowFreq) this.eqNode[0].frequency.setTargetAtTime(eqParams.lowFreq, now, 0.01);

        this.eqNode[1].gain.setTargetAtTime(eqParams.mid, now, 0.01);

        this.eqNode[2].gain.setTargetAtTime(eqParams.high, now, 0.01);
        if (eqParams.highFreq) this.eqNode[2].frequency.setTargetAtTime(eqParams.highFreq, now, 0.01);

      } else if (plugin.type === 'compressor') {
        const compParams = p as CompressorParams;
        this.compNode.threshold.setTargetAtTime(compParams.threshold, now, 0.01);
        this.compNode.ratio.setTargetAtTime(compParams.ratio, now, 0.01);
        this.compNode.attack.setTargetAtTime(compParams.attack / 1000, now, 0.01);
        this.compNode.release.setTargetAtTime(compParams.release / 1000, now, 0.01);

      } else if (plugin.type === 'limiter') {
        const limiterParams = p as LimiterParams;
        this.limiterNode.threshold.setTargetAtTime(limiterParams.threshold, now, 0.01);
        this.limiterNode.ratio.setTargetAtTime(20, now, 0.01);
        this.limiterNode.release.setTargetAtTime(limiterParams.release / 1000, now, 0.01);

      } else if (plugin.type === 'maximizer') {
        const maxParams = p as MaximizerParams;
        this.maximizerNode.threshold.setTargetAtTime(maxParams.threshold, now, 0.01);
        this.maximizerNode.ratio.setTargetAtTime(20, now, 0.01);
        this.maximizerNode.release.setTargetAtTime(maxParams.release / 1000, now, 0.01);

      } else if (plugin.type === 'reverb') {
        const reverbParams = p as ReverbParams;
        const wetVal = reverbParams.wetDry;
        this.reverbDry.gain.setTargetAtTime(1.0 - wetVal, now, 0.01);
        this.reverbWet.gain.setTargetAtTime(wetVal, now, 0.01);
        this.reverbFeedback.gain.setTargetAtTime(reverbParams.roomSize * 0.85, now, 0.01);
        this.reverbFilter.frequency.setTargetAtTime(5000 - reverbParams.damping * 4000, now, 0.01);

      } else if (plugin.type === 'exciter') {
        const exciterParams = p as ExciterParams;
        this.exciterFilter.frequency.setTargetAtTime(exciterParams.frequency, now, 0.01);
        this.exciterWet.gain.setTargetAtTime(exciterParams.mix * 0.8, now, 0.01);
        // recreate curve dynamically if drive changes significantly
        this.exciterShaper.curve = this.makeDistortionCurve(5 + exciterParams.drive * 45);

      } else if (plugin.type === 'vinyl') {
        const vinylParams = p as VinylParams;
        // Wow rate maps to LFO frequency, wow depth maps to vibrato time modulation
        this.vinylLFO.frequency.setTargetAtTime(vinylParams.wowRate, now, 0.01);
        // Max wow is 5ms of delay modulation
        this.vinylLFOGain.gain.setTargetAtTime(vinylParams.crackleAmount * 0.005, now, 0.01);

        // Dust/crackle adds bandpass coloring to simulate warm vintage record
        if (vinylParams.dustAmount > 0.1) {
          this.vinylBandpass.frequency.setTargetAtTime(1200 - (vinylParams.dustAmount * 400), now, 0.01);
          this.vinylBandpass.Q.value = 0.5 + vinylParams.dustAmount * 1.5;
        }
      }
    });
  }
}
