import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshIcon } from "./components/Icons.js";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Top-level safety net - an uncaught render error (we've hit exactly this
 * once already this session, a Rules-of-Hooks violation) otherwise blanks
 * the whole app to a white screen with no recovery path. Error boundaries
 * must be class components; there's no hook equivalent. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page center">
          <h1>Something broke</h1>
          <p className="muted">The app hit an unexpected error. Reloading usually fixes it.</p>
          <button type="button" className="primary" onClick={() => window.location.reload()}>
            <RefreshIcon /> Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
