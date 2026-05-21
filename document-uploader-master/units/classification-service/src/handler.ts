import { fileTypeFromBuffer } from "file-type";
import type { workspaces } from "@docuploader/data-access";

const EXT_TO_ROUTE: Record<string, string> = {
  pdf: "ocr-direct",
  doc: "convert/office",
  docx: "convert/office",
  rtf: "convert/office",
  xls: "convert/office",
  xlsx: "convert/office",
  ppt: "convert/office",
  pptx: "convert/office",
  odt: "convert/office",
  html: "convert/html",
  htm: "convert/html",
  png: "convert/image",
  jpg: "convert/image",
  jpeg: "convert/image",
  gif: "convert/image",
  tif: "convert/tiff",
  tiff: "convert/tiff",
  eml: "email",
  msg: "email",
  zip: "archive",
  mp3: "media",
  mp4: "media",
  wav: "media",
};

export async function classify(
  head: Buffer,
  s3Key: string,
  ws: workspaces.Workspace,
): Promise<string> {
  const ext = extractExtension(s3Key);
  if (ws.pipelineConfig.forcedSlipsheetExtensions?.includes(ext)) {
    return "slipsheet";
  }
  const detected = await fileTypeFromBuffer(head);
  const route = (detected?.ext && EXT_TO_ROUTE[detected.ext]) ?? EXT_TO_ROUTE[ext];
  return route ?? "slipsheet";
}

function extractExtension(key: string): string {
  const ix = key.lastIndexOf(".");
  return ix >= 0 ? key.slice(ix + 1).toLowerCase() : "";
}
