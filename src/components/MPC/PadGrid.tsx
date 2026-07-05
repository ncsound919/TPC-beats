import React, { useState, useEffect, useCallback, useRef } from 'react';
import { programEngine } from '../../audio/ProgramEngine';
import { sequencer } from '../../audio/SequencerEngine';

interface PadGridProps {
  onPadTrigger?: (padId: number, velocity: number, time?: number) => void;
  activePad?: number | null;
  onPadDrop?: (padId: number, file: File) => void;
  onPadSettingsChange?: (padId: number, settings: Partial<any>) => void;
}

type PadMode = 'normal' | 'fullLevel' | 'sixteenLevels' | 'noteRepeat';

interface PadState {
  layers: number;
  swing: number;
  pitchOffset: number;
  hasSample: boolean;
  chokeGroup: number | null;
  velocity: number;
}

const MPC_LAYOUT = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];
const NOTE_REPEAT_RATES = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'];

export function PadGrid({
  onPadTrigger,
  activePad = null,
  onPadDrop,
  onPadSettingsChange
}: PadGridProps) {
  const [litPads, setLitPads] = useState<Set<number>>(new Set());
  const [selectedPad, setSelectedPad] = useState<number>(0);
  const [padMode, setPadMode] = useState<PadMode>('normal');
  const [sixteenLevelsBasePad, setSixteenLevelsBasePad] = useState<number | null>(null);
  const [noteRepeatInterval, setNoteRepeatInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [noteRepeatRate, setNoteRepeatRate] = useState(2);
  const [padStates, setPadStates] = useState<Map<number, PadState>>(new Map());
  const velocityMapRef = useRef<number[]>(Array.from({ length: 16 }, () => 100));

  const loadPadStates = useCallback(() => {
    const states = new Map<number, PadState>();
    for (let i = 0; i < 16; i++) {
      const pad = programEngine.getPad(i);
      if (pad) {
        states.set(i, {
          layers: pad.layers.length,
          swing: pad.swing ?? 50,
          pitchOffset: pad.pitchOffset ?? 0,
          hasSample: !!pad.assignedSliceId,
          chokeGroup: pad.chokeGroup ?? null,
          velocity: velocityMapRef.current[i],
        });
      }
    }
    setPadStates(states);
  }, []);

  useEffect(() => {
    loadPadStates();
  }, [loadPadStates]);

  useEffect(() => {
    if (activePad !== null) {
      triggerVisual(activePad);
      setSelectedPad(activePad);
    }
  }, [activePad]);

  const triggerVisual = (id: number) => {
    setLitPads(prev => new Set(prev).add(id));
    setTimeout(() => {
      setLitPads(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 110);
  };

  const computeVelocity = (padId: number): number => {
    if (padMode === 'fullLevel') return 127;
    if (padMode === 'sixteenLevels' && sixteenLevelsBasePad !== null) {
      return Math.max(30, 127 - (Math.abs(padId - sixteenLevelsBasePad) * 8));
    }
    return velocityMapRef.current[padId] ?? 100;
  };

  const getRepeatInterval = (): number => {
    const bpm = (sequencer as any)?.getBpm?.() || 92;
    const baseMs = 60000 / bpm;
    const rates = [4, 2, 1.5, 1, 0.75, 0.5];
    return (baseMs * 4) / rates[noteRepeatRate] || baseMs;
  };

  const handlePadPress = (padId: number) => {
    setSelectedPad(padId);
    const velocity = computeVelocity(padId);
    const targetPadId = (padMode === 'sixteenLevels' && sixteenLevelsBasePad !== null)
      ? sixteenLevelsBasePad
      : padId;

    programEngine.triggerPad(targetPadId, velocity);
    triggerVisual(padId);

    if (onPadTrigger) onPadTrigger(targetPadId, velocity);

    if (padMode === 'noteRepeat') {
      if (noteRepeatInterval) clearInterval(noteRepeatInterval);
      const ms = getRepeatInterval();
      const interval = setInterval(() => {
        programEngine.triggerPad(targetPadId, velocity);
        triggerVisual(padId);
      }, ms);
      setNoteRepeatInterval(interval);
    }
  };

  const handleMouseUpGlobal = () => {
    if (noteRepeatInterval) {
      clearInterval(noteRepeatInterval);
      setNoteRepeatInterval(null);
    }
  };

  const handlePadVelocityChange = (padId: number, velocity: number) => {
    velocityMapRef.current[padId] = velocity;
    loadPadStates();
  };

  const updatePadSwing = (value: number) => {
    programEngine.setPadParam(selectedPad, 'swing', value);
    if (onPadSettingsChange) onPadSettingsChange(selectedPad, { swing: value });
    loadPadStates();
  };

  const padVelocity = velocityMapRef.current[selectedPad] ?? 100;

  return (
    <div className="bg-[#0a0a0a] border border-neutral-800 p-5 rounded-2xl shadow-2xl flex flex-col h-full" onMouseUp={handleMouseUpGlobal}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-bold tracking-[3px] text-amber-400">MPC PADS • BANK A</h2>

        <div className="flex gap-1.5 text-[10px]">
          {(['normal', 'fullLevel', 'sixteenLevels', 'noteRepeat'] as PadMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setPadMode(mode);
                setSixteenLevelsBasePad(null);
              }}
              className={`px-2.5 py-1 rounded border uppercase tracking-widest transition-all ${
                padMode === mode
                  ? 'border-amber-400 text-amber-400 bg-black'
                  : 'border-neutral-700 text-neutral-500 hover:text-neutral-400 hover:border-neutral-500'
              }`}
            >
              {mode === 'noteRepeat' ? 'REPEAT' : mode === 'fullLevel' ? 'FULL' : mode === 'sixteenLevels' ? '16 LVL' : 'NORM'}
            </button>
          ))}
        </div>
      </div>

      {padMode === 'noteRepeat' && (
        <div className="flex gap-1.5 mb-4 text-[10px]">
          {NOTE_REPEAT_RATES.map((rate, idx) => (
            <button
              key={rate}
              onClick={() => setNoteRepeatRate(idx)}
              className={`px-2 py-1 rounded border uppercase tracking-widest transition-all ${
                noteRepeatRate === idx
                  ? 'border-amber-400 text-amber-400 bg-black'
                  : 'border-neutral-700 text-neutral-500'
              }`}
            >
              {rate}
            </button>
          ))}
        </div>
      )}

      {padMode === 'sixteenLevels' && (
        <div className="mb-4 text-[10px] text-neutral-500">
          Press a pad to set velocity base, then other pads trigger at graduated velocities
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 flex-1">
        {MPC_LAYOUT.map((padId) => {
          const state = padStates.get(padId);
          const isLit = litPads.has(padId);
          const isSelected = selectedPad === padId;
          const hasSwing = (state?.swing ?? 50) !== 50;
          const hasChoke = state?.chokeGroup !== null && state?.chokeGroup !== undefined;

          return (
            <div
              key={padId}
              onMouseDown={() => handlePadPress(padId)}
              onContextMenu={(e) => {
                e.preventDefault();
                setSixteenLevelsBasePad(padId);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const file = e.dataTransfer.files?.[0];
                if (file) onPadDrop?.(padId, file);
              }}
              className={`
                relative aspect-square rounded-2xl flex flex-col items-center justify-center
                font-mono border-2 transition-all duration-100 cursor-pointer group overflow-hidden
                ${isLit
                  ? 'bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 shadow-[0_0_35px_#f59e0b] scale-[1.04] border-amber-300'
                  : 'bg-neutral-900 border-neutral-700 hover:border-amber-900 active:scale-95'
                }
                ${isSelected ? 'ring-2 ring-cyan-400 ring-offset-4 ring-offset-[#0a0a0a]' : ''}
              `}
            >
              {state?.hasSample && <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-500 rounded-full shadow" />}
              {hasChoke && (
                <div className="absolute top-2.5 left-2.5 text-[8px] bg-red-950/80 text-red-400 px-1 rounded font-bold">
                  C{state?.chokeGroup}
                </div>
              )}
              {(state?.layers ?? 0) > 1 && (
                <div className="absolute bottom-8 right-2 text-[8px] bg-black/80 px-1.5 py-px rounded text-amber-400 font-bold">
                  {state?.layers}L
                </div>
              )}
              {hasSwing && (
                <div className="absolute bottom-2 right-2 text-[7px] font-mono text-amber-400/60 tracking-widest">
                  SW
                </div>
              )}
              <div className="text-[9px] text-neutral-500 group-hover:text-neutral-400 tracking-wider">A{(padId + 1).toString().padStart(2, '0')}</div>
              <div className="text-xl font-bold text-white mt-0.5">{padId + 1}</div>
              {state && (
                <div className="w-10 h-1 mt-1 rounded-full bg-neutral-800 overflow-hidden">
                  <div
                    className="h-full bg-amber-500/60 rounded-full transition-all"
                    style={{ width: `${state.velocity}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-neutral-950 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="text-neutral-500 text-[10px] tracking-widest uppercase">Pad</span>
            <span className="font-mono text-xl text-white">{(selectedPad + 1).toString().padStart(2, '0')}</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-[10px]">Velocity</span>
              <input
                type="range"
                min={1}
                max={127}
                value={padVelocity}
                onChange={(e) => handlePadVelocityChange(selectedPad, Number(e.target.value))}
                className="w-24 accent-amber-400"
              />
              <span className="font-mono text-amber-400 w-8 text-right text-[11px]">{padVelocity}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-neutral-500 text-[10px]">Swing</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={padStates.get(selectedPad)?.swing ?? 50}
                onChange={(e) => updatePadSwing(Number(e.target.value))}
                className="w-24 accent-amber-400"
              />
              <span className="font-mono text-amber-400 w-8 text-right text-[11px]">
                {padStates.get(selectedPad)?.swing ?? 50}%
              </span>
            </div>

            <div className="text-neutral-500 text-[10px]">
              Layers: <span className="text-white font-medium">{padStates.get(selectedPad)?.layers ?? 0}</span>
            </div>
            <div className="text-neutral-500 text-[10px]">
              Pitch: <span className="text-cyan-400 font-medium">{padStates.get(selectedPad)?.pitchOffset ?? 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
