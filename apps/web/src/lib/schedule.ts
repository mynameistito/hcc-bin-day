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

export const formatCollectionDate = (date: string): string =>
  new Date(`${date}T12:00:00`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

export const daysUntilCollection = (date: string, today: Date): number => {
  const collectionDay = new Date(`${date}T00:00:00Z`);
  const currentDay = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );
  return Math.round(
    (collectionDay.getTime() - currentDay.getTime()) / 86_400_000
  );
};
