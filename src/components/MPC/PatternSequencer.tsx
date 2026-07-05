import { useState } from 'react';
import { Sequence, PatternClip, PatternArrangement } from '../../types';

interface PatternSequencerProps {
  sequences: Sequence[];
  activeSequenceId: string | null;
  arrangement: PatternArrangement;
  onSelectSequence: (id: string) => void;
  onCreateSequence: (name: string) => void;
  onDeleteSequence: (id: string) => void;
  onRenameSequence: (id: string, name: string) => void;
  onAddClip: (clip: PatternClip) => void;
  onRemoveClip: (id: string) => void;
  onToggleClipMute: (id: string) => void;
  totalBars: number;
}

export function PatternSequencer({
  sequences, activeSequenceId, arrangement,
  onSelectSequence, onCreateSequence, onDeleteSequence, onRenameSequence,
  onAddClip, onRemoveClip, onToggleClipMute,
  totalBars,
}: PatternSequencerProps) {
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const maxBar = Math.max(totalBars, ...arrangement.clips.map((c) => c.startBar + c.lengthBars));

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <span className="text-[10px] uppercase font-bold text-zinc-400">Patterns</span>
        <div className="flex gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Pattern name..."
            className="bg-zinc-700 text-[10px] text-zinc-300 rounded px-1.5 py-0.5 w-24 border border-zinc-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newName.trim()) {
                onCreateSequence(newName.trim());
                setNewName('');
              }
            }}
          />
          <button
            onClick={() => {
              if (newName.trim()) {
                onCreateSequence(newName.trim());
                setNewName('');
              }
            }}
            className="text-[10px] bg-violet-600 hover:bg-violet-500 text-white rounded px-1.5 py-0.5"
          >
            + New
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Pattern list */}
        <div className="flex-shrink-0 border-r border-zinc-700 w-36">
          {sequences.map((seq) => (
            <div
              key={seq.id}
              className={`flex items-center gap-1 px-2 py-1.5 border-b border-zinc-800 cursor-pointer
                ${activeSequenceId === seq.id ? 'bg-violet-900/30 border-l-2 border-l-violet-500' : 'hover:bg-zinc-800'}`}
              onClick={() => onSelectSequence(seq.id)}
            >
              {renaming === seq.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="bg-zinc-700 text-[10px] text-zinc-300 rounded px-1 w-full"
                  autoFocus
                  onBlur={() => {
                    if (renameValue.trim()) onRenameSequence(seq.id, renameValue.trim());
                    setRenaming(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (renameValue.trim()) onRenameSequence(seq.id, renameValue.trim());
                      setRenaming(null);
                    }
                  }}
                />
              ) : (
                <span
                  className="text-[10px] text-zinc-300 flex-1 truncate"
                  onDoubleClick={() => { setRenaming(seq.id); setRenameValue(seq.name); }}
                >
                  {seq.name}
                </span>
              )}
              <span className="text-[8px] text-zinc-600">{seq.events.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteSequence(seq.id); }}
                className="text-[8px] text-red-400 hover:text-red-300 opacity-0 hover:opacity-100"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Arrangement view */}
        <div className="flex-1 overflow-auto">
          <div className="relative" style={{ minHeight: 120, minWidth: 400 }}>
            {/* Bar ruler */}
            <div className="flex sticky top-0 bg-zinc-800 border-b border-zinc-700 z-10">
              {Array.from({ length: maxBar }, (_, i) => (
                <div key={i} className="text-[8px] text-zinc-500 px-1 border-r border-zinc-700"
                  style={{ width: 48 }}>
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Clip rows */}
            <div className="relative">
              {arrangement.clips.map((clip) => {
                const seq = sequences.find((s) => s.id === clip.sequenceId);
                return (
                  <div
                    key={clip.id}
                    className={`absolute flex items-center h-8 rounded cursor-pointer
                      ${clip.muted ? 'opacity-40' : ''}`}
                    style={{
                      left: clip.startBar * 48,
                      width: clip.lengthBars * 48,
                      top: arrangement.clips.indexOf(clip) * 36,
                      backgroundColor: clip.muted ? '#3f3f46' : '#4c1d95',
                    }}
                    onClick={() => onToggleClipMute(clip.id)}
                  >
                    <span className="text-[9px] text-white px-1.5 truncate">
                      {seq?.name ?? '???'}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveClip(clip.id); }}
                      className="ml-auto text-[8px] text-red-300 hover:text-red-200 px-1"
                    >
                      ×
                    </button>
                  </div>
                );
              })}

              {/* Drop zone hint */}
              {arrangement.clips.length === 0 && (
                <div className="text-[10px] text-zinc-600 text-center py-10">
                  Create patterns and drag them here to arrange
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
