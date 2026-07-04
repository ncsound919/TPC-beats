import { DX7Params, DX7Operator } from '../../types';

// ---------------------------------------------------------------------------
// Yamaha DX7 SysEx Parser – upgraded
//
// Supported formats:
//   1) 32-voice bank dump:   F0 43 0n 09 20 00 <4096 bytes> <checksum> F7
//   2) Single voice dump:    F0 43 0n 00 01 1B <155 bytes>   <checksum> F7
//   3) Some banks may be 4104 bytes (extra header) – we handle that.
// ---------------------------------------------------------------------------

const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;
const YAMAHA_ID = 0x43;
const ALL_DEVICE_ID = 0x7f; // many dumps use this

/** Returns true if the 1‑byte checksum matches the data (Yamaha uses sum & 0x7f) */
function validateChecksum(data: Uint8Array, checksum: number): boolean {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum = (sum + data[i]) & 0x7f;
  }
  return sum === (checksum & 0x7f);
}

// ---- Unpacking functions (unchanged, but added checksum validation) ----

function unpackOperator(buf: Uint8Array, offset: number): DX7Operator {
  const b = (i: number) => buf[offset + i] ?? 0;
  return {
    enabled: b(14) > 0,
    eg: {
      rate: [b(0), b(1), b(2), b(3)] as [number, number, number, number],
      level: [b(4), b(5), b(6), b(7)] as [number, number, number, number],
    },
    keyboardScale: {
      breakPoint: b(8),
      leftDepth: b(9),
      rightDepth: b(10),
      leftCurve: ((b(11) >> 2) & 0x03) as 0 | 1 | 2 | 3,
      rightCurve: (b(11) & 0x03) as 0 | 1 | 2 | 3,
      rateScale: b(12) & 0x07,
    },
    velocitySens: (b(13) >> 2) & 0x07,
    ampModSens: b(13) & 0x03,
    outputLevel: b(14),
    oscillator: {
      mode: (b(15) & 0x01) === 1 ? 'fixed' : 'ratio',
      coarse: (b(15) >> 1) & 0x1f,
      fine: b(16),
      detune: 0,
    },
    level: [b(4), b(5), b(6), b(7)] as [number, number, number, number],
  };
}

function unpackVoice(buf: Uint8Array): DX7Params {
  const operators: DX7Operator[] = [];
  for (let op = 0; op < 6; op++) {
    operators.push(unpackOperator(buf, op * 17));
  }
  operators.reverse();

  const base = 102;
  const b = (i: number) => buf[base + i] ?? 0;

  const pitchEgRate: [number, number, number, number] = [b(0), b(1), b(2), b(3)];
  const pitchEgLevel: [number, number, number, number] = [b(4), b(5), b(6), b(7)];

  const algorithm = (b(8) & 0x1f) + 1;
  const feedback = b(9) & 0x07;
  const oscSync = ((b(9) >> 3) & 0x01) === 1;

  const lfoSpeed = b(10);
  const lfoDelay = b(11);
  const lfoPmDepth = b(12);
  const lfoAmDepth = b(13);
  const lfoByte = b(14);
  const lfoSync = (lfoByte & 0x01) === 1;
  const lfoWaveform = ((lfoByte >> 1) & 0x07) as 0 | 1 | 2 | 3 | 4 | 5;
  const pmSens = (lfoByte >> 4) & 0x07;

  const transpose = b(15);

  // Name is 10 bytes at base+16..25
  const nameBytes = buf.slice(base + 16, base + 26);
  const name = bytesToAscii(nameBytes);

  return {
    name,
    algorithm,
    feedback,
    oscSync,
    lfoRate: lfoSpeed,
    lfo: { speed: lfoSpeed, delay: lfoDelay, pmDepth: lfoPmDepth, amDepth: lfoAmDepth, sync: lfoSync, waveform: lfoWaveform, pmSens },
    pitchEG: { rate: pitchEgRate, level: pitchEgLevel },
    transpose,
    operators,
  };
}

function unpackSingleVoice(buf: Uint8Array): DX7Params {
  const operators: DX7Operator[] = [];
  for (let op = 0; op < 6; op++) {
    const offset = op * 21;
    const b = (i: number) => buf[offset + i] ?? 0;
    const eg = {
      rate: [b(0), b(1), b(2), b(3)] as [number, number, number, number],
      level: [b(4), b(5), b(6), b(7)] as [number, number, number, number],
    };
    operators.push({
      enabled: b(16) > 0,
      eg,
      keyboardScale: {
        breakPoint: b(8),
        leftDepth: b(9),
        rightDepth: b(10),
        leftCurve: (b(11) & 0x03) as 0 | 1 | 2 | 3,
        rightCurve: (b(12) & 0x03) as 0 | 1 | 2 | 3,
        rateScale: b(13) & 0x07,
      },
      velocitySens: b(15) & 0x07,
      ampModSens: b(14) & 0x03,
      outputLevel: b(16),
      oscillator: {
        mode: (b(17) & 0x01) === 1 ? 'fixed' : 'ratio',
        coarse: b(18) & 0x1f,
        fine: b(19),
        detune: (b(20) & 0x0f) - 7,
      },
      level: eg.level,
    });
  }
  operators.reverse();

  const base = 126;
  const b = (i: number) => buf[base + i] ?? 0;

  const pitchEgRate: [number, number, number, number] = [b(0), b(1), b(2), b(3)];
  const pitchEgLevel: [number, number, number, number] = [b(4), b(5), b(6), b(7)];
  const algorithm = (b(8) & 0x1f) + 1;
  const feedback = b(9) & 0x07;
  const oscSync = (b(10) & 0x01) === 1;
  const lfoSpeed = b(11);
  const lfoDelay = b(12);
  const lfoPmDepth = b(13);
  const lfoAmDepth = b(14);
  const lfoSync = (b(15) & 0x01) === 1;
  const lfoWaveform = (b(16) & 0x07) as 0 | 1 | 2 | 3 | 4 | 5;
  const pmSens = b(17) & 0x07;
  const transpose = b(18);
  const nameBytes = buf.slice(base + 19, base + 29);
  const name = bytesToAscii(nameBytes);

  return {
    name,
    algorithm,
    feedback,
    oscSync,
    lfoRate: lfoSpeed,
    lfo: { speed: lfoSpeed, delay: lfoDelay, pmDepth: lfoPmDepth, amDepth: lfoAmDepth, sync: lfoSync, waveform: lfoWaveform, pmSens },
    pitchEG: { rate: pitchEgRate, level: pitchEgLevel },
    transpose,
    operators,
  };
}

function bytesToAscii(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : ' '))
    .join('')
    .trim() || 'UNTITLED';
}

export interface ParsedDX7Bank {
  voices: DX7Params[];
}

/**
 * Parse raw .SYX file bytes. Returns either a single parsed voice (if the
 * file is a single-voice dump) or the first voice of a bank.
 */
export function parseDX7Sysex(arrayBuffer: ArrayBuffer): DX7Params | null {
  const bank = parseDX7SysexBank(arrayBuffer);
  return bank?.voices[0] ?? null;
}

/**
 * Parse a .SYX file and return a bank of voices (possibly just one).
 * Handles multiple messages inside one file.
 */
export function parseDX7SysexBank(arrayBuffer: ArrayBuffer): ParsedDX7Bank | null {
  const bytes = new Uint8Array(arrayBuffer);

  // Extract all SysEx messages (F0 ... F7) from the byte stream.
  const messages: Uint8Array[] = [];
  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] === SYSEX_START) {
      let j = i + 1;
      while (j < bytes.length && bytes[j] !== SYSEX_END) j++;
      if (j < bytes.length) {
        messages.push(bytes.slice(i, j + 1));
        i = j + 1;
        continue;
      }
    }
    i++;
  }

  if (messages.length === 0) {
    console.warn('DX7 parse: no SysEx messages found');
    return null;
  }

  const voices: DX7Params[] = [];

  for (const msg of messages) {
    // Basic header checks
    if (msg[0] !== SYSEX_START || msg[msg.length - 1] !== SYSEX_END) continue;
    if (msg[1] !== YAMAHA_ID && msg[1] !== ALL_DEVICE_ID) continue;

    const sub = msg[2] & 0xf0;
    const format = msg[3];
    const byteCountMSB = msg[4];
    const byteCountLSB = msg[5];
    const byteCount = ((byteCountMSB & 0x7f) << 7) | (byteCountLSB & 0x7f);
    const dataStart = 6;
    const data = msg.slice(dataStart, dataStart + byteCount);

    // Validate checksum if present (the last byte before F7 is the checksum)
    const checksum = msg[msg.length - 2] ?? 0;
    if (!validateChecksum(data, checksum)) {
      console.warn('DX7 parse: checksum mismatch – skipping message');
      continue;
    }

    // Determine format by format byte and/or size.
    if (format === 0x09 && byteCount === 4096) {
      // 32-voice bank (packed)
      for (let v = 0; v < 32; v++) {
        const voiceBuf = data.slice(v * 128, v * 128 + 128);
        if (voiceBuf.length === 128) voices.push(unpackVoice(voiceBuf));
      }
    } else if (format === 0x00 && byteCount === 155) {
      // Single voice (unpacked)
      voices.push(unpackSingleVoice(data));
    } else if (byteCount === 4104) {
      // Some banks include extra 8-byte header? Actually some have 4104 bytes (4096 + 8)
      // We'll try to parse as 32 voices anyway (skip first 8 bytes if present)
      const offset = byteCount === 4104 ? 8 : 0;
      for (let v = 0; v < 32; v++) {
        const start = offset + v * 128;
        const voiceBuf = data.slice(start, start + 128);
        if (voiceBuf.length === 128) voices.push(unpackVoice(voiceBuf));
      }
    } else if (byteCount === 4096) {
      // Same as format 0x09 but format byte might differ; try as bank
      for (let v = 0; v < 32; v++) {
        const voiceBuf = data.slice(v * 128, v * 128 + 128);
        if (voiceBuf.length === 128) voices.push(unpackVoice(voiceBuf));
      }
    } else if (byteCount === 155) {
      voices.push(unpackSingleVoice(data));
    } else {
      console.warn(`DX7 parse: unsupported format (format=${format}, byteCount=${byteCount})`);
    }
  }

  if (voices.length === 0) return null;
  return { voices };
}

export const CURVE_NAMES = ['-LIN', '-EXP', '+EXP', '+LIN'] as const;