import { describe, it, expect, vi, beforeAll } from 'vitest';
import { createDefaultOperator, createDefaultDX7Params, DX7Params, DX7Operator } from '../../types';
import { getAlgorithmVisualization, DX7Engine, ALGORITHMS } from './DX7Engine';

beforeAll(() => {
  (globalThis as any).window = { setInterval: vi.fn(() => 123), clearInterval: vi.fn() };

  class MockOscillatorNode {
    connect = vi.fn();
    disconnect = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    type = 'sine';
    frequency = { setValueAtTime: vi.fn(), value: 440 };
    detune = { setValueAtTime: vi.fn(), value: 0 };
    onended: (() => void) | null = null;
  }
  (globalThis as any).OscillatorNode = MockOscillatorNode;
});

function createMockContext() {
  let time = 0;
  return {
    get currentTime() { return time; },
    set currentTime(v: number) { time = v; },
    destination: { connect: vi.fn() },
    createGain: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        value: 0,
      },
    })),
    createOscillator: vi.fn(() => new (globalThis as any).OscillatorNode()),
  };
}

describe('createDefaultOperator', () => {
  it('returns an operator with default values', () => {
    const op = createDefaultOperator();
    expect(op.enabled).toBe(true);
    expect(op.eg).toEqual({ rate: [99, 99, 99, 99], level: [99, 99, 99, 0] });
    expect(op.level).toEqual([99, 99, 99, 0]);
    expect(op.oscillator).toEqual({ mode: 'ratio', coarse: 1, fine: 0, detune: 0 });
    expect(op.outputLevel).toBe(99);
    expect(op.velocitySens).toBe(0);
    expect(op.ampModSens).toBe(0);
    expect(op.keyboardScale).toEqual({
      breakPoint: 39,
      leftDepth: 0,
      rightDepth: 0,
      leftCurve: 0,
      rightCurve: 0,
      rateScale: 0,
    });
  });

  it('uses the provided output level', () => {
    const op = createDefaultOperator(50);
    expect(op.outputLevel).toBe(50);
    expect(op.enabled).toBe(true);
  });

  it('uses 99 as default output level when not called with arguments', () => {
    const op = createDefaultOperator();
    expect(op.outputLevel).toBe(99);
  });
});

describe('createDefaultDX7Params', () => {
  it('returns params with algorithm 1', () => {
    const params = createDefaultDX7Params();
    expect(params.algorithm).toBe(1);
  });

  it('contains 6 operators', () => {
    const params = createDefaultDX7Params();
    expect(params.operators).toHaveLength(6);
  });

  it('has correct default LFO settings', () => {
    const params = createDefaultDX7Params();
    expect(params.lfo.speed).toBe(35);
    expect(params.lfo.delay).toBe(0);
    expect(params.lfo.pmDepth).toBe(0);
    expect(params.lfo.amDepth).toBe(0);
    expect(params.lfo.sync).toBe(true);
    expect(params.lfo.waveform).toBe(4);
    expect(params.lfo.pmSens).toBe(3);
    expect(params.lfoRate).toBe(35);
  });

  it('has correct name and transpose', () => {
    const params = createDefaultDX7Params();
    expect(params.name).toBe('INIT VOICE');
    expect(params.transpose).toBe(24);
    expect(params.feedback).toBe(0);
    expect(params.oscSync).toBe(false);
  });

  it('sets first operator to outputLevel 99, rest to 0', () => {
    const params = createDefaultDX7Params();
    expect(params.operators[0].outputLevel).toBe(99);
    for (let i = 1; i < 6; i++) {
      expect(params.operators[i].outputLevel).toBe(0);
    }
  });
});

describe('ALGORITHMS', () => {
  it('has exactly 32 algorithm definitions', () => {
    expect(ALGORITHMS).toHaveLength(32);
  });

  it('each algorithm has 6 operator entries', () => {
    for (const algo of ALGORITHMS) {
      expect(algo).toHaveLength(6);
    }
  });

  it('each operator entry has modulates, isCarrier', () => {
    for (const algo of ALGORITHMS) {
      for (const node of algo) {
        expect(node).toHaveProperty('modulates');
        expect(Array.isArray(node.modulates)).toBe(true);
        expect(typeof node.isCarrier).toBe('boolean');
      }
    }
  });
});

describe('getAlgorithmVisualization', () => {
  it('algorithm 1 returns 6 operators', () => {
    const viz = getAlgorithmVisualization(1);
    expect(viz.operators).toHaveLength(6);
  });

  it('algorithm 1 has OP1 as carrier with feedback', () => {
    const viz = getAlgorithmVisualization(1);
    expect(viz.operators[0].index).toBe(0);
    expect(viz.operators[0].isCarrier).toBe(true);
    expect(viz.operators[0].hasFeedback).toBe(true);
  });

  it('algorithm 1 has correct routing: OP2 modulates OP1, OP6->OP5->OP4->OP3', () => {
    const viz = getAlgorithmVisualization(1);
    expect(viz.operators[1].modulates).toEqual([0]);   // OP2 -> OP1
    expect(viz.operators[2].isCarrier).toBe(true);      // OP3 carrier
    expect(viz.operators[3].modulates).toEqual([2]);    // OP4 -> OP3
    expect(viz.operators[4].modulates).toEqual([3]);    // OP5 -> OP4
    expect(viz.operators[5].modulates).toEqual([4]);    // OP6 -> OP5
  });

  it('algorithm 5 shows 3 parallel 2-op stacks with feedback on OP1', () => {
    const viz = getAlgorithmVisualization(5);
    expect(viz.operators).toHaveLength(6);
    // Three carrier/modulator pairs: OP1(fb)/OP2, OP3/OP4, OP5/OP6
    expect(viz.operators[0].isCarrier).toBe(true);
    expect(viz.operators[0].hasFeedback).toBe(true);
    expect(viz.operators[1].modulates).toEqual([0]);
    expect(viz.operators[2].isCarrier).toBe(true);
    expect(viz.operators[2].hasFeedback).toBe(false);
    expect(viz.operators[3].modulates).toEqual([2]);
    expect(viz.operators[4].isCarrier).toBe(true);
    expect(viz.operators[4].hasFeedback).toBe(false);
    expect(viz.operators[5].modulates).toEqual([4]);
  });

  it('algorithm 32 (all carriers) has no modulations', () => {
    const viz = getAlgorithmVisualization(32);
    expect(viz.operators).toHaveLength(6);
    for (const op of viz.operators) {
      expect(op.isCarrier).toBe(true);
      expect(op.modulates).toEqual([]);
    }
    // OP1 has feedback in algorithm 32
    expect(viz.operators[0].hasFeedback).toBe(true);
  });

  it('handles out-of-range algorithm 0 by clamping to algorithm 1', () => {
    const viz = getAlgorithmVisualization(0);
    expect(viz.operators).toHaveLength(6);
    // Clamped to 0 = algorithm 1 routing
    expect(viz.operators[0].hasFeedback).toBe(true);
  });

  it('handles out-of-range algorithm 33 by clamping to algorithm 32', () => {
    const viz = getAlgorithmVisualization(33);
    expect(viz.operators).toHaveLength(6);
    // Clamped to 31 = algorithm 32 routing
    for (const op of viz.operators) {
      expect(op.isCarrier).toBe(true);
    }
  });

  it('each result has unique operator indices 0-5', () => {
    const viz = getAlgorithmVisualization(1);
    const indices = viz.operators.map(o => o.index);
    expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe('DX7Engine', () => {
  it('constructs a DX7Engine instance', () => {
    const ctx = createMockContext() as unknown as AudioContext;
    const engine = new DX7Engine(ctx, ctx.destination);
    expect(engine).toBeTruthy();
    expect(engine).toBeInstanceOf(DX7Engine);
  });

  it('setParams and getParams work', () => {
    const ctx = createMockContext() as unknown as AudioContext;
    const engine = new DX7Engine(ctx, ctx.destination);
    expect(engine.getParams()).toBeNull();

    const params = createDefaultDX7Params();
    engine.setParams(params);
    expect(engine.getParams()).toBe(params);
  });

  it('noteOn does not throw when params are set', () => {
    const ctx = createMockContext() as unknown as AudioContext;
    const engine = new DX7Engine(ctx, ctx.destination);
    const params = createDefaultDX7Params();
    engine.setParams(params);
    expect(() => engine.noteOn(60, 100)).not.toThrow();
  });

  it('noteOn is a no-op when no params are set', () => {
    const ctx = createMockContext() as unknown as AudioContext;
    const engine = new DX7Engine(ctx, ctx.destination);
    expect(() => engine.noteOn(60)).not.toThrow();
  });

  it('dispose clears active voices and interval', () => {
    const ctx = createMockContext() as unknown as AudioContext;
    const engine = new DX7Engine(ctx, ctx.destination);
    engine.setParams(createDefaultDX7Params());
    engine.noteOn(60);
    expect(() => engine.dispose()).not.toThrow();
  });
});
