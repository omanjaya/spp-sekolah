import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { idSchema } from '@/lib/validators/common.schema'
import { pelunasanUpdateSchema } from '@/lib/validators/pelunasan.schema'
import { pelunasanService } from '@/services/pelunasan.service'

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
    return pelunasanService.getById(pickId(id))
  })(req)
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const body = pelunasanUpdateSchema.parse(await req.json())
    return pelunasanService.update(pickId(id), body)
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const resolved = pickId(id)
    await pelunasanService.remove(resolved)
    return { id: resolved }
  })(req)
}
