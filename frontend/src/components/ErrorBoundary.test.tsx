import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ErrorBoundary, ErrorFallback } from "./ErrorBoundary";

describe("ErrorBoundary", () => {
  it("renders its children while no error has occurred", () => {
    const html = renderToStaticMarkup(
      <ErrorBoundary>
        <span>Register ready</span>
      </ErrorBoundary>,
    );

    expect(html).toContain("Register ready");
    expect(html).not.toContain("Something went wrong");
  });

  it("turns a thrown error into fallback state", () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error("boom"));

    expect(state.hasError).toBe(true);
    expect(state.error?.message).toBe("boom");
  });

  it("wraps non-Error values in an Error", () => {
    const state = ErrorBoundary.getDerivedStateFromError("broken");

    expect(state.hasError).toBe(true);
    expect(state.error?.message).toBe("broken");
  });
});

describe("ErrorFallback", () => {
  it("shows the failure and a reload action", () => {
    const html = renderToStaticMarkup(
      <ErrorFallback
        error={new Error("render failed")}
        onReload={() => undefined}
      />,
    );

    expect(html).toContain("Something went wrong");
    expect(html).toContain("render failed");
    expect(html).toContain("Reload the application");
  });
});
