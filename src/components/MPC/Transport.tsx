import React, { useState } from 'react';
import { sequencer } from '../../audio/SequencerEngine';

interface TransportProps {
  onPlay?: () => void;
  onStop?: () => void;
  onRecordArm?: (armed: boolean) => void;
  onRecordStart?: () => void;
  onRecordStop?: () => void;
  bpm?: number;
  barPosition?: number;
}

export function Transport({
  onPlay,
  onStop,
  onRecordArm,
  onRecordStart,
  onRecordStop,
  bpm = 140,
  barPosition = 1
}: TransportProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecordArmed, setIsRecordArmed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const handlePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      sequencer.play();
      if (onPlay) onPlay();

      if (isRecordArmed && !isRecording) {
        setIsRecording(true);
        if (onRecordStart) onRecordStart();
      }
    } else {
      setIsPlaying(false);
      setIsRecording(false);
      sequencer.stop();
      if (onStop) onStop();
      if (onRecordStop) onRecordStop();
    }
  };

  const handleStop = () => {
    if (!isPlaying && !isRecording) return;

    setIsPlaying(false);
    setIsRecording(false);
    sequencer.stop();
    if (onStop) onStop();
    if (onRecordStop) onRecordStop();
  };

  const handleRecord = () => {
    const nextArmed = !isRecordArmed;
    setIsRecordArmed(nextArmed);

    if (!nextArmed && isRecording) {
      setIsRecording(false);
      if (onRecordStop) onRecordStop();
    }

    if (onRecordArm) onRecordArm(nextArmed);
  };

  return (
    <footer className="mt-6 flex gap-4 h-12 shrink-0">
      <div className="flex-1 bg-black rounded border border-neutral-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-cyan-500 font-mono">
            AGENT_ORCHESTRATOR: {isPlaying ? 'PLAYING' : 'IDLE'}
          </span>
          <div className="flex gap-1">
            <div className="w-1 h-3 bg-cyan-500 opacity-20" />
            <div className="w-1 h-3 bg-cyan-500 opacity-40" />
            <div className="w-1 h-3 bg-cyan-500 opacity-80" />
            <div className="w-1 h-3 bg-cyan-500" />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[10px] text-neutral-600 italic tracking-wide">
          <span>
            "Deterministic sequence detected. Synchronizing MPC master clock..."
          </span>
          <span className="font-mono not-italic text-neutral-500">
            BPM {bpm.toFixed(0)} • BAR {barPosition}
          </span>
        </div>
        <div className="text-xs text-neutral-500 font-mono">
          MEM: 4.2GB / CPU: 12%
        </div>
      </div>

      <div className="flex gap-2">
        <button
          id="btn-record"
          onClick={handleRecord}
          className={`
            w-12 h-full rounded flex items-center justify-center text-xl transition-colors
            ${
              isRecordArmed
                ? 'bg-red-900/50 text-red-500 border border-red-800'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }
          `}
          title={isRecordArmed ? 'Record Armed' : 'Arm Record'}
        >
          ⏺
        </button>
        <button
          id="btn-stop"
          onClick={handleStop}
          className={`
            w-12 h-full rounded flex items-center justify-center text-xl transition-colors
            ${
              !isPlaying && !isRecording
                ? 'bg-neutral-700 text-neutral-300'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }
          `}
          title="Stop"
        >
          ⏹
        </button>
        <button
          id="btn-play"
          onClick={handlePlay}
          className={`
            w-12 h-full rounded flex items-center justify-center text-xl transition-colors
            ${
              isPlaying
                ? 'bg-cyan-600 text-white'
                : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
            }
          `}
          title={isPlaying ? 'Pause / Stop' : 'Play'}
        >
          ▶
        </button>
      </div>
    </footer>
  );
}
