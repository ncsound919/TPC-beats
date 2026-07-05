import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyserPool } from './AnalyserPool';
import type { BaseAudioContext, BusName } from '../types';

const BUS_NAMES: BusName[] = ['mpc', 'synth', 'rompler', 'master'];

function mockAudioParam(initialValue = 0) {
  return {
    value: initialValue,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
  };
}

function mockAnalyserNode() {
  let fftSize = 256;
  return {
    get frequencyBinCount() {
      return fftSize / 2;
    },
    get fftSize() {
      return fftSize;
    },
    set fftSize(v: number) {
      fftSize = v;
    },
    smoothingTimeConstant: 0.8,
    getByteFrequencyData: vi.fn((buf: Uint8Array) => {
      buf.fill(128);
    }),
    getByteTimeDomainData: vi.fn((buf: Uint8Array) => {
      buf.fill(128);
    }),
    disconnect: vi.fn(),
  };
}

function createMockContext() {
  let sampleRate = 44100;
  return {
    get sampleRate() {
      return sampleRate;
    },
    createAnalyser: vi.fn(() => mockAnalyserNode()),
    destination: { connect: vi.fn(), disconnect: vi.fn() },
  };
}

type MockContext = ReturnType<typeof createMockContext>;

describe('AnalyserPool', () => {
  let ctx: MockContext;
  let pool: AnalyserPool;

  beforeEach(() => {
    ctx = createMockContext();
    pool = new AnalyserPool(ctx as unknown as BaseAudioContext);
  });

  it('creates an instance', () => {
    expect(pool).toBeInstanceOf(AnalyserPool);
  });

  it('creates 4 AnalyserNodes on construction (one per bus)', () => {
    expect(ctx.createAnalyser).toHaveBeenCalledTimes(4);
  });

  it('returns an AnalyserNode for each valid bus name via getAnalyserNode', () => {
    for (const bus of BUS_NAMES) {
      const node = pool.getAnalyserNode(bus);
      expect(node).toBeDefined();
    }
  });

  it('returns the same AnalyserNode for repeated calls (caching)', () => {
    for (const bus of BUS_NAMES) {
      const first = pool.getAnalyserNode(bus);
      const second = pool.getAnalyserNode(bus);
      expect(first).toBe(second);
    }
  });

  it('returns a Uint8Array of correct length from getFrequencyData', () => {
    const data = pool.getFrequencyData('mpc');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(128); // default fftSize 256 / 2
  });

  it('returns a Uint8Array of correct length from getTimeDomainData', () => {
    const data = pool.getTimeDomainData('mpc');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(256); // default fftSize
  });

  it('changes the FFT size and updates analysers on setFFTSize', () => {
    pool.setFFTSize(1024);
    const node = pool.getAnalyserNode('mpc')!;
    expect(node.fftSize).toBe(1024);
    expect(pool.getFrequencyData('mpc').length).toBe(512);
  });

  it('throws on setFFTSize for non-power-of-2 values', () => {
    expect(() => pool.setFFTSize(100)).toThrow();
    expect(() => pool.setFFTSize(0)).toThrow();
    expect(() => pool.setFFTSize(500)).toThrow();
  });

  it('returns a [number, number] tuple from getPeakFrequency', () => {
    const result = pool.getPeakFrequency('mpc');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(typeof result[0]).toBe('number');
    expect(typeof result[1]).toBe('number');
  });

  it('returns a number from getAverageFrequency', () => {
    const result = pool.getAverageFrequency('mpc');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(255);
  });

  it('clears all cached data on dispose', () => {
    pool.getFrequencyData('mpc');
    pool.getTimeDomainData('mpc');
    pool.dispose();
    expect(pool.getAnalyserNode('mpc')).toBeUndefined();
  });
});
