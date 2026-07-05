// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ADSREditor } from './ADSREditor';

describe('ADSREditor', () => {
  const defaultProps = {
    attack: 0.1,
    decay: 0.3,
    sustain: 0.6,
    release: 0.8,
    onChange: vi.fn(),
  };

  it('renders SVG with envelope path', () => {
    const { container } = render(<ADSREditor {...defaultProps} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('renders A, D, S, R labels', () => {
    render(<ADSREditor {...defaultProps} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('D')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('shows the correct number of draggable handle groups (4)', () => {
    const { container } = render(<ADSREditor {...defaultProps} />);
    const circles = container.querySelectorAll('circle');
    // 4 handle circles + 4 invisible hit areas = 8 circles
    expect(circles.length).toBe(8);
  });

  it('renders optional label', () => {
    render(<ADSREditor {...defaultProps} label="ENV 1" />);
    expect(screen.getByText('ENV 1')).toBeInTheDocument();
  });
});
