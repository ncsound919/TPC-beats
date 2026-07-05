// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useToast } from './useToast';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with an empty toasts array', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it('pushToast adds a toast with default tone info', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('Hello'); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Hello');
    expect(result.current.toasts[0].tone).toBe('info');
    expect(typeof result.current.toasts[0].id).toBe('number');
  });

  it('pushToast accepts a custom tone', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('Error!', 'error'); });
    expect(result.current.toasts[0].tone).toBe('error');
  });

  it('pushToast adds multiple toasts', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('First', 'info'); });
    act(() => { result.current.pushToast('Second', 'success'); });
    act(() => { result.current.pushToast('Third', 'error'); });
    expect(result.current.toasts).toHaveLength(3);
  });

  it('auto-removes a toast after 3200ms', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('Auto dismiss'); });
    expect(result.current.toasts).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(3200); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('only removes the expired toast, not others', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('First', 'info'); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { result.current.pushToast('Second', 'success'); });
    act(() => { vi.advanceTimersByTime(3100); });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Second');
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current.toasts).toHaveLength(0);
  });

  it('uses unique IDs for each toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => { result.current.pushToast('A'); });
    act(() => { result.current.pushToast('B'); });
    const ids = result.current.toasts.map(t => t.id);
    expect(ids[0]).not.toBe(ids[1]);
  });
});
