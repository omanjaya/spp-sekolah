/**
 * Prisma client singleton.
 *
 * In dev mode Next.js HMR will re-import modules, which can create multiple
 * PrismaClient instances and exhaust the connection pool. Caching on globalThis
 * prevents that.
 *
 * Usage: `import { prisma } from '@/lib/db'`
 */
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
