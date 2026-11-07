import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import {
  enrollmentBulkAssignSchema,
  enrollmentFilterSchema,
} from '@/lib/validators/enrollment.schema'
import { enrollmentService } from '@/services/enrollment.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const filter = enrollmentFilterSchema.parse(
      Object.fromEntries(req.nextUrl.searchParams.entries()),
    )
    const { items, total, page, limit } = await enrollmentService.list(filter)
    return {
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    }
  })(req)
}

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
    const body = enrollmentBulkAssignSchema.parse(await req.json())
    return enrollmentService.bulkAssign(body)
  })(req)
}
