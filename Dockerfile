# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# better-sqlite3 là native module: cần toolchain để biên dịch nếu không có bản dựng sẵn.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# postinstall chạy prisma generate, cần schema có sẵn ở trên.
RUN npm ci --legacy-peer-deps

# ---------- build ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Chốt chặn phụ cho RAM. Nút thắt thật khi dựng ngay trên máy chủ dùng chung
# là CPU chứ không phải bộ nhớ (xem setup.md mục L), nhưng trần heap giúp bản
# dựng vỡ gọn trong chính nó thay vì lôi cả máy xuống theo.
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
RUN npx prisma generate && npm run build

# ---------- migrator ----------
# Prisma CLI kéo theo cả một cây phụ thuộc riêng (effect, ...) mà bản standalone
# không gói. Nên migration chạy bằng chính tầng build — nơi node_modules còn đủ.
FROM build AS migrator
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/app.db
CMD ["npx", "prisma", "migrate", "deploy"]

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      openssl ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    DATABASE_PATH=/app/data/app.db

# Next.js standalone đã gói sẵn node_modules cần thiết.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
