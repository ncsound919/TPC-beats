import React from 'react';
import {
  EQParams, CompressorParams, LimiterParams, MaximizerParams,
  ReverbParams, ExciterParams, VinylParams
} from '../../types';

/* ============== EQ Editor ============== */

interface EQEditorProps {
  params: EQParams;
  onChange: (params: EQParams) => void;
}

export const EQEditor: React.FC<EQEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">LOW</label>
          <span className="font-mono text-emerald-400">{params.low > 0 ? '+' : ''}{params.low.toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={params.low}
          onChange={(e) => onChange({ ...params, low: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <div className="text-[10px] text-neutral-600 mt-1">
          {params.lowFreq || 100} Hz
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">MID</label>
          <span className="font-mono text-emerald-400">{params.mid > 0 ? '+' : ''}{params.mid.toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={params.mid}
          onChange={(e) => onChange({ ...params, mid: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <div className="text-[10px] text-neutral-600 mt-1">1000 Hz</div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">HIGH</label>
          <span className="font-mono text-emerald-400">{params.high > 0 ? '+' : ''}{params.high.toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.1"
          value={params.high}
          onChange={(e) => onChange({ ...params, high: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <div className="text-[10px] text-neutral-600 mt-1">
          {params.highFreq || 8000} Hz
        </div>
      </div>
    </div>
  );
};

/* ============== Compressor Editor ============== */

interface CompressorEditorProps {
  params: CompressorParams;
  onChange: (params: CompressorParams) => void;
}

export const CompressorEditor: React.FC<CompressorEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">THRESHOLD</label>
          <span className="font-mono text-emerald-400">{params.threshold.toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="-60"
          max="0"
          step="0.5"
          value={params.threshold}
          onChange={(e) => onChange({ ...params, threshold: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">RATIO</label>
          <span className="font-mono text-emerald-400">{params.ratio.toFixed(1)}:1</span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          step="0.1"
          value={params.ratio}
          onChange={(e) => onChange({ ...params, ratio: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">ATTACK</label>
          <span className="font-mono text-emerald-400">{params.attack.toFixed(1)} ms</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="100"
          step="0.1"
          value={params.attack}
          onChange={(e) => onChange({ ...params, attack: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">RELEASE</label>
          <span className="font-mono text-emerald-400">{params.release.toFixed(1)} ms</span>
        </div>
        <input
          type="range"
          min="10"
          max="1000"
          step="10"
          value={params.release}
          onChange={(e) => onChange({ ...params, release: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">MAKEUP GAIN</label>
          <span className="font-mono text-emerald-400">{(params.makeup ?? 0) > 0 ? '+' : ''}{(params.makeup ?? 0).toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="0"
          max="12"
          step="0.1"
          value={params.makeup ?? 0}
          onChange={(e) => onChange({ ...params, makeup: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
};

/* ============== Maximizer Editor ============== */

interface MaximizerEditorProps {
  params: MaximizerParams;
  onChange: (params: MaximizerParams) => void;
}

export const MaximizerEditor: React.FC<MaximizerEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div className="text-center py-8 bg-neutral-950 rounded-lg border border-neutral-800">
        <div className="text-4xl font-mono text-emerald-400 mb-2">CEILING</div>
        <div className="text-2xl font-mono text-emerald-300">{params.threshold.toFixed(2)} dB</div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">THRESHOLD</label>
          <span className="font-mono text-emerald-400">{params.threshold.toFixed(2)} dB</span>
        </div>
        <input
          type="range"
          min="-12"
          max="0"
          step="0.05"
          value={params.threshold}
          onChange={(e) => onChange({ ...params, threshold: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <p className="text-[10px] text-neutral-600 mt-2">
          Any signal above this level will be "brickwall" limited.
        </p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">RELEASE</label>
          <span className="font-mono text-emerald-400">{params.release.toFixed(0)} ms</span>
        </div>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={params.release}
          onChange={(e) => onChange({ ...params, release: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
};

/* ============== Reverb Editor ============== */

interface ReverbEditorProps {
  params: ReverbParams;
  onChange: (params: ReverbParams) => void;
}

export const ReverbEditor: React.FC<ReverbEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">ROOM SIZE</label>
          <span className="font-mono text-emerald-400">{(params.roomSize * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.roomSize}
          onChange={(e) => onChange({ ...params, roomSize: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">DAMPING</label>
          <span className="font-mono text-emerald-400">{(params.damping * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.damping}
          onChange={(e) => onChange({ ...params, damping: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
        <p className="text-[10px] text-neutral-600 mt-1">Higher = more natural/duller reverb.</p>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">WET/DRY</label>
          <span className="font-mono text-emerald-400">{(params.wetDry * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.wetDry}
          onChange={(e) => onChange({ ...params, wetDry: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
};

/* ============== Exciter Editor ============== */

interface ExciterEditorProps {
  params: ExciterParams;
  onChange: (params: ExciterParams) => void;
}

export const ExciterEditor: React.FC<ExciterEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">FREQUENCY</label>
          <span className="font-mono text-emerald-400">{params.frequency.toFixed(0)} Hz</span>
        </div>
        <input
          type="range"
          min="1000"
          max="16000"
          step="100"
          value={params.frequency}
          onChange={(e) => onChange({ ...params, frequency: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">DRIVE</label>
          <span className="font-mono text-emerald-400">{(params.drive * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.drive}
          onChange={(e) => onChange({ ...params, drive: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">MIX</label>
          <span className="font-mono text-emerald-400">{(params.mix * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.mix}
          onChange={(e) => onChange({ ...params, mix: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
};

/* ============== Vinyl Editor ============== */

interface VinylEditorProps {
  params: VinylParams;
  onChange: (params: VinylParams) => void;
}

export const VinylEditor: React.FC<VinylEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">DUST</label>
          <span className="font-mono text-amber-400">{(params.dustAmount * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.dustAmount}
          onChange={(e) => onChange({ ...params, dustAmount: parseFloat(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">CRACKLE</label>
          <span className="font-mono text-amber-400">{(params.crackleAmount * 100).toFixed(0)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={params.crackleAmount}
          onChange={(e) => onChange({ ...params, crackleAmount: parseFloat(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">WOW RATE</label>
          <span className="font-mono text-amber-400">{params.wowRate.toFixed(2)} Hz</span>
        </div>
        <input
          type="range"
          min="0"
          max="5"
          step="0.1"
          value={params.wowRate}
          onChange={(e) => onChange({ ...params, wowRate: parseFloat(e.target.value) })}
          className="w-full accent-amber-500"
        />
      </div>
    </div>
  );
};

/* ============== Limiter Editor ============== */

interface LimiterEditorProps {
  params: LimiterParams;
  onChange: (params: LimiterParams) => void;
}

export const LimiterEditor: React.FC<LimiterEditorProps> = ({ params, onChange }) => {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">THRESHOLD</label>
          <span className="font-mono text-emerald-400">{params.threshold.toFixed(1)} dB</span>
        </div>
        <input
          type="range"
          min="-20"
          max="0"
          step="0.5"
          value={params.threshold}
          onChange={(e) => onChange({ ...params, threshold: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-bold text-neutral-300">RELEASE</label>
          <span className="font-mono text-emerald-400">{params.release.toFixed(0)} ms</span>
        </div>
        <input
          type="range"
          min="10"
          max="500"
          step="10"
          value={params.release}
          onChange={(e) => onChange({ ...params, release: parseFloat(e.target.value) })}
          className="w-full accent-emerald-500"
        />
      </div>
    </div>
  );
};
