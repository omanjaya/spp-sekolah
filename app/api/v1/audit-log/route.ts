import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { auditService } from '@/services/audit.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const querySchema = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  action: z.string().trim().min(1).max(64).optional(),
  entity: z.string().trim().min(1).max(64).optional(),
  dateFrom: z.string().trim().min(1).max(32).optional(),
  dateTo: z.string().trim().min(1).max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = querySchema.parse(raw)
  const { rows, total } = await auditService.list({
    ...parsed,
    // Non-SUPER_ADMIN can only see their own audit logs.
    scopeUserId: user.role === ROLES.SUPER_ADMIN ? undefined : user.userId,
  })
  return {
    data: rows,
    meta: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages: Math.max(Math.ceil(total / parsed.limit), 1),
    },
  }
})
