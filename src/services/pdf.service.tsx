/**
 * PDF Service — orchestrates MatrixData builder + react-pdf renderer.
 * Returns raw PDF bytes as Uint8Array (safe to pass into NextResponse or
 * archive into a ZIP).
 */

import { renderToBuffer } from '@react-pdf/renderer'

import { prisma } from '@/lib/db'
import { NotFoundError } from '@/core/errors'
import { MatrixDocument, type SchoolInfo } from '@/lib/pdf/matrix-document'
import {
  buildMatrix,
  formatRombelLabel,
  resolveAngkatanForRombel,
  type MatrixData,
} from '@/services/matrix-data.service'
import type { Grade } from '@prisma/client'

export interface PdfForRombelOptions {
  /**
   * Restrict pages to specific grades. Omit for all 3.
   */
  grades?: Grade[]
  /** Override school info (otherwise pulled from Setting). */
  school?: SchoolInfo
}

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

/**
 * Auto-derive grades yang relevan untuk satu kohort berdasarkan angkatan
 * (tahun masuk kelas X) dan tanggal sekarang. Tahun ajaran berganti Juli.
 *   angkatan 2025 + sekarang TA 2025/2026 → kelas X → 1 halaman
 *   angkatan 2024 + sekarang TA 2025/2026 → kelas XI → 2 halaman (X + XI)
 *   angkatan 2023 + sekarang TA 2025/2026 → kelas XII → 3 halaman
 */
export function deriveGradesForCohort(angkatan: number, now: Date = new Date()): Grade[] {
  const currentTaYear = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  const yearsInSchool = currentTaYear - angkatan + 1
  if (yearsInSchool <= 1) return ['X']
  if (yearsInSchool === 2) return ['X', 'XI']
  return ['X', 'XI', 'XII']
}

/**
 * Generate PDF for one rombel (+ its angkatan). Returns a PDF buffer.
 */
export async function generatePdfForRombel(
  rombelId: string,
  options: PdfForRombelOptions = {},
): Promise<{ buffer: Uint8Array; fileName: string; data: MatrixData }> {
  const angkatan = await resolveAngkatanForRombel(rombelId)
  const data = await buildMatrix({ angkatan, rombelId })
  const school = options.school ?? (await getSchoolInfo())
  const grades = options.grades ?? deriveGradesForCohort(angkatan)

  const buffer = await renderToBuffer(
    <MatrixDocument data={data} school={school} grades={grades} />,
  )
  const rombel = data.rombels[0]
  const fileName = rombel
    ? `Komite_${angkatan}_${formatRombelLabel(rombel.grade, rombel.nomor)}.pdf`
    : `Komite_${angkatan}_${rombelId}.pdf`
  return { buffer: new Uint8Array(buffer), fileName, data }
}

/**
 * Build PDF for an arbitrary MatrixData (used when angkatan/filter is already
 * known; e.g. batch endpoints).
 */
export async function renderMatrixPdf(
  data: MatrixData,
  school?: SchoolInfo,
  grades?: Grade[],
): Promise<Uint8Array> {
  const s = school ?? (await getSchoolInfo())
  const effectiveGrades = grades ?? deriveGradesForCohort(data.angkatan)
  const buffer = await renderToBuffer(
    <MatrixDocument data={data} school={s} grades={effectiveGrades} />,
  )
  return new Uint8Array(buffer)
}

/**
 * Convenience: resolve rombelId list from a filter (angkatan + optional ids).
 */
export interface BatchFilter {
  angkatan?: number
  rombelIds?: string[]
  tahunAjaranId?: string
}

export async function resolveRombelsForBatch(filter: BatchFilter) {
  const { angkatan, rombelIds, tahunAjaranId } = filter
  const rombels = await prisma.rombel.findMany({
    where: {
      ...(tahunAjaranId ? { tahunAjaranId } : {}),
      ...(rombelIds && rombelIds.length > 0 ? { id: { in: rombelIds } } : {}),
      ...(angkatan !== undefined
        ? {
            enrollments: { some: { siswa: { angkatan } } },
          }
        : {}),
    },
    orderBy: [{ grade: 'asc' }, { nomor: 'asc' }],
  })
  if (rombels.length === 0) {
    throw new NotFoundError('Tidak ada rombel yang cocok dengan filter.')
  }
  return rombels
}
