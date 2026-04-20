import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { refundCreateSchema, refundFilterSchema } from '@/lib/validators/refund.schema'
import { refundService } from '@/services/refund.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN])
  const filter = refundFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { data, meta } = await refundService.list(filter)
  return { data, meta }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPER_ADMIN])
  const body = refundCreateSchema.parse(await req.json())
  const data = await refundService.create(body, user.userId)
  return data
})
