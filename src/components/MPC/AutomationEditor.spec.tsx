import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationEditor } from './AutomationEditor';
import { AutomationClip, AutomationPoint } from '../../types';

const mockClip: AutomationClip = {
  id: 'clip-1',
  target: 'cutoff',
  points: [
    { timestampPPQN: 0, value: 50 },
    { timestampPPQN: 96, value: 80 },
    { timestampPPQN: 192, value: 30 },
  ],
  min: 0,
  max: 100,
  loop: true,
};

const mockClip2: AutomationClip = {
  id: 'clip-2',
  target: 'volume',
  points: [],
  min: 0,
  max: 127,
  loop: false,
};

const defaultProps = {
  clips: [mockClip, mockClip2],
  activeClipId: null,
  onSelectClip: vi.fn(),
  onAddClip: vi.fn(),
  onRemoveClip: vi.fn(),
  onAddPoint: vi.fn(),
  onRemovePoint: vi.fn(),
  onMovePoint: vi.fn(),
  totalBars: 4,
  ppqn: 96,
  isRecording: false,
  onToggleRecording: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('new-clip-uuid');
});

describe('AutomationEditor', () => {
  it('renders Automation header', () => {
    render(<AutomationEditor {...defaultProps} />);
    expect(screen.getByText('Automation')).toBeInTheDocument();
  });

  it('renders param path input, + Clip button, and Arm button', () => {
    render(<AutomationEditor {...defaultProps} />);
    expect(screen.getByPlaceholderText('param path...')).toBeInTheDocument();
    expect(screen.getByText('+ Clip')).toBeInTheDocument();
    expect(screen.getByText('Arm')).toBeInTheDocument();
  });

  it('shows ● REC with animate-pulse when isRecording is true', () => {
    render(<AutomationEditor {...defaultProps} isRecording={true} />);
    const recBtn = screen.getByText('● REC');
    expect(recBtn).toBeInTheDocument();
    expect(recBtn.className).toContain('animate-pulse');
  });

  it('shows clip selectors for each clip with target name and point count', () => {
    render(<AutomationEditor {...defaultProps} />);
    expect(screen.getByText('cutoff')).toBeInTheDocument();
    expect(screen.getByText('volume')).toBeInTheDocument();
  });

  it('highlights active clip with violet background', () => {
    render(<AutomationEditor {...defaultProps} activeClipId="clip-1" />);
    const clipBtn = screen.getByText('cutoff').closest('button');
    expect(clipBtn?.className).toContain('bg-violet-900');
  });

  it('clicking a clip selector calls onSelectClip', () => {
    const onSelectClip = vi.fn();
    render(<AutomationEditor {...defaultProps} onSelectClip={onSelectClip} />);
    fireEvent.click(screen.getByText('cutoff'));
    expect(onSelectClip).toHaveBeenCalledWith('clip-1');
  });

  it('clicking an already-active clip deselects it (calls onSelectClip(null))', () => {
    const onSelectClip = vi.fn();
    render(<AutomationEditor {...defaultProps} activeClipId="clip-1" onSelectClip={onSelectClip} />);
    fireEvent.click(screen.getByText('cutoff'));
    expect(onSelectClip).toHaveBeenCalledWith(null);
  });

  it('clicking remove button on a clip calls onRemoveClip', () => {
    const onRemoveClip = vi.fn();
    render(<AutomationEditor {...defaultProps} onRemoveClip={onRemoveClip} />);
    const removeButtons = screen.getAllByText('×');
    fireEvent.click(removeButtons[0]);
    expect(onRemoveClip).toHaveBeenCalledWith('clip-1');
  });

  it('shows editor SVG when a clip is selected', () => {
    render(<AutomationEditor {...defaultProps} activeClipId="clip-1" />);
    const svg = document.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('shows "Click to add automation points" text when active clip has no points', () => {
    render(<AutomationEditor {...defaultProps} activeClipId="clip-2" />);
    expect(screen.getByText('Click to add automation points')).toBeInTheDocument();
  });

  it('shows "Select a clip from above to edit" when clips exist but none selected', () => {
    render(<AutomationEditor {...defaultProps} activeClipId={null} />);
    expect(screen.getByText('Select a clip from above to edit')).toBeInTheDocument();
  });

  it('renders polyline connecting points when active clip has 2+ points', () => {
    const { container } = render(<AutomationEditor {...defaultProps} activeClipId="clip-1" />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
  });

  it('renders circle elements for each point in active clip', () => {
    const { container } = render(<AutomationEditor {...defaultProps} activeClipId="clip-1" />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(3);
  });

  it('clicking the Arm button calls onToggleRecording', () => {
    const onToggleRecording = vi.fn();
    render(<AutomationEditor {...defaultProps} onToggleRecording={onToggleRecording} />);
    fireEvent.click(screen.getByText('Arm'));
    expect(onToggleRecording).toHaveBeenCalledOnce();
  });

  it('clicking + Clip creates clip with current target param and calls onAddClip + onSelectClip', () => {
    const onAddClip = vi.fn();
    const onSelectClip = vi.fn();
    render(<AutomationEditor {...defaultProps} onAddClip={onAddClip} onSelectClip={onSelectClip} />);
    fireEvent.click(screen.getByText('+ Clip'));
    expect(onAddClip).toHaveBeenCalledWith({
      id: 'new-clip-uuid',
      target: 'cutoff',
      points: [],
      min: 0,
      max: 100,
      loop: true,
    });
    expect(onSelectClip).toHaveBeenCalledWith('new-clip-uuid');
  });

  it('changing the target param input updates new clip target', () => {
    render(<AutomationEditor {...defaultProps} />);
    const input = screen.getByPlaceholderText('param path...');
    fireEvent.change(input, { target: { value: 'resonance' } });
    expect(input).toHaveValue('resonance');
  });

  it('shows grid bar lines for each beat', () => {
    const { container } = render(<AutomationEditor {...defaultProps} activeClipId="clip-1" totalBars={2} ppqn={96} />);
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(8);
  });

  it('shows 50% dashed reference line', () => {
    const { container } = render(<AutomationEditor {...defaultProps} activeClipId="clip-1" />);
    const dashes = container.querySelector('line[stroke-dasharray="4 2"]');
    expect(dashes).toBeInTheDocument();
  });

  it('clicking on the SVG grid calls onAddPoint with calculated PPQN and value', () => {
    const onAddPoint = vi.fn();
    const { container } = render(
      <AutomationEditor {...defaultProps} activeClipId="clip-1" onAddPoint={onAddPoint} />
    );
    const svg = container.querySelector('svg')!;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, width: 256, height: 120, right: 256, bottom: 120 }),
    });
    fireEvent.click(svg, { clientX: 64, clientY: 60 });
    expect(onAddPoint).toHaveBeenCalledWith('clip-1', {
      timestampPPQN: expect.any(Number),
      value: expect.any(Number),
    });
  });
});
