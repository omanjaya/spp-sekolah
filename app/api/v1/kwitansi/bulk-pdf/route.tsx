import { renderToBuffer } from '@react-pdf/renderer'
import { NextResponse, type NextRequest } from 'next/server'
import JSZip from 'jszip'
import { z } from 'zod'
import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { kwitansiService } from '@/services/kwitansi.service'
import { KwitansiDocument, type SchoolInfo } from '@/lib/pdf/kwitansi-document'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

const querySchema = z.object({
  rombelId:      z.string().min(1),
  tahunAjaranId: z.string().min(1).optional(),
})

export async function GET(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const { searchParams } = req.nextUrl
  const parsed = querySchema.safeParse({
    rombelId:      searchParams.get('rombelId') ?? undefined,
    tahunAjaranId: searchParams.get('tahunAjaranId') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: parsed.error.message } },
      { status: 400 },
    )
  }

  const { rombelId, tahunAjaranId } = parsed.data

  // Get rombel info for filename
  const rombel = await prisma.rombel.findUnique({
    where: { id: rombelId },
    select: { kode: true },
  })

  if (!rombel) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Rombel tidak ditemukan.' } },
      { status: 404 },
    )
  }

  // Find all siswa enrolled in the rombel
  const enrollments = await prisma.enrollment.findMany({
    where: {
      rombelId,
      ...(tahunAjaranId ? { tahunAjaranId } : {}),
    },
    select: { siswaId: true },
  })

  const siswaIds = enrollments.map((e) => e.siswaId)

  if (siswaIds.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Tidak ada siswa dalam rombel ini.' } },
      { status: 404 },
    )
  }

  // Find all kwitansi for those siswa
  const kwitansiList = await prisma.kwitansi.findMany({
    where: { siswaId: { in: siswaIds } },
    select: { id: true, nomorKwitansi: true },
    orderBy: { tanggal: 'asc' },
  })

  if (kwitansiList.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Tidak ada kwitansi untuk rombel ini.' } },
      { status: 404 },
    )
  }

  const school = await getSchoolInfo()

  // Generate all PDFs and add to ZIP
  const zip = new JSZip()

  await Promise.all(
    kwitansiList.map(async ({ id, nomorKwitansi }) => {
      const data = await kwitansiService.getById(id)
      const rawBuffer = await renderToBuffer(
        <KwitansiDocument data={data} school={school} />,
      )
      const safeNomor = nomorKwitansi.replace(/\//g, '-')
      zip.file(`Kwitansi_${safeNomor}.pdf`, rawBuffer)
    }),
  )

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const rombelKode = rombel.kode.replace(/\s+/g, '_')

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type':        'application/zip',
      'Content-Disposition': `attachment; filename="Kwitansi_Rombel_${rombelKode}.zip"`,
      'Cache-Control':       'no-store',
    },
  })
}
