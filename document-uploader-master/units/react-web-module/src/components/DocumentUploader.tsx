import { useState, useCallback } from "react";
import { Provider } from "urql";
import { UploadDropzone } from "./UploadDropzone.js";
import { StatusGrid } from "./StatusGrid.js";
import type { Client } from "urql";
import type { DocumentView } from "../types.js";

interface Props {
  client: Client;
  workspaceId: string;
}

/**
 * Top-level embeddable component.
 *
 * Limitations vs full vision (MVP boundary):
 *   - No inline preview / annotation
 *   - No batch-level retry; failures must be re-uploaded
 *   - No workspace-admin UI; tenant admins use GraphQL-direct calls
 */
export function DocumentUploader({ client, workspaceId }: Props) {
  const [docs, setDocs] = useState<DocumentView[]>([]);

  const onDocumentCreated = useCallback((doc: DocumentView) => {
    setDocs((prev) => [...prev, doc]);
  }, []);

  const onStatusChanged = useCallback((updated: DocumentView) => {
    setDocs((prev) => prev.map((d) => (d.documentId === updated.documentId ? { ...d, ...updated } : d)));
  }, []);

  return (
    <Provider value={client}>
      <div className="docuploader-root">
        <UploadDropzone workspaceId={workspaceId} onDocumentCreated={onDocumentCreated} />
        <StatusGrid documents={docs} onStatusChanged={onStatusChanged} />
      </div>
    </Provider>
  );
}
