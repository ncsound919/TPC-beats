import { ExtendedJunoParams, JunoParams } from '../../types';

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Helper to generate white noise buffer
function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

interface UnisonVoice {
  pulseOsc?: OscillatorNode;
  sawOsc?: OscillatorNode;
  pulseGain?: GainNode;
  sawGain?: GainNode;
}

class JunoVoice {
  private ctx: AudioContext;
  private destination: AudioNode;
  private params: ExtendedJunoParams;
  private note: number;
  private velocity: number;
  private now: number;

  private pulseOsc?: OscillatorNode;
  private sawOsc?: OscillatorNode;
  private subOsc?: OscillatorNode;
  private noiseNode?: AudioBufferSourceNode;

  private pulseGain?: GainNode;
  private sawGain?: GainNode;
  private subGain?: GainNode;
  private noiseGain?: GainNode;

  private unisonVoices: UnisonVoice[] = [];
  private unisonMix: GainNode;

  private voiceMix: GainNode;
  private hpfNode: BiquadFilterNode;
  private vcfNode: BiquadFilterNode;
  private vcaGain: GainNode;

  private lfoNode?: OscillatorNode;
  private lfoGain?: GainNode;

  public startedAt: number;
  public releasedAt: number | null = null;

  constructor(ctx: AudioContext, destination: AudioNode, params: ExtendedJunoParams, note: number, velocity: number) {
    this.ctx = ctx;
    this.destination = destination;
    this.params = params;
    this.note = note;
    this.velocity = velocity;
    this.now = ctx.currentTime;
    this.startedAt = this.now;

    this.voiceMix = ctx.createGain();
    this.unisonMix = ctx.createGain();
    this.hpfNode = ctx.createBiquadFilter();
    this.vcfNode = ctx.createBiquadFilter();
    this.vcaGain = ctx.createGain();

    this.build();
  }

  private buildOscillator(
    type: OscillatorType,
    freq: number,
    detuneOffset: number,
    gainValue: number,
    targetMix: AudioNode
  ): [OscillatorNode, GainNode] {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.now);
    osc.detune.setValueAtTime(detuneOffset, this.now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(gainValue, this.now);
    osc.connect(gain);
    gain.connect(targetMix);
    return [osc, gain];
  }

  private build() {
    const { dco, hpf, vcf, vca, env, chorus, lfo, lfo2 } = this.params;
    const baseFreq = midiToFreq(this.note);
    const detuneCents = (dco.detune || 0) - 50;
    const hasUnison = dco.unison === true;
    const voiceCount = hasUnison ? 3 : 1;
    const unisonDetuneCents = hasUnison ? 7 : 0;
    const unisonGainScale = hasUnison ? 0.5 : 1;

    // Create main oscillators
    for (let v = 0; v < voiceCount; v++) {
      const voiceDetune = detuneCents + (v - Math.floor(voiceCount / 2)) * unisonDetuneCents;
      const uv: UnisonVoice = {};
      const voiceGain = hasUnison ? 0.5 / voiceCount : 0.5;

      if (dco.wavePulse) {
        const [osc, gain] = this.buildOscillator('square', baseFreq, voiceDetune, voiceGain * unisonGainScale, this.voiceMix);
        const pwmDepth = dco.pwm / 100;
        if (pwmDepth > 0) {
          osc.detune.setValueAtTime(voiceDetune - (pwmDepth * 50), this.now);
          osc.detune.linearRampToValueAtTime(voiceDetune + (pwmDepth * 50), this.now + 0.1);
        }
        uv.pulseOsc = osc;
        uv.pulseGain = gain;
        if (v === 0) { this.pulseOsc = osc; this.pulseGain = gain; }
      }

      if (dco.waveSaw) {
        const [osc, gain] = this.buildOscillator('sawtooth', baseFreq, voiceDetune, voiceGain * unisonGainScale, this.voiceMix);
        uv.sawOsc = osc;
        uv.sawGain = gain;
        if (v === 0) { this.sawOsc = osc; this.sawGain = gain; }
      }

      if (dco.noise > 0 && v === 0) {
        this.noiseNode = this.ctx.createBufferSource();
        this.noiseNode.buffer = createNoiseBuffer(this.ctx);
        this.noiseNode.loop = true;
        this.noiseGain = this.ctx.createGain();
        this.noiseNode.connect(this.noiseGain);
        this.noiseGain.connect(this.voiceMix);
        this.noiseGain.gain.setValueAtTime((dco.noise / 100) * 0.2, this.now);
      }

      this.unisonVoices.push(uv);
    }

    if (dco.waveSub) {
      [this.subOsc, this.subGain] = this.buildOscillator('square', baseFreq / 2, detuneCents, (dco.sub / 100) * unisonGainScale, this.voiceMix);
    }

    // High Pass Filter (HPF)
    this.hpfNode.type = 'highpass';
    const hpfCutoff = 10 + (hpf.freq / 100) * 1000; // HPF range: 10Hz to 1010Hz
    this.hpfNode.frequency.setValueAtTime(hpfCutoff, this.now);

    // Resonant Low Pass Filter (VCF)
    this.vcfNode.type = 'lowpass';
    const maxVcfCutoff = 15000;
    const baseVcfCutoff = 50 + (vcf.freq / 100) * 8000; // 50Hz to 8050Hz
    this.vcfNode.frequency.setValueAtTime(baseVcfCutoff, this.now);
    this.vcfNode.Q.setValueAtTime(1 + (vcf.res / 100) * 15, this.now); // Resonance mapping

    // VCF Modulation (LFO, Env, Kbd)
    // 1. ADSR Envelope modulation
    const envAmt = (vcf.env / 100) * 5000; // max envelope modulation depth is 5000Hz
    const attTime = Math.max(0.002, (env.a / 100) * 3.0);
    const decTime = Math.max(0.005, (env.d / 100) * 5.0);
    const susLevel = env.s / 100;
    
    const vcfFreqParam = this.vcfNode.frequency;
    vcfFreqParam.setValueAtTime(baseVcfCutoff, this.now);
    if (vcf.env > 0) {
      vcfFreqParam.linearRampToValueAtTime(Math.min(maxVcfCutoff, baseVcfCutoff + envAmt), this.now + attTime);
      vcfFreqParam.exponentialRampToValueAtTime(Math.max(50, baseVcfCutoff + (envAmt * susLevel)), this.now + attTime + decTime);
    }

    // 2. Keyboard Tracking modulation
    const kbdAmt = (vcf.kbd / 100) * (this.note - 60) * 50; // standard kbd follow
    try {
      vcfFreqParam.setValueAtTime(Math.max(30, Math.min(maxVcfCutoff, this.vcfNode.frequency.value + kbdAmt)), this.now);
    } catch (e) {}

    // 3. LFO / LFO2 modulation of filter
    const lfoRate = 0.1 + (lfo.rate / 100) * 15; // 0.1Hz to 15.1Hz
    const lfoAmt = (vcf.lfo / 100) * 800; // filter mod depth
    if (lfoAmt > 0) {
      this.lfoNode = this.ctx.createOscillator();
      this.lfoNode.frequency.setValueAtTime(lfoRate, this.now);
      this.lfoGain = this.ctx.createGain();
      this.lfoGain.gain.setValueAtTime(lfoAmt, this.now);
      this.lfoNode.connect(this.lfoGain);
      this.lfoGain.connect(this.vcfNode.frequency);
      this.lfoNode.start(this.now);
    }

    // VCA Volume controls
    const vcaLevel = vca.level / 100;
    const velocityScale = vca.velocity > 0 ? (0.3 + 0.7 * (this.velocity / 127) * (vca.velocity / 100)) : 1.0;
    const targetVcaLevel = vcaLevel * velocityScale * 0.35; // pad scale to avoid digital clipping

    this.vcaGain.gain.setValueAtTime(0.0001, this.now);
    if (vca.mode === 'env') {
      // ADSR routes to VCA volume
      const relTime = Math.max(0.005, (env.r / 100) * 8.0);
      this.vcaGain.gain.linearRampToValueAtTime(targetVcaLevel, this.now + attTime);
      this.vcaGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetVcaLevel * susLevel), this.now + attTime + decTime);
    } else {
      // Gate mode: instant on, instant off (with tiny fade to prevent clicks)
      this.vcaGain.gain.linearRampToValueAtTime(targetVcaLevel, this.now + 0.002);
    }

    // Connections
    this.voiceMix.connect(this.hpfNode);
    this.hpfNode.connect(this.vcfNode);
    this.vcfNode.connect(this.vcaGain);

    // Chorus Routing
    if (chorus.mode === 'I' || chorus.mode === 'II') {
      const chorusMode = chorus.mode;
      // Lush Stereo Chorus: split mono signal into stereo and apply slow pitch modulation
      const splitter = this.ctx.createChannelSplitter(2);
      const merger = this.ctx.createChannelMerger(2);

      const delayL = this.ctx.createDelay();
      const delayR = this.ctx.createDelay();

      const chorusRate = chorusMode === 'I' ? 0.4 : 0.8; // Mod rate in Hz
      const chorusBaseDelay = chorusMode === 'I' ? 0.018 : 0.030; // Mod center delay in seconds
      const chorusDepth = chorusMode === 'I' ? 0.003 : 0.005;

      delayL.delayTime.setValueAtTime(chorusBaseDelay, this.now);
      delayR.delayTime.setValueAtTime(chorusBaseDelay, this.now);

      const modOscL = this.ctx.createOscillator();
      const modOscR = this.ctx.createOscillator();
      modOscL.frequency.setValueAtTime(chorusRate, this.now);
      modOscR.frequency.setValueAtTime(chorusRate, this.now);

      const modGainL = this.ctx.createGain();
      const modGainR = this.ctx.createGain();
      modGainL.gain.setValueAtTime(chorusDepth, this.now);
      modGainR.gain.setValueAtTime(-chorusDepth, this.now); // Out of phase for stereo wideness!

      modOscL.connect(modGainL);
      modGainL.connect(delayL.delayTime);

      modOscR.connect(modGainR);
      modGainR.connect(delayR.delayTime);

      this.vcaGain.connect(delayL);
      this.vcaGain.connect(delayR);

      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);

      const dryGain = this.ctx.createGain();
      const wetGain = this.ctx.createGain();
      const wetMix = chorus.mix !== undefined ? (chorus.mix / 100) : 0.6;
      dryGain.gain.setValueAtTime(1 - wetMix, this.now);
      wetGain.gain.setValueAtTime(wetMix, this.now);

      this.vcaGain.connect(dryGain);
      merger.connect(wetGain);

      dryGain.connect(this.destination);
      wetGain.connect(this.destination);

      modOscL.start(this.now);
      modOscR.start(this.now);
    } else {
      this.vcaGain.connect(this.destination);
    }

    // Start oscillators
    this.pulseOsc?.start(this.now);
    this.sawOsc?.start(this.now);
    this.subOsc?.start(this.now);
    this.noiseNode?.start(this.now);
  }

  public release() {
    if (this.releasedAt !== null) return;
    this.releasedAt = this.ctx.currentTime;
    const now = this.releasedAt;
    const { env, vca } = this.params;
    const relTime = Math.max(0.005, (env.r / 100) * 8.0);

    this.vcaGain.gain.cancelScheduledValues(now);
    this.vcaGain.gain.setValueAtTime(this.vcaGain.gain.value, now);

    if (vca.mode === 'env') {
      this.vcaGain.gain.exponentialRampToValueAtTime(0.0001, now + relTime);
    } else {
      this.vcaGain.gain.linearRampToValueAtTime(0.0001, now + 0.05); // quick release for gate mode
    }

    const totalRelease = vca.mode === 'env' ? relTime : 0.05;
    const stopTime = now + totalRelease + 0.1;

    setTimeout(() => {
      this.forceStop();
    }, (totalRelease + 0.2) * 1000);
  }

  public forceStop() {
    const stopNode = (node?: AudioNode) => {
      try { (node as any)?.stop?.(); } catch {}
      try { node?.disconnect(); } catch {}
    };
    const stopOsc = (node?: OscillatorNode) => {
      try { node?.stop(); } catch {}
      try { node?.disconnect(); } catch {}
    };

    stopOsc(this.pulseOsc);
    stopOsc(this.sawOsc);
    stopOsc(this.subOsc);
    stopNode(this.noiseNode);
    stopOsc(this.lfoNode);

    for (const uv of this.unisonVoices) {
      stopOsc(uv.pulseOsc);
      stopOsc(uv.sawOsc);
      stopNode(uv.pulseGain);
      stopNode(uv.sawGain);
    }

    try { this.vcaGain.disconnect(); } catch {}
    try { this.unisonMix.disconnect(); } catch {}
  }
}

export class JunoEngine {
  private ctx: AudioContext;
  private destination: AudioNode;
  private params: ExtendedJunoParams | null = null;
  private activeVoices: Map<number, JunoVoice> = new Map();

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
  }

  setParams(params: ExtendedJunoParams) {
    this.params = params;
  }

  getParams(): ExtendedJunoParams | null {
    return this.params;
  }

  noteOn(midiNote: number, velocity: number = 100) {
    if (!this.params) return;
    this.activeVoices.get(midiNote)?.forceStop();
    const voice = new JunoVoice(this.ctx, this.destination, this.params, midiNote, velocity);
    this.activeVoices.set(midiNote, voice);
  }

  noteOff(midiNote: number) {
    const voice = this.activeVoices.get(midiNote);
    if (voice) {
      voice.release();
      this.activeVoices.delete(midiNote);
    }
  }

  allNotesOff() {
    this.activeVoices.forEach(v => v.release());
    this.activeVoices.clear();
  }

  dispose() {
    this.activeVoices.forEach(v => v.forceStop());
    this.activeVoices.clear();
  }
}
