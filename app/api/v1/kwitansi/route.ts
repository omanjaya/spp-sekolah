import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { kwitansiCreateSchema, kwitansiFilterSchema } from '@/lib/validators/kwitansi.schema'
import { kwitansiService } from '@/services/kwitansi.service'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const filter = kwitansiFilterSchema.parse(raw)
  const result = await kwitansiService.list(filter)
  return {
    data: result.items,
    meta: {
      page:       result.page,
      limit:      result.limit,
      total:      result.total,
      totalPages: result.totalPages,
    },
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body  = kwitansiCreateSchema.parse(await req.json())
  return kwitansiService.create(body, actor.userId)
})
