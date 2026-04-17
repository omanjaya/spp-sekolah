import { createHash } from 'node:crypto'

import ExcelJS from 'exceljs'

export interface TagihanBpdRow {
  nis: string
  nama: string
  tahun: number
  bulan: number
  kelas: string
  jurusan: string
  nominal: number
  keterangan: string
  instansi: string
  alamat: string
  statusBayar: 'Belum Terbayar' | 'Terbayar'
}

export interface TagihanBpdParseResult {
  rows: TagihanBpdRow[]
  totalRows: number
  fileHash: string
  errors: string[]
}

function cellToString(value: ExcelJS.CellValue | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>
    if ('text' in obj && typeof obj.text === 'string') return obj.text
    if ('result' in obj && (typeof obj.result === 'string' || typeof obj.result === 'number')) {
      return String(obj.result)
    }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>).map((p) => p.text ?? '').join('')
    }
    if ('formula' in obj) {
      const r = (obj as { result?: unknown }).result
      if (typeof r === 'string' || typeof r === 'number') return String(r)
      return ''
    }
  }
  return String(value)
}

function parseNumber(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, '')
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    normalized = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.')
  } else if (lastComma !== -1) {
    normalized = s.replace(',', '.')
  } else {
    normalized = s
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

const HEADER_ALIASES: Record<string, string[]> = {
  instansi: ['instansi', 'id sklh'],
  noTagihan: ['no. tagihan', 'no tagihan', 'notagihan', 'nis', 'id'],
  nama: ['nama'],
  tagihan: ['tagihan', 'jum tagihan', 'jum_tagihan'],
  alamat: ['alamat'],
  kelas: ['kelas'],
  jurusan: ['jurusan'],
  tahun: ['tahun'],
  bulan: ['bulan'],
  danaMasyarakat: ['dana masyarakat'],
  keterangan: ['keterangan'],
  statusBayar: ['status bayar', 'status', 'sts bayar'],
}

type HeaderKey = keyof typeof HEADER_ALIASES

function normalizeHeader(v: string): string {
  return v.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

function buildHeaderMap(row: ExcelJS.Row): Map<HeaderKey, number> {
  const map = new Map<HeaderKey, number>()
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const raw = cellToString(cell.value).trim()
    if (!raw) return
    const normalized = normalizeHeader(raw)
    for (const key of Object.keys(HEADER_ALIASES) as HeaderKey[]) {
      const aliases = HEADER_ALIASES[key]
      if (!aliases) continue
      if (aliases.includes(normalized)) {
        if (!map.has(key)) map.set(key, colNumber)
        break
      }
    }
  })
  return map
}

function readCell(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return ''
  return cellToString(row.getCell(col).value).trim()
}

export async function parseTagihanBpd(
  buffer: Uint8Array,
  fileName: string,
): Promise<TagihanBpdParseResult> {
  const fileHash = createHash('sha256').update(buffer).digest('hex')

  const workbook = new ExcelJS.Workbook()
  try {
    await (workbook.xlsx.load as (data: unknown) => Promise<ExcelJS.Workbook>)(buffer)
  } catch (err) {
    return {
      rows: [],
      totalRows: 0,
      fileHash,
      errors: [
        `Gagal membaca file Excel: ${err instanceof Error ? err.message : 'format tidak dikenali'}.`,
      ],
    }
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) {
    return { rows: [], totalRows: 0, fileHash, errors: ['Workbook tidak memiliki sheet.'] }
  }

  // Find header row by scanning first 10 rows
  let headerRowNumber: number | null = null
  let headerMap: Map<HeaderKey, number> | null = null
  const scanLimit = Math.min(10, sheet.rowCount)
  for (let r = 1; r <= scanLimit; r += 1) {
    const row = sheet.getRow(r)
    const map = buildHeaderMap(row)
    if (map.size >= 4) {
      headerRowNumber = r
      headerMap = map
      break
    }
  }

  if (!headerRowNumber || !headerMap) {
    return {
      rows: [],
      totalRows: 0,
      fileHash,
      errors: [
        'Tidak dapat mengenali header. Pastikan ini file tagihan dari asik.bpdbali (kolom: No. Tagihan, Nama, Tahun, Bulan, dll).',
      ],
    }
  }

  const rows: TagihanBpdRow[] = []
  const errors: string[] = []

  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    const hasContent = Array.isArray(row.values)
      ? row.values.some((v) => cellToString(v as ExcelJS.CellValue).trim() !== '')
      : false
    if (!hasContent) continue

    const hm = headerMap
    const raw = {
      instansi: readCell(row, hm.get('instansi')),
      noTagihan: readCell(row, hm.get('noTagihan')),
      nama: readCell(row, hm.get('nama')),
      tagihan: readCell(row, hm.get('tagihan')),
      alamat: readCell(row, hm.get('alamat')),
      kelas: readCell(row, hm.get('kelas')),
      jurusan: readCell(row, hm.get('jurusan')),
      tahun: readCell(row, hm.get('tahun')),
      bulan: readCell(row, hm.get('bulan')),
      danaMasyarakat: readCell(row, hm.get('danaMasyarakat')),
      keterangan: readCell(row, hm.get('keterangan')),
      statusBayar: readCell(row, hm.get('statusBayar')),
    }

    const nis = raw.noTagihan.trim()
    if (!nis) {
      errors.push(`Baris ${r}: NIS kosong, dilewati.`)
      continue
    }

    const tahun = parseInt(raw.tahun, 10)
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
      errors.push(`Baris ${r} (NIS ${nis}): Tahun tidak valid "${raw.tahun}", dilewati.`)
      continue
    }

    const bulanRaw = parseInt(raw.bulan.replace(/^0+/, '') || '0', 10)
    if (!Number.isInteger(bulanRaw) || bulanRaw < 1 || bulanRaw > 12) {
      errors.push(`Baris ${r} (NIS ${nis}): Bulan tidak valid "${raw.bulan}", dilewati.`)
      continue
    }

    const nominalStr = raw.tagihan || raw.danaMasyarakat || '0'
    const nominal = parseNumber(nominalStr)
    if (nominal <= 0) {
      errors.push(`Baris ${r} (NIS ${nis}): Nominal tidak valid "${nominalStr}", dilewati.`)
      continue
    }

    const statusRaw = raw.statusBayar.trim()
    const statusBayar: 'Belum Terbayar' | 'Terbayar' =
      statusRaw === 'Terbayar' ? 'Terbayar' : 'Belum Terbayar'

    rows.push({
      nis,
      nama: raw.nama || '-',
      tahun,
      bulan: bulanRaw,
      kelas: raw.kelas || '-',
      jurusan: raw.jurusan || '-',
      nominal,
      keterangan: raw.keterangan || '-',
      instansi: raw.instansi || 'SMAN_1_DENPASAR',
      alamat: raw.alamat || '-',
      statusBayar,
    })
  }

  return { rows, totalRows: rows.length, fileHash, errors }
}
