// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../audio/ProgramEngine', () => ({
  programEngine: { triggerPad: vi.fn() },
}));

import { useKeyboard } from './useKeyboard';
import { programEngine } from '../audio/ProgramEngine';

function createActions(overrides: Record<string, unknown> = {}) {
  return {
    togglePlay: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    save: vi.fn(),
    mixer: {},
    ...overrides,
  };
}

function fireKey(attrs: Partial<KeyboardEvent> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...attrs }));
}

describe('useKeyboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles Space to togglePlay and prevent default', () => {
    const actions = createActions();
    const ev = new KeyboardEvent('keydown', { code: 'Space', key: ' ', cancelable: true });
    const preventDefault = vi.spyOn(ev, 'preventDefault');

    renderHook(() => useKeyboard(actions));
    window.dispatchEvent(ev);

    expect(actions.togglePlay).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('handles Ctrl+Z for undo', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ code: 'KeyZ', key: 'z', ctrlKey: true });
    expect(actions.undo).toHaveBeenCalledTimes(1);
    expect(actions.redo).not.toHaveBeenCalled();
  });

  it('handles Ctrl+Shift+Z for redo', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ code: 'KeyZ', key: 'z', ctrlKey: true, shiftKey: true });
    expect(actions.redo).toHaveBeenCalledTimes(1);
    expect(actions.undo).not.toHaveBeenCalled();
  });

  it('handles Meta+Z for undo', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ code: 'KeyZ', key: 'z', metaKey: true });
    expect(actions.undo).toHaveBeenCalledTimes(1);
  });

  it('handles Ctrl+S for save', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ code: 'KeyS', key: 's', ctrlKey: true });
    expect(actions.save).toHaveBeenCalledTimes(1);
  });

  it('triggers pad for mapped key (q -> pad 8)', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ key: 'q' });
    expect(programEngine.triggerPad).toHaveBeenCalledWith(8, 100);
  });

  it('triggers pad with zero velocity when muted', () => {
    const actions = createActions({ mixer: { 8: { mute: true, volume: 80 } } });
    renderHook(() => useKeyboard(actions));
    fireKey({ key: 'q' });
    expect(programEngine.triggerPad).toHaveBeenCalledWith(8, 0);
  });

  it('ignores repeated key presses', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    fireKey({ key: 'q', repeat: true });
    expect(programEngine.triggerPad).not.toHaveBeenCalled();
  });

  it('ignores keystrokes when typing in INPUT', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    document.body.removeChild(input);
    expect(actions.togglePlay).not.toHaveBeenCalled();
  });

  it('ignores keystrokes when typing in TEXTAREA', () => {
    const actions = createActions();
    renderHook(() => useKeyboard(actions));
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    document.body.removeChild(ta);
    expect(actions.togglePlay).not.toHaveBeenCalled();
  });

  it('cleans up event listener on unmount', () => {
    const actions = createActions();
    const { unmount } = renderHook(() => useKeyboard(actions));
    unmount();
    fireKey({ code: 'Space', key: ' ' });
    expect(actions.togglePlay).not.toHaveBeenCalled();
  });
});
