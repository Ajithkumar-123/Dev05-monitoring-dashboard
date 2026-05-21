import { useCallback, useState } from "react";
import { useMutation } from "urql";
import { CREATE_BATCH, CREATE_DOCUMENT } from "../api/operations.js";
import { uploadToPresignedUrl } from "../api/upload.js";
import type { DocumentView } from "../types.js";

interface Props {
  workspaceId: string;
  onDocumentCreated: (doc: DocumentView) => void;
}

export function UploadDropzone({ workspaceId, onDocumentCreated }: Props) {
  const [, createBatch] = useMutation<{ createBatch: { batchId: string } }>(CREATE_BATCH);
  const [, createDocument] = useMutation<
    {
      createDocument: {
        document: { documentId: string; filename: string };
        presignedUrl: string;
      };
    }
  >(CREATE_DOCUMENT);
  const [busy, setBusy] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList) => {
      setBusy(true);
      try {
        const batchKey = crypto.randomUUID();
        const batchRes = await createBatch({ workspaceId, idempotencyKey: batchKey });
        if (batchRes.error) throw batchRes.error;
        const batchId = batchRes.data!.createBatch.batchId;

        for (const file of Array.from(files)) {
          const docKey = crypto.randomUUID();
          const docRes = await createDocument({ batchId, filename: file.name, idempotencyKey: docKey });
          if (docRes.error) throw docRes.error;
          const { document, presignedUrl } = docRes.data!.createDocument;
          await uploadToPresignedUrl(presignedUrl, file);
          onDocumentCreated({
            documentId: document.documentId,
            filename: document.filename,
            status: "UPLOADED",
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [workspaceId, createBatch, createDocument, onDocumentCreated],
  );

  return (
    <div
      className="docuploader-dropzone"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
      }}
    >
      <label>
        <input
          type="file"
          multiple
          disabled={busy}
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
        <span>{busy ? "Uploading…" : "Drop files or click to upload"}</span>
      </label>
    </div>
  );
}
