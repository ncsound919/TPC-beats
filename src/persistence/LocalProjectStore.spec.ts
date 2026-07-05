import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveProject,
  loadProject,
  deleteProject,
  getProjectSize,
  type AutosavePayload,
} from './LocalProjectStore';

// ── Minimal in-memory localStorage polyfill for the Node test environment ──
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function makePayload(overrides: Partial<AutosavePayload> = {}): AutosavePayload {
  return {
    sequence: {
      id: 'seq-1',
      name: 'Test Sequence',
      bpm: 120,
      ppqn: 96,
      events: [{ timestampPPQN: 0, padId: 0, velocity: 100 }],
      lengthBars: 4,
    },
    program: {
      id: 'prog-1',
      name: 'Test Program',
      bank: 'A',
      pads: [],
      samples: [],
      fxSettings: {} as any,
      mixerSettings: { masterVolume: 1, globalSwing: 0 },
    },
    junoParams: {} as any,
    rompler808Params: {} as any,
    mixer: { 0: { volume: 85, pan: 0, mute: false, solo: false } },
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('LocalProjectStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).localStorage = new MemoryStorage();
  });

  it('round-trips a valid project through save and load', () => {
    const payload = makePayload();
    const saveResult = saveProject(payload);
    expect(saveResult.success).toBe(true);

    const loadResult = loadProject();
    expect(loadResult.success).toBe(true);
    expect(loadResult.data?.sequence.name).toBe('Test Sequence');
    expect(loadResult.data?.sequence.bpm).toBe(120);
  });

  it('reports a clear error when nothing has been saved yet', () => {
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no autosave/i);
  });

  it('recovers gracefully from corrupted (non-JSON) data', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', '{not valid json');
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/corrupted/i);
  });

  it('rejects data that parses but does not look like a project', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', JSON.stringify({ foo: 'bar' }));
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected format/i);
  });

  it('surfaces a quota-exceeded error instead of throwing', () => {
    const realSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      // Let the internal availability probe (a throwaway test key) succeed,
      // but reject the actual autosave write to simulate a full quota.
      if (key === 'hybrid_agent_autosave_v1') {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      realSetItem(key, value);
    });

    const result = saveProject(makePayload());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/quota/i);
  });

  it('reports unavailability (e.g. private browsing) without throwing', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });

    const result = saveProject(makePayload());
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('deletes a stored project', () => {
    saveProject(makePayload());
    expect(loadProject().success).toBe(true);

    const del = deleteProject();
    expect(del.success).toBe(true);
    expect(loadProject().success).toBe(false);
  });

  it('reports approximate stored size in bytes', () => {
    expect(getProjectSize()).toBe(0);
    saveProject(makePayload());
    expect(getProjectSize()).toBeGreaterThan(0);
  });

  it('returns error when JSON serialization fails in saveProject', () => {
    const circular: Record<string, unknown> = { self: null as unknown };
    circular.self = circular;
    const result = saveProject(circular as unknown as AutosavePayload);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/serialize/i);
  });

  it('returns error when localStorage.getItem throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns error when localStorage.removeItem throws in deleteProject', () => {
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError');
    });
    const result = deleteProject();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('getProjectSize returns 0 when localStorage.getItem throws', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('fail');
    });
    expect(getProjectSize()).toBe(0);
  });

  it('isValidAutosavePayload rejects null data', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', JSON.stringify(null));
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected format/i);
  });

  it('isValidAutosavePayload rejects data missing sequence', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', JSON.stringify({ program: {}, junoParams: {}, rompler808Params: {}, mixer: {} }));
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected format/i);
  });

  it('isValidAutosavePayload rejects sequence missing events array', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', JSON.stringify({
      sequence: { bpm: 120 }, program: {}, junoParams: {}, rompler808Params: {}, mixer: {},
    }));
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected format/i);
  });

  it('isValidAutosavePayload rejects sequence with non-numeric bpm', () => {
    localStorage.setItem('hybrid_agent_autosave_v1', JSON.stringify({
      sequence: { events: [], bpm: 'abc' }, program: {}, junoParams: {}, rompler808Params: {}, mixer: {},
    }));
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected format/i);
  });

  it('describeStorageError handles SyntaxError for corrupted data', () => {
    // Force a scenario where JSON.parse would throw SyntaxError
    // (already covered by "recovers gracefully from corrupted" test above)
    // This test verifies the SyntaxError branch directly.
    localStorage.setItem('hybrid_agent_autosave_v1', '{broken');
    const result = loadProject();
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/corrupted/i);
  });

  it('describeStorageError handles generic Error', () => {
    const realSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'hybrid_agent_autosave_v1') {
        throw new Error('Something unexpected');
      }
      realSetItem(key, value);
    });
    const result = saveProject(makePayload());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unexpected storage error/i);
  });
});
