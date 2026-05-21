# Build context = repo root; uses pnpm workspaces. The unit's package.json must
# have a build script that emits to dist/ and a start script that runs from dist/.
# Used by: classification, ocr, zip-extraction, output-assembly, slipsheet,
# html-conversion-typescript-sidecar, tiff-cog, image-tiff-conversion, media-conversion.
ARG UNIT_NAME

FROM node:22-alpine AS build
ARG UNIT_NAME
WORKDIR /src

RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy the whole workspace skeleton needed for `pnpm install` to resolve `workspace:*` deps.
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY libs/data-access/ts libs/data-access/ts
COPY units/${UNIT_NAME} units/${UNIT_NAME}

# R-9 fix: --filter "./units/X..." installs only the lib's prod deps (no tsc),
# so we add an explicit lib filter so its devDependencies (typescript, etc.)
# are installed too, then build the lib before the consumer.
RUN pnpm install --frozen-lockfile \
      --filter "./units/${UNIT_NAME}..." \
      --filter "./libs/data-access/ts"

RUN pnpm -C libs/data-access/ts run build
RUN pnpm -C units/${UNIT_NAME} run build

# Prune dev deps for the runtime layer. pnpm v10 requires --legacy for `deploy`
# unless workspace packages are injected (R-11 fix).
RUN pnpm --filter "./units/${UNIT_NAME}" deploy --legacy --prod /out

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /out /app
USER node
CMD ["node", "dist/index.js"]
