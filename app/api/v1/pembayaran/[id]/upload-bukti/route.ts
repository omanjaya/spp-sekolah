/**
 * POST /api/v1/pembayaran/:id/upload-bukti
 *
 * Multipart form-data, field "file" (image/jpeg, image/png, image/webp, application/pdf)
 * Max 5MB.
 *
 * Stores file at: {process.cwd()}/data/uploads/pembayaran/{id}.{ext}
 * Updates Pembayaran.buktiUrl = "uploads/pembayaran/{id}.{ext}"
 *
 * DELETE /api/v1/pembayaran/:id/upload-bukti
 * Removes the file and clears buktiUrl.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { NotFoundError } from '@/core/errors'
import { prisma } from '@/lib/db'
import { AppError, ValidationError } from '@/core/errors'
import { ERROR_CODES, HTTP_STATUS } from '@/core/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

function extFromContentType(contentType: string): string {
  switch (contentType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

// Verifikasi magic bytes — MIME dari browser bisa dipalsukan.
function detectKind(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  )
    return 'image/webp'
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
  )
    return 'application/pdf'
  return null
}

export const POST = apiHandler<unknown, { id: string }>(async (req: NextRequest, ctx) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { id } = await ctx.params

  const pembayaran = await prisma.pembayaran.findUnique({
    where: { id },
    select: { id: true, buktiUrl: true },
  })
  if (!pembayaran) throw new NotFoundError('Pembayaran tidak ditemukan.')

  const formData = await req.formData()
  const file = formData.get('file')

  if (!(file instanceof Blob)) {
    throw new ValidationError('Field "file" wajib diisi dan harus berupa file.')
  }

  if (file.size > MAX_SIZE) {
    throw new ValidationError('Ukuran file maksimal 5 MB.')
  }

  const contentType = file.type
  if (!(ALLOWED_TYPES as readonly string[]).includes(contentType)) {
    throw new ValidationError(
      'Tipe file tidak didukung. Gunakan JPEG, PNG, WebP, atau PDF.',
    )
  }

  // Verifikasi magic bytes — reject kalau isi file tidak sesuai klaim MIME.
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const detected = detectKind(fileBuffer.subarray(0, 16))
  if (!detected || detected !== contentType) {
    throw new ValidationError(
      'Isi file tidak cocok dengan tipe yang diklaim. File mungkin rusak atau dipalsukan.',
    )
  }

  const ext = extFromContentType(contentType)
  const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'pembayaran')
  fs.mkdirSync(uploadDir, { recursive: true })

  const filename = `${id}.${ext}`
  const filepath = path.join(uploadDir, filename)

  // Delete old file if extension changed — path-traversal guard
  if (pembayaran.buktiUrl) {
    const uploadRoot = path.resolve(uploadDir)
    const oldFilepath = path.resolve(path.join(process.cwd(), 'data', pembayaran.buktiUrl))
    if (
      oldFilepath.startsWith(uploadRoot + path.sep) &&
      oldFilepath !== filepath &&
      fs.existsSync(oldFilepath)
    ) {
      try {
        fs.unlinkSync(oldFilepath)
      } catch {
        // ignore
      }
    }
  }

  fs.writeFileSync(filepath, fileBuffer)

  const buktiUrl = `uploads/pembayaran/${filename}`
  await prisma.pembayaran.update({
    where: { id },
    data: { buktiUrl },
  })

  return { buktiUrl }
})

export const DELETE = apiHandler<unknown, { id: string }>(async (_req: NextRequest, ctx) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { id } = await ctx.params

  const pembayaran = await prisma.pembayaran.findUnique({
    where: { id },
    select: { id: true, buktiUrl: true },
  })
  if (!pembayaran) throw new NotFoundError('Pembayaran tidak ditemukan.')

  if (pembayaran.buktiUrl) {
    const uploadRoot = path.resolve(path.join(process.cwd(), 'data', 'uploads', 'pembayaran'))
    const filepath = path.resolve(path.join(process.cwd(), 'data', pembayaran.buktiUrl))
    if (filepath.startsWith(uploadRoot + path.sep)) {
      try {
        fs.unlinkSync(filepath)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new AppError(
            ERROR_CODES.INTERNAL_ERROR,
            'Gagal menghapus file.',
            HTTP_STATUS.INTERNAL_SERVER_ERROR,
          )
        }
      }
    }
  }

  await prisma.pembayaran.update({
    where: { id },
    data: { buktiUrl: null },
  })

  return { message: 'Bukti berhasil dihapus.' }
})
