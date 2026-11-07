import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { bulkGenerateFromTunggakan } from '@/services/tagihan-bpd.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  tahun: z.coerce.number().int().min(2000).max(2100),
  bulan: z.coerce.number().int().min(1).max(12),
  angkatan: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = schema.parse(await req.json())
  return bulkGenerateFromTunggakan(body, { id: actor.userId })
})
