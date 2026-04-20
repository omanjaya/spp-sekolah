/**
 * POST /api/v1/backup/restore
 *
 * Menerima file .json.gz (multipart form-data, field "file"),
 * lalu me-restore semua tabel ke DB.
 *
 * Response: text/event-stream  (SSE)
 * Format event: data: <JSON>\n\n
 *
 * Event types:
 *  - { type: 'progress', table, total, inserted, skipped }
 *  - { type: 'done', summary, ms }
 *  - { type: 'error', message }
 *
 * Akses: hanya SUPER_ADMIN.
 */

import { type NextRequest, NextResponse } from 'next/server'

import { requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { restoreBackup } from '@/services/backup.service'
import logger from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'

// Max 200 MB — file besar tapi aman untuk backup penuh
export const maxDuration = 300 // detik (Vercel/Next limit)

// Hard cap file upload — mencegah gzip-bomb / OOM attack.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024 // 100 MB compressed

export async function POST(req: NextRequest): Promise<Response> {
  await requireRole([ROLES.SUPER_ADMIN])

  // ── Baca file dari multipart ─────────────────────────────────────────
  let fileBuffer: Buffer
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: { code: 'NO_FILE', message: 'Field "file" wajib diisi.' } },
        { status: 400 },
      )
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: `Ukuran file melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
          },
        },
        { status: 413 },
      )
    }
    const arrayBuffer = await file.arrayBuffer()

    // Validasi magic bytes gzip: 1F 8B
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 2))
    if (firstBytes[0] !== 0x1F || firstBytes[1] !== 0x8B) {
      return NextResponse.json(
        { success: false, error: { code: 'INVALID_FILE', message: 'File harus berformat .json.gz (gzip).' } },
        { status: 400 },
      )
    }

    fileBuffer = Buffer.from(arrayBuffer)
  } catch (err) {
    logger.error({ err }, 'restore: failed to read upload')
    return NextResponse.json(
      { success: false, error: { code: 'UPLOAD_ERROR', message: 'Gagal membaca file.' } },
      { status: 400 },
    )
  }

  logger.info({ sizeKB: Math.round(fileBuffer.length / 1024) }, 'restore: file received')

  // ── Stream SSE ───────────────────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of restoreBackup(fileBuffer)) {
          const line = `data: ${JSON.stringify(event)}\n\n`
          controller.enqueue(encoder.encode(line))
        }
      } catch (err) {
        // Jangan leak detail error ke client — bisa bocor struktur DB/SQL.
        logger.error({ err }, 'restore: stream error')
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'Terjadi kesalahan saat memproses backup. Silakan cek log server.' })}\n\n`),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-store, no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}
