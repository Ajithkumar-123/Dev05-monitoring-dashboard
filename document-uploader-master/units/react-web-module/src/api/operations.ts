export const CREATE_BATCH = /* GraphQL */ `
  mutation CreateBatch($workspaceId: ID!, $idempotencyKey: String!) {
    createBatch(workspaceId: $workspaceId, idempotencyKey: $idempotencyKey) {
      batchId
    }
  }
`;

export const CREATE_DOCUMENT = /* GraphQL */ `
  mutation CreateDocument($batchId: ID!, $filename: String!, $idempotencyKey: String!) {
    createDocument(batchId: $batchId, filename: $filename, idempotencyKey: $idempotencyKey) {
      document { documentId filename }
      presignedUrl
      presignedUrlExpiresAt
    }
  }
`;

export const GET_DOCUMENT = /* GraphQL */ `
  query GetDocument($documentId: ID!) {
    document(id: $documentId) {
      documentId
      filename
      status
      pipelineStage
      outputs { type s3Key nativeTrigger }
      processingError { code message detail retryable }
    }
  }
`;

export const DOCUMENT_STATUS_CHANGED = /* GraphQL */ `
  subscription DocumentStatusChanged($documentId: ID!) {
    documentStatusChanged(documentId: $documentId) {
      documentId
      status
      pipelineStage
      outputs { type s3Key nativeTrigger }
      processingError { code message detail retryable }
    }
  }
`;
