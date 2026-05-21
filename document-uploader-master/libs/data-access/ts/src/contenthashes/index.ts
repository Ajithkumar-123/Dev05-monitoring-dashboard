import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-content-hashes";

export interface ContentHash {
  sha256: string;
  documentId: string;
  tenantId: string;
  seenAt: string;
  expiresAt: number;
}

export function ttlForHash(seenAt: Date): number {
  const ms = seenAt.getTime() + 90 * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

export class ContentHashNotFoundError extends Error {
  constructor(sha256: string) {
    super(`content hash not found: ${sha256}`);
    this.name = "ContentHashNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(sha256: string): Promise<ContentHash> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { sha256 }, ConsistentRead: true }),
    );
    if (!out.Item) throw new ContentHashNotFoundError(sha256);
    return out.Item as ContentHash;
  }

  async put(h: ContentHash): Promise<void> {
    const item: ContentHash =
      h.expiresAt === 0 ? { ...h, expiresAt: ttlForHash(new Date(h.seenAt)) } : h;
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }
}
