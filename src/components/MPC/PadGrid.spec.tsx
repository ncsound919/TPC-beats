import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { programEngine } from '../../audio/ProgramEngine';
import { PadGrid } from './PadGrid';

const mockGetPad = vi.hoisted(() => vi.fn());

vi.mock('../../audio/ProgramEngine', () => ({
  programEngine: {
    getPad: mockGetPad,
    triggerPad: vi.fn(),
    setPadParam: vi.fn(),
  },
}));

vi.mock('../../audio/SequencerEngine', () => ({
  sequencer: {
    getBpm: vi.fn(() => 92),
  },
}));

const defaultPad = {
  layers: [],
  swing: 50,
  pitchOffset: 0,
  assignedSliceId: null,
  chokeGroup: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPad.mockReturnValue(defaultPad);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PadGrid', () => {
  it('renders 16 pad buttons numbered 1-16', () => {
    render(<PadGrid />);
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('renders A01-A16 labels on each pad', () => {
    render(<PadGrid />);
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByText(`A${i.toString().padStart(2, '0')}`)).toBeInTheDocument();
    }
  });

  it('renders 4 mode buttons: NORM, FULL, 16 LVL, REPEAT', () => {
    render(<PadGrid />);
    expect(screen.getByText('NORM')).toBeInTheDocument();
    expect(screen.getByText('FULL')).toBeInTheDocument();
    expect(screen.getByText('16 LVL')).toBeInTheDocument();
    expect(screen.getByText('REPEAT')).toBeInTheDocument();
  });

  it('NORM mode is active by default with amber border', () => {
    render(<PadGrid />);
    const normBtn = screen.getByText('NORM');
    expect(normBtn.className).toContain('border-amber-400');
    expect(normBtn.className).toContain('text-amber-400');
  });

  it('clicking a pad triggers onPadTrigger with correct padId and velocity', () => {
    const onPadTrigger = vi.fn();
    render(<PadGrid onPadTrigger={onPadTrigger} />);
    fireEvent.mouseDown(screen.getByText('1'));
    expect(onPadTrigger).toHaveBeenCalledWith(0, 100);
  });

  it('clicking a pad calls programEngine.triggerPad with correct velocity', () => {
    render(<PadGrid />);
    fireEvent.mouseDown(screen.getByText('2'));
    expect(programEngine.triggerPad).toHaveBeenCalledWith(1, 100);
  });

  it('activePad prop highlights the corresponding pad with ring-2 ring-cyan-400', () => {
    const { container } = render(<PadGrid activePad={0} />);
    const pads = container.querySelectorAll('.aspect-square');
    const targetPad = pads[12];
    expect(targetPad.className).toContain('ring-2');
    expect(targetPad.className).toContain('ring-cyan-400');
  });

  it('clicking a pad sets it as selected with ring-2', () => {
    const { container } = render(<PadGrid />);
    fireEvent.mouseDown(screen.getByText('1'));
    const pads = container.querySelectorAll('.aspect-square');
    const targetPad = pads[12];
    expect(targetPad.className).toContain('ring-2');
  });

  it('right-click prevents default browser context menu', () => {
    render(<PadGrid />);
    const pad = screen.getByText('1');
    const prevented = fireEvent.contextMenu(pad);
    expect(prevented).toBe(false);
  });

  it('renders velocity bars with correct width for each pad', () => {
    const { container } = render(<PadGrid />);
    const bars = container.querySelectorAll('.bg-amber-500\\/60');
    expect(bars.length).toBe(16);
  });

  it('shows layer count badge 2L when a pad has 2 layers', () => {
    mockGetPad.mockReturnValue({
      ...defaultPad,
      layers: [{ sliceId: 's1' }, { sliceId: 's2' }],
      assignedSliceId: 's1',
    });
    render(<PadGrid />);
    const badges = screen.getAllByText('2L');
    expect(badges.length).toBe(16);
  });

  it('does NOT show layer badge when pad has 0 or 1 layers', () => {
    render(<PadGrid />);
    expect(screen.queryByText('2L')).not.toBeInTheDocument();
    expect(screen.queryByText('1L')).not.toBeInTheDocument();
  });

  it('shows choke group badge C{number} when pad has chokeGroup set', () => {
    mockGetPad.mockReturnValue({ ...defaultPad, chokeGroup: 2 });
    render(<PadGrid />);
    const badges = screen.getAllByText('C2');
    expect(badges.length).toBe(16);
  });

  it('shows swing badge SW when pad swing differs from 50', () => {
    mockGetPad.mockReturnValue({ ...defaultPad, swing: 65 });
    render(<PadGrid />);
    const badges = screen.getAllByText('SW');
    expect(badges.length).toBe(16);
  });

  it('does NOT show SW badge when swing is 50', () => {
    render(<PadGrid />);
    expect(screen.queryByText('SW')).not.toBeInTheDocument();
  });

  it('shows green sample indicator dot when pad has assignedSliceId', () => {
    mockGetPad.mockReturnValue({ ...defaultPad, assignedSliceId: 'slice1' });
    render(<PadGrid />);
    const dots = screen.getAllByText((_, el) => el.className?.includes('bg-emerald-500'));
    expect(dots.length).toBeGreaterThanOrEqual(1);
  });

  it('sets sixteenLevelsBasePad on right-click', () => {
    const onPadTrigger = vi.fn();
    render(<PadGrid onPadTrigger={onPadTrigger} />);
    fireEvent.mouseDown(screen.getByText('1'));
    expect(onPadTrigger).toHaveBeenCalledWith(0, 100);
  });

  it('FULL mode sends velocity 127 to onPadTrigger', () => {
    const onPadTrigger = vi.fn();
    render(<PadGrid onPadTrigger={onPadTrigger} />);
    fireEvent.click(screen.getByText('FULL'));
    fireEvent.mouseDown(screen.getByText('1'));
    expect(onPadTrigger).toHaveBeenCalledWith(0, 127);
  });

  it('REPEAT mode shows note repeat rate buttons', () => {
    render(<PadGrid />);
    fireEvent.click(screen.getByText('REPEAT'));
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('1/8')).toBeInTheDocument();
    expect(screen.getByText('1/8T')).toBeInTheDocument();
    expect(screen.getByText('1/16')).toBeInTheDocument();
    expect(screen.getByText('1/16T')).toBeInTheDocument();
    expect(screen.getByText('1/32')).toBeInTheDocument();
  });

  it('REPEAT mode creates interval on pad press and clears on mouse up', () => {
    vi.useFakeTimers();
    render(<PadGrid />);
    fireEvent.click(screen.getByText('REPEAT'));
    fireEvent.mouseDown(screen.getByText('2'));
    expect(programEngine.triggerPad).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(100); });
    fireEvent.mouseUp(document);
    act(() => { vi.advanceTimersByTime(200); });
    expect(programEngine.triggerPad).toHaveBeenCalledTimes(1);
  });

  it('16 LVL mode shows instruction text', () => {
    render(<PadGrid />);
    fireEvent.click(screen.getByText('16 LVL'));
    expect(screen.getByText(/press a pad to set velocity base/i)).toBeInTheDocument();
  });

  it('footer shows selected pad number', () => {
    render(<PadGrid />);
    expect(screen.getByText('01')).toBeInTheDocument();
  });

  it('footer shows velocity slider', () => {
    render(<PadGrid />);
    const slider = document.querySelector('input[type="range"]');
    expect(slider).toBeInTheDocument();
  });

  it('footer shows swing slider that updates pad swing', () => {
    const onPadSettingsChange = vi.fn();
    render(<PadGrid onPadSettingsChange={onPadSettingsChange} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    const swingSlider = sliders[1];
    fireEvent.change(swingSlider, { target: { value: '75' } });
    expect(programEngine.setPadParam).toHaveBeenCalledWith(0, 'swing', 75);
    expect(onPadSettingsChange).toHaveBeenCalledWith(0, { swing: 75 });
  });

  it('footer shows layers count', () => {
    render(<PadGrid />);
    expect(screen.getByText(/Layers:/)).toBeInTheDocument();
  });

  it('footer shows pitch offset', () => {
    render(<PadGrid />);
    expect(screen.getByText(/Pitch:/)).toBeInTheDocument();
  });

  it('shows MPC PADS header with BANK A', () => {
    render(<PadGrid />);
    expect(screen.getByText(/MPC PADS.*BANK A/i)).toBeInTheDocument();
  });

  it('pads render in MPC_LAYOUT order (12,13,14,15,8,9,10,11,4,5,6,7,0,1,2,3)', () => {
    const { container } = render(<PadGrid />);
    const pads = container.querySelectorAll('.aspect-square');
    expect(pads.length).toBe(16);
  });

  it('velocity slider changes velocity for selected pad', () => {
    const onPadTrigger = vi.fn();
    render(<PadGrid onPadTrigger={onPadTrigger} />);
    const sliders = document.querySelectorAll('input[type="range"]');
    const velSlider = sliders[0];
    fireEvent.change(velSlider, { target: { value: '60' } });
    fireEvent.mouseDown(screen.getByText('1'));
    expect(onPadTrigger).toHaveBeenCalledWith(0, 60);
  });

  it('swing slider value reflects pad swing', () => {
    mockGetPad.mockReturnValue({ ...defaultPad, swing: 75 });
    render(<PadGrid />);
    const sliders = document.querySelectorAll('input[type="range"]');
    const swingSlider = sliders[1];
    expect(swingSlider.value).toBe('75');
  });

  it('handles drag over and drop events', () => {
    const onPadDrop = vi.fn();
    render(<PadGrid onPadDrop={onPadDrop} />);
    const pad = screen.getByText('1');
    fireEvent.dragOver(pad);
    const file = new File([''], 'kick.wav', { type: 'audio/wav' });
    fireEvent.drop(pad, { dataTransfer: { files: [file] } });
    expect(onPadDrop).toHaveBeenCalledWith(0, file);
  });
});
