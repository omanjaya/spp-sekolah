/**
 * Excel workbook builder for the rekap export.
 *
 * Two sheets:
 *  1. "Matrix"        — siswa × 36 bulan (same layout as PDF)
 *  2. "Detail Transaksi" — NIS, Nama, Periode, Tanggal Bayar, Nominal, No Bukti, Kode Cabang
 */

import ExcelJS from 'exceljs'

import {
  cellDisplay,
  formatRombelLabel,
  type MatrixData,
  type MatrixRombelGroup,
} from '@/services/matrix-data.service'
import type { SchoolInfo } from '@/lib/pdf/matrix-document'
import { prisma } from '@/lib/db'

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5F9' },
}

const TITLE_FONT: Partial<ExcelJS.Font> = {
  name: 'Inter',
  size: 11,
  bold: true,
  color: { argb: 'FF0F172A' },
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Inter',
  size: 9,
  bold: true,
  color: { argb: 'FF0F172A' },
}

const BODY_FONT: Partial<ExcelJS.Font> = {
  name: 'Inter',
  size: 9,
  color: { argb: 'FF0F172A' },
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: ExcelJS.Border = { style: 'thin', color: { argb: 'FF94A3B8' } }
  return {
    top: side,
    left: side,
    bottom: side,
    right: side,
  }
}

/**
 * Build the workbook.
 *
 * Note: when data contains multiple rombel groups, we emit them sequentially
 * (with a blank row + subheader between) on the same "Matrix" sheet so users
 * can see the entire angkatan in one go.
 */
export async function buildRekapExcel(
  data: MatrixData,
  school: SchoolInfo,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran Sumbangan Komite'
  wb.lastModifiedBy = 'Sistem Pembayaran Sumbangan Komite'
  wb.created = new Date()
  wb.modified = new Date()

  buildMatrixSheet(wb, data, school)
  await buildDetailSheet(wb, data)
  return wb
}

// ─── Sheet 1 — Matrix ──────────────────────────────────────
function buildMatrixSheet(wb: ExcelJS.Workbook, data: MatrixData, school: SchoolInfo): void {
  const sheet = wb.addWorksheet('Matrix', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: 'frozen', xSplit: 3, ySplit: 6 }],
  })

  // Title block (rows 1-3).
  sheet.mergeCells(1, 1, 1, 3 + data.periods.length)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = 'DAFTAR SISWA YANG MEMBAYAR UANG KOMITE'
  titleCell.font = TITLE_FONT
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }

  sheet.mergeCells(2, 1, 2, 3 + data.periods.length)
  sheet.getCell(2, 1).value = school.namaSekolah
  sheet.getCell(2, 1).alignment = { horizontal: 'center' }
  sheet.getCell(2, 1).font = { ...BODY_FONT, bold: true }

  sheet.mergeCells(3, 1, 3, 3 + data.periods.length)
  sheet.getCell(3, 1).value = `Angkatan: ${data.angkatan}`
  sheet.getCell(3, 1).alignment = { horizontal: 'center' }
  sheet.getCell(3, 1).font = BODY_FONT

  // Column widths.
  sheet.getColumn(1).width = 5
  sheet.getColumn(2).width = 12
  sheet.getColumn(3).width = 28
  for (let i = 0; i < data.periods.length; i += 1) {
    sheet.getColumn(4 + i).width = 11
  }

  let cursor = 5

  for (const rombel of data.rombels) {
    cursor = writeRombelBlock(sheet, data, rombel, cursor)
    cursor += 2 // blank spacer row
  }

  // AutoFilter over main header (assumes at least one block was written).
}

function writeRombelBlock(
  sheet: ExcelJS.Worksheet,
  data: MatrixData,
  rombel: MatrixRombelGroup,
  startRow: number,
): number {
  // Sub-header row (e.g. "Kelas X1 — Wali Kelas: ...").
  const totalCols = 3 + data.periods.length
  sheet.mergeCells(startRow, 1, startRow, totalCols)
  const subCell = sheet.getCell(startRow, 1)
  subCell.value =
    `Kelas ${formatRombelLabel(rombel.grade, rombel.nomor)} — Tahun Ajaran ${rombel.tahunAjaranKode}` +
    (rombel.waliKelas ? ` — Wali: ${rombel.waliKelas}` : '')
  subCell.font = { ...BODY_FONT, bold: true }
  subCell.alignment = { horizontal: 'left' }

  const headerRow = startRow + 1
  const row = sheet.getRow(headerRow)
  row.getCell(1).value = 'No'
  row.getCell(2).value = 'NIS'
  row.getCell(3).value = 'Nama'
  for (let i = 0; i < data.periods.length; i += 1) {
    const p = data.periods[i]
    if (!p) continue
    row.getCell(4 + i).value = `${p.label}\n${p.year}`
  }
  row.eachCell((cell) => {
    cell.font = HEADER_FONT
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = HEADER_FILL
    cell.border = thinBorder()
  })
  row.height = 28

  let nextRow = headerRow + 1
  for (let i = 0; i < rombel.siswa.length; i += 1) {
    const s = rombel.siswa[i]
    if (!s) continue
    const r = sheet.getRow(nextRow)
    r.getCell(1).value = i + 1
    r.getCell(2).value = s.nis
    r.getCell(3).value = s.nama
    for (let pi = 0; pi < data.periods.length; pi += 1) {
      const p = data.periods[pi]
      if (!p) continue
      const key = `${p.year}-${String(p.month).padStart(2, '0')}`
      const cell = s.cells[key]
      const display = cellDisplay(cell)
      r.getCell(4 + pi).value = display
    }
    r.eachCell((c) => {
      c.font = BODY_FONT
      c.border = thinBorder()
      c.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    r.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }
    r.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }

    // Light striping.
    if (i % 2 === 1) {
      r.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFAFBFC' },
        } satisfies ExcelJS.FillPattern
      })
    }
    nextRow += 1
  }

  // AutoFilter on the header row of this block.
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: nextRow - 1, column: totalCols },
  }

  return nextRow
}

// ─── Sheet 2 — Detail Transaksi ────────────────────────────
async function buildDetailSheet(wb: ExcelJS.Workbook, data: MatrixData): Promise<void> {
  const sheet = wb.addWorksheet('Detail Transaksi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  const columns: Array<Partial<ExcelJS.Column>> = [
    { header: 'NIS', key: 'nis', width: 14 },
    { header: 'Nama', key: 'nama', width: 28 },
    { header: 'Kelas', key: 'kelas', width: 10 },
    { header: 'Periode', key: 'periode', width: 12 },
    { header: 'Tanggal Bayar', key: 'tgl', width: 14 },
    { header: 'Nominal', key: 'nominal', width: 14, style: { numFmt: '"Rp"#,##0' } },
    { header: 'Biaya Adm', key: 'adm', width: 12, style: { numFmt: '"Rp"#,##0' } },
    { header: 'No Bukti', key: 'noBukti', width: 18 },
    { header: 'Kode Cabang', key: 'kodeCabang', width: 14 },
    { header: 'Teller', key: 'teller', width: 14 },
    { header: 'Sumber', key: 'source', width: 14 },
  ]
  sheet.columns = columns

  const headerRow = sheet.getRow(1)
  headerRow.eachCell((c) => {
    c.font = HEADER_FONT
    c.fill = HEADER_FILL
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = thinBorder()
  })
  headerRow.height = 22

  // Build flat list of siswa ids & mapping back to kelas label for rows.
  const siswaIndex = new Map<string, { nis: string; nama: string; kelas: string }>()
  for (const r of data.rombels) {
    const label = formatRombelLabel(r.grade, r.nomor)
    for (const s of r.siswa) {
      siswaIndex.set(s.id, { nis: s.nis, nama: s.nama, kelas: label })
    }
  }
  const ids = Array.from(siswaIndex.keys())
  if (ids.length === 0) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
    return
  }

  // Limit to the 36-month window for efficiency.
  const first = data.periods[0]
  const last = data.periods[data.periods.length - 1]
  const pembayarans = await prisma.pembayaran.findMany({
    where: {
      siswaId: { in: ids },
      statusBayar: 'TERBAYAR',
      ...(first && last
        ? {
            OR: [
              { periodYear: { gt: first.year, lt: last.year } },
              { periodYear: first.year, periodMonth: { gte: first.month } },
              { periodYear: last.year, periodMonth: { lte: last.month } },
            ],
          }
        : {}),
    },
    orderBy: [{ tanggalTransaksi: 'asc' }],
  })

  for (const p of pembayarans) {
    const s = siswaIndex.get(p.siswaId)
    if (!s) continue
    const row = sheet.addRow({
      nis: s.nis,
      nama: s.nama,
      kelas: s.kelas,
      periode: `${p.periodYear}-${String(p.periodMonth).padStart(2, '0')}`,
      tgl: p.tanggalTransaksi,
      nominal: Number(p.amount),
      adm: Number(p.biayaAdm),
      noBukti: p.noBukti ?? '',
      kodeCabang: p.kodeCabang ?? '',
      teller: p.tellerUser ?? '',
      source: p.source,
    })
    row.eachCell((c) => {
      c.font = BODY_FONT
      c.border = thinBorder()
    })
    const tgl = row.getCell('tgl')
    tgl.numFmt = 'dd/mm/yyyy'
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: sheet.rowCount, column: columns.length },
  }
}
