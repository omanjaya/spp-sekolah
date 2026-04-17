import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import {
  pembayaranFilterSchema,
  pembayaranManualCreateSchema,
} from '@/lib/validators/pembayaran.schema'
import { pembayaranService } from '@/services/pembayaran.service'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const filter = pembayaranFilterSchema.parse(raw)
  const result = await pembayaranService.list(filter)
  return {
    data: result.items,
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = pembayaranManualCreateSchema.parse(await req.json())
  return pembayaranService.createManual(body, actor)
})
