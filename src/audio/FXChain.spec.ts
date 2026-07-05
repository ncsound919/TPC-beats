import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FXChain } from './FXChain';
import type { BaseAudioContext, MasterPlugin, EQParams, CompressorParams, ReverbParams, LimiterParams } from '../types';

// -----------------------------------------------------------------------
// Web Audio API mock helpers (vitest runs in 'node' environment)
// -----------------------------------------------------------------------

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

function mockNode() {
  return { connect: vi.fn(), disconnect: vi.fn() };
}

function mockGainNode() {
  return { ...mockNode(), gain: mockAudioParam(0) };
}

function mockBiquadFilter() {
  return {
    ...mockNode(),
    type: '',
    frequency: mockAudioParam(0),
    gain: mockAudioParam(0),
    Q: mockAudioParam(0),
    detune: mockAudioParam(0),
  };
}

function mockDynamicsCompressor() {
  return {
    ...mockNode(),
    threshold: mockAudioParam(0),
    ratio: mockAudioParam(1),
    attack: mockAudioParam(0),
    release: mockAudioParam(0),
    knee: mockAudioParam(30),
    reduction: mockAudioParam(0),
  };
}

function mockDelay() {
  return { ...mockNode(), delayTime: mockAudioParam(0) };
}

function mockOscillator() {
  return {
    ...mockNode(),
    type: '',
    frequency: mockAudioParam(0),
    detune: mockAudioParam(0),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function mockWaveShaper() {
  return {
    ...mockNode(),
    curve: null as Float32Array | null,
    oversample: 'none',
  };
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
    destination: mockNode(),
    createGain: vi.fn(() => mockGainNode()),
    createBiquadFilter: vi.fn(() => mockBiquadFilter()),
    createDynamicsCompressor: vi.fn(() => mockDynamicsCompressor()),
    createDelay: vi.fn((_max?: number) => mockDelay()),
    createOscillator: vi.fn(() => mockOscillator()),
    createWaveShaper: vi.fn(() => mockWaveShaper()),
    createBufferSource: vi.fn(() => ({
      ...mockNode(),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null as (() => void) | null,
    })),
  };
}

type MockContext = ReturnType<typeof createMockContext>;

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('FXChain', () => {
  let ctx: MockContext;
  let chain: FXChain;

  beforeEach(() => {
    ctx = createMockContext();
    chain = new FXChain(ctx as unknown as BaseAudioContext);
  });

  // ---------------------------------------------------------------
  // Constructor — nodes
  // ---------------------------------------------------------------

  it('creates input and output GainNodes', () => {
    const gains = ctx.createGain.mock.results;
    expect(chain.input).toBe(gains[0].value);
    expect(chain.output).toBe(gains[1].value);
  });

  it('creates 7 GainNodes total', () => {
    // input, output, reverbDry, reverbWet, reverbFeedback, exciterWet, vinylLFOGain
    expect(ctx.createGain).toHaveBeenCalledTimes(7);
  });

  it('creates 6 BiquadFilterNodes (3 EQ + reverbFilter + exciterFilter + vinylBandpass)', () => {
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(6);
  });

  it('creates 3 DynamicsCompressorNodes (comp, limiter, maximizer)', () => {
    expect(ctx.createDynamicsCompressor).toHaveBeenCalledTimes(3);
  });

  it('creates 2 DelayNodes (reverb + vinyl)', () => {
    expect(ctx.createDelay).toHaveBeenCalledTimes(2);
  });

  it('creates an OscillatorNode (vinyl LFO)', () => {
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('creates a WaveShaperNode (exciter)', () => {
    expect(ctx.createWaveShaper).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------
  // EQ filter configuration
  // ---------------------------------------------------------------

  it('configures EQ as lowshelf / peaking / highshelf', () => {
    const filters = ctx.createBiquadFilter.mock.results;

    const low = filters[0].value;
    expect(low.type).toBe('lowshelf');
    expect(low.frequency.value).toBe(100);

    const mid = filters[1].value;
    expect(mid.type).toBe('peaking');
    expect(mid.frequency.value).toBe(1000);
    expect(mid.Q.value).toBe(1);

    const high = filters[2].value;
    expect(high.type).toBe('highshelf');
    expect(high.frequency.value).toBe(8000);
  });

  // ---------------------------------------------------------------
  // Compressor configuration
  // ---------------------------------------------------------------

  it('configures compressor with default values', () => {
    const nodes = ctx.createDynamicsCompressor.mock.results;
    const comp = nodes[0].value;

    expect(comp.threshold.value).toBe(-20);
    expect(comp.ratio.value).toBe(4);
    expect(comp.attack.value).toBe(0.01);
    expect(comp.release.value).toBe(0.1);
  });

  // ---------------------------------------------------------------
  // Limiter configuration
  // ---------------------------------------------------------------

  it('configures limiter with high-ratio brickwall defaults', () => {
    const nodes = ctx.createDynamicsCompressor.mock.results;
    const limiter = nodes[1].value;

    expect(limiter.threshold.value).toBe(-6);
    expect(limiter.ratio.value).toBe(20);
    expect(limiter.attack.value).toBe(0.003);
    expect(limiter.release.value).toBe(0.05);
  });

  // ---------------------------------------------------------------
  // Maximizer configuration
  // ---------------------------------------------------------------

  it('configures maximizer with very low threshold', () => {
    const nodes = ctx.createDynamicsCompressor.mock.results;
    const maximizer = nodes[2].value;

    expect(maximizer.threshold.value).toBe(-0.1);
    expect(maximizer.ratio.value).toBe(20);
    expect(maximizer.attack.value).toBe(0.001);
    expect(maximizer.release.value).toBe(0.05);
  });

  // ---------------------------------------------------------------
  // Reverb path
  // ---------------------------------------------------------------

  it('configures the algorithmic reverb path', () => {
    const gains = ctx.createGain.mock.results;
    const delays = ctx.createDelay.mock.results;
    const filters = ctx.createBiquadFilter.mock.results;

    const dryGain = gains[2].value;
    const wetGain = gains[3].value;
    const feedbackGain = gains[4].value;
    const delay = delays[0].value;
    const filter = filters[3].value;

    expect(dryGain.gain.value).toBe(1.0);
    expect(wetGain.gain.value).toBe(0.0);
    expect(delay.delayTime.value).toBe(0.15);
    expect(feedbackGain.gain.value).toBe(0.5);
    expect(filter.type).toBe('lowpass');
    expect(filter.frequency.value).toBe(2000);
  });

  // ---------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------

  it('connects input through the serial chain (EQ → comp → limiter → maximizer → vinyl)', () => {
    const gains = ctx.createGain.mock.results;
    const filters = ctx.createBiquadFilter.mock.results;
    const comps = ctx.createDynamicsCompressor.mock.results;
    const delays = ctx.createDelay.mock.results;

    const input = gains[0].value;
    const eqLow = filters[0].value;
    const eqMid = filters[1].value;
    const eqHigh = filters[2].value;
    const compNode = comps[0].value;
    const limiterNode = comps[1].value;
    const maximizerNode = comps[2].value;
    const vinylDelay = delays[1].value;

    expect(input.connect).toHaveBeenCalledWith(eqLow);
    expect(eqLow.connect).toHaveBeenCalledWith(eqMid);
    expect(eqMid.connect).toHaveBeenCalledWith(eqHigh);
    expect(eqHigh.connect).toHaveBeenCalledWith(compNode);
    expect(compNode.connect).toHaveBeenCalledWith(limiterNode);
    expect(limiterNode.connect).toHaveBeenCalledWith(maximizerNode);
    expect(maximizerNode.connect).toHaveBeenCalledWith(vinylDelay);
  });

  it('connects vinyl delay to bandpass filter', () => {
    const delays = ctx.createDelay.mock.results;
    const filters = ctx.createBiquadFilter.mock.results;

    const vinylDelay = delays[1].value;
    const bandpass = filters[5].value;

    expect(vinylDelay.connect).toHaveBeenCalledWith(bandpass);
  });

  it('routes dry signal to output and wet reverb through feedback loop', () => {
    const gains = ctx.createGain.mock.results;
    const filters = ctx.createBiquadFilter.mock.results;

    const bandpass = filters[5].value;
    const dryGain = gains[2].value;
    const output = gains[1].value;

    expect(bandpass.connect).toHaveBeenCalledWith(dryGain);
    expect(dryGain.connect).toHaveBeenCalledWith(output);
  });

  it('wires the reverb feedback loop', () => {
    const gains = ctx.createGain.mock.results;
    const delays = ctx.createDelay.mock.results;
    const filters = ctx.createBiquadFilter.mock.results;

    const wetGain = gains[3].value;
    const delay = delays[0].value;
    const filter = filters[3].value;
    const feedback = gains[4].value;
    const output = gains[1].value;

    expect(wetGain.connect).toHaveBeenCalledWith(delay);
    expect(delay.connect).toHaveBeenCalledWith(filter);
    expect(filter.connect).toHaveBeenCalledWith(feedback);
    expect(feedback.connect).toHaveBeenCalledWith(delay);
    expect(filter.connect).toHaveBeenCalledWith(output);
  });

  it('wires the exciter parallel path', () => {
    const filters = ctx.createBiquadFilter.mock.results;
    const shapers = ctx.createWaveShaper.mock.results;
    const gains = ctx.createGain.mock.results;

    const bandpass = filters[5].value;
    const exciterFilter = filters[4].value;
    const shaper = shapers[0].value;
    const wetGain = gains[5].value;
    const output = gains[1].value;

    expect(bandpass.connect).toHaveBeenCalledWith(exciterFilter);
    expect(exciterFilter.connect).toHaveBeenCalledWith(shaper);
    expect(shaper.connect).toHaveBeenCalledWith(wetGain);
    expect(wetGain.connect).toHaveBeenCalledWith(output);
  });

  it('starts the vinyl LFO and connects it to delayTime', () => {
    const oscs = ctx.createOscillator.mock.results;
    const gains = ctx.createGain.mock.results;

    const lfo = oscs[0].value;
    const lfoGain = gains[6].value;
    const delays = ctx.createDelay.mock.results;
    const vinylDelay = delays[1].value;

    expect(lfo.type).toBe('sine');
    expect(lfo.frequency.value).toBe(0.5);
    expect(lfoGain.gain.value).toBe(0.0);
    expect(lfo.connect).toHaveBeenCalledWith(lfoGain);
    expect(lfoGain.connect).toHaveBeenCalledWith(vinylDelay.delayTime);
    expect(lfo.start).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // makeDistortionCurve
  // ---------------------------------------------------------------

  it('makeDistortionCurve returns a Float32Array of 44100 samples', () => {
    const shapers = ctx.createWaveShaper.mock.results;
    const shaper = shapers[0].value;

    expect(shaper.curve).toBeInstanceOf(Float32Array);
    expect(shaper.curve!.length).toBe(44100);
    expect(shaper.oversample).toBe('4x');
  });

  // ---------------------------------------------------------------
  // updateSettings
  // ---------------------------------------------------------------

  describe('updateSettings', () => {
    it('applies EQ parameters', () => {
      const plugin: MasterPlugin = {
        id: 'eq-1',
        type: 'eq',
        enabled: true,
        params: { low: -6, mid: 3, high: -2, lowFreq: 200, highFreq: 6000 } as EQParams,
      };

      chain.updateSettings([plugin]);

      const filters = ctx.createBiquadFilter.mock.results;
      expect(filters[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(-6, expect.any(Number), 0.01);
      expect(filters[1].value.gain.setTargetAtTime).toHaveBeenCalledWith(3, expect.any(Number), 0.01);
      expect(filters[2].value.gain.setTargetAtTime).toHaveBeenCalledWith(-2, expect.any(Number), 0.01);
    });

    it('applies compressor parameters', () => {
      const plugin: MasterPlugin = {
        id: 'comp-1',
        type: 'compressor',
        enabled: true,
        params: { threshold: -30, ratio: 8, attack: 5, release: 50 } as CompressorParams,
      };

      chain.updateSettings([plugin]);

      const nodes = ctx.createDynamicsCompressor.mock.results;
      const comp = nodes[0].value;

      expect(comp.threshold.setTargetAtTime).toHaveBeenCalledWith(-30, expect.any(Number), 0.01);
      expect(comp.ratio.setTargetAtTime).toHaveBeenCalledWith(8, expect.any(Number), 0.01);
      expect(comp.attack.setTargetAtTime).toHaveBeenCalledWith(0.005, expect.any(Number), 0.01);
      expect(comp.release.setTargetAtTime).toHaveBeenCalledWith(0.05, expect.any(Number), 0.01);
    });

    it('applies limiter parameters', () => {
      const plugin: MasterPlugin = {
        id: 'lim-1',
        type: 'limiter',
        enabled: true,
        params: { threshold: -12, release: 20 } as LimiterParams,
      };

      chain.updateSettings([plugin]);

      const nodes = ctx.createDynamicsCompressor.mock.results;
      const limiter = nodes[1].value;

      expect(limiter.threshold.setTargetAtTime).toHaveBeenCalledWith(-12, expect.any(Number), 0.01);
      expect(limiter.ratio.setTargetAtTime).toHaveBeenCalledWith(20, expect.any(Number), 0.01);
      expect(limiter.release.setTargetAtTime).toHaveBeenCalledWith(0.02, expect.any(Number), 0.01);
    });

    it('applies reverb parameters', () => {
      const plugin: MasterPlugin = {
        id: 'rev-1',
        type: 'reverb',
        enabled: true,
        params: { roomSize: 0.8, damping: 0.3, wetDry: 0.5 } as ReverbParams,
      };

      chain.updateSettings([plugin]);

      const gains = ctx.createGain.mock.results;
      const filters = ctx.createBiquadFilter.mock.results;

      const dryGain = gains[2].value;
      const wetGain = gains[3].value;
      const feedback = gains[4].value;
      const filter = filters[3].value;

      expect(dryGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), 0.01);
      expect(wetGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), 0.01);
      expect(feedback.gain.setTargetAtTime).toHaveBeenCalledWith(0.8 * 0.85, expect.any(Number), 0.01);
      expect(filter.frequency.setTargetAtTime).toHaveBeenCalledWith(5000 - 0.3 * 4000, expect.any(Number), 0.01);
    });

    it('skips disabled plugins', () => {
      const plugin: MasterPlugin = {
        id: 'eq-1',
        type: 'eq',
        enabled: false,
        params: { low: 6, mid: 0, high: -3 } as EQParams,
      };

      chain.updateSettings([plugin]);

      const filters = ctx.createBiquadFilter.mock.results;
      // With plugin disabled, updateSettings resets EQ gains to 0 first
      // then skips applying the plugin's params
      expect(filters[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      // Should NOT be called with the plugin's low value
      expect(filters[0].value.gain.setTargetAtTime).not.toHaveBeenCalledWith(6, expect.any(Number), 0.01);
    });

    it('resets all parameters to neutral before applying enabled plugins', () => {
      // With no plugins passed, all gains/filters should reset to defaults
      chain.updateSettings([]);

      const filters = ctx.createBiquadFilter.mock.results;
      const comps = ctx.createDynamicsCompressor.mock.results;
      const gains = ctx.createGain.mock.results;

      // EQ gains reset to 0
      expect(filters[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      expect(filters[1].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      expect(filters[2].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);

      // Compressor reset
      expect(comps[0].value.threshold.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      expect(comps[0].value.ratio.setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), 0.01);

      // Limiter reset
      expect(comps[1].value.threshold.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      expect(comps[1].value.ratio.setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), 0.01);

      // Maximizer reset
      expect(comps[2].value.threshold.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
      expect(comps[2].value.ratio.setTargetAtTime).toHaveBeenCalledWith(1, expect.any(Number), 0.01);

      // Reverb reset to dry
      expect(gains[2].value.gain.setTargetAtTime).toHaveBeenCalledWith(1.0, expect.any(Number), 0.01);
      expect(gains[3].value.gain.setTargetAtTime).toHaveBeenCalledWith(0.0, expect.any(Number), 0.01);

      // Exciter reset
      expect(gains[5].value.gain.setTargetAtTime).toHaveBeenCalledWith(0.0, expect.any(Number), 0.01);
    });

    it('applies exciter parameters', () => {
      const plugin: MasterPlugin = {
        id: 'exc-1',
        type: 'exciter',
        enabled: true,
        params: { frequency: 6000, drive: 0.5, mix: 0.7 },
      };

      chain.updateSettings([plugin]);

      const filters = ctx.createBiquadFilter.mock.results;
      const gains = ctx.createGain.mock.results;

      expect(filters[4].value.frequency.setTargetAtTime).toHaveBeenCalledWith(6000, expect.any(Number), 0.01);
      expect(gains[5].value.gain.setTargetAtTime).toHaveBeenCalledWith(0.7 * 0.8, expect.any(Number), 0.01);
    });

    it('applies vinyl parameters', () => {
      const plugin: MasterPlugin = {
        id: 'vin-1',
        type: 'vinyl',
        enabled: true,
        params: { dustAmount: 0.5, crackleAmount: 0.3, wowRate: 0.7 },
      };

      chain.updateSettings([plugin]);

      const oscs = ctx.createOscillator.mock.results;
      const gains = ctx.createGain.mock.results;

      expect(oscs[0].value.frequency.setTargetAtTime).toHaveBeenCalledWith(0.7, expect.any(Number), 0.01);
      expect(gains[6].value.gain.setTargetAtTime).toHaveBeenCalledWith(0.3 * 0.005, expect.any(Number), 0.01);
    });
  });
});
