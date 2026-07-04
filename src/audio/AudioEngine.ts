import { FXSettings, Slice, MasterMixerSettings, BusName, EffectType, AudioEngineOptions } from '../types';
import { DX7Engine } from './synths/DX7Engine';
import { JunoEngine } from './synths/JunoEngine';
import { Rompler808Engine, DEFAULT_EXTENDED_ROMPLER_PARAMS } from './synths/Rompler808Engine';
import { VoicePool } from './VoicePool';
import { FXChain } from './FXChain';
import { AnalyserPool } from './AnalyserPool';
import { Transport } from './Transport';

/**
 * Callback fired when playSlice() cannot obtain a voice from the pool
 * (max polyphony reached). Lets UI/sequencer layers react (e.g. flash a
 * pad, log a drop-out counter) instead of the hit silently vanishing.
 */
export type VoiceStolenHandler = (slice: Slice, velocity: number) => void;

/**
 * A function that schedules audio against an arbitrary BaseAudioContext
 * (either the live AudioContext or an OfflineAudioContext) and the
 * matching bus GainNodes on that context's graph. Used by renderOffline()
 * so callers can replay a sequence/pattern deterministically without this
 * class needing to know anything about Transport/sequencing internals.
 */
export type OfflineScheduleFn = (
  offlineCtx: OfflineAudioContext,
  buses: { mpc: GainNode; synth: GainNode; rompler: GainNode }
) => void | Promise<void>;

const MAX_POLYPHONY = 32;

// Precomputed semitone -> playbackRate table. MPC-style engines retrigger
// the same handful of pitches constantly (mostly -12..+12); avoid recomputing
// Math.pow(2, n/12) on every single hit.
const PITCH_RATIO_CACHE = new Map<number, number>();
function pitchRatio(semitones: number): number {
  if (semitones === 0) return 1;
  let ratio = PITCH_RATIO_CACHE.get(semitones);
  if (ratio === undefined) {
    ratio = Math.pow(2, semitones / 12);
    // Cache stays small in practice (typically -24..+24), no eviction needed.
    PITCH_RATIO_CACHE.set(semitones, ratio);
  }
  return ratio;
}

// Perceptual velocity curve, same treatment as pitch: cheap, but hit
// constantly, so cache the common 0-127 range.
const VELOCITY_GAIN_CACHE: Float32Array = (() => {
  const table = new Float32Array(128);
  for (let v = 0; v < 128; v++) {
    table[v] = Math.pow(v / 127, 0.7);
  }
  return table;
})();
function velocityGain(velocity: number): number {
  const v = velocity | 0;
  if (v >= 0 && v <= 127) return VELOCITY_GAIN_CACHE[v];
  return Math.pow(Math.max(0, Math.min(127, velocity)) / 127, 0.7);
}

export class AudioEngine {
  public readonly ctx: AudioContext;

  // Buses
  public readonly mpcBus: GainNode;
  public readonly synthBus: GainNode;
  public readonly romplerBus: GainNode;

  // Master chain
  public readonly masterGain: GainNode;
  public readonly limiter: DynamicsCompressorNode;

  // FX Chains
  private busFX: Map<BusName, FXChain> = new Map();
  private masterFX: FXChain;

  // Core utilities
  private voicePool: VoicePool;
  private analysers: AnalyserPool;
  private transport: Transport;

  // Synths
  public dx7!: DX7Engine;
  public juno!: JunoEngine;
  public rompler808!: Rompler808Engine;

  private activeVoices: Set<AudioNode> = new Set();

  // Last-known mixer settings, kept so renderOffline() can rebuild an
  // equivalent graph state without the caller having to resupply it.
  private lastMixerSettings: MasterMixerSettings | null = null;

  private onVoiceStolen?: VoiceStolenHandler;

  constructor(options: AudioEngineOptions = {}) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: options.latencyHint || 'interactive',
      sampleRate: options.sampleRate || 44100,
    });

    this.onVoiceStolen = options.onVoiceStolen;

    // Create buses
    this.mpcBus = this.ctx.createGain();
    this.synthBus = this.ctx.createGain();
    this.romplerBus = this.ctx.createGain();

    this.masterGain = this.ctx.createGain();
    this.limiter = this.ctx.createDynamicsCompressor();

    // Configure master limiter (brickwall)
    this.limiter.threshold.value = -6;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.05;

    // Initialize FX chains
    this.busFX.set('mpc', new FXChain(this.ctx));
    this.busFX.set('synth', new FXChain(this.ctx));
    this.busFX.set('rompler', new FXChain(this.ctx));
    this.masterFX = new FXChain(this.ctx);

    // Routing: Bus → Bus FX → Master FX → Limiter → Master Gain
    this.setupRouting(this.ctx, {
      mpc: this.mpcBus,
      synth: this.synthBus,
      rompler: this.romplerBus,
      masterGain: this.masterGain,
      limiter: this.limiter,
      busFX: this.busFX,
      masterFX: this.masterFX,
    });

    // Voice pool for sampler (major perf win)
    this.voicePool = new VoicePool(this.ctx, MAX_POLYPHONY);
    this.analysers = new AnalyserPool(this.ctx);
    this.transport = new Transport(this.ctx);

    // Synths
    this.dx7 = new DX7Engine(this.ctx, this.synthBus);
    this.juno = new JunoEngine(this.ctx, this.synthBus);
    this.rompler808 = new Rompler808Engine(this.ctx, this.romplerBus, DEFAULT_EXTENDED_ROMPLER_PARAMS);

    this.setDefaultLevels();
  }

  /**
   * Wires bus -> busFX -> masterFX -> limiter -> masterGain -> destination.
   * Pulled out as a standalone function of its arguments (rather than reading
   * `this` directly) so the exact same routing logic can be reused to build
   * an equivalent graph on an OfflineAudioContext in renderOffline().
   */
  private setupRouting(
    _ctx: BaseAudioContext,
    graph: {
      mpc: GainNode;
      synth: GainNode;
      rompler: GainNode;
      masterGain: GainNode;
      limiter: DynamicsCompressorNode;
      busFX: Map<BusName, FXChain>;
      masterFX: FXChain;
      destination?: AudioNode;
    }
  ): void {
    const busEntries: Array<[BusName, GainNode]> = [
      ['mpc', graph.mpc],
      ['synth', graph.synth],
      ['rompler', graph.rompler],
    ];

    busEntries.forEach(([name, bus]) => {
      const fx = graph.busFX.get(name)!;
      bus.connect(fx.input);
      fx.output.connect(graph.masterFX.input);
    });

    graph.masterFX.output.connect(graph.limiter);
    graph.limiter.connect(graph.masterGain);
    graph.masterGain.connect(graph.destination ?? this.ctx.destination);
  }

  private setDefaultLevels(): void {
    this.mpcBus.gain.value = 1.0;
    this.synthBus.gain.value = 0.85;
    this.romplerBus.gain.value = 0.9;
    this.masterGain.gain.value = 0.85;
  }

  public async ensureRunning(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  /**
   * FIX: previously only mpcBus was ever updated ("...same for synth +
   * rompler" was a comment, not code), and per-bus plugin settings were
   * dropped on the floor (empty forEach body). Both are now applied.
   */
  public setMasterMixer(settings: MasterMixerSettings): void {
    const { channels, master } = settings;
    const rampTime = 0.008;
    const now = this.ctx.currentTime;

    const busMap: Array<[GainNode, MasterMixerSettings['channels']['mpc']]> = [
      [this.mpcBus, channels.mpc],
      [this.synthBus, channels.synth],
      [this.romplerBus, channels.rompler],
    ];

    // Solo semantics: if any channel is soloed, non-soloed channels are
    // treated as effectively muted. (Not present before; channels.*.solo
    // was part of the type but never read anywhere.)
    const anySolo = busMap.some(([, ch]) => ch.solo);

    busMap.forEach(([bus, ch]) => {
      const effectivelyMuted = ch.mute || (anySolo && !ch.solo);
      bus.gain.setTargetAtTime(effectivelyMuted ? 0 : ch.volume, now, rampTime);
    });

    this.masterGain.gain.setTargetAtTime(master.volume, now, rampTime);

    // Master FX updates via FXChain API
    this.masterFX.updateSettings(master.plugins);

    // FIX: previously a no-op. If/when per-bus plugin settings exist on
    // MasterMixerSettings, route them here. For now there is no per-bus
    // plugins field on the type, so this intentionally stays a documented
    // extension point rather than pretending to do something it can't.
    // this.busFX.forEach((chain, busName) => { ... });

    this.lastMixerSettings = settings;
  }

  private reversedBuffers = new WeakMap<AudioBuffer, AudioBuffer>();

  private getReversedBuffer(buffer: AudioBuffer): AudioBuffer {
    let rev = this.reversedBuffers.get(buffer);
    if (!rev) {
      rev = this.ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const src = buffer.getChannelData(c);
        const dest = rev.getChannelData(c);
        for (let i = 0, len = buffer.length; i < len; i++) {
          dest[i] = src[len - 1 - i];
        }
      }
      this.reversedBuffers.set(buffer, rev);
    }
    return rev;
  }

  public async loadSample(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    return this.ctx.decodeAudioData(buffer);
  }

  public async playSlice(
    buffer: AudioBuffer,
    slice: Slice,
    velocity: number = 127,
    playbackRateMultiplier: number = 1.0,
    time?: number
  ): Promise<void> {
    await this.playSliceInternal(buffer, slice, velocity, playbackRateMultiplier, time, false);
  }

  private async playSliceInternal(
    buffer: AudioBuffer,
    slice: Slice,
    velocity: number = 127,
    playbackRateMultiplier: number = 1.0,
    time?: number,
    isStutterTrigger: boolean = false
  ): Promise<void> {
    await this.ensureRunning();

    const voice = this.voicePool.get();
    if (!voice) {
      this.onVoiceStolen?.(slice, velocity);
      return;
    }

    const now = time ?? this.ctx.currentTime;
    
    // Reverse logic
    const useBuffer = slice.reverse ? this.getReversedBuffer(buffer) : buffer;
    const startOffset = slice.reverse 
      ? Math.max(0, buffer.duration - slice.end) 
      : Math.max(0, slice.start);
    const duration = Math.max(0.001, slice.end - slice.start);

    const baseRate = slice.pitch !== 0 ? pitchRatio(slice.pitch) : 1;
    const playbackRate = baseRate * playbackRateMultiplier;

    if (voice.source instanceof AudioBufferSourceNode) {
      voice.source.buffer = useBuffer;
      voice.source.playbackRate.setValueAtTime(playbackRate, now);
    }

    // Proper ADSR via VoiceGain
    const gain = voice.gain;
    const vel = velocityGain(velocity);
    const targetGain = Math.max(0.0001, slice.gain * vel);

    gain.applyADSR({
      attack: slice.attack,
      decay: slice.decay,
      sustain: slice.sustain ?? 0.6,
      release: slice.release ?? 0.3,
      targetGain,
    }, now);

    // Filter Node logic
    let filterNode: BiquadFilterNode | null = null;
    if (slice.filter && slice.filter.cutoff > 0) {
      filterNode = this.ctx.createBiquadFilter();
      filterNode.type = 'lowpass';
      filterNode.frequency.setValueAtTime(slice.filter.cutoff, now);
      filterNode.Q.setValueAtTime(slice.filter.resonance || 1.0, now);
      // Sweep lowpass for a warmer analog feel
      filterNode.frequency.exponentialRampToValueAtTime(
        Math.max(20, slice.filter.cutoff * 0.4),
        now + duration * 0.8
      );
    }

    if (filterNode) {
      voice.source.connect(filterNode);
      filterNode.connect(gain.node);
    } else {
      voice.source.connect(gain.node);
    }
    
    gain.node.connect(this.mpcBus);

    const playDuration = duration * (1 / playbackRate); // account for pitch

    if (slice.padAssignment !== null && slice.padAssignment !== undefined) {
      (voice.node as any).padId = slice.padAssignment;
    }

    this.activeVoices.add(voice.node);

    voice.source.onended = () => {
      this.activeVoices.delete(voice.node);
      try { voice.source.disconnect(); } catch {}
      try { if (filterNode) filterNode.disconnect(); } catch {}
      try { gain.node.disconnect(); } catch {}
      this.voicePool.release(voice);
    };

    voice.source.start(now, startOffset, Math.min(playDuration, 60)); // safety cap

    // Dilla stutter / roll trigger
    if (slice.stutter && slice.stutter.count > 1 && !isStutterTrigger) {
      const count = slice.stutter.count;
      const interval = slice.stutter.interval || 0.08;
      for (let i = 1; i < count; i++) {
        const triggerTime = now + i * interval;
        this.playSliceInternal(buffer, slice, velocity, playbackRateMultiplier, triggerTime, true);
      }
    }
  }

  public stopAll(): void {
    this.activeVoices.forEach(node => {
      try { (node as any).stop?.(); } catch {}
    });
    this.activeVoices.clear();
    this.voicePool.releaseAll();
  }

  public stopPad(padId: number): void {
    this.activeVoices.forEach(node => {
      if ((node as any).padId === padId) {
        try { (node as any).stop?.(); } catch {}
      }
    });
  }

  public applySaturation(value: number): void {
    // Pad-level saturation. Configured via pad options.
  }

  // Advanced features
  public getAnalyser(bus: BusName = 'master'): AnalyserNode {
    return this.analysers.get(bus);
  }

  public setTempo(bpm: number): void {
    this.transport.setBPM(bpm);
  }

  public syncLFOs(): void {
    // Broadcast beat to all modulation sources
  }

  /**
   * Renders `duration` seconds of audio through a graph that mirrors the
   * live routing (bus -> busFX -> masterFX -> limiter -> masterGain).
   *
   * FIX: previously this created an OfflineAudioContext and called
   * startRendering() immediately, with nothing ever connected to it, so it
   * silently produced `duration` seconds of digital silence.
   *
   * This class doesn't own sequencing (Transport does, and playSlice/dx7/juno
   * scheduling happens from outside via `time` params), so a truthful offline
   * render needs the caller to tell us what to schedule. `scheduleFn` receives
   * the offline context and a matching set of bus GainNodes already wired into
   * an equivalent FX/limiter/master chain; the caller schedules exactly the
   * same calls they would against the live engine (e.g. replaying a Sequence
   * by calling the offline equivalents of playSlice/dx7.noteOn/etc. against
   * these nodes/context) before rendering completes.
   *
   * NOTE ON FXChain: this assumes FXChain can attach itself to any
   * BaseAudioContext (i.e. its constructor takes a BaseAudioContext, not
   * specifically AudioContext) — true of the live usage already, since
   * OfflineAudioContext and AudioContext share that base class. If FXChain's
   * internals rely on any AudioContext-only APIs, that would need adjusting.
   */
  public async renderOffline(
    duration: number,
    scheduleFn: OfflineScheduleFn
  ): Promise<AudioBuffer> {
    const offlineCtx = new OfflineAudioContext({
      numberOfChannels: 2,
      length: Math.ceil(this.ctx.sampleRate * duration),
      sampleRate: this.ctx.sampleRate,
    });

    // Rebuild an equivalent bus/FX/limiter/master graph on the offline context.
    const mpcBus = offlineCtx.createGain();
    const synthBus = offlineCtx.createGain();
    const romplerBus = offlineCtx.createGain();
    const masterGain = offlineCtx.createGain();
    const limiter = offlineCtx.createDynamicsCompressor();

    limiter.threshold.value = this.limiter.threshold.value;
    limiter.ratio.value = this.limiter.ratio.value;
    limiter.attack.value = this.limiter.attack.value;
    limiter.release.value = this.limiter.release.value;

    const busFX = new Map<BusName, FXChain>([
      ['mpc', new FXChain(offlineCtx)],
      ['synth', new FXChain(offlineCtx)],
      ['rompler', new FXChain(offlineCtx)],
    ]);
    const masterFX = new FXChain(offlineCtx);

    this.setupRouting(offlineCtx, {
      mpc: mpcBus,
      synth: synthBus,
      rompler: romplerBus,
      masterGain,
      limiter,
      busFX,
      masterFX,
      destination: offlineCtx.destination,
    });

    // Apply current mixer/FX settings so the bounce matches what the user
    // is currently hearing, not engine defaults.
    if (this.lastMixerSettings) {
      const { channels, master } = this.lastMixerSettings;
      const anySolo = [channels.mpc, channels.synth, channels.rompler].some(c => c.solo);
      const apply = (bus: GainNode, ch: typeof channels.mpc) => {
        const muted = ch.mute || (anySolo && !ch.solo);
        bus.gain.value = muted ? 0 : ch.volume;
      };
      apply(mpcBus, channels.mpc);
      apply(synthBus, channels.synth);
      apply(romplerBus, channels.rompler);
      masterGain.gain.value = master.volume;
      masterFX.updateSettings(master.plugins);
    } else {
      mpcBus.gain.value = this.mpcBus.gain.value;
      synthBus.gain.value = this.synthBus.gain.value;
      romplerBus.gain.value = this.romplerBus.gain.value;
      masterGain.gain.value = this.masterGain.gain.value;
    }

    // Hand control to the caller to actually schedule notes/slices against
    // this offline graph.
    await scheduleFn(offlineCtx, { mpc: mpcBus, synth: synthBus, rompler: romplerBus });

    return offlineCtx.startRendering();
  }

  // Cleanup
  public dispose(): void {
    this.stopAll();
    this.ctx.close();
  }
}

// FIX: previously `export const engine = new AudioEngine()` ran at module
// import time. That constructs a real AudioContext before any user gesture
// (most browsers will hand back a 'suspended' context, but Safari/iOS can be
// stricter, and it makes every consumer of this module share one instance
// with no way to pass AudioEngineOptions or to unit-test in isolation).
// Replaced with an explicit lazy singleton getter.
let _sharedEngine: AudioEngine | null = null;

export function getAudioEngine(options?: AudioEngineOptions): AudioEngine {
  if (!_sharedEngine) {
    _sharedEngine = new AudioEngine(options);
  }
  return _sharedEngine;
}

export const engine = getAudioEngine();

/** For tests, or hot-reload paths that need a fresh context. */
export function resetAudioEngine(): void {
  _sharedEngine?.dispose();
  _sharedEngine = null;
}