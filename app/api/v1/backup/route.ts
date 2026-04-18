/**
 * GET /api/v1/backup
 *
 * Stream full data export sebagai .json.gz (gzip JSON).
 * Hanya SUPER_ADMIN yang bisa mengakses.
 *
 * Strategi streaming:
 *   AsyncGenerator (backup.service) → Node.js Readable →
 *   zlib.createGzip()              → NextResponse (ReadableStream)
 *
 * Ini memastikan data besar (94K+ rows) tidak di-buffer seluruhnya di RAM.
 */

import { createGzip } from 'node:zlib'
import { Readable } from 'node:stream'
import { type NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { startBackup, getRowCounts } from '@/services/backup.service'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

/** GET /api/v1/backup?countsOnly=true — hanya mengembalikan row counts (untuk UI preview). */
export async function GET(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  const countsOnly = req.nextUrl.searchParams.get('countsOnly') === 'true'

  // ── Hanya row counts (untuk preview di halaman UI) ──────────────────
  if (countsOnly) {
    const rowCounts = await getRowCounts()
    const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0)
    return NextResponse.json({ success: true, data: { rowCounts, totalRows } })
  }

  // ── Full backup download ─────────────────────────────────────────────
  const t0 = Date.now()
  logger.info({ actor: 'backup' }, 'backup: download requested')

  try {
    const { jsonStream } = await startBackup()

    // Konversi AsyncGenerator → Node.js Readable
    const nodeReadable = Readable.from(jsonStream, { objectMode: false })

    // Pipe melalui gzip
    const gzip = createGzip({ level: 6 })
    const gzipStream = nodeReadable.pipe(gzip)

    // Konversi ke Web ReadableStream (dibutuhkan NextResponse)
    const webStream = new ReadableStream({
      start(controller) {
        gzipStream.on('data', (chunk: Buffer) => {
          controller.enqueue(chunk)
        })
        gzipStream.on('end', () => {
          logger.info({ ms: Date.now() - t0 }, 'backup: stream complete')
          controller.close()
        })
        gzipStream.on('error', (err: Error) => {
          logger.error({ err }, 'backup: stream error')
          controller.error(err)
        })
      },
      cancel() {
        gzipStream.destroy()
        nodeReadable.destroy()
      },
    })

    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type':        'application/gzip',
        'Content-Disposition': `attachment; filename="spp_backup_${date}.json.gz"`,
        'Cache-Control':       'no-store, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    logger.error({ err }, 'backup: failed')
    return NextResponse.json(
      { success: false, error: { code: 'BACKUP_ERROR', message: 'Gagal membuat backup.' } },
      { status: 500 },
    )
  }
}
