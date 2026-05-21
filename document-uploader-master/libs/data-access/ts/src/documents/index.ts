import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-api-documents";
export const IDEMPOTENCY_INDEX_NAME = "idempotency-index";

export type Status =
  | "UPLOADED"
  | "SCANNING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface Output {
  type: string;
  s3Key: string;
  nativeTrigger?: string;
}

export interface ProcessingError {
  code: string;
  message: string;
  detail?: string;
  retryable: boolean;
  extensions?: Record<string, string>;
}

export interface Document {
  documentId: string;
  tenantId: string;
  workspaceId: string;
  batchId: string;
  status: Status;
  idempotencyKey: string;
  pipelineStage?: string;
  outputs?: Output[];
  processingError?: ProcessingError;
  createdAt: string;
  updatedAt: string;
}

export class DocumentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(documentId: string): Promise<Document> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { documentId }, ConsistentRead: true }),
    );
    if (!out.Item) throw new DocumentNotFoundError(`documentId=${documentId}`);
    return out.Item as Document;
  }

  async put(d: Document): Promise<void> {
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: d }));
  }

  async findByIdempotencyKey(key: string): Promise<Document> {
    const out = await this.ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: IDEMPOTENCY_INDEX_NAME,
        KeyConditionExpression: "idempotencyKey = :k",
        ExpressionAttributeValues: { ":k": key },
        Limit: 1,
      }),
    );
    if (!out.Items || out.Items.length === 0) {
      throw new DocumentNotFoundError(`idempotencyKey=${key}`);
    }
    return out.Items[0] as Document;
  }
}
