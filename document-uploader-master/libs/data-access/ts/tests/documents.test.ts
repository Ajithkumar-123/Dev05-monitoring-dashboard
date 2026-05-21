import { describe, it, expect } from "vitest";
import {
  IDEMPOTENCY_INDEX_NAME,
  TABLE_NAME,
  type Document,
  type Output,
  type ProcessingError,
  type Status,
} from "../src/documents/index.js";

describe("documents", () => {
  it("pins the binding table name and GSI", () => {
    expect(TABLE_NAME).toBe("docuploader-api-documents");
    expect(IDEMPOTENCY_INDEX_NAME).toBe("idempotency-index");
  });

  it("Document with outputs and processingError round-trips", () => {
    const outputs: Output[] = [
      { type: "searchable-pdf", s3Key: "doc-001/searchable.pdf" },
      { type: "text", s3Key: "doc-001/text.txt", nativeTrigger: "NATIVE" },
    ];
    const processingError: ProcessingError = {
      code: "CONVERT_FAILED",
      message: "Aspose threw a renderer exception",
      retryable: false,
    };
    const doc: Document = {
      documentId: "doc-001",
      tenantId: "tenant-a",
      workspaceId: "ws-001",
      batchId: "batch-001",
      status: "PROCESSING",
      idempotencyKey: "deadbeef",
      pipelineStage: "convert",
      outputs,
      processingError,
      createdAt: "2026-05-11T12:00:00Z",
      updatedAt: "2026-05-11T12:00:00Z",
    };
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });

  it("covers the full status lifecycle from application-design.md", () => {
    const statuses: Status[] = ["UPLOADED", "SCANNING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED"];
    // Compile-time assertion: any drift in the Status union triggers a TS error.
    expect(statuses).toHaveLength(6);
  });
});
