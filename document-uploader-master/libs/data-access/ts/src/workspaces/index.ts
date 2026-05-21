import { GetCommand, PutCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "docuploader-api-workspaces";

export type Status = "ACTIVE" | "ARCHIVED";

export interface RetentionPolicy {
  inputRetentionDays: number;
}

export interface EncryptionConfig {
  kmsAliasName: string;
}

export interface PipelineConfig {
  allowedExtensions?: string[];
  forcedSlipsheetExtensions?: string[];
}

export interface Workspace {
  workspaceId: string;
  tenantId: string;
  status: Status;
  retentionPolicy: RetentionPolicy;
  encryptionConfig: EncryptionConfig;
  pipelineConfig: PipelineConfig;
  createdAt: string;
  updatedAt: string;
}

export class WorkspaceNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`workspace not found: ${workspaceId}`);
    this.name = "WorkspaceNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(workspaceId: string): Promise<Workspace> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { workspaceId }, ConsistentRead: true }),
    );
    if (!out.Item) throw new WorkspaceNotFoundError(workspaceId);
    return out.Item as Workspace;
  }

  async put(ws: Workspace): Promise<void> {
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: ws }));
  }
}
