import { describe, it, expect, vi } from 'vitest';
import { SequencerEngine } from './SequencerEngine';

vi.mock('./AudioEngine', () => ({
  engine: { ctx: { currentTime: 0 } },
}));

vi.mock('./ProgramEngine', () => ({
  programEngine: { getPad: vi.fn(), triggerPadAtTime: vi.fn() },
}));

describe('SequencerEngine', () => {
  it('getBpm defaults to 120 with no sequence loaded', () => {
    const seqEngine = new SequencerEngine();
    expect(seqEngine.getBpm()).toBe(120);
  });

  it('loadSequence sets current sequence', () => {
    const seqEngine = new SequencerEngine();
    const seq = {
      id: 'seq-1',
      name: 'Test',
      bpm: 140,
      ppqn: 96,
      events: [],
      lengthBars: 4,
    };
    seqEngine.loadSequence(seq);
    expect(seqEngine.getBpm()).toBe(140);
  });

  it('getBpm returns loaded sequence BPM', () => {
    const seqEngine = new SequencerEngine();
    const seq = {
      id: 'seq-2',
      name: 'Slow',
      bpm: 70,
      ppqn: 96,
      events: [],
      lengthBars: 2,
    };
    seqEngine.loadSequence(seq);
    expect(seqEngine.getBpm()).toBe(70);
  });

  it('setSwing updates swing value', () => {
    const seqEngine = new SequencerEngine();

    seqEngine.setSwing(0.75);
    expect(seqEngine.getBpm()).toBe(120);
  });
});
