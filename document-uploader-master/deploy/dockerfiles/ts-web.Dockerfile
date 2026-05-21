# React static build served by nginx. Used by: react-web-module.
ARG UNIT_NAME=react-web-module

FROM node:22-alpine AS build
ARG UNIT_NAME
WORKDIR /src

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY units/${UNIT_NAME} units/${UNIT_NAME}

RUN pnpm install --frozen-lockfile --filter "./units/${UNIT_NAME}..."
RUN pnpm -C units/${UNIT_NAME} run build

FROM nginx:1.27-alpine AS runtime
ARG UNIT_NAME
COPY --from=build /src/units/${UNIT_NAME}/dist /usr/share/nginx/html
# Health endpoint: nginx serves /healthz with 200 (override default conf).
RUN echo 'server { listen 80; root /usr/share/nginx/html; location = /healthz { return 200; access_log off; } location / { try_files $uri /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 80
