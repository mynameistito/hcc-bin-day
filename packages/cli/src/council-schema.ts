import {
  Array as SchemaArray,
  isBetween,
  isInt,
  makeFilter,
  Number as SchemaNumber,
  String as SchemaString,
  Struct,
} from "effect/Schema";

const isValidCouncilDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/u.test(value)) {
    return false;
  }

  const [yearPart, monthPart, dayPart] = value
    .slice(0, 10)
    .split("-")
    .map(Number);
  const year = yearPart ?? Number.NaN;
  const month = monthPart ?? Number.NaN;
  const day = dayPart ?? Number.NaN;
  if (![year, month, day].every(Number.isInteger)) {
    return false;
  }

  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  if (
    ![hour, minute, second].every(Number.isInteger) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const CouncilDate = SchemaString.check(makeFilter(isValidCouncilDate));

export const AddressLookupResultSchema = Struct({
  Collection_Address: SchemaString,
});

export const AddressLookupResultsSchema = SchemaArray(
  AddressLookupResultSchema
);

export const CollectionDatesResultSchema = Struct({
  Address: SchemaString,
  CollectionDay: SchemaNumber.check(
    isInt(),
    isBetween({ maximum: 7, minimum: 1 })
  ),
  CollectionWeek: SchemaNumber.check(isInt()),
  RedBin: CouncilDate,
  YellowBin: CouncilDate,
});

export const CollectionDatesResultsSchema = SchemaArray(
  CollectionDatesResultSchema
);
