import { Slice } from '../../types';

export interface TransientConfig {
  threshold?: number;
  minSliceLength?: number;
  useSpectralFlux?: boolean;
}

export class ChopAgent {
  /**
   * Detect transients in an AudioBuffer and return a list of Slice objects.
   */
  public static detectTransients(buffer: AudioBuffer, config: TransientConfig = {}): Slice[] {
    const threshold = config.threshold ?? 1.5;
    const minSliceLength = config.minSliceLength ?? 0.08; // in seconds
    const sampleRate = buffer.sampleRate;
    const duration = buffer.duration;

    // Get mono audio data
    const data = buffer.getChannelData(0);
    const length = data.length;

    // We'll compute energy on short windows
    // e.g., 512 samples (~11.6ms at 44.1kHz)
    const windowSize = 512;
    const hopSize = 256;
    const energies: number[] = [];
    const times: number[] = [];

    for (let i = 0; i < length - windowSize; i += hopSize) {
      let sum = 0;
      for (let j = 0; j < windowSize; j++) {
        const val = data[i + j];
        sum += val * val;
      }
      energies.push(Math.sqrt(sum / windowSize));
      times.push((i + windowSize / 2) / sampleRate);
    }

    // Now find onsets using a simple adaptive threshold
    const onsets: number[] = [0]; // always start with the beginning of the file
    const historySize = 10;

    for (let i = historySize; i < energies.length; i++) {
      const currentEnergy = energies[i];

      // Calculate rolling mean energy of the past historySize windows
      let historySum = 0;
      for (let j = 1; j <= historySize; j++) {
        historySum += energies[i - j];
      }
      const localAvg = historySum / historySize;

      // Check if current energy exceeds local average by the threshold
      const ratio = currentEnergy / Math.max(0.005, localAvg);
      
      if (ratio > threshold) {
        const time = times[i];
        
        // Ensure it's a local peak
        const isLocalPeak = currentEnergy > energies[i - 1] && (i === energies.length - 1 || currentEnergy >= energies[i + 1]);
        
        if (isLocalPeak) {
          const lastOnset = onsets[onsets.length - 1];
          if (time - lastOnset >= minSliceLength && time < duration - 0.02) {
            onsets.push(time);
          }
        }
      }
    }

    // Convert onset timestamps into contiguous Slice objects
    const slices: Slice[] = [];
    const nowStr = Date.now().toString();

    for (let i = 0; i < onsets.length; i++) {
      const start = onsets[i];
      const end = i < onsets.length - 1 ? onsets[i + 1] : duration;
      const sliceDuration = end - start;

      slices.push({
        id: `slice_transient_${nowStr}_${i}_${Math.floor(Math.random() * 10000)}`,
        start,
        end,
        attack: 0.005,
        decay: Math.min(2.0, sliceDuration),
        pitch: 0,
        gain: 1.0,
        padAssignment: null,
      });
    }

    return slices;
  }

  /**
   * Assign the detected slices to the 16 drum pads sequentially.
   */
  public static assignSlicesToPads(slices: Slice[]): Slice[] {
    return slices.map((slice, index) => {
      return {
        ...slice,
        padAssignment: index < 16 ? index : null,
      };
    });
  }
}
