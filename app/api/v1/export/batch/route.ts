import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import JSZip from 'jszip'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { logExport } from '@/lib/export/audit'
import {
  generatePdfForRombel,
  resolveRombelsForBatch,
} from '@/services/pdf.service'
import { generateExcelForRombel } from '@/services/excel-export.service'
import { formatRombelLabel } from '@/services/matrix-data.service'

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

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU])

  const json = await req.json()
  const { filter, format } = batchBodySchema.parse(json)

  const rombels = await resolveRombelsForBatch(filter)

  const zip = new JSZip()

  // Work serially to bound memory. React-PDF + exceljs are both CPU-heavy so
  // parallelism wouldn't buy much and could OOM a small VPS.
  let count = 0
  for (const r of rombels) {
    const label = formatRombelLabel(r.grade, r.nomor)
    const prefix = `Komite_${label}`
    if (format === 'pdf' || format === 'both') {
      const pdf = await generatePdfForRombel(r.id)
      zip.file(`${prefix}/${pdf.fileName}`, pdf.buffer)
      count += 1
    }
    if (format === 'excel' || format === 'both') {
      const xls = await generateExcelForRombel(r.id)
      zip.file(`${prefix}/${xls.fileName}`, xls.buffer)
      count += 1
    }
  }

  const zipBytes = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  void logExport({
    userId: user.userId,
    action: 'EXPORT_BATCH',
    angkatan: filter.angkatan,
    format: 'zip',
    metadata: {
      files: count,
      rombels: rombels.length,
      selection: format,
    },
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const tag = filter.angkatan ? `angkatan_${filter.angkatan}` : `rombel_${rombels.length}`
  const fileName = `Export_Komite_${tag}_${stamp}.zip`

  // Copy into a plain ArrayBuffer so the Blob/BodyInit type constraints are
  // satisfied regardless of the Uint8Array's backing buffer kind.
  const ab = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(ab).set(zipBytes)
  const body = new Blob([ab], { type: 'application/zip' })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': String(zipBytes.byteLength),
    },
  })
})
