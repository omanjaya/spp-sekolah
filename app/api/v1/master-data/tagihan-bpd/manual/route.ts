import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { addManualTagihan } from '@/services/tagihan-bpd.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  nis: z.string().trim().min(1, 'NIS wajib diisi'),
  tahun: z.coerce.number().int().min(2000).max(2100),
  bulan: z.coerce.number().int().min(1).max(12),
  nominal: z.coerce.number().min(0).max(100_000_000),
  keterangan: z.string().trim().max(200).optional(),
})

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = schema.parse(await req.json())
  return addManualTagihan(body, { id: actor.userId })
})
