import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { keringananBulkAssignSchema } from '@/lib/validators/keringanan.schema'
import { keringananService } from '@/services/keringanan.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPER_ADMIN])
  const body = keringananBulkAssignSchema.parse(await req.json())
  const result = await keringananService.bulkAssign(body, user.userId)
  return result
})
