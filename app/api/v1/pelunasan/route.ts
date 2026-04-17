import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import {
  pelunasanCreateSchema,
  pelunasanFilterSchema,
} from '@/lib/validators/pelunasan.schema'
import { pelunasanService } from '@/services/pelunasan.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const filter = pelunasanFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { data, meta } = await pelunasanService.list(filter)
  return { data, meta }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const body = pelunasanCreateSchema.parse(await req.json())
  const data = await pelunasanService.create(body, user.userId)
  return data
})
