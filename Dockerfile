# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps (production dependencies only) ──────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
# Prisma engines need to be generated to be present; we still install full
# runtime deps here. devDependencies are omitted to keep node_modules lean.
RUN npm ci --omit=dev

# ─── Stage 2: builder (full deps, compile Next.js) ─────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time secret required by src/lib/auth.ts guard. Not embedded in final
# image — runner stage only COPYs built artifacts, not env.
ARG NEXTAUTH_SECRET=build-time-placeholder-not-used-at-runtime
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET

RUN npx prisma generate
RUN npm run build

# ─── Stage 3: runner (slim, non-root) ──────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init openssl wget

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

# Prisma: schema + migrations + generated client engine
COPY --from=builder --chown=nextjs:nodejs /app/prisma                     ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma       ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma       ./node_modules/@prisma

# Production node_modules (needed for prisma CLI invoked in entrypoint
# and any runtime deps Next.js standalone doesn't bundle).
# Note: copy the entire prisma package directory — the .bin symlink
# dereferences on COPY and drops sibling wasm files if copied separately.
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/prisma        ./node_modules/prisma
RUN mkdir -p ./node_modules/.bin \
 && ln -sf ../prisma/build/index.js ./node_modules/.bin/prisma \
 && chown -h nextjs:nodejs ./node_modules/.bin/prisma

# Folder upload (di-mount sebagai volume) harus milik user app, kalau tidak
# upload bukti pembayaran gagal EACCES. Volume baru mewarisi owner ini.
RUN mkdir -p /app/data/uploads/pembayaran && chown -R nextjs:nodejs /app/data

# Entrypoint
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--", "/app/entrypoint.sh"]
