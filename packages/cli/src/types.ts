/** Raw collection dates result returned by the council API. */
export interface CollectionDatesResult {
  readonly Address: string;
  readonly RedBin: string;
  readonly YellowBin: string;
  readonly CollectionWeek: number;
  readonly CollectionDay: number;
}
