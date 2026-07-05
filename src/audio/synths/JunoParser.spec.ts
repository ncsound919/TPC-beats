import { describe, it, expect } from 'vitest';
import { parseJunoSysex } from './JunoParser';
import type { JunoParams } from '../../types';

const defaultParams: JunoParams = {
  dco: { wavePulse: false, waveSaw: true, pwm: 0, sub: 0, noise: 0 },
  hpf: { freq: 0 },
  vcf: { freq: 0, res: 0, env: 0, lfo: 0, kbd: 0 },
  vca: { level: 0, mode: 'env' },
  env: { a: 0, d: 0, s: 0, r: 0 },
  chorus: { mode: 'off' },
  chord: { enabled: false, notes: [] },
};

function buildJunoSysex(patch: number[]): ArrayBuffer {
  const sum = patch.reduce((acc, b) => (acc + b) & 0x7f, 0);
  const msg = [0xf0, 0x41, 0x20, 0x00, 0x20, ...patch, sum, 0xf7];
  return new Uint8Array(msg).buffer;
}

describe('parseJunoSysex', () => {
  it('returns current params for empty buffer', () => {
    const result = parseJunoSysex(new ArrayBuffer(0), defaultParams);
    expect(result).toBe(defaultParams);
  });

  it('returns current params when no SYSEX_START found', () => {
    const buf = new Uint8Array([0x00, 0x01, 0x02]).buffer;
    const result = parseJunoSysex(buf, defaultParams);
    expect(result).toBe(defaultParams);
  });

  it('returns current params when message is too short', () => {
    const buf = new Uint8Array([0xf0, 0xf7]).buffer;
    const result = parseJunoSysex(buf, defaultParams);
    expect(result).toBe(defaultParams);
  });

  it('returns current params for non-Roland ID', () => {
    const msg = new Uint8Array([0xf0, 0x43, 0x00, 0x00, 0x20, 0x00, 0x00, 0xf7]);
    const result = parseJunoSysex(msg.buffer, defaultParams);
    expect(result).toBe(defaultParams);
  });

  it('returns current params when checksum mismatches', () => {
    const patch = Array.from({ length: 17 }, () => 0);
    const sum = patch.reduce((acc, b) => (acc + b) & 0x7f, 0);
    const msg = [0xf0, 0x41, 0x20, 0x00, 0x20, ...patch, sum + 1, 0xf7];
    const buf = new Uint8Array(msg).buffer;
    const result = parseJunoSysex(buf, defaultParams);
    expect(result).toBe(defaultParams);
  });

  it('parses a valid SYSEX message and maps patch data', () => {
    const patch = [
      0x00, // DCO LFO: range=0 (16'), lfoWaveform bits
      0x40, // PWM = 64
      0x32, // SUB = 50
      0x0a, // NOISE = 10
      0x60, // VCF freq = 96
      0x30, // VCF res = 48
      0x50, // VCF env amount = 80
      0x0c, // VCF attack = 12
      0x14, // VCF decay = 20
      0x28, // VCF sustain = 40
      0x05, // VCF release = 5
      0x01, // VCA attack = 1
      0x0f, // VCA decay = 15
      0x3c, // VCA sustain = 60
      0x07, // VCA release = 7
      0x45, // LFO rate = 69
      0x20, // LFO delay = 32
    ];
    const buf = buildJunoSysex(patch);
    const result = parseJunoSysex(buf, defaultParams);

    expect(result.dco.pwm).toBe(64);
    expect(result.dco.sub).toBe(50);
    expect(result.dco.noise).toBe(10);
    expect(result.dco.range).toBe('16\'');

    expect(result.vcf.freq).toBe(96);
    expect(result.vcf.res).toBe(48);
    expect(result.vcf.envAmount).toBe(80);

    expect(result.env.a).toBe(12);
    expect(result.env.d).toBe(20);
    expect(result.env.s).toBe(40);
    expect(result.env.r).toBe(5);
    expect(result.env.vcaA).toBe(1);
    expect(result.env.vcaD).toBe(15);
    expect(result.env.vcaS).toBe(60);
    expect(result.env.vcaR).toBe(7);

    expect(result.lfo?.rate).toBe(69);
    expect(result.lfo?.delay).toBe(32);
  });

  it('handles garbage data before the SYSEX message', () => {
    const patch = Array.from({ length: 17 }, (_, i) => i);
    const sysex = new Uint8Array(buildJunoSysex(patch));
    const garbage = new Uint8Array([0x00, 0xff, 0xaa]);
    const combined = new Uint8Array(garbage.length + sysex.length);
    combined.set(garbage);
    combined.set(sysex, garbage.length);
    const result = parseJunoSysex(combined.buffer, defaultParams);
    expect(result.env.a).toBe(7);
  });

  it('preserves unchanging fields from currentParams', () => {
    const patch = Array.from({ length: 17 }, () => 0);
    const buf = buildJunoSysex(patch);
    const result = parseJunoSysex(buf, defaultParams);
    expect(result.dco.wavePulse).toBe(false);
    expect(result.dco.waveSaw).toBe(true);
    expect(result.hpf.freq).toBe(0);
    expect(result.vca.level).toBe(127);
  });
});
