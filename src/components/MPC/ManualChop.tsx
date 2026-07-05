import { useCallback, useEffect, useRef, useState } from 'react';

interface ManualChopProps {
  isPlaying: boolean;
  currentTime: number;
  sampleDuration: number;
  chopPoints: number[];
  onAddChopPoint: (time: number) => void;
  onRemoveChopPoint: (index: number) => void;
  onClearChopPoints: () => void;
  onApplyChops: () => void;
}

export function ManualChop({
  isPlaying, currentTime, sampleDuration,
  chopPoints, onAddChopPoint, onRemoveChopPoint,
  onClearChopPoints, onApplyChops,
}: ManualChopProps) {
  const [armed, setArmed] = useState(false);
  const lastChopRef = useRef(0);

  const handleTap = useCallback(() => {
    if (!armed || !isPlaying) return;
    const now = currentTime;
    if (now - lastChopRef.current < 0.05) return;
    lastChopRef.current = now;
    onAddChopPoint(now);
  }, [armed, isPlaying, currentTime, onAddChopPoint]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && armed) {
        handleTap();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [armed, handleTap]);

  const formatTime = (t: number) => {
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${min}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2 w-72">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Manual Chop</span>
        <button
          onClick={() => setArmed(!armed)}
          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider
            ${armed ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
        >
          {armed ? 'ARMED' : 'Arm'}
        </button>
      </div>

      <div className="text-[9px] text-zinc-500">
        Play sample and tap pads (or Space) to mark chop points
      </div>

      {!isPlaying && armed && (
        <div className="text-[10px] text-amber-400">Start playback to begin chopping</div>
      )}

      {/* Waveform overview with chop markers */}
      <div className="relative h-12 bg-zinc-800 rounded overflow-hidden">
        {chopPoints.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-0.5 bg-violet-500 cursor-pointer hover:bg-red-400"
            style={{ left: `${(t / sampleDuration) * 100}%` }}
            onClick={() => onRemoveChopPoint(i)}
            title={`Remove chop at ${formatTime(t)}`}
          />
        ))}
        {/* Current playhead */}
        {isPlaying && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white opacity-70"
            style={{ left: `${(currentTime / sampleDuration) * 100}%` }}
          />
        )}
      </div>

      {/* Chop points list */}
      <div className="flex flex-col gap-0.5 max-h-32 overflow-y-auto">
        {chopPoints.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-[10px] font-mono">
            <span className="text-zinc-400">#{i + 1}</span>
            <span className="text-zinc-300">{formatTime(t)}</span>
            <span className="text-zinc-600">
              {(i > 0 ? (t - chopPoints[i - 1]).toFixed(2) : '-')}s
            </span>
            <button
              onClick={() => onRemoveChopPoint(i)}
              className="text-red-400 hover:text-red-300 text-[9px]"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onApplyChops}
          disabled={chopPoints.length < 2}
          className="flex-1 text-[10px] bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded py-1 font-bold uppercase"
        >
          Apply Chops
        </button>
        <button
          onClick={onClearChopPoints}
          disabled={chopPoints.length === 0}
          className="text-[10px] bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-400 rounded px-2 py-1 uppercase"
        >
          Clear
        </button>
      </div>

      {/* Tap indicator */}
      {armed && (
        <div className="text-[8px] text-zinc-600 text-center">
          {chopPoints.length} points
        </div>
      )}
    </div>
  );
}
