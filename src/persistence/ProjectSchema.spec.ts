import { describe, it, expect } from 'vitest';
import * as v from 'valibot';
import { ProjectFileSchema } from './ProjectSchema';

const validProject = {
  program: {
    samples: [{
      id: 's1', name: 'test', rawBuffer: null,
      sampleRate: 44100, bitDepth: 16,
      slices: [{ id: 'sl1', start: 0, end: 1, attack: 0.01, decay: 0.3, pitch: 0, gain: 1 }],
    }],
  },
  sequence: {
    id: 'seq1', name: 'Pattern 1', bpm: 92, ppqn: 96, lengthBars: 4, events: [],
  },
};

describe('ProjectFileSchema', () => {
  it('valid project data passes validation', () => {
    const result = v.safeParse(ProjectFileSchema, validProject);
    expect(result.success).toBe(true);
  });

  it('missing required field "program" fails', () => {
    const { program, ...noProgram } = validProject as any;
    const result = v.safeParse(ProjectFileSchema, noProgram);
    expect(result.success).toBe(false);
    expect(result.issues!.some(i => i.path?.[0]?.key === 'program')).toBe(true);
  });

  it('missing required field "sequence" fails', () => {
    const { sequence, ...noSequence } = validProject as any;
    const result = v.safeParse(ProjectFileSchema, noSequence);
    expect(result.success).toBe(false);
    expect(result.issues!.some(i => i.path?.[0]?.key === 'sequence')).toBe(true);
  });

  it('invalid sequence.bpm (<20 or >300) fails', () => {
    const low = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, bpm: 15 } });
    expect(low.success).toBe(false);
    const high = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, bpm: 301 } });
    expect(high.success).toBe(false);
  });

  it('invalid sequence.ppqn (<16 or >960) fails', () => {
    const low = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, ppqn: 8 } });
    expect(low.success).toBe(false);
    const high = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, ppqn: 1000 } });
    expect(high.success).toBe(false);
  });

  it('invalid sequence.lengthBars (<1 or >64) fails', () => {
    const low = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, lengthBars: 0 } });
    expect(low.success).toBe(false);
    const high = v.safeParse(ProjectFileSchema, { ...validProject, sequence: { ...validProject.sequence, lengthBars: 65 } });
    expect(high.success).toBe(false);
  });

  it('invalid event timestampPPQN (negative) fails', () => {
    const data = {
      ...validProject,
      sequence: {
        ...validProject.sequence,
        events: [{ timestampPPQN: -1, padId: 0, velocity: 100 }],
      },
    };
    const result = v.safeParse(ProjectFileSchema, data);
    expect(result.success).toBe(false);
  });

  it('invalid event velocity (<0 or >127) fails', () => {
    const low = v.safeParse(ProjectFileSchema, {
      ...validProject,
      sequence: { ...validProject.sequence, events: [{ timestampPPQN: 0, padId: 0, velocity: -1 }] },
    });
    expect(low.success).toBe(false);
    const high = v.safeParse(ProjectFileSchema, {
      ...validProject,
      sequence: { ...validProject.sequence, events: [{ timestampPPQN: 0, padId: 0, velocity: 128 }] },
    });
    expect(high.success).toBe(false);
  });

  it('invalid event padId (<0 or >127) fails', () => {
    const low = v.safeParse(ProjectFileSchema, {
      ...validProject,
      sequence: { ...validProject.sequence, events: [{ timestampPPQN: 0, padId: -1, velocity: 100 }] },
    });
    expect(low.success).toBe(false);
    const high = v.safeParse(ProjectFileSchema, {
      ...validProject,
      sequence: { ...validProject.sequence, events: [{ timestampPPQN: 0, padId: 128, velocity: 100 }] },
    });
    expect(high.success).toBe(false);
  });

  it('valid event with optional fields (id, durationPPQN) passes', () => {
    const data = {
      ...validProject,
      sequence: {
        ...validProject.sequence,
        events: [{ timestampPPQN: 0, padId: 5, velocity: 90, id: 'e1', durationPPQN: 48 }],
      },
    };
    const result = v.safeParse(ProjectFileSchema, data);
    expect(result.success).toBe(true);
  });

  it('invalid sample sampleRate (<8000 or >192000) fails', () => {
    const sample = { id: 's1', name: 'test', rawBuffer: null, sampleRate: 7999, bitDepth: 16, slices: [] };
    const low = v.safeParse(ProjectFileSchema, {
      ...validProject,
      program: { ...validProject.program, samples: [sample] },
    });
    expect(low.success).toBe(false);

    const sampleHigh = { id: 's1', name: 'test', rawBuffer: null, sampleRate: 192001, bitDepth: 16, slices: [] };
    const high = v.safeParse(ProjectFileSchema, {
      ...validProject,
      program: { ...validProject.program, samples: [sampleHigh] },
    });
    expect(high.success).toBe(false);
  });
});
