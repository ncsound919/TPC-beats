import { ExtendedRomplerParams } from '../../types';

export const DEFAULT_EXTENDED_ROMPLER_PARAMS: ExtendedRomplerParams = {
  tune: 0,
  decay: 300,
  tone: 50,
  glide: 0,
  distortion: 0,
  sampleStart: 0,
  sampleEnd: 100,
  loop: false,
  loopStart: 20,
  reverse: false,
  pitchKeyTrack: true,
  ampEnv: { attack: 5, decay: 250, sustain: 0.8, release: 200 },
  filter: {
    enabled: false,
    type: 'lowpass',
    cutoff: 5000,
    resonance: 0,
    envelope: 0,
    keyFollow: 0,
  },
  filtEnv: { attack: 10, decay: 100, sustain: 0.5, release: 100 },
  lfo: {
    enabled: false,
    waveform: 'sine',
    rate: 1,
    sync: false,
    pitchMod: 0,
    filterMod: 0,
    ampMod: 0,
  },
  drive: {
    type: 'soft',
    amount: 0,
    tone: 50,
    mix: 100,
    postLowCut: 20,
    postHighCut: 18000,
    output: 100,
  },
  compressor: {
    enabled: false,
    threshold: -12,
    ratio: 4,
    attack: 5,
    release: 50,
    mix: 100,
    autoSidechain: false,
  },
  master: {
    volume: 100,
    pan: 0,
    width: 0,
    maximizer: 0,
  },
  engines: {
    sample: { mix: 100 },
    synth: {
      mix: 0,
      waveform: 'sine',
      pitch: 0,
      decay: 300,
    },
    xsub: {
      mix: 60,
      harmonics: 30,
      psycho: 70,
    },
  },
  macros: [
    { name: 'Macro 1', value: 50, assignments: {} },
    { name: 'Macro 2', value: 50, assignments: {} },
    { name: 'Macro 3', value: 50, assignments: {} },
    { name: 'Macro 4', value: 50, assignments: {} },
  ],
};

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class Rompler808Engine {
  private ctx: AudioContext;
  private destination: AudioNode;
  private sampleBuffer: AudioBuffer | null = null;
  private params: ExtendedRomplerParams;
  private activeNodes: Set<AudioNode> = new Set();
  private lastTriggeredTime = 0;

  constructor(ctx: AudioContext, destination: AudioNode, initialParams: ExtendedRomplerParams) {
    this.ctx = ctx;
    this.destination = destination;
    this.params = initialParams;
  }

  public setParams(params: ExtendedRomplerParams): void {
    this.params = params;
  }

  public setSampleBuffer(buffer: AudioBuffer | null): void {
    this.sampleBuffer = buffer;
  }

  /**
   * Evaluates a parameter path (e.g., 'filter.cutoff') under macro assignments
   * and returns the modulated value.
   */
  private getModulatedValue(paramPath: string, baseValue: number): number {
    let finalValue = baseValue;
    this.params.macros.forEach((macro) => {
      const assignment = macro.assignments?.[paramPath];
      if (assignment) {
        const factor = macro.value / 100; // 0 to 1
        const delta = assignment.max - assignment.min;
        const macroContribution = assignment.min + delta * factor;
        // Blend macro modulation onto baseValue
        finalValue = baseValue + (macroContribution - baseValue) * factor;
      }
    });
    return finalValue;
  }

  public triggerNote(noteNumber: number, velocity: number = 127, time?: number): void {
    const playTime = time ?? this.ctx.currentTime;
    this.lastTriggeredTime = playTime;

    // Base midi note frequency
    const fundamentalFreq = midiToFreq(noteNumber);
    
    // Total Gain node for this note trigger
    const noteBus = this.ctx.createGain();
    noteBus.connect(this.destination);

    // Track active sound sources for release/garbage collection
    const sourcesToStop: Array<AudioBufferSourceNode | OscillatorNode> = [];
    const nodesToDisconnect: AudioNode[] = [noteBus];

    // Auto Sidechain logic state
    // We'll create a sidechain gain node to duck other engines if autoSidechain is enabled
    const sidechainNode = this.ctx.createGain();
    sidechainNode.connect(noteBus);
    nodesToDisconnect.push(sidechainNode);

    // Determine sample volume & trigger
    const sampleMixVal = this.getModulatedValue('engines.sample.mix', this.params.engines.sample.mix) / 100;
    const synthMixVal = this.getModulatedValue('engines.synth.mix', this.params.engines.synth.mix) / 100;
    const xsubMixVal = this.getModulatedValue('engines.xsub.mix', this.params.engines.xsub.mix) / 100;

    // Keep track of kick duration to apply sidechain ducking to sub & synth
    let kickDuration = 0.08; // default transient duration in seconds

    // 1. SAMPLE ENGINE OR FALLBACK SYNTHETIC KICK
    if (sampleMixVal > 0) {
      const sampleBus = this.ctx.createGain();
      sampleBus.connect(noteBus);
      nodesToDisconnect.push(sampleBus);

      if (this.sampleBuffer) {
        // Play actual loaded sample
        const src = this.ctx.createBufferSource();
        src.buffer = this.sampleBuffer;
        
        // Reverse if requested
        const useReverse = this.params.reverse;
        const totalDuration = this.sampleBuffer.duration;
        const startPct = this.params.sampleStart / 100;
        const endPct = this.params.sampleEnd / 100;

        let startTimeOffset = totalDuration * startPct;
        let playDuration = totalDuration * (endPct - startPct);
        if (playDuration <= 0) playDuration = 0.01;

        if (useReverse) {
          // We can't reverse on-the-fly easily without reversing the actual buffer
          // Let's approximate start offset or just play it from the reversed position
          startTimeOffset = totalDuration * (1 - endPct);
        }

        // Tuning / pitch shift
        let semitones = this.params.tune;
        if (this.params.pitchKeyTrack) {
          // Track relative to middle C (midi 60)
          semitones += (noteNumber - 60);
        }
        const playRate = Math.pow(2, semitones / 12);
        src.playbackRate.setValueAtTime(playRate, playTime);

        // Loop settings
        if (this.params.loop) {
          src.loop = true;
          src.loopStart = totalDuration * (this.params.loopStart / 100);
          src.loopEnd = totalDuration * endPct;
        }

        // Connect source
        src.connect(sampleBus);
        sourcesToStop.push(src);

        // Apply Amp Envelope on Sample Bus
        const ampGain = sampleBus.gain;
        const att = this.params.ampEnv.attack / 1000;
        const dec = this.params.ampEnv.decay / 1000;
        const sus = this.params.ampEnv.sustain;
        const rel = this.params.ampEnv.release / 1000;
        const velGain = Math.pow(velocity / 127, 0.7);
        const targetGain = sampleMixVal * velGain;

        ampGain.setValueAtTime(0.0001, playTime);
        ampGain.linearRampToValueAtTime(targetGain, playTime + att);
        ampGain.setTargetAtTime(targetGain * sus, playTime + att, dec + 0.01);
        
        // Schedule release
        const stopAt = playTime + Math.min(playDuration, this.params.decay / 1000);
        ampGain.setValueAtTime(targetGain * sus, stopAt);
        ampGain.setTargetAtTime(0.0001, stopAt, rel + 0.01);

        src.start(playTime, startTimeOffset, playDuration + rel + 0.2);
        kickDuration = att + dec;
      } else {
        // Fallback: Synth kick drum transient generator
        // Sine wave with rapid pitch & amp decay
        const kickOsc = this.ctx.createOscillator();
        kickOsc.type = 'sine';
        
        // Rapid pitch sweep (from 160Hz down to fundamental / 2 over 80ms)
        const startFreq = 160;
        const endFreq = Math.max(35, fundamentalFreq * 0.75);
        kickOsc.frequency.setValueAtTime(startFreq, playTime);
        kickOsc.frequency.exponentialRampToValueAtTime(endFreq, playTime + 0.08);

        // Amp envelope for kick
        const kickGain = this.ctx.createGain();
        kickGain.gain.setValueAtTime(0.0001, playTime);
        kickGain.gain.linearRampToValueAtTime(sampleMixVal * 1.2 * (velocity / 127), playTime + 0.003);
        kickGain.gain.exponentialRampToValueAtTime(0.0001, playTime + 0.15);

        kickOsc.connect(kickGain);
        kickGain.connect(sampleBus);
        sourcesToStop.push(kickOsc);
        nodesToDisconnect.push(kickGain);

        kickOsc.start(playTime);
        kickOsc.stop(playTime + 0.2);
        kickDuration = 0.08;
      }
    }

    // 2. SYNTH ENGINE LAYER (Juno-style Sub Bass)
    if (synthMixVal > 0) {
      const synthBus = this.ctx.createGain();
      // Route through sidechain node
      synthBus.connect(sidechainNode);
      nodesToDisconnect.push(synthBus);

      const waveform = this.params.engines.synth.waveform;
      const pitchOffset = this.params.engines.synth.pitch; // semitones offset
      const decayMs = this.params.engines.synth.decay;

      const synthFreq = midiToFreq(noteNumber + pitchOffset);

      if (waveform === 'noise') {
        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = createNoiseBuffer(this.ctx);
        noiseNode.loop = true;

        // Bandpass filter to make noise useful for 808 texture
        const bandpass = this.ctx.createBiquadFilter();
        bandpass.type = 'bandpass';
        bandpass.frequency.setValueAtTime(200, playTime);
        bandpass.Q.setValueAtTime(1.0, playTime);

        noiseNode.connect(bandpass);
        bandpass.connect(synthBus);
        sourcesToStop.push(noiseNode);
        nodesToDisconnect.push(bandpass);

        noiseNode.start(playTime);
        noiseNode.stop(playTime + (decayMs / 1000) + 0.5);
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = waveform === 'saw' ? 'sawtooth' : waveform;
        osc.frequency.setValueAtTime(synthFreq, playTime);

        osc.connect(synthBus);
        sourcesToStop.push(osc);

        osc.start(playTime);
        osc.stop(playTime + (decayMs / 1000) + 0.5);
      }

      // Simple amp envelope for Synth layer
      const amp = synthBus.gain;
      const att = 0.005; // fast attack for low end alignment
      const dec = decayMs / 1000;
      amp.setValueAtTime(0.0001, playTime);
      amp.linearRampToValueAtTime(synthMixVal * 0.7 * (velocity / 127), playTime + att);
      amp.exponentialRampToValueAtTime(0.0001, playTime + att + dec);
    }

    // 3. X-SUB ENGINE LAYER (Deepest sub-bass)
    if (xsubMixVal > 0) {
      const xsubBus = this.ctx.createGain();
      // Route through sidechain node
      xsubBus.connect(sidechainNode);
      nodesToDisconnect.push(xsubBus);

      // We want the X-sub to stay deep: transpose down if note is too high
      let subNote = noteNumber;
      while (midiToFreq(subNote) > 85) {
        subNote -= 12;
      }
      const subFreq = midiToFreq(subNote);

      // Fundamental oscillator (pure sub-bass sine)
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(subFreq, playTime);
      subOsc.connect(xsubBus);
      sourcesToStop.push(subOsc);

      // Harmonics generator (combining odd/even harmonics)
      const harmonicsAmount = this.params.engines.xsub.harmonics / 100;
      let harmonicsOsc: OscillatorNode | null = null;
      if (harmonicsAmount > 0) {
        harmonicsOsc = this.ctx.createOscillator();
        // Triangle wave gives rich odd harmonics
        harmonicsOsc.type = 'triangle';
        // Placed 1 octave above fundamental for thickness
        harmonicsOsc.frequency.setValueAtTime(subFreq * 2, playTime);

        // Mix harmonics in
        const harmonicsGain = this.ctx.createGain();
        harmonicsGain.gain.setValueAtTime(harmonicsAmount * 0.2, playTime);
        
        harmonicsOsc.connect(harmonicsGain);
        harmonicsGain.connect(xsubBus);
        sourcesToStop.push(harmonicsOsc);
        nodesToDisconnect.push(harmonicsGain);
        
        harmonicsOsc.start(playTime);
        harmonicsOsc.stop(playTime + (this.params.decay / 1000) + 0.5);
      }

      // Psychoacoustic Saturation (high-passed saturation to make sub audible on small speakers)
      const psychoAmount = this.params.engines.xsub.psycho / 100;
      if (psychoAmount > 0) {
        // High-passed distorter
        const psychoHPF = this.ctx.createBiquadFilter();
        psychoHPF.type = 'highpass';
        psychoHPF.frequency.setValueAtTime(140, playTime); // focus on mid frequencies

        const waveshaper = this.ctx.createWaveShaper();
        const makeDistortionCurve = (amount: number) => {
          const k = typeof amount === 'number' ? amount : 50;
          const n_samples = 44100;
          const curve = new Float32Array(n_samples);
          const deg = Math.PI / 180;
          for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
          }
          return curve;
        };
        waveshaper.curve = makeDistortionCurve(psychoAmount * 40);
        waveshaper.oversample = '4x';

        const psychoGain = this.ctx.createGain();
        psychoGain.gain.setValueAtTime(psychoAmount * 0.15, playTime);

        subOsc.connect(psychoHPF);
        psychoHPF.connect(waveshaper);
        waveshaper.connect(psychoGain);
        psychoGain.connect(xsubBus);

        nodesToDisconnect.push(psychoHPF);
        nodesToDisconnect.push(waveshaper);
        nodesToDisconnect.push(psychoGain);
      }

      subOsc.start(playTime);
      subOsc.stop(playTime + (this.params.decay / 1000) + 0.5);

      // Amp envelope for X-Sub (slides smoothly to avoid clicks)
      const amp = xsubBus.gain;
      const att = 0.01;
      const dec = this.params.decay / 1000;
      amp.setValueAtTime(0.0001, playTime);
      amp.linearRampToValueAtTime(xsubMixVal * (velocity / 127), playTime + att);
      amp.exponentialRampToValueAtTime(0.0001, playTime + att + dec);
    }

    // 4. AUTO SIDECHAIN DUCKING (if enabled)
    const compressSettings = this.params.compressor;
    if (compressSettings?.enabled && compressSettings.autoSidechain && sampleMixVal > 0) {
      // Duck sub and synth during the kick punch
      const sidechainGain = sidechainNode.gain;
      sidechainGain.setValueAtTime(1.0, playTime);
      sidechainGain.setValueAtTime(1.0, playTime + 0.002);
      // Duck down by 15-20dB (to 0.15 volume) rapidly
      sidechainGain.linearRampToValueAtTime(0.15, playTime + 0.01);
      // Hold ducking for kick duration, then recover
      sidechainGain.setValueAtTime(0.15, playTime + kickDuration * 0.7);
      sidechainGain.exponentialRampToValueAtTime(1.0, playTime + kickDuration + 0.05);
    } else {
      sidechainNode.gain.setValueAtTime(1.0, playTime);
    }

    // 5. BLENDED FILTERS
    const filterParams = this.params.filter;
    let postFilterNode: BiquadFilterNode | null = null;
    if (filterParams?.enabled) {
      postFilterNode = this.ctx.createBiquadFilter();
      postFilterNode.type = filterParams.type;
      
      const cutoffVal = this.getModulatedValue('filter.cutoff', filterParams.cutoff);
      postFilterNode.frequency.setValueAtTime(Math.max(20, cutoffVal), playTime);
      postFilterNode.Q.setValueAtTime(Math.max(0.1, filterParams.resonance / 10), playTime);

      // Dynamic Filter ADSR sweep
      const envAmt = filterParams.envelope / 100;
      if (envAmt > 0) {
        const filtAtt = this.params.filtEnv.attack / 1000;
        const filtDec = this.params.filtEnv.decay / 1000;
        const filtSus = this.params.filtEnv.sustain;
        const sweepMax = Math.min(20000, cutoffVal + (10000 * envAmt));
        const sweepSus = cutoffVal + (sweepMax - cutoffVal) * filtSus;

        postFilterNode.frequency.linearRampToValueAtTime(sweepMax, playTime + filtAtt);
        postFilterNode.frequency.setTargetAtTime(sweepSus, playTime + filtAtt, filtDec + 0.01);
      }

      // Connect noteBus to the filter
      noteBus.disconnect(this.destination);
      noteBus.connect(postFilterNode);
      postFilterNode.connect(this.destination);
      nodesToDisconnect.push(postFilterNode);
    }

    // 6. MODULAR FX RACK: DRIVE / DISTORTION
    const driveParams = this.params.drive;
    const driveAmount = this.getModulatedValue('drive.amount', driveParams.amount) / 100;
    if (driveAmount > 0) {
      const driveNode = this.ctx.createWaveShaper();
      const type = driveParams.type;

      // Select distortion curve
      const driveCurve = new Float32Array(44100);
      const amountFactor = Math.max(0.1, driveAmount * 20);
      for (let i = 0; i < 44100; i++) {
        const x = (i * 2) / 44100 - 1;
        if (type === 'soft') {
          driveCurve[i] = Math.tanh(x * amountFactor);
        } else if (type === 'hard') {
          const limit = 1.0 - (driveAmount * 0.6);
          driveCurve[i] = Math.max(-limit, Math.min(limit, x)) / limit;
        } else if (type === 'fold') {
          driveCurve[i] = Math.sin(x * amountFactor * Math.PI);
        } else if (type === 'tube') {
          // Asymmetric tube simulation
          if (x < 0) {
            driveCurve[i] = Math.tanh(x * amountFactor * 0.5);
          } else {
            driveCurve[i] = (x * amountFactor) / (1 + (x * amountFactor));
          }
        } else if (type === 'darkdrive') {
          driveCurve[i] = Math.tanh(x * amountFactor * 0.3) * 0.9;
        } else if (type === 'grunge') {
          // Bitcrushed & harsh waveshaping
          const steps = Math.max(2, Math.round(16 - (driveAmount * 14)));
          const quantized = Math.round(x * steps) / steps;
          driveCurve[i] = Math.sin(quantized * amountFactor) * 1.1;
        }
      }
      driveNode.curve = driveCurve;
      driveNode.oversample = '4x';

      // Insert drive into final chain
      const driveWetGain = this.ctx.createGain();
      const driveDryGain = this.ctx.createGain();
      const driveMix = driveParams.mix / 100;

      driveWetGain.gain.setValueAtTime(driveMix, playTime);
      driveDryGain.gain.setValueAtTime(1 - driveMix, playTime);

      const targetDestination = postFilterNode || noteBus;
      targetDestination.disconnect(this.destination);

      // Parallel Dry/Wet split
      targetDestination.connect(driveDryGain);
      targetDestination.connect(driveNode);
      driveNode.connect(driveWetGain);

      const postDriveNode = this.ctx.createGain();
      driveDryGain.connect(postDriveNode);
      driveWetGain.connect(postDriveNode);

      // Post filters to control distortion high-end fuzz & mud
      const postLowCutFilter = this.ctx.createBiquadFilter();
      postLowCutFilter.type = 'highpass';
      postLowCutFilter.frequency.setValueAtTime(driveParams.postLowCut, playTime);

      const postHighCutFilter = this.ctx.createBiquadFilter();
      postHighCutFilter.type = 'lowpass';
      postHighCutFilter.frequency.setValueAtTime(driveParams.postHighCut, playTime);

      const driveOutNode = this.ctx.createGain();
      driveOutNode.gain.setValueAtTime(driveParams.output / 100, playTime);

      postDriveNode.connect(postLowCutFilter);
      postLowCutFilter.connect(postHighCutFilter);
      postHighCutFilter.connect(driveOutNode);
      driveOutNode.connect(this.destination);

      nodesToDisconnect.push(driveNode);
      nodesToDisconnect.push(driveWetGain);
      nodesToDisconnect.push(driveDryGain);
      nodesToDisconnect.push(postDriveNode);
      nodesToDisconnect.push(postLowCutFilter);
      nodesToDisconnect.push(postHighCutFilter);
      nodesToDisconnect.push(driveOutNode);
    }

    // 7. COMPRESSOR & LIMITER (MAXIMIZER)
    if (compressSettings?.enabled) {
      const compNode = this.ctx.createDynamicsCompressor();
      compNode.threshold.setValueAtTime(compressSettings.threshold, playTime);
      compNode.ratio.setValueAtTime(compressSettings.ratio, playTime);
      compNode.attack.setValueAtTime(compressSettings.attack / 1000, playTime);
      compNode.release.setValueAtTime(compressSettings.release / 1000, playTime);

      // Splitting for dry/wet parallel compression
      const compWetGain = this.ctx.createGain();
      const compDryGain = this.ctx.createGain();
      const compMix = compressSettings.mix / 100;

      compWetGain.gain.setValueAtTime(compMix, playTime);
      compDryGain.gain.setValueAtTime(1 - compMix, playTime);

      // Connect before destination
      const prevNode = nodesToDisconnect[nodesToDisconnect.length - 1];
      prevNode.disconnect(this.destination);

      prevNode.connect(compNode);
      prevNode.connect(compDryGain);
      compNode.connect(compWetGain);

      const compOut = this.ctx.createGain();
      compDryGain.connect(compOut);
      compWetGain.connect(compOut);
      compOut.connect(this.destination);

      nodesToDisconnect.push(compNode);
      nodesToDisconnect.push(compWetGain);
      nodesToDisconnect.push(compDryGain);
      nodesToDisconnect.push(compOut);
    }

    // 8. STEREO WIDTH & MASTER EFFECTS
    const masterParams = this.params.master;
    if (masterParams) {
      const masterOutGain = this.ctx.createGain();
      const finalVol = masterParams.volume / 100;
      masterOutGain.gain.setValueAtTime(finalVol, playTime);

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(masterParams.pan / 50, playTime);

      // Stereo Width (Haas delay for high-frequencies, keeping sub perfectly mono)
      const lastNode = nodesToDisconnect[nodesToDisconnect.length - 1];
      lastNode.disconnect(this.destination);

      if (masterParams.width !== 0) {
        // High-pass filter above 120Hz so sub-bass stays mono
        const wideSplit = this.ctx.createChannelSplitter(2);
        const wideMerger = this.ctx.createChannelMerger(2);

        const hpL = this.ctx.createBiquadFilter();
        const hpR = this.ctx.createBiquadFilter();
        hpL.type = 'highpass';
        hpR.type = 'highpass';
        hpL.frequency.setValueAtTime(120, playTime);
        hpR.frequency.setValueAtTime(120, playTime);

        const delay = this.ctx.createDelay();
        // Width controls delay time: negative values shift left, positive shift right
        const delayMs = Math.abs(masterParams.width) / 100 * 0.035; // max 35ms Haas delay
        delay.delayTime.setValueAtTime(delayMs, playTime);

        // Routing for high frequencies Haas effect
        lastNode.connect(wideSplit);
        wideSplit.connect(hpL, 0);
        wideSplit.connect(hpR, 1);

        if (masterParams.width > 0) {
          // Delay Right channel
          hpL.connect(wideMerger, 0, 0);
          hpR.connect(delay);
          delay.connect(wideMerger, 0, 1);
        } else {
          // Delay Left channel
          hpL.connect(delay);
          delay.connect(wideMerger, 0, 0);
          hpR.connect(wideMerger, 0, 1);
        }

        // Low frequencies bypass directly to Merger to preserve punchy mono low-end
        const lpMono = this.ctx.createBiquadFilter();
        lpMono.type = 'lowpass';
        lpMono.frequency.setValueAtTime(120, playTime);
        lastNode.connect(lpMono);
        lpMono.connect(wideMerger, 0, 0);
        lpMono.connect(wideMerger, 0, 1);

        wideMerger.connect(panner);
        nodesToDisconnect.push(wideSplit);
        nodesToDisconnect.push(hpL);
        nodesToDisconnect.push(hpR);
        nodesToDisconnect.push(delay);
        nodesToDisconnect.push(lpMono);
        nodesToDisconnect.push(wideMerger);
      } else {
        lastNode.connect(panner);
      }

      panner.connect(masterOutGain);
      masterOutGain.connect(this.destination);

      nodesToDisconnect.push(panner);
      nodesToDisconnect.push(masterOutGain);
    }

    // 9. LIMITER / MAXIMIZER (at final output)
    if (masterParams?.maximizer > 0) {
      const limiter = this.ctx.createDynamicsCompressor();
      // Threshold decreases with maximizer amount for heavy squashing
      const threshVal = -0.1 - (masterParams.maximizer / 100 * 12);
      limiter.threshold.setValueAtTime(threshVal, playTime);
      limiter.ratio.setValueAtTime(20, playTime);
      limiter.attack.setValueAtTime(0.001, playTime);
      limiter.release.setValueAtTime(0.04, playTime);

      const lastNode = nodesToDisconnect[nodesToDisconnect.length - 1];
      lastNode.disconnect(this.destination);
      lastNode.connect(limiter);
      limiter.connect(this.destination);
      nodesToDisconnect.push(limiter);
    }

    // Clean up Audio Nodes after play completes to free memory (Garbage Collection)
    const voiceDuration = Math.max(1.5, this.params.decay / 1000 + (this.params.ampEnv.release / 1000) + 1.0);
    this.activeNodes.add(noteBus);
    
    setTimeout(() => {
      sourcesToStop.forEach((src) => {
        try { src.stop(); } catch {}
        try { src.disconnect(); } catch {}
      });
      nodesToDisconnect.forEach((node) => {
        try { node.disconnect(); } catch {}
      });
      this.activeNodes.delete(noteBus);
    }, voiceDuration * 1000);
  }

  public stopAll(): void {
    // Standard stop-all implementation
    this.activeNodes.forEach((node) => {
      try { (node as any).disconnect(); } catch {}
    });
    this.activeNodes.clear();
  }
}
