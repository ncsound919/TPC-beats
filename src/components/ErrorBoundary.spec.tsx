// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ErrorBoundary } from './ErrorBoundary';

const Thrower = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) throw new Error('test error');
  return <div>ok</div>;
};

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>child content</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something crashed/i)).toBeInTheDocument();
    expect(screen.getByText('test error')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('dismiss button resets error state', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something crashed/i)).toBeInTheDocument();
    // Replace the throwing child with safe content before dismissing
    rerender(
      <ErrorBoundary>
        <div>recovered</div>
      </ErrorBoundary>
    );
    expect(screen.getByText(/something crashed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Dismiss'));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('renders fallback UI when error occurs', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Thrower shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something crashed/i)).toBeInTheDocument();
    expect(screen.getByText(/reload app/i)).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
    spy.mockRestore();
  });
});
