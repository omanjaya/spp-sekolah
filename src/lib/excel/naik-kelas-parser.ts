/**
 * Parser Excel untuk fitur Naik Kelas.
 *
 * Mendukung dua format:
 *   1. Format sederhana: kolom NIS | Nama | Rombel Baru (mis. "XI.6")
 *   2. Format Tagihan asik.bpdbali: kolom mencakup "No. Tagihan", "Kelas", "Jurusan"
 *      → NIS dari kolom No. Tagihan, rombelKode dibangun dari Kelas + Jurusan.
 *
 * Return: { rows: ParsedNaikKelasRow[], errors: string[] }
 */

import ExcelJS from 'exceljs'

export interface ParsedNaikKelasRow {
  /** 0-based index (header baris dikecualikan). */
  rowIndex: number
  nis: string
  namaExcel: string
  /** Kode rombel target, mis. "XI.6". */
  rombelKode: string
}

export interface NaikKelasParseResult {
  rows: ParsedNaikKelasRow[]
  errors: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function readCell(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return ''
  return cellToString(row.getCell(col).value).trim()
}

function normalizeHeader(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ')
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

type FormatType = 'SIMPLE' | 'TAGIHAN'

interface SimpleHeaderMap {
  format: 'SIMPLE'
  nisCol: number
  namaCol: number
  rombelCol: number
}

interface TagihanHeaderMap {
  format: 'TAGIHAN'
  nisCol: number
  namaCol: number | undefined
  kelasCol: number
  jurusanCol: number
}

type HeaderMap = SimpleHeaderMap | TagihanHeaderMap

const SIMPLE_HEADER_ALIASES = {
  nis: ['nis', 'nisn', 'no. induk', 'no induk', 'no. tagihan', 'no tagihan', 'notagihan'],
  nama: ['nama', 'nama siswa'],
  rombel: ['rombel baru', 'rombel', 'kelas baru', 'kelas tujuan'],
}

const TAGIHAN_HEADER_ALIASES = {
  noTagihan: ['no. tagihan', 'no tagihan', 'notagihan'],
  nama: ['nama'],
  kelas: ['kelas'],
  jurusan: ['jurusan'],
}

function detectFormat(row: ExcelJS.Row): HeaderMap | null {
  const colMap: Record<string, number> = {}
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalizeHeader(cellToString(cell.value))
    if (normalized) colMap[normalized] = colNumber
  })

  // Check Tagihan format first (more specific)
  const hasNoTagihan = Object.keys(colMap).some((h) =>
    TAGIHAN_HEADER_ALIASES.noTagihan.includes(h),
  )
  const hasKelas = Object.keys(colMap).some((h) => TAGIHAN_HEADER_ALIASES.kelas.includes(h))
  const hasJurusan = Object.keys(colMap).some((h) => TAGIHAN_HEADER_ALIASES.jurusan.includes(h))

  if (hasNoTagihan && hasKelas && hasJurusan) {
    const nisCol = Object.entries(colMap).find(([h]) =>
      TAGIHAN_HEADER_ALIASES.noTagihan.includes(h),
    )?.[1]
    const namaCol = Object.entries(colMap).find(([h]) =>
      TAGIHAN_HEADER_ALIASES.nama.includes(h),
    )?.[1]
    const kelasCol = Object.entries(colMap).find(([h]) =>
      TAGIHAN_HEADER_ALIASES.kelas.includes(h),
    )?.[1]
    const jurusanCol = Object.entries(colMap).find(([h]) =>
      TAGIHAN_HEADER_ALIASES.jurusan.includes(h),
    )?.[1]
    if (nisCol && kelasCol && jurusanCol) {
      return { format: 'TAGIHAN', nisCol, namaCol, kelasCol, jurusanCol }
    }
  }

  // Check simple format
  const nisCol = Object.entries(colMap).find(([h]) => SIMPLE_HEADER_ALIASES.nis.includes(h))?.[1]
  const namaCol = Object.entries(colMap).find(([h]) =>
    SIMPLE_HEADER_ALIASES.nama.includes(h),
  )?.[1]
  const rombelCol = Object.entries(colMap).find(([h]) =>
    SIMPLE_HEADER_ALIASES.rombel.includes(h),
  )?.[1]

  if (nisCol && rombelCol) {
    return { format: 'SIMPLE', nisCol, namaCol: namaCol ?? 0, rombelCol }
  }

  return null
}

// ---------------------------------------------------------------------------
// Rombel kode builder for Tagihan format
// ---------------------------------------------------------------------------

/**
 * Normalizes kelas string like "X.", "XI", "XII." → "X" | "XI" | "XII"
 */
function normalizeKelasStr(raw: string): string {
  return raw.trim().replace(/\.+$/, '').toUpperCase()
}

/**
 * Builds rombel kode from kelas + jurusan (nomor).
 * E.g. kelas="XI", jurusan="6" → "XI.6"
 */
function buildRombelKode(kelas: string, jurusan: string): string {
  const k = normalizeKelasStr(kelas)
  const j = jurusan.trim()
  if (!k || !j) return ''
  return `${k}.${j}`
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export async function parseNaikKelasWorkbook(
  buffer: Buffer | Uint8Array,
  fileName: string,
): Promise<NaikKelasParseResult> {
  const errors: string[] = []
  const rows: ParsedNaikKelasRow[] = []

  const workbook = new ExcelJS.Workbook()
  try {
    await (workbook.xlsx.load as (data: unknown) => Promise<ExcelJS.Workbook>)(buffer)
  } catch (err) {
    return {
      rows: [],
      errors: [
        `Gagal membaca file Excel (${fileName}): ${err instanceof Error ? err.message : 'format tidak dikenali'}.`,
      ],
    }
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) {
    return { rows: [], errors: ['Workbook tidak memiliki sheet.'] }
  }

  // Find header row — scan up to first 10 rows
  let headerMap: HeaderMap | null = null
  let headerRowNumber = 0
  const scanLimit = Math.min(10, sheet.rowCount)
  for (let r = 1; r <= scanLimit; r += 1) {
    const candidate = detectFormat(sheet.getRow(r))
    if (candidate) {
      headerMap = candidate
      headerRowNumber = r
      break
    }
  }

  if (!headerMap || headerRowNumber === 0) {
    return {
      rows: [],
      errors: [
        'Tidak dapat mengenali header. Pastikan kolom NIS, Nama, dan Rombel Baru (atau format Tagihan asik) tersedia.',
      ],
    }
  }

  let rowIndex = 0
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)

    // Skip fully-empty rows
    const hasContent = Array.isArray(row.values)
      ? row.values.some((v) => cellToString(v as ExcelJS.CellValue).trim() !== '')
      : false
    if (!hasContent) continue

    let nis = ''
    let namaExcel = ''
    let rombelKode = ''

    if (headerMap.format === 'SIMPLE') {
      nis = readCell(row, headerMap.nisCol)
      namaExcel = headerMap.namaCol ? readCell(row, headerMap.namaCol) : ''
      rombelKode = readCell(row, headerMap.rombelCol)
    } else {
      // TAGIHAN format
      nis = readCell(row, headerMap.nisCol)
      namaExcel = headerMap.namaCol ? readCell(row, headerMap.namaCol) : ''
      const kelas = readCell(row, headerMap.kelasCol)
      const jurusan = readCell(row, headerMap.jurusanCol)
      rombelKode = buildRombelKode(kelas, jurusan)
    }

    // Basic validation — row-level errors are stored on the row as empty nis/rombel
    // so the service can surface them to the user.
    if (!nis) {
      errors.push(`Baris ${rowIndex + 1}: NIS kosong — baris dilewati.`)
      rowIndex += 1
      continue
    }

    rows.push({ rowIndex, nis, namaExcel, rombelKode })
    rowIndex += 1
  }

  return { rows, errors }
}
