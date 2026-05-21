import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

export const TABLE_NAME = "textract-task-tokens";

export interface TaskToken {
  taskToken: string;
  documentId: string;
  executionId: string;
  jobId: string;
  createdAt: string;
  expiresAt: number;
}

export function ttlForToken(createdAt: Date): number {
  const ms = createdAt.getTime() + 24 * 60 * 60 * 1000;
  return Math.floor(ms / 1000);
}

export class TaskTokenNotFoundError extends Error {
  constructor(taskToken: string) {
    super(`task token not found: ${taskToken}`);
    this.name = "TaskTokenNotFoundError";
  }
}

export class Client {
  constructor(private readonly ddb: DynamoDBDocumentClient) {}

  async get(taskToken: string): Promise<TaskToken> {
    const out = await this.ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { taskToken }, ConsistentRead: true }),
    );
    if (!out.Item) throw new TaskTokenNotFoundError(taskToken);
    return out.Item as TaskToken;
  }

  async put(t: TaskToken): Promise<void> {
    const item: TaskToken =
      t.expiresAt === 0 ? { ...t, expiresAt: ttlForToken(new Date(t.createdAt)) } : t;
    await this.ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  async delete(taskToken: string): Promise<void> {
    await this.ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { taskToken } }));
  }
}
