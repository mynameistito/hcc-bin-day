import { describe, expect, test } from "vitest";

import {
  daysUntilCollection,
  formatCollectionDate,
  resolveNextCollection,
} from "@/lib/schedule";
import type { ScheduleResponse } from "@/lib/schedule";

const fridaySchedule: ScheduleResponse = {
  address: "12 Grey Street",
  collectionDayName: "Friday",
  nextCollection: {
    bins: ["red bin", "food scraps bin"],
    date: "2026-10-02",
    type: "red",
  },
  redBin: "2026-10-02",
  yellowBin: "2026-10-09",
};

describe(formatCollectionDate, () => {
  test("formats a collection date with its weekday and month", () => {
    expect(formatCollectionDate("2026-09-25")).toContain("September");
    expect(formatCollectionDate("2026-09-25")).toContain("Friday");
  });
});

describe(daysUntilCollection, () => {
  test("calculates days using calendar dates rather than the current time", () => {
    expect(
      daysUntilCollection("2026-09-28", new Date("2026-09-25T11:50:00Z"))
    ).toBe(3);
  });

  test("returns zero on collection day", () => {
    expect(
      daysUntilCollection("2026-09-25", new Date("2026-09-25T08:00:00"))
    ).toBe(0);
  });

  test("uses Hamilton's calendar date around local midnight", () => {
    expect(
      daysUntilCollection("2026-10-02", new Date("2026-10-01T10:59:00Z"))
    ).toBe(1);
    expect(
      daysUntilCollection("2026-10-02", new Date("2026-10-01T11:00:00Z"))
    ).toBe(0);
  });

  test("counts calendar days across the end of daylight saving", () => {
    expect(
      daysUntilCollection("2026-04-10", new Date("2026-04-05T14:30:00Z"))
    ).toBe(4);
  });
});

describe(resolveNextCollection, () => {
  test.each([
    ["before collection day", "2026-10-01T10:59:00Z", "2026-10-02", "red"],
    ["on collection day", "2026-10-01T11:00:00Z", "2026-10-02", "red"],
    [
      "the day after collection",
      "2026-10-02T11:00:00Z",
      "2026-10-09",
      "yellow",
    ],
  ] as const)(
    "selects the correct collection %s",
    (_label, now, date, type) => {
      const schedule = resolveNextCollection(fridaySchedule, new Date(now));

      expect(schedule.nextCollection).toMatchObject({ date, type });
      expect(
        daysUntilCollection(schedule.nextCollection.date, new Date(now))
      ).toBeGreaterThanOrEqual(0);
    }
  );

  test("advances all schedule details together after the displayed date passes", () => {
    const schedule = resolveNextCollection(
      fridaySchedule,
      new Date("2026-10-03T12:00:00Z")
    );

    expect(schedule).toMatchObject({
      nextCollection: {
        bins: ["yellow bin", "glass crate", "food scraps bin"],
        date: "2026-10-09",
        type: "yellow",
      },
      redBin: "2026-10-16",
      yellowBin: "2026-10-09",
    });
  });

  test("advances correctly across a month and year boundary", () => {
    const schedule = resolveNextCollection(
      {
        ...fridaySchedule,
        nextCollection: {
          bins: ["red bin", "food scraps bin"],
          date: "2026-12-25",
          type: "red",
        },
        redBin: "2026-12-25",
        yellowBin: "2027-01-01",
      },
      new Date("2026-12-26T12:00:00Z")
    );

    expect(schedule).toMatchObject({
      nextCollection: { date: "2027-01-01", type: "yellow" },
      redBin: "2027-01-08",
      yellowBin: "2027-01-01",
    });
  });

  test("keeps the upcoming week correct through Hamilton's daylight-saving change", () => {
    const now = new Date("2026-04-05T14:30:00Z");
    const schedule = resolveNextCollection(
      {
        ...fridaySchedule,
        nextCollection: {
          bins: ["red bin", "food scraps bin"],
          date: "2026-04-03",
          type: "red",
        },
        redBin: "2026-04-03",
        yellowBin: "2026-04-10",
      },
      now
    );

    expect(schedule.nextCollection).toMatchObject({
      date: "2026-04-10",
      type: "yellow",
    });
    expect(daysUntilCollection(schedule.nextCollection.date, now)).toBe(4);
  });
});
