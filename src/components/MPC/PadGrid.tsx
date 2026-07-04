import React, { useState, useEffect, useCallback } from 'react';
import { programEngine } from '../../audio/ProgramEngine';
import { sequencer } from '../../audio/SequencerEngine';

interface PadGridProps {
  onPadTrigger?: (padId: number, velocity: number, time?: number) => void;
  activePad?: number | null;
  onPadDrop?: (padId: number, file: File) => void;
  onPadSettingsChange?: (padId: number, settings: Partial<any>) => void;
}

type PadMode = 'normal' | 'fullLevel' | 'sixteenLevels' | 'noteRepeat';

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
  const [noteRepeatInterval, setNoteRepeatInterval] = useState<NodeJS.Timeout | null>(null);

  const [padStates, setPadStates] = useState<Map<number, any>>(new Map());

  // Sync pad states from engine
  const loadPadStates = useCallback(() => {
    const states = new Map();
    for (let i = 0; i < 16; i++) {
      const pad = programEngine.getPad(i);
      if (pad) {
        states.set(i, {
          layers: pad.layers.length,
          swing: pad.swing ?? 50,
          pitchOffset: pad.pitchOffset ?? 0,
          hasSample: !!pad.assignedSliceId,
          chokeGroup: pad.chokeGroup,
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
    return 100;
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

    // Note Repeat
    if (padMode === 'noteRepeat') {
      if (noteRepeatInterval) clearInterval(noteRepeatInterval);
      
      const bpm = sequencer?.getBpm?.() || 92; // assume sequencer is imported or global
      const intervalMs = (60000 / bpm) / 4; // 16th notes for now

      const newInterval = setInterval(() => {
        programEngine.triggerPad(targetPadId, velocity);
        triggerVisual(padId);
      }, intervalMs);

      setNoteRepeatInterval(newInterval);
    }
  };

  const handleMouseUpGlobal = () => {
    if (noteRepeatInterval) {
      clearInterval(noteRepeatInterval);
      setNoteRepeatInterval(null);
    }
  };

  const updatePadSwing = (value: number) => {
    programEngine.setPadParam(selectedPad, 'swing', value);
    if (onPadSettingsChange) onPadSettingsChange(selectedPad, { swing: value });
    loadPadStates();
  };

  const mpcLayout = [12,13,14,15,8,9,10,11,4,5,6,7,0,1,2,3];

  return (
    <div className="bg-[#0a0a0a] border border-neutral-800 p-5 rounded-2xl shadow-2xl flex flex-col h-full" onMouseUp={handleMouseUpGlobal}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xs font-bold tracking-[3px] text-amber-400">MPC PADS • BANK A</h2>
        
        <div className="flex gap-2 text-[10px]">
          {(['normal', 'fullLevel', 'sixteenLevels', 'noteRepeat'] as PadMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => {
                setPadMode(mode);
                setSixteenLevelsBasePad(null);
              }}
              className={`px-3 py-1 rounded border uppercase tracking-widest transition-all ${
                padMode === mode 
                  ? 'border-amber-400 text-amber-400 bg-black' 
                  : 'border-neutral-700 hover:border-neutral-500'
              }`}
            >
              {mode === 'noteRepeat' ? 'REPEAT' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 flex-1">
        {mpcLayout.map((padId) => {
          const state = padStates.get(padId) || {};
          const isLit = litPads.has(padId);
          const isSelected = selectedPad === padId;
          const hasSwing = (state.swing ?? 50) !== 50;

          return (
            <div
              key={padId}
              onMouseDown={() => handlePadPress(padId)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onPadDrop?.(padId, e.dataTransfer.files[0])}
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
              {state.hasSample && <div className="absolute top-3 right-3 w-2.5 h-2.5 bg-emerald-500 rounded-full shadow" />}
              
              {state.layers > 1 && (
                <div className="absolute top-3 left-3 text-[9px] bg-black/80 px-1.5 py-px rounded text-amber-400 font-bold">
                  {state.layers}
                </div>
              )}

              {hasSwing && (
                <div className="absolute bottom-3 right-3 text-[8px] font-mono text-amber-400 tracking-widest">
                  SW
                </div>
              )}

              <div className="text-[10px] text-neutral-500 group-hover:text-neutral-400">A{(padId+1).toString().padStart(2,'0')}</div>
              <div className="text-2xl font-bold text-white mt-1">{padId + 1}</div>
            </div>
          );
        })}
      </div>

      {/* Per-Pad Controls Footer */}
      <div className="mt-6 bg-neutral-950 border border-neutral-800 rounded-xl p-4">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3">
            <span className="text-neutral-400">PAD</span>
            <span className="font-mono text-2xl text-white">A{(selectedPad + 1).toString().padStart(2, '0')}</span>
          </div>

          <div className="flex items-center gap-8 text-xs">
            <div>Layers: <span className="text-white font-medium">{padStates.get(selectedPad)?.layers ?? 0}</span></div>
            
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Swing</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={padStates.get(selectedPad)?.swing ?? 50}
                onChange={(e) => updatePadSwing(Number(e.target.value))}
                className="w-28 accent-amber-400"
              />
              <span className="font-mono text-amber-400 w-10 text-right">
                {(padStates.get(selectedPad)?.swing ?? 50)}%
              </span>
            </div>

            <div>Pitch: <span className="text-cyan-400 font-medium">{padStates.get(selectedPad)?.pitchOffset ?? 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}