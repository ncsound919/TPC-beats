import { expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';

expect.extend(matchers);

// Mock browser APIs that JSDOM doesn't implement
vi.stubGlobal('AudioContext', vi.fn().mockImplementation(() => ({
  createGain: vi.fn().mockReturnValue({ connect: vi.fn(), gain: { value: 0 } }),
  createBufferSource: vi.fn().mockReturnValue({ connect: vi.fn(), start: vi.fn(), stop: vi.fn() }),
  createBiquadFilter: vi.fn().mockReturnValue({ connect: vi.fn(), frequency: { value: 0 }, Q: { value: 0 } }),
  currentTime: 0,
})));

// Clean up after each test
afterEach(() => {
  cleanup();
});
