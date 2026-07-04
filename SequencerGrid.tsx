import React, { useMemo, useCallback } from 'react';
import { Sequence, SequenceEvent } from '../../types';

interface SequencerGridProps {
  sequence: Sequence;
  currentTick?: number;
  onToggleStep?: (padId: number, stepIdx: number, hasEvent: boolean) => void;
  /** Swing percentage per pad (0-100). Keyed by padId (0-15). */
  swingValues?: Record<number, number>;
  /** Called when a pad's swing changes. */
  onSwingChange?: (padId: number, swing: number) => void;
}

/* ---------------------------------------------
   Deterministic Helpers
--------------------------------------------- */

function getBaseColor(stepIdx: number): string {
  if (stepIdx < 4) return 'bg-red-600 border-red-500';
  if (stepIdx < 8) return 'bg-orange-500 border-orange-400';
  if (stepIdx < 12) return 'bg-yellow-400 border-yellow-300';
  return 'bg-white border-neutral-300';
}

function getStepState(hasEvent: boolean, isCurrent: boolean): string {
  if (isCurrent && hasEvent) {
    return 'opacity-100 ring-2 ring-white z-10 brightness-125 shadow-md shadow-current';
  }
  if (isCurrent && !hasEvent) {
    return 'opacity-60 border-white ring-1 ring-white/50';
  }
  if (hasEvent) {
    return 'opacity-100 shadow-md shadow-current';
  }
  return 'opacity-20';
}

/* ---------------------------------------------
   Component
--------------------------------------------- */

export function SequencerGrid({
  sequence,
  currentTick = 0,
  onToggleStep,
  swingValues = {},
  onSwingChange,
}: SequencerGridProps) {
  const totalTicks = sequence.lengthBars * 4 * sequence.ppqn;
  const ticksPerStep = totalTicks / 16;
  const currentStep = Math.floor((currentTick % totalTicks) / ticksPerStep);

  const { padIds, steps, eventMap } = useMemo(() => {
    const padIds = Array.from({ length: 16 }, (_, i) => 15 - i);

    const steps = Array.from({ length: 16 }, (_, stepIdx) => ({
      stepIdx,
      start: stepIdx * ticksPerStep,
      end: (stepIdx + 1) * ticksPerStep,
    }));

    const eventMap = new Map<number, Map<number, SequenceEvent[]>>();

    sequence.events.forEach((e) => {
      const stepIdx = Math.floor(e.timestampPPQN / ticksPerStep);
      if (stepIdx < 0 || stepIdx >= 16) return;

      if (!eventMap.has(e.padId)) {
        eventMap.set(e.padId, new Map());
      }
      const padMap = eventMap.get(e.padId)!;

      if (!padMap.has(stepIdx)) {
        padMap.set(stepIdx, []);
      }
      padMap.get(stepIdx)!.push(e);
    });

    return { padIds, steps, eventMap };
  }, [sequence.events, ticksPerStep, totalTicks]);

  const handleStepClick = useCallback(
    (padId: number, stepIdx: number) => {
      if (!onToggleStep) return;

      const padMap = eventMap.get(padId);
      const hasEvent = padMap?.has(stepIdx) && (padMap.get(stepIdx)?.length ?? 0) > 0;

      onToggleStep(padId, stepIdx, !!hasEvent);
    },
    [eventMap, onToggleStep]
  );

  const handleSwingChange = useCallback(
    (padId: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && onSwingChange) {
        onSwingChange(padId, Math.min(100, Math.max(0, val)));
      }
    },
    [onSwingChange]
  );

  // Helper: compute horizontal offset for a step based on swing and step index.
  // Swing shifts alternate steps (odd steps) by a percentage of a step width.
  // We'll shift by a fraction of the button width (say up to 50% of a step cell).
  const getSwingOffset = (padId: number, stepIdx: number): number => {
    const swing = swingValues[padId] ?? 0;
    if (swing === 0) return 0;
    // Apply swing to odd steps (or even – choose based on typical swing: off-beat = odd)
    // We'll use (stepIdx % 2 === 1) for off‑beat.
    if (stepIdx % 2 === 0) return 0; // no offset for downbeats
    // Map swing% to a pixel offset. We'll use a max offset of ~20px (adjust as needed)
    // but we also need to account for the button width (w-6 lg:w-8) ~24-32px.
    // Use relative translation: maxShift = 40% of button width.
    const buttonWidth = 32; // px (approx for lg:w-8)
    const maxShift = buttonWidth * 0.4;
    return (swing / 100) * maxShift;
  };

  return (
    <section className="bg-[#111] border border-neutral-800 p-4 rounded-xl shadow-lg flex-1 flex flex-col min-h-[140px] overflow-hidden">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[11px] font-bold tracking-widest text-yellow-500 uppercase">
          808 Drum Machine
        </h2>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-yellow-500" />
          <div className="w-2 h-2 rounded-full bg-neutral-800" />
          <div className="w-2 h-2 rounded-full bg-neutral-800" />
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto pr-2 flex flex-col gap-2 
        [&::-webkit-scrollbar]:w-1 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-neutral-800 
        [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        {padIds.map((padId) => {
          const swing = swingValues[padId] ?? 0;
          return (
            <div key={padId} className="flex gap-2 items-center">
              {/* Pad label with swing control */}
              <div className="flex flex-col items-end w-14 shrink-0">
                <span className="text-neutral-500 font-mono text-[10px] uppercase font-bold">
                  P{padId + 1}
                </span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={swing}
                  onChange={(e) => handleSwingChange(padId, e)}
                  className="w-10 h-1 bg-neutral-700 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500"
                  title={`Swing: ${swing}%`}
                />
                <span className="text-[8px] text-neutral-500">{swing}%</span>
              </div>

              <div className="flex gap-1.5 flex-1 overflow-x-auto min-w-max pb-1 [&::-webkit-scrollbar]:hidden">
                {steps.map(({ stepIdx }) => {
                  const padMap = eventMap.get(padId);
                  const hasEvent =
                    padMap?.has(stepIdx) && (padMap.get(stepIdx)?.length ?? 0) > 0;

                  const isCurrent = stepIdx === currentStep;
                  const baseColor = getBaseColor(stepIdx);
                  const state = getStepState(hasEvent, isCurrent);

                  // Swing offset
                  const offsetX = getSwingOffset(padId, stepIdx);

                  return (
                    <button
                      key={stepIdx}
                      type="button"
                      onClick={() => handleStepClick(padId, stepIdx)}
                      style={{
                        transform: `translateX(${offsetX}px)`,
                        transition: 'transform 0.1s ease-out',
                      }}
                      className={`
                        w-6 lg:w-8 h-8 lg:h-10 rounded border transition-all duration-75
                        ${baseColor} ${state}
                        focus:outline-none focus:ring-1 focus:ring-yellow-400/60
                        shrink-0
                      `}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
