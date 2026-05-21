import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-api-audit-events";

export interface AuditEvent {
  eventId: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  requestId: string;
  idempotencyKey?: string;
  mutation: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  expiresAt: number;
}

/** Return the unix-second expiry value 90 days after `occurredAt`. */
export function ttlForEvent(occurredAt: Date): number {
  const ms = occurredAt.getTime() + 90 * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

export class AuditEventNotFoundError extends Error {
  constructor(eventId: string) {
    super(`audit event not found: ${eventId}`);
    this.name = "AuditEventNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(eventId: string): Promise<AuditEvent> {
    const out = await this.ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: { eventId } }));
    if (!out.Item) throw new AuditEventNotFoundError(eventId);
    return out.Item as AuditEvent;
  }

  async put(e: AuditEvent): Promise<void> {
    const item: AuditEvent =
      e.expiresAt === 0 ? { ...e, expiresAt: ttlForEvent(new Date(e.occurredAt)) } : e;
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }
}
