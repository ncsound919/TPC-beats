import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from 'react';

import { JunoParams, ExtendedJunoParams } from '../../types';
import { parseJunoSysex } from '../../audio/synths/JunoParser';
import { engine } from '../../audio/AudioEngine';

/* ===================================================================
   TYPES
   =================================================================== */

interface SavedPreset {
  name: string;
  timestamp: number;
  params: ExtendedJunoParams;
}

interface MasterJunoSynthProps {
  params?: Partial<ExtendedJunoParams>;
  onParamChange?: (section: keyof JunoParams, param: string, value: any) => void;
  onPresetChange?: (fullParams: ExtendedJunoParams) => void;
  onSavePreset?: () => void;
}

/* ===================================================================
   DEFAULTS
   =================================================================== */

const defaultExtendedParams: ExtendedJunoParams = {
  dco: {
    wavePulse: false,
    waveSaw: true,
    waveSub: false,
    sync: false,
    unison: false,
    pwm: 50,
    sub: 0,
    noise: 0,
    detune: 0,
    portamento: 0,
  },
  lfo: { rate: 0, delay: 0, fade: 0 },
  hpf: { freq: 0 },
  vcf: { freq: 50, res: 0, env: 0, lfo: 0, kbd: 0, drive: 0 },
  vca: { mode: 'env', level: 80, velocity: 0 },
  env: { a: 0, d: 50, s: 50, r: 30 },
  chorus: { mode: 'off', mix: 50, depth: 50 },
  chord: { enabled: false, notes: [0, 4, 7] },
  arpeggiator: { enabled: false, mode: 'up', octaves: 2, rate: 50, gate: 70, latch: false },
  lfo2: { waveform: 'triangle', rate: 30, delay: 0, fade: 0, retrigger: false, pitch: 0, filter: 0, amp: 0 },
  fx: { delayTime: 30, delayFeedback: 20, delayMix: 0, delaySync: true, reverbSize: 40, reverbMix: 0 },
  master: { volume: 100, limiter: false },
};

const MIDI_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/* ===================================================================
   HELPERS
   =================================================================== */

function mergeParams(partial: Partial<ExtendedJunoParams>): ExtendedJunoParams {
  const merged = structuredClone(defaultExtendedParams);
  for (const key of Object.keys(partial) as (keyof ExtendedJunoParams)[]) {
    if (partial[key] !== undefined) {
      (merged as any)[key] = { ...(merged as any)[key], ...(partial as any)[key] };
    }
  }
  return merged;
}

function paramsToJSON(params: ExtendedJunoParams | SavedPreset): string {
  return JSON.stringify(params, null, 2);
}

function paramsFromJSON(json: string): ExtendedJunoParams | null {
  try {
    const parsed = JSON.parse(json);
    return mergeParams(parsed);
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
   UNDO / REDO HOOK
   =================================================================== */

interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

function useUndoRedo<T>(initial: T, maxHistory: number = 50) {
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initial,
    future: [],
  });

  // Keep state in sync when a new external preset arrives
  useEffect(() => {
    setState(prev => ({
      past: [],
      present: initial,
      future: [],
    }));
  }, [initial]);

  const setPresent = useCallback(
    (next: T, recordHistory: boolean) => {
      setState(prev => {
        if (!recordHistory) {
          return { ...prev, present: next };
        }
        const past = [...prev.past, prev.present];
        const slicedPast =
          past.length > maxHistory ? past.slice(past.length - maxHistory) : past;
        return {
          past: slicedPast,
          present: next,
          future: [],
        };
      });
    },
    [maxHistory]
  );

  const undo = useCallback(() => {
    setState(prev => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, prev.past.length - 1);
      const newFuture = [prev.present, ...prev.future].slice(0, maxHistory);
      return {
        past: newPast,
        present: previous,
        future: newFuture,
      };
    });
  }, [maxHistory]);

  const redo = useCallback(() => {
    setState(prev => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      const newPast = [...prev.past, prev.present].slice(-maxHistory);
      return {
        past: newPast,
        present: next,
        future: newFuture,
      };
    });
  }, [maxHistory]);

  return {
    current: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    setPresent,
    undo,
    redo,
  };
}

/* ===================================================================
   SUB-COMPONENTS
   =================================================================== */

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-neutral-950 border border-neutral-700 text-neutral-200 text-[9px] px-2.5 py-1 rounded shadow-lg whitespace-nowrap z-50 pointer-events-none font-mono">
          {text}
        </div>
      )}
    </div>
  );
};

interface SliderProps {
  label: string;
  section: keyof ExtendedJunoParams;
  param: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  onCommit: (section: keyof ExtendedJunoParams, param: string, value: number) => void;
}

const Slider: React.FC<SliderProps> = ({
  label,
  section,
  param,
  value,
  min = 0,
  max = 100,
  step = 1,
  tooltip,
  onCommit,
}) => {
  const [localValue, setLocalValue] = useState<number>(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const clamped = Math.min(max, Math.max(min, localValue));
  const norm = (clamped - min) / (max - min || 1);
  const thumbBottom = norm * 85;
  const displayValue = Math.round(clamped);
  const displayTooltip = tooltip || `${label}: ${displayValue}`;

  const commit = useCallback(
    (val: number) => {
      const next = Math.min(max, Math.max(min, val));
      onCommit(section, param, next);
    },
    [section, param, min, max, onCommit]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      setLocalValue(raw);
    },
    []
  );

  const handleChangeEnd = useCallback(
    () => {
      commit(localValue);
    },
    [commit, localValue]
  );

  return (
    <Tooltip text={displayTooltip}>
      <div className="flex flex-col items-center gap-1.5">
        <div className="h-40 w-2.5 bg-black rounded-full relative group cursor-pointer border border-neutral-900 shadow-inner">
          <div
            className="absolute left-[-10px] w-7 h-5 bg-gradient-to-b from-neutral-300 to-neutral-400 rounded border border-neutral-100 shadow-[0_2px_6px_rgba(0,0,0,0.6)] group-hover:from-white group-hover:to-neutral-300 transition-colors pointer-events-none"
            style={{ bottom: `${thumbBottom}%` }}
          >
            <div className="w-full h-[1px] bg-neutral-600 absolute top-1/2 -translate-y-1/2" />
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={clamped}
            onChange={handleChange}
            onMouseUp={handleChangeEnd}
            onTouchEnd={handleChangeEnd}
            aria-label={label}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={displayValue}
            className="absolute inset-0 opacity-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' } as any}
          />
        </div>
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest leading-tight text-center">
          {label}
        </span>
        <span className="text-[9px] font-mono text-neutral-600">{displayValue}</span>
      </div>
    </Tooltip>
  );
};

interface ToggleProps {
  label: string;
  section: keyof ExtendedJunoParams;
  param: string;
  active: boolean;
  onToggle: (section: keyof ExtendedJunoParams, param: string, value: boolean) => void;
}

const ToggleButton: React.FC<ToggleProps> = ({ label, section, param, active, onToggle }) => {
  const handleToggle = useCallback(() => {
    onToggle(section, param, !active);
  }, [section, param, active, onToggle]);

  return (
    <Tooltip text={`${label}: ${active ? 'ON' : 'OFF'}`}>
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={active}
          className={`w-10 h-7 rounded border transition-all font-bold text-xs ${
            active
              ? 'bg-red-600 border-red-400 shadow-[0_0_12px_rgba(220,38,38,0.6)] text-white'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400 shadow-inner'
          }`}
        >
          <span className="block w-full h-full bg-gradient-to-b from-white/10 to-transparent rounded-sm pointer-events-none" />
        </button>
        <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
          {label}
        </span>
      </div>
    </Tooltip>
  );
};

const WaveformPreview: React.FC<{ dco: ExtendedJunoParams['dco'] }> = ({ dco }) => {
  const path = useMemo(() => {
    const points = 200;
    let yValues: number[] = new Array(points).fill(0);

    if (dco.waveSaw) {
      for (let i = 0; i < points; i++) {
        const phase = i / points;
        yValues[i] += (phase * 2 - 1) * 0.6;
      }
    }

    if (dco.wavePulse) {
      const duty = dco.pwm / 100;
      for (let i = 0; i < points; i++) {
        const phase = i / points;
        yValues[i] += (phase < duty ? 0.6 : -0.6);
      }
    }

    if (dco.waveSub && dco.sub > 0) {
      const subAmp = (dco.sub / 100) * 0.3;
      for (let i = 0; i < points; i++) {
        const phase = ((i / points) * 2) % 1;
        yValues[i] += (phase < 0.5 ? 1 : -1) * subAmp;
      }
    }

    if (dco.noise > 0) {
      const noiseAmp = (dco.noise / 100) * 0.3;
      for (let i = 0; i < points; i++) {
        const pseudo = (Math.sin(i * 12.9898 + 78.233) * 43758.5453) % 1;
        yValues[i] += (pseudo * 2 - 1) * noiseAmp;
      }
    }

    const maxVal = Math.max(...yValues.map(Math.abs), 0.2);
    const scale = 20 / maxVal;
    const svgPoints = yValues
      .map((y, i) => `${(i / points) * 100},${20 - y * scale}`)
      .join(' ');
    return `M ${svgPoints}`;
  }, [dco.waveSaw, dco.wavePulse, dco.waveSub, dco.pwm, dco.sub, dco.noise]);

  return (
    <svg viewBox="0 0 100 40" className="w-full h-8 drop-shadow" aria-hidden="true">
      <defs>
        <linearGradient id="waveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#ef4444', stopOpacity: 0.8 }} />
          <stop offset="100%" style={{ stopColor: '#dc2626', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path d={path} stroke="url(#waveGrad)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
};

const EnvelopeVisualizer: React.FC<{ env: ExtendedJunoParams['env'] }> = ({ env }) => {
  const path = useMemo(() => {
    const attackX = Math.min(env.a * 0.4, 20);
    const decayX = Math.min(env.d * 0.4, 20);
    const releaseX = Math.min(env.r * 0.4, 20);
    const sustainY = 40 - (env.s / 100) * 30;
    const topY = 10;
    const bottomY = 40;

    const dStartX = 10 + attackX;
    const sStartX = dStartX + decayX;
    const rStartX = sStartX + 20;

    return `M 10 ${bottomY} L ${dStartX} ${topY} L ${sStartX} ${sustainY} L ${rStartX} ${sustainY} L ${
      rStartX + releaseX
    } ${bottomY}`;
  }, [env.a, env.d, env.s, env.r]);

  return (
    <svg viewBox="0 0 100 40" className="w-full h-8 drop-shadow" aria-hidden="true">
      <defs>
        <linearGradient id="envGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#22d3ee', stopOpacity: 0.6 }} />
          <stop offset="100%" style={{ stopColor: '#06b6d4', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <path
        d={path}
        stroke="url(#envGrad)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children }) => (
  <div className="flex flex-col gap-4 p-4 pt-5 border-2 border-neutral-800 rounded relative">
    <div className="absolute -top-3 left-4 bg-[#0f0a0a] px-2 text-[11px] text-neutral-400 font-bold tracking-widest">
      {title}
    </div>
    {children}
  </div>
);

/* ===================================================================
   MAIN COMPONENT
   =================================================================== */

export const MasterJunoSynth: React.FC<MasterJunoSynthProps> = ({
  params: incomingParams = {},
  onParamChange,
  onPresetChange,
  onSavePreset,
}) => {
  const initialParams = useMemo(
    () => mergeParams(incomingParams),
    [incomingParams]
  );

  const { current, setPresent, undo, redo, canUndo, canRedo } = useUndoRedo<ExtendedJunoParams>(
    initialParams,
    80
  );

  const [patchName, setPatchName] = useState('A-14 HOOVER_PLUCK');
  const [showChordEditor, setShowChordEditor] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  // Sync current state to audio engine
  useEffect(() => {
    if (engine.juno) {
      engine.juno.setParams(current);
    }
  }, [current]);

  // Keyboard shortcuts – respect focused element
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTextInput =
        tag === 'input' ||
        tag === 'textarea' ||
        (target && target.getAttribute('contenteditable') === 'true');

      if (isTextInput) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) {
          undo();
          onPresetChange?.(current);
        }
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        if (canRedo) {
          redo();
          onPresetChange?.(current);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo, current, onPresetChange]);

  const playTestNote = useCallback(() => {
    if (!engine.juno) return;
    setIsPlayingTest(true);
    engine.juno.noteOn(60, 100);
    setTimeout(() => {
      engine.juno.noteOff(60);
      setIsPlayingTest(false);
    }, 800);
  }, []);

  const applyParams = useCallback(
    (next: ExtendedJunoParams, recordHistory: boolean) => {
      setPresent(next, recordHistory);
      onPresetChange?.(next);
    },
    [setPresent, onPresetChange]
  );

  const handleParamChange = useCallback(
    (section: keyof ExtendedJunoParams, param: string, value: any, recordHistory: boolean = true) => {
      const next: ExtendedJunoParams = {
        ...current,
        [section]: {
          ...(current[section] as any),
          [param]: value,
        },
      };
      applyParams(next, recordHistory);
      onParamChange?.(section as keyof JunoParams, param, value);
    },
    [current, applyParams, onParamChange]
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.syx')) {
        const buffer = await file.arrayBuffer();
        const parsed = parseJunoSysex(buffer, current);
        const newParams = mergeParams(parsed as Partial<ExtendedJunoParams>);
        applyParams(newParams, true);
        setPatchName(file.name.replace('.syx', '').toUpperCase());
        setImportError(null);
      } else {
        const reader = new FileReader();
        reader.onload = event => {
          try {
            const content = event.target?.result as string;
            const raw = JSON.parse(content) as SavedPreset | ExtendedJunoParams;
            const base = 'params' in raw ? raw.params : raw;
            const imported = mergeParams(base as Partial<ExtendedJunoParams>);
            applyParams(imported, true);
            setPatchName(
              ('name' in raw && raw.name ? raw.name : file.name.replace('.json', '')).toUpperCase()
            );
            setImportError(null);
          } catch {
            setImportError('Invalid JSON preset');
          }
        };
        reader.readAsText(file);
      }
    } catch {
      setImportError('Failed to import preset');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setShowExportImport(false);
    }
  };

  const randomizePatch = useCallback(() => {
    const rand = () => Math.floor(Math.random() * 101);
    const randomParams: ExtendedJunoParams = {
      ...current,
      dco: {
        ...current.dco,
        wavePulse: Math.random() > 0.4,
        waveSaw: true, // always keep at least one waveform
        waveSub: Math.random() > 0.7,
        pwm: rand(),
        sub: Math.random() > 0.6 ? rand() : 0,
        noise: Math.random() > 0.7 ? Math.floor(rand() * 0.5) : 0,
        detune: Math.random() > 0.7 ? Math.floor(rand() * 0.5) : 0,
        portamento: Math.random() > 0.6 ? Math.floor(rand() * 0.7) : 0,
      },
      lfo: { rate: Math.random() > 0.5 ? rand() : 0, delay: 0, fade: 0 },
      hpf: { freq: Math.random() > 0.8 ? Math.floor(rand() * 0.3) : 0 },
      vcf: {
        freq: 30 + Math.floor(rand() * 0.7),
        res: Math.random() > 0.4 ? Math.floor(rand() * 0.8) : 0,
        env: Math.random() > 0.5 ? rand() : 0,
        lfo: Math.random() > 0.7 ? Math.floor(rand() * 0.5) : 0,
        kbd: Math.random() > 0.6 ? Math.floor(rand() * 0.5) : 0,
        drive: Math.random() > 0.8 ? Math.floor(rand() * 0.3) : 0,
      },
      vca: {
        mode: Math.random() > 0.5 ? 'env' : 'gate',
        level: 70 + Math.floor(rand() * 0.3),
        velocity: 0,
      },
      env: {
        a: Math.floor(rand() * 0.5),
        d: Math.floor(rand() * 0.8),
        s: Math.floor(rand() * 0.7),
        r: Math.floor(rand() * 0.8),
      },
      chorus: {
        mode: Math.random() > 0.7 ? (['I', 'II'][Math.floor(Math.random() * 2)] as 'I' | 'II') : 'off',
        mix: Math.random() > 0.6 ? rand() : 0,
        depth: Math.random() > 0.6 ? rand() : 0,
      },
      chord: {
        enabled: current.chord.enabled,
        notes: [...current.chord.notes].sort((a, b) => a - b),
      },
      arpeggiator: {
        ...current.arpeggiator,
        enabled: Math.random() > 0.7,
        rate: rand(),
        gate: 60 + Math.floor(rand() * 0.4),
      },
      lfo2: {
        ...current.lfo2,
        rate: Math.random() > 0.5 ? rand() : 0,
        pitch: Math.random() > 0.6 ? Math.floor(rand() * 0.3) : 0,
        filter: Math.random() > 0.6 ? Math.floor(rand() * 0.4) : 0,
      },
      fx: {
        delayTime: Math.random() > 0.7 ? Math.floor(rand() * 0.6) : 0,
        delayFeedback: Math.random() > 0.7 ? Math.floor(rand() * 0.5) : 0,
        delayMix: Math.random() > 0.7 ? Math.floor(rand() * 0.4) : 0,
        delaySync: true,
        reverbSize: Math.random() > 0.6 ? Math.floor(rand() * 0.6) : 0,
        reverbMix: Math.random() > 0.6 ? Math.floor(rand() * 0.3) : 0,
      },
      master: { volume: 85 + Math.floor(rand() * 0.15), limiter: Math.random() > 0.9 },
    };
    applyParams(randomParams, true);
  }, [current, applyParams]);

  const exportPreset = useCallback(() => {
    const preset: SavedPreset = {
      name: patchName,
      timestamp: Date.now(),
      params: current,
    };
    downloadJSON(paramsToJSON(preset), `${patchName.replace(/\s+/g, '_')}_${Date.now()}.json`);
  }, [current, patchName]);

  const slider = useCallback(
    (
      section: keyof ExtendedJunoParams,
      param: string,
      min?: number,
      max?: number,
      step?: number,
      tooltip?: string
    ) => (
      <Slider
        key={`${section}.${param}`}
        label={param.toUpperCase()}
        section={section}
        param={param}
        value={(current[section] as any)?.[param] ?? 0}
        min={min}
        max={max}
        step={step}
        tooltip={tooltip}
        onCommit={(sec, p, v) => handleParamChange(sec, p, v, true)}
      />
    ),
    [current, handleParamChange]
  );

  const toggle = useCallback(
    (section: keyof ExtendedJunoParams, param: string, label: string) => (
      <ToggleButton
        key={`${section}.${param}`}
        label={label}
        section={section}
        param={param}
        active={(current[section] as any)?.[param] ?? false}
        onToggle={(sec, p, val) => handleParamChange(sec, p, val, true)}
      />
    ),
    [current, handleParamChange]
  );

  const handleModeToggle = useCallback(() => {
    const next = current.vca.mode === 'env' ? 'gate' : 'env';
    handleParamChange('vca', 'mode', next);
  }, [current.vca.mode, handleParamChange]);

  const handleChorusMode = useCallback(() => {
    const modes: Array<'off' | 'I' | 'II'> = ['off', 'I', 'II'];
    const currentIdx = modes.indexOf(current.chorus.mode);
    const next = modes[(currentIdx + 1) % modes.length];
    handleParamChange('chorus', 'mode', next);
  }, [current.chorus.mode, handleParamChange]);

  const handleChordToggle = useCallback(() => {
    const nextEnabled = !current.chord.enabled;
    handleParamChange('chord', 'enabled', nextEnabled);
    setShowChordEditor(nextEnabled);
  }, [current.chord.enabled, handleParamChange]);

  return (
    <div className="bg-[#1a1212] border border-red-900/30 p-6 rounded-xl shadow-2xl flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar">
      {/* HEADER */}
      <div className="flex justify-between items-center shrink-0 gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <h2 className="text-xl font-black tracking-widest text-red-500 uppercase flex items-center gap-3">
            <span className="bg-red-500 text-black px-2 py-0.5 rounded-sm shadow-[0_0_10px_rgba(239,68,68,0.3)] whitespace-nowrap">
              JUNO-106
            </span>
            MASTER SYNTH
          </h2>
          <span className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest truncate">
            DCO → HPF → VCF → VCA → CHORUS → FX
          </span>
        </div>

        <div className="flex gap-2 items-center shrink-0 flex-wrap justify-end">
          {/* Undo/Redo */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (!canUndo) return;
                undo();
                onPresetChange?.(current);
              }}
              disabled={!canUndo}
              className="px-2 py-1 text-xs font-bold bg-neutral-900 text-neutral-400 rounded border border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              type="button"
              onClick={() => {
                if (!canRedo) return;
                redo();
                onPresetChange?.(current);
              }}
              disabled={!canRedo}
              className="px-2 py-1 text-xs font-bold bg-neutral-900 text-neutral-400 rounded border border-neutral-700 hover:bg-neutral-800 hover:text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Redo (Ctrl+Shift+Z)"
            >
              ↪
            </button>
          </div>

          {/* Randomize */}
          <button
            type="button"
            onClick={randomizePatch}
            className="px-3 py-1.5 bg-purple-900/20 text-purple-400 text-xs font-bold rounded hover:bg-purple-900/40 border border-purple-900/50 transition-colors uppercase tracking-widest"
            title="Generate random patch"
          >
            🎲 RANDOM
          </button>

          {/* Audition */}
          <button
            type="button"
            onClick={playTestNote}
            className={`px-3 py-1.5 text-xs font-bold rounded border transition-all uppercase tracking-widest ${
              isPlayingTest
                ? 'bg-red-500 text-black border-red-300 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                : 'bg-neutral-900/50 text-red-400 hover:bg-red-950/20 border-red-900/40'
            }`}
            title="Play audition note"
          >
            {isPlayingTest ? '🛑 PLAYING' : '🔊 AUDITION'}
          </button>

          {/* Export/Import */}
          <button
            type="button"
            onClick={() => setShowExportImport(prev => !prev)}
            className="px-3 py-1.5 bg-neutral-900/50 text-neutral-400 text-xs font-bold rounded hover:bg-neutral-900 border border-neutral-700 transition-colors uppercase tracking-widest"
            title="Export/Import preset"
          >
            ⇅ TRANSFER
          </button>

          {/* Patch name */}
          <input
            type="text"
            value={patchName}
            onChange={e => setPatchName(e.target.value.slice(0, 32))}
            placeholder="PATCH NAME"
            className="text-xs font-mono text-red-400 bg-black px-3 py-1 border border-red-900/50 rounded shadow-inner w-32 text-right focus:outline-none focus:border-red-700"
          />
        </div>
      </div>

      {/* EXPORT / IMPORT PANEL */}
      {showExportImport && (
        <div className="p-4 bg-neutral-900/50 border border-neutral-800 rounded flex gap-3 items-center shrink-0">
          <button
            type="button"
            onClick={exportPreset}
            className="px-3 py-1.5 bg-green-900/30 text-green-400 text-xs font-bold rounded hover:bg-green-900/50 border border-green-900/50 transition-colors uppercase"
          >
            ↓ EXPORT
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-900/30 text-blue-400 text-xs font-bold rounded hover:bg-blue-900/50 border border-blue-900/50 transition-colors uppercase"
          >
            ↑ IMPORT
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.syx"
            onChange={handleFileUpload}
            className="hidden"
          />
          {importError && (
            <span className="text-[10px] text-red-400 font-mono">{importError}</span>
          )}
          <button
            type="button"
            onClick={() => setShowExportImport(false)}
            className="ml-auto px-2 py-1 text-xs text-neutral-500 hover:text-neutral-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* MAIN PANEL */}
      <div className="flex flex-wrap gap-x-8 gap-y-6 p-6 bg-[#0f0a0a] rounded-lg border border-red-900/20 shadow-inner flex-1 content-start overflow-y-auto">
        {/* LFO */}
        <Section title="LFO">
          <div className="flex gap-5 items-end">
            {slider('lfo', 'rate')}
            {slider('lfo', 'delay')}
            {slider('lfo', 'fade')}
          </div>
        </Section>

        {/* DCO */}
        <Section title="DCO">
          <div className="flex flex-col gap-3">
            <div className="flex gap-5 items-end flex-wrap">
              {toggle('dco', 'wavePulse', 'PULSE')}
              {toggle('dco', 'waveSaw', 'SAW')}
              {toggle('dco', 'waveSub', 'SUB')}
              {toggle('dco', 'sync', 'SYNC')}
              {toggle('dco', 'unison', 'UNI')}
            </div>
            <div className="flex gap-5 items-end flex-wrap">
              {slider('dco', 'pwm')}
              {slider('dco', 'sub')}
              {slider('dco', 'noise')}
              {slider('dco', 'detune')}
              {slider('dco', 'portamento')}
            </div>
            <WaveformPreview dco={current.dco} />
          </div>
        </Section>

        {/* HPF */}
        <Section title="HPF">
          {slider('hpf', 'freq')}
        </Section>

        {/* VCF */}
        <Section title="VCF">
          <div className="flex gap-5 flex-wrap">
            {slider('vcf', 'freq')}
            {slider('vcf', 'res')}
            {slider('vcf', 'env')}
            {slider('vcf', 'lfo')}
            {slider('vcf', 'kbd')}
            {slider('vcf', 'drive')}
          </div>
        </Section>

        {/* VCA */}
        <Section title="VCA">
          <div className="flex gap-5 items-end flex-wrap">
            <Tooltip text={`Mode: ${current.vca.mode.toUpperCase()}`}>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleModeToggle}
                  className="w-12 h-7 text-[10px] font-bold bg-neutral-800 rounded border border-neutral-700 text-neutral-300 shadow-inner hover:bg-neutral-700 transition-colors"
                >
                  {current.vca.mode.toUpperCase()}
                </button>
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest text-center">
                  MODE
                </span>
              </div>
            </Tooltip>
            {slider('vca', 'level')}
            {slider('vca', 'velocity')}
          </div>
        </Section>

        {/* ENV */}
        <Section title="ENV">
          <div className="flex flex-col gap-3">
            <div className="flex gap-5 flex-wrap">
              {slider('env', 'a', 0, 100, 1, 'Attack')}
              {slider('env', 'd', 0, 100, 1, 'Decay')}
              {slider('env', 's', 0, 100, 1, 'Sustain')}
              {slider('env', 'r', 0, 100, 1, 'Release')}
            </div>
            <EnvelopeVisualizer env={current.env} />
          </div>
        </Section>

        {/* MASTER: Chorus + Chord */}
        <Section title="MASTER">
          <div className="flex gap-6 items-start flex-wrap">
            <div className="flex flex-col items-center gap-3">
              <Tooltip text={`Chorus: ${current.chorus.mode}`}>
                <button
                  type="button"
                  onClick={handleChorusMode}
                  className={`w-14 h-10 text-xs font-bold rounded border shadow-lg transition-all ${
                    current.chorus.mode !== 'off'
                      ? 'bg-amber-500 text-black border-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-500 shadow-inner'
                  }`}
                >
                  {current.chorus.mode === 'off' ? 'OFF' : `CHO ${current.chorus.mode}`}
                </button>
              </Tooltip>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                CHORUS
              </span>
              <div className="flex gap-3 mt-1">
                {slider('chorus', 'mix')}
                {slider('chorus', 'depth')}
              </div>
            </div>

            <div className="w-px h-24 bg-neutral-800" />

            <div className="flex flex-col items-center gap-3 relative">
              <Tooltip text={`Chord Memory: ${current.chord.enabled ? 'ON' : 'OFF'}`}>
                <button
                  type="button"
                  onClick={handleChordToggle}
                  className={`w-20 h-10 text-xs font-bold rounded border shadow-lg transition-all ${
                    current.chord.enabled
                      ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-500 shadow-inner'
                  }`}
                >
                  CHORD
                </button>
              </Tooltip>
              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
                MEMORY
              </span>
              {showChordEditor && current.chord.enabled && (
                <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-56 bg-neutral-900 border border-cyan-800 rounded-lg p-3 shadow-2xl z-20 flex flex-col gap-2">
                  <div className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase flex justify-between items-center">
                    Chord Voicing
                    <button
                      type="button"
                      onClick={() => setShowChordEditor(false)}
                      className="text-neutral-500 hover:text-white text-lg leading-none"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[0, 3, 4, 7, 10, 11, 14, 15].map(interval => {
                      const isActive = current.chord.notes.includes(interval);
                      return (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => {
                            const notes = isActive
                              ? current.chord.notes.filter(n => n !== interval)
                              : [...current.chord.notes, interval].sort((a, b) => a - b);
                            handleParamChange('chord', 'notes', notes);
                          }}
                          className={`py-1.5 text-[10px] font-mono rounded border transition-colors ${
                            isActive
                              ? 'bg-cyan-600 border-cyan-400 text-white shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                              : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:border-neutral-600'
                          }`}
                        >
                          {MIDI_NOTES[interval % 12]}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-[9px] text-neutral-500 mt-1 leading-tight">
                    Select intervals to layer when a single key is pressed.
                  </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ARPEGGIATOR */}
        <Section title="ARPEGGIATOR">
          <div className="flex gap-5 items-end flex-wrap">
            {toggle('arpeggiator', 'enabled', 'ON')}
            <div className="flex flex-col gap-1">
              <select
                value={current.arpeggiator.mode}
                onChange={e =>
                  handleParamChange('arpeggiator', 'mode', e.target.value as any)
                }
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] rounded px-2 py-1 font-mono hover:border-neutral-600 focus:outline-none"
              >
                <option value="up">UP</option>
                <option value="down">DOWN</option>
                <option value="updown">UP/DOWN</option>
                <option value="random">RANDOM</option>
                <option value="order">ORDER</option>
              </select>
              <span className="text-[9px] text-neutral-500 uppercase text-center font-bold">
                MODE
              </span>
            </div>
            {slider('arpeggiator', 'rate')}
            {slider('arpeggiator', 'octaves', 1, 4, 1, 'Octaves')}
            {slider('arpeggiator', 'gate', 0, 100, 1, 'Gate %')}
            {toggle('arpeggiator', 'latch', 'LATCH')}
          </div>
        </Section>

        {/* LFO 2 */}
        <Section title="LFO 2">
          <div className="flex gap-5 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <select
                value={current.lfo2.waveform}
                onChange={e =>
                  handleParamChange('lfo2', 'waveform', e.target.value as any)
                }
                className="bg-neutral-800 border border-neutral-700 text-neutral-300 text-[10px] rounded px-2 py-1 font-mono hover:border-neutral-600 focus:outline-none"
              >
                <option value="sine">SINE</option>
                <option value="triangle">TRI</option>
                <option value="square">SQR</option>
                <option value="saw">SAW</option>
                <option value="reverseSaw">R SAW</option>
                <option value="random">RAND</option>
              </select>
              <span className="text-[9px] text-neutral-500 uppercase text-center font-bold">
                WAVE
              </span>
            </div>
            {slider('lfo2', 'rate')}
            {slider('lfo2', 'delay')}
            {slider('lfo2', 'fade')}
            {toggle('lfo2', 'retrigger', 'RETRIG')}
            <div className="w-px h-16 bg-neutral-800" />
            {slider('lfo2', 'pitch')}
            {slider('lfo2', 'filter')}
            {slider('lfo2', 'amp')}
          </div>
        </Section>

        {/* FX */}
        <Section title="FX">
          <div className="flex gap-6 flex-wrap">
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                DELAY
              </span>
              <div className="flex gap-3">
                {slider('fx', 'delayTime')}
                {slider('fx', 'delayFeedback')}
                {slider('fx', 'delayMix')}
                {toggle('fx', 'delaySync', 'SYNC')}
              </div>
            </div>
            <div className="w-px h-16 bg-neutral-800" />
            <div className="flex flex-col gap-2">
              <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">
                REVERB
              </span>
              <div className="flex gap-3">
                {slider('fx', 'reverbSize')}
                {slider('fx', 'reverbMix')}
              </div>
            </div>
          </div>
        </Section>

        {/* OUTPUT */}
        <Section title="OUTPUT">
          <div className="flex gap-5 items-end">
            {slider('master', 'volume', 0, 100, 1, 'Master Volume')}
            {toggle('master', 'limiter', 'LIMITER')}
          </div>
        </Section>
      </div>
    </div>
  );
};