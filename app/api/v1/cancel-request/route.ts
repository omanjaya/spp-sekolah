import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { cancelRequestService } from '@/services/cancel-request.service'

const listFilterSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const createSchema = z.object({
  pembayaranId: z.string().min(1),
  alasan: z.string().min(5, 'Alasan minimal 5 karakter.'),
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const filter = listFilterSchema.parse(raw)
  const result = await cancelRequestService.list(filter)
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
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const body = createSchema.parse(await req.json())
  return cancelRequestService.request(body.pembayaranId, body.alasan, actor.userId)
})
