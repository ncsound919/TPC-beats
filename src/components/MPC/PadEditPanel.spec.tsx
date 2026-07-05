import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { PadEditPanel } from './PadEditPanel';
import { Pad } from '../../types';

const defaultPad: Pad = {
  padId: 0, assignedSliceId: null, layers: [],
  velocityCurve: 'linear', muteGroup: null, chokeGroup: null,
  swing: 50, polyphony: 'mono',
};

describe('PadEditPanel', () => {
  it('renders Pad 1 for padId 0', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    expect(screen.getByText('Pad 1')).toBeInTheDocument();
  });

  it('shows Filter checkbox initially unchecked', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    const checkbox = screen.getByLabelText('Filter');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it('shows filter type dropdown with LP/HP/BP/Notch options', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map(o => o.value)).toEqual(['lowpass', 'highpass', 'bandpass', 'notch']);
  });

  it('filter sliders hidden when filter disabled', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    expect(screen.queryByText('Cutoff')).not.toBeInTheDocument();
    expect(screen.queryByText('Resonance')).not.toBeInTheDocument();
    expect(screen.queryByText('Env Amt')).not.toBeInTheDocument();
    expect(screen.queryByText('Key Trk')).not.toBeInTheDocument();
  });

  it('toggling filter ON reveals 4 slider rows', () => {
    function Wrapper() {
      const [pad, setPad] = useState(defaultPad);
      return (
        <PadEditPanel
          pad={pad}
          onUpdate={(updates) => setPad({ ...pad, ...updates })}
        />
      );
    }
    render(<Wrapper />);
    fireEvent.click(screen.getByLabelText('Filter'));
    expect(screen.getByText('Cutoff')).toBeInTheDocument();
    expect(screen.getByText('Resonance')).toBeInTheDocument();
    expect(screen.getByText('Env Amt')).toBeInTheDocument();
    expect(screen.getByText('Key Trk')).toBeInTheDocument();
  });

  it('shows Amp Envelope and Filter Envelope with SVG editor', () => {
    const { container } = render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    expect(screen.getByText('Amp Envelope')).toBeInTheDocument();
    expect(screen.getByText('Filter Envelope')).toBeInTheDocument();
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBe(2);
  });

  it('renders A, D, S, R label text inside envelope SVGs', () => {
    const { container } = render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    const svgText = Array.from(container.querySelectorAll('svg')).map(s => s.textContent).join('');
    expect(svgText).toContain('A');
    expect(svgText).toContain('D');
    expect(svgText).toContain('S');
    expect(svgText).toContain('R');
  });

  it('shows Amp A/D/S/R value labels', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    const ampLabels = screen.getAllByText('A').filter(el => el.tagName === 'SPAN');
    expect(ampLabels.length).toBeGreaterThan(0);
  });

  it('changing filter type calls onUpdate with updated filter', () => {
    const onUpdate = vi.fn();
    render(<PadEditPanel pad={defaultPad} onUpdate={onUpdate} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'notch' } });
    expect(onUpdate).toHaveBeenCalledWith({
      filter: expect.objectContaining({ type: 'notch' }),
    });
  });

  it('shows Swing, Saturation, Pitch sliders', () => {
    render(<PadEditPanel pad={defaultPad} onUpdate={vi.fn()} />);
    expect(screen.getByText('Swing')).toBeInTheDocument();
    expect(screen.getByText('Saturation')).toBeInTheDocument();
    expect(screen.getByText('Pitch')).toBeInTheDocument();
  });

  it('changing swing slider value calls onUpdate with new swing', () => {
    const onUpdate = vi.fn();
    const { container } = render(<PadEditPanel pad={defaultPad} onUpdate={onUpdate} />);
    const sliders = container.querySelectorAll('input[type="range"]');
    fireEvent.change(sliders[0], { target: { value: '75' } });
    expect(onUpdate).toHaveBeenCalledWith({ swing: 75 });
  });
});
