import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Music, Radio } from 'lucide-react';

interface ChannelStripProps {
  name: string;
  color: string; // Tailwind or hex color
  volume: number; // 0-1 linear
  pan: number; // -1 (left) to +1 (right)
  mute: boolean;
  solo: boolean;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  analyserNode?: AnalyserNode; // Optional real-time analyser for metering
  busName?: string; // For logging/debug
}

/**
 * A single channel strip UI element resembling professional mixing consoles.
 * Shows fader, pan pot, mute/solo buttons, and real-time level meter if an
 * AnalyserNode is provided.
 */
export const ChannelStrip: React.FC<ChannelStripProps> = ({
  name, color, volume, pan, mute, solo,
  onVolumeChange, onPanChange, onMuteToggle, onSoloToggle,
  analyserNode, busName
}) => {
  const [peakLevel, setPeakLevel] = useState(0);
  const meterCanvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | undefined>(undefined);

  // Real-time metering via AnalyserNode
  useEffect(() => {
    if (!analyserNode || !meterCanvasRef.current) return;

    const canvas = meterCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const freqData = new Uint8Array(analyserNode.frequencyBinCount);

    const drawMeter = () => {
      analyserNode.getByteFrequencyData(freqData);
      const peak = Math.max(...freqData);
      const normalizedPeak = peak / 255;
      setPeakLevel(normalizedPeak);

      // Draw vertical bar meter
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const barHeight = normalizedPeak * canvas.height;

      // Color gradient: green → yellow → red
      let barColor = '#22c55e'; // green
      if (normalizedPeak > 0.75) barColor = '#ef4444'; // red
      else if (normalizedPeak > 0.5) barColor = '#eab308'; // yellow

      ctx.fillStyle = barColor;
      ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

      // Peak hold line
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(0, canvas.height - barHeight - 2, canvas.width, 2);

      animFrameRef.current = requestAnimationFrame(drawMeter);
    };

    animFrameRef.current = requestAnimationFrame(drawMeter);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [analyserNode]);

  const volumeDb = volume === 0 ? -Infinity : 20 * Math.log10(volume);

  // Helper icon based on channel type
  const renderIcon = () => {
    if (busName === 'mpc') return <Music className="w-4 h-4 mr-1.5" style={{ color }} />;
    if (busName === 'synth') return <Radio className="w-4 h-4 mr-1.5" style={{ color }} />;
    return <Volume2 className="w-4 h-4 mr-1.5" style={{ color }} />;
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 hover:border-neutral-700 transition-colors flex-1 flex flex-col justify-between">
      {/* Header */}
      <div className="text-center mb-3">
        <div className="text-xs font-bold tracking-widest text-neutral-300 flex items-center justify-center">
          {renderIcon()}
          <span>{name}</span>
        </div>
        <div className="text-[10px] text-neutral-600 mt-1 uppercase tracking-wider">{busName || name.toLowerCase()}</div>
      </div>

      {/* Meter */}
      <div className="h-28 w-full mb-3">
        <canvas
          ref={meterCanvasRef}
          width={40}
          height={112}
          className="w-full h-full rounded-lg border border-neutral-800 bg-black"
        />
      </div>

      {/* Level display */}
      <div className="text-center text-xs font-mono text-neutral-400 mb-3">
        {volumeDb === -Infinity ? '-∞' : volumeDb.toFixed(1)} dB
      </div>

      {/* Volume fader */}
      <div className="flex flex-col items-center mb-4">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${color} 0%, ${color} ${volume * 100}%, #404040 ${volume * 100}%, #404040 100%)`
          }}
        />
        <div className="text-[10px] text-neutral-500 mt-1.5 w-full text-center">
          {Math.round(volume * 100)}%
        </div>
      </div>

      {/* Pan pot */}
      <div className="mb-4">
        <div className="text-[10px] text-neutral-500 text-center mb-1.5 uppercase tracking-wider">PAN</div>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.02"
          value={pan}
          onChange={(e) => onPanChange(parseFloat(e.target.value))}
          className="w-full accent-neutral-500"
        />
        <div className="text-[10px] text-neutral-500 text-center mt-1 font-mono">
          {pan < -0.05 ? `L${Math.abs(Math.round(pan * 100))}` : pan > 0.05 ? `R${Math.round(pan * 100)}` : 'C'}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={onMuteToggle}
          className={`flex-1 py-1.5 px-1 rounded text-[10px] font-bold tracking-widest transition-colors border ${
            mute
              ? 'bg-red-900/30 border-red-800 text-red-400 font-extrabold'
              : 'bg-neutral-850 border-neutral-800 text-neutral-500 hover:text-neutral-400'
          }`}
          aria-pressed={mute}
        >
          MUTE
        </button>
        <button
          onClick={onSoloToggle}
          className={`flex-1 py-1.5 px-1 rounded text-[10px] font-bold tracking-widest transition-colors border ${
            solo
              ? 'bg-cyan-900/30 border-cyan-800 text-cyan-400 font-extrabold'
              : 'bg-neutral-850 border-neutral-800 text-neutral-500 hover:text-neutral-400'
          }`}
          aria-pressed={solo}
        >
          SOLO
        </button>
      </div>
    </div>
  );
};
