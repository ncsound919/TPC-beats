import { useEffect } from 'react';
import { programEngine } from '../audio/ProgramEngine';

const KEY_TO_PAD: Record<string, number> = {
  '1': 12, '2': 13, '3': 14, '4': 15,
  'q': 8, 'w': 9, 'e': 10, 'r': 11,
  'a': 4, 's': 5, 'd': 6, 'f': 7,
  'z': 0, 'x': 1, 'c': 2, 'v': 3,
};

interface KeyboardActions {
  togglePlay: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
  mixer: Record<number, { mute: boolean; volume: number }>;
}

export function useKeyboard({ togglePlay, undo, redo, save, mixer }: KeyboardActions) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = ['INPUT', 'TEXTAREA'].includes(target?.tagName);
      if (isTyping) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
        return;
      }

      const key = e.key.toLowerCase();
      if (key in KEY_TO_PAD && !e.repeat) {
        const padId = KEY_TO_PAD[key];
        programEngine.triggerPad(padId, mixer[padId]?.mute ? 0 : 100);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, undo, redo, save, mixer]);
}
