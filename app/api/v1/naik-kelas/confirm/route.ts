import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { naikKelasConfirmSchema } from '@/lib/validators/naik-kelas.schema'
import { naikKelasService } from '@/services/naik-kelas.service'

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = naikKelasConfirmSchema.parse(await req.json())
  return naikKelasService.confirm(body.batchId, body.tahunAjaranId, body.selections, actor)
})
