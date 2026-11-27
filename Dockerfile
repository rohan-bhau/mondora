FROM ollama/ollama:0.40.18 AS ollama_bin

FROM node:24-bookworm-slim AS strapi_builder
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /strapi
COPY strapi/package.json strapi/package-lock.json ./
RUN npm ci

COPY strapi/ ./
RUN rm -f /strapi/.env*
ENV STRAPI_TELEMETRY_DISABLED=true
RUN NODE_ENV=production npm run build

FROM node:24-bookworm-slim AS web_builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
COPY lib ./lib
COPY public ./public
COPY scripts ./scripts
COPY next.config.ts tsconfig.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN NODE_ENV=production npm run build

FROM node:24-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates python3 python3-venv \
  && python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir "yt-dlp[default]" \
  && rm -rf /var/lib/apt/lists/*

COPY --from=ollama_bin /bin/ollama /usr/bin/ollama
COPY --from=ollama_bin /usr/lib/ollama /usr/lib/ollama

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV STRAPI_TELEMETRY_DISABLED=true
ENV YTDLP_BIN=/opt/venv/bin/yt-dlp
ENV DATA_DIR=/data

COPY --from=web_builder /app/package.json /app/package-lock.json /app/next.config.ts ./
COPY --from=web_builder /app/node_modules ./node_modules
COPY --from=web_builder /app/.next ./.next
COPY --from=web_builder /app/public ./public
COPY --from=web_builder /app/scripts ./scripts
COPY --from=strapi_builder /strapi ./strapi

RUN mkdir -p /data/strapi /data/ollama

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
