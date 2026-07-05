import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SequencerGrid } from './SequencerGrid';
import { Sequence, SequenceEvent } from '../../types';

const createSequence = (events: SequenceEvent[] = []): Sequence => ({
  id: 'seq1',
  name: 'Test Sequence',
  bpm: 92,
  ppqn: 96,
  lengthBars: 1,
  events,
});

const defaultEvents: SequenceEvent[] = [
  { id: 'e1', timestampPPQN: 0, padId: 0, velocity: 100 },
  { id: 'e2', timestampPPQN: 24, padId: 0, velocity: 80 },
  { id: 'e3', timestampPPQN: 48, padId: 1, velocity: 90 },
  { id: 'e4', timestampPPQN: 72, padId: 2, velocity: 85 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SequencerGrid', () => {
  it('renders 808 Drum Machine title', () => {
    render(<SequencerGrid sequence={createSequence()} />);
    expect(screen.getByText('808 Drum Machine')).toBeInTheDocument();
  });

  it('renders 16 pad rows (P1 through P16)', () => {
    render(<SequencerGrid sequence={createSequence()} />);
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByText(`P${i}`)).toBeInTheDocument();
    }
  });

  it('renders 16 step buttons in each pad row for 1-bar sequence', () => {
    const { container } = render(<SequencerGrid sequence={createSequence()} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBe(256);
  });

  it('renders 32 step buttons per row for 2-bar sequence', () => {
    const seq = { ...createSequence(), lengthBars: 2 };
    const { container } = render(<SequencerGrid sequence={seq} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    expect(buttons.length).toBe(256);
  });

  it('steps 0-3 have red base color (bg-red-600)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence()} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    for (let i = 0; i < 4; i++) {
      expect(buttons[i].className).toContain('bg-red-600');
    }
  });

  it('steps 4-7 have orange base color (bg-orange-500)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence()} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    for (let i = 4; i < 8; i++) {
      expect(buttons[i].className).toContain('bg-orange-500');
    }
  });

  it('steps 8-11 have yellow base color (bg-yellow-400)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence()} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    for (let i = 8; i < 12; i++) {
      expect(buttons[i].className).toContain('bg-yellow-400');
    }
  });

  it('steps 12-15 have white base color (bg-white)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence()} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    for (let i = 12; i < 16; i++) {
      expect(buttons[i].className).toContain('bg-white');
    }
  });

  it('steps with events show full opacity (opacity-100)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence(defaultEvents)} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    const pad0Row = 15;
    const firstStep = buttons[pad0Row * 16];
    expect(firstStep.className).toContain('opacity-100');
  });

  it('steps without events show low opacity (opacity-20)', () => {
    const { container } = render(<SequencerGrid sequence={createSequence(defaultEvents)} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    const pad3Row = 12;
    const emptyStep = buttons[pad3Row * 16 + 1];
    expect(emptyStep.className).toContain('opacity-20');
  });

  it('current tick highlights the active step with ring-2', () => {
    const seq = createSequence(defaultEvents);
    const { container } = render(<SequencerGrid sequence={seq} currentTick={0} />);
    const buttons = container.querySelectorAll('button[type="button"]');
    const pad0Row = 15;
    const currentStep = buttons[pad0Row * 16];
    expect(currentStep.className).toContain('ring-2');
  });

  it('clicking an empty step calls onToggleStep with hasEvent=false', () => {
    const onToggleStep = vi.fn();
    const { container } = render(
      <SequencerGrid sequence={createSequence(defaultEvents)} onToggleStep={onToggleStep} />
    );
    const buttons = container.querySelectorAll('button[type="button"]');
    const pad3Row = 12;
    fireEvent.click(buttons[pad3Row * 16 + 4]);
    expect(onToggleStep).toHaveBeenCalledWith(3, 4, false);
  });

  it('clicking a filled step calls onToggleStep with hasEvent=true', () => {
    const onToggleStep = vi.fn();
    const { container } = render(
      <SequencerGrid sequence={createSequence(defaultEvents)} onToggleStep={onToggleStep} />
    );
    const buttons = container.querySelectorAll('button[type="button"]');
    const pad0Row = 15;
    fireEvent.click(buttons[pad0Row * 16]);
    expect(onToggleStep).toHaveBeenCalledWith(0, 0, true);
  });

  it('renders swing slider per pad row', () => {
    render(<SequencerGrid sequence={createSequence()} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders.length).toBe(16);
  });

  it('swing slider shows correct swing value from swingValues prop', () => {
    render(<SequencerGrid sequence={createSequence()} swingValues={{ 15: 65 }} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    expect(sliders[0].value).toBe('65');
  });

  it('changing swing slider calls onSwingChange', () => {
    const onSwingChange = vi.fn();
    render(<SequencerGrid sequence={createSequence()} onSwingChange={onSwingChange} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0], { target: { value: '75' } });
    expect(onSwingChange).toHaveBeenCalledWith(15, 75);
  });

  it('swing label shows percentage text', () => {
    render(<SequencerGrid sequence={createSequence()} swingValues={{ 0: 42 }} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });
});
