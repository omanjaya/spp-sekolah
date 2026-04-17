/**
 * Audit service — listing `AuditLog` entries with filters & pagination.
 *
 * RBAC note: SUPER_ADMIN sees everything; everyone else is scoped to their
 * own logs. The route layer enforces this via `scopeUserId`.
 */

import type { Prisma } from '@prisma/client'

import { prisma } from '@/lib/db'
import { auditLogRepo } from '@/repositories/audit-log.repo'

export interface AuditLogFilter {
  userId?: string
  action?: string
  entity?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  /** Force-scope to this user id (non-SUPER_ADMIN). Overrides `filter.userId`. */
  scopeUserId?: string
}

export interface AuditLogRow {
  id: string
  userId: string
  userNama: string
  action: string
  entity: string | null
  entityId: string | null
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

export const auditService = {
  async list(filter: AuditLogFilter = {}): Promise<{ rows: AuditLogRow[]; total: number }> {
    const page = filter.page ?? 1
    const limit = filter.limit ?? 20

    const where: Prisma.AuditLogWhereInput = {}
    if (filter.scopeUserId) {
      where.userId = filter.scopeUserId
    } else if (filter.userId) {
      where.userId = filter.userId
    }
    if (filter.action) where.action = { contains: filter.action, mode: 'insensitive' }
    if (filter.entity) where.entity = { equals: filter.entity }
    if (filter.dateFrom || filter.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {}
      if (filter.dateFrom) {
        const d = new Date(filter.dateFrom)
        if (!Number.isNaN(d.getTime())) createdAt.gte = d
      }
      if (filter.dateTo) {
        const d = new Date(filter.dateTo)
        if (!Number.isNaN(d.getTime())) createdAt.lte = d
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { nama: true } } },
      }),
      auditLogRepo.count(where),
    ])

    return {
      rows: rows.map((a) => ({
        id: a.id,
        userId: a.userId,
        userNama: a.user?.nama ?? '—',
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        metadata: a.metadata ?? null,
        ipAddress: a.ipAddress,
        userAgent: a.userAgent,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
    }
  },
}
