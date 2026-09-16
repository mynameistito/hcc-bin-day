import { describe, expect, test } from "bun:test";

import { buildSchedule, toScheduleJson } from "../src/schedule";

const councilResult = {
  Address: "14B Mountbatten Place",
  CollectionDay: 1,
  CollectionWeek: 1,
  RedBin: "2026-09-21T00:00:00",
  YellowBin: "2026-09-28T00:00:00",
};

describe("collection schedules", () => {
  test("builds the next collection from council data", () => {
    expect(buildSchedule(councilResult)).toMatchObject({
      address: "14B Mountbatten Place",
      collectionDayName: "Monday",
      nextCollection: {
        bins: ["red bin", "food scraps bin"],
        date: "2026-09-21",
      },
      upcomingWeek: "red",
    });
  });

  test("projects a stable JSON output shape", () => {
    const output = toScheduleJson(buildSchedule(councilResult));

    expect(output.upcoming.week).toBe("red");
    expect(output.following.week).toBe("yellow");
    expect(output.upcoming.dateFormatted).toContain("September");
  });
});
