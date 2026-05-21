/**
 * Bounded-RAM property test for zip-extraction-service.
 *
 * Per requirements.md NFR-1.2, peak RAM during ZIP extraction must be bounded
 * by per-entry chunk size, NOT by total archive size or entry count. This
 * test asserts that invariant by extracting synthesised ZIPs of increasing
 * total size with a fixed per-entry size and observing RSS growth.
 *
 * The test exercises the same `unzipper.Parse()` streaming primitive that
 * the production handler uses (see src/index.ts). It does NOT invoke the
 * handler directly because the handler is tightly coupled to AWS SDK
 * singletons at module top-level; a future refactor that injects a stream
 * source would let the property test run end-to-end against handler.handle.
 */

import { describe, it, expect, afterAll } from "vitest";
import { createReadStream, unlinkSync, statSync } from "node:fs";
import unzipper from "unzipper";
import { buildSyntheticZip } from "./helpers/zip-builder.js";
import { RssSampler } from "./helpers/rss-sampler.js";

const ENTRY_BYTES = 1_000_000;                              // 1 MB per entry
const TOTAL_SIZES = [10_000_000, 50_000_000, 200_000_000];  // 10, 50, 200 MB archives
const GROWTH_CEILING_BYTES = 100_000_000;                   // 100 MB growth ceiling — must not scale with archive size

const tmpFiles: string[] = [];
afterAll(() => {
  for (const f of tmpFiles) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
});

async function streamExtract(zipPath: string): Promise<number> {
  let entryCount = 0;
  await new Promise<void>((resolve, reject) => {
    createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on("entry", (entry: unzipper.Entry) => {
        entry.autodrain();
        entryCount++;
      })
      .on("error", reject)
      .on("finish", () => resolve());
  });
  return entryCount;
}

/** Try to force GC if vitest was launched with --expose-gc. Noop otherwise. */
function tryGC(): void {
  // @ts-expect-error global.gc only exists when --expose-gc is set
  if (typeof global.gc === "function") global.gc();
}

describe.sequential("bounded-RAM property for zip-extraction streaming pattern", () => {
  it.each(TOTAL_SIZES)(
    "RSS growth stays bounded extracting a %i-byte archive (1 MB/entry)",
    async (totalBytes) => {
      const zipPath = await buildSyntheticZip({ totalBytes, entryBytes: ENTRY_BYTES });
      tmpFiles.push(zipPath);
      const onDiskBytes = statSync(zipPath).size;

      // Give V8 a chance to release builder-side allocations before sampling.
      tryGC();
      await new Promise((r) => setTimeout(r, 100));

      const sampler = new RssSampler();
      sampler.start();
      const entries = await streamExtract(zipPath);
      sampler.stop();

      const growthMB = sampler.growthBytes() / 1_000_000;
      const peakMB = sampler.peakBytes() / 1_000_000;
      const onDiskMB = onDiskBytes / 1_000_000;

      // eslint-disable-next-line no-console
      console.log(
        `[bounded-ram] archive=${onDiskMB.toFixed(1)} MB entries=${entries} ` +
        `growth=${growthMB.toFixed(1)} MB peak=${peakMB.toFixed(1)} MB`,
      );

      expect(entries).toBe(Math.ceil(totalBytes / ENTRY_BYTES));
      // The binding invariant: growth must NOT scale with archive size.
      // 100 MB ceiling holds for any archive size; production per-pod budget
      // is 512 MB Guaranteed-QoS per values.yaml.
      expect(sampler.growthBytes()).toBeLessThan(GROWTH_CEILING_BYTES);
    },
    120_000, // 120s per case — large archives take time to build + extract
  );
});
