import { describe, it, expect } from "vitest";
import { TABLE_NAME, type Workspace } from "../src/workspaces/index.js";

describe("workspaces", () => {
  it("pins the binding table name", () => {
    expect(TABLE_NAME).toBe("docuploader-api-workspaces");
  });

  it("Workspace JSON round-trips preserving all fields", () => {
    const ws: Workspace = {
      workspaceId: "ws-001",
      tenantId: "tenant-a",
      status: "ACTIVE",
      retentionPolicy: { inputRetentionDays: 7 },
      encryptionConfig: { kmsAliasName: "alias/docuploader-tenant-ws-001" },
      pipelineConfig: {
        allowedExtensions: ["pdf", "docx"],
        forcedSlipsheetExtensions: ["csv", "ods"],
      },
      createdAt: "2026-05-11T12:00:00Z",
      updatedAt: "2026-05-11T12:00:00Z",
    };
    const round = JSON.parse(JSON.stringify(ws)) as Workspace;
    expect(round).toEqual(ws);
  });
});
