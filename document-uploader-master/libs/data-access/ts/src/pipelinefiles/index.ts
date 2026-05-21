import {
  GetCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-pipeline-files";
export const FOLDER_PATH_INDEX_NAME = "folderPath-index";

export interface PipelineFile {
  fileId: string;
  documentId: string;
  executionId: string;
  folderPath: string;
  s3Bucket: string;
  s3Key: string;
  sizeBytes: number;
  createdAt: string;
  expiresAt: number;
}

export function ttlForFile(createdAt: Date): number {
  const ms = createdAt.getTime() + 7 * 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

export class PipelineFileNotFoundError extends Error {
  constructor(fileId: string) {
    super(`pipeline file not found: ${fileId}`);
    this.name = "PipelineFileNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(fileId: string): Promise<PipelineFile> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { fileId }, ConsistentRead: true }),
    );
    if (!out.Item) throw new PipelineFileNotFoundError(fileId);
    return out.Item as PipelineFile;
  }

  async put(f: PipelineFile): Promise<void> {
    const item: PipelineFile =
      f.expiresAt === 0 ? { ...f, expiresAt: ttlForFile(new Date(f.createdAt)) } : f;
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  async listByFolder(folderPath: string): Promise<PipelineFile[]> {
    const out = await this.ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: FOLDER_PATH_INDEX_NAME,
        KeyConditionExpression: "folderPath = :p",
        ExpressionAttributeValues: { ":p": folderPath },
      }),
    );
    return (out.Items ?? []) as PipelineFile[];
  }
}
