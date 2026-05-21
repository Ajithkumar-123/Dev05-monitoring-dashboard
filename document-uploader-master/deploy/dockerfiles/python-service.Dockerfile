# uv-managed Python service. Build context = repo root so the libs/data-access/py
# path source resolves. Used by: pdf-processing-service, office-conversion-orchestrator-sidecar.
ARG UNIT_NAME

FROM python:3.13-slim AS build
ARG UNIT_NAME
RUN pip install --no-cache-dir uv==0.4.*

WORKDIR /src
COPY libs/data-access/py libs/data-access/py
COPY units/${UNIT_NAME} units/${UNIT_NAME}

WORKDIR /src/units/${UNIT_NAME}
RUN uv sync --locked --no-dev || uv sync --no-dev

FROM python:3.13-slim AS runtime
ARG UNIT_NAME
WORKDIR /app

# Copy the unit's source + its venv with installed deps.
COPY --from=build /src/units/${UNIT_NAME}/src /app/src
COPY --from=build /src/units/${UNIT_NAME}/.venv /app/.venv
COPY --from=build /src/libs/data-access/py /libs/data-access/py

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Each Python unit declares its module entrypoint as `python -m <pkg>`.
ARG UNIT_NAME
ENV UNIT_NAME=${UNIT_NAME}
CMD ["sh", "-c", "python -m ${UNIT_NAME//-/_}"]
