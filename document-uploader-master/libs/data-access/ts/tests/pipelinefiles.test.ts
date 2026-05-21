import { describe, it, expect } from "vitest";
import {
  FOLDER_PATH_INDEX_NAME,
  TABLE_NAME,
  type PipelineFile,
  ttlForFile,
} from "../src/pipelinefiles/index.js";

describe("pipelinefiles", () => {
  it("pins the binding table name and GSI", () => {
    expect(TABLE_NAME).toBe("docuploader-pipeline-files");
    expect(FOLDER_PATH_INDEX_NAME).toBe("folderPath-index");
  });

  it("ttlForFile is 7 days out", () => {
    const createdAt = new Date("2026-05-11T12:00:00Z");
    const expected = Math.floor((createdAt.getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);
    expect(ttlForFile(createdAt)).toBe(expected);
  });

  it("PipelineFile type round-trips", () => {
    const file: PipelineFile = {
      fileId: "file-001",
      documentId: "doc-001",
      executionId: "exec-001",
      folderPath: "doc-001/chunks",
      s3Bucket: "docuploader-pipeline",
      s3Key: "doc-001/chunks/0.pdf",
      sizeBytes: 1024,
      createdAt: "2026-05-11T12:00:00Z",
      expiresAt: 0,
    };
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});
