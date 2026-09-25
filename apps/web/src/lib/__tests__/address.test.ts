import { describe, expect, test } from "bun:test";

import { ADDRESS_LENGTH_LIMIT, isLookupAddressValid } from "../address";

describe("isLookupAddressValid", () => {
  test("accepts a non-blank address at the length limit", () => {
    expect(isLookupAddressValid("1".repeat(ADDRESS_LENGTH_LIMIT))).toBe(true);
  });

  test("rejects blank and overlong address input", () => {
    expect(isLookupAddressValid("   ")).toBe(false);
    expect(isLookupAddressValid("1".repeat(ADDRESS_LENGTH_LIMIT + 1))).toBe(
      false
    );
  });
});
