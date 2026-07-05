// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useDragDrop } from './useDragDrop';

function createFileDragEvent(type: string, file?: File): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const dt = { types: file ? ['Files'] : [], files: file ? [file] : [] };
  Object.defineProperty(ev, 'dataTransfer', { value: dt, writable: false });
  return ev;
}

describe('useDragDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with dragActive false', () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    expect(result.current.dragActive).toBe(false);
  });

  it('sets dragActive true on dragenter with Files', () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    act(() => { window.dispatchEvent(createFileDragEvent('dragenter', new File([''], 'x.wav'))); });
    expect(result.current.dragActive).toBe(true);
  });

  it('ignores dragenter when dataTransfer does not include Files', () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    act(() => { window.dispatchEvent(createFileDragEvent('dragenter')); });
    expect(result.current.dragActive).toBe(false);
  });

  it('resets dragActive on dragleave when counter reaches zero', () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    act(() => { window.dispatchEvent(createFileDragEvent('dragenter', new File([''], 'x.wav'))); });
    expect(result.current.dragActive).toBe(true);
    act(() => { window.dispatchEvent(createFileDragEvent('dragleave')); });
    expect(result.current.dragActive).toBe(false);
  });

  it('prevents default on dragover', () => {
    renderHook(() => useDragDrop(vi.fn()));
    const ev = new Event('dragover', { cancelable: true, bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { types: [] } });
    const preventDefault = vi.spyOn(ev, 'preventDefault');
    window.dispatchEvent(ev);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('calls onFileDrop with the file on drop and resets dragActive', async () => {
    const onFileDrop = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useDragDrop(onFileDrop));
    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });

    act(() => { window.dispatchEvent(createFileDragEvent('dragenter', file)); });
    expect(result.current.dragActive).toBe(true);

    await act(async () => {
      window.dispatchEvent(createFileDragEvent('drop', file));
    });

    expect(onFileDrop).toHaveBeenCalledWith(file);
    expect(result.current.dragActive).toBe(false);
  });

  it('does not call onFileDrop if no file in drop event', async () => {
    const onFileDrop = vi.fn();
    renderHook(() => useDragDrop(onFileDrop));
    await act(async () => {
      window.dispatchEvent(createFileDragEvent('drop'));
    });
    expect(onFileDrop).not.toHaveBeenCalled();
  });

  it('uses nested dragenter/dragleave correctly (counter)', () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    act(() => { window.dispatchEvent(createFileDragEvent('dragenter', new File([''], 'x.wav'))); });
    act(() => { window.dispatchEvent(createFileDragEvent('dragenter', new File([''], 'x.wav'))); });
    expect(result.current.dragActive).toBe(true);
    act(() => { window.dispatchEvent(createFileDragEvent('dragleave')); });
    expect(result.current.dragActive).toBe(true);
    act(() => { window.dispatchEvent(createFileDragEvent('dragleave')); });
    expect(result.current.dragActive).toBe(false);
  });

  it('cleans up event listeners on unmount', () => {
    const onFileDrop = vi.fn();
    const { unmount } = renderHook(() => useDragDrop(onFileDrop));
    unmount();
    window.dispatchEvent(createFileDragEvent('drop', new File(['x'], 'x.wav')));
    expect(onFileDrop).not.toHaveBeenCalled();
  });
});
