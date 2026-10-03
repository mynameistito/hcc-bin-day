export interface ScheduleResponse {
  readonly address: string;
  readonly collectionDayName: string;
  readonly nextCollection: {
    readonly bins: readonly string[];
    readonly date: string;
    readonly type: "red" | "yellow";
  };
  readonly redBin: string;
  readonly yellowBin: string;
}

const HAMILTON_TIME_ZONE = "Pacific/Auckland";
const MILLISECONDS_PER_DAY = 86_400_000;
const HAMILTON_DATE_FORMATTER = new Intl.DateTimeFormat("en-NZ", {
  day: "2-digit",
  month: "2-digit",
  timeZone: HAMILTON_TIME_ZONE,
  year: "numeric",
});

const calendarDateInHamilton = (date: Date): string => {
  const parts = HAMILTON_DATE_FORMATTER.formatToParts(date);
  const part = (type: "day" | "month" | "year") =>
    parts.find((value) => value.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
};

const advanceCollectionDate = (date: string, today: string): string => {
  let upcomingDate = date;

  while (upcomingDate < today) {
    const next = new Date(`${upcomingDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 14);
    upcomingDate = next.toISOString().slice(0, 10);
  }

  return upcomingDate;
};

/**
 * Resolve both bin-week dates against Hamilton's current calendar date.
 *
 * @param schedule - The schedule returned by the council lookup.
 * @param now - The current instant, supplied explicitly for deterministic use.
 * @returns A schedule whose dates, week, and bins all describe the next collection.
 */
export const resolveNextCollection = (
  schedule: ScheduleResponse,
  now: Date
): ScheduleResponse => {
  const today = calendarDateInHamilton(now);
  const redBin = advanceCollectionDate(schedule.redBin, today);
  const yellowBin = advanceCollectionDate(schedule.yellowBin, today);
  const nextCollection =
    redBin <= yellowBin
      ? {
          bins:
            schedule.nextCollection.type === "red"
              ? schedule.nextCollection.bins
              : ["red bin", "food scraps bin"],
          date: redBin,
          type: "red" as const,
        }
      : {
          bins:
            schedule.nextCollection.type === "yellow"
              ? schedule.nextCollection.bins
              : ["yellow bin", "glass crate", "food scraps bin"],
          date: yellowBin,
          type: "yellow" as const,
        };

  return { ...schedule, nextCollection, redBin, yellowBin };
};

export const formatCollectionDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    timeZone: HAMILTON_TIME_ZONE,
    weekday: "long",
  });

export const daysUntilCollection = (date: string, today: Date): number => {
  const collectionDay = new Date(`${date}T00:00:00Z`).getTime();
  const currentDay = new Date(
    `${calendarDateInHamilton(today)}T00:00:00Z`
  ).getTime();
  return Math.round((collectionDay - currentDay) / MILLISECONDS_PER_DAY);
};
