import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface Props {
    children: ReactNode;
    /** When provided, renders a compact dismissible error instead of the full-screen fallback */
    onDismiss?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            const { onDismiss } = this.props;

            if (onDismiss) {
                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                        <div className="relative mx-4 max-w-sm w-full rounded-2xl border border-red-500/20 bg-telegram-surface p-6 text-center shadow-2xl">
                            <button
                                onClick={onDismiss}
                                className="absolute right-3 top-3 rounded-lg p-1.5 text-telegram-subtext transition hover:bg-white/[0.05] hover:text-telegram-text"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                                <AlertTriangle className="h-6 w-6 text-red-400" />
                            </div>
                            <h2 className="mb-1 text-base font-semibold text-telegram-text">Something went wrong</h2>
                            <p className="mb-4 text-sm text-telegram-subtext">
                                This panel encountered an error. Close it and try again.
                            </p>
                            {this.state.error && (
                                <details className="mb-4 text-left">
                                    <summary className="cursor-pointer text-xs text-telegram-subtext hover:text-telegram-text transition-colors">
                                        Details
                                    </summary>
                                    <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-telegram-hover p-2 text-xs text-red-400">
                                        {this.state.error.message}
                                    </pre>
                                </details>
                            )}
                            <button
                                onClick={onDismiss}
                                className="inline-flex items-center gap-2 rounded-lg bg-telegram-primary px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
                            >
                                <X className="h-3.5 w-3.5" />
                                Close
                            </button>
                        </div>
                    </div>
                );
            }

            return (
                <div className="h-screen w-screen flex items-center justify-center bg-telegram-bg p-8">
                    <div className="max-w-md w-full bg-telegram-surface border border-telegram-border rounded-2xl p-8 text-center shadow-2xl">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-8 h-8 text-red-400" />
                        </div>
                        <h1 className="text-xl font-semibold text-telegram-text mb-2">Something went wrong</h1>
                        <p className="text-telegram-subtext text-sm mb-6">
                            The application encountered an unexpected error. Please try reloading.
                        </p>
                        {this.state.error && (
                            <details className="mb-6 text-left">
                                <summary className="text-xs text-telegram-subtext cursor-pointer hover:text-telegram-text transition-colors">
                                    Technical Details
                                </summary>
                                <pre className="mt-2 p-3 bg-telegram-hover rounded-lg text-xs text-red-400 overflow-auto max-h-32">
                                    {this.state.error.message}
                                </pre>
                            </details>
                        )}
                        <button
                            onClick={this.handleReload}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-telegram-primary text-black font-medium rounded-lg hover:bg-telegram-primary/90 transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
