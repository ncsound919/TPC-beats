import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChordGenerator,
  ProgressionParams,
  ChordDefinition,
  ScaleType
} from '../../audio/synths/ChordGenerator';
import { getAudioEngine } from '../../audio/AudioEngine';
import {
  Play,
  RefreshCw,
  Sparkles,
  Volume2,
  Layers,
  Sliders,
  Shuffle,
  Piano,
  HelpCircle,
  CheckCircle,
  Music,
  Info,
  Activity
} from 'lucide-react';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PAD_HOTKEYS = ['Z', 'X', 'C', 'V', 'A', 'S', 'D', 'F', 'Q', 'W', 'E', 'R', '1', '2', '3', '4'];
const PAD_INDEX_MAPPING = [12, 13, 14, 15, 8, 9, 10, 11, 4, 5, 6, 7, 0, 1, 2, 3];

const SCALES: ScaleType[] = ['major', 'minor', 'harmonic_minor', 'dorian', 'phrygian', 'lydian', 'mixolydian'];
const PROGRESSION_TYPES = ['pop', 'jazz', 'neosoul', 'dark', 'house', 'epic', 'custom'] as const;
type ProgressionType = (typeof PROGRESSION_TYPES)[number];

const LIVE_PREVIEW_DEBOUNCE_MS = 450;

interface ProgressionGeneratorProps {
  chordMode: boolean;
  onChordModeToggle: (enabled: boolean) => void;
  generatedChords: ChordDefinition[];
  onChordsUpdate: (chords: ChordDefinition[]) => void;
  generatorParams: ProgressionParams;
  onParamsUpdate: (params: ProgressionParams) => void;
}

export const ProgressionGenerator: React.FC<ProgressionGeneratorProps> = ({
  chordMode,
  onChordModeToggle,
  generatedChords,
  onChordsUpdate,
  generatorParams,
  onParamsUpdate
}) => {
  const engine = useMemo(() => getAudioEngine(), []);

  const [activePadIdx, setActivePadIdx] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLivePreview, setIsLivePreview] = useState(false);

  const activeTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Keep the latest chords/params in refs for the keydown/keyup listeners so
  // those effects don't need to resubscribe (and therefore tear down/rebuild
  // window listeners) every time a new progression is generated or a param
  // slider moves.
  const latestChords = useRef(generatedChords);
  const latestParams = useRef(generatorParams);
  useEffect(() => { latestChords.current = generatedChords; }, [generatedChords]);
  useEffect(() => { latestParams.current = generatorParams; }, [generatorParams]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const chords = ChordGenerator.generateProgression(generatorParams);
      onChordsUpdate(chords);
    } finally {
      setIsGenerating(false);
    }
  }, [generatorParams, onChordsUpdate]);

  const handleGenerateRef = useRef(handleGenerate);
  useEffect(() => { handleGenerateRef.current = handleGenerate; }, [handleGenerate]);

  // Debounced live preview
  useEffect(() => {
    if (!isLivePreview) return;
    const timer = setTimeout(() => {
      handleGenerateRef.current();
    }, LIVE_PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [generatorParams, isLivePreview]);

  const stopPad = useCallback((idx: number) => {
    const t = activeTimeouts.current[idx];
    if (t) {
      clearTimeout(t);
      delete activeTimeouts.current[idx];
    }
    const chord = latestChords.current[idx];
    if (chord) {
      ChordGenerator.stopChord(chord, latestParams.current, engine.juno, engine.dx7);
    }
  }, [engine]);

  const playChordIndex = useCallback(async (idx: number) => {
    if (!generatedChords[idx]) return;

    // Stop whatever else is ringing (including this same pad, for retrigger).
    setActivePadIdx(prev => {
      if (prev !== null && prev !== idx) stopPad(prev);
      return idx;
    });
    if (activeTimeouts.current[idx]) stopPad(idx);

    await engine.ensureRunning();

    ChordGenerator.playChord(generatedChords[idx], generatorParams, engine.juno, engine.dx7);

    const duration = (generatorParams.gateLengthPct / 100) * 800;
    activeTimeouts.current[idx] = setTimeout(() => {
      ChordGenerator.stopChord(generatedChords[idx], generatorParams, engine.juno, engine.dx7);
      delete activeTimeouts.current[idx];
      setActivePadIdx(prev => (prev === idx ? null : prev));
    }, duration);
  }, [generatedChords, generatorParams, engine, stopPad]);

  // Keyboard support. FIX: now only depends on `chordMode` + `playChordIndex`/
  // `stopPad` (both stable across regenerations via refs), so window
  // listeners aren't torn down and rebuilt on every param tweak.
  useEffect(() => {
    if (!chordMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      
      // Prevent mapping keys if the user is typing in form inputs/selects
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }

      const key = e.key.toUpperCase();
      const padIndex = PAD_HOTKEYS.indexOf(key);
      if (padIndex === -1) return;

      const chordIdx = PAD_INDEX_MAPPING[padIndex];
      if (chordIdx < latestChords.current.length) {
        e.preventDefault();
        playChordIndex(chordIdx);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toUpperCase();
      const padIndex = PAD_HOTKEYS.indexOf(key);
      if (padIndex === -1) return;
      const chordIdx = PAD_INDEX_MAPPING[padIndex];
      if (activeTimeouts.current[chordIdx]) {
        stopPad(chordIdx);
        setActivePadIdx(prev => (prev === chordIdx ? null : prev));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [chordMode, playChordIndex, stopPad]);

  // Clear any pads still ringing on unmount instead of letting stray
  // timeouts fire into a torn-down component.
  useEffect(() => {
    return () => {
      Object.keys(activeTimeouts.current).forEach(key => {
        clearTimeout(activeTimeouts.current[Number(key)]);
      });
      activeTimeouts.current = {};
    };
  }, []);

  const updateParam = useCallback(<K extends keyof ProgressionParams>(key: K, value: ProgressionParams[K]) => {
    onParamsUpdate({ ...generatorParams, [key]: value });
  }, [generatorParams, onParamsUpdate]);

  const midiToNoteName = useCallback((midi: number): string => {
    const note = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;
  }, []);

  const randomize = useCallback(() => {
    const newParams: ProgressionParams = {
      ...generatorParams,
      rootNote: NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)],
      scale: SCALES[Math.floor(Math.random() * SCALES.length)],
      progressionType: PROGRESSION_TYPES[Math.floor(Math.random() * PROGRESSION_TYPES.length)] as ProgressionParams['progressionType'],
    };
    onParamsUpdate(newParams);
    setIsGenerating(true);
    try {
      const chords = ChordGenerator.generateProgression(newParams);
      onChordsUpdate(chords);
    } finally {
      setIsGenerating(false);
    }
  }, [generatorParams, onParamsUpdate, onChordsUpdate]);

  const currentScale = generatorParams.scale;
  const currentProgressionType = generatorParams.progressionType as ProgressionType | undefined;

  const chordPreviewSummary = useMemo(() => {
    if (!generatedChords.length) return null;
    return generatedChords.map(c => c.name).join(' – ');
  }, [generatedChords]);

  return (
    <div className="bg-[#0c0d12] text-neutral-200 border border-cyan-950/40 rounded-xl p-6 shadow-2xl flex flex-col h-full overflow-hidden">
      
      {/* ============ HEADER ============ */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-cyan-950/30 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="bg-cyan-500 text-black text-[10px] font-black tracking-widest px-2.5 py-1 rounded shadow-[0_0_15px_rgba(6,182,212,0.4)]">PRO</span>
            <h2 className="text-2xl font-black tracking-wider text-white flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-cyan-400 animate-pulse" /> Chord Architect
            </h2>
          </div>
          <p className="text-sm text-neutral-500 mt-1">Real-time algorithmic progression engine</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={randomize}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-sm transition-colors"
            aria-label="Randomize progression parameters"
          >
            <Shuffle className="w-4 h-4" /> Randomize
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-700 text-black font-black tracking-widest rounded-lg transition-all shadow-lg shadow-cyan-500/30 uppercase"
            aria-busy={isGenerating}
          >
            {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            GENERATE
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-hidden pt-6">
        
        {/* ============ LEFT COLUMN: PARAMETERS PANEL ============ */}
        <div className="lg:col-span-5 flex flex-col gap-5 overflow-y-auto custom-scrollbar max-h-[640px] pr-2 bg-[#10121a]/80 border border-neutral-900/60 p-5 rounded-xl">
          
          {/* Key & Scale */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> KEY & SCALE
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="root-note-select" className="block text-[11px] text-neutral-500 mb-1">Root Note</label>
                <select
                  id="root-note-select"
                  value={generatorParams.rootNote}
                  onChange={(e) => updateParam('rootNote', e.target.value as ProgressionParams['rootNote'])}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {NOTE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="scale-select" className="block text-[11px] text-neutral-500 mb-1">Scale</label>
                <select
                  id="scale-select"
                  value={currentScale}
                  onChange={(e) => updateParam('scale', e.target.value as ScaleType)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  {SCALES.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1).replace('_', ' ')}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Progression Type */}
          <div className="space-y-3">
            <div className="text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" /> PROGRESSION STYLE
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PROGRESSION_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => updateParam('progressionType', type as any)}
                  aria-pressed={currentProgressionType === type}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all
                    ${currentProgressionType === type
                      ? 'bg-cyan-600 border-cyan-400 text-black shadow-[0_0_8px_rgba(6,182,212,0.25)]'
                      : 'bg-neutral-950 border-neutral-800 hover:border-cyan-900 text-neutral-300'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Extensions complexity */}
          <div className="space-y-1.5">
            <label htmlFor="extension-select" className="block text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
              <Music className="w-4 h-4 text-cyan-400" /> EXTENSIONS COMPLEXITY
            </label>
            <select
              id="extension-select"
              value={generatorParams.chordExtension}
              onChange={(e) => updateParam('chordExtension', e.target.value as any)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="triad">Triads (Simple)</option>
              <option value="5th">5th Chords (Power)</option>
              <option value="7th">7th Chords (Classic)</option>
              <option value="9th">9th Chords (Lush / Jazz)</option>
              <option value="11th">11th Chords (Deep / R&B)</option>
              <option value="add9">Add 9 (Smooth Color)</option>
              <option value="diminished">Diminished Chords (Tension)</option>
              <option value="sus4">sus4 Chords (Suspended)</option>
              <option value="random">Random Extended</option>
            </select>
          </div>

          {/* Rhythm Feel */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label htmlFor="rhythm-select" className="text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" /> RHYTHM FEEL
              </label>
              <select
                id="rhythm-select"
                value={generatorParams.rhythmStyle}
                onChange={(e) => updateParam('rhythmStyle', e.target.value as any)}
                className="bg-neutral-950 border border-neutral-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              >
                <option value="straight">Straight Chords</option>
                <option value="syncopated">Syncopated Anticipation</option>
                <option value="strummed">Strummed (Acoustic)</option>
                <option value="laidback">Laid-Back (Late Strike)</option>
              </select>
            </div>

            {/* Strum Delay Slider */}
            {generatorParams.rhythmStyle === 'strummed' && (
              <div className="flex flex-col gap-1 pl-3 border-l-2 border-cyan-500">
                <div className="flex justify-between text-[10px] font-mono text-neutral-500">
                  <span>STRUM SPEED DELAY</span>
                  <span className="text-cyan-400 font-bold">{generatorParams.strumDelayMs}ms</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={150}
                  value={generatorParams.strumDelayMs}
                  onChange={(e) => updateParam('strumDelayMs', Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1.5 rounded bg-neutral-900"
                />
              </div>
            )}
          </div>

          {/* Gate length */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold tracking-widest text-neutral-400 flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" /> GATE LENGTH
              </span>
              <span className="font-mono text-cyan-400">{generatorParams.gateLengthPct}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={150}
              value={generatorParams.gateLengthPct}
              onChange={(e) => updateParam('gateLengthPct', Number(e.target.value))}
              className="w-full accent-cyan-500"
              aria-label="Gate length percent"
            />
            <p className="text-[11px] text-neutral-600">Sustain of chords relative to sequencer beats.</p>
          </div>

          {/* Automatic Arrangement Parts */}
          <div className="space-y-3 border-t border-neutral-800/80 pt-4">
            <div className="text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" /> AUTOMATIC ARRANGEMENT PARTS
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="bass-style-select" className="block text-[11px] text-neutral-500 mb-1">Bass Style</label>
                <select
                  id="bass-style-select"
                  value={generatorParams.bassStyle}
                  onChange={(e) => updateParam('bassStyle', e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="root">Root Note Strike</option>
                  <option value="octaves">Octave Alternate Jumps</option>
                  <option value="syncopated">Syncopated Groove</option>
                  <option value="walking">Walking Scale Line</option>
                  <option value="off">Off (Chords Only)</option>
                </select>
              </div>
              <div>
                <label htmlFor="lead-style-select" className="block text-[11px] text-neutral-500 mb-1">Lead Style</label>
                <select
                  id="lead-style-select"
                  value={generatorParams.leadStyle}
                  onChange={(e) => updateParam('leadStyle', e.target.value as any)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                >
                  <option value="chord-tones">Chord Tones High</option>
                  <option value="arpeggio-up">Arpeggio Up (1/16th)</option>
                  <option value="arpeggio-down">Arpeggio Down (1/16th)</option>
                  <option value="motif">Short Motif</option>
                  <option value="off">Off (Chords Only)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Swappable Synth Outputs */}
          <div className="space-y-3 border-t border-neutral-800/80 pt-4">
            <div className="text-xs font-bold tracking-widest text-neutral-400 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-cyan-400" /> SWAPPABLE SYNTHS OUTPUTS
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1 text-center">
                <span className="text-[8px] font-mono text-neutral-500 font-bold uppercase">Bass Out</span>
                <select
                  value={generatorParams.bassSynth}
                  onChange={(e) => updateParam('bassSynth', e.target.value as any)}
                  className="bg-neutral-950 border border-neutral-800 text-[10px] rounded px-1.5 py-1 text-center font-bold text-cyan-400"
                >
                  <option value="juno">Juno-106</option>
                  <option value="dx7">FM DX7</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 text-center">
                <span className="text-[8px] font-mono text-neutral-500 font-bold uppercase">Chord Out</span>
                <select
                  value={generatorParams.rhythmSynth}
                  onChange={(e) => updateParam('rhythmSynth', e.target.value as any)}
                  className="bg-neutral-950 border border-neutral-800 text-[10px] rounded px-1.5 py-1 text-center font-bold text-cyan-400"
                >
                  <option value="juno">Juno-106</option>
                  <option value="dx7">FM DX7</option>
                </select>
              </div>

              <div className="flex flex-col gap-1 text-center">
                <span className="text-[8px] font-mono text-neutral-500 font-bold uppercase">Lead Out</span>
                <select
                  value={generatorParams.leadSynth}
                  onChange={(e) => updateParam('leadSynth', e.target.value as any)}
                  className="bg-neutral-950 border border-neutral-800 text-[10px] rounded px-1.5 py-1 text-center font-bold text-cyan-400"
                >
                  <option value="juno">Juno-106</option>
                  <option value="dx7">FM DX7</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="border-t border-neutral-800/80 pt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isLivePreview}
                onChange={(e) => setIsLivePreview(e.target.checked)}
                className="accent-cyan-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-neutral-400 font-bold text-xs uppercase tracking-wide">Live Preview (Auto-generate)</span>
            </label>
          </div>

          {chordPreviewSummary && (
            <div className="text-[10px] font-mono text-neutral-600 bg-neutral-950/60 border border-neutral-900 rounded-lg p-3 break-words">
              {chordPreviewSummary}
            </div>
          )}
        </div>

        {/* ============ RIGHT COLUMN: PADS GRID ============ */}
        <div className="lg:col-span-7 flex flex-col h-full">
          <div className="flex justify-between items-center mb-4">
            <div className="text-sm font-bold tracking-widest flex items-center gap-2">
              <Piano className="w-5 h-5 text-cyan-400" /> PROGRESSION PADS
            </div>
            
            {/* Chord Mode Toggle Button */}
            <button
              onClick={() => onChordModeToggle(!chordMode)}
              className={`px-4 py-1.5 text-xs font-black tracking-widest rounded border shadow transition-all ${
                chordMode 
                  ? 'bg-cyan-500 text-black border-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.35)]' 
                  : 'bg-neutral-900 text-neutral-500 border-neutral-800 hover:text-neutral-300'
              }`}
            >
              {chordMode ? 'CHORD MODE: ACTIVE' : 'CHORD MODE: MUTED'}
            </button>
          </div>

          <div className="grid grid-cols-4 gap-3 bg-[#0a0b10] p-5 rounded-2xl border border-cyan-950/30 flex-1">
            {PAD_INDEX_MAPPING.map((visualIdx, gridPos) => {
              const chordIdx = visualIdx;
              const chord = generatedChords[chordIdx];
              const isActive = activePadIdx === chordIdx;
              const hotkey = PAD_HOTKEYS[gridPos];

              if (!chord) return <div key={gridPos} className="h-28 bg-neutral-950/40 rounded-xl border border-neutral-900/50" />;

              return (
                <button
                  key={chordIdx}
                  type="button"
                  onPointerDown={() => playChordIndex(chordIdx)}
                  aria-pressed={isActive}
                  aria-label={`Play chord ${chord.name}, hotkey ${hotkey}`}
                  className={`group relative h-28 p-4 rounded-xl border transition-all duration-200 flex flex-col justify-between overflow-hidden text-left
                    ${isActive
                      ? 'bg-gradient-to-br from-cyan-500 to-cyan-600 border-cyan-300 shadow-2xl shadow-cyan-500/50 scale-[1.02]'
                      : 'bg-neutral-950 border-neutral-800 hover:border-cyan-900 hover:bg-neutral-900'
                    }`}
                >
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className={isActive ? 'text-black/70' : 'text-neutral-500'}>
                      PAD {String(chordIdx + 1).padStart(2, '0')}
                    </span>
                    <span className={isActive ? 'text-black' : 'text-cyan-400'}>[{hotkey}]</span>
                  </div>

                  <div className="my-1">
                    <div className={`font-black text-lg tracking-tight truncate ${isActive ? 'text-black' : 'text-white'}`}>
                      {chord.name}
                    </div>
                    <div className={`text-[9px] font-mono mt-1 leading-tight truncate ${isActive ? 'text-black/70' : 'text-neutral-400'}`}>
                      Bass: {chord.bassNotes.map(midiToNoteName).join(', ')}
                    </div>
                  </div>

                  <div className="w-full flex justify-between items-center text-[8px] font-mono mt-0.5">
                    <span className={`truncate w-[85%] ${isActive ? 'text-black/70' : 'text-neutral-500'}`}>
                      Chords: {chord.notes.map(midiToNoteName).join(', ')}
                    </span>
                    {isActive && <CheckCircle className="absolute bottom-3 right-3 w-4 h-4 text-black" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Tips */}
          <div className="mt-4 text-xs text-neutral-400 bg-neutral-950/70 border border-neutral-800 rounded-lg p-4 leading-relaxed">
            <HelpCircle className="inline w-4 h-4 mr-1.5 text-cyan-400" />
            <span className="font-semibold">Workflow Guide:</span> Hold keyboard keys <kbd className="bg-neutral-800 px-1 rounded text-[10px]">Z</kbd> - <kbd className="bg-neutral-800 px-1 rounded text-[10px]">4</kbd> for sustained chords • Enable Chord Mode to play from keyboard • Record into sequencer for full multi-part arrangements instantly!
          </div>
        </div>
      </div>
    </div>
  );
};
