import { useEffect, useRef } from 'react';
import { saveProject } from '../persistence/LocalProjectStore';
import { Sequence, JunoParams, ExtendedRomplerParams } from '../types';

interface AutosaveData {
  sequence: Sequence;
  program: unknown;
  junoParams: JunoParams;
  rompler808Params: ExtendedRomplerParams;
  mixer: Record<number, unknown>;
}

export function useAutosave(
  data: AutosaveData,
  pushToast: (msg: string, tone?: 'info' | 'success' | 'error') => void
) {
  const warnedRef = useRef(false);

  useEffect(() => {
    const handle = window.setInterval(() => {
      const result = saveProject({
        sequence: data.sequence,
        program: data.program as any,
        junoParams: data.junoParams,
        rompler808Params: data.rompler808Params,
        mixer: data.mixer as any,
        savedAt: Date.now(),
      });

      if (!result.success) {
        console.error('Autosave failed:', result.error);
        if (!warnedRef.current) {
          warnedRef.current = true;
          pushToast(`Autosave failed: ${result.error}`, 'error');
        }
      } else {
        warnedRef.current = false;
      }
    }, 15000);
    return () => window.clearInterval(handle);
  }, [data.sequence, data.junoParams, data.rompler808Params, data.mixer, pushToast]);
}
