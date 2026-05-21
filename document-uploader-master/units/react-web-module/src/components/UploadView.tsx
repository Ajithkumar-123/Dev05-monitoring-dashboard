// Upload view — drag in real files and watch them flow through the simulated
// docuploader pipeline (received → classification → extraction → conversion →
// ocr → assembly → completed). Pure browser-side: no backend, no GraphQL, no
// network. The user can download mock outputs (PDF + OCR text + metadata JSON)
// at the end.
import { useCallback, useRef, useState } from "react";
import { pushNotification } from "../notifications/store.js";

type Stage = "received" | "classification" | "extraction" | "conversion" | "ocr" | "assembly" | "completed";

const STAGES: Stage[] = ["received", "classification", "extraction", "conversion", "ocr", "assembly", "completed"];

type StageStatus = "PENDING" | "RUNNING" | "DONE" | "SKIPPED" | "FAILED";

type DocOutput = {
  kind: "pdf" | "ocr-text" | "metadata";
  blob: Blob;
  filename: string;
};

type UploadedDoc = {
  id: string;
  filename: string;
  size: number;
  mime: string;
  fileType: "pdf" | "docx" | "xlsx" | "image" | "email" | "zip" | "other";
  uploadedAt: number;
  currentStage: Stage;
  stageStatus: Record<Stage, StageStatus>;
  outputs: DocOutput[];
  errorMessage?: string;
  durationMs?: number;
  rawFile: File;
};

interface Props {
  workspace?: string;
}

export function UploadView({ workspace = "demo-workspace" }: Props) {
  const [docs, setDocs] = useState<UploadedDoc[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    const next: UploadedDoc[] = fileArr.map((f) => {
      const fileType = detectFileType(f);
      return {
        id: `doc-${Math.random().toString(36).slice(2, 10)}`,
        filename: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        fileType,
        uploadedAt: Date.now(),
        currentStage: "received",
        stageStatus: initialStageStatus(),
        outputs: [],
        rawFile: f,
      };
    });
    setDocs((cur) => [...next, ...cur]);
    for (const d of next) {
      void runPipeline(d, setDocs);
    }
  }, []);

  return (
    <div className="docu-upload">
      <header className="docu-upload__hero">
        <div>
          <h2 className="docu-upload__title">Upload a document</h2>
          <p className="docu-upload__subtitle">
            Drop files below — they flow through the simulated docuploader pipeline
            (classification → conversion → OCR → assembly). All processing is local;
            nothing leaves your browser.
          </p>
          <div className="docu-upload__workspace">workspace · <strong>{workspace}</strong></div>
        </div>
      </header>

      <div
        className={`docu-upload__drop ${dragOver ? "docu-upload__drop--over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="docu-upload__drop-icon">📎</div>
        <div className="docu-upload__drop-text">
          <strong>Drop files here</strong> or click to browse
        </div>
        <div className="docu-upload__drop-hint">
          accepts PDF · DOCX · XLSX · PPTX · EML/MSG · ZIP · JPG/PNG · MP4 · any other
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      <section className="docu-upload__list">
        <div className="docu-upload__list-header">
          <h3 className="docu-upload__list-title">
            Recently uploaded
            <span className="docu-monitor__group-count">{docs.length}</span>
          </h3>
          {docs.length > 0 && (
            <button className="docu-link-btn" onClick={() => setDocs([])}>Clear all</button>
          )}
        </div>
        {docs.length === 0 && (
          <div className="docu-upload__empty">
            No uploads yet. Drop a file above to begin.
          </div>
        )}
        {docs.map((d) => <DocCard key={d.id} doc={d} />)}
      </section>
    </div>
  );
}

function DocCard({ doc }: { doc: UploadedDoc }) {
  const [expanded, setExpanded] = useState(true);
  const elapsedSec = doc.durationMs ? (doc.durationMs / 1000).toFixed(1) : ((Date.now() - doc.uploadedAt) / 1000).toFixed(1);
  const isDone = doc.currentStage === "completed" || doc.stageStatus.completed === "DONE";
  const isFailed = Object.values(doc.stageStatus).some((s) => s === "FAILED");

  return (
    <div className={`docu-upload__card ${isFailed ? "docu-upload__card--failed" : ""} ${isDone ? "docu-upload__card--done" : ""}`}>
      <button className="docu-upload__card-head" onClick={() => setExpanded((e) => !e)}>
        <div className="docu-upload__card-left">
          <span className={`docu-doc__type docu-doc__type--${doc.fileType}`}>{doc.fileType}</span>
          <div>
            <div className="docu-upload__card-name">{doc.filename}</div>
            <div className="docu-upload__card-sub">
              {prettyBytes(doc.size)} · {elapsedSec}s · <code>{doc.id}</code>
            </div>
          </div>
        </div>
        <div className="docu-upload__card-right">
          <StatusBadge stage={doc.currentStage} failed={isFailed} done={isDone} />
          <span className="docu-doc__chevron">{expanded ? "▾" : "▸"}</span>
        </div>
      </button>

      <div className="docu-upload__progress-row">
        {STAGES.filter((s) => s !== "completed").map((s) => (
          <div key={s} className="docu-upload__progress-cell">
            <span
              className={`docu-stage docu-stage--${doc.stageStatus[s].toLowerCase()}`}
              title={`${s}: ${doc.stageStatus[s]}`}
            />
            <span className="docu-upload__progress-label">{s}</span>
          </div>
        ))}
      </div>

      {expanded && (
        <div className="docu-upload__card-body">
          {doc.errorMessage && (
            <div className="docu-doc__error">⚠ {doc.errorMessage}</div>
          )}

          <div className="docu-doc__detail-section">
            <div className="docu-doc__detail-label">Stage status</div>
            <div className="docu-doc__stage-list">
              {STAGES.map((s) => (
                <div key={s} className="docu-doc__stage-row">
                  <span className="docu-doc__stage-name">{s}</span>
                  <span className={`docu-stage-pill docu-stage-pill--${doc.stageStatus[s].toLowerCase()}`}>
                    {doc.stageStatus[s]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="docu-doc__detail-section">
            <div className="docu-doc__detail-label">Outputs ({doc.outputs.length})</div>
            {doc.outputs.length === 0 && <div className="docu-doc__empty">No outputs yet — pipeline still running.</div>}
            {doc.outputs.map((o) => (
              <div key={o.filename} className="docu-output">
                <span className={`docu-output__kind docu-output__kind--${o.kind.replace(/[^a-z]/g, "")}`}>{o.kind}</span>
                <code className="docu-output__uri">{o.filename}</code>
                <span className="docu-output__size">{prettyBytes(o.blob.size)}</span>
                <button
                  className="docu-output__download"
                  title={`Download ${o.kind}`}
                  onClick={() => downloadBlob(o.blob, o.filename)}
                >⬇</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ stage, failed, done }: { stage: Stage; failed: boolean; done: boolean }) {
  let label = stage.toUpperCase();
  let cls = "running";
  if (failed) { label = "FAILED"; cls = "failed"; }
  else if (done) { label = "COMPLETED"; cls = "done"; }
  return <span className={`docu-upload__badge docu-upload__badge--${cls}`}>{label}</span>;
}

// --- pipeline simulation ----------------------------------------------------

const STAGE_DELAY: Record<Stage, [number, number]> = {
  received:       [200, 400],
  classification: [600, 1200],
  extraction:     [800, 1600],
  conversion:     [1500, 3500],
  ocr:            [1200, 2800],
  assembly:       [500, 1000],
  completed:      [0, 0],
};

function stageRelevant(stage: Stage, ft: UploadedDoc["fileType"]): boolean {
  if (stage === "extraction") return ft === "zip" || ft === "email";
  if (stage === "conversion") return ft !== "pdf" && ft !== "image";
  if (stage === "ocr") return ft === "pdf" || ft === "image" || ft === "email";
  return true;
}

async function runPipeline(doc: UploadedDoc, setDocs: React.Dispatch<React.SetStateAction<UploadedDoc[]>>) {
  const startedAt = Date.now();
  let outputs: DocOutput[] = [];

  for (const stage of STAGES) {
    if (stage === "completed") {
      // Finalize: build outputs based on stages that ran
      outputs = await buildOutputs(doc);
      patchDoc(setDocs, doc.id, (d) => ({
        ...d,
        currentStage: "completed",
        stageStatus: { ...d.stageStatus, completed: "DONE" },
        outputs,
        durationMs: Date.now() - startedAt,
      }));
      return;
    }

    if (!stageRelevant(stage, doc.fileType)) {
      patchDoc(setDocs, doc.id, (d) => ({
        ...d,
        stageStatus: { ...d.stageStatus, [stage]: "SKIPPED" },
      }));
      continue;
    }

    // Mark RUNNING
    patchDoc(setDocs, doc.id, (d) => ({
      ...d,
      currentStage: stage,
      stageStatus: { ...d.stageStatus, [stage]: "RUNNING" },
    }));

    const [lo, hi] = STAGE_DELAY[stage];
    await sleep(lo + Math.random() * (hi - lo));

    // 4% chance of failure per real stage — keeps the demo honest
    if (Math.random() < 0.04) {
      const failMsg = pickFailureMessage(stage);
      patchDoc(setDocs, doc.id, (d) => ({
        ...d,
        currentStage: stage,
        stageStatus: { ...d.stageStatus, [stage]: "FAILED" },
        errorMessage: failMsg,
        durationMs: Date.now() - startedAt,
      }));
      pushNotification({
        severity: "error",
        title: `Upload failed: ${doc.filename}`,
        message: `${stage}: ${failMsg}`,
        source: "upload",
        link: "upload",
      });
      return;
    }

    patchDoc(setDocs, doc.id, (d) => ({
      ...d,
      stageStatus: { ...d.stageStatus, [stage]: "DONE" },
    }));
  }
}

function patchDoc(
  setDocs: React.Dispatch<React.SetStateAction<UploadedDoc[]>>,
  id: string,
  patch: (d: UploadedDoc) => UploadedDoc,
) {
  setDocs((cur) => cur.map((d) => (d.id === id ? patch(d) : d)));
}

async function buildOutputs(doc: UploadedDoc): Promise<DocOutput[]> {
  const out: DocOutput[] = [];
  const baseName = doc.filename.replace(/\.[^.]+$/, "");
  // PDF output: pass the original through (for PDFs) or echo the bytes with .pdf extension (demo only).
  out.push({
    kind: "pdf",
    blob: new Blob([await doc.rawFile.arrayBuffer()], { type: "application/pdf" }),
    filename: `${baseName}.pdf`,
  });
  // OCR text: stub with metadata header
  if (doc.fileType === "pdf" || doc.fileType === "image" || doc.fileType === "email") {
    const text = `# Mock OCR output for ${doc.filename}\n# Size: ${doc.size} bytes\n# In production this would be real extracted text.\n`;
    out.push({
      kind: "ocr-text",
      blob: new Blob([text], { type: "text/plain" }),
      filename: `${baseName}.ocr.txt`,
    });
  }
  // Metadata JSON
  const meta = {
    docId: doc.id,
    originalFilename: doc.filename,
    sizeBytes: doc.size,
    mime: doc.mime,
    fileType: doc.fileType,
    uploadedAt: new Date(doc.uploadedAt).toISOString(),
    stages: doc.stageStatus,
    durationMs: doc.durationMs ?? Date.now() - doc.uploadedAt,
  };
  out.push({
    kind: "metadata",
    blob: new Blob([JSON.stringify(meta, null, 2)], { type: "application/json" }),
    filename: `${baseName}.metadata.json`,
  });
  return out;
}

// --- helpers ----------------------------------------------------------------

function detectFileType(f: File): UploadedDoc["fileType"] {
  const ext = (f.name.split(".").pop() ?? "").toLowerCase();
  const mime = f.type;
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (["docx", "doc"].includes(ext) || mime.includes("wordprocessingml")) return "docx";
  if (["xlsx", "xls"].includes(ext) || mime.includes("spreadsheetml")) return "xlsx";
  if (["jpg", "jpeg", "png", "heic", "tiff", "gif", "webp"].includes(ext) || mime.startsWith("image/")) return "image";
  if (["msg", "eml"].includes(ext)) return "email";
  if (ext === "zip" || mime === "application/zip") return "zip";
  return "other";
}

function initialStageStatus(): Record<Stage, StageStatus> {
  return STAGES.reduce((acc, s) => ({ ...acc, [s]: "PENDING" }), {} as Record<Stage, StageStatus>);
}

function pickFailureMessage(stage: Stage): string {
  const opts: Record<Stage, string[]> = {
    received:       ["Upload payload truncated", "Workspace quota exceeded"],
    classification: ["Magic-byte detection failed", "Unsupported file type"],
    extraction:     ["Archive corrupt", "Email parser hit invalid MIME"],
    conversion:     ["Aspose pool exhausted, retried 3x", "Source has password protection"],
    ocr:            ["OCR confidence < 0.4 across all pages", "Tesseract OOM at page 23"],
    assembly:       ["S3 PutObject AccessDenied", "Output bundle exceeded size limit"],
    completed:      [],
  };
  const arr = opts[stage];
  return arr[Math.floor(Math.random() * arr.length)] ?? "Unknown failure";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function prettyBytes(n: number): string {
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (n > 1024 * 1024)        return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n > 1024)               return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
