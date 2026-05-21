import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { deriveUpdateStatusKey } from "../src/_idempotency.js";

// Shared golden inputs across Go / Python / TypeScript. The cross-language
// parity job diffs the actual digests; this test just enforces shape +
// determinism on the TS side.
const GOLDEN_EXECUTION_ID =
  "arn:aws:states:eu-west-1:123456789012:execution:docuploader-pipeline-mvp:exec-001";
const GOLDEN_TO_STATE = "PROCESSING";
const GOLDEN_PHASE = "convert";

describe("deriveUpdateStatusKey", () => {
  it("returns a 64-character hex digest for the golden triple", () => {
    const digest = deriveUpdateStatusKey(GOLDEN_EXECUTION_ID, GOLDEN_TO_STATE, GOLDEN_PHASE);
    expect(digest).toHaveLength(64);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(deriveUpdateStatusKey("e1", "PROCESSING", "convert")).toBe(
      deriveUpdateStatusKey("e1", "PROCESSING", "convert"),
    );
  });

  it.each([
    ["different executionId", "e2", "PROCESSING", "convert"],
    ["different toState", "e1", "COMPLETED", "convert"],
    ["different phase", "e1", "PROCESSING", "ocr"],
  ])("is distinct on %s", (_label, exec, to, phase) => {
    const base = deriveUpdateStatusKey("e1", "PROCESSING", "convert");
    expect(deriveUpdateStatusKey(exec, to, phase)).not.toBe(base);
  });

  it("is delimiter-safe (no injection via 0x1f in components)", () => {
    const a = deriveUpdateStatusKey("a", "b\x1fc", "d");
    const b = deriveUpdateStatusKey("a", "b", "c\x1fd");
    expect(a).not.toBe(b);
  });

  it("is a pure function (property)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (e, t, p) => {
        return deriveUpdateStatusKey(e, t, p) === deriveUpdateStatusKey(e, t, p);
      }),
    );
  });
});
