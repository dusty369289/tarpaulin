import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps one broken widget from taking down the whole dashboard. */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[widget] ${this.props.label} crashed`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
          <span className="text-danger">{this.props.label} hit a problem.</span>
          <button
            type="button"
            className="btn px-2 py-0.5 text-xs"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
