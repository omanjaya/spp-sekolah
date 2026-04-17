import { NextResponse, type NextRequest } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { generateExcelForRombel } from '@/services/excel-export.service'
import { resolveAngkatanForRombel } from '@/services/matrix-data.service'
import { logExport } from '@/lib/export/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ rombelId: string }> }

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { rombelId } = await ctx.params
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const { buffer, fileName } = await generateExcelForRombel(rombelId)
  const angkatan = await resolveAngkatanForRombel(rombelId)

  void logExport({
    userId: user.userId,
    action: 'EXPORT_EXCEL',
    rombelId,
    angkatan,
    format: 'excel',
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })

  const body = new Uint8Array(buffer)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(body.byteLength),
    },
  })
}
