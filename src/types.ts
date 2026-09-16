/** Raw address result returned by the council API. */
export interface AddressLookupResult {
  readonly Collection_Address: string;
}

/** Raw collection dates result returned by the council API. */
export interface CollectionDatesResult {
  readonly Address: string;
  readonly RedBin: string;
  readonly YellowBin: string;
  readonly CollectionWeek: number;
  readonly CollectionDay: number;
}

export type { CollectionSchedule } from "./schedule";
