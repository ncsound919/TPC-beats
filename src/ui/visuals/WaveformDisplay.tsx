import React, { useRef, useEffect, useState } from 'react';
import { Sample, Slice } from '../../types';
import { engine } from '../../audio/AudioEngine';

interface WaveformDisplayProps {
  sample: Sample | null;
  onSliceUpdate?: (slices: Slice[]) => void;
  onLiveChop?: (time: number) => void;
  onChopTransients?: () => void;
  onUpload?: (file: File) => void;
  onAssignAllPads?: () => void;
  onViewModeChange?: (view: any) => void;
}

const CHOP_COLORS = [
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#a855f7', // Purple
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#84cc16'  // Lime
];

const CHOP_BG_COLORS = [
  'rgba(6, 182, 212, 0.08)',
  'rgba(245, 158, 11, 0.08)',
  'rgba(168, 85, 247, 0.08)',
  'rgba(16, 185, 129, 0.08)',
  'rgba(236, 72, 153, 0.08)',
  'rgba(59, 130, 246, 0.08)',
  'rgba(239, 68, 68, 0.08)',
  'rgba(132, 204, 22, 0.08)'
];

export function WaveformDisplay({
  sample,
  onSliceUpdate,
  onLiveChop,
  onChopTransients,
  onUpload,
  onAssignAllPads,
  onViewModeChange
}: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);

  const [mode, setMode] = useState<'chop' | 'edit'>('chop');
  const [selectedSliceIdx, setSelectedSliceIdx] = useState<number | null>(null);
  const [autoSwitchToPads, setAutoSwitchToPads] = useState(true);

  const animationRef = useRef<number | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [sample]);

  useEffect(() => {
    if (sample && sample.slices && selectedSliceIdx !== null && selectedSliceIdx >= sample.slices.length) {
      setSelectedSliceIdx(null);
    }
  }, [sample, selectedSliceIdx]);

  const startPlayback = () => {
    if (!sample || !sample.rawBuffer) return;

    if (engine.ctx.state === 'suspended') {
      engine.ctx.resume();
    }

    stopPlayback();

    const source = engine.ctx.createBufferSource();
    source.buffer = sample.rawBuffer;
    source.connect(engine.masterGain);

    const now = engine.ctx.currentTime;
    source.start(now);
    sourceRef.current = source;
    startTimeRef.current = now;
    setIsPlaying(true);

    const animate = () => {
      if (!sourceRef.current || !sample?.rawBuffer) return;

      const elapsed = engine.ctx.currentTime - startTimeRef.current;

      if (elapsed > sample.rawBuffer.duration) {
        stopPlayback();
        return;
      }

      setPlaybackTime(elapsed);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  const stopPlayback = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // ignore
      }
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsPlaying(false);
    setPlaybackTime(0);
  };

  const handleChopButton = () => {
    if (onLiveChop) {
      if (isPlaying) {
        const elapsed = engine.ctx.currentTime - startTimeRef.current;
        onLiveChop(elapsed);
      } else {
        onLiveChop(0);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!sample || !sample.rawBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = canvas.width;

    const ratio = x / width;
    const time = ratio * sample.rawBuffer.duration;

    if (mode === 'chop') {
      if (onLiveChop) {
        onLiveChop(time);
      }
    } else {
      if (sample.slices) {
        // find slice containing time
        const idx = sample.slices.findIndex(s => time >= s.start && time <= s.end);
        if (idx !== -1) {
          setSelectedSliceIdx(idx);
          // audition the slice
          if (engine.ctx.state === 'suspended') engine.ctx.resume();
          const slice = sample.slices[idx];
          const source = engine.ctx.createBufferSource();
          source.buffer = sample.rawBuffer;
          const gain = engine.ctx.createGain();
          gain.gain.value = slice.gain;
          source.connect(gain);
          gain.connect(engine.masterGain);
          source.start(engine.ctx.currentTime, slice.start, slice.end - slice.start);
        } else {
          setSelectedSliceIdx(null);
        }
      }
    }
  };

  const handleChopRegions = (regions: number) => {
    if (!sample || !sample.rawBuffer || !onSliceUpdate) return;
    const duration = sample.rawBuffer.duration;
    const step = duration / regions;
    const newSlices: Slice[] = [];
    for (let i = 0; i < regions; i++) {
      newSlices.push({
        id: `slice_region_${Date.now()}_${i}`,
        start: i * step,
        end: (i + 1) * step,
        attack: 0.005,
        decay: step,
        pitch: 0,
        gain: 1.0,
        padAssignment: null
      });
    }
    onSliceUpdate(newSlices);
  };

  const handleClearSlices = () => {
    if (onSliceUpdate) onSliceUpdate([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    if (!sample || !sample.rawBuffer) {
      return;
    }

    const buffer = sample.rawBuffer;
    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.ceil(data.length / width));
    const amp = height / 2;
    const duration = buffer.duration;
    const slices = sample.slices || [];

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const offset = i * step;

      for (let j = 0; j < step && offset + j < data.length; j++) {
        const datum = data[offset + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const y1 = (1 + min) * amp;
      const y2 = (1 + max) * amp;

      // Find which slice this X position falls into to color-code the waveform line
      const timeAtX = (i / width) * duration;
      const sliceIdx = slices.findIndex(s => timeAtX >= s.start && timeAtX < s.end);

      if (sliceIdx !== -1) {
        ctx.fillStyle = CHOP_COLORS[sliceIdx % CHOP_COLORS.length];
      } else {
        ctx.fillStyle = '#4b5563'; // Gray for unchopped areas
      }

      ctx.fillRect(i, y1, 1, Math.max(1, y2 - y1));
    }

    if (slices.length > 0) {
      slices.forEach((slice, idx) => {
        const x = (slice.start / duration) * width;
        const isSelected = idx === selectedSliceIdx;
        const color = CHOP_COLORS[idx % CHOP_COLORS.length];

        ctx.strokeStyle = isSelected ? '#ffffff' : color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#ffffff' : color;
        ctx.fillRect(x, 0, 18, 12);

        ctx.fillStyle = '#000000';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(String(idx + 1).padStart(2, '0'), x + 3, 9);

        const w = ((slice.end - slice.start) / duration) * width;
        ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.18)' : CHOP_BG_COLORS[idx % CHOP_BG_COLORS.length];
        ctx.fillRect(x, 0, w, height);
      });
    }

    if (isPlaying) {
      const playX = (playbackTime / duration) * width;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }, [sample, isPlaying, playbackTime, selectedSliceIdx]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onUpload) onUpload(e.target.files[0]);
    }
  };

  return (
    <section className="bg-[#111] border border-neutral-800 p-5 rounded-xl shadow-lg flex flex-col shrink-0 min-h-[420px] w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[12px] font-bold tracking-widest text-cyan-400 uppercase flex items-center gap-2">
            <span>MPC SAMPLER &amp; CHOP LAB</span>
            {sample && (
              <span className="px-2 py-0.5 bg-cyan-950/40 border border-cyan-800/40 rounded font-mono text-[9px] text-cyan-300 max-w-[200px] truncate">
                {sample.name}
              </span>
            )}
          </h2>
          <p className="text-[10px] text-neutral-500 font-mono">
            Slice samples into chops using manual clicks, auto regions, or transient detection.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*"
            className="hidden"
          />
          <button
            onClick={() => (isPlaying ? stopPlayback() : startPlayback())}
            disabled={!sample}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded border transition-colors ${
              isPlaying
                ? 'bg-red-900/30 text-red-500 border-red-900 shadow-[0_0_8px_rgba(239,68,68,0.2)]'
                : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
            } disabled:opacity-50`}
          >
            {isPlaying ? 'STOP' : 'PLAY'}
          </button>
          <div className="w-px h-4 bg-neutral-800 mx-1" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] font-bold uppercase tracking-widest rounded border border-neutral-700 transition-colors"
          >
            UPLOAD SAMPLE
          </button>
          
          <div className="w-px h-4 bg-neutral-800 mx-1" />

          <div className="flex bg-neutral-900 rounded border border-neutral-700 overflow-hidden">
            <button
              onClick={() => setMode('chop')}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${mode === 'chop' ? 'bg-cyan-900 text-cyan-400' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              CHOP MODE
            </button>
            <button
              onClick={() => setMode('edit')}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${mode === 'edit' ? 'bg-cyan-900 text-cyan-400' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              EDIT PARAMS
            </button>
          </div>
        </div>
      </div>

      {/* Waveform timeline with chops overlay */}
      <div className="relative flex-1 bg-black rounded-lg border border-neutral-800 overflow-hidden min-h-[200px]">
        <canvas
          ref={canvasRef}
          width={1000}
          height={200}
          className="w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
        />
        {!sample && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/80">
            <span className="text-4xl">📥</span>
            <span className="text-neutral-500 font-mono text-xs uppercase tracking-widest">No audio sample loaded</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-4 py-2 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800/40 hover:border-cyan-500 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded transition-all"
            >
              Load Sample File
            </button>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/5 to-transparent pointer-events-none" />
      </div>

      {/* Quick chop actions bar */}
      {sample && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3 px-1 py-2 border-b border-neutral-900">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest mr-2">CHOP TOOLS:</span>
            <button
              onClick={() => handleChopRegions(16)}
              className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded border border-cyan-900/40 transition-colors"
              title="Slice into 16 equal regions"
            >
              16 REGIONS
            </button>
            <button
              onClick={() => handleChopRegions(8)}
              className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded border border-cyan-900/40 transition-colors"
              title="Slice into 8 equal regions"
            >
              8 REGIONS
            </button>
            <button
              onClick={onChopTransients}
              className="px-3 py-1 bg-neutral-900 hover:bg-neutral-800 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded border border-cyan-900/40 transition-colors"
              title="Auto chop by transient energy"
            >
              AUTO TRANSIENTS
            </button>
            <button
              onClick={handleChopButton}
              className="px-3 py-1 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded border border-cyan-800/60 transition-colors"
              title="Add slice at current playhead"
            >
              ADD LIVE CUT
            </button>
          </div>

          <button
            onClick={handleClearSlices}
            className="px-3 py-1 bg-neutral-900 hover:bg-red-950/40 text-neutral-500 hover:text-red-400 text-[10px] font-bold uppercase tracking-widest rounded border border-neutral-800 hover:border-red-900/30 transition-colors"
          >
            CLEAR CHOPS
          </button>
        </div>
      )}

      {/* Horizontally scrolling list of Chops for immediate review and tuning */}
      {sample && sample.slices && sample.slices.length > 0 && (
        <div className="mt-3 bg-neutral-950 p-2.5 rounded-lg border border-neutral-800">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1.5 px-1 flex justify-between">
            <span>CHOP TIMELINE TIMELINES ({sample.slices.length} active chops)</span>
            <span className="text-[9px] text-cyan-500/80 font-normal">Click a chop to preview/select</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 max-h-[85px] scrollbar-thin scrollbar-thumb-neutral-800">
            {sample.slices.map((slice, idx) => {
              const isSelected = idx === selectedSliceIdx;
              const color = CHOP_COLORS[idx % CHOP_COLORS.length];
              return (
                <button
                  key={slice.id}
                  onClick={() => {
                    setSelectedSliceIdx(idx);
                    // play slice
                    if (engine.ctx.state === 'suspended') engine.ctx.resume();
                    const source = engine.ctx.createBufferSource();
                    source.buffer = sample.rawBuffer!;
                    const gain = engine.ctx.createGain();
                    gain.gain.value = slice.gain;
                    source.playbackRate.value = Math.pow(2, slice.pitch / 12);
                    source.connect(gain);
                    gain.connect(engine.masterGain);
                    source.start(engine.ctx.currentTime, slice.start, slice.end - slice.start);
                  }}
                  className={`flex flex-col gap-1 px-3 py-1.5 rounded border transition-all text-left shrink-0 min-w-[120px] ${
                    isSelected
                      ? 'bg-neutral-900 border-white text-white shadow-inner'
                      : 'bg-neutral-900/40 border-neutral-800 hover:border-neutral-700 text-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: color }} />
                      <span className="text-[10px] font-bold font-mono">
                        CHOP {String(idx + 1).padStart(2, '0')}
                      </span>
                    </div>
                    {slice.padAssignment !== null && (
                      <span className="text-[8px] bg-cyan-950 text-cyan-400 px-1 rounded font-mono font-bold">
                        PAD {slice.padAssignment + 1}
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-neutral-500 font-mono">
                    {slice.start.toFixed(2)}s - {slice.end.toFixed(2)}s
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode parameters editor */}
      {mode === 'edit' && selectedSliceIdx === null && sample && (
        <div className="mt-3 p-3 bg-neutral-900 border border-neutral-800 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-[11px] font-bold text-cyan-400">GLOBAL SAMPLE SETTINGS</span>
            <div className="w-px h-4 bg-neutral-700" />
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">BPM</span>
              <input 
                type="number" min="40" max="300"
                value={sample.bpm || 120}
                onChange={() => {}}
                className="w-16 bg-black text-white text-xs border border-neutral-700 rounded px-1.5 py-0.5 font-mono"
                disabled
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Playback Mode</span>
              <select 
                className="bg-black text-white text-xs border border-neutral-700 rounded px-1.5 py-0.5 font-mono"
                disabled
              >
                <option value="oneshot">One-Shot</option>
                <option value="loop">Loop</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </div>
          <span className="text-[9px] text-neutral-500 font-mono">Select a chop region to edit pitch/gain details.</span>
        </div>
      )}

      {mode === 'edit' && selectedSliceIdx !== null && sample?.slices && (
        <div className="mt-3 p-4 bg-neutral-900 border border-neutral-800 rounded-lg flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-[11px] font-extrabold text-cyan-400 tracking-wider uppercase">EDIT CHOP {selectedSliceIdx + 1} PARAMS</span>
            
            <button
               onClick={() => {
                  if (engine.ctx.state === 'suspended') engine.ctx.resume();
                  const slice = sample.slices![selectedSliceIdx];
                  engine.playSlice(sample.rawBuffer!, slice);
               }}
               className="px-3 py-1 bg-cyan-950/40 hover:bg-cyan-900/40 border border-cyan-800 text-cyan-400 text-[10px] font-bold uppercase tracking-widest rounded transition-all"
            >
              Audition Chop
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            {/* Column 1: Gain & Pitch */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Gain</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max="2" step="0.05" 
                    value={sample.slices[selectedSliceIdx].gain}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        newSlices[selectedSliceIdx].gain = parseFloat(e.target.value);
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">{sample.slices[selectedSliceIdx].gain.toFixed(2)}x</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Pitch Shift</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="-12" max="12" step="1" 
                    value={sample.slices[selectedSliceIdx].pitch}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        newSlices[selectedSliceIdx].pitch = parseInt(e.target.value);
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">{sample.slices[selectedSliceIdx].pitch > 0 ? `+${sample.slices[selectedSliceIdx].pitch}` : sample.slices[selectedSliceIdx].pitch} st</span>
                </div>
              </div>
            </div>

            {/* Column 2: Envelope (Attack & Decay) */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Attack</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0.001" max="1.0" step="0.01" 
                    value={sample.slices[selectedSliceIdx].attack}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        newSlices[selectedSliceIdx].attack = parseFloat(e.target.value);
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">{(sample.slices[selectedSliceIdx].attack * 1000).toFixed(0)}ms</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Decay</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0.01" max="4.0" step="0.05" 
                    value={sample.slices[selectedSliceIdx].decay}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        newSlices[selectedSliceIdx].decay = parseFloat(e.target.value);
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">{sample.slices[selectedSliceIdx].decay.toFixed(2)}s</span>
                </div>
              </div>
            </div>

            {/* Column 3: Analog Filter Envelope */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">LP Cutoff</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max="12000" step="100" 
                    value={sample.slices[selectedSliceIdx].filter?.cutoff ?? 0}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        const curFilter = newSlices[selectedSliceIdx].filter || { cutoff: 0, resonance: 1.0 };
                        newSlices[selectedSliceIdx].filter = {
                          cutoff: parseInt(e.target.value),
                          resonance: curFilter.resonance
                        };
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">
                    {(sample.slices[selectedSliceIdx].filter?.cutoff ?? 0) === 0 ? 'OFF' : `${sample.slices[selectedSliceIdx].filter!.cutoff}Hz`}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest">Resonance</span>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="1.0" max="15.0" step="0.5" 
                    value={sample.slices[selectedSliceIdx].filter?.resonance ?? 1.0}
                    onChange={(e) => {
                      if (onSliceUpdate) {
                        const newSlices = [...sample.slices!];
                        const curFilter = newSlices[selectedSliceIdx].filter || { cutoff: 1000, resonance: 1.0 };
                        newSlices[selectedSliceIdx].filter = {
                          cutoff: curFilter.cutoff,
                          resonance: parseFloat(e.target.value)
                        };
                        onSliceUpdate(newSlices);
                      }
                    }}
                    className="w-24 accent-cyan-400"
                    disabled={!(sample.slices[selectedSliceIdx].filter?.cutoff)}
                  />
                  <span className="text-[10px] font-mono text-neutral-400 w-12">{sample.slices[selectedSliceIdx].filter?.resonance?.toFixed(1) ?? '1.0'}</span>
                </div>
              </div>
            </div>

            {/* Column 4: Reverse & Stutter Loops */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 border border-neutral-800 bg-neutral-950 p-2 rounded-lg">
                <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Reverse</span>
                <button
                  onClick={() => {
                    if (onSliceUpdate) {
                      const newSlices = [...sample.slices!];
                      newSlices[selectedSliceIdx].reverse = !newSlices[selectedSliceIdx].reverse;
                      onSliceUpdate(newSlices);
                    }
                  }}
                  className={`px-3 py-1 text-[9px] rounded font-black tracking-widest uppercase transition-all ${
                    sample.slices[selectedSliceIdx].reverse 
                      ? 'bg-amber-950 text-amber-400 border border-amber-800 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                      : 'bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300'
                  }`}
                >
                  {sample.slices[selectedSliceIdx].reverse ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex flex-col gap-1 border border-neutral-800 bg-neutral-950 p-2 rounded-lg">
                <span className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest">Dilla Stutter</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] text-neutral-500 font-mono">Count</span>
                    <select
                      value={sample.slices[selectedSliceIdx].stutter?.count ?? 1}
                      onChange={(e) => {
                        if (onSliceUpdate) {
                          const newSlices = [...sample.slices!];
                          const curStutter = newSlices[selectedSliceIdx].stutter || { count: 1, interval: 0.08 };
                          newSlices[selectedSliceIdx].stutter = {
                            count: parseInt(e.target.value),
                            interval: curStutter.interval
                          };
                          onSliceUpdate(newSlices);
                        }
                      }}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-300 rounded text-[9px] font-mono px-1 py-0.5"
                    >
                      <option value="1">1 (Off)</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="6">6</option>
                      <option value="8">8</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[8px] text-neutral-500 font-mono">Interval</span>
                    <select
                      value={sample.slices[selectedSliceIdx].stutter?.interval ?? 0.08}
                      onChange={(e) => {
                        if (onSliceUpdate) {
                          const newSlices = [...sample.slices!];
                          const curStutter = newSlices[selectedSliceIdx].stutter || { count: 2, interval: 0.08 };
                          newSlices[selectedSliceIdx].stutter = {
                            count: curStutter.count,
                            interval: parseFloat(e.target.value)
                          };
                          onSliceUpdate(newSlices);
                        }
                      }}
                      className="bg-neutral-900 border border-neutral-700 text-neutral-300 rounded text-[9px] font-mono px-1 py-0.5"
                      disabled={!(sample.slices[selectedSliceIdx].stutter?.count && sample.slices[selectedSliceIdx].stutter.count > 1)}
                    >
                      <option value="0.04">40ms</option>
                      <option value="0.08">80ms</option>
                      <option value="0.12">120ms</option>
                      <option value="0.16">160ms</option>
                      <option value="0.24">240ms</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONE-BUTTON PROGRAM & EXPORT TO PADS PANEL */}
      <div className="mt-4 p-4 bg-cyan-950/20 border border-cyan-900/40 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-sm font-bold text-cyan-300 tracking-wider">ONE-BUTTON FAST PAD UPLOAD &amp; EXPORT</h3>
          </div>
          <p className="text-[11px] text-neutral-400 max-w-xl">
            Auto-generate a full program map of your chops, assign them directly to the 16 MPC play pads, and prepare the performance grid instantly for fast music creation.
          </p>
        </div>
        
        <div className="flex items-center gap-3 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer bg-neutral-900/60 border border-neutral-800 px-3 py-1.5 rounded-lg text-[10px] text-neutral-400 font-bold hover:text-neutral-200">
            <input
              type="checkbox"
              checked={autoSwitchToPads}
              onChange={(e) => setAutoSwitchToPads(e.target.checked)}
              className="accent-cyan-500 rounded cursor-pointer"
            />
            AUTO-JUMP TO PADS/SEQ
          </label>
          
          <button
            onClick={() => {
              if (!sample) return;
              // If there are no chops yet, automatically slice it to 16 regions so the user gets a working kit instantly!
              if (!sample.slices || sample.slices.length === 0) {
                handleChopRegions(16);
              }
              // Assign all to pads
              if (onAssignAllPads) {
                setTimeout(() => {
                  onAssignAllPads();
                  if (autoSwitchToPads && onViewModeChange) {
                    onViewModeChange('pads_seq');
                  }
                }, 100);
              }
            }}
            disabled={!sample}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
          >
            <span>⚡ EXPORT &amp; MAP TO PADS</span>
          </button>
        </div>
      </div>
    </section>
  );
}
