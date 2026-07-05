import { useCallback, useRef, useState } from 'react';
import { AutomationClip, AutomationPoint } from '../../types';

interface AutomationEditorProps {
  clips: AutomationClip[];
  activeClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onAddClip: (clip: AutomationClip) => void;
  onRemoveClip: (id: string) => void;
  onAddPoint: (clipId: string, point: AutomationPoint) => void;
  onRemovePoint: (clipId: string, pointIdx: number) => void;
  onMovePoint: (clipId: string, pointIdx: number, timePPQN: number, value: number) => void;
  totalBars: number;
  ppqn: number;
  isRecording: boolean;
  onToggleRecording: () => void;
}

const GRID_HEIGHT = 120;
const BEAT_WIDTH = 32;

export function AutomationEditor({
  clips, activeClipId, onSelectClip, onAddClip, onRemoveClip,
  onAddPoint, onRemovePoint, onMovePoint,
  totalBars, ppqn, isRecording, onToggleRecording,
}: AutomationEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingPoint, setDraggingPoint] = useState<{ clipId: string; idx: number } | null>(null);
  const [newClipTarget, setNewClipTarget] = useState('cutoff');

  const activeClip = clips.find((c) => c.id === activeClipId) ?? null;
  const totalWidth = totalBars * 4 * BEAT_WIDTH;

  const valueToY = (v: number, min: number, max: number) =>
    GRID_HEIGHT - ((v - min) / (max - min)) * GRID_HEIGHT;
  const timeToX = (t: number) => (t / (ppqn * 4)) * BEAT_WIDTH;

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (!activeClip || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ppqnTime = Math.round((mx / BEAT_WIDTH) * ppqn * 4 / 16) * 16;
    const value = activeClip.min + (1 - my / GRID_HEIGHT) * (activeClip.max - activeClip.min);
    onAddPoint(activeClip.id, {
      timestampPPQN: ppqnTime,
      value: Math.round(value * 100) / 100,
    });
  }, [activeClip, onAddPoint, ppqn]);

  const handlePointMouseDown = useCallback((clipId: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingPoint({ clipId, idx });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingPoint || !activeClip || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ppqnTime = Math.max(0, Math.round((mx / BEAT_WIDTH) * ppqn * 4 / 16) * 16);
    const value = activeClip.min + Math.max(0, Math.min(1, 1 - my / GRID_HEIGHT)) * (activeClip.max - activeClip.min);
    onMovePoint(draggingPoint.clipId, draggingPoint.idx, ppqnTime, Math.round(value * 100) / 100);
  }, [draggingPoint, activeClip, onMovePoint, ppqn]);

  const handleMouseUp = useCallback(() => {
    setDraggingPoint(null);
  }, []);

  const handleAddClip = () => {
    const newClip: AutomationClip = {
      id: crypto.randomUUID(),
      target: newClipTarget,
      points: [],
      min: 0,
      max: 100,
      loop: true,
    };
    onAddClip(newClip);
    onSelectClip(newClip.id);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Automation</span>
        <div className="flex items-center gap-2">
          <input
            value={newClipTarget}
            onChange={(e) => setNewClipTarget(e.target.value)}
            placeholder="param path..."
            className="bg-zinc-800 text-[10px] text-zinc-300 rounded px-1.5 py-0.5 w-20 border border-zinc-700"
          />
          <button
            onClick={handleAddClip}
            className="text-[10px] bg-violet-600 hover:bg-violet-500 text-white rounded px-1.5 py-0.5"
          >
            + Clip
          </button>
          <button
            onClick={onToggleRecording}
            className={`text-[10px] rounded px-2 py-0.5 font-bold uppercase
              ${isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {isRecording ? '● REC' : 'Arm'}
          </button>
        </div>
      </div>

      {/* Clip selector */}
      <div className="flex gap-1 flex-wrap">
        {clips.map((clip) => (
          <button
            key={clip.id}
            onClick={() => onSelectClip(activeClipId === clip.id ? null : clip.id)}
            className={`text-[9px] px-1.5 py-0.5 rounded border
              ${activeClipId === clip.id
                ? 'bg-violet-900 border-violet-600 text-violet-200'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'}`}
          >
            {clip.target}
            <span className="ml-1 opacity-50">{clip.points.length}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveClip(clip.id); }}
              className="ml-1 text-red-400"
            >×</button>
          </button>
        ))}
      </div>

      {/* Editor grid */}
      {activeClip && (
        <div className="overflow-auto">
          <svg
            ref={svgRef}
            width={totalWidth}
            height={GRID_HEIGHT}
            className="bg-zinc-800 rounded cursor-crosshair"
            onClick={handleSvgClick}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Grid lines */}
            {Array.from({ length: totalBars * 4 }, (_, i) => (
              <line key={i}
                x1={i * BEAT_WIDTH} y1={0} x2={i * BEAT_WIDTH} y2={GRID_HEIGHT}
                stroke={i % 4 === 0 ? '#3f3f46' : '#27272a'} strokeWidth={0.5} />
            ))}

            {/* 50% line */}
            <line x1={0} y1={GRID_HEIGHT / 2} x2={totalWidth} y2={GRID_HEIGHT / 2}
              stroke="#3f3f46" strokeWidth={0.5} strokeDasharray="4 2" />

            {/* Envelope line */}
            {activeClip.points.length > 1 && (
              <polyline
                points={activeClip.points.map((p) =>
                  `${timeToX(p.timestampPPQN)},${valueToY(p.value, activeClip.min, activeClip.max)}`
                ).join(' ')}
                fill="none"
                stroke="#a78bfa"
                strokeWidth={1.5}
              />
            )}

            {/* Points */}
            {activeClip.points.map((p, i) => (
              <circle
                key={i}
                cx={timeToX(p.timestampPPQN)}
                cy={valueToY(p.value, activeClip.min, activeClip.max)}
                r={4}
                fill={draggingPoint?.idx === i ? '#c4b5fd' : '#8b5cf6'}
                stroke="#2d2d3d"
                strokeWidth={1}
                onMouseDown={(e) => handlePointMouseDown(activeClip.id, i, e)}
                style={{ cursor: 'pointer' }}
              />
            ))}

            {activeClip.points.length === 0 && (
              <text x={totalWidth / 2} y={GRID_HEIGHT / 2}
                textAnchor="middle" fill="#52525b" fontSize={10}>
                Click to add automation points
              </text>
            )}
          </svg>
        </div>
      )}

      {!activeClip && clips.length > 0 && (
        <div className="text-[10px] text-zinc-600 text-center py-4">
          Select a clip from above to edit
        </div>
      )}
    </div>
  );
}
