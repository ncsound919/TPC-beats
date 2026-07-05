# TPC-beats Code Audit Report

**Project:** TPC-beats — Deterministic MPC Sampler  
**Version:** 0.0.0 (Pre-release)  
**Repository:** https://github.com/ncsound919/TPC-beats  
**Audit Date:** July 4, 2026  
**Codebase Size:** ~9,300 lines of TypeScript/React  
**Scope:** Architecture, code quality, security, performance, testing, and best practices

---

## Executive Summary

**TPC-beats** is a sophisticated browser-based music production workstation with professional-grade audio synthesis and sequencing capabilities. The codebase demonstrates:

✅ **Strengths:**
- Well-architected audio layer with proper separation of concerns
- Comprehensive type definitions and interfaces
- Modern tooling stack (React 19, Vite 6, TypeScript)
- Proper secret management and environment configuration
- Clean git practices with appropriate .gitignore

⚠️ **Areas for Improvement:**
- Limited test coverage (smoke tests only)
- Unused dependencies in package.json
- Large component files requiring refactoring
- No error boundaries or error recovery patterns
- localStorage implementation lacks error handling
- Missing performance monitoring

---

## 1. Architecture & Code Organization

### 1.1 Overall Structure ✅ **GOOD**

The project follows a sensible layered architecture:
```
src/
├── audio/           # DSP engines, synths, sequencers
├── components/      # UI wrappers (mostly legacy duplicates)
├── ui/              # Primary React UI components
├── persistence/     # localStorage and state management
└── types.ts         # Shared type definitions
```

**Observations:**
- **Duplication Issue**: The `components/` directory appears to be legacy with similar files in `ui/`. This creates maintenance burden.
  - `components/MPC/` and `ui/sequencer/` contain overlapping functionality
  - `components/Synth/` and `ui/synths/` are duplicated
  - Recommend consolidating to a single `ui/` directory

### 1.2 File Organization by Concern

| Module | Quality | Notes |
|--------|---------|-------|
| `audio/` | ✅ Excellent | Clean DSP engines, good abstraction |
| `components/` | ⚠️ Needs refactoring | Duplicated with `ui/`, should be removed |
| `ui/` | ✅ Good | Primary component layer, consistent structure |
| `persistence/` | ⚠️ Minimal | Very simple, lacks error handling |
| `types.ts` | ✅ Excellent | Comprehensive, well-documented type definitions |

---

## 2. Security Assessment

### 2.1 Secrets & Environment Variables ✅ **SECURE**

**Positive Findings:**
- `.env*` properly added to `.gitignore` (exception: `.env.example`)
- Environment variables documented in `.env.example`
- `GEMINI_API_KEY` handled via environment injection
- Express proxy mentioned for server-side API key handling
- No hardcoded credentials found in source code

**Recommendations:**
```typescript
// src/persistence/LocalProjectStore.ts - Add validation
export const loadProject = (): Project | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    // TODO: Add schema validation with zod/superstruct
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load project from localStorage:', error);
    return null; // Graceful fallback
  }
};
```

### 2.2 XSS & Input Sanitization ⚠️ **VERIFY**

**Status:** No obvious XSS vectors identified, but no evidence of sanitization library usage.

**Check Required:**
- User-uploaded audio file handling
- Sample file drag-and-drop validation
- JSON export/import for malicious payloads

**Recommendations:**
```typescript
// Consider adding zod validation for imported JSON
import { z } from 'zod';

const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(255),
  samples: z.array(/* ... */).max(100), // Prevent DoS
  // ...
});

export const importProject = (json: unknown) => {
  return ProjectSchema.parse(json); // Throws on invalid data
};
```

### 2.3 Content Security Policy ❌ **NOT CONFIGURED**

**Finding:** No CSP headers configured.

**Recommendation:**
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; 
               script-src 'self' 'wasm-unsafe-eval'; 
               style-src 'self' 'unsafe-inline';
               img-src 'self' data:;">
```

---

## 3. Code Quality

### 3.1 TypeScript Configuration ✅ **GOOD**

**Observations:**
```json
{
  "target": "ES2022",
  "strict": false,              // ⚠️ Should enable strict mode
  "skipLibCheck": true,         // ✅ Reasonable for dependencies
  "isolatedModules": true,      // ✅ Good for tool compatibility
  "noEmit": true                // ✅ Correct for development
}
```

**Recommendation:** Enable `strict` mode progressively:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
```

### 3.2 ESLint Configuration ✅ **GOOD**

**Strengths:**
- Modern flat config format
- React Hooks rules enabled
- TypeScript plugin properly configured
- Sensible rule relaxations for DSP code

**Minor Issue:**
```javascript
// eslint.config.js, line 59
'@typescript-eslint/no-explicit-any': 'warn',  // Should be 'error' in strict mode
```

### 3.3 Component Size Analysis ⚠️ **NEEDS REFACTORING**

**App.tsx: 1,024 lines** - Too large
- Contains state management for all subsystems
- Mixes concerns: sequencing, synthesis, UI logic
- Difficult to test

**Recommendation - Extract custom hooks:**
```typescript
// hooks/useSequencer.ts
export function useSequencer(initialSequence: Sequence) {
  const [sequence, setSequence] = useState(initialSequence);
  const [isRecording, setIsRecording] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  
  const recordEvent = useCallback((padId: number, velocity: number) => {
    // ...
  }, [sequence, isRecording]);
  
  return { sequence, setSequence, isRecording, setIsRecording, playhead, recordEvent };
}

// hooks/useSynthParams.ts
export function useSynthParams(synthType: 'juno' | 'dx7') {
  const [params, setParams] = useState(getDefaultParams(synthType));
  // ...
}

// App.tsx - simplified
export default function App() {
  const sequencer = useSequencer(defaultSequence);
  const juno = useSynthParams('juno');
  const dx7 = useSynthParams('dx7');
  // Much cleaner!
}
```

### 3.4 Comment Quality ✅ **EXCELLENT**

The audio layer has excellent documentation:
```typescript
/**
 * High‑quality transient / onset detection for drum & percussion slicing.
 * Uses a fast radix‑2 FFT for spectral flux, adaptive thresholding, and hysteresis.
 */
public static detectTransients(buffer: AudioBuffer, options: ChopOptions = {}): Slice[]
```

---

## 4. Performance Analysis

### 4.1 Audio Engine Optimizations ✅ **EXCELLENT**

**Strengths:**
- **Pitch cache**: Pre-computed semitone→playbackRate lookup (lines 34-44)
- **Velocity curve cache**: Perceptual velocity table cached as Float32Array (lines 48-54)
- **FFT optimization**: Pre-computed twiddle factors and bit-reversal tables
- **Object pooling**: VoicePool reuses audio nodes to avoid GC pauses

### 4.2 Memory Concerns ⚠️ **POTENTIAL ISSUES**

**Issue #1: Unbounded Map growth in AudioEngine**
```typescript
// src/audio/AudioEngine.ts
const PITCH_RATIO_CACHE = new Map<number, number>();
// No maximum size limit; could grow unbounded if pitch values are random
```

**Fix:**
```typescript
class BoundedMap<K, V> extends Map<K, V> {
  constructor(private maxSize = 100) { super(); }
  set(key: K, value: V) {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    return super.set(key, value);
  }
}

const PITCH_RATIO_CACHE = new BoundedMap<number, number>(48); // -24..+24 semitones
```

**Issue #2: localStorage can silently fail**
```typescript
// src/persistence/LocalProjectStore.ts - line 6
export const saveProject = (project: Project) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project)); // ❌ No error handling
};
```

**Fix:**
```typescript
export const saveProject = (project: Project): boolean => {
  try {
    const serialized = JSON.stringify(project);
    
    // Check quota before writing (some browsers)
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      if (usage! + serialized.length > quota!) {
        console.warn('localStorage quota exceeded');
        return false;
      }
    }
    
    localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.code === 22) {
      console.error('QuotaExceededError: localStorage is full');
    }
    return false;
  }
};
```

### 4.3 Audio Buffer Management ✅ **GOOD**

- Proper FFT implementation with windowing (Hann window applied)
- Spectral flux calculation optimized with pre-computed factors
- No unnecessary allocations in hot paths

**Improvement - Consider typed arrays everywhere:**
```typescript
// ✅ Good - already done
const novelty: number[] = new Array(numFrames).fill(0);
const rms: number[] = [];

// Better - use typed arrays for audio data
const novelty = new Float32Array(numFrames);
const rms = new Float32Array(numFrames);
```

---

## 5. Testing & QA

### 5.1 Test Coverage ⚠️ **MINIMAL**

**Current Status:**
- **E2E Tests**: 2 smoke tests (UI mode switching, transport controls)
- **Unit Tests**: None
- **Integration Tests**: None
- **Audio Tests**: None

**File:** `tests/ui.spec.ts` (46 lines total)

**Critical Testing Gaps:**
1. ❌ Audio rendering not tested (biggest risk)
2. ❌ Sequencer timing accuracy not verified
3. ❌ Synth parameter ranges not validated
4. ❌ Export/import round-trip not tested
5. ❌ localStorage persistence not tested

### 5.2 Recommended Test Suite

```typescript
// tests/audio/chopAgent.spec.ts
import { test, expect } from 'vitest';
import { ChopAgent } from '@/audio/agents/ChopAgent';

test('detectTransients finds drum onsets', async () => {
  // Create synthetic drumbeat with clicks at 0ms, 500ms, 1000ms
  const ctx = new OfflineAudioContext(1, 48000, 48000);
  const buffer = ctx.createBuffer(1, 48000, 48000);
  const data = buffer.getChannelData(0);
  
  // Populate with test signal...
  
  const slices = ChopAgent.detectTransients(buffer);
  expect(slices.length).toBe(3);
  expect(slices.map(s => Math.round(s.start * 1000))).toEqual([0, 500, 1000]);
});

test('assignSlicesToPads maintains order', () => {
  const slices = [
    { id: 's1', start: 0, end: 0.5, gain: 0.8 },
    { id: 's2', start: 0.5, end: 1.0, gain: 0.5 },
  ];
  
  const assigned = ChopAgent.assignSlicesToPads(slices);
  expect(assigned[0].padAssignment).toBeLessThan(assigned[1].padAssignment!);
});
```

### 5.3 CI/CD Pipeline ✅ **GOOD**

**Observations:**
- GitHub Actions properly configured
- Node.js v20 (LTS) specified
- Type checking before build
- Playwright test reporting
- Artifact retention: 7 days (appropriate)

**Improvement needed:**
```yaml
# .github/workflows/ci.yml - Add security scanning
- name: Run security audit
  run: npm audit --production --audit-level=moderate

- name: Check dependencies for vulnerabilities
  run: npx snyk test
```

---

## 6. Dependency Analysis

### 6.1 Package.json Review ✅ **MOSTLY GOOD**

**Total Dependencies: 7 | DevDependencies: 19**

#### ⚠️ Unused Dependency Detected

```json
{
  "@google/genai": "^2.4.0"  // ❌ NOT IMPORTED ANYWHERE
}
```

**Action Required:**
```bash
npm search @google/genai
grep -r "@google/genai" src/  # Returns 0 results
npm uninstall @google/genai
```

If Gemini API is planned for future:
```typescript
// src/config/geminiClient.ts
import { GoogleGenerativeAI } from '@google/genai';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// Mark as "future feature" in README
```

### 6.2 Dependency Versions

| Dependency | Current | Status | Notes |
|---|---|---|---|
| React | 19.0.1 | ✅ Latest | Excellent, new hooks features available |
| TypeScript | ~5.8.2 | ✅ Current | Recent, minor pinning could be stricter |
| Vite | 6.2.3 | ✅ Latest | Modern build tooling |
| Tailwind CSS | 4.1.14 | ✅ Latest | Recently released major version |
| Playwright | 1.61.1 | ✅ Current | Pinned correctly |
| Express | 4.21.2 | ✅ Current | Backend server |

### 6.3 Security Vulnerabilities Check

**Recommendation:** Add `npm audit` to CI:
```yaml
# .github/workflows/ci.yml
- name: Security audit
  run: npm audit --production
```

---

## 7. Best Practices & Standards

### 7.1 TypeScript Best Practices

**Current:**
- ✅ No `any` types (mostly)
- ✅ Comprehensive interfaces
- ✅ Type exports explicit
- ❌ `strict: false` in tsconfig

**Recommendation:** Progressive strict mode migration:

```typescript
// Phase 1: Enable in tsconfig
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true
  }
}

// Phase 2: Fix violations in isolated modules
// Phase 3: Merge back to main
```

### 7.2 React Best Practices ⚠️ **MIXED**

**Good:**
- ✅ Functional components with hooks
- ✅ useCallback for stable function references
- ✅ useMemo for expensive computations
- ✅ Proper dependency arrays

**Concerns:**
- ❌ No Error Boundary components
- ❌ No loading/error states for async operations
- ⚠️ Large component (App.tsx needs splitting)

**Add Error Boundary:**
```typescript
// src/components/ErrorBoundary.tsx
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? (
        <div className="p-4 bg-red-100 text-red-900 rounded">
          <h1>Something went wrong</h1>
          <p>{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage in App.tsx
<ErrorBoundary fallback={(err) => <ErrorScreen error={err} />}>
  <AudioWorkstation />
</ErrorBoundary>
```

### 7.3 Audio Code Quality ✅ **EXCELLENT**

- Proper use of audio nodes
- Routing architecture is clean
- Voice pooling pattern used correctly
- DSP algorithms well-documented

---

## 8. Documentation

### 8.1 README ✅ **COMPREHENSIVE**

The README is excellent:
- Clear feature list with ✅ emojis
- Tech stack table
- Project structure documented
- Getting started instructions
- Environment variables documented
- AI Studio deployment info

### 8.2 Code Comments ✅ **GOOD**

**Strong documentation in:**
- `audio/agents/ChopAgent.ts` - FFT algorithm explained
- `audio/AudioEngine.ts` - Architecture comments
- Audio synth implementations

**Missing documentation:**
- UI component props (no JSDoc)
- Complex state management logic (App.tsx)
- Test setup and expectations

### 8.3 Inline Documentation Recommendation

```typescript
/**
 * Detects transient onsets in an audio buffer using spectral flux + RMS analysis.
 * 
 * @param buffer - AudioBuffer to analyze
 * @param options - Detection options (threshold, minSliceLength, etc.)
 * @returns Array of Slice objects representing detected drum hits
 * 
 * @example
 * const buffer = await loadAudioFile('drums.wav');
 * const slices = ChopAgent.detectTransients(buffer, { threshold: 1.5 });
 * 
 * Performance: O(n log n) where n = buffer.length (due to FFT)
 * Typical latency: ~50ms for 2-minute audio at 44.1kHz
 */
public static detectTransients(buffer: AudioBuffer, options?: ChopOptions): Slice[]
```

---

## 9. Accessibility (A11Y)

### 9.1 Current State ⚠️ **NOT OPTIMIZED**

**Concerns:**
- No semantic HTML (all divs with classes)
- No ARIA labels for complex controls
- Keyboard navigation unclear
- No focus management

**Recommendations:**

```typescript
// src/components/MPC/PadGrid.tsx - Add accessibility
<div role="grid" aria-label="MPC Pad Grid">
  {pads.map((pad) => (
    <button
      key={pad.id}
      role="gridcell"
      aria-label={`Pad ${pad.id + 1}`}
      aria-pressed={activePad === pad.id}
      tabIndex={activePad === pad.id ? 0 : -1}
      onClick={() => playPad(pad.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') playPad(pad.id);
      }}
      className={cn(
        'aspect-square rounded transition-colors',
        activePad === pad.id ? 'ring-2 ring-cyan-400' : ''
      )}
    >
      <span className="sr-only">Pad {pad.id + 1}</span>
    </button>
  ))}
</div>
```

---

## 10. Scaling & Maintainability

### 10.1 Current Scaling Limitations

| Aspect | Current | Limit | Issues |
|---|---|---|---|
| Max samples | Unlimited (localStorage limit ~5MB) | ~50-100 | Memory + UI performance |
| Max slices per sample | Recommended 16 | 1000+ | UI lag |
| Max sequence length | Unlimited | 10+ bars | UI scroll performance |
| Simultaneous voices | 32 | 64+ | CPU dependent |
| Undo/redo history | Limited by memory | 1000+ states | No size limit |

### 10.2 Recommendations for Scale

```typescript
// Add project size limits and warnings
const PROJECT_SIZE_LIMITS = {
  MAX_SAMPLES: 100,
  MAX_SLICES_PER_SAMPLE: 64,
  MAX_SEQUENCE_LENGTH_BARS: 16,
  MAX_HISTORY_STATES: 100,
  MAX_LOCALSTORAGE_MB: 4,
};

// Implement LRU cache for undo history
class UndoRedoStack<T> {
  private history: T[] = [];
  private maxSize = 100;
  
  push(state: T) {
    if (this.history.length >= this.maxSize) {
      this.history.shift(); // Remove oldest
    }
    this.history.push(state);
  }
}
```

---

## 11. Deployment & DevOps

### 11.1 Build Artifacts ✅ **GOOD**

```bash
npm run build  # Produces dist/
```

**Recommendations:**
```json
// package.json - Add deployment scripts
{
  "scripts": {
    "build": "vite build",
    "build:analyze": "vite build && npm run bundle-report",
    "bundle-report": "npx esbuild --metafile=meta.json dist/index.js && npx esbuild-visualizer --metafile meta.json"
  }
}
```

### 11.2 Environment Management ✅ **SECURE**

- `.env.local` properly gitignored
- CI/CD uses secrets injection
- No hardcoded API keys

**Verify:** Check that `APP_URL` is set correctly in CI:
```yaml
# .github/workflows/ci.yml
env:
  APP_URL: https://tpc-beats-demo.example.com
```

---

## 12. Browser Compatibility

### 12.1 Web Audio API Support

**Target Browsers:** Modern ES2022 capable browsers

| Feature | Chrome | Firefox | Safari | Edge |
|---|---|---|---|---|
| Web Audio API | ✅ v14+ | ✅ v25+ | ✅ v14.1+ | ✅ v79+ |
| AudioContext | ✅ Yes | ✅ Yes | ⚠️ webkit prefix | ✅ Yes |
| OfflineAudioContext | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| DynamicsCompressor | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |

**Current Implementation:** ✅ Handles webkit prefix
```typescript
// src/audio/AudioEngine.ts, line 96
this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({...})
```

---

## 13. Summary of Findings

### Critical Issues (Fix Immediately)
1. ❌ **No error handling in localStorage** - Can fail silently
2. ❌ **Unused @google/genai dependency** - Remove or document intent
3. ❌ **No error boundaries** - App crashes on component errors
4. ❌ **Minimal test coverage** - Risk of regressions

### High Priority (Sprint)
1. ⚠️ **Extract custom hooks from App.tsx** - Component is 1024 lines
2. ⚠️ **Add localStorage quota checking** - Prevent data loss
3. ⚠️ **Implement input validation** - Use zod for JSON import
4. ⚠️ **Add security audit to CI** - npm audit --production

### Medium Priority (Next Quarter)
1. ⚠️ **Write unit tests** - Audio engines, synths, sequencer
2. ⚠️ **Enable TypeScript strict mode** - Progressively
3. ⚠️ **Improve accessibility** - ARIA labels, keyboard nav
4. ⚠️ **Add performance monitoring** - Track audio glitches

### Low Priority (Nice-to-have)
1. 💡 **Consolidate components/ and ui/ directories**
2. 💡 **Add CSP headers**
3. 💡 **Implement compression visualization**
4. 💡 **Add dark mode support**

---

## 14. Recommendations by Category

### Security
- [ ] Enable strict TypeScript mode
- [ ] Add input validation with zod
- [ ] Implement Content Security Policy
- [ ] Add npm audit to CI pipeline
- [ ] Implement error handling in localStorage operations

### Quality
- [ ] Extract custom hooks from App.tsx
- [ ] Add Error Boundary components
- [ ] Refactor duplicate code in components/ui
- [ ] Add JSDoc comments to all components
- [ ] Add schema validation for project imports

### Testing
- [ ] Write unit tests for audio engines (target: 80% coverage)
- [ ] Add integration tests for sequencer
- [ ] Add tests for export/import round-trip
- [ ] Add localStorage persistence tests
- [ ] Use Vitest instead of just Playwright

### Performance
- [ ] Implement bounded cache for pitch ratios
- [ ] Add localStorage quota checking
- [ ] Profile audio rendering with DevTools
- [ ] Consider Web Workers for FFT computation
- [ ] Implement virtual scrolling for long sequences

### DevOps
- [ ] Add security scanning (npm audit, Snyk)
- [ ] Set up bundle size monitoring
- [ ] Configure Sentry or error tracking
- [ ] Add performance budgets to build
- [ ] Set up staging environment for AI Studio

---

## 15. Conclusion

**Overall Assessment: 7/10 (Good)**

TPC-beats is a well-engineered music production application with excellent audio layer implementation. The React/TypeScript foundation is solid, and the codebase demonstrates good separation of concerns in the audio domain.

However, the project needs attention in:
- **Testing** (critical gap)
- **Error handling** (especially localStorage)
- **Code organization** (component splitting)
- **Type safety** (enable strict mode)

For a production music tool, these improvements should be prioritized before release. The audio quality and feature set are impressive; the engineering should match that standard.

**Recommended Timeline:**
- **Week 1-2:** Fix critical issues (error handling, test coverage)
- **Week 3-4:** Refactor components, enable strict TypeScript
- **Month 2:** Add comprehensive test suite
- **Month 3:** Performance optimization and monitoring

The codebase shows strong fundamentals and with these improvements will be production-ready.

---

## Appendix: Quick Start for Improvements

### 1. Add error handling to localStorage
```bash
cd src/persistence && cp LocalProjectStore.ts LocalProjectStore.backup.ts
# Apply error handling pattern from Section 4.2
```

### 2. Set up Vitest for unit tests
```bash
npm install -D vitest @vitest/ui jsdom
# Create vitest.config.ts with test configuration
```

### 3. Extract first custom hook
```bash
mkdir -p src/hooks
touch src/hooks/useSequencer.ts
# Move state logic from App.tsx
```

### 4. Enable strict TypeScript
```json
// Incrementally update tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true
  }
}
```

---

**Audit completed by:** Claude Haiku 4.5  
**Contact:** For clarifications on this audit, reference this document's recommendations in order of priority.
