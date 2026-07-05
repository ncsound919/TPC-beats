import { useCallback, useState } from 'react';
import { Pad } from '../../types';

interface PadLinkerProps {
  pads: Pad[];
  onLinkPads: (sourceId: number, targetIds: number[]) => void;
  onUnlinkPad: (padId: number) => void;
}

export function PadLinker({ pads, onLinkPads, onUnlinkPad }: PadLinkerProps) {
  const [sourcePad, setSourcePad] = useState<number | null>(null);

  const handlePadClick = useCallback((padId: number) => {
    if (sourcePad === null) {
      setSourcePad(padId);
    } else if (sourcePad === padId) {
      setSourcePad(null);
    } else {
      const target = pads.find((p) => p.padId === padId);
      const existingLinks = target?.linkedPadIds ?? [];
      const alreadyLinked = existingLinks.includes(sourcePad);
      const newTargets = alreadyLinked
        ? existingLinks.filter((id) => id !== sourcePad)
        : [...existingLinks, sourcePad];
      onLinkPads(padId, newTargets);

      const source = pads.find((p) => p.padId === sourcePad);
      const sourceLinks = source?.linkedPadIds ?? [];
      if (!alreadyLinked) {
        onLinkPads(sourcePad, [...sourceLinks, padId]);
      }
      setSourcePad(null);
    }
  }, [sourcePad, pads, onLinkPads]);

  const linkedCount = pads.filter((p) => (p.linkedPadIds?.length ?? 0) > 0).length;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2 w-72">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400">Pad Linking</span>
        {sourcePad !== null && (
          <span className="text-[10px] text-amber-400">Linking from Pad {sourcePad + 1}</span>
        )}
      </div>

      <div className="text-[9px] text-zinc-500">
        {sourcePad === null
          ? 'Click a pad to select source, then click target(s) to link'
          : `Click pad to link with Pad ${sourcePad + 1}, or click same pad to cancel`}
      </div>

      <div className="grid grid-cols-4 gap-1">
        {pads.map((pad) => {
          const isSource = sourcePad === pad.padId;
          const linked = pad.linkedPadIds ?? [];
          return (
            <button
              key={pad.padId}
              onClick={() => handlePadClick(pad.padId)}
              className={`relative flex items-center justify-center h-10 rounded text-[10px] font-bold transition-all
                ${isSource
                  ? 'bg-amber-600 text-white ring-2 ring-amber-400 scale-110 z-10'
                  : linked.length > 0
                    ? 'bg-violet-800 text-violet-200 hover:bg-violet-700'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
            >
              {pad.padId + 1}
              {linked.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {linked.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {linkedCount > 0 && (
        <button
          onClick={() => pads.filter((p) => (p.linkedPadIds?.length ?? 0) > 0).forEach((p) => onUnlinkPad(p.padId))}
          className="text-[9px] text-red-400 hover:text-red-300 uppercase tracking-wider"
        >
          Clear all links
        </button>
      )}
    </div>
  );
}
