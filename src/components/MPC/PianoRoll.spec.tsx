import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PianoRoll, PianoRollNote } from './PianoRoll';

function createNote(overrides: Partial<PianoRollNote> = {}): PianoRollNote {
  return {
    id: 'note-1', pitch: 60, startTime: 0, duration: 0.25, velocity: 100, padId: 0,
    ...overrides,
  };
}

describe('PianoRoll', () => {
  const defaultProps = {
    notes: [],
    onAddNote: vi.fn(),
    onRemoveNote: vi.fn(),
    onUpdateNote: vi.fn(),
    selectedPadId: 0,
    ghostNotes: [],
  };

  it('renders Piano Roll title', () => {
    render(<PianoRoll {...defaultProps} />);
    expect(screen.getByText('Piano Roll')).toBeInTheDocument();
  });

  it('shows scale info text when scaleNotes provided', () => {
    render(
      <PianoRoll {...defaultProps} scaleNotes={[0, 2, 4, 5, 7, 9, 11]} rootNote={0} />
    );
    expect(screen.getByText('Scale: C 7 notes')).toBeInTheDocument();
  });

  it('shows note count', () => {
    const notes = [createNote(), createNote({ id: 'note-2', pitch: 64, startTime: 1 })];
    render(<PianoRoll {...defaultProps} notes={notes} />);
    expect(screen.getByText('2 notes')).toBeInTheDocument();
  });

  it('ghost notes render with dim fill', () => {
    const ghostNotes = [
      { id: 'ghost-1', pitch: 64, startTime: 1, duration: 0.25, velocity: 80, padId: 1 },
    ];
    const { container } = render(
      <PianoRoll {...defaultProps} ghostNotes={ghostNotes} />
    );
    const rects = container.querySelectorAll('svg rect');
    const ghostRect = Array.from(rects).find(
      (r) => r.getAttribute('fill') === 'rgba(113, 113, 122, 0.2)'
    );
    expect(ghostRect).toBeTruthy();
  });

  it('clicking grid calls onAddNote with correct pitch and snapped time', () => {
    const onAddNote = vi.fn();
    const { container } = render(
      <PianoRoll {...defaultProps} onAddNote={onAddNote} />
    );
    const svg = container.querySelector('svg')!;
    fireEvent.mouseDown(svg, { clientX: 0, clientY: 0, button: 0 });
    expect(onAddNote).toHaveBeenCalledWith({
      pitch: 72,
      startTime: 0,
      duration: 0.25,
      velocity: 100,
      padId: 0,
    });
  });

  it('notes render with velocity bar', () => {
    const notes = [createNote()];
    const { container } = render(<PianoRoll {...defaultProps} notes={notes} />);
    const svg = container.querySelector('svg');
    expect(svg?.innerHTML).toContain('a78bfa');
  });

  it('renders keyboard with note names C2 to C5', () => {
    const { container } = render(<PianoRoll {...defaultProps} />);
    const keyboard = container.querySelector('.bg-zinc-950');
    expect(keyboard?.textContent).toContain('C2');
    expect(keyboard?.textContent).toContain('C#2');
    expect(keyboard?.textContent).toContain('D2');
    expect(keyboard?.textContent).toContain('C5');
  });
});
