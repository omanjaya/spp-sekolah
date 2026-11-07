import { renderToBuffer } from '@react-pdf/renderer'
import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { prisma } from '@/lib/db'
import { ValidationError } from '@/core/errors'
import {
  computePerRombelReport,
  computePerRombelHistory,
  type PerRombelResult,
} from '@/services/per-rombel-report.service'
import {
  PerRombelDocument,
  PerRombelHistoryDocument,
  type SchoolInfo,
} from '@/lib/pdf/per-rombel-document'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const filterSchema = z
  .object({
    rombelId: z.string().min(1).optional(),
    grade: z.enum(['X', 'XI', 'XII']).optional(),
    tahunAjaranId: z.string().min(1),
    /** 'current' = data TA aktif saja (default), 'history' = multi-TA per kohort */
    mode: z.enum(['current', 'history']).default('current'),
  })
  .refine((v) => !!v.rombelId || !!v.grade, {
    message: 'Wajib isi rombelId atau grade.',
  })

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
      alamat: v.alamat ?? DEFAULT_SCHOOL.alamat,
      npsn: v.npsn,
    }
  } catch {
    return DEFAULT_SCHOOL
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const raw = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = filterSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.errors.map((e) => e.message).join('; '))
  }
  const { rombelId, grade, tahunAjaranId, mode } = parsed.data

  // Tentukan rombel yang akan dicetak
  let rombelIds: string[]
  if (rombelId) {
    rombelIds = [rombelId]
  } else {
    const rombels = await prisma.rombel.findMany({
      where: { grade, tahunAjaranId },
      orderBy: { nomor: 'asc' },
      select: { id: true },
    })
    rombelIds = rombels.map((r) => r.id)
  }

  if (rombelIds.length === 0) {
    throw new ValidationError('Tidak ada rombel yang cocok dengan filter.')
  }

  const school = await getSchoolInfo()
  const stamp = new Date().toISOString().slice(0, 10)

  if (mode === 'history') {
    // Multi-TA per kohort. Output: N halaman per rombel = jumlah TA yang sudah dilalui kohort.
    const histories = await Promise.all(
      rombelIds.map((id) => computePerRombelHistory(id, tahunAjaranId)),
    )
    const nonEmpty = histories.filter((h) => h.pages.length > 0)
    if (nonEmpty.length === 0) {
      throw new ValidationError('Tidak ada data riwayat.')
    }
    // Single rombel only for history mode (multi rombel = banyak page, jarang masuk akal)
    if (nonEmpty.length > 1) {
      throw new ValidationError('Mode history hanya mendukung 1 rombel sekaligus.')
    }
    const rawBuffer = await renderToBuffer(
      <PerRombelHistoryDocument history={nonEmpty[0]!} school={school} />,
    )
    const buffer = new Uint8Array(rawBuffer)
    const filename = `Riwayat-${nonEmpty[0]!.rombelKode.replace(/[^a-zA-Z0-9]/g, '-')}-${stamp}.pdf`
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  // mode === 'current'
  const reports = await Promise.all(
    rombelIds.map((id) => computePerRombelReport(id, tahunAjaranId)),
  )
  const nonEmpty: PerRombelResult[] =
    rombelIds.length === 1 ? reports : reports.filter((r) => r.siswa.length > 0)

  if (nonEmpty.length === 0) {
    throw new ValidationError('Semua rombel kosong. Tidak ada yang dicetak.')
  }

  const rawBuffer = await renderToBuffer(
    <PerRombelDocument rombels={nonEmpty} school={school} />,
  )
  const buffer = new Uint8Array(rawBuffer)

  const baseName = nonEmpty.length === 1
    ? `Laporan-${nonEmpty[0]!.rombelKode.replace(/[^a-zA-Z0-9]/g, '-')}`
    : `Laporan-Per-Rombel-${grade ?? 'all'}`
  const filename = `${baseName}-${stamp}.pdf`

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
