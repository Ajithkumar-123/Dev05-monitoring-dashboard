// Package idempotency derives idempotency keys for state-changing mutations on
// docuploader-api-documents. Per the design, updateDocumentStatus uses a key
// derived from (executionId, toState, phase); createDocument keys are
// caller-supplied.
package idempotency

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
)

// DeriveUpdateStatusKey returns the deterministic idempotency key used by
// updateDocumentStatus for the (executionId, toState, phase) triple.
//
// Each component is length-prefixed (big-endian uint32 byte-length, then
// UTF-8 bytes) before being fed to the hash. This is collision-safe under
// adversarial inputs — concatenating components with a delimiter is NOT,
// because an attacker can move characters across the delimiter boundary.
//
// The result is a hex-encoded SHA-256 digest, safe to log directly.
// Bit-identical across Go / Python / TypeScript implementations.
func DeriveUpdateStatusKey(executionID, toState, phase string) string {
	h := sha256.New()
	for _, s := range [3]string{executionID, toState, phase} {
		var lenBuf [4]byte
		binary.BigEndian.PutUint32(lenBuf[:], uint32(len(s)))
		_, _ = h.Write(lenBuf[:])
		_, _ = h.Write([]byte(s))
	}
	return hex.EncodeToString(h.Sum(nil))
}
