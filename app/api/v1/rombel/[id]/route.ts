import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { idSchema } from '@/lib/validators/common.schema'
import { rombelUpdateSchema } from '@/lib/validators/rombel.schema'
import { rombelService } from '@/services/rombel.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function pickId(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return idSchema.parse(v)
}

export async function GET(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    return rombelService.getById(pickId(id))
  })(req)
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const body = rombelUpdateSchema.parse(await req.json())
    return rombelService.update(pickId(id), body)
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const resolved = pickId(id)
    await rombelService.remove(resolved)
    return { id: resolved }
  })(req)
}
