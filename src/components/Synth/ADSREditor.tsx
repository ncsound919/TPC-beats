import { useCallback, useRef, useState } from 'react';

interface ADSREditorProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  onChange: (params: { attack: number; decay: number; sustain: number; release: number }) => void;
  width?: number;
  height?: number;
  label?: string;
}

const HANDLE_RADIUS = 6;

export function ADSREditor({
  attack, decay, sustain, release,
  onChange, width = 240, height = 80, label,
}: ADSREditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const totalDuration = attack + decay + 0.2;
  const padL = 24, padR = 8, padT = 8, padB = 16;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const x = (t: number) => padL + (t / totalDuration) * innerW;
  const y = (v: number) => padT + (1 - v) * innerH;

  const attackX = x(attack);
  const decayX = x(attack + decay);
  const sustainY = y(sustain);
  const releaseX = x(totalDuration) - 16;

  const points = [
    { id: 'A', cx: attackX, cy: y(1), label: 'A' },
    { id: 'D', cx: decayX, cy: sustainY, label: 'D' },
    { id: 'S', cx: releaseX, cy: sustainY, label: 'S' },
    { id: 'R', cx: releaseX, cy: y(0), label: 'R' },
  ];

  const envelopePath = [
    `M ${padL} ${y(1)}`,
    `L ${attackX} ${y(1)}`,
    `L ${decayX} ${sustainY}`,
    `L ${releaseX} ${sustainY}`,
    `L ${releaseX} ${y(0)}`,
  ].join(' ');

  const handleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(id);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const normalizedX = Math.max(0, Math.min(1, (mx - padL) / innerW));
    const normalizedY = Math.max(0, Math.min(1, 1 - (my - padT) / innerH));

    const totalT = totalDuration;
    const newAttack = attack;
    const newDecay = decay;
    const newSustain = sustain;
    const newRelease = release;

    if (dragging === 'A') {
      const t = Math.max(0.02, Math.min(totalT - 0.04, normalizedX * totalT));
      onChange({ attack: Math.round(t * 1000) / 1000, decay: newDecay, sustain: newSustain, release: newRelease });
    } else if (dragging === 'D') {
      const t = Math.max(attack + 0.02, Math.min(totalT - 0.02, normalizedX * totalT));
      onChange({ attack: newAttack, decay: Math.round((t - attack) * 1000) / 1000, sustain: newSustain, release: newRelease });
    } else if (dragging === 'S') {
      onChange({ attack: newAttack, decay: newDecay, sustain: Math.round(normalizedY * 100) / 100, release: newRelease });
    } else if (dragging === 'R') {
      const t = Math.max(attack + decay + 0.02, Math.min(totalT, normalizedX * totalT));
      onChange({ attack: newAttack, decay: newDecay, sustain: newSustain, release: Math.round((totalT - t + 0.2) * 1000) / 1000 });
    }
  }, [dragging, attack, decay, sustain, release, onChange, totalDuration, innerW, innerH]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>}
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <rect x={padL} y={padT} width={innerW} height={innerH} fill="#18181b" rx={4} />
        <path d={envelopePath} fill="none" stroke="#a78bfa" strokeWidth={2} />
        <line x1={padL} y1={y(0)} x2={padL + innerW} y2={y(0)} stroke="#3f3f46" strokeWidth={1} />
        {points.map((p) => (
          <g key={p.id}>
            <circle
              cx={p.cx} cy={p.cy} r={HANDLE_RADIUS + 4}
              fill="transparent"
              onMouseDown={(e) => handleMouseDown(p.id, e)}
            />
            <circle
              cx={p.cx} cy={p.cy} r={HANDLE_RADIUS}
              fill={dragging === p.id ? '#c4b5fd' : '#8b5cf6'}
              stroke="#2d2d3d"
              strokeWidth={1.5}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        ))}
        <text x={attackX - 4} y={y(1) - 8} fill="#a78bfa" fontSize={9} fontWeight={700}>A</text>
        <text x={decayX - 4} y={sustainY - 8} fill="#a78bfa" fontSize={9} fontWeight={700}>D</text>
        <text x={releaseX + 6} y={sustainY - 2} fill="#a78bfa" fontSize={9} fontWeight={700}>S</text>
        <text x={releaseX + 6} y={y(0) + 12} fill="#a78bfa" fontSize={9} fontWeight={700}>R</text>
      </svg>
    </div>
  );
}
