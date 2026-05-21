import { useEffect } from "react";
import { useSubscription } from "urql";
import { DOCUMENT_STATUS_CHANGED } from "../api/operations.js";
import type { DocumentView } from "../types.js";
import { OutputList } from "./OutputList.js";

interface Props {
  documents: DocumentView[];
  onStatusChanged: (doc: DocumentView) => void;
}

export function StatusGrid({ documents, onStatusChanged }: Props) {
  return (
    <div className="docuploader-status-grid" role="table">
      <div className="docuploader-status-header" role="row">
        <span>File</span><span>Status</span><span>Stage</span><span>Outputs</span>
      </div>
      {documents.map((doc) => (
        <StatusRow key={doc.documentId} doc={doc} onStatusChanged={onStatusChanged} />
      ))}
    </div>
  );
}

function StatusRow({ doc, onStatusChanged }: { doc: DocumentView; onStatusChanged: (d: DocumentView) => void }) {
  const [{ data }] = useSubscription<{ documentStatusChanged: DocumentView }>(
    { query: DOCUMENT_STATUS_CHANGED, variables: { documentId: doc.documentId } },
  );

  useEffect(() => {
    if (data?.documentStatusChanged) onStatusChanged(data.documentStatusChanged);
  }, [data, onStatusChanged]);

  return (
    <div className="docuploader-status-row" role="row" data-status={doc.status}>
      <span>{doc.filename}</span>
      <span>{doc.status}</span>
      <span>{doc.pipelineStage ?? ""}</span>
      <span>
        {doc.status === "COMPLETED" && doc.outputs ? (
          <OutputList outputs={doc.outputs} />
        ) : doc.status === "FAILED" && doc.processingError ? (
          <span title={doc.processingError.detail}>{doc.processingError.code}: {doc.processingError.message}</span>
        ) : (
          "…"
        )}
      </span>
    </div>
  );
}
