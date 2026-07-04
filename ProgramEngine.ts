import { Program, Pad, Sample, Slice, PadLayer } from '../types';
import { engine } from './AudioEngine';
import { sequencer } from './SequencerEngine';

export class ProgramEngine {
  public program: Program;

  constructor() {
    this.program = this.createEmptyProgram('A');
  }

  private createEmptyProgram(bank: Program['bank']): Program {
    const pads: Pad[] = Array.from({ length: 16 }, (_, i) => ({
      padId: i,
      assignedSliceId: null,
      layers: [],
      velocityCurve: 'linear',
      muteGroup: null,
      chokeGroup: null,
      swing: 50,
      polyphony: 'mono',
    }));

    return {
      id: crypto.randomUUID(),
      name: 'Soulful Crate',
      bank,
      pads,
      samples: [],
      fxSettings: {
        bitcrush: { enabled: false, bitDepth: 12, downsample: 1 },
        saturation: { enabled: false, drive: 1.0 },
        filter: { enabled: false, type: 'lowpass', cutoff: 20000, resonance: 0 },
      },
      mixerSettings: {
        masterVolume: 0.85,
        globalSwing: 54,
      },
    };
  }

  public setSample(sample: Sample): void {
    this.program.samples = [sample];
  }

  public getSample(): Sample | null {
    return this.program.samples[0] || null;
  }

  // === LAYERING (Pete Rock style) ===
  public assignLayerToPad(padId: number, layer: PadLayer): void {
    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;

    pad.layers.push(layer);
    if (!pad.assignedSliceId) {
      pad.assignedSliceId = layer.sliceId;
    }
  }

  public clearPad(padId: number): void {
    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;

    pad.layers = [];
    pad.assignedSliceId = null;
  }

  // === MAIN TRIGGER (The Heart) ===
  public onTriggerPad: ((padId: number, velocity: number, time?: number) => boolean) | null =
    null;

  public triggerPad(padId: number, velocity: number = 127, time?: number): void {
    if (this.onTriggerPad?.(padId, velocity, time)) return;

    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;

    const scaledVel = this.getVelocityScaled(velocity, pad.velocityCurve);
    const finalVel = Math.round(scaledVel * 127);

    // Choke groups (hi-hats, etc.)
    if (pad.chokeGroup !== null) {
      this.chokeGroup(pad.chokeGroup);
    }

    let played = false;

    // Try layers first
    for (const layer of pad.layers) {
      if (finalVel < layer.velocityMin || finalVel > layer.velocityMax) continue;
      played = this.playLayer(layer, finalVel, pad, time) || played;
    }

    // Fallback to main assignment
    if (!played && pad.assignedSliceId) {
      const fallbackLayer: PadLayer = {
        sliceId: pad.assignedSliceId,
        velocityMin: 0,
        velocityMax: 127,
      };
      this.playLayer(fallbackLayer, finalVel, pad, time);
    }
  }

  private playLayer(layer: PadLayer, velocity: number, pad: Pad, time?: number): boolean {
    for (const sample of this.program.samples) {
      const slice = sample.slices.find((s) => s.id === layer.sliceId);
      if (!slice || !sample.rawBuffer) continue;

      const playbackRate = this.calculatePlaybackRate(sample);

      const pitchOffset =
        (slice.pitch ?? 0) +
        (pad.pitchOffset ?? 0) +
        (layer.pitchOffset ?? 0);

      const gain =
        (slice.gain ?? 1) *
        (layer.gain ?? 1);

      engine.playSlice(
        sample.rawBuffer,
        {
          ...slice,
          pitch: pitchOffset,
          gain,
          reverse: pad.reverse ?? slice.reverse ?? false,
        },
        velocity,
        playbackRate,
        time
      );

      if (pad.saturation && pad.saturation > 0) {
        engine.applySaturation(pad.saturation);
      }

      return true;
    }
    return false;
  }

  private calculatePlaybackRate(sample: Sample): number {
    if (sample.type === 'loop' && sample.bpm && sample.loopMode === 'stretch') {
      const targetBpm = sequencer.getBpm?.() || 92;
      return targetBpm / sample.bpm;
    }
    return 1.0;
  }

  private chokeGroup(groupId: number): void {
    this.program.pads.forEach((pad) => {
      if (pad.chokeGroup === groupId) {
        engine.stopPad(pad.padId);
      }
    });
  }

  private getVelocityScaled(velocity: number, curve: Pad['velocityCurve']): number {
    const v = Math.max(0, Math.min(127, velocity)) / 127;
    switch (curve) {
      case 'linear':
        return v;
      case 'exponential':
        return Math.pow(v, 1.4);
      case 'logarithmic':
        return Math.pow(v, 0.7);
      default:
        return v;
    }
  }

  // === Utility Methods ===
  public setPadParam<K extends keyof Pad>(padId: number, param: K, value: Pad[K]): void {
    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;
    pad[param] = value;
  }

  public randomizePad(padId: number): void {
    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;

    pad.pitchOffset = Math.floor(Math.random() * 7) - 3;
    pad.swing = 50 + Math.floor(Math.random() * 18);
    pad.saturation = Math.random() * 0.4;
  }

  public getPad(padId: number): Pad | undefined {
    return this.program.pads.find((p) => p.padId === padId);
  }

  public assignSliceToPad(padId: number, sliceId: string): void {
    const pad = this.program.pads.find((p) => p.padId === padId);
    if (!pad) return;

    pad.layers.push({
      sliceId,
      velocityMin: 0,
      velocityMax: 127,
    });

    pad.assignedSliceId = sliceId;

    for (const sample of this.program.samples) {
      const slice = sample.slices.find((s) => s.id === sliceId);
      if (slice) {
        slice.padAssignment = padId;
        break;
      }
    }
  }

  public triggerPadAtTime(padId: number, velocity: number = 127, time?: number): void {
    this.triggerPad(padId, velocity, time);
  }
}

export const programEngine = new ProgramEngine();