import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { settingBulkSchema } from '@/lib/validators/setting.schema'
import { settingService } from '@/services/setting.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    return settingService.getAll()
  })(req)
}

/**
 * Bulk upsert (PATCH). Hanya SUPER_ADMIN yang boleh ubah sistem-wide settings.
 */
export async function PATCH(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN])
    const body = settingBulkSchema.parse(await req.json())
    return settingService.bulkUpsert(body)
  })(req)
}
