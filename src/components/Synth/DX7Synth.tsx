import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { DX7Params, DX7Operator, createDefaultDX7Params } from '../../types';
import { parseDX7SysexBank } from '../../audio/synths/DX7Parser';
import { DX7Engine } from '../../audio/synths/DX7Engine';
import { engine } from '../../audio/AudioEngine';

interface DX7SynthProps {
  onPatchLoad?: (params: DX7Params) => void;
}

const TEST_NOTES = [48, 52, 55, 57, 60, 64];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/* ===================================================================
   REUSABLE SLIDER
   =================================================================== */

interface ParamSliderProps {
  label: string;
  value: number;
  max?: number;
  min?: number;
  step?: number;
  onChange: (v: number) => void;
  compact?: boolean;
}

function ParamSlider({
  label,
  value,
  max = 99,
  min = 0,
  step = 1,
  onChange,
  compact = false,
}: ParamSliderProps) {
  const [localValue, setLocalValue] = useState<number>(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const clamped = clamp(localValue, min, max);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      setLocalValue(clamp(raw, min, max));
    },
    [min, max]
  );

  const handleCommit = useCallback(() => {
    onChange(clamped);
  }, [clamped, onChange]);

  return (
    <div
      className={`flex ${
        compact ? 'flex-col items-center gap-1' : 'items-center gap-2'
      }`}
    >
      {!compact && (
        <span className="text-[9px] text-[#00ff82]/50 w-16 shrink-0">
          {label}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={clamped}
        onChange={handleChange}
        onMouseUp={handleCommit}
        onTouchEnd={handleCommit}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        className={compact ? 'w-14 accent-[#00ff82]' : 'flex-1 accent-[#00ff82]'}
      />
      <span className="text-[9px] font-mono text-[#00ff82] w-6 text-right shrink-0">
        {clamped}
      </span>
      {compact && (
        <span className="text-[8px] text-[#00ff82]/40">{label}</span>
      )}
    </div>
  );
}

/* ===================================================================
   MAIN COMPONENT
   =================================================================== */

export function DX7Synth({ onPatchLoad }: DX7SynthProps) {
  const [params, setParams] = useState<DX7Params | null>(null);
  const [bank, setBank] = useState<DX7Params[]>([]);
  const [bankIndex, setBankIndex] = useState(0);
  const [selectedOp, setSelectedOp] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const synthEngine = useRef<DX7Engine | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize engine + default patch
  useEffect(() => {
    synthEngine.current = engine.dx7;
    const init = createDefaultDX7Params();
    setParams(init);
    setBank([init]);
    setBankIndex(0);
  }, []);

  // Sync params into engine when they change
  useEffect(() => {
    if (params && synthEngine.current) {
      synthEngine.current.setParams(params);
    }
  }, [params]);

  const currentPatchName = params?.name ?? '—';

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseDX7SysexBank(buffer);

        if (parsed && parsed.voices.length > 0) {
          setBank(parsed.voices);
          setBankIndex(0);
          setParams(parsed.voices[0]);
          setSelectedOp(0);
          onPatchLoad?.(parsed.voices[0]);
        } else {
          window.alert(
            'Could not read that file as a DX7 SysEx dump (expected a 32-voice bank or single-voice .syx).'
          );
        }
      } catch (err) {
        console.error(err);
        window.alert('Failed to load SYX file');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [onPatchLoad]
  );

  const selectBankVoice = useCallback(
    (idx: number) => {
      const voice = bank[idx];
      if (!voice) return;
      setBankIndex(idx);
      setParams(voice);
      setSelectedOp(0);
      onPatchLoad?.(voice);
    },
    [bank, onPatchLoad]
  );

  const playTestNote = useCallback(
    (midiNote: number = 60, velocity: number = 100) => {
      if (!synthEngine.current || !params) return;
      setIsPlaying(true);
      synthEngine.current.noteOn(midiNote, velocity);
      window.setTimeout(() => {
        synthEngine.current?.noteOff(midiNote);
        setIsPlaying(false);
      }, 900);
    },
    [params]
  );

  const startInit = useCallback(() => {
    const init = createDefaultDX7Params();
    setBank([init]);
    setBankIndex(0);
    setParams(init);
    setSelectedOp(0);
    onPatchLoad?.(init);
  }, [onPatchLoad]);

  /* ---- Editing helpers ------------------------------------------------ */

  const updateParams = useCallback(
    (patch: Partial<DX7Params>) => {
      setParams(prev => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const updateOperator = useCallback(
    (opIndex: number, patch: Partial<DX7Operator>) => {
      setParams(prev => {
        if (!prev) return prev;
        const operators = prev.operators.map((op, i) =>
          i === opIndex ? { ...op, ...patch } : op
        );
        return { ...prev, operators };
      });
    },
    []
  );

  const updateOperatorEG = useCallback(
    (
      opIndex: number,
      field: 'rate' | 'level',
      segIndex: number,
      value: number
    ) => {
      setParams(prev => {
        if (!prev) return prev;
        const operators = prev.operators.map((op, i) => {
          if (i !== opIndex) return op;
          const nextArray = op.eg[field].map((v, si) =>
            si === segIndex ? value : v
          ) as [number, number, number, number];
          const eg = { ...op.eg, [field]: nextArray };
          return { ...op, eg };
        });
        return { ...prev, operators };
      });
    },
    []
  );

  const op = useMemo(
    () => (params ? params.operators[selectedOp] : null),
    [params, selectedOp]
  );

  return (
    <div className="bg-[#0a0f0d] h-full flex flex-col p-6 rounded-2xl border border-[#1a2924] shadow-2xl overflow-hidden relative font-mono">
      <div
        className="absolute inset-0 opacity-[0.035] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(0deg, transparent 24%, rgba(0,255,130,0.4) 25%, rgba(0,255,130,0.4) 26%, transparent 27%, transparent 74%, rgba(0,255,130,0.4) 75%, rgba(0,255,130,0.4) 76%, transparent 77%, transparent),
            linear-gradient(90deg, transparent 24%, rgba(0,255,130,0.4) 25%, rgba(0,255,130,0.4) 26%, transparent 27%, transparent 74%, rgba(0,255,130,0.4) 75%, rgba(0,255,130,0.4) 76%, transparent 77%, transparent)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* HEADER */}
      <header className="flex justify-between items-center mb-6 border-b border-[#1f3630] pb-5 relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-[#00ff82] text-black flex items-center justify-center text-xl font-black rotate-12">
            DX
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-[3px] text-[#00ff82]">
              YAMAHA DX-7
            </h1>
            <p className="text-[#00ff82]/60 text-xs tracking-[2px] -mt-1">
              FM DIGITAL SYNTHESIZER • 1983
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[#00ff82]/70 text-[10px] tracking-widest">
              CURRENT PATCH
            </div>
            <div className="text-[#00ff82] font-bold text-sm tracking-wider">
              {currentPatchName}
            </div>
          </div>
          <button
            type="button"
            onClick={startInit}
            className="px-4 py-3 bg-transparent hover:bg-[#00ff82]/10 border border-[#00ff82]/30 text-[#00ff82]/70 hover:text-[#00ff82] rounded-xl text-xs font-bold tracking-widest transition-all active:scale-95"
          >
            INIT
          </button>
          <label className="cursor-pointer px-6 py-3 bg-[#00ff82]/10 hover:bg-[#00ff82]/20 border border-[#00ff82]/40 hover:border-[#00ff82] text-[#00ff82] rounded-xl text-xs font-bold tracking-widest transition-all active:scale-95 shadow-[0_0_20px_rgba(0,255,130,0.2)]">
            LOAD .SYX
            <input
              ref={fileInputRef}
              type="file"
              accept=".syx,.SYX"
              className="hidden"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </header>

      {params ? (
        <div className="flex-1 flex flex-col gap-5 overflow-hidden relative z-10 min-h-0">
          {/* BANK BROWSER */}
          {bank.length > 1 && (
            <div className="flex gap-1 overflow-x-auto pb-1 shrink-0">
              {bank.map((voice, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => selectBankVoice(idx)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide border transition-colors ${
                    idx === bankIndex
                      ? 'bg-[#00ff82]/20 border-[#00ff82] text-[#00ff82]'
                      : 'bg-[#0f1a16] border-[#1f3630] text-[#00ff82]/40 hover:text-[#00ff82]/70'
                  }`}
                >
                  {String(idx + 1).padStart(2, '0')} {voice.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-5 flex-1 min-h-0">
            {/* LEFT: ALGORITHM + GLOBAL */}
            <div className="w-64 shrink-0 flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="bg-[#0a140f] border-2 border-[#1f3630] rounded-xl p-4">
                <div className="text-[9px] text-[#00ff82]/50 tracking-widest mb-2">
                  ALGORITHM
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      updateParams({
                        algorithm:
                          params.algorithm <= 1 ? 32 : params.algorithm - 1,
                      })
                    }
                    className="text-[#00ff82]/50 hover:text-[#00ff82] text-sm"
                  >
                    ◀
                  </button>
                  <span className="text-2xl font-black text-[#00ff82] flex-1 text-center">
                    {params.algorithm}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateParams({
                        algorithm:
                          params.algorithm >= 32 ? 1 : params.algorithm + 1,
                      })
                    }
                    className="text-[#00ff82]/50 hover:text-[#00ff82] text-sm"
                  >
                    ▶
                  </button>
                </div>
              </div>

              <div className="bg-[#0f1a16] border border-[#1f3630] rounded-xl p-4 space-y-3">
                <ParamSlider
                  label="FEEDBACK"
                  value={params.feedback}
                  max={7}
                  onChange={v => updateParams({ feedback: v })}
                />
                <ParamSlider
                  label="TRANSPOSE"
                  value={params.transpose}
                  max={48}
                  onChange={v => updateParams({ transpose: v })}
                />
                <label className="flex items-center justify-between text-[9px] text-[#00ff82]/50">
                  OSC SYNC
                  <input
                    type="checkbox"
                    checked={params.oscSync}
                    onChange={e =>
                      updateParams({ oscSync: e.target.checked })
                    }
                    className="accent-[#00ff82]"
                  />
                </label>
              </div>

              <div className="bg-[#0f1a16] border border-[#1f3630] rounded-xl p-4 space-y-3">
                <div className="text-[9px] text-[#00ff82]/50 tracking-widest mb-1">
                  LFO
                </div>
                <ParamSlider
                  label="SPEED"
                  value={params.lfo.speed}
                  onChange={v =>
                    updateParams({
                      lfo: { ...params.lfo, speed: v },
                      lfoRate: v,
                    })
                  }
                />
                <ParamSlider
                  label="DELAY"
                  value={params.lfo.delay}
                  onChange={v =>
                    updateParams({ lfo: { ...params.lfo, delay: v } })
                  }
                />
                <ParamSlider
                  label="PM DEPTH"
                  value={params.lfo.pmDepth}
                  onChange={v =>
                    updateParams({ lfo: { ...params.lfo, pmDepth: v } })
                  }
                />
                <ParamSlider
                  label="AM DEPTH"
                  value={params.lfo.amDepth}
                  onChange={v =>
                    updateParams({ lfo: { ...params.lfo, amDepth: v } })
                  }
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[#00ff82]/50 w-16">
                    WAVE
                  </span>
                  <select
                    value={params.lfo.waveform}
                    onChange={e =>
                      updateParams({
                        lfo: {
                          ...params.lfo,
                          waveform: Number(e.target.value) as any,
                        },
                      })
                    }
                    className="bg-[#0a140f] border border-[#1f3630] text-[#00ff82] text-[10px] rounded px-2 py-1 flex-1"
                  >
                    <option value={0}>TRIANGLE</option>
                    <option value={1}>SAW DOWN</option>
                    <option value={2}>SAW UP</option>
                    <option value={3}>SQUARE</option>
                    <option value={4}>SINE</option>
                    <option value={5}>S&amp;H</option>
                  </select>
                </div>
              </div>

              <div className="bg-[#0f1a16] border border-[#1f3630] rounded-xl p-4 space-y-2">
                <div className="text-[9px] text-[#00ff82]/50 tracking-widest mb-1">
                  PITCH EG
                </div>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="flex gap-2">
                    <ParamSlider
                      label={`R${i + 1}`}
                      value={params.pitchEG.rate[i]}
                      onChange={v =>
                        updateParams({
                          pitchEG: {
                            ...params.pitchEG,
                            rate: params.pitchEG.rate.map((r, ri) =>
                              ri === i ? v : r
                            ) as [number, number, number, number],
                          },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* CENTER: OP STACK + EDITOR */}
            <div className="flex-1 flex flex-col gap-3 min-h-0">
              <div className="text-[10px] text-[#00ff82]/50 tracking-widest shrink-0">
                6-OPERATOR STACK — CLICK TO EDIT
              </div>
              <div className="grid grid-cols-6 gap-2 shrink-0">
                {params.operators.map((operator, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedOp(i)}
                    className={`bg-[#0f1a16] border rounded-xl p-3 text-left transition-all ${
                      selectedOp === i
                        ? 'border-[#00ff82] shadow-[0_0_15px_rgba(0,255,130,0.25)]'
                        : 'border-[#1f3630] hover:border-[#00ff82]/40'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-[#00ff82]/70 text-[10px]">
                        OP{i + 1}
                      </div>
                      <input
                        type="checkbox"
                        checked={operator.enabled}
                        onChange={e => {
                          e.stopPropagation();
                          updateOperator(i, { enabled: e.target.checked });
                        }}
                        onClick={e => e.stopPropagation()}
                        className="accent-[#00ff82] w-3 h-3"
                      />
                    </div>
                    <div className="text-sm font-bold text-[#00ff82]">
                      {operator.oscillator.mode === 'ratio'
                        ? `${operator.oscillator.coarse}.${String(
                            operator.oscillator.fine
                          ).padStart(2, '0')}`
                        : `${operator.oscillator.coarse}Hz`}
                    </div>
                    <div className="h-1.5 bg-[#1f3630] rounded overflow-hidden mt-2">
                      <div
                        className="h-full bg-gradient-to-r from-[#00ff82] to-emerald-400"
                        style={{
                          width: `${Math.max(4, operator.outputLevel)}%`,
                        }}
                      />
                    </div>
                    <div className="text-[9px] text-center text-[#00ff82]/60 mt-1">
                      LVL {operator.outputLevel}
                    </div>
                  </button>
                ))}
              </div>

              {op && (
                <div className="flex-1 bg-[#0a140f] border-2 border-[#1f3630] rounded-xl p-4 overflow-y-auto min-h-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[#00ff82] font-bold text-sm tracking-wide">
                      EDITING OP{selectedOp + 1}
                    </span>
                    <div className="flex items-center gap-2 text-[9px] text-[#00ff82]/50">
                      <span>{/* reserved for hints/LEDs */}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* OSCILLATOR & LEVEL */}
                    <div className="space-y-2">
                      <div className="text-[9px] text-[#00ff82]/50 tracking-widest">
                        OSCILLATOR
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-[#00ff82]/50 w-16">
                          MODE
                        </span>
                        <select
                          value={op.oscillator.mode}
                          onChange={e =>
                            updateOperator(selectedOp, {
                              oscillator: {
                                ...op.oscillator,
                                mode: e.target.value as 'ratio' | 'fixed',
                              },
                            })
                          }
                          className="bg-[#0f1a16] border border-[#1f3630] text-[#00ff82] text-[10px] rounded px-2 py-1 flex-1"
                        >
                          <option value="ratio">RATIO</option>
                          <option value="fixed">FIXED</option>
                        </select>
                      </div>
                      <ParamSlider
                        label="COARSE"
                        value={op.oscillator.coarse}
                        max={31}
                        onChange={v =>
                          updateOperator(selectedOp, {
                            oscillator: { ...op.oscillator, coarse: v },
                          })
                        }
                      />
                      <ParamSlider
                        label="FINE"
                        value={op.oscillator.fine}
                        onChange={v =>
                          updateOperator(selectedOp, {
                            oscillator: { ...op.oscillator, fine: v },
                          })
                        }
                      />
                      <ParamSlider
                        label="OUT LEVEL"
                        value={op.outputLevel}
                        onChange={v =>
                          updateOperator(selectedOp, { outputLevel: v })
                        }
                      />
                      <ParamSlider
                        label="VEL SENS"
                        value={op.velocitySens}
                        max={7}
                        onChange={v =>
                          updateOperator(selectedOp, { velocitySens: v })
                        }
                      />
                    </div>

                    {/* EG */}
                    <div className="space-y-2">
                      <div className="text-[9px] text-[#00ff82]/50 tracking-widest">
                        ENVELOPE (EG)
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {op.eg.rate.map((r, i) => (
                          <ParamSlider
                            key={`r${i}`}
                            compact
                            label={`R${i + 1}`}
                            value={r}
                            onChange={v =>
                              updateOperatorEG(selectedOp, 'rate', i, v)
                            }
                          />
                        ))}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        {op.eg.level.map((l, i) => (
                          <ParamSlider
                            key={`l${i}`}
                            compact
                            label={`L${i + 1}`}
                            value={l}
                            onChange={v =>
                              updateOperatorEG(selectedOp, 'level', i, v)
                            }
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#1f3630] grid grid-cols-3 gap-3">
                    <ParamSlider
                      label="BREAKPT"
                      value={op.keyboardScale.breakPoint}
                      onChange={v =>
                        updateOperator(selectedOp, {
                          keyboardScale: {
                            ...op.keyboardScale,
                            breakPoint: v,
                          },
                        })
                      }
                    />
                    <ParamSlider
                      label="L DEPTH"
                      value={op.keyboardScale.leftDepth}
                      onChange={v =>
                        updateOperator(selectedOp, {
                          keyboardScale: {
                            ...op.keyboardScale,
                            leftDepth: v,
                          },
                        })
                      }
                    />
                    <ParamSlider
                      label="R DEPTH"
                      value={op.keyboardScale.rightDepth}
                      onChange={v =>
                        updateOperator(selectedOp, {
                          keyboardScale: {
                            ...op.keyboardScale,
                            rightDepth: v,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TEST KEYBOARD */}
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-[#1f3630] shrink-0">
            {TEST_NOTES.map((note, idx) => (
              <button
                key={idx}
                type="button"
                onMouseDown={() => playTestNote(note)}
                className={`w-12 h-20 rounded-xl border border-[#1f3630] bg-gradient-to-b from-[#0f1a16] to-black hover:from-[#1f3630] active:scale-95 transition-all flex items-end justify-center pb-3 shadow-inner text-[#00ff82]/70 hover:text-[#00ff82] font-mono text-[10px] tracking-widest ${
                  isPlaying ? 'border-[#00ff82]' : ''
                }`}
              >
                {note}
              </button>
            ))}
            <span className="text-[9px] text-[#00ff82]/40 ml-4">
              CLICK TO PLAY TEST NOTE
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center relative z-10">
          <div className="text-center border border-dashed border-[#1f3630] rounded-3xl p-16 max-w-md">
            <div className="mx-auto w-20 h-20 rounded-full border border-[#00ff82]/20 flex items-center justify-center mb-6">
              <span className="text-4xl opacity-30">📼</span>
            </div>
            <h3 className="text-xl text-[#00ff82]/70 font-bold tracking-widest">
              NO PATCH LOADED
            </h3>
            <p className="text-[#00ff82]/40 text-sm mt-2">
              Upload a Yamaha DX7 .SYX cartridge (32-voice bank or single voice),
              or start from INIT.
            </p>
          </div>
        </div>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .glow {
              text-shadow:
                0 0 8px rgba(0, 255, 130, 0.6),
                0 0 20px rgba(0, 255, 130, 0.4),
                0 0 40px rgba(0, 255, 130, 0.2);
            }
          `,
        }}
      />
    </div>
  );
}

export default DX7Synth;
