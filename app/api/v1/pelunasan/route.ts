import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import {
  pelunasanCreateSchema,
  pelunasanFilterSchema,
} from '@/lib/validators/pelunasan.schema'
import { pelunasanService } from '@/services/pelunasan.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN])
  const filter = pelunasanFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { data, meta } = await pelunasanService.list(filter)
  return { data, meta }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPER_ADMIN])
  const body = pelunasanCreateSchema.parse(await req.json())
  const data = await pelunasanService.create(body, user.userId)
  return data
})
