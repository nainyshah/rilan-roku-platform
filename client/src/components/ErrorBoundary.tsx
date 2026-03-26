import { cn } from "@/lib/utils";
import { AlertTriangle, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import { Component, ReactNode } from "react";
import { retryEvents } from "@/lib/retryEvents";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  isNetworkExhausted: boolean;
  error: Error | null;
}

/**
 * Returns true when the error message matches a transient network failure
 * that has already exhausted all retry attempts.
 */
function isNetworkExhaustedError(error: Error): boolean {
  const msg = error.message?.toLowerCase() ?? "";
  return (
    msg.includes("failed to fetch") ||
    msg.includes("load failed") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed")
  );
}

class ErrorBoundary extends Component<Props, State> {
  private unsubscribeRetry: (() => void) | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, isNetworkExhausted: false, error: null };
  }

  componentDidMount() {
    // Listen for the global retry-exhausted event so we can show the
    // network-failure UI even without a React render error being thrown.
    this.unsubscribeRetry = retryEvents.subscribe((event) => {
      if (event.type === "failed") {
        this.setState({ hasError: true, isNetworkExhausted: true, error: null });
      }
      if (event.type === "recovered") {
        this.setState({ hasError: false, isNetworkExhausted: false, error: null });
      }
    });
  }

  componentWillUnmount() {
    this.unsubscribeRetry?.();
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      isNetworkExhausted: isNetworkExhaustedError(error),
      error,
    };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, isNetworkExhausted: false, error: null });
    window.location.reload();
  };

  render() {
    const { hasError, isNetworkExhausted, error } = this.state;

    if (!hasError) return this.props.children;

    /* ── Network-exhaustion screen ── */
    if (isNetworkExhausted) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-md text-center gap-6">
            {/* Icon */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <WifiOff size={36} className="text-amber-400" />
              </div>
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 border-2 border-background" />
            </div>

            {/* Heading */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                Unable to connect
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The server could not be reached after three attempts. This
                usually happens when the server is starting up or your network
                connection is interrupted.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 w-full">
              <button
                onClick={this.handleRetry}
                className={cn(
                  "flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg w-full",
                  "bg-primary text-primary-foreground text-sm font-medium",
                  "hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
                )}
              >
                <RefreshCw size={15} />
                Try again
              </button>
              <p className="text-xs text-muted-foreground">
                The page will automatically recover once the server is back
                online. You can also wait a moment and click{" "}
                <strong>Try again</strong>.
              </p>
            </div>
          </div>
        </div>
      );
    }

    /* ── Generic unexpected error screen ── */
    return (
      <div className="flex items-center justify-center min-h-screen p-8 bg-background">
        <div className="flex flex-col items-center w-full max-w-2xl p-8">
          <AlertTriangle
            size={48}
            className="text-destructive mb-6 flex-shrink-0"
          />
          <h2 className="text-xl mb-4">An unexpected error occurred.</h2>
          <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
            <pre className="text-sm text-muted-foreground whitespace-break-spaces">
              {error?.stack ?? error?.message}
            </pre>
          </div>
          <button
            onClick={() => window.location.reload()}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg",
              "bg-primary text-primary-foreground",
              "hover:opacity-90 cursor-pointer"
            )}
          >
            <RotateCcw size={16} />
            Reload Page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
