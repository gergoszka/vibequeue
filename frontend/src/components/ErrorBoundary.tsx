import { Component } from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-gray-800 border border-red-700 rounded-xl p-6 text-center space-y-3">
          <p className="text-red-400 font-semibold">Something went wrong</p>
          <p className="text-gray-400 text-sm">{this.state.error?.message ?? 'An unexpected error occurred'}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
