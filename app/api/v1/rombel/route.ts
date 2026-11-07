import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { rombelCreateSchema, rombelFilterSchema } from '@/lib/validators/rombel.schema'
import { rombelService } from '@/services/rombel.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const filter = rombelFilterSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const { items, total, page, limit } = await rombelService.list(filter)
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  })(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
    const body = rombelCreateSchema.parse(await req.json())
    return rombelService.create(body)
  })(req)
}
