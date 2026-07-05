import { useRef, useCallback } from 'react';
import { Sequence } from '../types';
import { programEngine } from '../audio/ProgramEngine';

interface HistorySnapshot {
  sequence: Sequence;
  programJSON: string;
}

export function useHistory(sequence: Sequence) {
  const undoStack = useRef<HistorySnapshot[]>([]);
  const redoStack = useRef<HistorySnapshot[]>([]);
  const suppressNextSnapshot = useRef(false);

  const snapshot = useCallback((): HistorySnapshot => ({
    sequence: JSON.parse(JSON.stringify(sequence)),
    programJSON: JSON.stringify(programEngine.program),
  }), [sequence]);

  const pushHistory = useCallback(() => {
    if (suppressNextSnapshot.current) {
      suppressNextSnapshot.current = false;
      return;
    }
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, [snapshot]);

  const applySnapshot = useCallback((snap: HistorySnapshot, setSequence: (seq: Sequence) => void) => {
    suppressNextSnapshot.current = true;
    setSequence(snap.sequence);
    try {
      const parsedProgram = JSON.parse(snap.programJSON);
      programEngine.program = parsedProgram;
    } catch (e) {
      console.error('Failed to restore program snapshot', e);
    }
  }, []);

  const undo = useCallback((setSequence: (seq: Sequence) => void, pushToast: (msg: string, tone?: 'info' | 'success' | 'error') => void) => {
    const prev = undoStack.current.pop();
    if (!prev) { pushToast('Nothing to undo', 'info'); return; }
    redoStack.current.push(snapshot());
    applySnapshot(prev, setSequence);
    pushToast('Undid last change', 'info');
  }, [snapshot, applySnapshot]);

  const redo = useCallback((setSequence: (seq: Sequence) => void, pushToast: (msg: string, tone?: 'info' | 'success' | 'error') => void) => {
    const next = redoStack.current.pop();
    if (!next) { pushToast('Nothing to redo', 'info'); return; }
    undoStack.current.push(snapshot());
    applySnapshot(next, setSequence);
    pushToast('Redid change', 'info');
  }, [snapshot, applySnapshot]);

  return { pushHistory, undo, redo };
}
