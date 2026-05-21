/**
 * Direct-to-S3 upload using a server-set presigned URL.
 *
 * The presigned URL's content-type is server-set (per FR-1.2 / NFR-3.2);
 * we MUST NOT override it. Browsers send the binary unchanged; progress
 * is observed via fetch streaming if available, else as a single completion
 * event.
 */
export async function uploadToPresignedUrl(
  presignedUrl: string,
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  // Modern browsers expose upload progress via XHR; fetch lacks a portable
  // upload-progress API. Using XHR keeps the integration future-compatible
  // with host applications that wire progress bars to onProgress.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`presigned PUT failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("presigned PUT network error"));
    xhr.send(file);
  });
}
