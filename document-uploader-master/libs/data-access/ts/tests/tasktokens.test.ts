import { describe, it, expect } from "vitest";
import { TABLE_NAME, type TaskToken, ttlForToken } from "../src/tasktokens/index.js";

describe("tasktokens", () => {
  it("pins the binding table name", () => {
    expect(TABLE_NAME).toBe("textract-task-tokens");
  });

  it("ttlForToken is 1 day out", () => {
    const createdAt = new Date("2026-05-11T12:00:00Z");
    const expected = Math.floor((createdAt.getTime() + 24 * 60 * 60 * 1000) / 1000);
    expect(ttlForToken(createdAt)).toBe(expected);
  });

  it("TaskToken type round-trips", () => {
    const token: TaskToken = {
      taskToken: "textract-callback-token-001",
      documentId: "doc-001",
      executionId: "exec-001",
      jobId: "textract-job-001",
      createdAt: "2026-05-11T12:00:00Z",
      expiresAt: 0,
    };
    expect(JSON.parse(JSON.stringify(token))).toEqual(token);
  });
});
