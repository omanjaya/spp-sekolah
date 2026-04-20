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
import { prisma } from '@/lib/db'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

// Singleton lock — hanya 1 backup full download yang boleh jalan bersamaan.
// Mencegah paralel-download memukul DB connection pool.
let backupInFlight = false

/** GET /api/v1/backup?countsOnly=true — hanya mengembalikan row counts (untuk UI preview). */
export async function GET(req: NextRequest): Promise<Response> {
  const countsOnly = req.nextUrl.searchParams.get('countsOnly') === 'true'

  // countsOnly (preview UI) boleh diakses BENDAHARA; full download hanya SUPER_ADMIN
  const actor = countsOnly
    ? await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
    : await requireRole([ROLES.SUPER_ADMIN])

  // ── Hanya row counts (untuk preview di halaman UI) ──────────────────
  if (countsOnly) {
    const rowCounts = await getRowCounts()
    const totalRows = Object.values(rowCounts).reduce((a, b) => a + b, 0)
    return NextResponse.json({ success: true, data: { rowCounts, totalRows } })
  }

  // ── Full backup download ─────────────────────────────────────────────
  if (backupInFlight) {
    return NextResponse.json(
      { success: false, error: { code: 'BACKUP_IN_PROGRESS', message: 'Backup lain sedang berjalan. Coba lagi setelah selesai.' } },
      { status: 409 },
    )
  }
  backupInFlight = true

  const t0 = Date.now()
  logger.info({ actor: actor.userId }, 'backup: download requested')

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
          backupInFlight = false
          controller.close()
        })
        gzipStream.on('error', (err: Error) => {
          logger.error({ err }, 'backup: stream error')
          backupInFlight = false
          controller.error(err)
        })
      },
      cancel() {
        backupInFlight = false
        gzipStream.destroy()
        nodeReadable.destroy()
      },
    })

    // Audit log — fire-and-forget agar tidak delay streaming response
    void prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action: 'BACKUP_DOWNLOAD',
        entity: 'system',
        ipAddress: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? null,
        userAgent: req.headers.get('user-agent') ?? null,
      },
    }).catch(err => logger.error({ err }, 'backup: failed to write audit log'))

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
    backupInFlight = false
    logger.error({ err }, 'backup: failed')
    return NextResponse.json(
      { success: false, error: { code: 'BACKUP_ERROR', message: 'Gagal membuat backup.' } },
      { status: 500 },
    )
  }
}
