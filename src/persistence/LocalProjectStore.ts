import {
  Program,
  Sequence,
  JunoParams,
  ExtendedRomplerParams,
} from '../types';

const STORAGE_KEY = 'hybrid_agent_autosave_v1';

/** Per-pad mixer channel state, mirrors the MixerChannel shape in App.tsx. */
interface MixerChannelState {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

/**
 * Shape actually persisted by the app's autosave / restore flow.
 * Keep this in sync with the object built in App.tsx's autosave effect.
 *
 * Note: `mixer` here is the per-pad mixer channel map (App.tsx's `mixer`
 * state), not the master bus settings (`masterMixer` / MasterMixerSettings).
 * The master mixer (bus volumes, compressor/EQ/limiter/reverb chain) is
 * currently NOT included in autosave — see audit notes.
 */
export interface AutosavePayload {
  sequence: Sequence;
  program: Program;
  junoParams: JunoParams;
  rompler808Params: ExtendedRomplerParams;
  mixer: Record<number, MixerChannelState>;
  savedAt: number;
}

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Checks whether localStorage can actually be written to. Covers private
 * browsing modes (Safari throws on setItem) and environments where it's
 * disabled entirely.
 */
function isLocalStorageAvailable(): boolean {
  try {
    const testKey = '__tpc_beats_storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Minimal structural check that the parsed JSON actually looks like an
 * autosave payload before we hand it back to the app to hydrate state.
 * This is intentionally loose (the synth/rompler param shapes are large
 * and evolve often) — it just guards against obviously corrupted data.
 */
function isValidAutosavePayload(data: unknown): data is AutosavePayload {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  if (!obj.sequence || typeof obj.sequence !== 'object') return false;
  const seq = obj.sequence as Record<string, unknown>;
  if (!Array.isArray(seq.events)) return false;
  if (typeof seq.bpm !== 'number' || !Number.isFinite(seq.bpm)) return false;

  if (!obj.program || typeof obj.program !== 'object') return false;
  if (!obj.junoParams || typeof obj.junoParams !== 'object') return false;
  if (!obj.rompler808Params || typeof obj.rompler808Params !== 'object') return false;
  if (!obj.mixer || typeof obj.mixer !== 'object') return false;

  return true;
}

function describeStorageError(error: unknown): string {
  if (error instanceof DOMException) {
    // QuotaExceededError code varies by browser (22 in Chrome/Firefox, 1014 in
    // older Firefox with a different name); checking the name is more portable.
    if (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    ) {
      return 'Storage quota exceeded. Try clearing old samples or exporting and removing unused projects.';
    }
    if (error.name === 'SecurityError') {
      return 'Browser storage is blocked (private browsing or a security policy).';
    }
    return `Storage error: ${error.message}`;
  }
  if (error instanceof SyntaxError) {
    return 'Saved data is corrupted and could not be parsed.';
  }
  return `Unexpected storage error: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Safely persist the autosave payload to localStorage.
 * Never throws — failures are reported via the returned result so callers
 * can surface them (e.g. via a toast) instead of losing data silently.
 */
export const saveProject = (payload: AutosavePayload): StorageResult<void> => {
  if (!isLocalStorageAvailable()) {
    return {
      success: false,
      error: 'Local storage is not available (private browsing or disabled).',
    };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch (error) {
    return {
      success: false,
      error: `Could not serialize project: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    return { success: true };
  } catch (error) {
    return { success: false, error: describeStorageError(error) };
  }
};

/**
 * Safely load the autosave payload from localStorage.
 * Never throws — malformed/missing data comes back as a failed result
 * with a human-readable reason rather than an uncaught exception.
 */
export const loadProject = (): StorageResult<AutosavePayload> => {
  if (!isLocalStorageAvailable()) {
    return {
      success: false,
      error: 'Local storage is not available (private browsing or disabled).',
    };
  }

  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    return { success: false, error: describeStorageError(error) };
  }

  if (!raw) {
    return { success: false, error: 'No autosave found.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Autosave data is corrupted and could not be read.' };
  }

  if (!isValidAutosavePayload(parsed)) {
    return { success: false, error: 'Autosave data is in an unexpected format.' };
  }

  return { success: true, data: parsed };
};

/** Clears the stored autosave (e.g. for a "reset project" action). */
export const deleteProject = (): StorageResult<void> => {
  if (!isLocalStorageAvailable()) {
    return {
      success: false,
      error: 'Local storage is not available (private browsing or disabled).',
    };
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
    return { success: true };
  } catch (error) {
    return { success: false, error: describeStorageError(error) };
  }
};

/** Approximate size in bytes of the currently stored autosave, or 0 if none. */
export const getProjectSize = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Blob([raw]).size : 0;
  } catch {
    return 0;
  }
};
