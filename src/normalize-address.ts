const STREET_TYPE_ALIASES: Record<string, string> = {
  av: "avenue",
  ave: "avenue",
  avenue: "avenue",
  blvd: "boulevard",
  boulevard: "boulevard",
  cct: "circuit",
  circuit: "circuit",
  cl: "close",
  close: "close",
  court: "court",
  cres: "crescent",
  crescent: "crescent",
  ct: "court",
  dr: "drive",
  drive: "drive",
  gr: "grove",
  grove: "grove",
  heights: "heights",
  hts: "heights",
  lane: "lane",
  ln: "lane",
  parade: "parade",
  pde: "parade",
  pl: "place",
  place: "place",
  rd: "road",
  rise: "rise",
  road: "road",
  st: "street",
  street: "street",
  tce: "terrace",
  terrace: "terrace",
  way: "way",
};

const collapseWhitespace = (value: string): string =>
  value.trim().replaceAll(/\s+/gu, " ");

const normalizeUnitSuffix = (value: string): string =>
  value.replaceAll(
    /\b(?<number>\d+)\s*(?<suffix>[a-zA-Z])\b/gu,
    (_, number: string, suffix: string) => `${number}${suffix.toUpperCase()}`
  );

const expandStreetTypes = (value: string): string => {
  const tokens = value.split(" ");

  return tokens
    .map((token) => STREET_TYPE_ALIASES[token.toLowerCase()] ?? token)
    .join(" ");
};

const normalizeAddress = (address: string): string => {
  const normalized = collapseWhitespace(address).toLowerCase();

  return expandStreetTypes(normalizeUnitSuffix(normalized));
};

export const expandAddressQuery = (query: string): string => {
  const normalized = collapseWhitespace(query);

  return expandStreetTypes(normalizeUnitSuffix(normalized));
};

export const pickMatchingAddress = (
  query: string,
  matches: string[]
): string | null => {
  const normalizedQuery = normalizeAddress(query);
  const exactMatches = matches.filter(
    (match) => normalizeAddress(match) === normalizedQuery
  );

  if (exactMatches.length === 1) {
    return exactMatches[0] ?? null;
  }

  return null;
};
