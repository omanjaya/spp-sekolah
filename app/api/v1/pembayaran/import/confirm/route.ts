import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { importConfirmSchema } from '@/lib/validators/import.schema'
import { importService } from '@/services/import.service'

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = importConfirmSchema.parse(await req.json())
  return importService.confirm(body.batchId, body.selections, actor)
})
