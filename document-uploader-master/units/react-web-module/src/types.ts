export type DocumentStatus =
  | "UPLOADED"
  | "SCANNING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export interface DocumentOutput {
  type: string;
  s3Key: string;
  nativeTrigger?: "SLIPSHEET" | "NATIVE";
}

export interface ProcessingError {
  code: string;
  message: string;
  detail?: string;
  retryable: boolean;
}

export interface DocumentView {
  documentId: string;
  filename: string;
  status: DocumentStatus;
  pipelineStage?: string;
  outputs?: DocumentOutput[];
  processingError?: ProcessingError;
}

export interface DocuploaderClientOptions {
  /** Public GraphQL HTTP endpoint (e.g., https://docuploader-api.sandbox.opus2.internal/graphql). */
  graphqlUrl: string;
  /** WebSocket endpoint for `Document.statusChanged` subscriptions. */
  graphqlWsUrl: string;
  /** A function returning a fresh OIDC access token. Called on every request. */
  getToken: () => Promise<string> | string;
}
