import { describe, it, expect } from 'vitest';
import { Transport } from './Transport';

function createMockContext() {
  return { currentTime: 0 } as any;
}

describe('Transport', () => {
  it('constructor sets default BPM to 92', () => {
    const transport = new Transport(createMockContext());
    expect(transport.getBPM()).toBe(92);
  });

  it('getBPM returns 92 initially', () => {
    const transport = new Transport(createMockContext());
    expect(transport.getBPM()).toBe(92);
  });

  it('setBPM(140) changes value to 140', () => {
    const transport = new Transport(createMockContext());
    transport.setBPM(140);
    expect(transport.getBPM()).toBe(140);
  });

  it('setBPM(0) changes to 0 (no clamping)', () => {
    const transport = new Transport(createMockContext());
    transport.setBPM(0);
    expect(transport.getBPM()).toBe(0);
  });
});
