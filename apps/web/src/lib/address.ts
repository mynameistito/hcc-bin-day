export const ADDRESS_LENGTH_LIMIT = 160;

export const isLookupAddressValid = (address: string): boolean =>
  address.length > 0 &&
  address.length <= ADDRESS_LENGTH_LIMIT &&
  address.trim().length > 0;
