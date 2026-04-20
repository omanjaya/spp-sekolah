import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'
import { refundService } from '@/services/refund.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function pickId(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return idSchema.parse(v)
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    return refundService.getById(pickId(id))
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    const resolved = pickId(id)
    await refundService.delete(resolved)
    return { id: resolved }
  })(req)
}
