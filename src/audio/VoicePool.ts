import { BaseAudioContext } from '../types';

// ----------------------------------------------------------------------
// VoiceGain — ADSR envelope controller for a single GainNode
// ----------------------------------------------------------------------
export class VoiceGain {
  public node: GainNode;
  private releaseTime: number = 0.3;

  constructor(ctx: BaseAudioContext) {
    this.node = ctx.createGain();
    this.node.gain.value = 0.0001;
  }

  public applyADSR(
    params: {
      attack: number;
      decay: number;
      sustain?: number;
      release?: number;
      targetGain: number;
    },
    now: number
  ): void {
    const { attack, decay, sustain = 0.6, release = 0.3, targetGain } = params;
    this.releaseTime = release;

    const safeAttack = Math.max(0.001, attack);
    const safeDecay = Math.max(0.001, decay);
    const safeSustain = Math.max(0.0001, sustain);
    const sustainGain = Math.max(0.0001, targetGain * safeSustain);

    this.node.gain.cancelScheduledValues(now);
    this.node.gain.setValueAtTime(0.0001, now);
    this.node.gain.linearRampToValueAtTime(targetGain, now + safeAttack);
    this.node.gain.exponentialRampToValueAtTime(sustainGain, now + safeAttack + safeDecay);
  }

  public triggerRelease(now: number): number {
    const current = this.node.gain.value;
    this.node.gain.cancelScheduledValues(now);
    this.node.gain.setValueAtTime(Math.max(0.0001, current), now);
    this.node.gain.exponentialRampToValueAtTime(0.0001, now + this.releaseTime);
    return now + this.releaseTime;
  }
}

// ----------------------------------------------------------------------
// Voice — a single playable note instance
// ----------------------------------------------------------------------
export interface Voice {
  source: AudioBufferSourceNode | OscillatorNode;
  gain: VoiceGain;
  node: AudioNode;
  noteId: number | string | null;
  endTime: number;
}

// ----------------------------------------------------------------------
// VoicePool — polyphonic voice manager with note tracking + cleanup
// ----------------------------------------------------------------------
export class VoicePool {
  private ctx: BaseAudioContext;
  private maxPolyphony: number;
  private activeVoices: Set<Voice> = new Set();

  constructor(ctx: BaseAudioContext, maxPolyphony: number = 32) {
    this.ctx = ctx;
    this.maxPolyphony = maxPolyphony;
  }

  public get(noteId?: number | string): Voice | null {
    if (noteId !== undefined) {
      const existing = this.findByNoteId(noteId);
      if (existing) {
        this.steal(existing);
      }
    }

    if (this.activeVoices.size >= this.maxPolyphony) {
      const oldest = this.findStealCandidate();
      if (oldest) {
        this.steal(oldest);
      }
    }

    const source = this.ctx.createBufferSource();
    const gain = new VoiceGain(this.ctx);

    const voice: Voice = {
      source,
      gain,
      node: gain.node,
      noteId: noteId ?? null,
      endTime: 0,
    };

    source.onended = () => {
      this.cleanup(voice);
    };

    this.activeVoices.add(voice);
    return voice;
  }

  public noteOff(noteId: number | string, now?: number): void {
    const voice = this.findByNoteId(noteId);
    if (!voice) return;

    const releaseStart = now ?? this.ctx.currentTime;
    const endTime = voice.gain.triggerRelease(releaseStart);
    voice.endTime = endTime;

    if (voice.source instanceof AudioBufferSourceNode) {
      voice.source.stop(endTime + 0.01);
    } else if (voice.source instanceof OscillatorNode) {
      voice.source.stop(endTime + 0.01);
    }
  }

  public steal(voice: Voice): void {
    const now = this.ctx.currentTime;
    voice.gain.triggerRelease(now);

    const stopTime = now + 0.05;
    try {
      voice.source.stop(stopTime);
    } catch {
      // already stopped
    }
  }

  public release(voice: Voice): void {
    this.activeVoices.delete(voice);
  }

  public releaseAll(): void {
    const now = this.ctx.currentTime;
    this.activeVoices.forEach((voice) => {
      voice.gain.triggerRelease(now);
      try {
        voice.source.stop(now + 0.05);
      } catch {
        // already stopped
      }
    });
  }

  private cleanup(voice: Voice): void {
    this.activeVoices.delete(voice);
    try {
      voice.source.disconnect();
    } catch {
      // already disconnected
    }
    try {
      voice.gain.node.disconnect();
    } catch {
      // already disconnected
    }
  }

  private findByNoteId(noteId: number | string): Voice | undefined {
    for (const voice of this.activeVoices) {
      if (voice.noteId === noteId) {
        return voice;
      }
    }
    return undefined;
  }

  private findStealCandidate(): Voice | null {
    let candidate: Voice | null = null;
    let lowestSustain = Infinity;
    const now = this.ctx.currentTime;

    for (const voice of this.activeVoices) {
      const currentGain = voice.gain.node.gain.value;
      if (currentGain < lowestSustain) {
        lowestSustain = currentGain;
        candidate = voice;
      }
    }

    if (!candidate) {
      candidate = this.activeVoices.values().next().value ?? null;
    }

    return candidate;
  }

  public get activeCount(): number {
    return this.activeVoices.size;
  }
}