/**
 * TSV paste parser untuk pembayaran.
 *
 * Input: teks yang di-copy dari spreadsheet (tab-separated, optional header).
 * Kolom yang dikenali:
 *   NIS | Nama | Periode (YYYY-MM) | Amount | Tanggal | NoBukti?
 *
 * Output mirror `ParsedRow` shape agar bisa reuse preview/confirm yang sama.
 */

import type { ParsedRow, ParsedRowError, ParseResult } from '@/lib/excel/asik-parser'
import { sha256 } from '@/lib/excel/asik-parser'

type HeaderKey = 'nis' | 'nama' | 'periode' | 'amount' | 'tanggal' | 'noBukti'

const HEADER_ALIASES: Record<string, HeaderKey> = {
  nis: 'nis',
  'no. tagihan': 'nis',
  'no tagihan': 'nis',
  nama: 'nama',
  periode: 'periode',
  'periode spp': 'periode',
  amount: 'amount',
  tagihan: 'amount',
  nominal: 'amount',
  tanggal: 'tanggal',
  'tanggal transaksi': 'tanggal',
  nobukti: 'noBukti',
  'no bukti': 'noBukti',
  'no. bukti': 'noBukti',
}

const DEFAULT_ORDER: HeaderKey[] = ['nis', 'nama', 'periode', 'amount', 'tanggal', 'noBukti']

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitRow(line: string): string[] {
  // Accept tab OR multi-space OR semicolon as separators — users paste from anywhere.
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim())
  if (line.includes(';')) return line.split(';').map((c) => c.trim())
  return line.split(/\s{2,}/).map((c) => c.trim())
}

function parsePeriode(raw: string): { year: number | null; month: number | null } {
  const s = raw.trim()
  if (!s) return { year: null, month: null }
  const m =
    s.match(/^(\d{4})[-/](\d{1,2})$/) ??
    s.match(/^(\d{1,2})[-/](\d{4})$/)
  if (!m) return { year: null, month: null }
  const [a, b] = [m[1] ?? '', m[2] ?? '']
  const aNum = Number(a)
  const bNum = Number(b)
  if (a.length === 4) {
    return { year: aNum, month: bNum }
  }
  return { year: bNum, month: aNum }
}

function parseAmountLoose(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '')
  const n = Number(cleaned.replace(/,/g, '.'))
  return Number.isFinite(n) ? n : 0
}

function parseTanggalLoose(raw: string): Date | null {
  const s = raw.trim()
  if (!s) return null
  const m = s.match(
    /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/,
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
  const iso = new Date(s)
  return Number.isNaN(iso.getTime()) ? null : iso
}

export interface PasteParseOptions {
  /** Nama label untuk batch (mis. "paste-2026-04-16-1630"). */
  label?: string
}

export function parsePembayaranPaste(text: string, opts: PasteParseOptions = {}): ParseResult {
  const bytes = new TextEncoder().encode(text)
  const fileHash = sha256(bytes)
  const fileName = opts.label ? `${opts.label}.tsv` : 'paste.tsv'

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) {
    return {
      fileHash,
      fileName,
      fileSize: bytes.byteLength,
      sheetName: null,
      totalRows: 0,
      rows: [],
      errors: ['Teks paste kosong.'],
    }
  }

  // Detect header row
  const firstLine = lines[0] ?? ''
  const firstCells = splitRow(firstLine).map(normalize)
  const headerKeys: HeaderKey[] = []
  let usedHeader = false
  for (const cell of firstCells) {
    const k = HEADER_ALIASES[cell]
    if (k) {
      headerKeys.push(k)
      usedHeader = true
    } else {
      headerKeys.push('nis') // placeholder; will be overridden
    }
  }

  const columnKeys: HeaderKey[] = usedHeader ? firstCells.map((c) => HEADER_ALIASES[c] ?? ('nis' as HeaderKey)) : DEFAULT_ORDER
  const dataLines = usedHeader ? lines.slice(1) : lines

  const rows: ParsedRow[] = []

  dataLines.forEach((line, idx) => {
    const cells = splitRow(line)
    const rowData: Record<HeaderKey, string> = {
      nis: '',
      nama: '',
      periode: '',
      amount: '',
      tanggal: '',
      noBukti: '',
    }
    cells.forEach((val, i) => {
      const key = columnKeys[i]
      if (!key) return
      rowData[key] = val
    })

    const rowErrors: ParsedRowError[] = []
    const nis = rowData.nis.trim()
    if (!nis) rowErrors.push({ field: 'nis', message: 'NIS kosong.' })

    const { year, month } = parsePeriode(rowData.periode)
    if (!year) rowErrors.push({ field: 'periodYear', message: 'Tahun periode tidak valid.' })
    if (!month) rowErrors.push({ field: 'periodMonth', message: 'Bulan periode tidak valid.' })

    const amount = parseAmountLoose(rowData.amount)
    if (amount <= 0) rowErrors.push({ field: 'amount', message: 'Nominal tidak valid.' })

    const tanggal = parseTanggalLoose(rowData.tanggal)
    if (!tanggal) rowErrors.push({ field: 'tanggalTransaksi', message: 'Tanggal tidak valid.' })

    const noBukti = rowData.noBukti.trim()

    rows.push({
      rowIndex: idx,
      instansi: null,
      nis,
      nama: rowData.nama.trim(),
      kelas: null,
      rombelNomor: null,
      periodYear: year,
      periodMonth: month,
      amount,
      biayaAdm: 0,
      tanggalTransaksi: tanggal,
      statusBayar: 'Terbayar',
      noBukti,
      kodeCabang: null,
      tellerUser: null,
      statusReversal: null,
      errors: rowErrors,
      raw: { ...rowData },
    })
  })

  return {
    fileHash,
    fileName,
    fileSize: bytes.byteLength,
    sheetName: null,
    totalRows: rows.length,
    rows,
    errors: [],
  }
}
