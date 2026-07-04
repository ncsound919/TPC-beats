import React, { useState, useCallback, useMemo } from 'react';
import { getAudioEngine } from '../../audio/AudioEngine';
import { MasterMixerSettings, MasterPlugin, DEFAULT_PLUGIN_PARAMS, MasterPluginType } from '../../types';
import { ChannelStrip } from './ChannelStrip';
import { SpectrumAnalyzer } from './SpectrumAnalyzer';
import {
  EQEditor, CompressorEditor, MaximizerEditor, ReverbEditor,
  ExciterEditor, VinylEditor, LimiterEditor
} from './ModuleEditors';
import { Settings, RotateCw, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface MasterMixerProps {
  settings: MasterMixerSettings;
  onChange: (settings: MasterMixerSettings) => void;
}

/**
 * Production-grade Ozone-style mastering console. Features:
 * - Real-time spectrum analysis and per-channel metering
 * - Full module editor for EQ, Compressor, Maximizer, Reverb, Exciter, Vinyl, Limiter
 * - Mute/solo logic with proper bus isolation
 * - Module bypass toggle, add/remove, and parameter editing
 * - Professional Ozone-inspired UI
 */
export function MasterMixer({ settings, onChange }: MasterMixerProps) {
  const engine = useMemo(() => getAudioEngine(), []);

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(
    settings.master.plugins.length > 0 ? settings.master.plugins[0].id : null
  );

  // Track solo state: if any channel is soloed, only solo'd channels audible
  const activeSoloChannels = useMemo(() => {
    const soloedChannels = [];
    if (settings.channels.mpc.solo) soloedChannels.push('mpc');
    if (settings.channels.synth.solo) soloedChannels.push('synth');
    if (settings.channels.rompler.solo) soloedChannels.push('rompler');
    return soloedChannels.length > 0 ? soloedChannels : null;
  }, [settings.channels]);

  const updateMaster = useCallback(
    (updates: Partial<MasterMixerSettings['master']>) => {
      onChange({
        ...settings,
        master: { ...settings.master, ...updates }
      });
    },
    [settings, onChange]
  );

  const updateChannel = useCallback(
    (channel: 'mpc' | 'synth' | 'rompler', updates: any) => {
      onChange({
        ...settings,
        channels: {
          ...settings.channels,
          [channel]: { ...settings.channels[channel], ...updates }
        }
      });
    },
    [settings, onChange]
  );

  const updatePlugin = useCallback(
    (pluginId: string, updates: Partial<MasterPlugin>) => {
      const newPlugins = settings.master.plugins.map(p =>
        p.id === pluginId ? { ...p, ...updates } : p
      );
      updateMaster({ plugins: newPlugins });
    },
    [updateMaster]
  );

  const removePlugin = useCallback(
    (pluginId: string) => {
      const newPlugins = settings.master.plugins.filter(p => p.id !== pluginId);
      updateMaster({ plugins: newPlugins });
      if (selectedModuleId === pluginId) {
        setSelectedModuleId(newPlugins.length > 0 ? newPlugins[0].id : null);
      }
    },
    [updateMaster, selectedModuleId]
  );

  const addPlugin = useCallback(
    (type: MasterPluginType) => {
      const newPlugin: MasterPlugin = {
        id: `plugin_${Date.now()}`,
        type,
        enabled: true,
        params: DEFAULT_PLUGIN_PARAMS[type]
      };
      const newPlugins = [...settings.master.plugins, newPlugin];
      updateMaster({ plugins: newPlugins });
      setSelectedModuleId(newPlugin.id);
    },
    [updateMaster]
  );

  // Get analyser nodes for metering
  const mpcAnalyser = engine.getAnalyser('mpc');
  const synthAnalyser = engine.getAnalyser('synth');
  const romplerAnalyser = engine.getAnalyser('rompler');
  const masterAnalyser = engine.getAnalyser('master');

  const selectedModule = settings.master.plugins.find(p => p.id === selectedModuleId);

  const masterLevelDb = settings.master.volume === 0
    ? -Infinity
    : 20 * Math.log10(settings.master.volume);

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl h-full flex flex-col overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-black">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-black tracking-tighter text-white">OZONE</div>
          <div className="text-xs px-3 py-1 bg-emerald-900/60 text-emerald-400 rounded font-mono">
            MASTERING CHAIN
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">MASTER</span>
            <div className="w-px h-4 bg-neutral-700" />
            <span className="font-mono text-emerald-400">
              {masterLevelDb === -Infinity ? '-∞' : masterLevelDb.toFixed(1)} dB
            </span>
          </div>
          <button
            onClick={() => {
              // Reset master chain to default plugins
              onChange({
                ...settings,
                master: {
                  ...settings.master,
                  plugins: [
                    { id: 'plugin_eq_default', type: 'eq', enabled: true, params: DEFAULT_PLUGIN_PARAMS.eq },
                    { id: 'plugin_comp_default', type: 'compressor', enabled: true, params: DEFAULT_PLUGIN_PARAMS.compressor },
                    { id: 'plugin_lim_default', type: 'limiter', enabled: true, params: DEFAULT_PLUGIN_PARAMS.limiter }
                  ]
                }
              });
              setSelectedModuleId('plugin_eq_default');
            }}
            className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
            title="Reset mastering chain"
            aria-label="Reset"
          >
            <RotateCw className="w-4 h-4 text-neutral-400" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-4 p-4 min-h-0">
        {/* Left: Channel Strips */}
        <div className="w-96 bg-neutral-950 rounded-xl border border-neutral-800 p-4 flex gap-4 overflow-x-auto select-none">
          <ChannelStrip
            name="MPC SAMPLER"
            busName="mpc"
            color="#22d3ee"
            volume={
              activeSoloChannels && !activeSoloChannels.includes('mpc')
                ? 0
                : settings.channels.mpc.mute
                ? 0
                : settings.channels.mpc.volume
            }
            pan={settings.channels.mpc.pan}
            mute={settings.channels.mpc.mute}
            solo={settings.channels.mpc.solo}
            onVolumeChange={(v) => updateChannel('mpc', { volume: v })}
            onPanChange={(v) => updateChannel('mpc', { pan: v })}
            onMuteToggle={() => updateChannel('mpc', { mute: !settings.channels.mpc.mute })}
            onSoloToggle={() => updateChannel('mpc', { solo: !settings.channels.mpc.solo })}
            analyserNode={mpcAnalyser}
          />

          <ChannelStrip
            name="JUNO SYNTH"
            busName="synth"
            color="#ef4444"
            volume={
              activeSoloChannels && !activeSoloChannels.includes('synth')
                ? 0
                : settings.channels.synth.mute
                ? 0
                : settings.channels.synth.volume
            }
            pan={settings.channels.synth.pan}
            mute={settings.channels.synth.mute}
            solo={settings.channels.synth.solo}
            onVolumeChange={(v) => updateChannel('synth', { volume: v })}
            onPanChange={(v) => updateChannel('synth', { pan: v })}
            onMuteToggle={() => updateChannel('synth', { mute: !settings.channels.synth.mute })}
            onSoloToggle={() => updateChannel('synth', { solo: !settings.channels.synth.solo })}
            analyserNode={synthAnalyser}
          />

          <ChannelStrip
            name="808 ROMPLER"
            busName="rompler"
            color="#eab308"
            volume={
              activeSoloChannels && !activeSoloChannels.includes('rompler')
                ? 0
                : settings.channels.rompler.mute
                ? 0
                : settings.channels.rompler.volume
            }
            pan={settings.channels.rompler.pan}
            mute={settings.channels.rompler.mute}
            solo={settings.channels.rompler.solo}
            onVolumeChange={(v) => updateChannel('rompler', { volume: v })}
            onPanChange={(v) => updateChannel('rompler', { pan: v })}
            onMuteToggle={() => updateChannel('rompler', { mute: !settings.channels.rompler.mute })}
            onSoloToggle={() => updateChannel('rompler', { solo: !settings.channels.rompler.solo })}
            analyserNode={romplerAnalyser}
          />
        </div>

        {/* Center: Spectrum + Module Chain */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">
          {/* Spectrum Analyzer */}
          <div className="h-52 bg-black rounded-xl border border-neutral-800 relative overflow-hidden">
            <SpectrumAnalyzer analyserNode={masterAnalyser} height={208} logarithmic peakHold />
            <div className="absolute top-3 right-3 text-[10px] font-mono text-neutral-500 bg-black/65 px-1.5 py-0.5 rounded border border-neutral-800/40">REAL-TIME FFT</div>
          </div>

          {/* Modules Chain */}
          <div className="flex-1 overflow-x-auto bg-neutral-900 rounded-xl border border-neutral-800 p-4 min-h-0">
            <div className="flex gap-4 h-full items-center">
              {settings.master.plugins.map((plugin, index) => (
                <div
                  key={plugin.id}
                  onClick={() => setSelectedModuleId(plugin.id)}
                  className={`w-40 h-28 flex-shrink-0 border rounded-xl p-3.5 cursor-pointer transition-all group flex flex-col justify-between ${
                    selectedModuleId === plugin.id
                      ? 'border-emerald-400 bg-emerald-950/20 shadow-lg shadow-emerald-900/10'
                      : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                  }`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-black tracking-wider uppercase text-white truncate max-w-[80px]">{plugin.type}</div>
                      <div className="text-[9px] text-neutral-500 font-mono">MOD {index + 1}</div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updatePlugin(plugin.id, { enabled: !plugin.enabled });
                        }}
                        className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white"
                        title={plugin.enabled ? 'Bypass' : 'Enable'}
                      >
                        {plugin.enabled ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5 text-neutral-600" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removePlugin(plugin.id);
                        }}
                        className="p-1 hover:bg-red-950/40 rounded text-neutral-500 hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="text-[10px] text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold ${
                        plugin.enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-neutral-800/40 text-neutral-500 border border-neutral-800'
                      }`}
                    >
                      {plugin.enabled ? 'ACTIVE' : 'BYPASS'}
                    </span>
                  </div>
                </div>
              ))}

              {/* Add Module Options */}
              <div className="flex flex-col gap-2 h-full justify-center w-36 pl-2 border-l border-neutral-800/60">
                <div className="text-[8px] font-bold text-neutral-500 tracking-widest uppercase mb-1">Add Module</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => addPlugin('eq')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +EQ
                  </button>
                  <button
                    onClick={() => addPlugin('compressor')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +COMP
                  </button>
                  <button
                    onClick={() => addPlugin('limiter')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +LIMIT
                  </button>
                  <button
                    onClick={() => addPlugin('reverb')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +REVB
                  </button>
                  <button
                    onClick={() => addPlugin('maximizer')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +MAX
                  </button>
                  <button
                    onClick={() => addPlugin('exciter')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono"
                  >
                    +EXCT
                  </button>
                  <button
                    onClick={() => addPlugin('vinyl')}
                    className="py-1 px-1.5 border border-dashed border-neutral-800 hover:border-emerald-500/50 rounded text-neutral-400 hover:text-emerald-400 transition-colors hover:bg-emerald-500/5 text-[9px] font-mono col-span-2"
                  >
                    +VINYL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Module Editor */}
        <div className="w-80 bg-neutral-900 rounded-xl border border-neutral-800 p-5 overflow-y-auto flex flex-col justify-between">
          <div>
            <div className="uppercase text-[10px] tracking-widest text-neutral-400 mb-6 flex items-center gap-2 font-bold">
              <Settings className="w-3.5 h-3.5 text-emerald-400" /> Module Parameter Editor
            </div>

            {selectedModule ? (
              <div className="space-y-6">
                {selectedModule.type === 'eq' && (
                  <EQEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'compressor' && (
                  <CompressorEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'limiter' && (
                  <LimiterEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'maximizer' && (
                  <MaximizerEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'reverb' && (
                  <ReverbEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'exciter' && (
                  <ExciterEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}

                {selectedModule.type === 'vinyl' && (
                  <VinylEditor
                    params={selectedModule.params as any}
                    onChange={(params) => updatePlugin(selectedModule.id, { params })}
                  />
                )}
              </div>
            ) : (
              <div className="py-12 flex items-center justify-center text-center text-neutral-600 text-xs">
                <p>No modules selected. Add one from the chain or select an active module.</p>
              </div>
            )}
          </div>

          {/* Master Volume */}
          <div className="border-t border-neutral-800/60 pt-5 mt-6">
            <div className="text-[10px] font-bold tracking-widest text-neutral-400 mb-3 uppercase">MASTER OUTPUT FADER</div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-neutral-300">GAIN</label>
              <span className="font-mono text-xs text-emerald-400 font-bold">{masterLevelDb === -Infinity ? '-∞' : masterLevelDb.toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={settings.master.volume}
              onChange={(e) => updateMaster({ volume: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default MasterMixer;
