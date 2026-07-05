import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { programEngine } from './ProgramEngine';
import { engine } from './AudioEngine';

vi.mock('./AudioEngine', () => ({
  engine: {
    playSlice: vi.fn(),
    stopPad: vi.fn(),
    applySaturation: vi.fn(),
  },
}));

vi.mock('./SequencerEngine', () => ({
  sequencer: {
    getBpm: vi.fn(() => 92),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  programEngine.program = programEngine['createEmptyProgram']('A');
  programEngine.onTriggerPad = null;
});

function addMockSample(slices: { id: string; gain?: number; pitch?: number }[] = [{ id: 's1' }]): void {
  programEngine.setSample({
    id: 'test-sample',
    name: 'Test',
    rawBuffer: {} as AudioBuffer,
    sampleRate: 44100,
    bitDepth: 16,
    slices: slices.map((s) => ({
      id: s.id,
      start: 0,
      end: 100,
      attack: 0,
      decay: 0,
      pitch: s.pitch ?? 0,
      gain: s.gain ?? 1,
      padAssignment: null,
    })),
  });
}

describe('ProgramEngine', () => {
  describe('createEmptyProgram', () => {
    it('returns 16 pads with correct default values', () => {
      const pads = programEngine.program.pads;
      expect(pads).toHaveLength(16);

      for (const pad of pads) {
        expect(pad.velocityCurve).toBe('linear');
        expect(pad.swing).toBe(50);
        expect(pad.muteGroup).toBeNull();
        expect(pad.chokeGroup).toBeNull();
        expect(pad.layers).toEqual([]);
        expect(pad.assignedSliceId).toBeNull();
        expect(pad.polyphony).toBe('mono');
      }
    });

    it('creates a program with a UUID id and bank A', () => {
      const prog = programEngine.program;
      expect(prog.id).toBeTruthy();
      expect(prog.bank).toBe('A');
      expect(prog.name).toBe('Soulful Crate');
    });
  });

  describe('assignLayerToPad', () => {
    it('adds a layer to the pad and sets assignedSliceId', () => {
      const layer = { sliceId: 'slice-1', velocityMin: 0, velocityMax: 127 };
      programEngine.assignLayerToPad(0, layer);

      const pad = programEngine.program.pads[0];
      expect(pad.layers).toHaveLength(1);
      expect(pad.layers[0]).toEqual(layer);
      expect(pad.assignedSliceId).toBe('slice-1');
    });

    it('does not overwrite an existing assignedSliceId', () => {
      const pad = programEngine.program.pads[0];
      pad.assignedSliceId = 'existing';

      programEngine.assignLayerToPad(0, { sliceId: 'new', velocityMin: 0, velocityMax: 127 });
      expect(pad.assignedSliceId).toBe('existing');
    });

    it('does nothing for an invalid padId', () => {
      expect(() =>
        programEngine.assignLayerToPad(99, { sliceId: 'x', velocityMin: 0, velocityMax: 127 }),
      ).not.toThrow();
    });
  });

  describe('clearPad', () => {
    it('clears layers and assignedSliceId', () => {
      programEngine.assignLayerToPad(0, { sliceId: 's1', velocityMin: 0, velocityMax: 127 });
      expect(programEngine.program.pads[0].layers).toHaveLength(1);

      programEngine.clearPad(0);

      const pad = programEngine.program.pads[0];
      expect(pad.layers).toEqual([]);
      expect(pad.assignedSliceId).toBeNull();
    });

    it('does nothing for an invalid padId', () => {
      expect(() => programEngine.clearPad(99)).not.toThrow();
    });
  });

  describe('setSample / getSample', () => {
    it('round-trips a sample', () => {
      const sample = {
        id: 'test-sample',
        name: 'Test',
        rawBuffer: null,
        sampleRate: 44100,
        bitDepth: 16,
        slices: [],
      };
      programEngine.setSample(sample);
      expect(programEngine.getSample()).toEqual(sample);
    });

    it('returns null when no sample has been set', () => {
      expect(programEngine.getSample()).toBeNull();
    });
  });

  describe('getVelocityScaled', () => {
    it('linear returns v / 127', () => {
      expect(programEngine['getVelocityScaled'](64, 'linear')).toBe(64 / 127);
      expect(programEngine['getVelocityScaled'](0, 'linear')).toBe(0);
      expect(programEngine['getVelocityScaled'](127, 'linear')).toBe(1);
    });

    it('exponential reduces velocities below max', () => {
      const linear = 64 / 127;
      expect(programEngine['getVelocityScaled'](64, 'exponential')).toBeLessThan(linear);
    });

    it('exponential at max velocity returns 1', () => {
      expect(programEngine['getVelocityScaled'](127, 'exponential')).toBe(1);
    });

    it('logarithmic boosts velocities below max', () => {
      const linear = 64 / 127;
      expect(programEngine['getVelocityScaled'](64, 'logarithmic')).toBeGreaterThan(linear);
    });

    it('logarithmic at max velocity returns 1', () => {
      expect(programEngine['getVelocityScaled'](127, 'logarithmic')).toBe(1);
    });

    it('clamps input to 0–127', () => {
      expect(programEngine['getVelocityScaled'](-10, 'linear')).toBe(0);
      expect(programEngine['getVelocityScaled'](200, 'linear')).toBe(1);
    });

    it('defaults to linear for unknown curve', () => {
      expect(programEngine['getVelocityScaled'](64, 'soft' as any)).toBe(64 / 127);
    });
  });

  describe('triggerPad', () => {
    it('does not crash with an invalid padId', () => {
      expect(() => programEngine.triggerPad(99)).not.toThrow();
      expect(engine.playSlice).not.toHaveBeenCalled();
    });

    it('does nothing when onTriggerPad returns true', () => {
      programEngine.onTriggerPad = vi.fn(() => true);
      programEngine.triggerPad(0);
      expect(engine.playSlice).not.toHaveBeenCalled();
    });

    it('calls onTriggerPad with the correct arguments', () => {
      programEngine.onTriggerPad = vi.fn(() => true);
      programEngine.triggerPad(3, 100, 0.5);
      expect(programEngine.onTriggerPad).toHaveBeenCalledWith(3, 100, 0.5);
    });
  });

  describe('triggerPad with linkedPadIds', () => {
    it('triggers linked pads in addition to the target pad', () => {
      addMockSample();
      programEngine.assignSliceToPad(0, 's1');
      programEngine.assignSliceToPad(1, 's1');
      programEngine.assignSliceToPad(2, 's1');
      programEngine.setPadParam(0, 'linkedPadIds', [1, 2]);

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.playSlice).toHaveBeenCalledTimes(3);
    });

    it('skips linked padIds that do not match any pad', () => {
      addMockSample();
      programEngine.assignSliceToPad(0, 's1');
      programEngine.setPadParam(0, 'linkedPadIds', [99]);

      vi.clearAllMocks();
      programEngine.triggerPad(0);
      expect(engine.playSlice).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeTrigger', () => {
    it('calls chokeGroup and stops pads sharing the same group', () => {
      addMockSample();
      programEngine.program.pads[0].chokeGroup = 1;
      programEngine.program.pads[1].chokeGroup = 1;
      programEngine.program.pads[2].chokeGroup = 2;
      programEngine.assignSliceToPad(0, 's1');

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.stopPad).toHaveBeenCalledWith(0);
      expect(engine.stopPad).toHaveBeenCalledWith(1);
      expect(engine.stopPad).not.toHaveBeenCalledWith(2);
    });

    it('iterates layers and falls back to assignedSliceId when no layer matches', () => {
      addMockSample([
        { id: 'layer-lo', gain: 0.5 },
        { id: 'layer-hi', gain: 1.5 },
        { id: 'fallback', gain: 1 },
      ]);

      const pad = programEngine.program.pads[0];
      pad.assignedSliceId = 'fallback';
      pad.layers = [
        { sliceId: 'layer-lo', velocityMin: 0, velocityMax: 40 },
        { sliceId: 'layer-hi', velocityMin: 80, velocityMax: 127 },
      ];

      vi.clearAllMocks();
      programEngine.triggerPad(0, 20);
      expect(engine.playSlice).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      programEngine.triggerPad(0, 60);
      expect(engine.playSlice).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();
      programEngine.triggerPad(0, 100);
      expect(engine.playSlice).toHaveBeenCalledTimes(1);
    });

    it('does not play when no layer matches and there is no fallback', () => {
      addMockSample([{ id: 'layer-only', gain: 1 }]);

      const pad = programEngine.program.pads[0];
      pad.assignedSliceId = null;
      pad.layers = [{ sliceId: 'layer-only', velocityMin: 80, velocityMax: 127 }];

      vi.clearAllMocks();
      programEngine.triggerPad(0, 20);
      expect(engine.playSlice).not.toHaveBeenCalled();
    });

    it('chooses no layers when final velocity is outside all layer ranges', () => {
      addMockSample([{ id: 'quiet' }, { id: 'loud' }]);
      const pad = programEngine.program.pads[0];
      pad.assignedSliceId = 'quiet';
      pad.layers = [
        { sliceId: 'quiet', velocityMin: 0, velocityMax: 50 },
        { sliceId: 'loud', velocityMin: 80, velocityMax: 127 },
      ];

      vi.clearAllMocks();
      programEngine.triggerPad(0, 65);
      expect(engine.playSlice).toHaveBeenCalledTimes(1);
    });
  });

  describe('playLayer', () => {
    it('merges pad filter and ADSR with slice data', () => {
      addMockSample([{ id: 's1', gain: 0.5, pitch: 5 }]);
      programEngine.assignSliceToPad(0, 's1');

      const pad = programEngine.program.pads[0];
      pad.filter = {
        enabled: true,
        type: 'lowpass',
        cutoff: 1000,
        resonance: 2,
        envelope: 0,
        keyTrack: 0,
      };
      pad.ampEnv = { attack: 0.01, decay: 0.1, sustain: 0.8, release: 0.5 };
      pad.pitchOffset = 3;

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      const merged = engine.playSlice.mock.calls[0][1];
      expect(merged.pitch).toBe(8);
      expect(merged.gain).toBe(0.5);
      expect(merged.filter).toEqual({ cutoff: 1000, resonance: 2 });
      expect(merged.attack).toBe(0.01);
      expect(merged.decay).toBe(0.1);
      expect(merged.sustain).toBe(0.8);
      expect(merged.release).toBe(0.5);
    });

    it('calls engine.applySaturation when pad.saturation > 0', () => {
      addMockSample();
      programEngine.assignSliceToPad(0, 's1');
      programEngine.program.pads[0].saturation = 0.5;

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.applySaturation).toHaveBeenCalledWith(0.5);
    });

    it('does not call applySaturation when saturation is 0 or undefined', () => {
      addMockSample();
      programEngine.assignSliceToPad(0, 's1');

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.applySaturation).not.toHaveBeenCalled();
    });

    it('skips layers whose slice is not found in any sample', () => {
      addMockSample();
      const pad = programEngine.program.pads[0];
      pad.assignedSliceId = 's1';
      pad.layers = [{ sliceId: 'nonexistent', velocityMin: 0, velocityMax: 127 }];

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.playSlice).toHaveBeenCalledTimes(1);
    });

    it('skips samples with no rawBuffer', () => {
      programEngine.setSample({
        id: 'no-buffer',
        name: 'No Buffer',
        rawBuffer: null,
        sampleRate: 44100,
        bitDepth: 16,
        slices: [{ id: 's1', start: 0, end: 100, attack: 0, decay: 0, pitch: 0, gain: 1, padAssignment: null }],
      });
      programEngine.assignSliceToPad(0, 's1');

      vi.clearAllMocks();
      programEngine.triggerPad(0);

      expect(engine.playSlice).not.toHaveBeenCalled();
    });
  });

  describe('setPadParam', () => {
    it('updates a pad property', () => {
      programEngine.setPadParam(0, 'swing', 75);
      expect(programEngine.program.pads[0].swing).toBe(75);
    });

    it('does nothing for an invalid padId', () => {
      expect(() => programEngine.setPadParam(99, 'swing', 75)).not.toThrow();
    });
  });

  describe('randomizePad', () => {
    it('sets random values within expected ranges', () => {
      vi.spyOn(Math, 'random')
        .mockReturnValueOnce(0) // pitchOffset
        .mockReturnValueOnce(0) // swing
        .mockReturnValueOnce(0); // saturation

      programEngine.randomizePad(0);
      const pad = programEngine.program.pads[0];
      expect(pad.pitchOffset).toBe(-3);
      expect(pad.swing).toBe(50);
      expect(pad.saturation).toBe(0);
    });

    it('does nothing for an invalid padId', () => {
      expect(() => programEngine.randomizePad(99)).not.toThrow();
    });
  });

  describe('getPad', () => {
    it('returns the pad by ID', () => {
      const pad = programEngine.getPad(5);
      expect(pad).toBeDefined();
      expect(pad!.padId).toBe(5);
    });

    it('returns undefined for a nonexistent pad', () => {
      expect(programEngine.getPad(99)).toBeUndefined();
    });
  });

  describe('assignSliceToPad', () => {
    it('adds a layer, sets assignedSliceId, and sets padAssignment on the slice', () => {
      addMockSample([{ id: 'slice-1' }]);
      programEngine.assignSliceToPad(0, 'slice-1');

      const pad = programEngine.program.pads[0];
      expect(pad.layers).toHaveLength(1);
      expect(pad.layers[0]).toEqual({ sliceId: 'slice-1', velocityMin: 0, velocityMax: 127 });
      expect(pad.assignedSliceId).toBe('slice-1');
      expect(programEngine.program.samples[0].slices[0].padAssignment).toBe(0);
    });

    it('does nothing for an invalid padId', () => {
      expect(() => programEngine.assignSliceToPad(99, 'slice-1')).not.toThrow();
    });
  });

  describe('triggerPadAtTime', () => {
    it('delegates to triggerPad with all arguments', () => {
      const spy = vi.spyOn(programEngine, 'triggerPad');
      programEngine.triggerPadAtTime(3, 100, 1.5);
      expect(spy).toHaveBeenCalledWith(3, 100, 1.5);
      spy.mockRestore();
    });

    it('delegates to triggerPad with default velocity', () => {
      const spy = vi.spyOn(programEngine, 'triggerPad');
      programEngine.triggerPadAtTime(4);
      expect(spy).toHaveBeenCalledWith(4, 127, undefined);
      spy.mockRestore();
    });
  });
});
