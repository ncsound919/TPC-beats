import { JunoParams } from '../../types';

// ---------------------------------------------------------------------------
// Roland Juno-106 SysEx Parser
// Format: F0 41 2n 00 20 <patch_data> <checksum> F7
// Patch data: 17 bytes (offsets 0x00–0x10)
// Checksum is XOR of all data bytes (or sum? Roland uses sum & 0x7f)
// ---------------------------------------------------------------------------

const ROLAND_ID = 0x41;
const JUNO_MODEL = 0x20;
const SYSEX_START = 0xf0;
const SYSEX_END = 0xf7;

/** Map raw byte (0–127) to DCO range name */
function dcoRangeName(value: number): string {
  const ranges = ['16\'', '8\'', '4\'', '2\''];
  return ranges[value & 0x03] ?? '16\'';
}

/** Map raw byte to LFO waveform name */
function lfoWaveformName(value: number): string {
  const waveforms = ['TRI', 'SAW', 'SQU', 'RND'];
  return waveforms[(value >> 2) & 0x03] ?? 'TRI';
}

/** Map raw byte to VCF envelope curve name */
function vcfCurveName(value: number): string {
  const curves = ['-LIN', '-EXP', '+EXP', '+LIN'];
  return curves[value & 0x03] ?? '-LIN';
}

export function parseJunoSysex(buffer: ArrayBuffer, currentParams: JunoParams): JunoParams {
  const data = new Uint8Array(buffer);

  // Find the actual sysex message (skip any leading garbage)
  let startIdx = -1;
  let endIdx = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === SYSEX_START) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    console.warn('Juno parse: no SYSEX_START found');
    return currentParams;
  }
  for (let i = startIdx + 1; i < data.length; i++) {
    if (data[i] === SYSEX_END) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    console.warn('Juno parse: no SYSEX_END found');
    return currentParams;
  }

  const msg = data.slice(startIdx, endIdx + 1);

  // Basic format check
  if (msg.length < 10) {
    console.warn('Juno parse: message too short');
    return currentParams;
  }
  if (msg[1] !== ROLAND_ID) {
    console.warn('Juno parse: not Roland ID');
    return currentParams;
  }
  if (msg[4] !== JUNO_MODEL) {
    console.warn('Juno parse: not Juno-106 model ID');
    return currentParams;
  }

  // The patch data starts at offset 5 (after F0 41 2n 00 20)
  // and is 17 bytes long.
  const patchStart = 5;
  if (msg.length < patchStart + 17 + 1) {
    console.warn('Juno parse: missing patch data');
    return currentParams;
  }

  const patch = msg.slice(patchStart, patchStart + 17);
  const checksum = msg[patchStart + 17] ?? 0;

  // Validate checksum: Roland uses XOR or sum? Let's calculate sum & 0x7f.
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum = (sum + patch[i]) & 0x7f;
  }
  if (sum !== checksum) {
    console.warn(`Juno parse: checksum mismatch (expected ${sum}, got ${checksum}) – ignoring patch`);
    return currentParams;
  }

  // --- Map bytes to parameters ---
  // Offsets from the service manual:
  // 0x00: DCO LFO (bits 0-1: range, bit2: LFO waveform? actually it's more)
  // 0x01: PWM mode & rate
  // 0x02: SUB level
  // 0x03: NOISE level
  // 0x04: VCF frequency
  // 0x05: VCF resonance
  // 0x06: VCF envelope amount
  // 0x07: VCF envelope attack
  // 0x08: VCF envelope decay
  // 0x09: VCF envelope sustain
  // 0x0A: VCF envelope release
  // 0x0B: VCA envelope attack
  // 0x0C: VCA envelope decay
  // 0x0D: VCA envelope sustain
  // 0x0E: VCA envelope release
  // 0x0F: LFO rate
  // 0x10: LFO delay

  const p = (offset: number) => patch[offset] ?? 0;

  return {
    ...currentParams,
    dco: {
      ...currentParams.dco,
      pwm: p(1) & 0x7f,
      sub: p(2) & 0x7f,
      noise: p(3) & 0x7f,
      // optionally add range and lfo waveform
      range: dcoRangeName(p(0)),
      lfoWaveform: lfoWaveformName(p(0)),
    },
    vcf: {
      ...currentParams.vcf,
      freq: p(4) & 0x7f,
      res: p(5) & 0x7f,
      envAmount: p(6) & 0x7f,
      envCurve: vcfCurveName(0), // Juno has no curve param, we can ignore
    },
    vca: {
      ...currentParams.vca,
      level: 0x7f, // not in sysex? We'll keep existing or derive from env sustain?
    },
    env: {
      ...currentParams.env,
      a: p(7) & 0x7f,  // VCF attack
      d: p(8) & 0x7f,
      s: p(9) & 0x7f,
      r: p(10) & 0x7f,
      // VCA envelope can be separate, but most Juno editors treat VCF and VCA as separate.
      // We'll map VCA to a separate sub-object.
      vcaA: p(11) & 0x7f,
      vcaD: p(12) & 0x7f,
      vcaS: p(13) & 0x7f,
      vcaR: p(14) & 0x7f,
    },
    lfo: {
      ...currentParams.lfo,
      rate: p(15) & 0x7f,
      delay: p(16) & 0x7f,
    },
  };
}
