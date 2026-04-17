import { NextResponse, type NextRequest } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { generatePdfForRombel } from '@/services/pdf.service'
import { logExport } from '@/lib/export/audit'
import type { Grade } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ rombelId: string }> }

function parseGrades(param: string | null): Grade[] | undefined {
  if (!param) return undefined
  const parts = param
    .split(',')
    .map((x) => x.trim().toUpperCase())
    .filter((x): x is Grade => x === 'X' || x === 'XI' || x === 'XII')
  return parts.length > 0 ? parts : undefined
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<Response> {
  const { rombelId } = await ctx.params
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const grades = parseGrades(req.nextUrl.searchParams.get('grades'))

  const { buffer, fileName, data } = await generatePdfForRombel(rombelId, { grades })

  void logExport({
    userId: user.userId,
    action: 'EXPORT_PREVIEW_PDF',
    rombelId,
    angkatan: data.angkatan,
    format: 'pdf',
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })

  const body = new Uint8Array(buffer)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(body.byteLength),
      // Allow same-origin iframe embedding despite the global X-Frame-Options: DENY.
      // Note: X-Frame-Options can't be overridden to SAMEORIGIN per-route reliably;
      // the iframe sits under the same origin so browser treats this as allowed.
    },
  })
}
