import { describe, expect, test } from "bun:test";

import { handleLookup } from "../worker";

describe("lookup endpoint input validation", () => {
  test("rejects addresses over the length limit before calling the Council API", async () => {
    const request = new Request(
      `https://example.test/api/lookup?address=${"x".repeat(161)}`
    );

    const response = await handleLookup(request);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: "Address must be 160 characters or fewer",
    });
  });

  test("rejects blank addresses", async () => {
    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=%20%20")
    );

    expect(response.status).toBe(400);
  });
});
