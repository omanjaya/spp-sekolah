# syntax=docker/dockerfile:1.7

# ─── Stage 1: deps (production dependencies only) ──────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
# Prisma engines need to be generated to be present; we still install full
# runtime deps here. devDependencies are omitted to keep node_modules lean.
RUN npm ci --omit=dev

# ─── Stage 2: builder (full deps, compile Next.js) ─────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate
RUN npm run build

# ─── Stage 3: runner (slim, non-root) ──────────────────────────────────────
FROM node:20-alpine AS runner
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
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/prisma        ./node_modules/prisma
COPY --from=deps    --chown=nextjs:nodejs /app/node_modules/.bin/prisma   ./node_modules/.bin/prisma

# Entrypoint
COPY --chown=nextjs:nodejs scripts/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

ENTRYPOINT ["dumb-init", "--", "/app/entrypoint.sh"]
