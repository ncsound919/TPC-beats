import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PadLinker } from './PadLinker';
import { Pad } from '../../types';

function createPads(linkOverrides?: Partial<Pad>[]): Pad[] {
  return Array.from({ length: 16 }, (_, i) => ({
    padId: i,
    assignedSliceId: null,
    layers: [],
    velocityCurve: 'linear' as const,
    muteGroup: null,
    chokeGroup: null,
    swing: 50,
    polyphony: 'poly' as const,
    linkedPadIds: [],
    ...linkOverrides?.[i],
  }));
}

describe('PadLinker', () => {
  it('renders 16 numbered pad buttons 1-16', () => {
    render(<PadLinker pads={createPads()} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByText(String(i))).toBeInTheDocument();
    }
  });

  it('clicking a pad shows Linking from Pad X text', () => {
    render(<PadLinker pads={createPads()} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    fireEvent.click(screen.getByText('3'));
    expect(screen.getByText('Linking from Pad 3')).toBeInTheDocument();
  });

  it('clicking same pad cancels selection', () => {
    render(<PadLinker pads={createPads()} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    fireEvent.click(screen.getByText('3'));
    expect(screen.getByText('Linking from Pad 3')).toBeInTheDocument();
    fireEvent.click(screen.getByText('3'));
    expect(screen.queryByText('Linking from Pad 3')).not.toBeInTheDocument();
  });

  it('clicking two different pads links them bidirectionally', () => {
    const onLinkPads = vi.fn();
    const pads = createPads();
    render(<PadLinker pads={pads} onLinkPads={onLinkPads} onUnlinkPad={vi.fn()} />);
    fireEvent.click(screen.getByText('1'));
    fireEvent.click(screen.getByText('2'));
    expect(onLinkPads).toHaveBeenCalledTimes(2);
    expect(onLinkPads).toHaveBeenCalledWith(1, [0]);
    expect(onLinkPads).toHaveBeenCalledWith(0, [1]);
  });

  it('linked pads have violet background class', () => {
    const pads = createPads([{}, { linkedPadIds: [0] }, { linkedPadIds: [0, 2] }]);
    const { container } = render(<PadLinker pads={pads} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons[0].className).not.toContain('bg-violet');
    expect(buttons[1].className).toContain('bg-violet-800');
    expect(buttons[2].className).toContain('bg-violet-800');
  });

  it('linked badges show count', () => {
    const pads = createPads([{}, { linkedPadIds: [0, 2, 3] }]);
    const { container } = render(<PadLinker pads={pads} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    const badges = container.querySelectorAll('.bg-violet-500');
    expect(badges.length).toBe(1);
    expect(badges[0].textContent).toBe('3');
  });

  it('Clear all links appears when links exist', () => {
    const pads = createPads([{}, { linkedPadIds: [0] }]);
    render(<PadLinker pads={pads} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    expect(screen.getByText('Clear all links')).toBeInTheDocument();
  });

  it('Clear all links hidden when no links exist', () => {
    const pads = createPads();
    render(<PadLinker pads={pads} onLinkPads={vi.fn()} onUnlinkPad={vi.fn()} />);
    expect(screen.queryByText('Clear all links')).not.toBeInTheDocument();
  });

  it('clicking Clear calls onUnlinkPad for each linked pad', () => {
    const onUnlinkPad = vi.fn();
    const pads = createPads([{}, { linkedPadIds: [0] }, { linkedPadIds: [0] }]);
    render(<PadLinker pads={pads} onLinkPads={vi.fn()} onUnlinkPad={onUnlinkPad} />);
    fireEvent.click(screen.getByText('Clear all links'));
    expect(onUnlinkPad).toHaveBeenCalledTimes(2);
    expect(onUnlinkPad).toHaveBeenCalledWith(1);
    expect(onUnlinkPad).toHaveBeenCalledWith(2);
  });
});
