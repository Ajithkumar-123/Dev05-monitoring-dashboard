import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import archiver from "archiver";

/**
 * Synthesise a ZIP archive with N entries, each `entryBytes` bytes of random
 * data. Returns the on-disk path.
 *
 * Each entry uses a single Buffer allocation (size known to archiver, which
 * keeps the ZIP local-file-header valid). Allocations are released after
 * `archive.append` consumes them; the test calls `global.gc?.()` after build
 * before sampling baseline, so any residual builder allocation does not
 * pollute the extraction-phase RSS growth measurement.
 */
export async function buildSyntheticZip(opts: {
  totalBytes: number;
  entryBytes: number;
  outDir?: string;
}): Promise<string> {
  const { totalBytes, entryBytes } = opts;
  const outDir = opts.outDir ?? tmpdir();
  const outPath = join(outDir, `zip-${Date.now()}-${randomBytes(4).toString("hex")}.zip`);

  const entryCount = Math.ceil(totalBytes / entryBytes);
  const archive = archiver("zip", { store: true });
  const out = createWriteStream(outPath);

  const done = new Promise<void>((resolve, reject) => {
    out.on("close", () => resolve());
    out.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(out);
  for (let i = 0; i < entryCount; i++) {
    archive.append(randomBytes(entryBytes), {
      name: `entry-${String(i).padStart(6, "0")}.bin`,
    });
  }
  await archive.finalize();
  await done;
  return outPath;
}
