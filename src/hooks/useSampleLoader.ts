import { useCallback } from 'react';
import { engine } from '../audio/AudioEngine';
import { programEngine } from '../audio/ProgramEngine';
import { ChopAgent } from '../audio/agents/ChopAgent';

export function useSampleLoader(
  pushHistory: () => void,
  pushToast: (msg: string, tone?: 'info' | 'success' | 'error') => void,
  onForceRender: () => void
) {
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      if (engine.ctx.state === 'suspended') await engine.ctx.resume();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await engine.ctx.decodeAudioData(arrayBuffer);
      const slices = ChopAgent.detectTransients(buffer, { threshold: 0.05, minSliceLength: 0.1 });
      pushHistory();
      programEngine.setSample({
        id: file.name,
        name: file.name,
        rawBuffer: buffer,
        sampleRate: engine.ctx.sampleRate,
        bitDepth: 16,
        slices,
      });
      onForceRender();
      pushToast(`Loaded "${file.name}" — ${slices.length} slice(s) detected`, 'success');
    } catch (e) {
      console.error('Failed to load file', e);
      pushToast(`Couldn't load "${file.name}"`, 'error');
    }
  }, [pushHistory, pushToast, onForceRender]);

  const handle808SampleUpload = useCallback(async (file: File) => {
    try {
      if (engine.ctx.state === 'suspended') await engine.ctx.resume();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await engine.ctx.decodeAudioData(arrayBuffer);
      engine.rompler808.setSampleBuffer(buffer);
      pushToast(`Loaded 808 sample "${file.name}"`, 'success');
      return file.name;
    } catch (e) {
      console.error('Failed to load 808 sample', e);
      pushToast(`Couldn't load "${file.name}"`, 'error');
      return null;
    }
  }, [pushToast]);

  const handlePadDrop = useCallback(async (padId: number, file: File) => {
    try {
      if (engine.ctx.state === 'suspended') await engine.ctx.resume();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await engine.ctx.decodeAudioData(arrayBuffer);
      const sliceId = `slice_${Date.now()}`;
      pushHistory();
      programEngine.program.samples.push({
        id: `sample_${Date.now()}`,
        name: file.name,
        rawBuffer: buffer,
        sampleRate: engine.ctx.sampleRate,
        bitDepth: 16,
        slices: [{
          id: sliceId, start: 0, end: buffer.duration,
          attack: 0.01, decay: buffer.duration, pitch: 0, gain: 1.0, padAssignment: padId,
        }],
      });
      programEngine.assignSliceToPad(padId, sliceId);
      onForceRender();
      pushToast(`Assigned "${file.name}" to pad ${padId + 1}`, 'success');
    } catch (e) {
      console.error(e);
      pushToast(`Couldn't assign "${file.name}"`, 'error');
    }
  }, [pushHistory, pushToast, onForceRender]);

  return { handleFileUpload, handle808SampleUpload, handlePadDrop };
}
