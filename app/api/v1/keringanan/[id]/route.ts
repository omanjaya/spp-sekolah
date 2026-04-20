import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { idSchema } from '@/lib/validators/common.schema'
import { keringananUpdateSchema } from '@/lib/validators/keringanan.schema'
import { keringananService } from '@/services/keringanan.service'

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
    return keringananService.getById(pickId(id))
  })(req)
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    const body = keringananUpdateSchema.parse(await req.json())
    return keringananService.update(pickId(id), body)
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const { id } = await ctx.params
    const resolved = pickId(id)
    await keringananService.remove(resolved)
    return { id: resolved }
  })(req)
}
