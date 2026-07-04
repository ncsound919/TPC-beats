import React, { useEffect, useRef } from 'react';

interface SpectrumAnalyzerProps {
  analyserNode?: AnalyserNode;
  height?: number; // Canvas height in pixels
  logarithmic?: boolean; // Log frequency scale (musical) vs linear
  peakHold?: boolean; // Show peak hold line
}

/**
 * Real-time FFT spectrum analyzer visualization using Canvas.
 * Displays frequency content as a bar graph, optionally with logarithmic
 * frequency scaling (more musical) and peak hold.
 */
export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  analyserNode,
  height = 224,
  logarithmic = true,
  peakHold = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | undefined>(undefined);
  const peakHoldRef = useRef<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqData = new Uint8Array(analyserNode.frequencyBinCount);
    const peakHold_ = new Uint8Array(analyserNode.frequencyBinCount);
    peakHoldRef.current = peakHold_;

    const width = canvas.width;
    const barWidth = Math.max(1, Math.floor(width / (logarithmic ? 40 : analyserNode.frequencyBinCount)));
    const numBars = Math.floor(width / barWidth);

    const drawSpectrum = () => {
      analyserNode.getByteFrequencyData(freqData);

      // Update peak hold
      if (peakHold) {
        for (let i = 0; i < freqData.length; i++) {
          if (freqData[i] > peakHold_[i]) {
            peakHold_[i] = freqData[i];
          } else {
            peakHold_[i] = Math.max(0, peakHold_[i] - 1); // decay
          }
        }
      }

      // Clear canvas
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(0, 0, width, height);

      // Draw grid lines (Hz reference)
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.2)';
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(150, 150, 150, 0.4)';

      // Common freq markers: 100Hz, 1kHz, 10kHz
      const freqMarkers = [100, 1000, 10000];
      freqMarkers.forEach((freq) => {
        let x;
        if (logarithmic) {
          x = (Math.log(freq) - Math.log(20)) / (Math.log(20000) - Math.log(20)) * width;
        } else {
          x = (freq / (analyserNode.context.sampleRate / 2)) * width;
        }
        if (x >= 0 && x <= width) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
          ctx.fillText(`${freq < 1000 ? freq : freq / 1000 + 'k'}Hz`, x + 2, 12);
        }
      });

      // Draw bars
      if (logarithmic) {
        // Logarithmic frequency scale (more musical)
        for (let i = 0; i < numBars; i++) {
          const freqNorm = i / numBars; // 0 to 1
          const freq = Math.pow(20000 / 20, freqNorm) * 20; // 20Hz to 20kHz
          const binIndex = Math.round((freq / (analyserNode.context.sampleRate / 2)) * freqData.length);
          const value = freqData[Math.min(binIndex, freqData.length - 1)];

          const x = (i / numBars) * width;
          const barHeight = (value / 255) * height;
          const y = height - barHeight;

          // Gradient: green → yellow → red
          let color = '#22c55e';
          if (value > 200) color = '#ef4444';
          else if (value > 150) color = '#eab308';

          ctx.fillStyle = color;
          ctx.fillRect(x, y, barWidth - 1, barHeight);

          // Peak hold
          if (peakHold) {
            const peakVal = peakHold_[Math.min(binIndex, freqData.length - 1)];
            const peakHeight = (peakVal / 255) * height;
            const peakY = height - peakHeight;
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(x, peakY - 1, barWidth - 1, 2);
          }
        }
      } else {
        // Linear frequency scale
        const step = Math.max(1, Math.floor(freqData.length / numBars));
        for (let i = 0; i < numBars; i++) {
          const binIndex = i * step;
          const value = freqData[binIndex];

          const x = (binIndex / freqData.length) * width;
          const barHeight = (value / 255) * height;
          const y = height - barHeight;

          let color = '#22c55e';
          if (value > 200) color = '#ef4444';
          else if (value > 150) color = '#eab308';

          ctx.fillStyle = color;
          ctx.fillRect(x, y, barWidth - 1, barHeight);

          if (peakHold) {
            const peakVal = peakHold_[binIndex];
            const peakHeight = (peakVal / 255) * height;
            const peakY = height - peakHeight;
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(x, peakY - 1, barWidth - 1, 2);
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(drawSpectrum);
    };

    animFrameRef.current = requestAnimationFrame(drawSpectrum);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode, height, logarithmic, peakHold]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-black rounded-lg border border-neutral-800 overflow-hidden">
      <canvas
        ref={canvasRef}
        width={1024}
        height={height}
        className="w-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};
