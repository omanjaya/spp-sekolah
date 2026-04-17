import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import {
  keringananCreateSchema,
  keringananFilterSchema,
} from '@/lib/validators/keringanan.schema'
import { keringananService } from '@/services/keringanan.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const filter = keringananFilterSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams.entries()),
  )
  const { data, meta } = await keringananService.list(filter)
  return { data, meta }
})

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const body = keringananCreateSchema.parse(await req.json())
  const data = await keringananService.create(body, user.userId)
  return data
})
