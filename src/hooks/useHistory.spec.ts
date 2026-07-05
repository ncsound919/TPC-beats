import { describe, it, expect, vi } from 'vitest';

vi.mock('react', () => ({
  useRef: (initial: unknown) => ({ current: initial }),
  useCallback: (fn: unknown) => fn,
}));

vi.mock('../audio/ProgramEngine', () => ({
  programEngine: { program: { id: 'prog-1', name: 'Test Program' } },
}));

import { useHistory } from './useHistory';

function makeSequence(overrides: Record<string, unknown> = {}) {
  return {
    id: 'seq-1',
    name: 'Test Sequence',
    bpm: 120,
    ppqn: 96,
    events: [],
    lengthBars: 4,
    ...overrides,
  };
}

describe('useHistory', () => {
  it('undo with empty stack shows nothing to undo', () => {
    const { undo } = useHistory(makeSequence());
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    undo(setSequence, pushToast);
    expect(pushToast).toHaveBeenCalledWith('Nothing to undo', 'info');
    expect(setSequence).not.toHaveBeenCalled();
  });

  it('redo with empty stack shows nothing to redo', () => {
    const { redo } = useHistory(makeSequence());
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    redo(setSequence, pushToast);
    expect(pushToast).toHaveBeenCalledWith('Nothing to redo', 'info');
    expect(setSequence).not.toHaveBeenCalled();
  });

  it('pushHistory records state enabling undo', () => {
    const { pushHistory, undo } = useHistory(makeSequence());
    pushHistory();
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    undo(setSequence, pushToast);
    expect(setSequence).toHaveBeenCalledTimes(1);
    expect(pushToast).toHaveBeenCalledWith('Undid last change', 'info');
  });

  it('undo reverts to previous state', () => {
    const seq = makeSequence({ name: 'Initial' });
    const { pushHistory, undo } = useHistory(seq);
    pushHistory();
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    undo(setSequence, pushToast);
    expect(setSequence).toHaveBeenCalledWith(expect.objectContaining({ name: 'Initial' }));
  });

  it('redo goes forward after undo', () => {
    const { pushHistory, undo, redo } = useHistory(makeSequence());
    pushHistory();
    undo(vi.fn(), vi.fn());
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    redo(setSequence, pushToast);
    expect(setSequence).toHaveBeenCalledTimes(1);
    expect(pushToast).toHaveBeenCalledWith('Redid change', 'info');
  });

  it('pushState after undo clears redo stack', () => {
    const { pushHistory, undo, redo } = useHistory(makeSequence());
    pushHistory();
    undo(vi.fn(), vi.fn());
    // undo sets suppressNextSnapshot, so first pushHistory after undo is a no-op
    pushHistory();
    // second pushHistory actually runs and clears redoStack
    pushHistory();
    const pushToast = vi.fn();
    redo(vi.fn(), pushToast);
    expect(pushToast).toHaveBeenCalledWith('Nothing to redo', 'info');
  });

  it('limits undo stack to 50 states', () => {
    const { pushHistory, undo } = useHistory(makeSequence());
    for (let i = 0; i < 60; i++) {
      pushHistory();
    }
    const setSequence = vi.fn();
    const pushToast = vi.fn();
    for (let i = 0; i < 50; i++) {
      undo(setSequence, pushToast);
    }
    undo(setSequence, pushToast);
    expect(pushToast).toHaveBeenCalledWith('Nothing to undo', 'info');
  });
});
