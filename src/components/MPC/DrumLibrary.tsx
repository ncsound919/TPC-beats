import React, {
  useState, useEffect, useRef, useCallback, useMemo, DragEvent
} from 'react';
import { ChopAgent } from '../../audio/agents/ChopAgent';

// ---------- Types ----------
export interface LocalSample {
  id: string;
  name: string;
  file: File;               // in‑memory only (blob stored in IndexedDB)
  tags: string[];
  bpm?: number;
  duration?: number;
  createdAt: number;
  favorite?: boolean;
  color?: string;
  waveform?: number[];      // downsampled peaks for rendering
}

interface DrumLibraryProps {
  onLoadToEditor?: (file: File, slices?: any[]) => void;
  onSampleDrag?: (sample: LocalSample, e: DragEvent<HTMLDivElement>) => void;
  onChopComplete?: (slices: any[]) => void;
  maxPolyphony?: number;
}

// ---------- IndexedDB Helpers ----------
const DB_NAME = 'DrumLibraryDB';
const DB_VERSION = 1;
const STORE_NAME = 'samples';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byCreated', 'createdAt');
        store.createIndex('byFavorite', 'favorite');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveSampleToDB(sample: LocalSample): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Store the file as a Blob (so it can be revived later)
    const record = {
      ...sample,
      file: sample.file, // IndexedDB can store Blobs natively
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadSamplesFromDB(): Promise<LocalSample[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      // Revive File objects from Blob
      const samples = request.result.map((item: any) => ({
        ...item,
        file: item.file instanceof Blob ? new File([item.file], item.file.name || 'sample', { type: item.file.type }) : item.file,
      }));
      resolve(samples);
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteSampleFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- BPM Detection (RMS‑based onset) ----------
function detectBPM(audioBuffer: AudioBuffer): number | undefined {
  const sampleRate = audioBuffer.sampleRate;
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < audioBuffer.length; i++) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }

  // 1. Compute RMS envelope (window: 512 samples, hop: 256)
  const windowSize = 512;
  const hopSize = 256;
  const rms: number[] = [];
  for (let i = 0; i < mono.length - windowSize; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const s = mono[i + j] || 0;
      sum += s * s;
    }
    rms.push(Math.sqrt(sum / windowSize));
  }

  // 2. Normalise & find peaks (adaptive threshold)
  const maxRms = Math.max(...rms, 0.001);
  const norm = rms.map(v => v / maxRms);

  const threshold = 0.4;
  const peaks: number[] = [];
  for (let i = 1; i < norm.length - 1; i++) {
    if (norm[i] > threshold && norm[i] > norm[i - 1] && norm[i] > norm[i + 1]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 4) return undefined;

  // 3. Calculate intervals (in samples) and convert to BPM
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    const diff = (peaks[i] - peaks[i - 1]) * hopSize / sampleRate;
    if (diff > 0.2 && diff < 2.0) { // reasonable BPM range: 30-300
      intervals.push(60 / diff);
    }
  }

  if (intervals.length === 0) return undefined;

  // Average, discard outliers
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  const filtered = intervals.filter(bpm => Math.abs(bpm - median) < median * 0.25);
  const avg = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  return Math.round(avg);
}

// ---------- Waveform extraction ----------
function extractWaveform(audioBuffer: AudioBuffer, points: number = 80): number[] {
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < audioBuffer.length; i++) {
      mono[i] += data[i] / audioBuffer.numberOfChannels;
    }
  }
  const step = Math.max(1, Math.floor(mono.length / points));
  const waveform: number[] = [];
  for (let i = 0; i < points; i++) {
    const start = i * step;
    const end = Math.min(start + step, mono.length);
    let maxVal = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(mono[j] || 0);
      if (abs > maxVal) maxVal = abs;
    }
    waveform.push(maxVal);
  }
  // Normalise to 0-1
  const max = Math.max(...waveform, 0.001);
  return waveform.map(v => v / max);
}

// ---------- Compartments configuration ----------
const COMPARTMENTS = [
  { id: 'all', label: 'ALL', icon: '💿' },
  { id: 'kick', label: 'KICKS', icon: '🥾', keywords: ['kick', 'bd', 'sub', '808'] },
  { id: 'snare', label: 'SNARES', icon: '🥁', keywords: ['snare', 'sd', 'clap', 'rim', 'slap'] },
  { id: 'hat', label: 'HATS', icon: '🔔', keywords: ['hat', 'hihat', 'hh', 'shaker', 'cymbal'] },
  { id: 'loop', label: 'LOOPS', icon: '🌀', keywords: ['loop', 'break', 'groove', 'beat'] },
  { id: 'fx', label: 'FX', icon: '🌌', keywords: ['fx', 'noise', 'sweep', 'sfx', 'rise', 'hit'] },
  { id: 'crash', label: 'CRASH', icon: '💿', keywords: ['crash', 'ride', 'splash', 'china'] },
  { id: 'perc', label: 'PERC', icon: '🪘', keywords: ['perc', 'conga', 'bongo', 'cowbell', 'timbale'] },
  { id: 'favorite', label: 'FAVS', icon: '★' },
];

// ---------- Component ----------
export function DrumLibrary({
  onLoadToEditor,
  onSampleDrag,
  onChopComplete,
}: DrumLibraryProps) {
  const [samples, setSamples] = useState<LocalSample[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCompartment, setActiveCompartment] = useState<string>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlayingId, setIsPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showChopProgress, setShowChopProgress] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchMode, setBatchMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- Load from IndexedDB on mount ----------
  useEffect(() => {
    const load = async () => {
      try {
        const stored = await loadSamplesFromDB();
        setSamples(stored);
      } catch (e) {
        console.warn('Failed to load samples from IndexedDB:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Save to DB whenever samples change (debounced)
  useEffect(() => {
    if (loading) return;
    const timeout = setTimeout(() => {
      for (const sample of samples) {
        saveSampleToDB(sample).catch(console.warn);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [samples, loading]);

  // ---------- Audio preview ----------
  const handlePreview = useCallback((sample: LocalSample) => {
    if (isPlayingId === sample.id && previewAudio) {
      previewAudio.pause();
      setIsPlayingId(null);
      return;
    }
    if (previewAudio) previewAudio.pause();
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const url = URL.createObjectURL(sample.file);
    const audio = new Audio(url);
    audio.playbackRate = 0.96;
    audio.volume = 0.85;
    audio.loop = true;

    audio.play().then(() => {
      setPreviewUrl(url);
      setPreviewAudio(audio);
      setIsPlayingId(sample.id);
    }).catch(() => URL.revokeObjectURL(url));
  }, [isPlayingId, previewAudio, previewUrl]);

  // Cleanup preview
  useEffect(() => {
    return () => {
      if (previewAudio) previewAudio.pause();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewAudio, previewUrl]);

  // ---------- File importer (shared logic) ----------
  const importFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f =>
      f.type.startsWith('audio/') || f.name.match(/\.(wav|mp3|aiff|flac|ogg)$/i)
    );
    if (fileArray.length === 0) return;

    const now = Date.now();
    const newSamples: LocalSample[] = [];

    // Process each file (with BPM + waveform detection)
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    for (const file of fileArray) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const baseName = file.name.replace(/\.[^.]+$/, '');
        const tags = autoTag(file.name);
        const bpm = detectBPM(audioBuffer);
        const waveform = extractWaveform(audioBuffer, 80);
        const duration = audioBuffer.duration;

        newSamples.push({
          id: crypto.randomUUID(),
          name: baseName,
          file,
          tags,
          bpm,
          duration,
          waveform,
          createdAt: now,
          favorite: false,
          color: ['#991b1b', '#854d0e', '#166534', '#1e3a8a', '#7c3aed'][Math.floor(Math.random() * 5)],
        });
      } catch (e) {
        console.warn('Failed to process file:', file.name, e);
      }
    }

    if (newSamples.length > 0) {
      setSamples(prev => [...prev, ...newSamples]);
    }
  }, []);

  // ---------- Drag & Drop (drop files into library) ----------
  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    importFiles(e.dataTransfer.files);
  }, [importFiles]);

  // ---------- Drag sample out ----------
  const handleDragStart = useCallback((sample: LocalSample, e: DragEvent<HTMLDivElement>) => {
    if (onSampleDrag) {
      onSampleDrag(sample, e);
    } else {
      e.dataTransfer.setData('text/plain', sample.id);
      e.dataTransfer.effectAllowed = 'copy';
    }
  }, [onSampleDrag]);

  // ---------- Toggle selection (batch mode) ----------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  }, []);

  // ---------- Batch operations ----------
  const batchDelete = useCallback(async () => {
    if (!confirm(`Delete ${selectedIds.size} samples?`)) return;
    for (const id of selectedIds) {
      await deleteSampleFromDB(id);
    }
    setSamples(prev => prev.filter(s => !selectedIds.has(s.id)));
    setSelectedIds(new Set());
  }, [selectedIds]);

  const batchFavorite = useCallback((fav: boolean) => {
    setSamples(prev => prev.map(s =>
      selectedIds.has(s.id) ? { ...s, favorite: fav } : s
    ));
  }, [selectedIds]);

  const batchAddTag = useCallback((tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    setSamples(prev => prev.map(s =>
      selectedIds.has(s.id) && !s.tags.includes(trimmed)
        ? { ...s, tags: [...s.tags, trimmed] }
        : s
    ));
  }, [selectedIds]);

  // ---------- Single operations ----------
  const toggleFavorite = useCallback((id: string) => {
    setSamples(prev => prev.map(s =>
      s.id === id ? { ...s, favorite: !s.favorite } : s
    ));
  }, []);

  const deleteSample = useCallback(async (id: string) => {
    await deleteSampleFromDB(id);
    setSamples(prev => prev.filter(s => s.id !== id));
  }, []);

  const startEdit = useCallback((sample: LocalSample) => {
    setEditingId(sample.id);
    setEditName(sample.name);
  }, []);

  const saveEdit = useCallback((id: string) => {
    setSamples(prev => prev.map(s =>
      s.id === id ? { ...s, name: editName.trim() || s.name } : s
    ));
    setEditingId(null);
    setEditName('');
  }, [editName]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
  }, []);

  const addTag = useCallback((id: string, tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed) return;
    setSamples(prev => prev.map(s => {
      if (s.id === id && !s.tags.includes(trimmed)) {
        return { ...s, tags: [...s.tags, trimmed] };
      }
      return s;
    }));
  }, []);

  const removeTag = useCallback((id: string, tag: string) => {
    setSamples(prev => prev.map(s =>
      s.id === id ? { ...s, tags: s.tags.filter(t => t !== tag) } : s
    ));
  }, []);

  // ---------- Chop ----------
  const handleChop = useCallback(async (sample: LocalSample) => {
    setShowChopProgress(sample.id);
    try {
      const arrayBuffer = await sample.file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await audioCtx.decodeAudioData(arrayBuffer);
      const slices = ChopAgent.detectTransients(buffer, {
        threshold: 1.5,
        minSliceLength: 0.08,
        useSpectralFlux: true,
      });
      const assigned = ChopAgent.assignSlicesToPads(slices);
      if (onLoadToEditor) onLoadToEditor(sample.file, assigned);
      if (onChopComplete) onChopComplete(assigned);
    } catch (err) {
      console.error('Chop failed:', err);
    } finally {
      setShowChopProgress(null);
    }
  }, [onLoadToEditor, onChopComplete]);

  // ---------- Filtering & sorting ----------
  const filteredSamples = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return samples
      .filter(sample => {
        // Search matches
        const matchesSearch = !query ||
          sample.name.toLowerCase().includes(query) ||
          sample.tags.some(t => t.includes(query));
        if (!matchesSearch) return false;

        // Compartment matches
        if (activeCompartment === 'all') return true;
        if (activeCompartment === 'favorite') return !!sample.favorite;

        // Specific compartment matching
        const comp = COMPARTMENTS.find(c => c.id === activeCompartment);
        if (comp && comp.keywords) {
          const lowerName = sample.name.toLowerCase();
          const matchesKeyword = comp.keywords.some(kw => 
            lowerName.includes(kw) || sample.tags.some(t => t.toLowerCase().includes(kw))
          );
          return matchesKeyword;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  }, [samples, searchQuery, activeCompartment]);

  // ---------- Render item row ----------
  const renderSampleRow = useCallback((sample: LocalSample, index: number) => {
    if (!sample) return null;

    const isSelected = selectedIds.has(sample.id);
    const isEditing = editingId === sample.id;
    const isPlaying = isPlayingId === sample.id;
    const isChopLoading = showChopProgress === sample.id;

    return (
      <div key={sample.id} className="px-1 py-0.5">
        <div
          className={`group bg-neutral-950 border rounded-lg p-2 cursor-grab active:cursor-grabbing transition-all hover:shadow-md flex flex-col gap-1 ${
            isSelected ? 'border-amber-500 bg-amber-900/20' : 'border-neutral-800 hover:border-amber-900/70'
          }`}
          draggable
          onDragStart={(e) => handleDragStart(sample, e)}
          onClick={(e) => {
            if (batchMode) {
              e.stopPropagation();
              toggleSelect(sample.id);
            }
          }}
        >
          <div className="flex gap-2">
            {/* Color strip */}
            <div
              className="w-1.5 rounded self-stretch flex-shrink-0"
              style={{ backgroundColor: sample.color }}
            />

            {/* Waveform mini-view */}
            <div className="flex-shrink-0 w-16 h-8 self-center">
              {sample.waveform ? (
                <svg viewBox="0 0 80 32" className="w-full h-full">
                  {sample.waveform.map((val, i) => (
                    <rect
                      key={i}
                      x={i * (80 / sample.waveform.length!)}
                      y={16 - val * 16}
                      width={Math.max(1, 80 / sample.waveform.length!)}
                      height={val * 32}
                      fill={isSelected ? '#fbbf24' : '#4a4a4a'}
                      className="transition-all"
                    />
                  ))}
                </svg>
              ) : (
                <div className="w-full h-full bg-neutral-800 rounded animate-pulse" />
              )}
            </div>

            {/* Main info */}
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-black border border-amber-600 rounded px-2 py-0.5 text-sm flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(sample.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                  <button onClick={() => saveEdit(sample.id)} className="text-xs text-green-400">✓</button>
                  <button onClick={cancelEdit} className="text-xs text-red-400">✗</button>
                </div>
              ) : (
                <p
                  className="text-xs text-neutral-300 truncate group-hover:text-white transition-colors cursor-pointer"
                  onDoubleClick={() => startEdit(sample)}
                >
                  {sample.name}
                  {sample.bpm && (
                    <span className="ml-2 text-[8px] text-amber-600 font-mono">
                      {sample.bpm} BPM
                    </span>
                  )}
                  {sample.duration && (
                    <span className="ml-1 text-[8px] text-neutral-500 font-mono">
                      {sample.duration.toFixed(1)}s
                    </span>
                  )}
                </p>
              )}
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {sample.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="text-[7px] px-1 py-0.5 bg-neutral-900 text-neutral-500 rounded flex items-center gap-0.5"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(sample.id, tag)}
                      className="hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {sample.tags.length > 3 && (
                  <span className="text-[7px] px-1 py-0.5 text-neutral-600">+{sample.tags.length - 3}</span>
                )}
                <button
                  onClick={() => {
                    const newTag = prompt('Add tag:');
                    if (newTag) addTag(sample.id, newTag);
                  }}
                  className="text-[7px] px-1 py-0.5 bg-neutral-800 text-neutral-600 rounded hover:bg-neutral-700"
                >
                  +
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col items-end gap-0.5">
              {!batchMode && (
                <>
                  <button
                    onClick={() => toggleFavorite(sample.id)}
                    className={`text-sm transition-colors ${sample.favorite ? 'text-rose-500' : 'text-neutral-700 hover:text-rose-400'}`}
                  >
                    {sample.favorite ? '★' : '☆'}
                  </button>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => handlePreview(sample)}
                      className={`text-sm transition-all ${isPlaying ? 'text-emerald-400 scale-110' : 'text-neutral-600 hover:text-white'}`}
                    >
                      {isPlaying ? '■' : '▶'}
                    </button>
                    <button
                      onClick={() => handleChop(sample)}
                      className="text-[10px] px-1 py-0.5 bg-amber-900/30 text-amber-400 rounded hover:bg-amber-800/40 transition-all"
                      disabled={isChopLoading}
                    >
                      {isChopLoading ? '⏳' : '✂️'}
                    </button>
                    <button
                      onClick={() => deleteSample(sample.id)}
                      className="text-xs text-neutral-600 hover:text-red-400 transition-colors"
                    >
                      🗑
                    </button>
                  </div>
                </>
              )}
              {batchMode && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(sample.id)}
                  className="w-4 h-4 accent-amber-500"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }, [
    selectedIds, editingId, editName, isPlayingId, showChopProgress, batchMode,
    toggleSelect, handleDragStart, startEdit, saveEdit, cancelEdit,
    toggleFavorite, deleteSample, handlePreview, handleChop, addTag, removeTag
  ]);

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="bg-[#111] border border-neutral-800 p-6 rounded-2xl w-full lg:w-[320px] h-full flex items-center justify-center">
        <div className="text-neutral-500 text-xs tracking-widest animate-pulse">LOADING CRATE...</div>
      </div>
    );
  }

  return (
    <div
      className={`bg-[#111] border ${isDraggingOver ? 'border-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'border-neutral-800'} p-4 rounded-2xl shadow-2xl w-full lg:w-[340px] flex flex-col h-full shrink-0 transition-all duration-300`}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-bold tracking-[2px] text-amber-400 uppercase flex items-center gap-2">
          🪵 THE CRATE
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBatchMode(!batchMode)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-all ${batchMode ? 'bg-amber-500 text-black border-amber-500' : 'border-neutral-700 hover:border-amber-700'}`}
          >
            {batchMode ? '✓ BATCH' : 'BATCH'}
          </button>
          <span className="text-[10px] bg-neutral-900 px-2 py-0.5 rounded font-mono text-neutral-400">
            {filteredSamples.length}/{samples.length}
          </span>
        </div>
      </div>

      {/* Batch toolbar */}
      {batchMode && (
        <div className="mb-3 p-2 bg-neutral-900/50 rounded border border-amber-800/30 flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-neutral-400 mr-1">{selectedIds.size} selected</span>
          <button onClick={batchDelete} className="text-[9px] px-2 py-0.5 bg-red-900/30 text-red-400 rounded hover:bg-red-800/40">Delete</button>
          <button onClick={() => batchFavorite(true)} className="text-[9px] px-2 py-0.5 bg-rose-900/30 text-rose-400 rounded hover:bg-rose-800/40">★</button>
          <button onClick={() => batchFavorite(false)} className="text-[9px] px-2 py-0.5 bg-neutral-800 text-neutral-400 rounded hover:bg-neutral-700">☆</button>
          <button
            onClick={() => {
              const tag = prompt('Add tag to selected:');
              if (tag) batchAddTag(tag);
            }}
            className="text-[9px] px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-800/40"
          >
            +Tag
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-[9px] px-2 py-0.5 text-neutral-500 hover:text-white">Clear</button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search crates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-black border border-neutral-700 rounded px-3 py-2 text-sm placeholder-neutral-600 focus:border-amber-600 outline-none"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-neutral-800 hover:bg-neutral-700 px-3 rounded text-xs"
          >
            📂
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            multiple
            accept="audio/*"
            onChange={(e) => {
              if (e.target.files) importFiles(e.target.files);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </div>

        {/* Dynamic Compartment tabs */}
        <div className="flex flex-wrap gap-1 border-b border-neutral-900 pb-3 mb-1">
          {COMPARTMENTS.map(comp => (
            <button
              key={comp.id}
              onClick={() => setActiveCompartment(comp.id)}
              className={`text-[9px] px-2 py-1 rounded transition-all uppercase tracking-wider font-bold border flex items-center gap-1 ${
                activeCompartment === comp.id
                  ? 'bg-amber-500 text-black border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.25)] font-extrabold'
                  : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700 text-neutral-400'
              }`}
            >
              <span>{comp.icon}</span>
              <span>{comp.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scroll list */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 max-h-[500px]">
        {filteredSamples.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 text-neutral-500">
            <div className="text-4xl mb-4 opacity-40">💿</div>
            <p className="text-xs tracking-widest">NO RECORDS FOUND</p>
            <p className="text-[10px] mt-2">Drop audio files here</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 pb-2">
            {filteredSamples.map((sample, index) => renderSampleRow(sample, index))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-neutral-800 text-[9px] text-neutral-500 flex flex-col gap-1 items-center">
        <span>Drag to pads • Double‑click name to edit • {samples.length} total</span>
        <span className="text-amber-900">✂️ Chop • 📊 BPM • 💾 Persistent</span>
      </div>
    </div>
  );
}

// ---------- Auto-tag helper ----------
const AUTO_TAG_MAP: Record<string, string[]> = {
  kick: ['kick'], bd: ['kick'], snare: ['snare'], clap: ['snare'],
  hat: ['hat'], hihat: ['hat'], hh: ['hat'],
  perc: ['perc'], 808: ['808', 'bass'],
  loop: ['loop', 'break'], break: ['break', 'loop'],
  horn: ['soul', 'sample'], sample: ['sample'],
  vinyl: ['vinyl', 'dusty'], dust: ['dusty'],
  soul: ['soul'], jazz: ['jazz'], funk: ['funk'],
  'boom-bap': ['boom-bap'], hard: ['hard'], lofi: ['lofi'], rare: ['rare'],
};

function autoTag(filename: string): string[] {
  const lower = filename.toLowerCase();
  const tags = new Set<string>();
  for (const [key, values] of Object.entries(AUTO_TAG_MAP)) {
    if (lower.includes(key)) {
      for (const v of values) tags.add(v);
    }
  }
  return Array.from(tags);
}
