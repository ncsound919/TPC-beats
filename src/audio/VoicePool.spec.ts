import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VoiceGain, VoicePool } from './VoicePool';
import type { BaseAudioContext } from '../types';

// Make AudioBufferSourceNode & OscillatorNode available so the
// instanceof checks inside noteOff() work in a Node environment.
class MockAudioBufferSourceNode {
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}
class MockOscillatorNode {
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  type = 'sine';
  frequency = mockAudioParam(440);
  detune = mockAudioParam(0);
  onended: (() => void) | null = null;
}
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
(globalThis as any).AudioBufferSourceNode = MockAudioBufferSourceNode;
(globalThis as any).OscillatorNode = MockOscillatorNode;

// -----------------------------------------------------------------------
// Web Audio API mock helpers (vitest runs in 'node' environment)
// -----------------------------------------------------------------------

function mockGainNode() {
  return { connect: vi.fn(), disconnect: vi.fn(), gain: mockAudioParam(0.0001) };
}

function mockBufferSource() {
  return new MockAudioBufferSourceNode();
}

function mockOscillator() {
  return new MockOscillatorNode();
}

function createMockContext() {
  let time = 0;
  return {
    get currentTime() {
      return time;
    },
    set currentTime(v: number) {
      time = v;
    },
    destination: { connect: vi.fn(), disconnect: vi.fn() } as any,
    createGain: vi.fn(() => mockGainNode()),
    createBufferSource: vi.fn(() => mockBufferSource()),
    createOscillator: vi.fn(() => mockOscillator()),
    createBiquadFilter: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      type: '',
      frequency: mockAudioParam(0),
      gain: mockAudioParam(0),
      Q: mockAudioParam(0),
      detune: mockAudioParam(0),
    })),
    createDynamicsCompressor: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      threshold: mockAudioParam(0),
      ratio: mockAudioParam(1),
      attack: mockAudioParam(0),
      release: mockAudioParam(0),
      knee: mockAudioParam(0),
      reduction: mockAudioParam(0),
    })),
    createDelay: vi.fn((_max?: number) => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      delayTime: mockAudioParam(0),
    })),
    createWaveShaper: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      curve: null as Float32Array | null,
      oversample: 'none',
    })),
  };
}

type MockContext = ReturnType<typeof createMockContext>;

// -----------------------------------------------------------------------
// VoiceGain
// -----------------------------------------------------------------------

describe('VoiceGain', () => {
  let ctx: MockContext;
  let gain: VoiceGain;

  beforeEach(() => {
    ctx = createMockContext();
    gain = new VoiceGain(ctx as unknown as BaseAudioContext);
  });

  it('creates a gain node and sets initial value to minimum', () => {
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
    expect(gain.node.gain.value).toBe(0.0001);
  });

  describe('applyADSR', () => {
    it('schedules a complete gain envelope', () => {
      const now = 0;
      gain.applyADSR(
        { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.3, targetGain: 0.8 },
        now,
      );

      const p = gain.node.gain;
      expect(p.cancelScheduledValues).toHaveBeenCalledWith(now);
      expect(p.setValueAtTime).toHaveBeenCalledWith(0.0001, now);
      expect(p.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, now + 0.01);
      expect(p.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        0.8 * 0.5,
        now + 0.01 + 0.1,
      );
    });

    it('clamps attack to minimum 0.001', () => {
      const now = 0;
      gain.applyADSR(
        { attack: 0, decay: 0.1, targetGain: 0.8 },
        now,
      );

      expect(gain.node.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
        0.8,
        now + 0.001,
      );
    });

    it('uses default sustain of 0.6 and clamps to 0.0001 minimum', () => {
      const now = 0;
      gain.applyADSR(
        { attack: 0.01, decay: 0.1, targetGain: 0.8 },
        now,
      );

      const sustainGain = 0.8 * Math.max(0.0001, 0.6);
      expect(gain.node.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        sustainGain,
        now + 0.01 + 0.1,
      );
    });

    it('keeps sustain at 0.0001 when targetGain is 0', () => {
      const now = 0;
      gain.applyADSR(
        { attack: 0.01, decay: 0.1, sustain: 0, targetGain: 0.8 },
        now,
      );

      const minSustain = Math.max(0.0001, 0.8 * Math.max(0.0001, 0));
      expect(gain.node.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        minSustain,
        now + 0.01 + 0.1,
      );
    });
  });

  describe('triggerRelease', () => {
    it('schedules exponential ramp to silence', () => {
      const now = 10;
      gain.applyADSR(
        { attack: 0.01, decay: 0.1, release: 0.5, targetGain: 0.8 },
        0,
      );

      const p = gain.node.gain;
      const currentValue = p.value;

      const endTime = gain.triggerRelease(now);

      expect(p.cancelScheduledValues).toHaveBeenCalledWith(now);
      expect(p.setValueAtTime).toHaveBeenCalledWith(Math.max(0.0001, currentValue), now);
      expect(p.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, now + 0.5);
      expect(endTime).toBe(now + 0.5);
    });
  });
});

// -----------------------------------------------------------------------
// VoicePool
// -----------------------------------------------------------------------

describe('VoicePool', () => {
  let ctx: MockContext;
  let pool: VoicePool;

  beforeEach(() => {
    ctx = createMockContext();
    pool = new VoicePool(ctx as unknown as BaseAudioContext, 4);
  });

  it('returns a Voice object with source, gain, and node', () => {
    const voice = pool.get();

    expect(voice).not.toBeNull();
    expect(voice!.source).toBeDefined();
    expect(voice!.gain).toBeInstanceOf(VoiceGain);
    expect(voice!.node).toBe(voice!.gain.node);
    expect(voice!.noteId).toBeNull();
  });

  it('creates a buffer source and gain node', () => {
    pool.get();

    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
  });

  it('returns voices up to maxPolyphony', () => {
    const voices = Array.from({ length: 4 }, () => pool.get());
    expect(voices.every((v) => v !== null)).toBe(true);
    expect(pool.activeCount).toBe(4);
  });

  it('steals the oldest voice when exceeding maxPolyphony', () => {
    const first = pool.get('note-1')!;
    pool.get('note-2');
    pool.get('note-3');
    pool.get('note-4');

    const releaseSpy = vi.spyOn(first.gain, 'triggerRelease');

    // all 4 slots full, stealing should happen now
    const fifth = pool.get('note-5');

    // steal() calls triggerRelease but voice stays in set until onended fires
    expect(releaseSpy).toHaveBeenCalled();
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(5);
  });

  it('steals existing voice with the same noteId', () => {
    const first = pool.get('note-a')!;
    const second = pool.get('note-b');

    const releaseSpy = vi.spyOn(first.gain, 'triggerRelease');

    // note-a already exists -> should be stolen
    const third = pool.get('note-a');

    expect(third).not.toBeNull();
    expect(releaseSpy).toHaveBeenCalled();
    // steal() does not synchronously remove; onended cleanup is async
    expect(pool.activeCount).toBe(3);
  });

  it('noteOff triggers release on the correct voice', () => {
    const voice = pool.get('note-x')!;
    const releaseSpy = vi.spyOn(voice.gain, 'triggerRelease');

    pool.noteOff('note-x', 1);

    expect(releaseSpy).toHaveBeenCalledWith(1);
  });

  it('noteOff does nothing for unknown noteId', () => {
    pool.get('note-a');
    // Should not throw
    expect(() => pool.noteOff('nonexistent', 0)).not.toThrow();
  });

  it('releaseAll triggers release on every active voice', () => {
    const v1 = pool.get('a')!;
    const v2 = pool.get('b')!;
    const v3 = pool.get('c')!;

    const s1 = vi.spyOn(v1.gain, 'triggerRelease');
    const s2 = vi.spyOn(v2.gain, 'triggerRelease');
    const s3 = vi.spyOn(v3.gain, 'triggerRelease');

    pool.releaseAll();

    expect(s1).toHaveBeenCalled();
    expect(s2).toHaveBeenCalled();
    expect(s3).toHaveBeenCalled();
  });

  it('releaseAll stops all sources', () => {
    const v1 = pool.get('a')!;
    const v2 = pool.get('b')!;

    pool.releaseAll();

    expect(v1.source.stop).toHaveBeenCalled();
    expect(v2.source.stop).toHaveBeenCalled();
  });

  it('activeCount reflects the number of active voices', () => {
    expect(pool.activeCount).toBe(0);

    pool.get();
    expect(pool.activeCount).toBe(1);

    pool.get();
    expect(pool.activeCount).toBe(2);
  });

  it('release removes a voice from the active set', () => {
    const voice = pool.get()!;
    expect(pool.activeCount).toBe(1);

    pool.release(voice);
    expect(pool.activeCount).toBe(0);
  });

  it('steal triggers release on the stolen voice', () => {
    const first = pool.get('a')!;
    pool.get('b');
    pool.get('c');
    pool.get('d');

    const releaseSpy = vi.spyOn(first.gain, 'triggerRelease');
    pool.get('e');

    expect(releaseSpy).toHaveBeenCalled();
  });
});
