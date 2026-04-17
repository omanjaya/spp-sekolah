import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { reportService } from '@/services/report.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  angkatan: z.coerce.number().int().min(1900).max(3000).optional(),
  rombelId: z.string().trim().min(1).max(64).optional(),
  minBulan: z.coerce.number().int().min(1).max(48).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = querySchema.parse(raw)
  const rows = await reportService.getTunggakan(
    {
      angkatan: parsed.angkatan,
      rombelId: parsed.rombelId,
      minBulan: parsed.minBulan,
    },
    parsed.limit,
  )
  return { data: rows, meta: { total: rows.length } }
})
