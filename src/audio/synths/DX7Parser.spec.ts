import { describe, it, expect } from 'vitest';
import { parseDX7Sysex, parseDX7SysexBank, CURVE_NAMES } from './DX7Parser';
import type { DX7Params } from '../../types';

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const YAMAHA_ID = 0x43;

function computeChecksum(data: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0x7f;
  }
  return sum;
}

function createPackedOperatorBytes(index: number, outputLevel: number): Uint8Array {
  const buf = new Uint8Array(17);
  // Rates
  buf[0] = 99; buf[1] = 80; buf[2] = 60; buf[3] = 40;
  // Levels
  buf[4] = 99; buf[5] = 75; buf[6] = 50; buf[7] = 0;
  // BreakPoint
  buf[8] = 60;
  // Left/Right depth
  buf[9] = 0; buf[10] = 0;
  // Curves byte (leftCurve=0, rightCurve=0)
  buf[11] = 0;
  // RateScale
  buf[12] = 0;
  // VelocitySens(0) + AmpModSens(0)
  buf[13] = 0;
  // OutputLevel (also used as enabled flag)
  buf[14] = outputLevel;
  // Mode(ratio=0) | Coarse(1)
  buf[15] = 1 << 1;
  // Fine
  buf[16] = 0;
  return buf;
}

function createPackedGlobalParams(voiceBuf: Uint8Array, options?: { algorithm?: number; feedback?: number }) {
  const g = 102;
  // Pitch EG Rate
  voiceBuf[g + 0] = 99; voiceBuf[g + 1] = 50; voiceBuf[g + 2] = 50; voiceBuf[g + 3] = 50;
  // Pitch EG Level
  voiceBuf[g + 4] = 50; voiceBuf[g + 5] = 50; voiceBuf[g + 6] = 50; voiceBuf[g + 7] = 50;
  // Algorithm (bits 0-4)
  voiceBuf[g + 8] = (options?.algorithm ?? 0) & 0x1f;
  // Feedback (bits 0-2)
  voiceBuf[g + 9] = (options?.feedback ?? 0) & 0x07;
  // LFO Speed
  voiceBuf[g + 10] = 35;
  // LFO Delay
  voiceBuf[g + 11] = 0;
  // LFO PM Depth
  voiceBuf[g + 12] = 0;
  // LFO AM Depth
  voiceBuf[g + 13] = 0;
  // LFO byte: sync=1(bit0), waveform=4(bits1-3=100), pmSens=3(bits4-6=011) => 0x39
  voiceBuf[g + 14] = 0x39;
  // Transpose
  voiceBuf[g + 15] = 24;
  // Name: 'INIT VOICE' padded with spaces
  const name = 'INIT VOICE';
  for (let i = 0; i < 10; i++) {
    voiceBuf[g + 16 + i] = i < name.length ? name.charCodeAt(i) : 0x20;
  }
}

function createPackedVoice(options?: { algorithm?: number; feedback?: number }): Uint8Array {
  const buf = new Uint8Array(128);
  // 6 operators, each 17 bytes
  // Buffer order: OP6(0-16), OP5(17-33), OP4(34-50), OP3(51-67), OP2(68-84), OP1(85-101)
  // After reverse: operators[0]=OP6, operators[5]=OP1
  for (let op = 0; op < 6; op++) {
    const outputLevel = op === 5 ? 99 : 0; // only OP1 (last, index 5) has level 99
    const opBytes = createPackedOperatorBytes(op, outputLevel);
    buf.set(opBytes, op * 17);
  }
  createPackedGlobalParams(buf, options);
  return buf;
}

function buildBankMessage(firstVoice: Uint8Array): ArrayBuffer {
  const data = new Uint8Array(4096);
  data.set(firstVoice, 0);
  // Fill remaining voices with minimal data
  for (let v = 1; v < 32; v++) {
    const offset = v * 128;
    data[offset + 14] = 0; // output level 0 for all OPs
    data[offset + 102 + 8] = v & 0x1f; // algorithm cycles
    data[offset + 102 + 15] = 24; // transpose
  }
  const checksum = computeChecksum(data);

  const msg = new Uint8Array(1 + 1 + 1 + 1 + 1 + 1 + 4096 + 1 + 1);
  msg[0] = SYSEX_START;
  msg[1] = YAMAHA_ID;
  msg[2] = 0x00;
  msg[3] = 0x09;
  msg[4] = 0x20;
  msg[5] = 0x00;
  msg.set(data, 6);
  msg[msg.length - 2] = checksum;
  msg[msg.length - 1] = SYSEX_END;
  return msg.buffer;
}

function buildSingleVoiceMessage(opData: Uint8Array[]): ArrayBuffer {
  // 6 operators × 21 bytes + 29 bytes global = 155
  const data = new Uint8Array(155);
  for (let op = 0; op < 6; op++) {
    data.set(opData[op], op * 21);
  }
  // Global at offset 126
  const g = 126;
  data[g + 0] = 99; data[g + 1] = 50; data[g + 2] = 50; data[g + 3] = 50;
  data[g + 4] = 50; data[g + 5] = 50; data[g + 6] = 50; data[g + 7] = 50;
  data[g + 8] = 0;   // algorithm 1
  data[g + 9] = 0;   // feedback
  data[g + 10] = 0;  // oscSync
  data[g + 11] = 35; // lfo speed
  data[g + 12] = 0;  // lfo delay
  data[g + 13] = 0;  // lfo pm depth
  data[g + 14] = 0;  // lfo am depth
  data[g + 15] = 1;  // lfo sync
  data[g + 16] = 4;  // lfo waveform
  data[g + 17] = 3;  // pm sens
  data[g + 18] = 24; // transpose
  const name = 'TEST VOICE';
  for (let i = 0; i < 10; i++) {
    data[g + 19 + i] = i < name.length ? name.charCodeAt(i) : 0x20;
  }
  const checksum = computeChecksum(data);

  const msg = new Uint8Array(1 + 1 + 1 + 1 + 1 + 1 + 155 + 1 + 1);
  msg[0] = SYSEX_START;
  msg[1] = YAMAHA_ID;
  msg[2] = 0x00;
  msg[3] = 0x00;
  msg[4] = 0x01;
  msg[5] = 0x1b;
  msg.set(data, 6);
  msg[msg.length - 2] = checksum;
  msg[msg.length - 1] = SYSEX_END;
  return msg.buffer;
}

// ---------------------------------------------------------------------------

describe('CURVE_NAMES', () => {
  it('contains 4 curve name entries', () => {
    expect(CURVE_NAMES).toHaveLength(4);
    expect(CURVE_NAMES).toEqual(['-LIN', '-EXP', '+EXP', '+LIN']);
  });
});

describe('parseDX7SysexBank', () => {
  it('returns null for empty ArrayBuffer', () => {
    const result = parseDX7SysexBank(new ArrayBuffer(0));
    expect(result).toBeNull();
  });

  it('parses a valid 32-voice bank SYSEX message', () => {
    const voice = createPackedVoice();
    const buffer = buildBankMessage(voice);
    const result = parseDX7SysexBank(buffer);
    expect(result).not.toBeNull();
    expect(result!.voices).toHaveLength(32);
  });

  it('extracts the first voice with correct operator structure', () => {
    const voice = createPackedVoice({ algorithm: 0, feedback: 0 });
    const buffer = buildBankMessage(voice);
    const result = parseDX7SysexBank(buffer);
    expect(result).not.toBeNull();

    const first = result!.voices[0];
    expect(first.operators).toHaveLength(6);

    // After unpack + reverse: operators[0] = OP1 (was at buf offset 85)
    const op1 = first.operators[0];
    expect(op1.outputLevel).toBe(99);
    expect(op1.eg.rate).toEqual([99, 80, 60, 40]);
    expect(op1.eg.level).toEqual([99, 75, 50, 0]);
  });

  it('parses algorithm byte correctly (bit 0-4)', () => {
    const voice = createPackedVoice({ algorithm: 4 }); // algorithm 5 stored as 4
    const buffer = buildBankMessage(voice);
    const result = parseDX7SysexBank(buffer);
    expect(result).not.toBeNull();
    expect(result!.voices[0].algorithm).toBe(5);
  });

  it('parses feedback byte correctly', () => {
    const voice = createPackedVoice({ feedback: 5 });
    const buffer = buildBankMessage(voice);
    const result = parseDX7SysexBank(buffer);
    expect(result!.voices[0].feedback).toBe(5);
  });

  it('rejects a message with bad checksum', () => {
    const voice = createPackedVoice();
    const buffer = buildBankMessage(voice);
    // Corrupt a byte to break checksum
    const arr = new Uint8Array(buffer);
    arr[10] = 0xff;
    const result = parseDX7SysexBank(arr.buffer);
    expect(result).toBeNull();
  });

  it('handles non-SYSEX garbage before the message', () => {
    const voice = createPackedVoice();
    const bankMsg = buildBankMessage(voice);
    const garbage = new Uint8Array([0x00, 0xff, 0xaa]);
    const combined = new Uint8Array(garbage.length + bankMsg.byteLength);
    combined.set(garbage);
    combined.set(new Uint8Array(bankMsg), garbage.length);
    const result = parseDX7SysexBank(combined.buffer);
    expect(result).not.toBeNull();
    expect(result!.voices).toHaveLength(32);
  });
});

describe('parseDX7Sysex', () => {
  it('returns the first voice from a bank', () => {
    const voice = createPackedVoice({ algorithm: 2 });
    const buffer = buildBankMessage(voice);
    const result = parseDX7Sysex(buffer);
    expect(result).not.toBeNull();
    expect(result!.algorithm).toBe(3);
  });

  it('returns null for empty buffer', () => {
    const result = parseDX7Sysex(new ArrayBuffer(0));
    expect(result).toBeNull();
  });

  it('sets params from packed voice correctly', () => {
    const voice = createPackedVoice({ algorithm: 4, feedback: 3 });
    const buffer = buildBankMessage(voice);
    const result = parseDX7Sysex(buffer);
    expect(result).not.toBeNull();
    expect(result!.algorithm).toBe(5);
    expect(result!.feedback).toBe(3);
    expect(result!.transpose).toBe(24);
  });

  it('sets LFO properties from the packed format', () => {
    const voice = createPackedVoice();
    const buffer = buildBankMessage(voice);
    const result = parseDX7Sysex(buffer);
    expect(result).not.toBeNull();
    expect(result!.lfo.speed).toBe(35);
    expect(result!.lfo.delay).toBe(0);
    expect(result!.lfo.pmDepth).toBe(0);
    expect(result!.lfo.amDepth).toBe(0);
    expect(result!.lfo.sync).toBe(true);
    expect(result!.lfo.waveform).toBe(4);
    expect(result!.lfo.pmSens).toBe(3);
  });
});

describe('single voice (packed format)', () => {
  it('parses a single-voice dump correctly', () => {
    const opData: Uint8Array[] = [];
    for (let i = 0; i < 6; i++) {
      const buf = new Uint8Array(21);
      buf[0] = 99; buf[1] = 90; buf[2] = 80; buf[3] = 70;
      buf[4] = 99; buf[5] = 80; buf[6] = 60; buf[7] = 0;
      buf[8] = 60; buf[9] = 0; buf[10] = 0;
      buf[11] = 0; buf[12] = 0; buf[13] = 0;
      buf[14] = 0; buf[15] = 0;
      buf[16] = i === 0 ? 99 : 0; // OP6(0) output 99, rest 0
      buf[17] = 0;  // mode=ratio
      buf[18] = 1;  // coarse=1
      buf[19] = 0;  // fine=0
      buf[20] = 7;  // detune=0 (7-7=0)
      opData.push(buf);
    }
    const buffer = buildSingleVoiceMessage(opData);
    const result = parseDX7Sysex(buffer);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('TEST VOICE');
    expect(result!.algorithm).toBe(1);
    expect(result!.transpose).toBe(24);
    expect(result!.operators).toHaveLength(6);
  });
});
