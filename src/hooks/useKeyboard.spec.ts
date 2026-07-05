import { describe, it, expect, vi } from 'vitest';

type KeyEvent = {
  code: string;
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  preventDefault: () => void;
  target: { tagName: string };
};

type Actions = {
  togglePlay: () => void;
  undo: () => void;
  redo: () => void;
  save: () => void;
};

function handleKeyDown(e: KeyEvent, actions: Actions): void {
  const target = e.target;
  const isTyping = ['INPUT', 'TEXTAREA'].includes(target?.tagName);
  if (isTyping) return;

  if (e.code === 'Space') {
    e.preventDefault();
    actions.togglePlay();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) actions.redo(); else actions.undo();
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    actions.save();
    return;
  }
}

describe('useKeyboard handler logic', () => {
  it('Spacebar triggers togglePlay and prevents default', () => {
    const preventDefault = vi.fn();
    const togglePlay = vi.fn();
    handleKeyDown(
      { code: 'Space', key: ' ', ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'DIV' } },
      { togglePlay, undo: vi.fn(), redo: vi.fn(), save: vi.fn() },
    );
    expect(togglePlay).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Z triggers undo and prevents default', () => {
    const preventDefault = vi.fn();
    const undo = vi.fn();
    handleKeyDown(
      { code: 'KeyZ', key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'DIV' } },
      { togglePlay: vi.fn(), undo, redo: vi.fn(), save: vi.fn() },
    );
    expect(undo).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z triggers redo and prevents default', () => {
    const preventDefault = vi.fn();
    const redo = vi.fn();
    handleKeyDown(
      { code: 'KeyZ', key: 'z', ctrlKey: true, metaKey: false, shiftKey: true, repeat: false, preventDefault, target: { tagName: 'DIV' } },
      { togglePlay: vi.fn(), undo: vi.fn(), redo, save: vi.fn() },
    );
    expect(redo).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('Meta+Z triggers undo', () => {
    const preventDefault = vi.fn();
    const undo = vi.fn();
    handleKeyDown(
      { code: 'KeyZ', key: 'z', ctrlKey: false, metaKey: true, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'DIV' } },
      { togglePlay: vi.fn(), undo, redo: vi.fn(), save: vi.fn() },
    );
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+S triggers save and prevents default', () => {
    const preventDefault = vi.fn();
    const save = vi.fn();
    handleKeyDown(
      { code: 'KeyS', key: 's', ctrlKey: true, metaKey: false, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'DIV' } },
      { togglePlay: vi.fn(), undo: vi.fn(), redo: vi.fn(), save },
    );
    expect(save).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('ignores Space events in INPUT elements', () => {
    const preventDefault = vi.fn();
    const togglePlay = vi.fn();
    handleKeyDown(
      { code: 'Space', key: ' ', ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'INPUT' } },
      { togglePlay, undo: vi.fn(), redo: vi.fn(), save: vi.fn() },
    );
    expect(togglePlay).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('ignores Space events in TEXTAREA elements', () => {
    const preventDefault = vi.fn();
    const togglePlay = vi.fn();
    handleKeyDown(
      { code: 'Space', key: ' ', ctrlKey: false, metaKey: false, shiftKey: false, repeat: false, preventDefault, target: { tagName: 'TEXTAREA' } },
      { togglePlay, undo: vi.fn(), redo: vi.fn(), save: vi.fn() },
    );
    expect(togglePlay).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
