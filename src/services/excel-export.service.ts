/**
 * Excel export service — thin orchestrator around the workbook builder.
 */

import { buildRekapExcel } from '@/lib/excel/builder'
import {
  buildMatrix,
  formatRombelLabel,
  resolveAngkatanForRombel,
} from '@/services/matrix-data.service'
import { prisma } from '@/lib/db'
import type { SchoolInfo } from '@/lib/pdf/matrix-document'
import logger from '@/lib/logger'
import { performance } from 'perf_hooks'

const DEFAULT_SCHOOL: SchoolInfo = {
  namaSekolah: 'SMAN 1 DENPASAR',
  alamat: 'Jl. Kamboja No. 4, Denpasar, Bali',
}

async function getSchoolInfo(): Promise<SchoolInfo> {
  try {
    const s = await prisma.setting.findUnique({ where: { key: 'school_info' } })
    if (!s) return DEFAULT_SCHOOL
    const v = s.value as Partial<SchoolInfo> | null
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

export async function generateExcelForRombel(
  rombelId: string,
  school?: SchoolInfo,
): Promise<{ buffer: Uint8Array; fileName: string }> {
  const start = performance.now()
  const angkatan = await resolveAngkatanForRombel(rombelId)
  const data = await buildMatrix({ angkatan, rombelId })
  const s = school ?? (await getSchoolInfo())
  const wb = await buildRekapExcel(data, s)
  const buffer = await wb.xlsx.writeBuffer()
  const rombel = data.rombels[0]
  const fileName = rombel
    ? `Komite_${angkatan}_${formatRombelLabel(rombel.grade, rombel.nomor)}.xlsx`
    : `Komite_${angkatan}_${rombelId}.xlsx`

  const duration = performance.now() - start
  logger.info({ duration, operation: 'export', type: 'rombel', rombelId, angkatan }, 'excel.export')

  if (duration > 2000) {
    logger.warn({ duration, operation: 'export', type: 'rombel', rombelId, angkatan }, 'excel.export: slow')
  }

  return {
    buffer: new Uint8Array(buffer as ArrayBuffer),
    fileName,
  }
}

export async function generateExcelForAngkatan(
  angkatan: number,
  school?: SchoolInfo,
): Promise<{ buffer: Uint8Array; fileName: string }> {
  const start = performance.now()
  const data = await buildMatrix({ angkatan })
  const s = school ?? (await getSchoolInfo())
  const wb = await buildRekapExcel(data, s)
  const buffer = await wb.xlsx.writeBuffer()

  const duration = performance.now() - start
  logger.info({ duration, operation: 'export', type: 'angkatan', angkatan }, 'excel.export')

  if (duration > 2000) {
    logger.warn({ duration, operation: 'export', type: 'angkatan', angkatan }, 'excel.export: slow')
  }

  return {
    buffer: new Uint8Array(buffer as ArrayBuffer),
    fileName: `Komite_${angkatan}_semua.xlsx`,
  }
}
