import { readFileSync } from "node:fs";

/**
 * RSS sampler. On Linux reads /proc/self/status (matches kubectl-style RSS
 * accounting); on other platforms falls back to process.memoryUsage().rss.
 *
 * Note: V8's GC schedule can mask short-lived allocations. Use generous
 * bounds in assertions (e.g. "growth < 10× per-chunk size", not "growth ==
 * per-chunk size") to keep the test stable.
 */
export class RssSampler {
  private samples: number[] = [];
  private baseline = 0;
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs = 50) {
    this.baseline = this.read();
    this.samples = [this.baseline];
    this.timer = setInterval(() => this.samples.push(this.read()), intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.samples.push(this.read());
  }

  /** Peak RSS observed since start(), in bytes. */
  peakBytes(): number {
    return this.samples.reduce((a, b) => Math.max(a, b), 0);
  }

  /** RSS growth from baseline to peak, in bytes. */
  growthBytes(): number {
    return this.peakBytes() - this.baseline;
  }

  private read(): number {
    if (process.platform === "linux") {
      try {
        const status = readFileSync("/proc/self/status", "utf-8");
        const match = status.match(/^VmRSS:\s+(\d+)\s+kB/m);
        if (match) return Number(match[1]) * 1024;
      } catch {
        // fall through to process.memoryUsage()
      }
    }
    return process.memoryUsage().rss;
  }
}
