import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-api-batches";

export type Status = "OPEN" | "CLOSED";

export interface Batch {
  batchId: string;
  tenantId: string;
  workspaceId: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export class BatchNotFoundError extends Error {
  constructor(batchId: string) {
    super(`batch not found: ${batchId}`);
    this.name = "BatchNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(batchId: string): Promise<Batch> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { batchId }, ConsistentRead: true }),
    );
    if (!out.Item) throw new BatchNotFoundError(batchId);
    return out.Item as Batch;
  }

  async put(b: Batch): Promise<void> {
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: b }));
  }
}
