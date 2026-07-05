import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Transport } from './Transport';

vi.mock('../../audio/SequencerEngine', () => ({
  sequencer: {
    play: vi.fn(),
    stop: vi.fn(),
  },
}));

describe('Transport', () => {
  it('renders play, stop, and record buttons', () => {
    render(<Transport />);
    expect(screen.getByTitle('Play')).toBeInTheDocument();
    expect(screen.getByTitle('Stop')).toBeInTheDocument();
    expect(screen.getByTitle('Arm Record')).toBeInTheDocument();
  });

  it('clicking play calls onPlay and shows PLAYING state', () => {
    const onPlay = vi.fn();
    render(<Transport onPlay={onPlay} />);
    fireEvent.click(screen.getByTitle('Play'));
    expect(onPlay).toHaveBeenCalledOnce();
    expect(screen.getByText(/PLAYING/i)).toBeInTheDocument();
    expect(screen.getByTitle('Pause / Stop')).toBeInTheDocument();
  });

  it('clicking stop calls onStop and resets state to IDLE', () => {
    const onStop = vi.fn();
    render(<Transport onStop={onStop} />);
    fireEvent.click(screen.getByTitle('Play'));
    expect(screen.getByText(/PLAYING/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Stop'));
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.getByText(/IDLE/i)).toBeInTheDocument();
  });

  it('record arm toggles between arm and armed states', () => {
    render(<Transport />);
    fireEvent.click(screen.getByTitle('Arm Record'));
    expect(screen.getByTitle('Record Armed')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Record Armed'));
    expect(screen.getByTitle('Arm Record')).toBeInTheDocument();
  });

  it('after arm, play starts recording; disarming stops recording', () => {
    const onRecordStart = vi.fn();
    const onRecordStop = vi.fn();
    render(<Transport onRecordStart={onRecordStart} onRecordStop={onRecordStop} />);
    fireEvent.click(screen.getByTitle('Arm Record'));
    fireEvent.click(screen.getByTitle('Play'));
    expect(onRecordStart).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTitle('Record Armed'));
    expect(onRecordStop).toHaveBeenCalledOnce();
  });

  it('displays BPM value correctly', () => {
    render(<Transport bpm={120} />);
    expect(screen.getByText(/BPM 120/)).toBeInTheDocument();
  });

  it('displays bar position from props', () => {
    render(<Transport barPosition={8} />);
    expect(screen.getByText(/BAR 8/)).toBeInTheDocument();
  });
});
