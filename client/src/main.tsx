import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import { ErrorBoundary } from "@bargames/gamekit/client";
import { RefreshIcon } from "./components/Icons.js";

// Top-level safety net (the game kit's boundary, this game's look): an
// uncaught render error otherwise blanks the whole app with no way back.
function CrashScreen({ reload }: { reload: () => void }) {
  return (
    <div className="page center">
      <h1>Something broke</h1>
      <p className="muted">The app hit an unexpected error. Reloading usually fixes it.</p>
      <button type="button" className="primary" onClick={reload}>
        <RefreshIcon /> Reload
      </button>
    </div>
  );
}
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={(_error, reload) => <CrashScreen reload={reload} />}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
