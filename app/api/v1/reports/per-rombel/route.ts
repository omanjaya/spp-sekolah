import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import {
  computePerRombelReport,
  type PerRombelResult,
  type PerRombelSiswaRow,
} from '@/services/per-rombel-report.service'

export const dynamic = 'force-dynamic'

export type { PerRombelResult, PerRombelSiswaRow }

const filterSchema = z.object({
  rombelId: z.string().min(1),
  tahunAjaranId: z.string().min(1),
})

export const GET = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const { rombelId, tahunAjaranId } = filterSchema.parse(raw)
  return computePerRombelReport(rombelId, tahunAjaranId)
})
