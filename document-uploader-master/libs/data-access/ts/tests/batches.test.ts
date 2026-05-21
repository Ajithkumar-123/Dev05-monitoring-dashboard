import { describe, it, expect } from "vitest";
import { TABLE_NAME, type Batch } from "../src/batches/index.js";

describe("batches", () => {
  it("pins the binding table name", () => {
    expect(TABLE_NAME).toBe("docuploader-api-batches");
  });

  it("Batch type round-trips through JSON unchanged", () => {
    const batch: Batch = {
      batchId: "batch-001",
      tenantId: "tenant-a",
      workspaceId: "ws-001",
      status: "OPEN",
      createdAt: "2026-05-11T12:00:00Z",
      updatedAt: "2026-05-11T12:00:00Z",
    };
    expect(JSON.parse(JSON.stringify(batch))).toEqual(batch);
  });
});
