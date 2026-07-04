import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';

/* ===================================================================
   T Y P E S   &   I N T E R F A C E S
   =================================================================== */

export interface Rompler808Params {
  tune: number;
  decay: number;
  tone: number;
  glide: number;
  distortion: number;
}

export interface ExtendedRomplerParams extends Rompler808Params {
  sampleStart: number;
  sampleEnd: number;
  loop: boolean;
  loopStart: number;
  reverse: boolean;
  pitchKeyTrack: boolean;
  ampEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  filter: {
    enabled: boolean;
    type: 'lowpass' | 'bandpass' | 'highpass';
    cutoff: number;
    resonance: number;
    envelope: number;
    keyFollow: number;
  };
  filtEnv: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  lfo: {
    enabled: boolean;
    waveform: 'sine' | 'triangle' | 'saw' | 'square' | 'random';
    rate: number;
    sync: boolean;
    pitchMod: number;
    filterMod: number;
    ampMod: number;
  };
  drive: {
    type: 'soft' | 'hard' | 'fold' | 'tube' | 'darkdrive' | 'grunge';
    amount: number;
    tone: number;
    mix: number;
    postLowCut: number;
    postHighCut: number;
    output: number;
  };
  compressor: {
    enabled: boolean;
    threshold: number;
    ratio: number;
    attack: number;
    release: number;
    mix: number;
    autoSidechain: boolean;
  };
  master: {
    volume: number;
    pan: number;
    width: number;
    maximizer: number; // 0-100 (limiter amount)
  };
  engines: {
    sample: { mix: number };
    synth: {
      mix: number;
      waveform: 'sine' | 'saw' | 'square' | 'triangle' | 'noise';
      pitch: number; // semitones offset
      decay: number; // ms
    };
    xsub: {
      mix: number;
      harmonics: number; // 0-100
      psycho: number; // 0-100 (perceived depth boost)
    };
  };
  macros: Array<{
    name: string;
    value: number; // 0-100
    assignments: Record<string, { min: number; max: number }>;
  }>;
}

interface SavedPreset {
  name: string;
  timestamp: number;
  params: ExtendedRomplerParams;
  version: number;
}

/* ===================================================================
   D E F A U L T S
   =================================================================== */

const defaultExtendedParams: ExtendedRomplerParams = {
  tune: 0,
  decay: 300,
  tone: 50,
  glide: 0,
  distortion: 0,
  sampleStart: 0,
  sampleEnd: 100,
  loop: false,
  loopStart: 20,
  reverse: false,
  pitchKeyTrack: true,
  ampEnv: { attack: 5, decay: 250, sustain: 0.8, release: 200 },
  filter: {
    enabled: false,
    type: 'lowpass',
    cutoff: 5000,
    resonance: 0,
    envelope: 0,
    keyFollow: 0,
  },
  filtEnv: { attack: 10, decay: 100, sustain: 0.5, release: 100 },
  lfo: {
    enabled: false,
    waveform: 'sine',
    rate: 1,
    sync: false,
    pitchMod: 0,
    filterMod: 0,
    ampMod: 0,
  },
  drive: {
    type: 'soft',
    amount: 0,
    tone: 50,
    mix: 100,
    postLowCut: 20,
    postHighCut: 18000,
    output: 100,
  },
  compressor: {
    enabled: false,
    threshold: -12,
    ratio: 4,
    attack: 5,
    release: 50,
    mix: 100,
    autoSidechain: false,
  },
  master: {
    volume: 100,
    pan: 0,
    width: 0,
    maximizer: 0,
  },
  engines: {
    sample: { mix: 100 },
    synth: {
      mix: 0,
      waveform: 'sine',
      pitch: 0,
      decay: 300,
    },
    xsub: {
      mix: 60,
      harmonics: 30,
      psycho: 70,
    },
  },
  macros: [
    { name: 'Macro 1', value: 50, assignments: {} },
    { name: 'Macro 2', value: 50, assignments: {} },
    { name: 'Macro 3', value: 50, assignments: {} },
    { name: 'Macro 4', value: 50, assignments: {} },
  ],
};

/* ===================================================================
   H E L P E R S   (same as before)
   =================================================================== */

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = structuredClone(target) as T;
  if (!source) return result;

  const stack: Array<[any, any]> = [[result, source]];
  while (stack.length > 0) {
    const [tgt, src] = stack.pop()!;
    Object.keys(src).forEach((key) => {
      const srcVal = (src as any)[key];
      const tgtVal = (tgt as any)[key];

      if (
        srcVal &&
        typeof srcVal === 'object' &&
        !Array.isArray(srcVal) &&
        tgtVal &&
        typeof tgtVal === 'object' &&
        !Array.isArray(tgtVal)
      ) {
        tgt[key] = { ...tgtVal };
        stack.push([tgt[key], srcVal]);
      } else if (srcVal !== undefined) {
        tgt[key] = srcVal;
      }
    });
  }
  return result;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj) ?? 0;
}

function setNestedValue(obj: any, path: string, value: any): any {
  const result = structuredClone(obj);
  const parts = path.split('.');
  let current = result;

  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }

  current[parts[parts.length - 1]] = value;
  return result;
}

function paramsToJSON(params: ExtendedRomplerParams): string {
  return JSON.stringify(params, null, 2);
}

function paramsFromJSON(json: string): ExtendedRomplerParams | null {
  try {
    const parsed = JSON.parse(json);
    return deepMerge(defaultExtendedParams, parsed);
  } catch {
    return null;
  }
}

function downloadJSON(data: string, filename: string) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ===================================================================
   U N D O / R E D O   H O O K   (same)
   =================================================================== */

interface UndoRedoState<T> {
  history: T[];
  index: number;
}

function useUndoRedo<T>(initial: T, maxHistory: number = 50) {
  const [state, setState] = useState<UndoRedoState<T>>({
    history: [initial],
    index: 0,
  });

  const push = useCallback((newValue: T) => {
    setState(prev => {
      const newHistory = prev.history.slice(0, prev.index + 1);
      newHistory.push(newValue);
      if (newHistory.length > maxHistory) {
        newHistory.shift();
      }
      return {
        history: newHistory,
        index: newHistory.length - 1,
      };
    });
  }, [maxHistory]);

  const undo = useCallback((): T | null => {
    let result: T | null = null;
    setState(prev => {
      if (prev.index > 0) {
        result = prev.history[prev.index - 1];
        return { ...prev, index: prev.index - 1 };
      }
      return prev;
    });
    return result;
  }, []);

  const redo = useCallback((): T | null => {
    let result: T | null = null;
    setState(prev => {
      if (prev.index < prev.history.length - 1) {
        result = prev.history[prev.index + 1];
        return { ...prev, index: prev.index + 1 };
      }
      return prev;
    });
    return result;
  }, []);

  const canUndo = state.index > 0;
  const canRedo = state.index < state.history.length - 1;
  const current = state.history[state.index];

  return { push, undo, redo, canUndo, canRedo, current };
}

/* ===================================================================
   S U B   C O M P O N E N T S   (Knob, Toggle, Section, WaveformPreview)
   =================================================================== */

// (Keep your existing Tooltip, Knob, ToggleButton, Section, WaveformPreview)
// I'll copy them here for completeness, but they are unchanged.
const Tooltip: React.FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-950 border border-neutral-700 text-neutral-200 text-[9px] px-3 py-1 rounded shadow-xl whitespace-nowrap z-50 pointer-events-none font-mono">
          {text}
        </div>
      )}
    </div>
  );
};

interface KnobProps {
  label: string;
  param: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  tooltip?: string;
  onChange: (param: string, value: number) => void;
  defaultValue?: number;
}

const Knob: React.FC<KnobProps> = React.memo(({
  label,
  param,
  value,
  min,
  max,
  step = 0.01,
  tooltip,
  onChange,
  defaultValue,
}) => {
  const clamped = Math.max(min, Math.min(max, value));
  const norm = (clamped - min) / (max - min);
  const rotation = norm * 270 - 135;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(param, Number(e.target.value));
  }, [param, onChange]);

  const handleReset = useCallback(() => {
    onChange(param, defaultValue !== undefined ? defaultValue : (min + max) / 2);
  }, [param, min, max, defaultValue, onChange]);

  const displayValue = step < 1 ? clamped.toFixed(2) : Math.round(clamped).toString();

  return (
    <Tooltip text={tooltip || `${label}: ${displayValue}`}>
      <div className="flex flex-col items-center gap-1">
        <div
          className="relative w-16 h-16 rounded-full bg-neutral-900 border-2 border-neutral-700 flex items-center justify-center shadow-inner cursor-pointer active:scale-95 transition-transform hover:border-neutral-600"
          onDoubleClick={handleReset}
          role="slider"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={clamped}
          aria-label={label}
          tabIndex={0}
        >
          <div
            className="w-14 h-14 rounded-full bg-neutral-800 border border-neutral-600 relative"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1.5 h-5 bg-yellow-400 rounded-full shadow-[0_0_6px_rgb(234,179,8)]" />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={clamped}
            onChange={handleChange}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={`${label} (${displayValue})`}
          />
        </div>
        <div className="text-center">
          <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-[1px]">{label}</div>
          <div className="text-[9px] font-mono text-yellow-400/80 tabular-nums">{displayValue}</div>
        </div>
      </div>
    </Tooltip>
  );
});
Knob.displayName = 'Knob';

interface ToggleProps {
  label: string;
  param: string;
  active: boolean;
  onChange: (param: string, value: boolean) => void;
}

const ToggleButton: React.FC<ToggleProps> = React.memo(({ label, param, active, onChange }) => {
  const handleToggle = useCallback(() => {
    onChange(param, !active);
  }, [param, active, onChange]);

  return (
    <Tooltip text={`${label}: ${active ? 'ENABLED' : 'DISABLED'}`}>
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={handleToggle}
          className={`w-11 h-6 rounded-full border transition-all relative flex items-center px-0.5 hover:shadow-md ${
            active
              ? 'bg-yellow-500 border-yellow-400 shadow-[0_0_12px_#eab308]'
              : 'bg-neutral-800 border-neutral-700 hover:border-neutral-600'
          }`}
          role="switch"
          aria-checked={active}
          aria-label={label}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-all shadow ${
              active ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">{label}</span>
      </div>
    </Tooltip>
  );
});
ToggleButton.displayName = 'ToggleButton';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col gap-4 p-5 pt-7 border border-neutral-800 rounded-xl bg-[#0a0a0a] relative">
    <div className="absolute -top-3 left-4 bg-[#111] px-3 py-0.5 text-[10px] font-bold tracking-widest text-yellow-500/90">
      {title}
    </div>
    {children}
  </div>
);

const WaveformPreview: React.FC<{
  peaks?: number[];
  sampleStart: number;
  sampleEnd: number;
  loop: boolean;
  loopStart: number;
}> = React.memo(({ peaks = [], sampleStart, sampleEnd, loop, loopStart }) => {
  const path = useMemo(() => {
    if (!peaks.length) return 'M 0 20 Q 25 5 50 20 Q 75 35 100 20';
    const h = 40;
    let d = `M 0 ${h / 2}`;
    const step = 100 / Math.max(peaks.length - 1, 1);
    peaks.forEach((p, i) => {
      const x = i * step;
      const y = h / 2 - Math.max(-1, Math.min(1, p)) * (h / 2 - 3);
      d += ` L ${x} ${y}`;
    });
    return d;
  }, [peaks]);

  return (
    <div className="relative">
      <svg viewBox="0 0 100 40" className="w-full h-12 bg-black rounded border border-neutral-800 overflow-hidden">
        <path d={path} stroke="#ca8a04" strokeWidth="1.25" fill="none" strokeLinecap="round" />
        <line x1={sampleStart} y1="2" x2={sampleStart} y2="38" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
        <line x1={sampleEnd} y1="2" x2={sampleEnd} y2="38" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
        {loop && (
          <line x1={loopStart} y1="2" x2={loopStart} y2="38" stroke="#22d3ee" strokeWidth="1" strokeDasharray="3 2" />
        )}
      </svg>
      <div className="flex justify-between text-[8px] text-neutral-500 font-mono px-1 mt-0.5">
        <span>SAMPLE</span>
        {loop && <span className="text-cyan-400">LOOP</span>}
      </div>
    </div>
  );
});
WaveformPreview.displayName = 'WaveformPreview';

/* ─── New: Frequency Visualizer ─── */
const FrequencyVisualizer: React.FC<{
  sampleMix: number;
  synthMix: number;
  xsubMix: number;
}> = ({ sampleMix, synthMix, xsubMix }) => {
  // Normalize to sum to 100
  const total = sampleMix + synthMix + xsubMix || 1;
  const samplePct = (sampleMix / total) * 100;
  const synthPct = (synthMix / total) * 100;
  const xsubPct = (xsubMix / total) * 100;

  // Map to frequency bands: sample = full, synth = mid/high, xsub = low
  // We'll just show three colored bars stacked horizontally.
  return (
    <div className="h-6 bg-neutral-900 rounded overflow-hidden flex">
      <div className="h-full bg-amber-600" style={{ width: `${samplePct}%` }} title="Sample" />
      <div className="h-full bg-blue-500" style={{ width: `${synthPct}%` }} title="Synth" />
      <div className="h-full bg-purple-600" style={{ width: `${xsubPct}%` }} title="X-Sub" />
    </div>
  );
};

/* ===================================================================
   M A I N   C O M P O N E N T
   =================================================================== */

interface MasterRompler808Props {
  params?: Partial<ExtendedRomplerParams>;
  onParamChange?: (param: keyof Rompler808Params, value: number) => void;
  onLoadSample?: (file: File) => void;
  currentSampleName?: string;
  onAssignToBank?: () => void;
  onTriggerTestNote?: () => void;
  onSavePatch?: (fullParams: ExtendedRomplerParams, name: string) => void;
  onLoadPatch?: () => void;
  waveformPeaks?: number[];
  onPresetChange?: (fullParams: ExtendedRomplerParams) => void;
}

export const MasterRompler808: React.FC<MasterRompler808Props> = ({
  params: incomingParams = {},
  onParamChange,
  onLoadSample,
  currentSampleName = 'NO SAMPLE',
  onAssignToBank,
  onTriggerTestNote,
  onSavePatch,
  onLoadPatch,
  waveformPeaks,
  onPresetChange,
}) => {
  const mergedDefaults = useMemo(() => deepMerge(defaultExtendedParams, incomingParams), [incomingParams]);
  const { push, undo, redo, canUndo, canRedo, current } = useUndoRedo(mergedDefaults);

  const [patchName, setPatchName] = useState('INIT 808');
  const [showExportImport, setShowExportImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const presetInputRef = useRef<HTMLInputElement>(null);
  const [macroEditIndex, setMacroEditIndex] = useState<number | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          const prev = undo();
          if (prev && onPresetChange) onPresetChange(prev);
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault();
          const next = redo();
          if (next && onPresetChange) onPresetChange(next);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, onPresetChange]);

  const handleParamChange = useCallback(
    (paramPath: string, value: any) => {
      const newParams = setNestedValue(current, paramPath, value);
      push(newParams);
      onPresetChange?.(newParams);

      // Backward compatibility for top-level params
      const topLevelKey = paramPath.split('.')[0];
      if (topLevelKey in defaultExtendedParams && paramPath.split('.').length === 1) {
        onParamChange?.(topLevelKey as keyof Rompler808Params, value);
      }
    },
    [current, push, onParamChange, onPresetChange]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        setSampleError('File too large (max 50MB)');
        return;
      }
      if (!file.type.startsWith('audio/')) {
        setSampleError('Invalid audio file');
        return;
      }
      setSampleError(null);
      onLoadSample?.(file);
    },
    [onLoadSample]
  );

  const handleUndo = useCallback(() => {
    const prev = undo();
    if (prev && onPresetChange) onPresetChange(prev);
  }, [undo, onPresetChange]);

  const handleRedo = useCallback(() => {
    const next = redo();
    if (next && onPresetChange) onPresetChange(next);
  }, [redo, onPresetChange]);

  const randomizePatch = useCallback(() => {
    const rand = (min: number, max: number) => Math.random() * (max - min) + min;

    const randomParams: ExtendedRomplerParams = {
      ...defaultExtendedParams,
      tune: Math.floor(rand(-24, 24)),
      decay: Math.floor(rand(100, 2000)),
      tone: Math.floor(rand(20, 80)),
      glide: Math.floor(rand(0, 250)),
      distortion: Math.random() > 0.7 ? Math.floor(rand(10, 80)) : 0,
      sampleStart: Math.floor(rand(0, 50)),
      sampleEnd: Math.floor(rand(60, 100)),
      loop: Math.random() > 0.65,
      loopStart: Math.floor(rand(15, 70)),
      reverse: Math.random() > 0.85,
      pitchKeyTrack: Math.random() > 0.15,
      ampEnv: {
        attack: Math.floor(rand(0, 100)),
        decay: Math.floor(rand(150, 1500)),
        sustain: rand(0.1, 0.9),
        release: Math.floor(rand(100, 1200)),
      },
      filter: {
        enabled: Math.random() > 0.4,
        type: (['lowpass', 'bandpass', 'highpass'][Math.floor(Math.random() * 3)] as any),
        cutoff: Math.floor(rand(400, 15000)),
        resonance: Math.random() > 0.6 ? Math.floor(rand(10, 85)) : 0,
        envelope: Math.random() > 0.6 ? Math.floor(rand(20, 100)) : 0,
        keyFollow: Math.random() > 0.7 ? Math.floor(rand(20, 80)) : 0,
      },
      filtEnv: {
        attack: Math.floor(rand(5, 200)),
        decay: Math.floor(rand(80, 1000)),
        sustain: rand(0.2, 0.95),
        release: Math.floor(rand(80, 1000)),
      },
      lfo: {
        enabled: Math.random() > 0.5,
        waveform: (['sine', 'triangle', 'saw', 'square', 'random'][Math.floor(Math.random() * 5)] as any),
        rate: rand(0.3, 15),
        sync: Math.random() > 0.5,
        pitchMod: Math.random() > 0.6 ? Math.floor(rand(50, 700)) : 0,
        filterMod: Math.random() > 0.6 ? Math.floor(rand(20, 95)) : 0,
        ampMod: Math.random() > 0.65 ? Math.floor(rand(10, 60)) : 0,
      },
      drive: {
        type: (['soft', 'hard', 'fold', 'tube', 'darkdrive', 'grunge'][Math.floor(Math.random() * 6)] as any),
        amount: Math.random() > 0.7 ? Math.floor(rand(15, 70)) : 0,
        tone: Math.floor(rand(20, 80)),
        mix: Math.floor(rand(60, 100)),
        postLowCut: Math.floor(rand(10, 80)),
        postHighCut: Math.floor(rand(2000, 18000)),
        output: Math.floor(rand(80, 100)),
      },
      compressor: {
        enabled: Math.random() > 0.5,
        threshold: Math.floor(rand(-30, -3)),
        ratio: Math.floor(rand(1.5, 10) * 10) / 10,
        attack: Math.floor(rand(1, 30)),
        release: Math.floor(rand(20, 150)),
        mix: Math.floor(rand(50, 100)),
        autoSidechain: Math.random() > 0.5,
      },
      master: {
        volume: Math.floor(rand(80, 100)),
        pan: Math.floor(rand(-35, 35)),
        width: Math.floor(rand(-50, 50)),
        maximizer: Math.floor(rand(0, 70)),
      },
      engines: {
        sample: { mix: Math.floor(rand(50, 100)) },
        synth: {
          mix: Math.random() > 0.5 ? Math.floor(rand(20, 80)) : 0,
          waveform: (['sine', 'saw', 'square', 'triangle', 'noise'][Math.floor(Math.random() * 5)] as any),
          pitch: Math.floor(rand(-12, 12)),
          decay: Math.floor(rand(100, 2000)),
        },
        xsub: {
          mix: Math.random() > 0.4 ? Math.floor(rand(30, 90)) : 0,
          harmonics: Math.floor(rand(10, 70)),
          psycho: Math.floor(rand(30, 90)),
        },
      },
      macros: current.macros.map((m) => ({ ...m, value: Math.floor(rand(0, 100)) })),
    };

    push(randomParams);
    onPresetChange?.(randomParams);
  }, [push, onPresetChange, current.macros]);

  const exportPreset = useCallback(() => {
    const preset: SavedPreset = {
      name: patchName,
      timestamp: Date.now(),
      params: current,
      version: 2,
    };
    downloadJSON(JSON.stringify(preset, null, 2), `${patchName.replace(/\s+/g, '_')}_${Date.now()}.json`);
  }, [current, patchName]);

  const importPreset = useCallback(() => {
    presetInputRef.current?.click();
  }, []);

  const handlePresetImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const parsed: SavedPreset = JSON.parse(json);
          const imported = paramsFromJSON(JSON.stringify(parsed.params));

          if (!imported) {
            setImportError('Invalid preset file');
            return;
          }

          push(imported);
          setPatchName(parsed.name || 'IMPORTED');
          onPresetChange?.(imported);
          setImportError(null);
        } catch (err) {
          setImportError('Failed to parse preset');
        }
      };
      reader.readAsText(file);
      if (presetInputRef.current) presetInputRef.current.value = '';
    },
    [push, onPresetChange]
  );

  const knob = useCallback(
    (param: string, min: number, max: number, step?: number, tooltip?: string, defaultVal?: number) => (
      <Knob
        key={param}
        label={param.split('.').pop()!.toUpperCase()}
        param={param}
        value={getNestedValue(current, param)}
        min={min}
        max={max}
        step={step}
        tooltip={tooltip}
        onChange={handleParamChange}
        defaultValue={defaultVal}
      />
    ),
    [current, handleParamChange]
  );

  const toggle = useCallback(
    (param: string, label: string) => (
      <ToggleButton
        key={param}
        label={label}
        param={param}
        active={getNestedValue(current, param) as boolean}
        onChange={handleParamChange}
      />
    ),
    [current, handleParamChange]
  );

  // Macro assignment editor – simple modal or inline
  const renderMacroAssignment = (macroIndex: number) => {
    const macro = current.macros[macroIndex];
    if (!macro) return null;
    const assignments = macro.assignments || {};
    const assignmentKeys = Object.keys(assignments);

    return (
      <div className="mt-2 p-2 bg-neutral-900 rounded border border-neutral-700 text-xs">
        <div className="flex justify-between items-center mb-1">
          <span className="text-amber-400 font-mono">{macro.name} assignments</span>
          <button
            onClick={() => {
              // Add a new assignment (simplistic – ask user for param path)
              const path = prompt('Enter parameter path (e.g., filter.cutoff):');
              if (path) {
                const min = parseFloat(prompt('Min value:') || '0');
                const max = parseFloat(prompt('Max value:') || '100');
                if (!isNaN(min) && !isNaN(max)) {
                  const newAssign = { ...assignments, [path]: { min, max } };
                  handleParamChange(`macros.${macroIndex}.assignments`, newAssign);
                }
              }
            }}
            className="text-[9px] px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-900/50"
          >
            + ADD
          </button>
        </div>
        {assignmentKeys.length === 0 && (
          <div className="text-neutral-500 text-[9px]">No assignments. Click + to add.</div>
        )}
        {assignmentKeys.map((path) => (
          <div key={path} className="flex justify-between items-center gap-2 border-b border-neutral-800 py-0.5">
            <span className="font-mono text-[9px] text-neutral-300">{path}</span>
            <span className="text-[8px] text-neutral-500">
              {assignments[path].min} – {assignments[path].max}
            </span>
            <button
              onClick={() => {
                const newAssign = { ...assignments };
                delete newAssign[path];
                handleParamChange(`macros.${macroIndex}.assignments`, newAssign);
              }}
              className="text-[9px] text-red-400 hover:text-red-300"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-[#0a0a0a] border border-yellow-900/40 p-6 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
      {/* ============ HEADER ============ */}
      <div className="flex justify-between items-start mb-6 shrink-0 gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-[2px] text-yellow-400 flex items-center gap-4">
            <span className="bg-yellow-500 text-black px-3 py-1 text-base rounded">TR-808</span>
            MASTER ROMPLER
          </h2>
          <p className="text-xs text-neutral-500 font-mono tracking-widest mt-1">EXTENDED SAMPLE SYNTHESIZER</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {/* Undo/Redo */}
          <div className="flex gap-1">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="px-3 py-1.5 text-xs font-bold bg-neutral-900 text-neutral-400 hover:text-neutral-200 rounded-lg border border-neutral-700 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="px-3 py-1.5 text-xs font-bold bg-neutral-900 text-neutral-400 hover:text-neutral-200 rounded-lg border border-neutral-700 hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              ↪
            </button>
          </div>

          {/* Randomize */}
          <button
            onClick={randomizePatch}
            className="px-4 py-1.5 bg-violet-950/60 hover:bg-violet-900/70 border border-violet-500/30 text-violet-300 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors"
            title="Generate random patch"
          >
            🎲 RANDOM
          </button>

          {/* Export/Import */}
          <button
            onClick={() => setShowExportImport(!showExportImport)}
            className="px-4 py-1.5 bg-neutral-900/50 text-neutral-400 text-xs font-bold rounded-lg hover:bg-neutral-900 border border-neutral-700 transition-colors uppercase tracking-widest"
            title="Export/Import preset"
          >
            ⇅ TRANSFER
          </button>

          {/* Patch name */}
          <input
            type="text"
            value={patchName}
            onChange={(e) => setPatchName(e.target.value.slice(0, 32))}
            placeholder="PATCH NAME"
            className="text-xs font-mono text-yellow-300 bg-black px-4 py-1.5 border border-yellow-900 rounded-lg shadow-inner w-40 text-right focus:outline-none focus:border-yellow-700"
          />

          <button
            onClick={onLoadPatch}
            className="px-5 py-1.5 bg-neutral-800 text-neutral-400 text-xs font-bold rounded-lg hover:bg-neutral-700 border border-neutral-700 transition-colors uppercase tracking-widest"
          >
            LOAD
          </button>
          <button
            onClick={() => onSavePatch?.(current, patchName)}
            className="px-5 py-1.5 bg-yellow-600 text-black text-xs font-bold rounded-lg hover:bg-yellow-500 border border-yellow-600 transition-colors uppercase tracking-widest shadow-[0_0_8px_rgba(202,138,4,0.2)]"
          >
            SAVE
          </button>
        </div>
      </div>

      {/* ============ EXPORT/IMPORT PANEL ============ */}
      {showExportImport && (
        <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded-lg flex gap-3 items-center shrink-0 mb-4">
          <button
            onClick={exportPreset}
            className="px-4 py-1.5 bg-green-900/30 text-green-400 text-xs font-bold rounded-lg hover:bg-green-900/50 border border-green-900/50 transition-colors uppercase"
          >
            ↓ EXPORT
          </button>
          <button
            onClick={importPreset}
            className="px-4 py-1.5 bg-blue-900/30 text-blue-400 text-xs font-bold rounded-lg hover:bg-blue-900/50 border border-blue-900/50 transition-colors uppercase"
          >
            ↑ IMPORT
          </button>
          <input
            ref={presetInputRef}
            type="file"
            accept=".json"
            onChange={handlePresetImport}
            className="hidden"
          />
          {importError && (
            <span className="text-[10px] text-red-400 font-mono ml-2">{importError}</span>
          )}
          <button
            onClick={() => setShowExportImport(false)}
            className="ml-auto px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ============ MAIN GRID ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto flex-1 custom-scrollbar pr-2">
        {/* ---- SAMPLE ENGINE ---- */}
        <Section title="SAMPLE ENGINE">
          <div className="space-y-4">
            <div className="flex gap-3 items-stretch flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="bg-black border border-neutral-700 px-3 py-2 rounded-lg font-mono text-xs text-neutral-400 break-all truncate">
                  {currentSampleName}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 w-full text-xs font-bold tracking-widest py-2 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 rounded-lg transition-colors"
                >
                  LOAD SAMPLE
                </button>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="audio/*" className="hidden" />
                {sampleError && (
                  <div className="mt-1.5 text-[9px] text-red-400 font-mono">{sampleError}</div>
                )}
              </div>

              {onTriggerTestNote && (
                <button
                  onClick={onTriggerTestNote}
                  className="px-4 py-2 bg-neutral-900 hover:bg-emerald-950/30 border border-emerald-900 text-emerald-400 rounded-lg text-xs font-bold whitespace-nowrap self-end"
                >
                  ▶ AUDITION
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-4">
              {knob('sampleStart', 0, 100, 0.5, 'Sample Start %')}
              {knob('sampleEnd', 0, 100, 0.5, 'Sample End %')}
              {toggle('loop', 'LOOP')}
              {current.loop && knob('loopStart', 0, 100, 0.5, 'Loop Start %')}
              {toggle('reverse', 'REVERSE')}
              {toggle('pitchKeyTrack', 'KEY TRACK')}
            </div>

            <WaveformPreview
              peaks={waveformPeaks}
              sampleStart={current.sampleStart}
              sampleEnd={current.sampleEnd}
              loop={current.loop}
              loopStart={current.loopStart}
            />
          </div>
        </Section>

        {/* ---- BASIC CONTROLS ---- */}
        <Section title="BASIC CONTROLS">
          <div className="flex flex-wrap gap-6 justify-center">
            {knob('tune', -48, 48, 0.1, 'Tune (semitones)', 0)}
            {knob('decay', 30, 3000, 1, 'Decay (ms)', 300)}
            {knob('tone', 0, 100, 1, 'Tone', 50)}
            {knob('glide', 0, 400, 1, 'Glide (ms)', 0)}
            {knob('distortion', 0, 100, 1, 'Distortion', 0)}
          </div>
        </Section>

        {/* ---- AMP ENV ---- */}
        <Section title="AMP ENVELOPE">
          <div className="flex flex-wrap gap-6 justify-center">
            {knob('ampEnv.attack', 0, 3000, 1, 'Attack (ms)', 5)}
            {knob('ampEnv.decay', 0, 6000, 1, 'Decay (ms)', 250)}
            {knob('ampEnv.sustain', 0, 1, 0.01, 'Sustain', 0.8)}
            {knob('ampEnv.release', 0, 6000, 1, 'Release (ms)', 200)}
          </div>
        </Section>

        {/* ---- FILTER ---- */}
        <Section title="FILTER">
          <div className="flex flex-wrap gap-5 items-end justify-center">
            {toggle('filter.enabled', 'ENABLE')}
            <div className="flex flex-col gap-1">
              <select
                value={current.filter.type}
                onChange={(e) => handleParamChange('filter.type', e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs py-2 px-3 rounded-lg font-mono text-neutral-300 hover:border-neutral-600 focus:outline-none"
              >
                <option value="lowpass">LOWPASS</option>
                <option value="bandpass">BANDPASS</option>
                <option value="highpass">HIGHPASS</option>
              </select>
              <span className="text-[8px] text-center text-neutral-500 font-bold uppercase tracking-widest">TYPE</span>
            </div>
            {knob('filter.cutoff', 20, 20000, 10, 'Cutoff (Hz)', 5000)}
            {knob('filter.resonance', 0, 100, 0.5, 'Resonance', 0)}
            {knob('filter.envelope', 0, 100, 1, 'Env Amount', 0)}
            {knob('filter.keyFollow', 0, 100, 1, 'Key Follow', 0)}
          </div>
        </Section>

        {/* ---- FILTER ENV ---- */}
        <Section title="FILTER ENVELOPE">
          <div className="flex flex-wrap gap-6 justify-center">
            {knob('filtEnv.attack', 0, 3000, 1)}
            {knob('filtEnv.decay', 0, 6000, 1)}
            {knob('filtEnv.sustain', 0, 1, 0.01)}
            {knob('filtEnv.release', 0, 6000, 1)}
          </div>
        </Section>

        {/* ---- LFO ---- */}
        <Section title="LFO">
          <div className="flex flex-wrap gap-5 items-end justify-center">
            {toggle('lfo.enabled', 'ENABLE')}
            <div className="flex flex-col gap-1">
              <select
                value={current.lfo.waveform}
                onChange={(e) => handleParamChange('lfo.waveform', e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs py-2 px-3 rounded-lg font-mono text-neutral-300 hover:border-neutral-600 focus:outline-none"
              >
                <option value="sine">SINE</option>
                <option value="triangle">TRIANGLE</option>
                <option value="saw">SAW</option>
                <option value="square">SQUARE</option>
                <option value="random">RANDOM</option>
              </select>
              <span className="text-[8px] text-center text-neutral-500 font-bold uppercase tracking-widest">WAVE</span>
            </div>
            {knob('lfo.rate', 0.05, 40, 0.05, 'Rate (Hz)', 1)}
            {toggle('lfo.sync', 'TEMPO SYNC')}
            {knob('lfo.pitchMod', 0, 2400, 1, 'Pitch Mod (cents)', 0)}
            {knob('lfo.filterMod', 0, 100, 1, 'Filter Mod', 0)}
            {knob('lfo.ampMod', 0, 100, 1, 'Amp Mod', 0)}
          </div>
        </Section>

        {/* ---- ENGINE MIX (NEW) ---- */}
        <Section title="ENGINE MIX">
          <div className="flex flex-wrap gap-5 justify-center items-end">
            {knob('engines.sample.mix', 0, 100, 1, 'Sample Mix', 100)}
            {knob('engines.synth.mix', 0, 100, 1, 'Synth Mix', 0)}
            {knob('engines.xsub.mix', 0, 100, 1, 'X-Sub Mix', 60)}
          </div>
          {/* Synth controls */}
          <div className="flex flex-wrap gap-4 items-center justify-center">
            <div className="flex flex-col gap-1">
              <select
                value={current.engines.synth.waveform}
                onChange={(e) => handleParamChange('engines.synth.waveform', e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs py-2 px-3 rounded-lg font-mono text-neutral-300 hover:border-neutral-600 focus:outline-none"
              >
                <option value="sine">SINE</option>
                <option value="saw">SAW</option>
                <option value="square">SQUARE</option>
                <option value="triangle">TRIANGLE</option>
                <option value="noise">NOISE</option>
              </select>
              <span className="text-[8px] text-center text-neutral-500 font-bold uppercase tracking-widest">SYNTH WAVE</span>
            </div>
            {knob('engines.synth.pitch', -24, 24, 0.5, 'Synth Pitch (semitones)', 0)}
            {knob('engines.synth.decay', 30, 3000, 1, 'Synth Decay (ms)', 300)}
          </div>
          {/* X-Sub controls */}
          <div className="flex flex-wrap gap-4 justify-center">
            {knob('engines.xsub.harmonics', 0, 100, 1, 'X-Sub Harmonics', 30)}
            {knob('engines.xsub.psycho', 0, 100, 1, 'X-Sub Psychoacoustic', 70)}
          </div>
          <FrequencyVisualizer
            sampleMix={current.engines.sample.mix}
            synthMix={current.engines.synth.mix}
            xsubMix={current.engines.xsub.mix}
          />
        </Section>

        {/* ---- DRIVE (ENHANCED) ---- */}
        <Section title="DRIVE">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            <div className="flex flex-col gap-1">
              <select
                value={current.drive.type}
                onChange={(e) => handleParamChange('drive.type', e.target.value)}
                className="bg-neutral-900 border border-neutral-700 text-xs py-2 px-3 rounded-lg font-mono text-neutral-300 hover:border-neutral-600 focus:outline-none"
              >
                <option value="soft">SOFT</option>
                <option value="hard">HARD</option>
                <option value="fold">FOLD</option>
                <option value="tube">TUBE</option>
                <option value="darkdrive">DARKDRIVE</option>
                <option value="grunge">GRUNGE</option>
              </select>
              <span className="text-[8px] text-center text-neutral-500 font-bold uppercase tracking-widest">TYPE</span>
            </div>
            {knob('drive.amount', 0, 100, 1, 'Drive Amount', 0)}
            {knob('drive.tone', 0, 100, 1, 'Tone', 50)}
            {knob('drive.mix', 0, 100, 1, 'Mix (parallel)', 100)}
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {knob('drive.postLowCut', 10, 500, 5, 'Post Low Cut (Hz)', 20)}
            {knob('drive.postHighCut', 1000, 20000, 100, 'Post High Cut (Hz)', 18000)}
            {knob('drive.output', 0, 100, 1, 'Output Gain', 100)}
          </div>
        </Section>

        {/* ---- COMPRESSOR (NEW) ---- */}
        <Section title="COMPRESSOR">
          <div className="flex flex-wrap gap-4 items-end justify-center">
            {toggle('compressor.enabled', 'ENABLE')}
            {knob('compressor.threshold', -40, 0, 0.5, 'Threshold (dB)', -12)}
            {knob('compressor.ratio', 1, 20, 0.1, 'Ratio', 4)}
            {knob('compressor.attack', 1, 100, 1, 'Attack (ms)', 5)}
            {knob('compressor.release', 10, 500, 1, 'Release (ms)', 50)}
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {knob('compressor.mix', 0, 100, 1, 'Mix', 100)}
            {toggle('compressor.autoSidechain', 'AUTO SIDECHAIN')}
          </div>
        </Section>

        {/* ---- MACROS (NEW) ---- */}
        <Section title="MACROS">
          <div className="flex flex-col gap-3">
            {current.macros.map((macro, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <input
                  type="text"
                  value={macro.name}
                  onChange={(e) => handleParamChange(`macros.${idx}.name`, e.target.value)}
                  className="bg-black border border-neutral-700 rounded px-2 py-1 text-xs w-24 text-neutral-300 font-mono"
                  placeholder={`Macro ${idx+1}`}
                />
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={macro.value}
                    onChange={(e) => handleParamChange(`macros.${idx}.value`, Number(e.target.value))}
                    className="flex-1 h-1 bg-neutral-700 rounded appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500"
                  />
                  <span className="text-[10px] font-mono text-yellow-400 w-8 text-right">{Math.round(macro.value)}</span>
                </div>
                <button
                  onClick={() => setMacroEditIndex(macroEditIndex === idx ? null : idx)}
                  className="text-[10px] px-2 py-1 bg-neutral-800 text-neutral-400 rounded hover:bg-neutral-700"
                >
                  {macroEditIndex === idx ? '✕' : '⚙'}
                </button>
              </div>
            ))}
            {macroEditIndex !== null && renderMacroAssignment(macroEditIndex)}
          </div>
        </Section>

        {/* ---- MASTER (ENHANCED) ---- */}
        <Section title="MASTER">
          <div className="flex flex-wrap gap-6 justify-center items-end">
            {knob('master.volume', 0, 100, 1, 'Volume', 100)}
            {knob('master.pan', -50, 50, 1, 'Pan', 0)}
            {knob('master.width', -100, 100, 1, 'Stereo Width', 0)}
            {knob('master.maximizer', 0, 100, 1, 'Maximizer (limiter)', 0)}
          </div>
          {onAssignToBank && (
            <button
              onClick={onAssignToBank}
              className="w-full py-3 border border-neutral-600 hover:border-yellow-500 text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-yellow-500/5 transition-colors"
            >
              ASSIGN TO BANK
            </button>
          )}
        </Section>
      </div>
    </div>
  );
};

export default MasterRompler808;