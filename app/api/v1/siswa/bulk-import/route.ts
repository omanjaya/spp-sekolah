import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth } from '@/lib/api-handler'
import { siswaBulkImportSchema } from '@/lib/validators/siswa.schema'
import { siswaService } from '@/services/siswa.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  return apiHandler(async () => {
    await requireAuth()
    const body = siswaBulkImportSchema.parse(await req.json())
    return siswaService.bulkImport(body)
  })(req)
}
