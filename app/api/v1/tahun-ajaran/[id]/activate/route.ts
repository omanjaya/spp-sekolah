import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { idSchema } from '@/lib/validators/common.schema'
import { tahunAjaranService } from '@/services/tahun-ajaran.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function pickId(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return idSchema.parse(v)
}

export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const { id } = await ctx.params
    return tahunAjaranService.setActive(pickId(id))
  })(req)
}
