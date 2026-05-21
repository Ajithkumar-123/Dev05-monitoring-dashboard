# react-web-module — Code Summary

| File | Purpose |
| --- | --- |
| `package.json` | pnpm; peer deps `react@^18` + `react-dom@^18`; deps `urql` (GraphQL client), `graphql-ws` (transport), `graphql`; dev deps include `vite`, `vitest`, `fast-check`, `msw`, `allure-vitest` |
| `tsconfig.json` | ES2022 + DOM lib; `jsx: react-jsx`; emits `dist/` declaration files |
| `vite.config.ts` | Library build emitting `dist/index.js` as an ES module; externalises `react` + `react-dom` |
| `src/index.ts` | Public surface: `DocumentUploader` component, `createDocuploaderClient` factory, type re-exports |
| `src/types.ts` | `DocumentStatus`, `DocumentOutput`, `ProcessingError`, `DocumentView`, `DocuploaderClientOptions` |
| `src/api/client.ts` | urql Client wired for HTTP queries/mutations + `graphql-transport-ws` subscription exchange; OIDC token read per-request via caller-supplied `getToken()` |
| `src/api/operations.ts` | GraphQL operations: `createBatch`, `createDocument`, `getDocument`, `documentStatusChanged` |
| `src/api/upload.ts` | Direct-to-S3 PUT via XHR (preserves server-set content-type per NFR-3.2); progress callback |
| `src/components/DocumentUploader.tsx` | Top-level embeddable component wrapping the urql `Provider`; tracks documents in local state |
| `src/components/UploadDropzone.tsx` | Drag-and-drop file selector: calls `createBatch` + `createDocument` per file, then direct-to-S3 PUT via the presigned URL |
| `src/components/StatusGrid.tsx` | Per-document `documentStatusChanged` subscription via `useSubscription`; renders status/stage/outputs grid |
| `src/components/OutputList.tsx` | Flat output list with SLIPSHEET badge for fallback outputs |

**MVP UX boundary** (matches `personas.md` + `requirements.md`):
- No inline preview or annotation
- No batch-level retry; failures must be re-uploaded
- No workspace-admin UI; tenant admins use GraphQL-direct or host-application admin tools
- Outputs surfaced via the API's `outputs` field; download-URL generation is host-app's responsibility (or a follow-on API addition)

**Wiring**: ECR repo `docuploader/react-web-module-bundler` (build-time only); the resulting `dist/` is served from CloudFront/S3 or imported directly into host applications via npm. IAM role is host-app responsibility (the module itself only uses the host-supplied OIDC token).

**Build**: `pnpm install --frozen-lockfile && pnpm build` → `dist/index.js` + `dist/index.d.ts` + sourcemap.
