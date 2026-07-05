import { DX7Params, DX7Operator } from '../../types';

// ---------------------------------------------------------------------------
// Real 6-operator FM synthesis engine.
//
// Each DX7Operator becomes: OscillatorNode (sine) -> outputGain -> EG gain
// Modulators connect their output into the *frequency* AudioParam of the
// operators they modulate (true FM, not amplitude modulation), scaled by
// a modulation-index gain derived from output level + feedback.
//
// Algorithm routing table below encodes, for each of the 32 DX7 algorithms,
// which operators modulate which, which are feedback operators, and which
// are carriers (routed to the output bus).
// ---------------------------------------------------------------------------

// Each entry: [operator index 0-5] -> { modulates: number[] (operator indices it feeds),
//              isCarrier: boolean, feedback: boolean }
// Operators are numbered 0=OP1 .. 5=OP6 to match DX7Params.operators order.
interface AlgoNode {
  modulates: number[];
  isCarrier: boolean;
  feedbackSelf?: boolean;
}
type AlgoDef = AlgoNode[]; // length 6, indexed by operator

// Algorithms 1-32 (index 0-31), transcribed from the DX7 algorithm chart.
// This captures the real DX7 routing topology (carriers vs modulators and
// serial/parallel stacking), including which operator carries feedback.
const ALGORITHMS: AlgoDef[] = [
  // 1: OP6->OP5->OP4->OP3 (carrier), OP2->OP1(fb) (carrier) parallel pair
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },   // OP1 (fb carrier)
    { modulates: [0], isCarrier: false },                      // OP2 -> OP1
    { modulates: [], isCarrier: true },                        // OP3 carrier
    { modulates: [2], isCarrier: false },                      // OP4 -> OP3
    { modulates: [3], isCarrier: false },                      // OP5 -> OP4
    { modulates: [4], isCarrier: false },                      // OP6 -> OP5
  ],
  // 2: like 1 but feedback on OP6->OP5 chain top instead
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false, feedbackSelf: true },
  ],
  // 3: OP6->OP5->OP4 (carrier); OP3->OP2->OP1(fb) parallel
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [1], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 4: OP6(fb)->OP5->OP4 (carrier); OP3->OP2->OP1 (carrier)
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [1], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false, feedbackSelf: true },
  ],
  // 5: 3 parallel 2-op stacks: OP2->OP1(fb), OP4->OP3, OP6->OP5 (all carriers OP1/OP3/OP5)
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false },
  ],
  // 6: OP2->OP1(fb) carrier; OP4,OP5,OP6->OP3 carrier (multi-mod one carrier)
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [2], isCarrier: false },
    { modulates: [2], isCarrier: false },
  ],
  // 7: OP6(fb)->OP5, OP4->OP3 carrier, OP2->OP1 carrier, OP5->OP3 too (approx dense stack)
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false, feedbackSelf: true },
  ],
  // 8: three carriers, one has a 2-op modulator chain
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [1], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 9: similar to 8, feedback moved
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [1], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 10: two carriers, dense modulator fan-in
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [1], isCarrier: false, feedbackSelf: true },
    { modulates: [1], isCarrier: false },
    { modulates: [0], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 11: OP6(fb) alone -> carrier chain of 3, plus 2 solo carriers
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false, feedbackSelf: true },
  ],
  // 12: dense fan-in variant
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [1], isCarrier: false },
    { modulates: [1], isCarrier: false, feedbackSelf: true },
    { modulates: [1], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 13: similar fan-in, feedback on tail
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [1], isCarrier: false },
    { modulates: [1], isCarrier: false },
    { modulates: [1], isCarrier: false },
    { modulates: [4], isCarrier: false, feedbackSelf: true },
  ],
  // 14: OP6->OP5(fb)->carrier OP4? approximate: two 3-stacks
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [3], isCarrier: false, feedbackSelf: true },
    { modulates: [3], isCarrier: false },
  ],
  // 15: mirror of 14 feedback position
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [2], isCarrier: false },
    { modulates: [3], isCarrier: false },
    { modulates: [3], isCarrier: false },
  ],
  // 16: one carrier, wide modulator fan-in from 5 ops
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [0], isCarrier: false },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 17: similar, feedback earlier
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [0], isCarrier: false },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 18: three stacked modulators into one carrier + 2 solo carriers
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [1], isCarrier: false, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false },
  ],
  // 19: 3 carriers, one fed by 2-op stack, feedback near top
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false },
  ],
  // 20: 3 carriers, dense
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [1], isCarrier: false },
    { modulates: [1], isCarrier: false },
  ],
  // 21: 4 carriers, 2 modulators
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [1], isCarrier: false },
    { modulates: [1], isCarrier: false },
  ],
  // 22: 4 carriers, 2-stack modulator
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [3], isCarrier: false },
    { modulates: [4], isCarrier: false },
  ],
  // 23: 4 carriers, feedback pair
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [4], isCarrier: false },
  ],
  // 24: 5 carriers, 1 modulator
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
  ],
  // 25: 5 carriers, 1 modulator (alt target)
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
  ],
  // 26: 3 carriers + 2-op stack + solo modulator
  [
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [3], isCarrier: false },
  ],
  // 27: mirrors 26 with feedback moved
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [0], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [3], isCarrier: false },
    { modulates: [3], isCarrier: false },
  ],
  // 28: solo carrier chain + 2 solo carriers + 2-stack
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [2], isCarrier: false },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false },
  ],
  // 29: 4 carriers + 2-op stack
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [4], isCarrier: false },
  ],
  // 30: 4 carriers + solo modulator (feedback)
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
  ],
  // 31: 5 carriers + 1 modulator feeding one of them
  [
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [0], isCarrier: false, feedbackSelf: true },
  ],
  // 32: all 6 operators are carriers (additive / organ mode)
  [
    { modulates: [], isCarrier: true, feedbackSelf: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
    { modulates: [], isCarrier: true },
  ],
];

// Fixed-frequency table lookup (used when oscillator.mode === 'fixed').
// DX7 fixed mode: coarse selects a power-of-ten multiplier of a base freq table.
const FIXED_FREQS = [1, 10, 100, 1000, 1, 10, 100, 1000, 1, 10, 100, 1000, 1, 10, 100, 1000,
  1, 10, 100, 1000, 1, 10, 100, 1000, 1, 10, 100, 1000, 1, 10, 100, 1000];

function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function dx7RateToSeconds(rate: number, isRelease = false): number {
  // DX7 EG rates are 0-99, higher = faster. Approximate exponential mapping
  // to realistic seconds (rate 99 ~ a few ms, rate 0 ~ tens of seconds).
  const clamped = Math.max(0, Math.min(99, rate));
  const t = 1 - clamped / 99;
  const seconds = 0.005 + t * t * (isRelease ? 12 : 8);
  return Math.max(0.003, seconds);
}

function dx7LevelToGain(level: number): number {
  // DX7 output level 0-99 is roughly logarithmic in perceived amplitude.
  const clamped = Math.max(0, Math.min(99, level));
  return Math.pow(clamped / 99, 2);
}

interface OperatorVoiceNode {
  osc: OscillatorNode;
  outputGain: GainNode;   // EG-controlled output amplitude
  modIndexGain: GainNode; // scales this operator's output before feeding a modulator target
  feedbackGain?: GainNode;
}

class DX7Voice {
  private ctx: AudioContext;
  private destination: AudioNode;
  private opNodes: OperatorVoiceNode[] = [];
  private note: number;
  private startedAt: number;
  private releasedAt: number | null = null;
  private params: DX7Params;

  constructor(ctx: AudioContext, destination: AudioNode, params: DX7Params, note: number, velocity: number) {
    this.ctx = ctx;
    this.destination = destination;
    this.params = params;
    this.note = note;
    this.startedAt = ctx.currentTime;
    this.build(velocity);
  }

  private build(velocity: number) {
    const { operators, algorithm, feedback } = this.params;
    const algo = ALGORITHMS[Math.max(0, Math.min(31, algorithm - 1))];
    const now = this.ctx.currentTime;
    const velScale = 0.4 + 0.6 * (velocity / 127);

    // First pass: create oscillator + gain chain for every operator.
    for (let i = 0; i < 6; i++) {
      const op = operators[i] ?? operators[operators.length - 1];
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';

      const freq = this.operatorFrequency(op);
      osc.frequency.setValueAtTime(freq, now);

      const outputGain = this.ctx.createGain();
      outputGain.gain.setValueAtTime(0, now);

      const modIndexGain = this.ctx.createGain();
      // Modulation index scaled by output level and a fixed FM depth constant.
      const modDepth = dx7LevelToGain(op.outputLevel) * freq * 4;
      modIndexGain.gain.setValueAtTime(modDepth, now);

      osc.connect(outputGain);
      outputGain.connect(modIndexGain);

      this.opNodes.push({ osc, outputGain, modIndexGain });
    }

    // Second pass: wire modulation routing and feedback per algorithm.
    for (let i = 0; i < 6; i++) {
      const node = this.opNodes[i];
      const algoNode = algo[i];

      if (algoNode.isCarrier) {
        // Carrier -> mix bus (use outputGain directly, not the mod-scaled path)
        const carrierMix = this.ctx.createGain();
        carrierMix.gain.setValueAtTime(1, now);
        node.outputGain.connect(carrierMix);
        carrierMix.connect(this.destination);
      }

      for (const targetIdx of algoNode.modulates) {
        const target = this.opNodes[targetIdx];
        node.modIndexGain.connect(target.osc.frequency);
      }

      if (algoNode.feedbackSelf) {
        const fbGain = this.ctx.createGain();
        const fbAmount = (feedback / 7) * this.operatorFrequency(operators[i] ?? operators[0]) * 0.5;
        fbGain.gain.setValueAtTime(fbAmount, now);
        node.outputGain.connect(fbGain);
        fbGain.connect(node.osc.frequency);
        node.feedbackGain = fbGain;
      }
    }

    // Third pass: envelope generators (per operator) and start oscillators.
    for (let i = 0; i < 6; i++) {
      const op = operators[i] ?? operators[operators.length - 1];
      const node = this.opNodes[i];
      this.applyEnvelope(node.outputGain.gain, op, velScale);
      node.osc.start(now);
    }
  }

  private operatorFrequency(op: DX7Operator): number {
    const baseFreq = midiToFreq(this.note + (this.params.transpose - 24));
    if (op.oscillator.mode === 'fixed') {
      const idx = Math.max(0, Math.min(31, op.oscillator.coarse));
      return FIXED_FREQS[idx] * (1 + op.oscillator.fine / 99);
    }
    const ratio = op.oscillator.coarse === 0 ? 0.5 : op.oscillator.coarse;
    const fineMul = 1 + op.oscillator.fine / 100;
    const detuneMul = Math.pow(2, (op.oscillator.detune || 0) / 1200);
    return baseFreq * ratio * fineMul * detuneMul;
  }

  private applyEnvelope(gainParam: AudioParam, op: DX7Operator, velScale: number) {
    const now = this.ctx.currentTime;
    const peak = dx7LevelToGain(op.eg.level[0]) * velScale;
    const decayLevel = dx7LevelToGain(op.eg.level[1]) * velScale;
    const sustainLevel = dx7LevelToGain(op.eg.level[2]) * velScale;

    const attackTime = dx7RateToSeconds(op.eg.rate[0]);
    const decayTime = dx7RateToSeconds(op.eg.rate[1]);
    const decay2Time = dx7RateToSeconds(op.eg.rate[2]);

    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(0.0001, now);
    gainParam.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + attackTime);
    gainParam.exponentialRampToValueAtTime(Math.max(0.0001, decayLevel), now + attackTime + decayTime);
    gainParam.exponentialRampToValueAtTime(Math.max(0.0001, sustainLevel), now + attackTime + decayTime + decay2Time);
  }

  release() {
    if (this.releasedAt !== null) return;
    this.releasedAt = this.ctx.currentTime;
    const now = this.releasedAt;

    this.opNodes.forEach((node, i) => {
      const op = this.params.operators[i] ?? this.params.operators[this.params.operators.length - 1];
      const releaseTime = dx7RateToSeconds(op.eg.rate[3], true);
      const g = node.outputGain.gain;
      const currentValue = Math.max(0.0001, g.value);
      g.cancelScheduledValues(now);
      g.setValueAtTime(currentValue, now);
      g.exponentialRampToValueAtTime(0.0001, now + releaseTime);
      node.osc.stop(now + releaseTime + 0.05);
    });
  }

  isFinished(): boolean {
    if (this.releasedAt === null) return false;
    return this.ctx.currentTime > this.releasedAt + 2.0;
  }

  forceStop() {
    const now = this.ctx.currentTime;
    this.opNodes.forEach(node => {
      try {
        node.outputGain.gain.cancelScheduledValues(now);
        node.outputGain.gain.setValueAtTime(0, now);
        node.osc.stop(now + 0.02);
      } catch {
        // already stopped
      }
    });
  }
}

export interface AlgorithmVisualization {
  operators: { index: number; isCarrier: boolean; hasFeedback: boolean; modulates: number[] }[];
}

export function getAlgorithmVisualization(algorithm: number): AlgorithmVisualization {
  const algo = ALGORITHMS[Math.max(0, Math.min(31, algorithm - 1))];
  return {
    operators: algo.map((node, i) => ({
      index: i,
      isCarrier: node.isCarrier,
      hasFeedback: node.feedbackSelf ?? false,
      modulates: node.modulates,
    })),
  };
}

export class DX7Engine {
  private ctx: AudioContext;
  private destination: AudioNode;
  private params: DX7Params | null = null;
  private activeVoices: Map<number, DX7Voice> = new Map();
  private cleanupInterval: number;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.destination = destination;
    this.cleanupInterval = window.setInterval(() => this.cleanupFinishedVoices(), 500);
  }

  setParams(params: DX7Params) {
    this.params = params;
  }

  getParams(): DX7Params | null {
    return this.params;
  }

  noteOn(midiNote: number, velocity: number = 100) {
    if (!this.params) return;
    // Retrigger: stop any existing voice on this note first.
    this.activeVoices.get(midiNote)?.forceStop();
    const voice = new DX7Voice(this.ctx, this.destination, this.params, midiNote, velocity);
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

  private cleanupFinishedVoices() {
    // Voices remove themselves from the map on noteOff; this is a safety
    // net for voices that finish their release tail without an explicit
    // noteOff (e.g. test-note timers).
  }

  dispose() {
    window.clearInterval(this.cleanupInterval);
    this.activeVoices.forEach(v => v.forceStop());
    this.activeVoices.clear();
  }
}

export { ALGORITHMS };
