import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { reportService } from '@/services/report.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  status: z.string().trim().min(1).max(32).optional(),
  uploadedBy: z.string().trim().min(1).max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries())
  const parsed = querySchema.parse(raw)
  const { rows, total } = await reportService.getImportBatchHistory(parsed)
  return {
    data: rows,
    meta: {
      page: parsed.page,
      limit: parsed.limit,
      total,
      totalPages: Math.max(Math.ceil(total / parsed.limit), 1),
    },
  }
})
