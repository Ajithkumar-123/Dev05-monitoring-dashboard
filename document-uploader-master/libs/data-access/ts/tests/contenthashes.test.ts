import { describe, it, expect } from "vitest";
import { TABLE_NAME, type ContentHash, ttlForHash } from "../src/contenthashes/index.js";

describe("contenthashes", () => {
  it("pins the binding table name", () => {
    expect(TABLE_NAME).toBe("docuploader-content-hashes");
  });

  it("ttlForHash is 90 days out", () => {
    const seenAt = new Date("2026-05-11T12:00:00Z");
    const expected = Math.floor((seenAt.getTime() + 90 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttlForHash(seenAt)).toBe(expected);
  });

  it("ContentHash type round-trips", () => {
    const hash: ContentHash = {
      sha256: "a".repeat(64),
      documentId: "doc-001",
      tenantId: "tenant-a",
      seenAt: "2026-05-11T12:00:00Z",
      expiresAt: 0,
    };
    expect(JSON.parse(JSON.stringify(hash))).toEqual(hash);
  });
});
