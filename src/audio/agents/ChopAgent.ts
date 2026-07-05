import { Slice } from '../../types';

export interface ChopOptions {
  threshold?: number;           // Sensitivity multiplier (default 1.5)
  minSliceLength?: number;      // Minimum slice duration in seconds (default 0.08)
  backtrackMs?: number;         // Backtrack window in ms (default 12)
  windowSize?: number;          // RMS window size (samples) (default 512)
  hopSize?: number;             // Analysis hop (samples) (default 128)
  silenceGate?: number;         // RMS floor to ignore (default 0.001)
  useSpectralFlux?: boolean;    // Combine with spectral flux (default true)
  maxSlices?: number;           // Maximum number of slices (default Infinity)
  fftSize?: number;             // FFT size for spectral flux (must be power of 2, default 1024)
  preFilter?: boolean;          // Apply simple high‑pass to enhance transients (default false)
  snapToZeroCrossing?: boolean; // Snap slice boundaries to nearest zero crossing (default true)
  autoSensitivity?: boolean;    // Auto-detect optimal threshold from signal dynamics (default false)
}

interface ZeroCrossingResult {
  index: number;
  distance: number;
}

export class ChopAgent {
  /**
   * High‑quality transient / onset detection for drum & percussion slicing.
   * Uses a fast radix‑2 FFT for spectral flux, adaptive thresholding, and hysteresis.
   */
  public static detectTransients(
    buffer: AudioBuffer,
    options: ChopOptions = {}
  ): Slice[] {
    const {
      threshold: rawThreshold = 1.5,
      minSliceLength = 0.08,
      backtrackMs = 12,
      windowSize = 512,
      hopSize = 128,
      silenceGate = 0.001,
      useSpectralFlux = true,
      maxSlices = Infinity,
      fftSize = 1024,
      preFilter = false,
      snapToZeroCrossing = true,
      autoSensitivity = false,
    } = options;

    const threshold = autoSensitivity
      ? ChopAgent.autoDetectThreshold(buffer)
      : rawThreshold;

    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const duration = buffer.duration;

    // === 1. MIX TO MONO (with optional high‑pass pre‑filter) ===
    const mono = new Float32Array(length);
    const channels = buffer.numberOfChannels;
    for (let ch = 0; ch < channels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        mono[i] += data[i] / channels;
      }
    }

    // Simple high‑pass (DC blocker) to emphasise transients
    if (preFilter) {
      let prev = 0;
      const alpha = 0.95; // 1‑pole HPF
      for (let i = 0; i < length; i++) {
        const cur = mono[i];
        mono[i] = cur - alpha * prev;
        prev = cur;
      }
    }

    // === 2. COMPUTE RMS AND SPECTRAL FLUX (with fast FFT) ===
    const rms: number[] = [];
    const spectralFlux: number[] = [];
    const numFrames = Math.floor((length - windowSize) / hopSize) + 1;
    const fft = new FFT(fftSize);

    let prevSpectrum: Float32Array | null = null;

    for (let i = 0; i < numFrames; i++) {
      const offset = i * hopSize;

      // RMS
      let sumSq = 0;
      for (let j = 0; j < windowSize; j++) {
        const s = mono[offset + j] || 0;
        sumSq += s * s;
      }
      rms.push(Math.sqrt(sumSq / windowSize));

      // Spectral Flux (if enabled)
      if (useSpectralFlux) {
        const spectrum = fft.magnitudeSpectrum(mono, offset);
        let flux = 0;
        if (prevSpectrum) {
          const half = spectrum.length;
          for (let b = 0; b < half; b++) {
            const diff = spectrum[b] - prevSpectrum[b];
            if (diff > 0) flux += diff;
          }
          // Normalise by number of bins and frame rate
          flux /= (half * hopSize / sampleRate);
        }
        spectralFlux.push(flux);
        prevSpectrum = spectrum;
      }
    }

    // === 3. COMBINE NOVELTY MEASURES ===
    const novelty: number[] = new Array(numFrames).fill(0);
    for (let i = 1; i < numFrames; i++) {
      const rmsNovelty = Math.max(0, rms[i] - rms[i - 1]);
      let fluxNovelty = 0;
      if (useSpectralFlux && i < spectralFlux.length) {
        fluxNovelty = spectralFlux[i] || 0;
      }
      // Weighted combination: RMS gives sharp onsets, flux gives harmonic changes
      novelty[i] = rmsNovelty * 0.5 + fluxNovelty * 0.5;
    }

    // Normalise novelty to [0,1] for consistent thresholding
    let maxNovelty = 0;
    for (let i = 0; i < novelty.length; i++) {
      if (novelty[i] > maxNovelty) maxNovelty = novelty[i];
    }
    if (maxNovelty > 0) {
      for (let i = 0; i < novelty.length; i++) {
        novelty[i] /= maxNovelty;
      }
    }

    // === 4. ADAPTIVE THRESHOLD (moving median) + HYSTERESIS ===
    const medianWindow = 15; // frames
    const thresholds: number[] = [];
    for (let i = 0; i < novelty.length; i++) {
      const start = Math.max(0, i - medianWindow);
      const end = Math.min(novelty.length, i + medianWindow + 1);
      const segment = novelty.slice(start, end);
      segment.sort((a, b) => a - b);
      const median = segment[Math.floor(segment.length / 2)];
      // Threshold = median * sensitivity, clamped to prevent false triggers at silence
      thresholds.push(Math.max(0.01, median * threshold));
    }

    // === 5. PEAK PICKING with backtracking ===
    const markers: number[] = [0];
    let lastMarkerTime = 0;
    let inTransient = false;
    const backtrackFrames = Math.round((backtrackMs / 1000) * sampleRate / hopSize);

    for (let i = 3; i < novelty.length - 1; i++) {
      // Skip silent frames
      if (rms[i] < silenceGate) continue;

      const currentThreshold = thresholds[i];
      const currentNovelty = novelty[i];

      // Onset detected when novelty exceeds threshold and we're not already in transient
      if (currentNovelty > currentThreshold && !inTransient) {
        // Find the exact onset frame by backtracking to local minimum
        let onsetFrame = i;
        for (let b = 0; b < backtrackFrames && onsetFrame > 0; b++) {
          if (novelty[onsetFrame - 1] < novelty[onsetFrame] * 0.2) {
            onsetFrame--;
          } else {
            break;
          }
        }

        const time = Math.max(0, (onsetFrame * hopSize) / sampleRate);
        if (time - lastMarkerTime >= minSliceLength) {
          markers.push(time);
          lastMarkerTime = time;
          inTransient = true;
        }
      }

      // Hysteresis: leave transient state when novelty drops well below threshold
      if (inTransient && currentNovelty < currentThreshold * 0.4) {
        inTransient = false;
      }
    }

    // Ensure final slice ends at duration
    if (markers[markers.length - 1] < duration - 0.02) {
      markers.push(duration);
    } else if (markers.length > 1) {
      markers[markers.length - 1] = duration; // trim last marker to exact end
    }

    // Snap markers to zero crossings for cleaner boundaries
    if (snapToZeroCrossing) {
      const snapped = ChopAgent.snapMarkersToZeroCrossings(markers, mono, sampleRate);
      for (let i = 0; i < markers.length; i++) {
        if (snapped[i] < duration) markers[i] = snapped[i];
      }
    }

    // Limit number of slices (keep most significant)
    if (markers.length - 1 > maxSlices) {
      // Keep the first maxSlices slices (or we could keep strongest)
      markers.splice(maxSlices + 1);
      markers[markers.length - 1] = duration;
    }

    // === 6. BUILD SLICE OBJECTS ===
    const slices: Slice[] = [];
    for (let i = 0; i < markers.length - 1; i++) {
      const start = markers[i];
      const end = markers[i + 1];
      slices.push({
        id: `slice_${i}`,
        start,
        end,
        attack: 0.003,
        decay: Math.max(0.02, end - start - 0.01),
        pitch: 0,
        gain: 1.0,
        padAssignment: null,
      });
    }

    return slices;
  }

  /**
   * Auto‑assign slices to 16 pads in a musical way:
   * - Slices with longer duration and higher energy get lower pad numbers.
   * - Spreads slices evenly across the pads.
   */
  public static assignSlicesToPads(slices: Slice[]): Slice[] {
    if (slices.length === 0) return [];

    // Score each slice: duration + energy (normalised)
    const scored = slices.map((slice, idx) => {
      const duration = slice.end - slice.start;
      // Simple energy proxy: average amplitude of the slice (we don't have audio here)
      // Could be improved by using RMS values, but we'll use duration and position.
      const energy = Math.min(1, duration * 4); // longer = more energy
      const positionWeight = 1 / (idx + 1);
      return { slice, score: energy * 0.7 + positionWeight * 0.3, index: idx };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const assigned: Slice[] = [...slices];
    const padCount = 16;

    // Distribute ranks to pads: stronger slices get lower pads
    scored.forEach((item, rank) => {
      // Map rank to pad: 0 → 0, 1 → 1, … but with a spread
      const pad = Math.min(padCount - 1, Math.floor(rank * (padCount / scored.length)));
      assigned[item.index] = {
        ...item.slice,
        padAssignment: pad,
      };
    });

    return assigned;
  }

  /**
   * Auto-detect optimal threshold from signal dynamics.
   * Analyzes the novelty curve to find a threshold that captures
   * perceptually significant onsets without over-segmenting noise.
   */
  public static autoDetectThreshold(buffer: AudioBuffer): number {
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const windowSize = 512;
    const hopSize = 256;

    const mono = new Float32Array(length);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }

    const numFrames = Math.floor((length - windowSize) / hopSize) + 1;
    const novelty: number[] = [];
    let prevRms = 0;
    for (let i = 0; i < numFrames; i++) {
      const offset = i * hopSize;
      let sumSq = 0;
      for (let j = 0; j < windowSize; j++) {
        const s = mono[offset + j] || 0;
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / windowSize);
      novelty.push(Math.max(0, rms - prevRms));
      prevRms = rms;
    }

    const sorted = [...novelty].sort((a, b) => b - a);
    const topCount = Math.max(1, Math.floor(sorted.length * 0.05));
    const meanTop = sorted.slice(0, topCount).reduce((s, v) => s + v, 0) / topCount;
    const meanAll = sorted.reduce((s, v) => s + v, 0) / sorted.length;
    const ratio = meanTop / Math.max(1e-10, meanAll);

    if (ratio > 50) return 3.0;
    if (ratio > 20) return 2.0;
    if (ratio > 10) return 1.5;
    if (ratio > 5) return 1.0;
    return 0.6;
  }

  /**
   * Find the nearest zero crossing in mono audio data around a given sample index.
   * Searches within a window of `searchRadius` samples forward and backward.
   */
  private static findNearestZeroCrossing(
    data: Float32Array,
    centerIndex: number,
    sampleRate: number,
    searchRadius: number = 0
  ): ZeroCrossingResult {
    if (searchRadius <= 0) {
      searchRadius = Math.max(64, Math.floor(sampleRate * 0.002));
    }
    const start = Math.max(1, centerIndex - searchRadius);
    const end = Math.min(data.length - 1, centerIndex + searchRadius);

    let bestIndex = centerIndex;
    let bestDistance = 0;

    for (let i = start; i < end; i++) {
      if (data[i] === 0 || (data[i] > 0 && data[i + 1] < 0) || (data[i] < 0 && data[i + 1] > 0)) {
        const dist = Math.abs(i - centerIndex);
        if (dist < bestDistance) {
          bestDistance = dist;
          bestIndex = data[i] === 0 ? i : i + 1;
        }
      }
    }

    return { index: bestIndex, distance: bestDistance };
  }

  /**
   * Snap an array of time markers (in seconds) to the nearest zero crossings
   * in the audio buffer. Returns adjusted markers.
   */
  private static snapMarkersToZeroCrossings(
    markers: number[],
    mono: Float32Array,
    sampleRate: number
  ): number[] {
    const snapped: number[] = [];
    for (const time of markers) {
      if (time <= 0 || time >= mono.length / sampleRate) {
        snapped.push(time);
        continue;
      }
      const centerIndex = Math.round(time * sampleRate);
      const result = ChopAgent.findNearestZeroCrossing(mono, centerIndex, sampleRate);
      snapped.push(result.index / sampleRate);
    }
    return snapped;
  }

  /**
   * Convenience method: detect + assign in one call.
   */
  public static chopAndAssign(
    buffer: AudioBuffer,
    options?: ChopOptions
  ): Slice[] {
    const slices = ChopAgent.detectTransients(buffer, options);
    return ChopAgent.assignSlicesToPads(slices);
  }
}

// ────────────────────────────────────────────────────────────────
// Fast Radix‑2 FFT implementation (cooley‑tukey, in‑place)
// ────────────────────────────────────────────────────────────────
class FFT {
  private size: number;
  private bitReversal: Uint32Array;
  private twiddleRe: Float32Array;
  private twiddleIm: Float32Array;

  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two');
    }
    this.size = size;
    const n = size;
    // Pre‑compute bit‑reversal permutation
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let j = i;
      let k = 0;
      for (let b = 0; b < Math.log2(n); b++) {
        k = (k << 1) | (j & 1);
        j >>= 1;
      }
      rev[i] = k;
    }
    this.bitReversal = rev;

    // Pre‑compute twiddle factors
    const twRe = new Float32Array(n / 2);
    const twIm = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      const angle = -2 * Math.PI * i / n;
      twRe[i] = Math.cos(angle);
      twIm[i] = Math.sin(angle);
    }
    this.twiddleRe = twRe;
    this.twiddleIm = twIm;
  }

  /**
   * Compute the magnitude spectrum of a signal segment.
   * Returns a Float32Array of length size/2 (positive frequencies only).
   */
  public magnitudeSpectrum(signal: Float32Array, start: number): Float32Array {
    const n = this.size;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);

    // Apply Hann window and copy into real buffer
    for (let i = 0; i < n; i++) {
      const idx = start + i;
      if (idx < signal.length) {
        const w = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
        real[i] = signal[idx] * w;
      }
    }

    // Perform in‑place FFT
    this.fft(real, imag);

    // Magnitude for positive frequencies
    const half = n / 2;
    const mag = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return mag;
  }

  /**
   * In‑place radix‑2 FFT (decimation‑in‑time).
   */
  private fft(real: Float32Array, imag: Float32Array): void {
    const n = this.size;
    const rev = this.bitReversal;
    const twRe = this.twiddleRe;
    const twIm = this.twiddleIm;

    // Bit‑reversal permutation
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (i < j) {
        let tmp = real[i];
        real[i] = real[j];
        real[j] = tmp;
        tmp = imag[i];
        imag[i] = imag[j];
        imag[j] = tmp;
      }
    }

    // Iterative Cooley‑Tukey
    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1;
      const step = n / len;
      for (let base = 0; base < n; base += len) {
        for (let j = 0; j < halfLen; j++) {
          const k = base + j;
          const t = k + halfLen;
          const wRe = twRe[j * step];
          const wIm = twIm[j * step];
          // u = real[k], v = real[t] * w
          const uRe = real[k];
          const uIm = imag[k];
          const vRe = real[t] * wRe - imag[t] * wIm;
          const vIm = real[t] * wIm + imag[t] * wRe;
          real[k] = uRe + vRe;
          imag[k] = uIm + vIm;
          real[t] = uRe - vRe;
          imag[t] = uIm - vIm;
        }
      }
    }
  }
}