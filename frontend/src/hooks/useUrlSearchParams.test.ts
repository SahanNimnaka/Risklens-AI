import { describe, expect, it } from "vitest";

import { createSearchParamsUpdater } from "./useUrlSearchParams";

describe("createSearchParamsUpdater", () => {
  it("accumulates rapid updates without dropping earlier filters", () => {
    const updater = createSearchParamsUpdater(
      new URLSearchParams("as_of=2026-06-30&campaign=demo"),
    );

    const department = updater.update({ department: "it" });
    updater.sync(new URLSearchParams("as_of=2026-06-30&campaign=demo"));
    const status = updater.update({ status: "completed" });

    expect(status.get("department")).toBe("it");
    expect(status.get("status")).toBe("completed");
    expect(status.get("as_of")).toBe("2026-06-30");
    expect(status.get("campaign")).toBe("demo");
    expect(department.get("status")).toBeNull();
  });

  it("resynchronizes after navigation, including browser history changes", () => {
    const updater = createSearchParamsUpdater(
      new URLSearchParams("department=it"),
    );

    updater.update({ status: "completed" });
    updater.sync(
      new URLSearchParams("department=it&status=completed"),
    );
    updater.sync(new URLSearchParams("department=finance"));

    expect(updater.update({ overdue: "true" }).toString()).toBe(
      "department=finance&overdue=true",
    );
  });
});
