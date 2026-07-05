import { useCallback, useMemo, useRef, useState } from 'react';

export interface PianoRollNote {
  id: string;
  pitch: number;
  startTime: number;
  duration: number;
  velocity: number;
  padId: number;
}

interface PianoRollProps {
  notes: PianoRollNote[];
  ghostNotes?: PianoRollNote[];
  onAddNote: (note: Omit<PianoRollNote, 'id'>) => void;
  onRemoveNote: (id: string) => void;
  onUpdateNote: (id: string, updates: Partial<PianoRollNote>) => void;
  selectedPadId: number | null;
  scaleNotes?: number[];
  rootNote?: number;
  totalBars?: number;
  bpm?: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_KEYS = [1, 3, 6, 8, 10];

const KEY_HEIGHT = 16;
const MIN_OCTAVE = 2;
const MAX_OCTAVE = 6;
const BEAT_WIDTH = 48;

export function PianoRoll({
  notes, ghostNotes, onAddNote, onRemoveNote, onUpdateNote,
  selectedPadId, scaleNotes, rootNote = 0, totalBars = 4, bpm = 140,
}: PianoRollProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<{ type: 'move' | 'new' | 'end'; noteId?: string; startX?: number; startPitch?: number } | null>(null);
  const [hoverPitch, setHoverPitch] = useState<number | null>(null);

  const totalPitches = (MAX_OCTAVE - MIN_OCTAVE + 1) * 12;
  const totalWidth = totalBars * 4 * BEAT_WIDTH;
  const totalHeight = totalPitches * KEY_HEIGHT;

  const scaleSet = useMemo(() => {
    if (!scaleNotes) return null;
    return new Set(scaleNotes.map((n) => (n + rootNote) % 12));
  }, [scaleNotes, rootNote]);

  const pitchToY = (pitch: number) => (MAX_OCTAVE * 12 - pitch) * KEY_HEIGHT;
  const timeToX = (time: number) => time * BEAT_WIDTH * 4;

  const gridLines = useMemo(() => {
    const lines: { x: number; label: string }[] = [];
    for (let bar = 0; bar <= totalBars; bar++) {
      lines.push({ x: bar * 4 * BEAT_WIDTH, label: `${bar + 1}` });
    }
    return lines;
  }, [totalBars]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pitch = Math.round((MAX_OCTAVE * 12 - my / KEY_HEIGHT) * 2) / 2;
    const time = mx / (BEAT_WIDTH * 4);

    const hitNote = notes.find((n) => {
      const ny = pitchToY(n.pitch);
      const nx = timeToX(n.startTime);
      const nw = Math.max(8, n.duration * BEAT_WIDTH * 4);
      return mx >= nx && mx <= nx + nw && my >= ny && my <= ny + KEY_HEIGHT;
    });

    if (hitNote && e.button === 0) {
      if (e.shiftKey) {
        onRemoveNote(hitNote.id);
        return;
      }
      setDragging({ type: 'move', noteId: hitNote.id, startX: mx, startPitch: pitch });
    } else if (e.button === 0) {
      const snappedTime = Math.round(time * 4) / 4;
      const snappedPitch = Math.round(pitch);
      onAddNote({
        pitch: snappedPitch,
        startTime: snappedTime,
        duration: 0.25,
        velocity: 100,
        padId: selectedPadId ?? 0,
      });
    }
  }, [notes, selectedPadId, onAddNote, onRemoveNote]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pitch = Math.round((MAX_OCTAVE * 12 - my / KEY_HEIGHT) * 2) / 2;
    setHoverPitch(Math.round(pitch));

    if (dragging?.type === 'move' && dragging.noteId) {
      const dt = (mx - (dragging.startX ?? mx)) / (BEAT_WIDTH * 4);
      const dp = Math.round(pitch) - Math.round(dragging.startPitch ?? pitch);
      const note = notes.find((n) => n.id === dragging.noteId);
      if (note) {
        const newTime = Math.max(0, Math.round((note.startTime + dt) * 4) / 4);
        const newPitch = Math.max(0, Math.min(60 + totalPitches, note.pitch + dp));
        onUpdateNote(dragging.noteId, { startTime: newTime, pitch: newPitch });
      }
    }
  }, [dragging, notes, onUpdateNote, totalPitches]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800 border-b border-zinc-700">
        <span className="text-[10px] uppercase text-zinc-400">Piano Roll</span>
        {scaleNotes && (
          <span className="text-[9px] text-violet-400">
            Scale: {NOTE_NAMES[rootNote]} {scaleNotes.length} notes
          </span>
        )}
        <span className="text-[9px] text-zinc-600">{notes.length} notes</span>
      </div>
      <div className="flex overflow-auto" style={{ maxHeight: 480 }}>
        {/* Keyboard column */}
        <div className="flex-shrink-0 bg-zinc-950">
          {Array.from({ length: totalPitches }, (_, i) => {
            const pitch = MAX_OCTAVE * 12 - i;
            const noteName = NOTE_NAMES[pitch % 12];
            const octave = Math.floor(pitch / 12) - 1;
            const isWhite = WHITE_KEYS.includes(pitch % 12);
            const inScale = scaleSet?.has(pitch % 12);
            return (
              <div
                key={pitch}
                className={`flex items-center justify-end pr-1 border-b border-zinc-800 ${isWhite ? 'bg-zinc-800' : 'bg-zinc-900'} ${inScale === false ? 'opacity-40' : ''}`}
                style={{ height: KEY_HEIGHT, width: 40 }}
              >
                <span className={`text-[8px] ${isWhite ? 'text-zinc-500' : 'text-zinc-600'}`}>
                  {noteName}{octave}
                </span>
              </div>
            );
          })}
        </div>

        {/* Grid area */}
        <div className="flex-1 relative overflow-auto">
          <svg
            ref={svgRef}
            width={totalWidth}
            height={totalHeight}
            className="bg-zinc-900 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Bar lines */}
            {gridLines.map((gl) => (
              <line key={gl.x} x1={gl.x} y1={0} x2={gl.x} y2={totalHeight}
                stroke={gl.x % (4 * BEAT_WIDTH) === 0 ? '#3f3f46' : '#27272a'} strokeWidth={1} />
            ))}

            {/* Beat subdivision lines */}
            {Array.from({ length: totalBars * 4 }, (_, i) => (
              <line key={`beat-${i}`} x1={i * BEAT_WIDTH} y1={0} x2={i * BEAT_WIDTH} y2={totalHeight}
                stroke="#1f1f23" strokeWidth={0.5} />
            ))}

            {/* White key backgrounds */}
            {Array.from({ length: totalPitches }, (_, i) => {
              const pitch = MAX_OCTAVE * 12 - i;
              const isWhite = WHITE_KEYS.includes(pitch % 12);
              if (!isWhite) return null;
              return (
                <rect key={`bg-${pitch}`}
                  x={0} y={i * KEY_HEIGHT} width={totalWidth} height={KEY_HEIGHT}
                  fill={i % 2 === 0 ? '#1c1c22' : '#1a1a20'} />
              );
            })}

            {/* Scale highlighting */}
            {scaleSet && Array.from({ length: totalPitches }, (_, i) => {
              const pitch = MAX_OCTAVE * 12 - i;
              const inScale = scaleSet.has(pitch % 12);
              if (inScale) return null;
              return (
                <rect key={`dim-${pitch}`}
                  x={0} y={i * KEY_HEIGHT} width={totalWidth} height={KEY_HEIGHT}
                  fill="rgba(0,0,0,0.3)" />
              );
            })}

            {/* Ghost notes */}
            {ghostNotes?.map((gn, i) => (
              <rect key={`ghost-${i}`}
                x={timeToX(gn.startTime)} y={pitchToY(gn.pitch)}
                width={Math.max(4, gn.duration * BEAT_WIDTH * 4)}
                height={KEY_HEIGHT - 1}
                fill="rgba(113, 113, 122, 0.2)"
                rx={2} />
            ))}

            {/* Notes */}
            {notes.map((n) => (
              <g key={n.id}>
                <rect
                  x={timeToX(n.startTime)} y={pitchToY(n.pitch)}
                  width={Math.max(6, n.duration * BEAT_WIDTH * 4)}
                  height={KEY_HEIGHT - 2}
                  fill={`hsl(${260 - n.velocity * 0.5}, 70%, ${40 + n.velocity * 0.2}%)`}
                  rx={2}
                  stroke="#6b21a8"
                  strokeWidth={0.5}
                />
                {/* Velocity bar */}
                <rect
                  x={timeToX(n.startTime)}
                  y={pitchToY(n.pitch) + KEY_HEIGHT - 4}
                  width={Math.max(6, (n.duration * BEAT_WIDTH * 4) * (n.velocity / 127))}
                  height={3}
                  fill="#a78bfa"
                  rx={1}
                  opacity={0.6}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}
