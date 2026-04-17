import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { idSchema } from '@/lib/validators/common.schema'
import { tahunAjaranUpdateSchema } from '@/lib/validators/tahun-ajaran.schema'
import { tahunAjaranService } from '@/services/tahun-ajaran.service'

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
    return tahunAjaranService.getById(pickId(id))
  })(req)
}

export async function PATCH(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const body = tahunAjaranUpdateSchema.parse(await req.json())
    return tahunAjaranService.update(pickId(id), body)
  })(req)
}

export async function DELETE(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    const resolved = pickId(id)
    await tahunAjaranService.remove(resolved)
    return { id: resolved }
  })(req)
}
