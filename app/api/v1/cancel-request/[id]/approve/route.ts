import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { cancelRequestService } from '@/services/cancel-request.service'

type Ctx = { params: Promise<{ id: string }> }

const bodySchema = z.object({
  reviewNote: z.string().optional(),
})

export const PATCH = apiHandler(async (req: NextRequest, ctx: Ctx) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN])
  const { id } = await ctx.params
  const body = bodySchema.parse(await req.json().catch(() => ({})))
  return cancelRequestService.approve(id, actor.userId, body.reviewNote)
})
