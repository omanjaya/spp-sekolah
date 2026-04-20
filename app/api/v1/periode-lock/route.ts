import { z } from 'zod'
import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { periodeLockService } from '@/services/periode-lock.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const lockBodySchema = z.object({
  periodYear: z.number().int().min(2000).max(2100),
  periodMonth: z.number().int().min(1).max(12),
  catatan: z.string().max(500).optional(),
})

export const GET = apiHandler(async () => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  return periodeLockService.list()
})

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN])
  const body = lockBodySchema.parse(await req.json())
  return periodeLockService.lock(body.periodYear, body.periodMonth, actor.userId, body.catatan)
})
