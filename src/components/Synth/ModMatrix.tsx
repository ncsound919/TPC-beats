import { ModMatrixSlot, ModSource, ModDestination } from '../../types';

interface ModMatrixProps {
  slots: ModMatrixSlot[];
  onChange: (slots: ModMatrixSlot[]) => void;
  maxSlots?: number;
}

const SOURCES: ModSource[] = [
  'lfo1', 'lfo2', 'env3', 'env4',
  'velocity', 'keyboard', 'modwheel', 'aftertouch',
  'macro1', 'macro2', 'macro3', 'macro4',
  'random', 'step',
];

const DESTINATIONS: ModDestination[] = [
  'cutoff', 'resonance', 'pitch', 'volume',
  'pan', 'fx1', 'fx2', 'drive',
  'decay', 'release', 'lfoRate', 'lfoDepth',
];

export function ModMatrix({ slots, onChange, maxSlots = 8 }: ModMatrixProps) {
  const addSlot = () => {
    if (slots.length >= maxSlots) return;
    const newSlot: ModMatrixSlot = {
      id: crypto.randomUUID(),
      source: 'lfo1',
      destination: 'cutoff',
      amount: 50,
      min: 0,
      max: 100,
      enabled: true,
    };
    onChange([...slots, newSlot]);
  };

  const updateSlot = (id: string, updates: Partial<ModMatrixSlot>) => {
    onChange(slots.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const removeSlot = (id: string) => {
    onChange(slots.filter((s) => s.id !== id));
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Mod Matrix</span>
        <button
          onClick={addSlot}
          disabled={slots.length >= maxSlots}
          className="text-[10px] bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded px-2 py-0.5 font-bold uppercase"
        >
          + Add Route
        </button>
      </div>

      {slots.length === 0 && (
        <div className="text-[9px] text-zinc-600 text-center py-4">
          No modulation routes. Click + Add Route to start.
        </div>
      )}

      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center gap-1.5 bg-zinc-800 rounded px-2 py-1.5 text-[10px]"
          >
            <button
              onClick={() => updateSlot(slot.id, { enabled: !slot.enabled })}
              className={`w-3 h-3 rounded-full ${slot.enabled ? 'bg-green-500' : 'bg-zinc-600'}`}
            />

            <select
              value={slot.source}
              onChange={(e) => updateSlot(slot.id, { source: e.target.value as ModSource })}
              className="bg-zinc-700 text-zinc-200 rounded px-1 py-0.5 border border-zinc-600 w-20"
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>

            <span className="text-zinc-600">→</span>

            <select
              value={slot.destination}
              onChange={(e) => updateSlot(slot.id, { destination: e.target.value as ModDestination })}
              className="bg-zinc-700 text-zinc-200 rounded px-1 py-0.5 border border-zinc-600 w-20"
            >
              {DESTINATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 flex-1">
              <input
                type="range"
                min={-100} max={100} step={1}
                value={slot.amount}
                onChange={(e) => updateSlot(slot.id, { amount: Number(e.target.value) })}
                className="flex-1 h-1 accent-violet-500"
              />
              <span className="font-mono text-zinc-400 w-6 text-right">{slot.amount}</span>
            </div>

            <button
              onClick={() => removeSlot(slot.id)}
              className="text-red-400 hover:text-red-300 ml-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {slots.length >= maxSlots && (
        <div className="text-[8px] text-amber-500">Max {maxSlots} routes</div>
      )}
    </div>
  );
}
