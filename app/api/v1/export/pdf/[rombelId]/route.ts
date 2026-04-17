import { NextResponse, type NextRequest } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { generatePdfForRombel } from '@/services/pdf.service'
import { logExport } from '@/lib/export/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ rombelId: string }> }

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { rombelId } = await ctx.params
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const { buffer, fileName, data } = await generatePdfForRombel(rombelId)

  void logExport({
    userId: user.userId,
    action: 'EXPORT_PDF',
    rombelId,
    angkatan: data.angkatan,
    format: 'pdf',
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })

  // Copy into a plain ArrayBuffer so the response body type is correctly
  // inferred as BodyInit (and to avoid SharedArrayBuffer ambiguity).
  const body = new Uint8Array(buffer)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(body.byteLength),
    },
  })
}
