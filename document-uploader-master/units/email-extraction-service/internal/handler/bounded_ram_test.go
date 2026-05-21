package handler

import (
	"bytes"
	"crypto/rand"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"os"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"
)

// TestEMLStreamingIsBoundedRAM asserts that streaming parse of a multipart
// EML via Go stdlib (net/mail + mime/multipart) keeps peak RSS bounded by
// per-part chunk size, NOT by total attachment payload or attachment count.
//
// This validates the streaming pattern used by handler.handleOne. The test
// exercises the stdlib primitives directly (not the full handler) because
// the handler is tightly coupled to S3 + SQS clients; refactoring those
// behind interfaces for mocking is a separate concern.
//
// Property mirrors the TypeScript zip-extraction bounded-RAM test
// (units/zip-extraction-service/tests/bounded-ram.test.ts): build synthetic
// archives of increasing total size with a fixed per-entry size, sample
// RSS growth during streaming-extract, assert growth is bounded.
func TestEMLStreamingIsBoundedRAM(t *testing.T) {
	const attachmentBytes = 1_000_000  // 1 MB per attachment
	const growthCeiling = 150_000_000  // 150 MB growth ceiling; must not scale with email size

	cases := []struct {
		name             string
		attachmentCount  int
	}{
		{"10 attachments (~10 MB total)", 10},
		{"50 attachments (~50 MB total)", 50},
		{"200 attachments (~200 MB total)", 200},
	}

	// Run sequentially to make GC + RSS sampling meaningful.
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			emlPath, err := buildSyntheticEML(tc.attachmentCount, attachmentBytes)
			if err != nil {
				t.Fatalf("build EML: %v", err)
			}
			defer os.Remove(emlPath)

			// Let GC release builder allocations before sampling baseline.
			runtime.GC()
			baseline := readRSS(t)

			peak := baseline
			quit := make(chan struct{})
			samplerDone := make(chan struct{})
			go func() {
				defer close(samplerDone)
				ticker := time.NewTicker(50 * time.Millisecond)
				defer ticker.Stop()
				for {
					select {
					case <-quit:
						return
					case <-ticker.C:
						if r := readRSS(t); r > peak {
							peak = r
						}
					}
				}
			}()

			partCount, err := streamParseEML(emlPath)
			close(quit)
			<-samplerDone

			if err != nil {
				t.Fatalf("parse EML: %v", err)
			}
			if partCount != tc.attachmentCount {
				t.Fatalf("part count: got %d want %d", partCount, tc.attachmentCount)
			}

			growth := int64(peak) - int64(baseline)
			t.Logf("attachments=%d baseline=%d MB peak=%d MB growth=%d MB",
				tc.attachmentCount, baseline/1_000_000, peak/1_000_000, growth/1_000_000)

			if growth > growthCeiling {
				t.Fatalf("RSS growth %d B exceeds ceiling %d B — streaming is unbounded",
					growth, growthCeiling)
			}
		})
	}
}

// buildSyntheticEML writes a multipart EML to a tempfile, streaming each
// attachment so the builder stays bounded in RAM.
func buildSyntheticEML(attachmentCount, attachmentBytes int) (string, error) {
	f, err := os.CreateTemp("", "synthetic-*.eml")
	if err != nil {
		return "", err
	}
	defer f.Close()
	path := f.Name()

	w := multipart.NewWriter(f)

	// RFC 822 headers + multipart boundary.
	header := strings.Join([]string{
		"From: sender@example.test",
		"To: recipient@example.test",
		"Subject: Bounded-RAM property test",
		"MIME-Version: 1.0",
		"Content-Type: " + mime.FormatMediaType("multipart/mixed", map[string]string{"boundary": w.Boundary()}),
		"",
		"This is a multi-part message in MIME format.",
		"",
	}, "\r\n")
	if _, err := io.WriteString(f, header); err != nil {
		return "", err
	}

	chunkBuf := make([]byte, 64*1024)
	for i := 0; i < attachmentCount; i++ {
		partHeader := make(map[string][]string)
		partHeader["Content-Type"] = []string{"application/octet-stream"}
		partHeader["Content-Disposition"] = []string{
			"attachment; filename=" + strconv.Quote(fmt.Sprintf("attachment-%06d.bin", i)),
		}
		part, err := w.CreatePart(partHeader)
		if err != nil {
			return "", err
		}
		remaining := attachmentBytes
		for remaining > 0 {
			n := len(chunkBuf)
			if n > remaining {
				n = remaining
			}
			if _, err := rand.Read(chunkBuf[:n]); err != nil {
				return "", err
			}
			if _, err := part.Write(chunkBuf[:n]); err != nil {
				return "", err
			}
			remaining -= n
		}
	}
	if err := w.Close(); err != nil {
		return "", err
	}
	return path, nil
}

// streamParseEML opens the EML, parses headers, and iterates parts via
// multipart.NewReader, draining each part body. Returns the part count.
func streamParseEML(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	em, err := mail.ReadMessage(f)
	if err != nil {
		return 0, err
	}
	contentType := em.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		return 0, err
	}
	if !strings.HasPrefix(mediaType, "multipart/") {
		return 0, fmt.Errorf("not multipart: %s", mediaType)
	}

	mr := multipart.NewReader(em.Body, params["boundary"])
	count := 0
	drainBuf := make([]byte, 64*1024)
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, err
		}
		// Drain — discards bytes without buffering.
		if _, err := io.CopyBuffer(io.Discard, part, drainBuf); err != nil {
			_ = part.Close()
			return count, err
		}
		_ = part.Close()
		count++
	}
	return count, nil
}

// readRSS returns the current process's RSS in bytes. Linux reads
// /proc/self/status (matches kubectl-style RSS accounting). Other platforms
// fall back to runtime.MemStats.Sys (less accurate but portable).
func readRSS(t *testing.T) uint64 {
	t.Helper()
	if data, err := os.ReadFile("/proc/self/status"); err == nil {
		for _, line := range bytes.Split(data, []byte("\n")) {
			if !bytes.HasPrefix(line, []byte("VmRSS:")) {
				continue
			}
			fields := bytes.Fields(line)
			if len(fields) < 2 {
				return 0
			}
			n, err := strconv.ParseUint(string(fields[1]), 10, 64)
			if err != nil {
				return 0
			}
			return n * 1024
		}
	}
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return m.Sys
}
