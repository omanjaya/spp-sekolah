import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse, type NextRequest } from 'next/server'

import { requireRole, type RouteContext } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { kwitansiService } from '@/services/kwitansi.service'
import { KwitansiDocument, type SchoolInfo } from '@/lib/pdf/kwitansi-document'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

const DEFAULT_SCHOOL: SchoolInfo = {
  namaSekolah: 'SMAN 1 DENPASAR',
  alamat: 'Jl. Kamboja No. 4, Denpasar, Bali',
}

async function getSchoolInfo(): Promise<SchoolInfo> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'school_info' } })
    if (!setting) return DEFAULT_SCHOOL
    const v = setting.value as Partial<SchoolInfo> | null
    if (!v) return DEFAULT_SCHOOL
    return {
      namaSekolah: v.namaSekolah ?? DEFAULT_SCHOOL.namaSekolah,
      alamat:      v.alamat      ?? DEFAULT_SCHOOL.alamat,
      npsn:        v.npsn,
    }
  } catch {
    return DEFAULT_SCHOOL
  }
}

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<{ id: string }>,
): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const { id } = await ctx.params

  const [data, school] = await Promise.all([
    kwitansiService.getById(id),
    getSchoolInfo(),
  ])

  const rawBuffer = await renderToBuffer(
    <KwitansiDocument data={data} school={school} />,
  )
  const buffer = new Uint8Array(rawBuffer)

  const safeNomor = data.nomorKwitansi.replace(/\//g, '-')
  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="Kwitansi_${safeNomor}.pdf"`,
      'Cache-Control':       'no-store',
    },
  })
}
