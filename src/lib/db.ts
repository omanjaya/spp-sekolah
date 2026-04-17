/**
 * Prisma client singleton.
 *
 * In dev mode Next.js HMR will re-import modules, which can create multiple
 * PrismaClient instances and exhaust the connection pool. Caching on globalThis
 * prevents that.
 *
 * Usage: `import { prisma } from '@/lib/db'`
 */
import { PrismaClient, Prisma } from '@prisma/client'

import logger from '@/lib/logger'

const SLOW_QUERY_MS = Number(process.env.PRISMA_SLOW_QUERY_MS ?? 500)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'error' },
      { emit: 'stdout', level: 'warn' },
    ],
  })

  // Log slow queries (>SLOW_QUERY_MS) to pino for observability.
  client.$on('query' as never, (e: Prisma.QueryEvent) => {
    if (e.duration >= SLOW_QUERY_MS) {
      logger.warn(
        { duration: e.duration, query: e.query, params: e.params },
        'prisma.slow_query',
      )
    }
  })

  return client
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
