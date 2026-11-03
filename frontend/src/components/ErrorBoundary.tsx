import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";

import { Button } from "./ui/Button";
import { AlertCircleIcon } from "./ui/icons";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Last-resort fallback for render-time exceptions.
 *
 * API failures are already handled per panel by `useApiQuery` and ErrorState.
 * This boundary only exists so an unexpected render error cannot leave the
 * demo on a blank page.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep a developer signal without sending any data off the machine.
    console.error("Unhandled render error", error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReload={this.handleReload}
        />
      );
    }

    return this.props.children;
  }
}

export function ErrorFallback({
  error,
  onReload,
}: {
  error: Error | null;
  onReload: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-12">
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-white p-6 shadow-sm"
      >
        <div className="flex gap-3">
          <AlertCircleIcon className="mt-0.5 h-6 w-6 shrink-0 text-red-600" />
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              Something went wrong
            </h1>
            <p className="mt-1 text-sm text-slate-700">
              The application could not render this page. Reloading will fetch
              the current data again.
            </p>
            {error?.message && (
              <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                {error.message}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={onReload}>
            Reload the application
          </Button>
        </div>
      </div>
    </main>
  );
}
