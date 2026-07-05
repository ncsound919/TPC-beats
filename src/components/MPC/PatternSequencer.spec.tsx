import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PatternSequencer } from './PatternSequencer';
import { Sequence, PatternArrangement } from '../../types';

const mockSeq1: Sequence = {
  id: 'seq-1', name: 'Pattern A', bpm: 140, ppqn: 96, events: [], lengthBars: 4,
};

const mockSeq2: Sequence = {
  id: 'seq-2', name: 'Pattern B', bpm: 140, ppqn: 96,
  events: [{ timestampPPQN: 0, padId: 0, velocity: 100 }], lengthBars: 8,
};

const defaultArrangement: PatternArrangement = { clips: [] };

describe('PatternSequencer', () => {
  const defaultProps = {
    sequences: [mockSeq1, mockSeq2],
    activeSequenceId: null,
    arrangement: defaultArrangement,
    onSelectSequence: vi.fn(),
    onCreateSequence: vi.fn(),
    onDeleteSequence: vi.fn(),
    onRenameSequence: vi.fn(),
    onAddClip: vi.fn(),
    onRemoveClip: vi.fn(),
    onToggleClipMute: vi.fn(),
    totalBars: 4,
  };

  it('shows Patterns title', () => {
    render(<PatternSequencer {...defaultProps} />);
    expect(screen.getByText('Patterns')).toBeInTheDocument();
  });

  it('shows + New button and input field', () => {
    render(<PatternSequencer {...defaultProps} />);
    expect(screen.getByText('+ New')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Pattern name...')).toBeInTheDocument();
  });

  it('lists sequences with names and event counts', () => {
    render(<PatternSequencer {...defaultProps} />);
    expect(screen.getByText('Pattern A')).toBeInTheDocument();
    expect(screen.getByText('Pattern B')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
  });

  it('active sequence has violet highlight', () => {
    const { container } = render(
      <PatternSequencer {...defaultProps} activeSequenceId="seq-1" />
    );
    const activeEl = container.querySelector('.bg-violet-900\\/30');
    expect(activeEl).toBeInTheDocument();
    expect(activeEl?.textContent).toContain('Pattern A');
  });

  it('clicking sequence calls onSelectSequence', () => {
    const onSelectSequence = vi.fn();
    render(<PatternSequencer {...defaultProps} onSelectSequence={onSelectSequence} />);
    fireEvent.click(screen.getByText('Pattern A'));
    expect(onSelectSequence).toHaveBeenCalledWith('seq-1');
  });

  it('typing name and pressing Enter calls onCreateSequence', () => {
    const onCreateSequence = vi.fn();
    render(<PatternSequencer {...defaultProps} onCreateSequence={onCreateSequence} />);
    const input = screen.getByPlaceholderText('Pattern name...');
    fireEvent.change(input, { target: { value: 'New Pattern' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCreateSequence).toHaveBeenCalledWith('New Pattern');
  });

  it('double-clicking name enters rename mode', () => {
    render(<PatternSequencer {...defaultProps} />);
    fireEvent.doubleClick(screen.getByText('Pattern A'));
    const renameInput = screen.getByDisplayValue('Pattern A');
    expect(renameInput).toBeInTheDocument();
  });

  it('arrangement clips show sequence name and position', () => {
    const arrangement: PatternArrangement = {
      clips: [
        { id: 'clip-1', sequenceId: 'seq-1', startBar: 0, lengthBars: 4, muted: false, repeats: 1 },
      ],
    };
    render(<PatternSequencer {...defaultProps} arrangement={arrangement} />);
    const allPatternA = screen.getAllByText('Pattern A');
    expect(allPatternA.length).toBe(2);
  });

  it('muted clips have opacity-40 class', () => {
    const arrangement: PatternArrangement = {
      clips: [
        { id: 'clip-1', sequenceId: 'seq-1', startBar: 0, lengthBars: 4, muted: true, repeats: 1 },
      ],
    };
    const { container } = render(
      <PatternSequencer {...defaultProps} arrangement={arrangement} />
    );
    const clipEl = container.querySelector('.opacity-40');
    expect(clipEl).toBeInTheDocument();
  });
});
