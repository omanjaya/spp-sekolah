import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { siswaCreateSchema, siswaFilterSchema } from '@/lib/validators/siswa.schema'
import { siswaService } from '@/services/siswa.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const params = siswaFilterSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const { items, total, page, limit } = await siswaService.list(params)
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  })(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const body = siswaCreateSchema.parse(await req.json())
    return siswaService.create(body)
  })(req)
}
