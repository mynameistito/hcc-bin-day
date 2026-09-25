import { describe, expect, test } from "bun:test";

import { daysUntilCollection } from "../schedule";

describe("daysUntilCollection", () => {
  test("calculates days using calendar dates rather than the current time", () => {
    expect(
      daysUntilCollection("2026-09-28", new Date("2026-09-25T23:50:00"))
    ).toBe(3);
  });

  test("returns zero on collection day", () => {
    expect(
      daysUntilCollection("2026-09-25", new Date("2026-09-25T08:00:00"))
    ).toBe(0);
  });
});
