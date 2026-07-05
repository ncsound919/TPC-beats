import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ManualChop } from './ManualChop';

describe('ManualChop', () => {
  const defaultProps = {
    isPlaying: false,
    currentTime: 0,
    sampleDuration: 10,
    chopPoints: [],
    onAddChopPoint: vi.fn(),
    onRemoveChopPoint: vi.fn(),
    onClearChopPoints: vi.fn(),
    onApplyChops: vi.fn(),
  };

  it('renders Manual Chop title', () => {
    render(<ManualChop {...defaultProps} />);
    expect(screen.getByText('Manual Chop')).toBeInTheDocument();
  });

  it('shows Arm button by default', () => {
    render(<ManualChop {...defaultProps} />);
    expect(screen.getByText('Arm')).toBeInTheDocument();
  });

  it('clicking Arm shows ARMED with animate-pulse class', () => {
    render(<ManualChop {...defaultProps} />);
    fireEvent.click(screen.getByText('Arm'));
    const armedBtn = screen.getByText('ARMED');
    expect(armedBtn).toBeInTheDocument();
    expect(armedBtn.className).toContain('animate-pulse');
  });

  it('shows instruction text when armed but not playing', () => {
    render(<ManualChop {...defaultProps} />);
    fireEvent.click(screen.getByText('Arm'));
    expect(screen.getByText('Start playback to begin chopping')).toBeInTheDocument();
  });

  it('hides instruction text when playing', () => {
    render(<ManualChop {...defaultProps} isPlaying={true} />);
    fireEvent.click(screen.getByText('Arm'));
    expect(screen.queryByText('Start playback to begin chopping')).not.toBeInTheDocument();
  });

  it('renders chop point markers as violet bars in waveform overview', () => {
    const { container } = render(
      <ManualChop {...defaultProps} chopPoints={[1.5, 3.2, 5.8]} />
    );
    const violetBars = container.querySelectorAll('.bg-violet-500');
    expect(violetBars.length).toBe(3);
  });

  it('lists chop points with timing and interval durations', () => {
    const chopPoints = [1.5, 3.2, 5.8];
    render(<ManualChop {...defaultProps} chopPoints={chopPoints} />);
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('1.70s')).toBeInTheDocument();
    expect(screen.getByText('2.60s')).toBeInTheDocument();
  });

  it('Apply Chops disabled with fewer than 2 points', () => {
    render(<ManualChop {...defaultProps} chopPoints={[1.0]} />);
    expect(screen.getByText('Apply Chops')).toBeDisabled();
  });

  it('Apply Chops enabled with 2+ points', () => {
    render(<ManualChop {...defaultProps} chopPoints={[1.0, 2.5]} />);
    expect(screen.getByText('Apply Chops')).toBeEnabled();
  });

  it('Clear button disabled when no points', () => {
    render(<ManualChop {...defaultProps} chopPoints={[]} />);
    expect(screen.getByText('Clear')).toBeDisabled();
  });

  it('Clear button enabled when points exist', () => {
    render(<ManualChop {...defaultProps} chopPoints={[1.0, 2.5]} />);
    expect(screen.getByText('Clear')).toBeEnabled();
  });

  it('clicking Clear calls onClearChopPoints', () => {
    const onClearChopPoints = vi.fn();
    render(
      <ManualChop {...defaultProps} chopPoints={[1.0, 2.5]} onClearChopPoints={onClearChopPoints} />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onClearChopPoints).toHaveBeenCalledOnce();
  });

  it('clicking a point marker calls onRemoveChopPoint', () => {
    const onRemoveChopPoint = vi.fn();
    const { container } = render(
      <ManualChop {...defaultProps} chopPoints={[1.5, 3.2]} onRemoveChopPoint={onRemoveChopPoint} />
    );
    const markers = container.querySelectorAll('.bg-violet-500');
    fireEvent.click(markers[0]);
    expect(onRemoveChopPoint).toHaveBeenCalledWith(0);
  });
});
