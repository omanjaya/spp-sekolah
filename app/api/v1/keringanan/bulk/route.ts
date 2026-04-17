import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { keringananBulkAssignSchema } from '@/lib/validators/keringanan.schema'
import { keringananService } from '@/services/keringanan.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireAuth()
  const body = keringananBulkAssignSchema.parse(await req.json())
  const result = await keringananService.bulkAssign(body, user.userId)
  return result
})
