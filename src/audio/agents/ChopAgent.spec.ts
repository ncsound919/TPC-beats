import { describe, it, expect } from 'vitest';
import { ChopAgent } from './ChopAgent';

/**
 * Minimal AudioBuffer stand-in. ChopAgent.detectTransients only reads
 * sampleRate/length/duration/numberOfChannels/getChannelData, so a full
 * Web Audio API implementation isn't needed to exercise the DSP logic.
 */
function makeBuffer(samples: Float32Array, sampleRate = 44100): AudioBuffer {
  return {
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

function silence(seconds: number, sampleRate = 44100): Float32Array {
  return new Float32Array(Math.floor(seconds * sampleRate));
}

/** A short burst of full-scale noise, useful as a stand-in for a drum hit. */
function noiseBurst(seconds: number, sampleRate = 44100, seed = 1): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  let s = seed;
  for (let i = 0; i < n; i++) {
    // Simple deterministic pseudo-random generator (xorshift) so tests are stable.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = ((s % 1000) / 1000) * 2 - 1;
  }
  return out;
}

function concat(...arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

describe('ChopAgent.detectTransients', () => {
  it('returns at least one slice spanning the whole buffer for pure silence', () => {
    const buffer = makeBuffer(silence(1));
    const slices = ChopAgent.detectTransients(buffer);

    expect(slices.length).toBeGreaterThanOrEqual(1);
    expect(slices[0].start).toBe(0);
    expect(slices[slices.length - 1].end).toBeCloseTo(buffer.duration, 2);
  });

  it('detects an onset when a loud transient follows silence', () => {
    const sampleRate = 44100;
    const samples = concat(
      silence(0.3, sampleRate),
      noiseBurst(0.3, sampleRate),
      silence(0.3, sampleRate),
    );
    const buffer = makeBuffer(samples, sampleRate);

    const slices = ChopAgent.detectTransients(buffer, { minSliceLength: 0.05 });

    // Silence -> noise should register as at least two slices (before/after onset).
    expect(slices.length).toBeGreaterThanOrEqual(2);
    // First marker after 0 should land near the ~0.3s onset, within one analysis window.
    const secondSliceStart = slices[1]?.start ?? 0;
    expect(secondSliceStart).toBeGreaterThan(0.2);
    expect(secondSliceStart).toBeLessThan(0.4);
  });

  it('always ends the final slice at the buffer duration', () => {
    const sampleRate = 44100;
    const samples = concat(noiseBurst(0.2, sampleRate), silence(0.5, sampleRate));
    const buffer = makeBuffer(samples, sampleRate);

    const slices = ChopAgent.detectTransients(buffer);
    expect(slices[slices.length - 1].end).toBeCloseTo(buffer.duration, 2);
  });

  it('respects minSliceLength by not producing slices shorter than requested', () => {
    const sampleRate = 44100;
    // Three bursts spaced widely enough apart to register as separate onsets.
    const samples = concat(
      noiseBurst(0.05, sampleRate, 1),
      silence(0.2, sampleRate),
      noiseBurst(0.05, sampleRate, 2),
      silence(0.2, sampleRate),
      noiseBurst(0.05, sampleRate, 3),
      silence(0.3, sampleRate),
    );
    const buffer = makeBuffer(samples, sampleRate);

    const minSliceLength = 0.1;
    const slices = ChopAgent.detectTransients(buffer, { minSliceLength });

    expect(slices.length).toBeGreaterThan(1);
    for (let i = 0; i < slices.length - 1; i++) {
      const duration = slices[i].end - slices[i].start;
      expect(duration).toBeGreaterThanOrEqual(minSliceLength - 1e-6);
    }
  });

  it('caps the number of slices at maxSlices', () => {
    const sampleRate = 44100;
    const parts: Float32Array[] = [];
    for (let i = 0; i < 10; i++) {
      parts.push(noiseBurst(0.05, sampleRate, i + 1));
      parts.push(silence(0.15, sampleRate));
    }
    const buffer = makeBuffer(concat(...parts), sampleRate);

    const slices = ChopAgent.detectTransients(buffer, { minSliceLength: 0.05, maxSlices: 3 });
    expect(slices.length).toBeLessThanOrEqual(3);
  });

  it('throws for a non-power-of-two fftSize', () => {
    const buffer = makeBuffer(silence(0.5));
    expect(() => ChopAgent.detectTransients(buffer, { fftSize: 1000 })).toThrow(
      /power of two/i,
    );
  });
});

describe('ChopAgent.assignSlicesToPads', () => {
  it('returns an empty array for no slices', () => {
    expect(ChopAgent.assignSlicesToPads([])).toEqual([]);
  });

  it('assigns every slice a pad number within the 16-pad range', () => {
    const slices = Array.from({ length: 20 }, (_, i) => ({
      id: `slice_${i}`,
      start: i * 0.1,
      end: i * 0.1 + 0.1,
      attack: 0.003,
      decay: 0.05,
      pitch: 0,
      gain: 1,
      padAssignment: null as number | null,
    }));

    const assigned = ChopAgent.assignSlicesToPads(slices);
    expect(assigned).toHaveLength(slices.length);
    for (const slice of assigned) {
      expect(slice.padAssignment).not.toBeNull();
      expect(slice.padAssignment!).toBeGreaterThanOrEqual(0);
      expect(slice.padAssignment!).toBeLessThanOrEqual(15);
    }
  });

  it('preserves slice order (only padAssignment is mutated)', () => {
    const slices = Array.from({ length: 4 }, (_, i) => ({
      id: `slice_${i}`,
      start: i,
      end: i + 1,
      attack: 0.003,
      decay: 0.05,
      pitch: 0,
      gain: 1,
      padAssignment: null as number | null,
    }));

    const assigned = ChopAgent.assignSlicesToPads(slices);
    expect(assigned.map(s => s.id)).toEqual(slices.map(s => s.id));
  });
});
