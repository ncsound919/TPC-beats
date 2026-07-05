import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { DrumLibrary } from './components/MPC/DrumLibrary';
import { PadGrid } from './components/MPC/PadGrid';
import { WaveformDisplay } from './components/MPC/WaveformDisplay';
import { Transport } from './components/MPC/Transport';
import { SequencerGrid } from './components/MPC/SequencerGrid';
import { MasterJunoSynth as JunoSynth } from './components/Synth/JunoSynth';
import { MasterRompler808 as Rompler808 } from './components/Rompler/Rompler808';
import { MasterMixer } from './components/Mixer/MasterMixer';
import { DX7Synth } from './components/Synth/DX7Synth';
import { ProgressionGenerator } from './components/Synth/ProgressionGenerator';
import { MasterMixerSettings, Slice, Sequence, JunoParams, ExtendedRomplerParams } from './types';
import { engine } from './audio/AudioEngine';
import { programEngine } from './audio/ProgramEngine';
import { sequencer } from './audio/SequencerEngine';
import { ChopAgent } from './audio/agents/ChopAgent';
import { ChordGenerator, ChordDefinition, ProgressionParams } from './audio/synths/ChordGenerator';
import { DEFAULT_EXTENDED_ROMPLER_PARAMS } from './audio/synths/Rompler808Engine';
import { loadProject } from './persistence/LocalProjectStore';
import { useToast } from './hooks/useToast';
import { useHistory } from './hooks/useHistory';
import { useDragDrop } from './hooks/useDragDrop';
import { useKeyboard } from './hooks/useKeyboard';
import { useAutosave } from './hooks/useAutosave';
import { useSampleLoader } from './hooks/useSampleLoader';

type ViewMode = 'sampler' | 'pads_seq' | 'synth' | 'dx7' | '808' | 'mixer' | 'progression';

interface MixerChannel {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

const defaultMixerChannel = (): MixerChannel => ({ volume: 85, pan: 0, mute: false, solo: false });

const PAD_TO_808_NOTE: Record<number, number> = {
  12: 24, 13: 26, 14: 28, 15: 31,
};

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('sampler');
  const [isLoaded, setIsLoaded] = useState(false);
  const [activePad, setActivePad] = useState<number | null>(null);
  const [forceRender, setForceRender] = useState(0);
  const [current808Sample, setCurrent808Sample] = useState<string>('NONE');
  const [rompler808AssignedPads, setRompler808AssignedPads] = useState<number[]>([12, 13, 14, 15]);

  const [chordMode, setChordMode] = useState(false);
  const [generatedChords, setGeneratedChords] = useState<ChordDefinition[]>([]);
  const [generatorParams, setGeneratorParams] = useState<ProgressionParams>({
    rootNote: 'C', scale: 'minor', progressionType: 'dark', rhythmStyle: 'syncopated',
    chordExtension: '9th', octaveOffset: 0, humanizeVelocity: true, strumDelayMs: 40,
    gateLengthPct: 80, bassStyle: 'syncopated', leadStyle: 'motif', bassSynth: 'juno',
    rhythmSynth: 'juno', leadSynth: 'dx7',
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [swing, setSwing] = useState(54);
  const [playhead, setPlayhead] = useState(0);

  const [sequence, setSequence] = useState<Sequence>({
    id: 'seq-1', name: 'Beat 1', bpm: 92, ppqn: 96, lengthBars: 1,
    events: [
      { timestampPPQN: 0, padId: 0, velocity: 100, duration: 24 },
      { timestampPPQN: 96, padId: 0, velocity: 100, duration: 24 },
      { timestampPPQN: 192, padId: 0, velocity: 100, duration: 24 },
      { timestampPPQN: 288, padId: 0, velocity: 100, duration: 24 },
      { timestampPPQN: 48, padId: 2, velocity: 80, duration: 24 },
      { timestampPPQN: 240, padId: 2, velocity: 100, duration: 24 },
    ],
  });

  const [junoParams, setJunoParams] = useState<JunoParams>({
    dco: { lfo: 20, pwm: 50, sub: 80, noise: 0, wavePulse: true, waveSaw: true },
    hpf: { freq: 0 },
    vcf: { freq: 70, res: 40, env: 60, lfo: 0, kbd: 50 },
    vca: { level: 80, mode: 'env' },
    env: { a: 10, d: 40, s: 60, r: 30 },
    chorus: { mode: 'I' },
    chord: { enabled: false, notes: [4, 7] },
  });

  const [rompler808Params, setRompler808Params] = useState<ExtendedRomplerParams>(DEFAULT_EXTENDED_ROMPLER_PARAMS);

  const [mixer, setMixer] = useState<Record<number, MixerChannel>>(() => {
    const initial: Record<number, MixerChannel> = {};
    for (let i = 0; i < 16; i++) initial[i] = defaultMixerChannel();
    return initial;
  });

  const [masterMixer, setMasterMixer] = useState<MasterMixerSettings>({
    channels: {
      mpc: { volume: 1.0, pan: 0, mute: false, solo: false },
      synth: { volume: 1.0, pan: 0, mute: false, solo: false },
      rompler: { volume: 1.0, pan: 0, mute: false, solo: false },
    },
    master: {
      volume: 0.8,
      plugins: [
        { id: 'p1', type: 'compressor', enabled: true, params: { threshold: -20, ratio: 4, attack: 10, release: 100, makeup: 0 } },
        { id: 'p2', type: 'eq', enabled: false, params: { low: 0, mid: 0, high: 0, lowFreq: 100, highFreq: 8000 } },
        { id: 'p3', type: 'limiter', enabled: true, params: { threshold: -0.1, release: 50 } },
        { id: 'p4', type: 'reverb', enabled: false, params: { roomSize: 0.5, damping: 0.5, wetDry: 0.1 } },
      ],
      moogFilter: { cutoff: 20000, resonance: 0 },
    },
  });

  const { toasts, pushToast } = useToast();
  const { pushHistory, undo, redo } = useHistory(sequence);

  const saveProjectFile = useCallback(() => {
    const blob = new Blob([JSON.stringify({ program: programEngine.program, sequence }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.json';
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Project saved', 'success');
  }, [sequence, pushToast]);

  const { handleFileUpload, handle808SampleUpload, handlePadDrop } = useSampleLoader(
    pushHistory, pushToast, () => setForceRender(p => p + 1)
  );

  useAutosave({ sequence, program: programEngine.program, junoParams, rompler808Params, mixer }, pushToast);
  useDragDrop(handleFileUpload);

  const handleUndo = useCallback(() => undo(setSequence, pushToast), [undo, pushToast]);
  const handleRedo = useCallback(() => redo(setSequence, pushToast), [redo, pushToast]);

  useKeyboard({
    togglePlay: () => { if (!isPlaying) setIsPlaying(true); else setIsPlaying(false); },
    undo: handleUndo, redo: handleRedo,
    save: saveProjectFile,
    mixer,
  });

  useEffect(() => {
    engine.setMasterMixer(masterMixer);
  }, [masterMixer]);

  useEffect(() => {
    const initial = ChordGenerator.generateProgression(generatorParams);
    setGeneratedChords(initial);
  }, []);

  const activeChordTimeouts = useRef<Record<number, number>>({});
  useEffect(() => {
    programEngine.onTriggerPad = (padId, velocity, time) => {
      if (chordMode) {
        const chord = generatedChords[padId];
        if (!chord) return false;
        if (activeChordTimeouts.current[padId]) window.clearTimeout(activeChordTimeouts.current[padId]);
        setActivePad(padId);
        window.setTimeout(() => setActivePad(current => (current === padId ? null : current)), 150);
        ChordGenerator.playChord(chord, generatorParams, engine.juno, engine.dx7);
        const duration = (generatorParams.gateLengthPct / 100) * 800;
        activeChordTimeouts.current[padId] = window.setTimeout(() => {
          ChordGenerator.stopChord(chord, generatorParams, engine.juno, engine.dx7);
        }, duration);
        return true;
      }
      if (rompler808AssignedPads.includes(padId)) {
        engine.rompler808.triggerNote(PAD_TO_808_NOTE[padId] ?? 36, velocity, time);
        return true;
      }
      return false;
    };
    return () => { programEngine.onTriggerPad = null; };
  }, [chordMode, generatedChords, generatorParams, rompler808AssignedPads]);

  useEffect(() => {
    sequencer.onPadTrigger = (padId: number, velocity: number) => {
      setActivePad(padId);
      const channel = mixer[padId];
      const effectiveVelocity = channel?.mute ? 0 : Math.round(velocity * ((channel?.volume ?? 100) / 100));
      programEngine.triggerPad(padId, effectiveVelocity);
      window.setTimeout(() => setActivePad(current => (current === padId ? null : current)), 120);
    };
    sequencer.loadSequence(sequence);
  }, [sequence, mixer]);

  const togglePlay = useCallback(async () => {
    if (engine.ctx.state === 'suspended') await engine.ctx.resume();
    if (!isPlaying) {
      (sequencer as any).play?.();
      setIsPlaying(true);
    } else {
      (sequencer as any).stop?.();
      setIsPlaying(false);
    }
  }, [isPlaying]);

  const toggleRecord = useCallback(() => {
    setIsRecording(prev => !prev);
    (sequencer as any).setRecording?.(!isRecording);
  }, [isRecording]);

  const updateBpm = (bpm: number) => {
    pushHistory();
    const clamped = Math.min(300, Math.max(20, bpm));
    setSequence(prev => ({ ...prev, bpm: clamped }));
    (sequencer as any).setTempo?.(clamped);
  };

  const updateSwingValue = (value: number) => {
    setSwing(value);
    (sequencer as any).setSwing?.(value / 100);
  };

  const [playbackTick, setPlaybackTick] = useState(0);
  useEffect(() => {
    let animId: number;
    const pollTick = () => {
      const s = sequencer as any;
      if (s.currentTick !== undefined) setPlaybackTick(s.currentTick);
      animId = requestAnimationFrame(pollTick);
    };
    pollTick();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleToggleStep = useCallback((padId: number, stepIdx: number, hasEvent: boolean) => {
    pushHistory();
    setSequence(prev => {
      const ticksPerStep = (prev.lengthBars * 4 * prev.ppqn) / 16;
      const stepTick = stepIdx * ticksPerStep;
      const newEvents = prev.events.filter(e => {
        if (e.padId !== padId) return true;
        return Math.floor(e.timestampPPQN / ticksPerStep) !== stepIdx;
      });
      if (!hasEvent) {
        newEvents.push({
          id: `ev_${Date.now()}_${padId}_${stepIdx}`,
          timestampPPQN: stepTick, padId, velocity: 100, durationPPQN: 24,
        });
      }
      return { ...prev, events: newEvents };
    });
  }, [pushHistory]);

  const swingValues = useMemo(() => {
    const vals: Record<number, number> = {};
    for (let i = 0; i < 16; i++) vals[i] = programEngine.getPad(i)?.swing ?? 50;
    return vals;
  }, [forceRender]);

  const handleLiveChop = (time: number) => {
    const sample = programEngine.getSample();
    if (!sample?.rawBuffer) return;
    pushHistory();
    const newSlices = [...sample.slices];
    const nextSliceIdx = newSlices.findIndex(s => s.start > time);
    const newSlice: Slice = {
      id: `live_slice_${Date.now()}`, start: time, end: sample.rawBuffer.duration,
      attack: 0.01, decay: 0, pitch: 0, gain: 1.0, padAssignment: null,
    };
    if (nextSliceIdx === -1) {
      if (newSlices.length > 0) {
        newSlices[newSlices.length - 1].end = time;
        newSlices[newSlices.length - 1].decay = time - newSlices[newSlices.length - 1].start;
      }
      newSlices.push(newSlice);
    } else {
      if (nextSliceIdx > 0) {
        newSlices[nextSliceIdx - 1].end = time;
        newSlices[nextSliceIdx - 1].decay = time - newSlices[nextSliceIdx - 1].start;
      }
      newSlice.end = newSlices[nextSliceIdx].start;
      newSlice.decay = newSlice.end - newSlice.start;
      newSlices.splice(nextSliceIdx, 0, newSlice);
    }
    programEngine.setSample({ ...sample, slices: newSlices });
    setForceRender(p => p + 1);
  };

  const handleSliceUpdate = (slices: Slice[]) => {
    const sample = programEngine.getSample();
    if (!sample) return;
    pushHistory();
    programEngine.setSample({ ...sample, slices });
    setForceRender(p => p + 1);
  };

  const handleChopTransients = () => {
    const sample = programEngine.getSample();
    if (!sample?.rawBuffer) return;
    pushHistory();
    const slices = ChopAgent.detectTransients(sample.rawBuffer, { threshold: 0.05, minSliceLength: 0.1 });
    programEngine.setSample({ ...sample, slices });
    setForceRender(p => p + 1);
    pushToast(`Detected ${slices.length} transients`, 'success');
  };

  const handleAssignAll = () => {
    const sample = programEngine.getSample();
    if (!sample) return;
    pushHistory();
    const assignedSlices = ChopAgent.assignSlicesToPads(sample.slices);
    programEngine.setSample({ ...sample, slices: assignedSlices });
    assignedSlices.forEach(slice => {
      if (slice.padAssignment !== null) programEngine.assignSliceToPad(slice.padAssignment, slice.id);
    });
    setForceRender(p => p + 1);
    pushToast('Slices auto-assigned to pads', 'success');
  };

  const updateMixerChannel = (padId: number, patch: Partial<MixerChannel>) => {
    setMixer(prev => ({ ...prev, [padId]: { ...prev[padId], ...patch } }));
  };

  const anySolo = Object.values(mixer).some(c => c.solo);

  const restoreAutosave = () => {
    const result = loadProject();
    if (!result.success || !result.data) {
      pushToast(result.error ?? 'No autosave found', result.error ? 'error' : 'info');
      return;
    }
    const data = result.data;
    pushHistory();
    setSequence(data.sequence);
    programEngine.program = data.program;
    setJunoParams(data.junoParams);
    setRompler808Params(data.rompler808Params);
    setMixer(data.mixer);
    setForceRender(p => p + 1);
    pushToast('Restored last autosave', 'success');
  };

  useEffect(() => {
    engine.rompler808.setParams(rompler808Params);
  }, [rompler808Params]);

  const loadProjectFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      pushHistory();
      if (data.sequence) setSequence(data.sequence);
      if (data.program) programEngine.program = data.program;
      setForceRender(p => p + 1);
      pushToast(`Loaded project "${file.name}"`, 'success');
    } catch {
      pushToast('That file is not a valid project.json', 'error');
    }
  };

  const projectFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="h-screen bg-[#080808] text-neutral-300 flex flex-col font-sans overflow-hidden p-4 md:p-6 select-none relative">
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end">
        {toasts.map(t => (
          <div key={t.id} className={`px-4 py-2 rounded shadow-xl border text-xs font-mono tracking-wide animate-in fade-in slide-in-from-top-2 ${t.tone === 'success' ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : t.tone === 'error' ? 'bg-red-950 border-red-800 text-red-300' : 'bg-neutral-900 border-neutral-700 text-neutral-300'}`}>
            {t.message}
          </div>
        ))}
      </div>

      <input ref={projectFileInputRef} type="file" accept="application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadProjectFile(f); e.target.value = ''; }}
      />

      <header className="flex flex-col gap-4 bg-[#121212] border border-neutral-800 rounded-lg px-6 py-3 mb-6 shadow-2xl shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-8 items-center">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Project</span>
              <span className="text-sm font-mono text-cyan-400">HYBRID_AGENT_01</span>
            </div>
            <div className="h-8 w-[1px] bg-neutral-800" />
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Tempo</span>
              <div className="flex items-center gap-1">
                <button onClick={() => updateBpm(sequence.bpm - 1)} className="text-neutral-600 hover:text-cyan-400 text-xs px-1">▼</button>
                <input type="number" value={sequence.bpm} onChange={(e) => updateBpm(Number(e.target.value) || sequence.bpm)}
                  className="w-16 bg-transparent text-xl font-mono text-white outline-none focus:text-cyan-400" />
                <button onClick={() => updateBpm(sequence.bpm + 1)} className="text-neutral-600 hover:text-cyan-400 text-xs px-1">▲</button>
                <small className="text-[10px] text-neutral-600">BPM</small>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Global Swing</span>
              <input type="range" min={0} max={75} value={swing} onChange={(e) => updateSwingValue(Number(e.target.value))} className="w-24 accent-cyan-500" />
              <span className="text-[10px] font-mono text-neutral-400">{swing}%</span>
            </div>
            <button onClick={() => setMetronomeOn(m => !m)}
              className={`flex flex-col items-center px-2 py-1 rounded border ${metronomeOn ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400' : 'border-neutral-800 text-neutral-600'}`}>
              <span className="text-[10px] uppercase tracking-widest font-bold">Click</span>
              <span className="text-[10px] font-mono">{metronomeOn ? 'ON' : 'OFF'}</span>
            </button>
          </div>
          <div className="bg-black px-4 py-2 rounded border border-neutral-800 flex items-center gap-4 shadow-inner hidden md:flex">
            <button onClick={toggleRecord} className={`flex items-center gap-2 ${isRecording ? 'text-red-500' : 'text-red-800'}`}>
              <div className={`w-2 h-2 rounded-full bg-red-600 ${isRecording ? 'shadow-[0_0_8px_rgba(220,38,38,0.8)] animate-pulse' : 'opacity-40'}`} />
              <span className="text-xs font-mono font-bold tracking-tighter">{isRecording ? 'RECORDING' : 'REC READY'}</span>
            </button>
            <span className="text-2xl font-mono text-neutral-400">
              {String(Math.floor(playhead / (sequence.ppqn * 4)) + 1).padStart(3, '0')}.
              {String(Math.floor((playhead % (sequence.ppqn * 4)) / sequence.ppqn) + 1).padStart(2, '0')}.
              {String(playhead % sequence.ppqn).padStart(3, '0')}
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={handleUndo} className="px-3 py-1 bg-neutral-800 rounded text-[10px] font-bold hover:bg-neutral-700 uppercase tracking-widest">Undo</button>
            <button onClick={handleRedo} className="px-3 py-1 bg-neutral-800 rounded text-[10px] font-bold hover:bg-neutral-700 uppercase tracking-widest">Redo</button>
            <button onClick={() => projectFileInputRef.current?.click()} className="px-3 py-1 bg-neutral-800 rounded text-[10px] font-bold hover:bg-neutral-700 uppercase tracking-widest">Load</button>
            <button onClick={restoreAutosave} className="px-3 py-1 bg-neutral-800 rounded text-[10px] font-bold hover:bg-neutral-700 uppercase tracking-widest">Restore</button>
            <button onClick={saveProjectFile} className="px-3 py-1 bg-neutral-800 rounded text-[10px] font-bold hover:bg-neutral-700 uppercase tracking-widest">Save</button>
            <button onClick={togglePlay} className={`px-4 py-1 rounded text-[10px] font-bold uppercase tracking-widest shadow-[0_0_8px_rgba(8,145,178,0.4)] ${isPlaying ? 'bg-amber-600 text-black' : 'bg-cyan-600 text-white'}`}>
              {isPlaying ? 'STOP' : 'PLAY'}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 bg-black p-1 rounded-md border border-neutral-800 w-fit">
          {(['sampler', 'pads_seq', 'synth', 'dx7', 'progression', '808', 'mixer'] as ViewMode[]).map(mode => {
            const labels: Record<ViewMode, string> = {
              sampler: 'MPC Sampler', pads_seq: 'MPC Pads & Seq', synth: 'Juno Synth',
              dx7: 'DX7 Synth', progression: 'Chord Gen', '808': '808 Rompler', mixer: 'Mixer',
            };
            const colorClasses: Record<ViewMode, string> = {
              sampler: 'bg-cyan-950/50 text-cyan-400 border-cyan-800/50',
              pads_seq: 'bg-purple-950/50 text-purple-400 border-purple-800/50',
              synth: 'bg-red-900/50 text-red-400 border-red-900/50',
              dx7: 'bg-[#00ff80]/10 text-[#00ff80] border-[#00ff80]/30',
              progression: 'bg-cyan-950/50 text-cyan-400 border-cyan-800/50',
              '808': 'bg-yellow-900/50 text-yellow-500 border-yellow-900/50',
              mixer: 'bg-emerald-900/50 text-emerald-400 border-emerald-900/50',
            };
            return (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors ${viewMode === mode ? colorClasses[mode] : 'text-neutral-500 hover:text-neutral-300'}`}>
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {viewMode === 'sampler' && (
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            <DrumLibrary onLoadToEditor={handleFileUpload} />
            <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
              <WaveformDisplay sample={programEngine.getSample()} onUpload={handleFileUpload}
                onLiveChop={handleLiveChop} onChopTransients={handleChopTransients}
                onSliceUpdate={handleSliceUpdate} onAssignAllPads={handleAssignAll}
                onViewModeChange={setViewMode} />
            </div>
          </div>
        )}
        {viewMode === 'pads_seq' && (
          <div className="flex flex-col lg:flex-row gap-6 h-full">
            <section className="w-full lg:w-[380px] flex flex-col shrink-0">
              <PadGrid activePad={activePad} onPadTrigger={id => setActivePad(id)}
                onPadDrop={handlePadDrop}
                onPadSettingsChange={() => { pushHistory(); setForceRender(p => p + 1); }} />
            </section>
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              <SequencerGrid sequence={sequence} currentTick={playbackTick}
                onToggleStep={handleToggleStep} swingValues={swingValues}
                onSwingChange={(padId, val) => { pushHistory(); programEngine.setPadParam(padId, 'swing', val); setForceRender(p => p + 1); }} />
            </div>
          </div>
        )}
        {viewMode === 'synth' && (
          <div className="h-full">
            <JunoSynth params={junoParams} onParamChange={(section, param, value) => {
              pushHistory();
              setJunoParams(prev => ({ ...prev, [section]: { ...(prev[section as keyof JunoParams] as any), [param]: value } }));
            }} onSavePreset={() => { const b = new Blob([JSON.stringify(junoParams)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = 'juno_preset.json'; a.click(); pushToast('Juno preset saved', 'success'); }} />
          </div>
        )}
        {viewMode === 'dx7' && <div className="h-full"><DX7Synth /></div>}
        {viewMode === 'progression' && (
          <div className="h-full">
            <ProgressionGenerator chordMode={chordMode} onChordModeToggle={setChordMode}
              generatedChords={generatedChords} onChordsUpdate={setGeneratedChords}
              generatorParams={generatorParams} onParamsUpdate={setGeneratorParams} />
          </div>
        )}
        {viewMode === '808' && (
          <div className="h-full">
            <Rompler808 params={rompler808Params} onParamChange={(param, value) => {
              pushHistory();
              setRompler808Params(p => ({ ...p, [param]: value }));
            }} currentSampleName={current808Sample}
              onLoadSample={handle808SampleUpload}
              onTriggerTestNote={() => { if (engine.ctx.state === 'suspended') engine.ctx.resume(); engine.rompler808.triggerNote(36, 127); }}
              onAssignToBank={() => { setRompler808AssignedPads([12, 13, 14, 15]); pushToast('Rompler 808 mapped to MPC Pads 13-16 (Bank D)', 'success'); }}
              onPresetChange={f => setRompler808Params(f)} />
          </div>
        )}
        {viewMode === 'mixer' && (
          <div className="h-full overflow-y-auto overflow-x-hidden flex flex-col gap-6">
            <MasterMixer settings={masterMixer} onChange={setMasterMixer} />
            <div className="flex gap-2 pb-4 overflow-x-auto border-t border-neutral-900 pt-6">
              {Array.from({ length: 16 }, (_, padId) => {
                const channel = mixer[padId];
                const audible = !channel.mute && (!anySolo || channel.solo);
                return (
                  <div key={padId} className={`flex flex-col items-center gap-3 w-20 shrink-0 bg-[#121212] border rounded-lg p-3 ${audible ? 'border-neutral-800' : 'border-neutral-900 opacity-40'}`}>
                    <span className="text-[10px] font-mono text-neutral-500">PAD {String(padId + 1).padStart(2, '0')}</span>
                    <input type="range" min={0} max={100} value={channel.volume}
                      onChange={(e) => updateMixerChannel(padId, { volume: Number(e.target.value) })}
                      className="h-32 accent-emerald-500" style={{ writingMode: 'vertical-lr' as any, direction: 'rtl' }} />
                    <span className="text-[10px] font-mono text-neutral-400">{channel.volume}</span>
                    <input type="range" min={-50} max={50} value={channel.pan}
                      onChange={(e) => updateMixerChannel(padId, { pan: Number(e.target.value) })} className="w-full accent-neutral-500" />
                    <div className="flex gap-1">
                      <button onClick={() => updateMixerChannel(padId, { mute: !channel.mute })}
                        className={`w-7 h-7 rounded text-[10px] font-bold ${channel.mute ? 'bg-red-700 text-white' : 'bg-neutral-800 text-neutral-500'}`}>M</button>
                      <button onClick={() => updateMixerChannel(padId, { solo: !channel.solo })}
                        className={`w-7 h-7 rounded text-[10px] font-bold ${channel.solo ? 'bg-yellow-600 text-black' : 'bg-neutral-800 text-neutral-500'}`}>S</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
      <Transport />
    </div>
  );
}
