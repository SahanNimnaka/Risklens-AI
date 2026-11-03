import { describe, expect, it } from "vitest";

import {
  mergeSearchParams,
  readSearchParam,
  withAsOf,
} from "./links";

describe("withAsOf", () => {
  it("omits the default date", () => {
    expect(withAsOf("/findings", "2026-10-31", true)).toBe("/findings");
  });

  it("appends a non-default date", () => {
    expect(withAsOf("/actions", "2026-06-30", false)).toBe(
      "/actions?as_of=2026-06-30",
    );
  });

  it("merges filters with an existing query string", () => {
    expect(
      withAsOf("/findings?audit_ref=AUD-2025-0005", "2026-06-30", false, {
        severity: "high",
      }),
    ).toBe(
      "/findings?audit_ref=AUD-2025-0005&severity=high&as_of=2026-06-30",
    );
  });

  it("drops blank filters instead of writing empty parameters", () => {
    expect(
      withAsOf("/actions", "2026-10-31", true, {
        overdue: true,
        status: "",
        search: "   ",
      }),
    ).toBe("/actions?overdue=true");
  });
});

describe("mergeSearchParams", () => {
  it("preserves as_of and unrelated parameters", () => {
    const current = new URLSearchParams(
      "as_of=2026-06-30&severity=high&audit_ref=AUD-1",
    );
    const next = mergeSearchParams(current, { severity: "", status: "open" });

    expect(next.get("as_of")).toBe("2026-06-30");
    expect(next.get("audit_ref")).toBe("AUD-1");
    expect(next.get("severity")).toBeNull();
    expect(next.get("status")).toBe("open");
  });

  it("does not mutate the current parameters", () => {
    const current = new URLSearchParams("severity=high");
    mergeSearchParams(current, { severity: "low" });

    expect(current.get("severity")).toBe("high");
  });

  it("removes a parameter when the update is blank", () => {
    const next = mergeSearchParams(
      new URLSearchParams("department=it&as_of=2026-06-30"),
      { department: "" },
    );

    expect(next.get("department")).toBeNull();
    expect(next.get("as_of")).toBe("2026-06-30");
  });
});

describe("readSearchParam", () => {
  it("trims and caps hand-edited values", () => {
    const params = new URLSearchParams({ search: "  change management  " });

    expect(readSearchParam(params, "search", 10)).toBe("change man");
    expect(readSearchParam(params, "missing")).toBe("");
  });
});
