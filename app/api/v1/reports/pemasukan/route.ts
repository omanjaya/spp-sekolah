import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { reportService } from '@/services/report.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  year: z.coerce.number().int().min(1900).max(3000).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = querySchema.parse(raw)
  return reportService.getPemasukan(parsed)
})
