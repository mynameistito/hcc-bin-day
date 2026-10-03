import catalogue from "@/lib/bin-items-data.json" with { type: "json" };

/** Council sorter destination groups represented in the local catalogue. */
const BIN_TYPES = ["yellow", "red", "glass", "food-scraps", "other"] as const;

/** Council sorter destinations represented in the local catalogue. */
export type BinType = (typeof BIN_TYPES)[number];

/** A council-sourced item classification and any handling instruction. */
export interface BinItem {
  /** Item wording shown by Hamilton City Council's sorter. */
  readonly item: string;
  /** Destination stated by the Council sorter. */
  readonly bin: BinType;
  /** Stable Council sorter identifier. */
  readonly id: number;
  /** Exact destination wording returned by the Council sorter. */
  readonly destination: string;
  /** Council handling and disposal advice. */
  readonly notes?: string;
}

/** Complete catalogue returned by the Council sorter at the recorded date. */
export const BIN_ITEM_SOURCE = catalogue.source;

const parseBinType = (value: string): BinType => {
  const bin = BIN_TYPES.find((candidate) => candidate === value);
  if (!bin) {
    throw new Error(`Unknown Council sorter bin type: ${value}`);
  }
  return bin;
};

export const BIN_ITEMS: readonly BinItem[] = catalogue.items.map((entry) => ({
  ...entry,
  bin: parseBinType(entry.bin),
}));

const normalize = (value: string): string => value.trim().toLowerCase();

/** Find verified Council items whose names contain the user's search text. */
export const searchBinItems = (query: string): readonly BinItem[] => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [];
  }

  return BIN_ITEMS.filter((entry) =>
    normalize(entry.item).includes(normalizedQuery)
  );
};

/** Council-facing name for each supported bin type. */
const binTypeNames: Record<BinType, string> = {
  yellow: "yellow recycling wheelie bin",
  red: "red rubbish wheelie bin",
  glass: "glass recycling crate",
  "food-scraps": "food scraps bin",
  other: "other disposal",
};
const binTypesByName = {
  "food scraps bin": "food-scraps",
  "glass crate": "glass",
  "glass recycling crate": "glass",
  "red bin": "red",
  "red rubbish wheelie bin": "red",
  "other disposal": "other",
  "yellow bin": "yellow",
  "yellow recycling wheelie bin": "yellow",
} satisfies Record<string, BinType>;

/** Human-readable Council bin name used in guidance and lookup results. */
export const binTypeName = (bin: BinType): string => binTypeNames[bin];

/** Map a Council collection bin label to a known bin type without guessing. */
export const binTypeFromName = (name: string): BinType | null => {
  const normalized = normalize(name);
  return (
    Object.entries(binTypesByName).find(
      ([label]) => label === normalized
    )?.[1] ?? null
  );
};
