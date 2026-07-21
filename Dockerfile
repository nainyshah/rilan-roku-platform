# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm (pinned to v9 — repo stores patchedDependencies the pnpm-9 way)
RUN npm install -g pnpm@9

# Copy dependency manifests + patches first (layer cache)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --no-frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install pnpm (needed for production install)
RUN npm install -g pnpm@9

# Copy only what is needed to run (+ patches for patchedDependencies)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --no-frozen-lockfile

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle

# Non-root user for security
RUN addgroup -S rilan && adduser -S rilan -G rilan
USER rilan

EXPOSE 3000

CMD ["node", "dist/index.js"]
