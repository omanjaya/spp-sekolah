import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { cancelRequestService } from '@/services/cancel-request.service'

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  reviewNote: z.string().min(5, 'Catatan penolakan minimal 5 karakter.'),
})

export const PATCH = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN])
  const { id } = await ctx.params
  const body = bodySchema.parse(await req.json())
  return cancelRequestService.reject(id, actor.userId, body.reviewNote)
})
