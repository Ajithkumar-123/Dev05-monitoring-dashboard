import { createHash } from "node:crypto";

/**
 * Derive the deterministic idempotency key for updateDocumentStatus from the
 * (executionId, toState, phase) triple.
 *
 * Each component is length-prefixed (big-endian uint32 byte-length, then UTF-8
 * bytes) before being fed to the hash. This is collision-safe under adversarial
 * inputs — concatenating components with a delimiter is NOT, because an
 * attacker can move characters across the delimiter boundary.
 *
 * The result is a hex-encoded SHA-256 digest, safe to log directly.
 * Bit-identical across Go / Python / TypeScript implementations.
 */
export function deriveUpdateStatusKey(executionId: string, toState: string, phase: string): string {
  const h = createHash("sha256");
  for (const s of [executionId, toState, phase]) {
    const bytes = Buffer.from(s, "utf-8");
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(bytes.length);
    h.update(lenBuf);
    h.update(bytes);
  }
  return h.digest("hex");
}
