import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard. Renders a recovery screen instead of an unmounted
 * white page when a component throws during render.
 *
 * Note: this does NOT catch errors from the Web Audio graph itself (those
 * happen outside React's render cycle, e.g. inside AudioContext callbacks) —
 * only errors thrown while rendering, in lifecycle methods, or in
 * constructors of the component tree below it.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleDismiss = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-screen w-full bg-[#080808] text-neutral-300 font-sans flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-[#121212] border border-neutral-800 rounded-lg shadow-2xl p-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-red-500 text-xl leading-none">⚠</span>
            <h1 className="text-sm font-bold uppercase tracking-widest text-red-400">
              Something crashed
            </h1>
          </div>
          <p className="text-xs text-neutral-500 mb-4">
            The interface hit an unexpected error and stopped rendering. Your last
            autosave is still on disk — reloading will restore it.
          </p>

          <div className="bg-black border border-neutral-800 rounded px-3 py-2 mb-4">
            <p className="font-mono text-xs text-red-300 break-words">
              {error.message || 'Unknown error'}
            </p>
            {error.stack && (
              <details className="mt-2">
                <summary className="text-[10px] uppercase tracking-widest text-neutral-600 cursor-pointer hover:text-neutral-400">
                  Stack trace
                </summary>
                <pre className="mt-2 text-[10px] leading-relaxed text-neutral-600 overflow-auto max-h-40 whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={this.handleReload}
              className="flex-1 px-4 py-2 rounded border border-cyan-800/50 bg-cyan-950/50 text-cyan-400 text-xs font-bold uppercase tracking-widest hover:bg-cyan-950/80 transition-colors"
            >
              Reload App
            </button>
            <button
              onClick={this.handleDismiss}
              className="px-4 py-2 rounded border border-neutral-800 text-neutral-500 text-xs font-bold uppercase tracking-widest hover:text-neutral-300 hover:border-neutral-700 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }
}
