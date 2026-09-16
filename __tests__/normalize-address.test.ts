import { describe, expect, test } from "bun:test";

import {
  expandAddressQuery,
  pickMatchingAddress,
} from "../src/normalize-address";

describe("address normalization", () => {
  test("expands street types and normalizes unit suffixes", () => {
    expect(expandAddressQuery(" 14b mountbatten pl ")).toBe(
      "14B mountbatten place"
    );
  });

  test("returns the unique normalized exact match", () => {
    expect(
      pickMatchingAddress("14b mountbatten pl", ["14B Mountbatten Place"])
    ).toBe("14B Mountbatten Place");
  });

  test("rejects ambiguous normalized matches", () => {
    expect(
      pickMatchingAddress("14b mountbatten pl", [
        "14B Mountbatten Place",
        "14B Mountbatten Pl",
      ])
    ).toBeNull();
  });
});
