import React from 'react'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { renderToBuffer } from '@react-pdf/renderer'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { logExport } from '@/lib/export/audit'
import {
  resolveRombelsForBatch,
} from '@/services/pdf.service'
import { generateExcelForRombel } from '@/services/excel-export.service'
import {
  buildMatrix,
  formatRombelLabel,
  resolveAngkatanForRombel,
  type MatrixData,
  type MatrixRombelGroup,
} from '@/services/matrix-data.service'
import { MatrixDocument, type SchoolInfo } from '@/lib/pdf/matrix-document'
import { buildRekapExcel } from '@/lib/excel/builder'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const batchBodySchema = z.object({
  filter: z
    .object({
      angkatan: z.number().int().optional(),
      rombelIds: z.array(z.string().min(1)).optional(),
      tahunAjaranId: z.string().min(1).optional(),
    })
    .refine(
      (v) => v.angkatan !== undefined || (v.rombelIds && v.rombelIds.length > 0),
      { message: 'Minimal satu filter: angkatan atau rombelIds.' },
    ),
  format: z.enum(['pdf', 'excel', 'both']).default('pdf'),
})

async function getSchoolInfo(): Promise<SchoolInfo> {
  try {
    const [name, addr, npsn] = await Promise.all([
      prisma.setting.findUnique({ where: { key: 'school.name' } }),
      prisma.setting.findUnique({ where: { key: 'school.address' } }),
      prisma.setting.findUnique({ where: { key: 'school.npsn' } }),
    ])
    return {
      namaSekolah: (name?.value as string) ?? 'SMAN 1 Denpasar',
      alamat: (addr?.value as string) ?? undefined,
      npsn: (npsn?.value as string) ?? undefined,
    }
  } catch {
    return { namaSekolah: 'SMAN 1 Denpasar' }
  }
}

function buildFileName(
  format: string,
  rombels: Array<{ grade: string; nomor: number }>,
  angkatan?: number,
): string {
  const stamp = new Date().toISOString().slice(0, 10)
  if (rombels.length === 1) {
    const r = rombels[0]!
    const label = formatRombelLabel(r.grade as 'X' | 'XI' | 'XII', r.nomor)
    return `Komite_${angkatan ?? ''}_${label}_${stamp}.${format}`
  }
  const tag = angkatan ? `Angkatan_${angkatan}` : `${rombels.length}_rombel`
  return `Komite_${tag}_${stamp}.${format}`
}

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])
  const json = await req.json()
  const { filter, format } = batchBodySchema.parse(json)
  const rombels = await resolveRombelsForBatch(filter)
  const school = await getSchoolInfo()

  void logExport({
    userId: user.userId,
    action: 'EXPORT_BATCH',
    angkatan: filter.angkatan,
    format,
    metadata: { rombels: rombels.length, selection: format },
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })

  // ─── PDF only: 1 merged PDF file ──────────────────────────
  if (format === 'pdf') {
    // Build matrix per rombel, merge all into 1 Document
    const allRombelGroups: MatrixRombelGroup[] = []
    let angkatan = filter.angkatan
    let periods = undefined as MatrixData['periods'] | undefined

    for (const r of rombels) {
      const angk = angkatan ?? (await resolveAngkatanForRombel(r.id))
      if (!angkatan) angkatan = angk
      const data = await buildMatrix({ angkatan: angk, rombelId: r.id })
      if (!periods) periods = data.periods
      allRombelGroups.push(...data.rombels)
    }

    if (!periods || allRombelGroups.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_DATA', message: 'Tidak ada data rombel.' } },
        { status: 404 },
      )
    }

    const mergedData: MatrixData = {
      angkatan: angkatan!,
      periods,
      rombels: allRombelGroups,
      generatedAt: new Date(),
    }

    const buf = await renderToBuffer(
      <MatrixDocument data={mergedData} school={school} />,
    )

    const fileName = buildFileName('pdf', rombels, angkatan)
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  // ─── Excel only: 1 file, multi-sheet ──────────────────────
  if (format === 'excel') {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Sistem Pembayaran SPP'
    wb.created = new Date()
    let angkatan = filter.angkatan

    for (const r of rombels) {
      const angk = angkatan ?? (await resolveAngkatanForRombel(r.id))
      if (!angkatan) angkatan = angk
      const data = await buildMatrix({ angkatan: angk, rombelId: r.id })
      const label = formatRombelLabel(r.grade, r.nomor)

      // Build per-rombel workbook then copy sheets into merged wb
      const rWb = await buildRekapExcel(data, school)
      for (const srcSheet of rWb.worksheets) {
        const sheetName = `${label}_${srcSheet.name}`.slice(0, 31) // Excel 31-char limit
        const dst = wb.addWorksheet(sheetName, {
          views: [{ state: 'frozen', ySplit: 1 }],
        })
        // Copy columns
        dst.columns = srcSheet.columns.map((c) => ({
          header: c.header as string,
          key: c.key,
          width: c.width,
        }))
        // Copy rows (skip header — already set via columns)
        srcSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return
          const newRow = dst.getRow(rowNumber)
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const newCell = newRow.getCell(colNumber)
            newCell.value = cell.value
            newCell.numFmt = cell.numFmt
            if (cell.font) newCell.font = { ...cell.font }
            if (cell.fill) newCell.fill = cell.fill as ExcelJS.Fill
          })
          newRow.commit()
        })
        // Header styling
        const hdr = dst.getRow(1)
        hdr.font = { bold: true }
        dst.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: dst.columnCount },
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const fileName = buildFileName('xlsx', rombels, angkatan)
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  }

  // ─── Both: ZIP (PDF + Excel gabisa jadi 1 file) ──────────
  const zip = new JSZip()
  let angkatan = filter.angkatan

  // Build merged PDF
  const allGroups: MatrixRombelGroup[] = []
  let periods: MatrixData['periods'] | undefined
  for (const r of rombels) {
    const angk = angkatan ?? (await resolveAngkatanForRombel(r.id))
    if (!angkatan) angkatan = angk
    const data = await buildMatrix({ angkatan: angk, rombelId: r.id })
    if (!periods) periods = data.periods
    allGroups.push(...data.rombels)
  }

  if (periods && allGroups.length > 0) {
    const mergedData: MatrixData = {
      angkatan: angkatan!,
      periods,
      rombels: allGroups,
      generatedAt: new Date(),
    }
    const pdfBuf = await renderToBuffer(
      <MatrixDocument data={mergedData} school={school} />,
    )
    zip.file(buildFileName('pdf', rombels, angkatan), new Uint8Array(pdfBuf))
  }

  // Build merged Excel
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistem Pembayaran SPP'
  for (const r of rombels) {
    const angk = angkatan ?? (await resolveAngkatanForRombel(r.id))
    const data = await buildMatrix({ angkatan: angk, rombelId: r.id })
    const label = formatRombelLabel(r.grade, r.nomor)
    const rWb = await buildRekapExcel(data, school)
    for (const srcSheet of rWb.worksheets) {
      const sheetName = `${label}_${srcSheet.name}`.slice(0, 31)
      const dst = wb.addWorksheet(sheetName, {
        views: [{ state: 'frozen', ySplit: 1 }],
      })
      dst.columns = srcSheet.columns.map((c) => ({
        header: c.header as string, key: c.key, width: c.width,
      }))
      srcSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber === 1) return
        const newRow = dst.getRow(rowNumber)
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const nc = newRow.getCell(colNumber)
          nc.value = cell.value
          nc.numFmt = cell.numFmt
          if (cell.font) nc.font = { ...cell.font }
          if (cell.fill) nc.fill = cell.fill as ExcelJS.Fill
        })
        newRow.commit()
      })
      dst.getRow(1).font = { bold: true }
    }
  }
  const xlsBuf = await wb.xlsx.writeBuffer()
  zip.file(buildFileName('xlsx', rombels, angkatan), new Uint8Array(xlsBuf as ArrayBuffer))

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const zipName = buildFileName('zip', rombels, angkatan)
  const ab = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(ab).set(zipBytes)

  return new NextResponse(new Blob([ab], { type: 'application/zip' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
})
