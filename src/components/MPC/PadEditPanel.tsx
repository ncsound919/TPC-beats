import { Pad, PadFilter, PadADSR } from '../../types';
import { ADSREditor } from '../Synth/ADSREditor';

interface PadEditPanelProps {
  pad: Pad;
  onUpdate: (updates: Partial<Pad>) => void;
}

const FILTER_TYPES: PadFilter['type'][] = ['lowpass', 'highpass', 'bandpass', 'notch'];

export function PadEditPanel({ pad, onUpdate }: PadEditPanelProps) {
  const filter = pad.filter ?? { enabled: false, type: 'lowpass', cutoff: 20000, resonance: 0, envelope: 0, keyTrack: 0 };
  const ampEnv = pad.ampEnv ?? { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3 };
  const filterEnv = pad.filterEnv ?? { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.3 };

  const updateFilter = (updates: Partial<PadFilter>) => {
    onUpdate({ filter: { ...filter, ...updates } });
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-4 w-72">
      <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">Pad {pad.padId + 1}</div>

      {/* Filter Section */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] uppercase text-zinc-500">
            <input
              type="checkbox"
              checked={filter.enabled}
              onChange={(e) => updateFilter({ enabled: e.target.checked })}
              className="accent-violet-500"
            />
            Filter
          </label>
          <select
            value={filter.type}
            onChange={(e) => updateFilter({ type: e.target.value as PadFilter['type'] })}
            className="bg-zinc-800 text-[10px] text-zinc-300 border border-zinc-600 rounded px-1 py-0.5"
          >
            {FILTER_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {filter.enabled && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <SliderRow label="Cutoff" value={filter.cutoff} min={20} max={20000} step={1} log
              onChange={(v) => updateFilter({ cutoff: v })} />
            <SliderRow label="Resonance" value={filter.resonance} min={0} max={100} step={1}
              onChange={(v) => updateFilter({ resonance: v })} />
            <SliderRow label="Env Amt" value={filter.envelope} min={-100} max={100} step={1}
              onChange={(v) => updateFilter({ envelope: v })} />
            <SliderRow label="Key Trk" value={filter.keyTrack} min={0} max={100} step={1}
              onChange={(v) => updateFilter({ keyTrack: v })} />
          </div>
        )}
      </div>

      {/* Amp Envelope */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Amp Envelope</span>
        <ADSREditor
          attack={ampEnv.attack}
          decay={ampEnv.decay}
          sustain={ampEnv.sustain}
          release={ampEnv.release}
          onChange={(v) => onUpdate({ ampEnv: v })}
          width={240} height={70}
        />
        <div className="grid grid-cols-4 gap-1 mt-1">
          <MiniParam label="A" value={ampEnv.attack.toFixed(2)} />
          <MiniParam label="D" value={ampEnv.decay.toFixed(2)} />
          <MiniParam label="S" value={ampEnv.sustain.toFixed(2)} />
          <MiniParam label="R" value={ampEnv.release.toFixed(2)} />
        </div>
      </div>

      {/* Filter Envelope */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Filter Envelope</span>
        <ADSREditor
          attack={filterEnv.attack}
          decay={filterEnv.decay}
          sustain={filterEnv.sustain}
          release={filterEnv.release}
          onChange={(v) => onUpdate({ filterEnv: v })}
          width={240} height={70}
        />
        <div className="grid grid-cols-4 gap-1 mt-1">
          <MiniParam label="A" value={filterEnv.attack.toFixed(2)} />
          <MiniParam label="D" value={filterEnv.decay.toFixed(2)} />
          <MiniParam label="S" value={filterEnv.sustain.toFixed(2)} />
          <MiniParam label="R" value={filterEnv.release.toFixed(2)} />
        </div>
      </div>

      {/* Misc */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <SliderRow label="Swing" value={pad.swing} min={0} max={100} step={1}
          onChange={(v) => onUpdate({ swing: v })} />
        <SliderRow label="Saturation" value={pad.saturation ?? 0} min={0} max={100} step={1}
          onChange={(v) => onUpdate({ saturation: v })} />
        <SliderRow label="Pitch" value={pad.pitchOffset ?? 0} min={-24} max={24} step={1}
          onChange={(v) => onUpdate({ pitchOffset: v })} />
      </div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, log, onChange }: {
  label: string; value: number; min: number; max: number; step: number; log?: boolean;
  onChange: (v: number) => void;
}) {
  const displayVal = log
    ? Math.round((Math.log(value / min) / Math.log(max / min)) * 100)
    : Math.round(((value - min) / (max - min)) * 100);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-mono">{log ? value.toFixed(0) : value.toFixed(0)}</span>
      </div>
      <input
        type="range"
        min={0} max={100} step={1}
        value={displayVal}
        onChange={(e) => {
          const pct = Number(e.target.value) / 100;
          const v = log
            ? Math.round(min * Math.pow(max / min, pct))
            : Math.round((min + (max - min) * pct) / step) * step;
          onChange(v);
        }}
        className="w-full h-1 accent-violet-500"
      />
    </div>
  );
}

function MiniParam({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-zinc-600">{label}</span>
      <span className="text-[10px] font-mono text-zinc-400">{value}</span>
    </div>
  );
}
