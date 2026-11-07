import type { NextRequest } from 'next/server'
import ExcelJS from 'exceljs'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ValidationError } from '@/core/errors'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
// Batas per file: tiap bulan = 1 upsert berurutan, jadi rentang/jumlah baris
// yang tak dibatasi (mis. 2000-01 s/d 2100-12) bisa membebani DB.
const MAX_ROWS = 5000
const MAX_PERIOD_MONTHS = 36 // masa sekolah SMA
const MAX_KETERANGAN_LENGTH = 500

function cellToString(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if ('text' in obj && typeof obj.text === 'string') return obj.text.trim()
    if ('result' in obj) return String((obj as { result?: unknown }).result ?? '')
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join('').trim()
    }
  }
  return String(value).trim()
}

interface ManualRow {
  nis: string
  tahunDari: number
  bulanDari: number
  tahunSampai: number
  bulanSampai: number
  keterangan: string
}

async function parseManualExcel(buffer: Uint8Array): Promise<{ rows: ManualRow[]; errors: string[] }> {
  const wb = new ExcelJS.Workbook()
  await (wb.xlsx.load as (data: unknown) => Promise<ExcelJS.Workbook>)(buffer)

  const sheet = wb.worksheets[0]
  if (!sheet) return { rows: [], errors: ['Workbook tidak memiliki sheet.'] }

  const rows: ManualRow[] = []
  const errors: string[] = []

  // Find header row
  let dataStartRow = 2 // default: row 1 = header, row 2+ = data
  const firstRow = sheet.getRow(1)
  const firstCellVal = cellToString(firstRow.getCell(1).value).toLowerCase()
  if (firstCellVal.includes('nis') || firstCellVal.includes('id')) {
    dataStartRow = 2
  }

  for (let r = dataStartRow; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const nis = cellToString(row.getCell(1).value)
    if (!nis) continue

    // Skip notes rows (italic hint row with '←')
    if (nis.includes('←')) continue

    const tahunDari = parseInt(cellToString(row.getCell(2).value), 10)
    const bulanDari = parseInt(cellToString(row.getCell(3).value), 10)
    const tahunSampai = parseInt(cellToString(row.getCell(4).value), 10)
    const bulanSampai = parseInt(cellToString(row.getCell(5).value), 10)
    const keterangan = cellToString(row.getCell(6).value)

    if (!Number.isInteger(tahunDari) || tahunDari < 2000 || tahunDari > 2100) {
      errors.push(`Baris ${r} (NIS ${nis}): Tahun_Dari tidak valid.`)
      continue
    }
    if (!Number.isInteger(bulanDari) || bulanDari < 1 || bulanDari > 12) {
      errors.push(`Baris ${r} (NIS ${nis}): Bulan_Dari tidak valid (1-12).`)
      continue
    }
    if (!Number.isInteger(tahunSampai) || tahunSampai < 2000 || tahunSampai > 2100) {
      errors.push(`Baris ${r} (NIS ${nis}): Tahun_Sampai tidak valid.`)
      continue
    }
    if (!Number.isInteger(bulanSampai) || bulanSampai < 1 || bulanSampai > 12) {
      errors.push(`Baris ${r} (NIS ${nis}): Bulan_Sampai tidak valid (1-12).`)
      continue
    }
    if (!keterangan) {
      errors.push(`Baris ${r} (NIS ${nis}): Keterangan wajib diisi.`)
      continue
    }
    if (keterangan.length > MAX_KETERANGAN_LENGTH) {
      errors.push(`Baris ${r} (NIS ${nis}): Keterangan maksimal ${MAX_KETERANGAN_LENGTH} karakter.`)
      continue
    }
    const months = (tahunSampai - tahunDari) * 12 + (bulanSampai - bulanDari) + 1
    if (months < 1) {
      errors.push(`Baris ${r} (NIS ${nis}): Periode Sampai lebih awal dari Periode Dari.`)
      continue
    }
    if (months > MAX_PERIOD_MONTHS) {
      errors.push(`Baris ${r} (NIS ${nis}): Rentang periode maksimal ${MAX_PERIOD_MONTHS} bulan.`)
      continue
    }
    if (rows.length >= MAX_ROWS) {
      errors.push(`File melebihi ${MAX_ROWS} baris data; baris ${r} dan seterusnya dilewati.`)
      break
    }

    rows.push({ nis, tahunDari, bulanDari, tahunSampai, bulanSampai, keterangan })
  }

  return { rows, errors }
}

function* iteratePeriod(
  tahunDari: number,
  bulanDari: number,
  tahunSampai: number,
  bulanSampai: number,
): Generator<{ tahun: number; bulan: number }> {
  let tahun = tahunDari
  let bulan = bulanDari
  while (tahun < tahunSampai || (tahun === tahunSampai && bulan <= bulanSampai)) {
    yield { tahun, bulan }
    bulan++
    if (bulan > 12) {
      bulan = 1
      tahun++
    }
  }
}

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ValidationError('Gagal membaca form data. Pastikan file dikirim sebagai multipart/form-data.')
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('Field "file" wajib diisi dengan file Excel.')
  }

  if (file.size === 0) throw new ValidationError('File kosong.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Ukuran file melebihi batas 10 MB.')
  }

  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new ValidationError('Hanya file .xlsx atau .xls yang didukung.')
  }

  const buf = new Uint8Array(await file.arrayBuffer())
  const { rows: parsedRows, errors: parseErrors } = await parseManualExcel(buf)

  if (parsedRows.length === 0) {
    throw new ValidationError(
      `Tidak ada data yang berhasil diparsing. ${parseErrors[0] ?? ''}`.trim(),
    )
  }

  // Fetch all siswa NIS → id
  const allSiswa = await prisma.siswa.findMany({ select: { id: true, nis: true } })
  const nisToId = new Map(allSiswa.map((s) => [s.nis, s.id]))

  let success = 0
  let skipped = 0
  const errors: string[] = [...parseErrors]

  for (const row of parsedRows) {
    const siswaId = nisToId.get(row.nis)
    if (!siswaId) {
      errors.push(`NIS ${row.nis} tidak ditemukan di database, dilewati.`)
      skipped++
      continue
    }

    const periods = Array.from(
      iteratePeriod(row.tahunDari, row.bulanDari, row.tahunSampai, row.bulanSampai),
    )

    for (const { tahun, bulan } of periods) {
      try {
        await prisma.keringanan.upsert({
          where: {
            siswaId_periodYear_periodMonth: {
              siswaId,
              periodYear: tahun,
              periodMonth: bulan,
            },
          },
          create: {
            siswaId,
            periodYear: tahun,
            periodMonth: bulan,
            jenis: 'LAINNYA',
            alasan: row.keterangan,
            persentase: 100,
            createdBy: actor.userId,
          },
          update: {
            alasan: row.keterangan,
            persentase: 100,
          },
        })
        success++
      } catch {
        skipped++
      }
    }
  }

  return { success, skipped, errors }
})
