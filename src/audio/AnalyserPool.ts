import { BaseAudioContext, BusName } from '../types';

export interface AnalyserPoolConfig {
  // FFT size per analyser. Must be a power of 2 between 32 and 32768.
  // Larger = more frequency bins (better resolution) but more CPU.
  // Common choices: 256 (128 bins, 43 Hz per bin @ 44.1kHz),
  //                512 (256 bins, 21 Hz per bin),
  //                1024 (512 bins, ~11 Hz per bin, good for music).
  // Default: 256 for low-latency UI.
  fftSize?: number;
  // Smoothing for frequency data (0–1). Higher = more averaged/smoother,
  // lower = more responsive. Default: 0.7 (snappier than the Web Audio
  // default 0.8).
  smoothingTimeConstant?: number;
  // Pre-allocate frequency/waveform buffers? If true, buffers are created
  // for each bus on construction so data extraction doesn't allocate.
  // If false, buffers are allocated on-demand in getFrequencyData/getTimeDomainData.
  // Default: true (perf-optimal for real-time UI).
  preAllocateBuffers?: boolean;
}

/**
 * Manages a pool of AnalyserNodes, one per audio bus (mpc/synth/rompler/master).
 * Provides configurable FFT sizes, pooled data buffers for zero-alloc data
 * extraction on each frame, and proper cleanup.
 *
 * Usage:
 *   const pool = new AnalyserPool(ctx, { fftSize: 512 });
 *   const freqData = pool.getFrequencyData('mpc'); // Uint8Array, reused
 *   const waveData = pool.getTimeDomainData('synth'); // Uint8Array, reused
 *   // When done:
 *   pool.dispose();
 */
export class AnalyserPool {
  private ctx: BaseAudioContext;
  private analysers: Map<BusName, AnalyserNode> = new Map();
  private freqDataBuffers: Map<BusName, Uint8Array> = new Map();
  private timeDomainBuffers: Map<BusName, Uint8Array> = new Map();
  private fftSize: number;
  private smoothingTimeConstant: number;
  private preAllocateBuffers: boolean;

  constructor(ctx: BaseAudioContext, config: AnalyserPoolConfig = {}) {
    this.ctx = ctx;
    this.fftSize = config.fftSize ?? 256;
    this.smoothingTimeConstant = config.smoothingTimeConstant ?? 0.7;
    this.preAllocateBuffers = config.preAllocateBuffers ?? true;

    // Validate fftSize
    if (!this.isValidFFTSize(this.fftSize)) {
      throw new Error(
        `Invalid fftSize: ${this.fftSize}. Must be a power of 2 between 32 and 32768.`
      );
    }

    const buses: BusName[] = ['mpc', 'synth', 'rompler', 'master'];
    buses.forEach((bus) => this.createAnalyser(bus));

    if (this.preAllocateBuffers) {
      buses.forEach((bus) => this.allocateBuffers(bus));
    }
  }

  private isValidFFTSize(size: number): boolean {
    // Power of 2 check: (size & (size - 1)) === 0
    return size >= 32 && size <= 32768 && (size & (size - 1)) === 0;
  }

  private createAnalyser(bus: BusName): AnalyserNode {
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = this.fftSize;
    analyser.smoothingTimeConstant = this.smoothingTimeConstant;
    this.analysers.set(bus, analyser);
    return analyser;
  }

  private allocateBuffers(bus: BusName): void {
    const analyser = this.analysers.get(bus);
    if (!analyser) return;

    // Frequency buffer size = fftSize / 2
    const freqBufferSize = analyser.frequencyBinCount;
    this.freqDataBuffers.set(bus, new Uint8Array(freqBufferSize));

    // Time domain buffer size = fftSize
    this.timeDomainBuffers.set(bus, new Uint8Array(this.fftSize));
  }

  /**
   * Get the AnalyserNode for a bus. Will create one lazily if it doesn't
   * exist (though by design, the standard 4 buses are always pre-created).
   * Note: if you add buses dynamically, buffers won't be pre-allocated
   * unless you manually call allocateBuffers(). For best perf with dynamic
   * buses, pre-set them in the constructor config or allocate explicitly.
   */
  public get(bus: BusName): AnalyserNode {
    let analyser = this.analysers.get(bus);
    if (!analyser) {
      analyser = this.createAnalyser(bus);
      if (this.preAllocateBuffers) {
        this.allocateBuffers(bus);
      }
    }
    return analyser;
  }

  /**
   * Extract frequency data (0–255 per bin) into a reusable Uint8Array buffer.
   * If preAllocateBuffers is true, this never allocates; otherwise, buffers
   * are created on first call per bus.
   *
   * @param bus - Bus name (mpc/synth/rompler/master)
   * @returns Uint8Array of length frequencyBinCount (fftSize / 2).
   *          Caller should not hold references across frames; data is updated
   *          in-place on the next call.
   */
  public getFrequencyData(bus: BusName): Uint8Array {
    const analyser = this.get(bus);
    let buffer = this.freqDataBuffers.get(bus);
    if (!buffer) {
      buffer = new Uint8Array(analyser.frequencyBinCount);
      this.freqDataBuffers.set(bus, buffer);
    }
    analyser.getByteFrequencyData(buffer);
    return buffer;
  }

  /**
   * Extract time-domain (waveform) data (0–255 per sample) into a reusable
   * Uint8Array buffer.
   *
   * @param bus - Bus name
   * @returns Uint8Array of length fftSize.
   *          Caller should not hold references across frames; data is updated
   *          in-place on the next call.
   */
  public getTimeDomainData(bus: BusName): Uint8Array {
    const analyser = this.get(bus);
    let buffer = this.timeDomainBuffers.get(bus);
    if (!buffer) {
      buffer = new Uint8Array(this.fftSize);
      this.timeDomainBuffers.set(bus, buffer);
    }
    analyser.getByteTimeDomainData(buffer);
    return buffer;
  }

  /**
   * Estimate the perceived "loudness" by averaging the frequency spectrum.
   * Useful for VU meters, beat detection, or simple kick/snare triggers.
   * Ranges 0–255.
   *
   * @param bus - Bus name
   * @param range - Optional frequency range as [minBin, maxBin] to average
   *                only that portion (e.g., [0, 5] for sub-bass). If omitted,
   *                averages entire spectrum.
   */
  public getAverageFrequency(bus: BusName, range?: [number, number]): number {
    const data = this.getFrequencyData(bus);
    const [minBin, maxBin] = range ?? [0, data.length - 1];
    let sum = 0;
    for (let i = Math.max(0, minBin); i <= Math.min(data.length - 1, maxBin); i++) {
      sum += data[i];
    }
    const count = Math.max(1, maxBin - minBin + 1);
    return sum / count;
  }

  /**
   * Get the peak (loudest bin) in the frequency spectrum, optionally
   * constrained to a frequency range. Returns [binIndex, value].
   * Useful for "dominant frequency" detection.
   */
  public getPeakFrequency(
    bus: BusName,
    range?: [number, number]
  ): [bin: number, value: number] {
    const data = this.getFrequencyData(bus);
    const [minBin, maxBin] = range ?? [0, data.length - 1];
    let maxVal = 0;
    let maxBin_ = minBin;
    for (let i = Math.max(0, minBin); i <= Math.min(data.length - 1, maxBin); i++) {
      if (data[i] > maxVal) {
        maxVal = data[i];
        maxBin_ = i;
      }
    }
    return [maxBin_, maxVal];
  }

  /**
   * Estimate the RMS (root-mean-square) level from the time-domain waveform.
   * Ranges 0–255 (not normalized to 0–1, for consistency with the Web Audio API).
   * More accurate for "loudness" than averaging frequency data, but requires
   * more computation.
   */
  public getRMSLevel(bus: BusName): number {
    const data = this.getTimeDomainData(bus);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128; // center around 0
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(255, rms * 255); // scale back to 0–255
  }

  /**
   * Convert a frequency bin index to an actual frequency (Hz) for a given
   * sample rate. Useful if you want to know "what frequency is bin 42 at?"
   * @param binIndex - Frequency bin (0 to frequencyBinCount - 1)
   * @param sampleRate - Audio context sample rate (default: ctx.sampleRate)
   */
  public binToFrequency(binIndex: number, sampleRate?: number): number {
    const sr = sampleRate ?? this.ctx.sampleRate;
    return (binIndex * sr) / this.fftSize;
  }

  /**
   * Convert a frequency (Hz) to a bin index for the current fftSize.
   * Useful for finding the bin nearest a target frequency.
   */
  public frequencyToBin(frequency: number, sampleRate?: number): number {
    const sr = sampleRate ?? this.ctx.sampleRate;
    return Math.round((frequency * this.fftSize) / sr);
  }

  /**
   * Update the FFT size globally. This recreates all analysers with the new
   * size and reallocates buffers if needed. Expensive operation—don't call
   * mid-render. Use during setup or on user settings change.
   */
  public setFFTSize(fftSize: number): void {
    if (!this.isValidFFTSize(fftSize)) {
      throw new Error(
        `Invalid fftSize: ${fftSize}. Must be a power of 2 between 32 and 32768.`
      );
    }
    this.fftSize = fftSize;
    const buses: BusName[] = Array.from(this.analysers.keys());
    buses.forEach((bus) => {
      this.createAnalyser(bus);
      this.freqDataBuffers.delete(bus);
      this.timeDomainBuffers.delete(bus);
      if (this.preAllocateBuffers) {
        this.allocateBuffers(bus);
      }
    });
  }

  /**
   * Update smoothing time constant. Applied immediately to all analysers.
   */
  public setSmoothing(value: number): void {
    if (value < 0 || value > 1) {
      throw new Error('smoothingTimeConstant must be between 0 and 1.');
    }
    this.smoothingTimeConstant = value;
    this.analysers.forEach((analyser) => {
      analyser.smoothingTimeConstant = value;
    });
  }

  /**
   * Get reference to an analyser for direct manipulation (e.g., connecting
   * it to the audio graph). In most cases, use the data-extraction methods
   * above instead.
   */
  public getAnalyserNode(bus: BusName): AnalyserNode | undefined {
    return this.analysers.get(bus);
  }

  /**
   * Disconnect and destroy all analysers + buffers. Call this when the pool
   * is no longer needed (e.g., on app shutdown or audio context reset).
   */
  public dispose(): void {
    this.analysers.forEach((analyser) => {
      try {
        analyser.disconnect();
      } catch {
        // already disconnected or not connected
      }
    });
    this.analysers.clear();
    this.freqDataBuffers.clear();
    this.timeDomainBuffers.clear();
  }
}