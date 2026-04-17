import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { reportService } from '@/services/report.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = apiHandler(async (req: NextRequest) => {
  await requireAuth()
  const tahunAjaranId = req.nextUrl.searchParams.get('tahunAjaranId') ?? undefined
  return reportService.getSummary(tahunAjaranId)
})
