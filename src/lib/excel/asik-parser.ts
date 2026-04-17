/**
 * Parser untuk Excel Rekonsiliasi dari asik.bpdbali.
 *
 * Sheet target: "Report Transaksi" (case-insensitive, fallback ke sheet pertama
 * kalau tidak ketemu). 20 kolom, urutan lihat PLAN section 6.
 *
 * Parser ini hanya bertugas:
 *   - baca workbook,
 *   - normalisasi tiap row (trim, cast, translate Kelas "X." → enum Grade),
 *   - return `ParsedRow[]` + metadata (fileHash, sheet yang dibaca, errors).
 *
 * Tidak sentuh database — deteksi duplikat ada di `import.service`.
 */

import { createHash } from 'node:crypto'

import ExcelJS from 'exceljs'
import type { Grade } from '@prisma/client'

export interface ParsedRowError {
  field: string
  message: string
}

export interface ParsedRow {
  /** 1-based index in the source sheet (header excluded). */
  rowIndex: number
  instansi: string | null
  nis: string
  nama: string
  kelas: Grade | null
  rombelNomor: number | null
  /** Periode SPP (bukan bulan transaksi). */
  periodYear: number | null
  periodMonth: number | null
  amount: number
  biayaAdm: number
  tanggalTransaksi: Date | null
  statusBayar: string | null
  noBukti: string
  kodeCabang: string | null
  tellerUser: string | null
  statusReversal: string | null
  /** List of parse-time errors — empty means the row is structurally usable. */
  errors: ParsedRowError[]
  /** Original raw cell values (as string) untuk audit / UI inspection. */
  raw: Record<string, string>
}

export interface ParseResult {
  fileHash: string
  fileName: string
  fileSize: number
  sheetName: string | null
  totalRows: number
  rows: ParsedRow[]
  /** Workbook-level error (e.g. sheet missing). Empty bila sukses. */
  errors: string[]
}

/** Header synonyms we accept (lowercased, trimmed, punctuation-light, underscores→spaces). */
const HEADER_ALIASES: Record<string, string[]> = {
  instansi: ['instansi', 'id sklh'],
  // 'id' is a fallback for the snake_case asik.bpdbali export format (column named 'id')
  noTagihan: ['no. tagihan', 'no tagihan', 'notagihan', 'nis', 'id'],
  nama: ['nama'],
  tagihan: ['tagihan', 'jum tagihan'],
  biayaAdm: ['biaya adm.', 'biaya adm', 'biayaadm'],
  tagihanLain: ['tagihan lain'],
  ketTagihanLain: ['ket. tagihan lain', 'ket tagihan lain'],
  alamat: ['alamat'],
  kelas: ['kelas'],
  jurusan: ['jurusan'],
  tahun: ['tahun'],
  bulan: ['bulan'],
  danaMasyarakat: ['dana masyarakat'],
  keterangan: ['keterangan'],
  tanggalTransaksi: ['tanggal transaksi', 'tgl transaksi', 'tanggal', 'tgl tx'],
  statusBayar: ['status bayar', 'status', 'sts bayar'],
  kodeCabang: ['kode cabang', 'cabang', 'kd cab'],
  user: ['user', 'teller', 'kd user'],
  statusReversal: ['status reversal', 'sts reversal'],
  noBukti: ['no. bukti', 'no bukti', 'nobukti'],
}

type HeaderKey = keyof typeof HEADER_ALIASES

function normalizeHeader(v: string): string {
  // Replace underscores with spaces so snake_case headers (e.g. id_sklh, sts_bayar) also match
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
      return (obj.richText as Array<{ text?: string }>)
        .map((p) => p.text ?? '')
        .join('')
    }
    if ('hyperlink' in obj && typeof obj.hyperlink === 'string') return obj.hyperlink
    if ('formula' in obj && typeof (obj as { formula?: string }).formula === 'string') {
      const r = (obj as { result?: unknown }).result
      if (typeof r === 'string' || typeof r === 'number') return String(r)
      return ''
    }
  }
  return String(value)
}

function normalizeKelas(raw: string): Grade | null {
  const v = raw.trim().replace(/\.+$/, '').toUpperCase()
  if (v === 'X' || v === '10') return 'X'
  if (v === 'XI' || v === '11') return 'XI'
  if (v === 'XII' || v === '12') return 'XII'
  return null
}

function parseNumber(raw: string): number {
  const s = raw.replace(/[^\d.,-]/g, '')
  // Detect thousands-separator style:
  // If comma comes before a dot (e.g. "350,000.00") → comma is thousands, dot is decimal
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastDot > lastComma) {
      // English format: 350,000.00 → strip commas
      normalized = s.replace(/,/g, '')
    } else {
      // European format: 350.000,00 → strip dots, replace comma with dot
      normalized = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (lastComma !== -1) {
    // Only comma: treat as decimal separator (e.g. "350000,00")
    normalized = s.replace(',', '.')
  } else {
    normalized = s
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

/**
 * Swap day ↔ month of a date. Returns null if the swapped month would be
 * invalid (>12). Preserves time component.
 */
function swapDayMonth(d: Date): Date | null {
  const day = d.getDate()
  const month = d.getMonth() + 1 // 1-12
  if (day < 1 || day > 12) return null // can't become a valid month
  return new Date(
    d.getFullYear(),
    day - 1, // new month = old day
    month, // new day = old month
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  )
}

/**
 * Fix a date that appears to have been exported by asik.bpdbali with
 * swapped DD/MM components (common bug: "12/01/2026" exported to Excel as
 * Dec 1 2026 instead of Jan 12 2026 due to US-locale interpretation).
 *
 * Heuristic: if `d` is in the future, try swapping DD↔MM. If the swapped
 * date is:
 *   - valid (day ≤ 12 so month is 1-12 after swap)
 *   - in the past (<= now)
 *   - within a reasonable year window (>= 2019)
 * then return the swapped date. Otherwise return original.
 */
function maybeFixDDMMSwap(d: Date): Date {
  const now = Date.now()
  if (d.getTime() <= now) return d
  const swapped = swapDayMonth(d)
  if (!swapped) return d
  if (swapped.getTime() > now) return d
  if (swapped.getFullYear() < 2019) return d
  return swapped
}

function parseTanggalTransaksi(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  // "dd/mm/yyyy HH:MM:SS" or "dd/mm/yyyy"
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
  )
  if (m) {
    const [, dd = '01', mm = '01', yyyy = '2000', hh = '0', mi = '0', ss = '0'] = m
    const d = new Date(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(mi),
      Number(ss),
    )
    return Number.isNaN(d.getTime()) ? null : d
  }
  // ISO fallback (typed Excel Date cells arrive as ISO via cellToString).
  // Apply DD/MM swap heuristic for future-dated values (asik exporter bug).
  const iso = new Date(s)
  if (Number.isNaN(iso.getTime())) return null
  return maybeFixDDMMSwap(iso)
}

function parsePeriodYear(raw: string): number | null {
  const n = Number(raw.trim())
  if (!Number.isInteger(n)) return null
  if (n < 2000 || n > 2100) return null
  return n
}

function parsePeriodMonth(raw: string): number | null {
  const n = Number(raw.trim())
  if (!Number.isInteger(n)) return null
  if (n < 1 || n > 12) return null
  return n
}

function parseRombelNomor(raw: string): number | null {
  const n = Number(raw.trim())
  if (!Number.isInteger(n)) return null
  if (n < 1 || n > 30) return null
  return n
}

function readCell(row: ExcelJS.Row, col: number | undefined): string {
  if (!col) return ''
  return cellToString(row.getCell(col).value).trim()
}

/**
 * Compute SHA-256 of a Buffer/Uint8Array. Hex string.
 */
export function sha256(input: Uint8Array): string {
  return createHash('sha256').update(input).digest('hex')
}

function pickSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  const preferred = workbook.worksheets.find(
    (ws) => normalizeHeader(ws.name) === 'report transaksi',
  )
  if (preferred) return preferred
  return workbook.worksheets[0] ?? null
}

export interface ParseOptions {
  fileName: string
}

export async function parseAsikWorkbook(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  opts: ParseOptions,
): Promise<ParseResult> {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  const fileHash = sha256(bytes)
  const fileSize = bytes.byteLength

  const workbook = new ExcelJS.Workbook()
  try {
    // exceljs typings expect Node Buffer; at runtime it handles Uint8Array fine.
    await (workbook.xlsx.load as (data: unknown) => Promise<ExcelJS.Workbook>)(bytes)
  } catch (err) {
    return {
      fileHash,
      fileName: opts.fileName,
      fileSize,
      sheetName: null,
      totalRows: 0,
      rows: [],
      errors: [
        `Gagal membaca file Excel: ${err instanceof Error ? err.message : 'format tidak dikenali'}.`,
      ],
    }
  }

  const sheet = pickSheet(workbook)
  if (!sheet) {
    return {
      fileHash,
      fileName: opts.fileName,
      fileSize,
      sheetName: null,
      totalRows: 0,
      rows: [],
      errors: ['Workbook tidak memiliki sheet apa pun.'],
    }
  }

  // Find header row — scan first 10 rows for one that matches at least 5 aliases.
  let headerRowNumber: number | null = null
  let headerMap: Map<HeaderKey, number> | null = null
  const scanLimit = Math.min(10, sheet.rowCount)
  for (let r = 1; r <= scanLimit; r += 1) {
    const row = sheet.getRow(r)
    const map = buildHeaderMap(row)
    if (map.size >= 5) {
      headerRowNumber = r
      headerMap = map
      break
    }
  }

  if (!headerRowNumber || !headerMap) {
    return {
      fileHash,
      fileName: opts.fileName,
      fileSize,
      sheetName: sheet.name,
      totalRows: 0,
      rows: [],
      errors: [
        'Tidak dapat mengenali header. Pastikan sheet "Report Transaksi" dari asik.bpdbali.',
      ],
    }
  }

  const rows: ParsedRow[] = []
  for (let r = headerRowNumber + 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r)
    // Skip fully-empty rows
    const hasContent = row.values && Array.isArray(row.values)
      ? row.values.some((v) => cellToString(v as ExcelJS.CellValue).trim() !== '')
      : false
    if (!hasContent) continue

    const raw: Record<string, string> = {}
    for (const [key, col] of headerMap) {
      raw[key] = readCell(row, col)
    }

    const rowErrors: ParsedRowError[] = []

    const nis = raw.noTagihan?.trim() ?? ''
    if (!nis) rowErrors.push({ field: 'nis', message: 'NIS (No. Tagihan) kosong.' })

    const noBukti = raw.noBukti?.trim() ?? ''
    if (!noBukti) rowErrors.push({ field: 'noBukti', message: 'No. Bukti kosong.' })

    // Use tagihan (jum_tagihan) first; fall back to danaMasyarakat for files that only have that column
    const amount = parseNumber(raw.tagihan ?? raw.danaMasyarakat ?? '0')
    if (amount <= 0) {
      rowErrors.push({ field: 'amount', message: 'Nominal tagihan tidak valid.' })
    }

    const periodYear = parsePeriodYear(raw.tahun ?? '')
    if (periodYear === null) {
      rowErrors.push({ field: 'periodYear', message: 'Tahun periode tidak valid.' })
    }
    const periodMonth = parsePeriodMonth(raw.bulan ?? '')
    if (periodMonth === null) {
      rowErrors.push({ field: 'periodMonth', message: 'Bulan periode tidak valid (1-12).' })
    }

    const tanggalTransaksi = parseTanggalTransaksi(raw.tanggalTransaksi ?? '')
    if (!tanggalTransaksi) {
      rowErrors.push({
        field: 'tanggalTransaksi',
        message: 'Format tanggal transaksi tidak dikenali.',
      })
    }
    // Note: DD↔MM swap heuristic is intentionally NOT applied here.
    // Rekonsiliasi file stores tanggal as "DD/MM/YYYY" strings which the
    // regex parser handles correctly. Applying swap would corrupt legit
    // late payments where day coincidentally equals periodMonth (e.g. paid
    // 12 Feb 2026 for period 2025-12). The swap is only relevant for
    // typed-date Excel cells from recon compile (handled via
    // `maybeFixDDMMSwap` inside parseTanggalTransaksi's ISO fallback).

    // Skip reversed (cancelled) transactions — sts_reversal = '1' or 'ya'
    const reversalRaw = raw.statusReversal?.trim().toLowerCase() ?? ''
    if (reversalRaw === '1' || reversalRaw === 'ya') {
      rowErrors.push({ field: 'statusReversal', message: 'Transaksi dibatalkan (reversal) — dilewati.' })
    }

    rows.push({
      rowIndex: rows.length,
      instansi: raw.instansi?.trim() || null,
      nis,
      nama: raw.nama?.trim() ?? '',
      kelas: normalizeKelas(raw.kelas ?? ''),
      rombelNomor: parseRombelNomor(raw.jurusan ?? ''),
      periodYear,
      periodMonth,
      amount,
      biayaAdm: parseNumber(raw.biayaAdm ?? '0'),
      tanggalTransaksi,
      statusBayar: raw.statusBayar?.trim() || null,
      noBukti,
      kodeCabang: raw.kodeCabang?.trim() || null,
      tellerUser: raw.user?.trim() || null,
      statusReversal: raw.statusReversal?.trim() || null,
      errors: rowErrors,
      raw,
    })
  }

  return {
    fileHash,
    fileName: opts.fileName,
    fileSize,
    sheetName: sheet.name,
    totalRows: rows.length,
    rows,
    errors: [],
  }
}
