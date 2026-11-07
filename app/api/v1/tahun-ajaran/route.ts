import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { tahunAjaranCreateSchema } from '@/lib/validators/tahun-ajaran.schema'
import { tahunAjaranService } from '@/services/tahun-ajaran.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    return tahunAjaranService.list()
  })(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
    const body = tahunAjaranCreateSchema.parse(await req.json())
    return tahunAjaranService.create(body)
  })(req)
}
