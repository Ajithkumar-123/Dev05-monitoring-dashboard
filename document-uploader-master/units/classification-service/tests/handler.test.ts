import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classify } from "../src/handler.js";
import type { workspaces } from "@docuploader/data-access";

function workspace(overrides: Partial<workspaces.Workspace> = {}): workspaces.Workspace {
  return {
    workspaceId: "ws-001",
    tenantId: "tenant-a",
    status: "ACTIVE",
    retentionPolicy: { inputRetentionDays: 7 },
    encryptionConfig: { kmsAliasName: "alias/docuploader-tenant-ws-001" },
    pipelineConfig: { forcedSlipsheetExtensions: ["csv", "ods"] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Empty buffer means magic-byte detection fails; the only signal then is the
// path extension. This is the realistic worst case at production.
const EMPTY = Buffer.alloc(0);

describe("classify", () => {
  it("forced-slipsheet extensions short-circuit before magic-byte detection", async () => {
    const ws = workspace();
    expect(await classify(EMPTY, "report.csv", ws)).toBe("slipsheet");
    expect(await classify(EMPTY, "data.ods", ws)).toBe("slipsheet");
  });

  it("per-workspace override expands the forced-slipsheet set", async () => {
    const ws = workspace({ pipelineConfig: { forcedSlipsheetExtensions: ["csv", "ods", "xls"] } });
    expect(await classify(EMPTY, "old.xls", ws)).toBe("slipsheet");
  });

  it("maps recognised extensions to the design's routes", async () => {
    const ws = workspace();
    const cases: Array<[string, string]> = [
      ["doc.pdf", "ocr-direct"],
      ["letter.docx", "convert/office"],
      ["page.html", "convert/html"],
      ["photo.png", "convert/image"],
      ["scan.tiff", "convert/tiff"],
      ["msg.eml", "email"],
      ["bundle.zip", "archive"],
      ["call.mp3", "media"],
    ];
    for (const [filename, expected] of cases) {
      expect(await classify(EMPTY, filename, ws)).toBe(expected);
    }
  });

  it("unknown extensions fall back to slipsheet (no document is silently dropped)", async () => {
    const ws = workspace();
    expect(await classify(EMPTY, "mystery.qux", ws)).toBe("slipsheet");
    expect(await classify(EMPTY, "noextension", ws)).toBe("slipsheet");
  });

  it("returns a string from the known route set for any input (property)", async () => {
    const ws = workspace();
    const validRoutes = new Set([
      "ocr-direct", "convert/office", "convert/html", "convert/image",
      "convert/tiff", "email", "archive", "media", "slipsheet",
    ]);
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 64 }), async (filename) => {
        const route = await classify(EMPTY, filename, ws);
        return validRoutes.has(route);
      }),
      { numRuns: 200 },
    );
  });
});
