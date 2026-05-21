import { describe, it, expect } from "vitest";
import { TABLE_NAME, type AuditEvent, ttlForEvent } from "../src/auditevents/index.js";

describe("auditevents", () => {
  it("pins the binding table name", () => {
    expect(TABLE_NAME).toBe("docuploader-api-audit-events");
  });

  it("ttlForEvent is 90 days out (in unix seconds)", () => {
    const occurredAt = new Date("2026-05-11T12:00:00Z");
    const expected = Math.floor(
      (occurredAt.getTime() + 90 * 24 * 60 * 60 * 1000) / 1000,
    );
    expect(ttlForEvent(occurredAt)).toBe(expected);
  });

  it("AuditEvent payload round-trips", () => {
    const event: AuditEvent = {
      eventId: "evt-001",
      tenantId: "tenant-a",
      workspaceId: "ws-001",
      userId: "user-1",
      requestId: "req-1",
      mutation: "createDocument",
      payload: { documentId: "doc-001" },
      occurredAt: "2026-05-11T12:00:00Z",
      expiresAt: 0,
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
  });
});
