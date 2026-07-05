export interface JunoParams {
  dco: {
    wavePulse: boolean;
    waveSaw: boolean;
    waveSub?: boolean;
    sync?: boolean;
    unison?: boolean;
    pwm: number;       // 0–100
    sub: number;       // 0–100
    noise: number;     // 0–100
    detune?: number;    // 0–100
    portamento?: number;// 0–100
    lfo?: number;      // compat with initialization
    range?: string;
    lfoWaveform?: string;
  };
  lfo?: {
    rate: number;      // 0–100
    delay: number;     // 0–100
    fade: number;      // 0–100
  };
  hpf: {
    freq: number;      // 0–100
  };
  vcf: {
    freq: number;      // 0–100
    res: number;       // 0–100
    env: number;       // 0–100
    lfo: number;       // 0–100
    kbd: number;       // 0–100
    drive?: number;     // 0–100
    envAmount?: number;
    envCurve?: string;
  };
  vca: {
    level: number;     // 0–100
    mode: 'env' | 'gate';
    velocity?: number;  // 0–100
  };
  env: {
    a: number;         // 0–100
    d: number;         // 0–100
    s: number;         // 0–100
    r: number;         // 0–100
    vcaA?: number;
    vcaD?: number;
    vcaS?: number;
    vcaR?: number;
  };
  chorus: {
    mode: 'off' | 'I' | 'II';
    mix?: number;       // 0–100
    depth?: number;     // 0–100
  };
  chord: {
    enabled: boolean;
    notes: number[];   // intervals from root in semitones
  };
}

export interface ExtendedJunoParams extends JunoParams {
  arpeggiator: {
    enabled: boolean;
    mode: 'up' | 'down' | 'updown' | 'random' | 'order';
    octaves: number;
    rate: number;
    gate: number;
    latch: boolean;
  };
  voicing?: 'poly' | 'mono' | 'legato';
  modMatrix?: ModMatrixSlot[];
  lfo2?: {
    waveform?: 'sine' | 'triangle' | 'square' | 'saw' | 'reverseSaw' | 'random';
    rate: number;
    delay?: number;
    fade?: number;
    retrigger?: boolean;
    pitch?: number;
    filter?: number;
    amp?: number;
    depth?: number;
  };
  fx?: {
    delayTime: number;
    delayFeedback: number;
    delayMix: number;
    delaySync?: boolean;
    reverbSize: number;
    reverbMix: number;
  };
  master?: {
    volume: number;
    limiter?: boolean;
    detune?: number;
  };
}

export type BaseAudioContext = AudioContext | OfflineAudioContext;
export type BusName = 'mpc' | 'synth' | 'rompler' | 'master';
export type EffectType = 'eq' | 'compressor' | 'limiter' | 'reverb';

export interface AudioEngineOptions {
  latencyHint?: 'interactive' | 'balanced' | 'playback';
  sampleRate?: number;
  onVoiceStolen?: (slice: Slice, velocity: number) => void;
}

export interface Slice {
  id: string;
  start: number;
  end: number;
  attack: number;
  decay: number;
  pitch: number;
  gain: number;
  padAssignment: number | null;
  reverse?: boolean;
  stutter?: { count: number; interval: number };
  filter?: { cutoff: number; resonance: number };
  sustain?: number;
  release?: number;
}

export interface Sample {
  id: string;
  name: string;
  rawBuffer: AudioBuffer | null;
  sampleRate: number;
  bitDepth: number;
  slices: Slice[];
  type?: 'loop' | 'oneshot' | '808';
  bpm?: number;
  bars?: number;
  loopMode?: 'loop' | 'oneshot' | 'stretch';
}

export interface PadLayer {
  sliceId: string;
  velocityMin: number;
  velocityMax: number;
  pitchOffset?: number;
  gain?: number;
}

export interface PadFilter {
  enabled: boolean;
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch';
  cutoff: number;
  resonance: number;
  envelope: number;
  keyTrack: number;
}

export interface PadADSR {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface Pad {
  padId: number;
  assignedSliceId: string | null;
  layers: PadLayer[];
  velocityCurve: 'linear' | 'exponential' | 'logarithmic' | 'soft' | 'hard';
  muteGroup: number | null;
  chokeGroup: number | null;
  swing: number;
  polyphony: 'mono' | 'poly';
  pitchOffset?: number;
  reverse?: boolean;
  saturation?: number;
  filter?: PadFilter;
  ampEnv?: PadADSR;
  filterEnv?: PadADSR;
  linkedPadIds?: number[];
}

export interface FXSettings {
  bitcrush: { enabled: boolean; bitDepth: number; downsample: number };
  saturation: { enabled: boolean; drive: number };
  filter: { enabled: boolean; type: 'lowpass' | 'highpass' | 'bandpass'; cutoff: number; resonance: number };
}

export interface MixerSettings {
  masterVolume: number;
  globalSwing: number; // 0-100%
}

export interface Program {
  id: string;
  name: string;
  bank: 'A' | 'B' | 'C' | 'D' | '808' | 'SYNTH';
  pads: Pad[];
  samples: Sample[];
  fxSettings: FXSettings;
  mixerSettings: MixerSettings;
}

export interface SequenceEvent {
  id?: string;
  timestampPPQN: number;
  padId: number;
  velocity: number;
  duration?: number;
  durationPPQN?: number;
}

export interface AutomationPoint {
  timestampPPQN: number;
  value: number;
  curve?: 'linear' | 'step' | 'smooth';
}

export interface AutomationClip {
  id: string;
  padId?: number;
  target: string;
  points: AutomationPoint[];
  min: number;
  max: number;
  loop: boolean;
}

export interface Sequence {
  id: string;
  name: string;
  bpm: number;
  ppqn: number;
  events: SequenceEvent[];
  lengthBars: number;
  automationClips?: AutomationClip[];
}

export interface PatternClip {
  id: string;
  sequenceId: string;
  startBar: number;
  lengthBars: number;
  muted: boolean;
  repeats: number;
}

export interface PatternArrangement {
  clips: PatternClip[];
}

export interface Rompler808Params {
  tune: number;
  decay: number;
  tone: number;
  glide: number;
  distortion: number;
}

export interface ExtendedRomplerParams extends Rompler808Params {
  sampleStart: number;
  sampleEnd: number;
  loop: boolean;
  loopStart: number;
  reverse: boolean;
  pitchKeyTrack: boolean;
  ampEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: {
    enabled: boolean;
    type: 'lowpass' | 'bandpass' | 'highpass';
    cutoff: number;
    resonance: number;
    envelope: number;
    keyFollow: number;
  };
  filtEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  lfo: {
    enabled: boolean;
    waveform: 'sine' | 'triangle' | 'saw' | 'square' | 'random';
    rate: number;
    sync: boolean;
    pitchMod: number;
    filterMod: number;
    ampMod: number;
  };
  drive: {
    type: 'soft' | 'hard' | 'fold' | 'tube' | 'darkdrive' | 'grunge';
    amount: number;
    tone: number;
    mix: number;
    postLowCut: number;
    postHighCut: number;
    output: number;
  };
  compressor: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    mix: number;
    autoSidechain: boolean;
  };
  master: {
    volume: number;
    pan: number;
    width: number;
    maximizer: number;
  };
  engines: {
    sample: { mix: number };
    synth: {
      mix: number;
      waveform: 'sine' | 'saw' | 'square' | 'triangle' | 'noise';
      pitch: number;
      decay: number;
    };
    xsub: {
      mix: number;
      harmonics: number;
      psycho: number;
    };
  };
  macros: Array<{
    name: string;
    value: number;
    assignments: Record<string, { min: number; max: number }>;
  }>;
}

export interface DX7EnvelopeGenerator {
  rate: [number, number, number, number];   // R1-R4, 0-99
  level: [number, number, number, number];  // L1-L4, 0-99
}

export interface DX7Oscillator {
  mode: 'ratio' | 'fixed'; // frequency mode
  coarse: number;          // 0-31 (ratio) or fixed-freq table index
  fine: number;            // 0-99
  detune: number;          // -7..7
}

export interface DX7KeyboardScaling {
  breakPoint: number;   // 0-99 (note number, A-1=0 .. C8=99)
  leftDepth: number;    // 0-99
  rightDepth: number;   // 0-99
  leftCurve: 0 | 1 | 2 | 3;  // -LIN, -EXP, +EXP, +LIN
  rightCurve: 0 | 1 | 2 | 3;
  rateScale: number;    // 0-7, EG rate scaling by keyboard position
}

export interface DX7Operator {
  enabled: boolean;
  eg: DX7EnvelopeGenerator;
  keyboardScale: DX7KeyboardScaling;
  velocitySens: number;    // 0-7
  ampModSens: number;      // 0-3
  outputLevel: number;     // 0-99
  oscillator: DX7Oscillator;
  level: [number, number, number, number]; // convenience mirror of eg.level for UI
}

export interface DX7LFO {
  speed: number;      // 0-99
  delay: number;       // 0-99
  pmDepth: number;      // 0-99
  amDepth: number;      // 0-99
  sync: boolean;
  waveform: 0 | 1 | 2 | 3 | 4 | 5; // triangle, saw down, saw up, square, sine, S&H
  pmSens: number;      // 0-7
}

export interface DX7PitchEG {
  rate: [number, number, number, number];
  level: [number, number, number, number];
}

export interface DX7Params {
  name: string;
  algorithm: number;   // 1-32 (displayed), 0-31 (internal)
  feedback: number;    // 0-7
  oscSync: boolean;
  lfoRate: number;     // convenience mirror of lfo.speed for older UI code
  lfo: DX7LFO;
  pitchEG: DX7PitchEG;
  transpose: number;   // 0-48, 24 = C3
  operators: DX7Operator[]; // length 6, index 0 = OP1 ... index 5 = OP6
}

export const OPERATOR_COUNT = 6;
export const VOICE_SIZE_PACKED = 128;   // bytes per voice in a 32-voice bank dump
export const BANK_VOICE_COUNT = 32;
export const BANK_DATA_SIZE = VOICE_SIZE_PACKED * BANK_VOICE_COUNT; // 4096

export function createDefaultOperator(outputLevel = 99): DX7Operator {
  return {
    enabled: true,
    eg: { rate: [99, 99, 99, 99], level: [99, 99, 99, 0] },
    keyboardScale: { breakPoint: 39, leftDepth: 0, rightDepth: 0, leftCurve: 0, rightCurve: 0, rateScale: 0 },
    velocitySens: 0,
    ampModSens: 0,
    outputLevel,
    oscillator: { mode: 'ratio', coarse: 1, fine: 0, detune: 0 },
    level: [99, 99, 99, 0],
  };
}

export function createDefaultDX7Params(): DX7Params {
  return {
    name: 'INIT VOICE',
    algorithm: 1,
    feedback: 0,
    oscSync: false,
    lfoRate: 35,
    lfo: { speed: 35, delay: 0, pmDepth: 0, amDepth: 0, sync: true, waveform: 4, pmSens: 3 },
    pitchEG: { rate: [99, 99, 99, 99], level: [50, 50, 50, 50] },
    transpose: 24,
    operators: [
      createDefaultOperator(99),
      createDefaultOperator(0),
      createDefaultOperator(0),
      createDefaultOperator(0),
      createDefaultOperator(0),
      createDefaultOperator(0),
    ],
  };
}

export type MasterPluginType = 'eq' | 'compressor' | 'limiter' | 'reverb' | 'maximizer' | 'exciter' | 'vinyl';

export interface ModMatrixSlot {
  id: string;
  source: string;
  destination: string;
  amount: number;
  min: number;
  max: number;
  enabled: boolean;
}

export type ModSource =
  | 'lfo1' | 'lfo2' | 'env3' | 'env4'
  | 'velocity' | 'keyboard' | 'modwheel' | 'aftertouch'
  | 'macro1' | 'macro2' | 'macro3' | 'macro4'
  | 'random' | 'step';

export type ModDestination =
  | 'cutoff' | 'resonance' | 'pitch' | 'volume'
  | 'pan' | 'fx1' | 'fx2' | 'drive'
  | 'decay' | 'release' | 'lfoRate' | 'lfoDepth';

export interface EQParams {
  low: number;      // -12 to +12 dB
  mid: number;
  high: number;
  lowFreq?: number; // Hz
  highFreq?: number;
}

export interface CompressorParams {
  threshold: number;  // dB
  ratio: number;      // 1:1 to 20:1 (slope)
  attack: number;     // ms
  release: number;    // ms
  makeup?: number;    // dB (auto-gain)
}

export interface LimiterParams {
  threshold: number;  // dB
  release: number;    // ms
}

export interface MaximizerParams {
  threshold: number;  // dB, typically -6 to 0
  release: number;    // ms
}

export interface ReverbParams {
  roomSize: number;   // 0-1
  damping: number;    // 0-1
  wetDry: number;     // 0-1 (0=dry, 1=wet)
}

export interface ExciterParams {
  frequency: number;  // Hz, typically 2-16kHz
  drive: number;      // 0-1
  mix: number;        // 0-1
}

export interface VinylParams {
  dustAmount: number; // 0-1
  crackleAmount: number;
  wowRate: number;    // Hz
}

export type PluginParams = EQParams | CompressorParams | LimiterParams | MaximizerParams | ReverbParams | ExciterParams | VinylParams;

export interface MasterPlugin {
  id: string;
  type: MasterPluginType;
  enabled: boolean;
  params: PluginParams;
}

export interface MasterMixerSettings {
  channels: {
    mpc: { volume: number; pan: number; mute: boolean; solo: boolean };
    synth: { volume: number; pan: number; mute: boolean; solo: boolean };
    rompler: { volume: number; pan: number; mute: boolean; solo: boolean };
  };
  master: {
    volume: number;
    plugins: MasterPlugin[];
    moogFilter: { cutoff: number; resonance: number };
  };
}

// Defaults for each plugin type
export const DEFAULT_PLUGIN_PARAMS: Record<MasterPluginType, PluginParams> = {
  eq: { low: 0, mid: 0, high: 0, lowFreq: 100, highFreq: 8000 },
  compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, makeup: 0 },
  limiter: { threshold: -6, release: 50 },
  reverb: { roomSize: 0.5, damping: 0.5, wetDry: 0.3 },
  maximizer: { threshold: -0.1, release: 50 },
  exciter: { frequency: 4000, drive: 0.3, mix: 0.3 },
  vinyl: { dustAmount: 0.2, crackleAmount: 0.1, wowRate: 0.5 },
};
