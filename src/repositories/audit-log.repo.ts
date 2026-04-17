import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const auditLogRepo = {
  async findById(id: string) {
    return prisma.auditLog.findUnique({ where: { id } })
  },
  async findMany(args?: Prisma.AuditLogFindManyArgs) {
    return prisma.auditLog.findMany(args)
  },
  async listRecent(take = 100) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    })
  },
  async listByUser(userId: string, take = 100) {
    return prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    })
  },
  async create(data: Prisma.AuditLogCreateInput) {
    return prisma.auditLog.create({ data })
  },
  async count(where?: Prisma.AuditLogWhereInput) {
    return prisma.auditLog.count({ where })
  },
}
