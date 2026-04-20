/**
 * GET /api/v1/pembayaran/:id/bukti
 * Serves the uploaded payment receipt file (authenticated).
 */

import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { NotFoundError } from '@/core/errors'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function contentTypeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

export const GET = apiHandler<unknown, { id: string }>(async (_req, ctx) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const { id } = await ctx.params

  const pembayaran = await prisma.pembayaran.findUnique({
    where: { id },
    select: { buktiUrl: true },
  })
  if (!pembayaran) throw new NotFoundError('Pembayaran tidak ditemukan.')

  const { buktiUrl } = pembayaran
  if (!buktiUrl) throw new NotFoundError('Bukti bayar belum diunggah.')

  // Guard path traversal — buktiUrl berasal dari DB, tapi kalau suatu saat
  // tercemar (mis. dari restore backup yang tidak tervalidasi), path harus
  // tetap berada di dalam uploadDir.
  const uploadDir = path.resolve(path.join(process.cwd(), 'data', 'uploads', 'pembayaran'))
  const filepath = path.resolve(path.join(process.cwd(), 'data', buktiUrl))
  if (!filepath.startsWith(uploadDir + path.sep)) {
    throw new NotFoundError('File bukti bayar tidak ditemukan.')
  }
  if (!fs.existsSync(filepath)) {
    throw new NotFoundError('File bukti bayar tidak ditemukan.')
  }

  const buffer = fs.readFileSync(filepath)
  const ext = path.extname(buktiUrl).slice(1)
  const contentType = contentTypeFromExt(ext)

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  })
})
