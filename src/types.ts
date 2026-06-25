export interface AddressLookupResult {
  Collection_Address: string;
}

export interface CollectionDatesResult {
  Address: string;
  RedBin: string;
  YellowBin: string;
  CollectionWeek: number;
  CollectionDay: number;
}

export interface CollectionSchedule {
  address: string;
  redBin: Date;
  yellowBin: Date;
  collectionWeek: number;
  collectionDay: number;
}
