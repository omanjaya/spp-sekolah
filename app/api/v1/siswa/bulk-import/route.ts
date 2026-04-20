import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { siswaBulkImportSchema } from '@/lib/validators/siswa.schema'
import { siswaService } from '@/services/siswa.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
    const body = siswaBulkImportSchema.parse(await req.json())
    return siswaService.bulkImport(body)
  })(req)
}
