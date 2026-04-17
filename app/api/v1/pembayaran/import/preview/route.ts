import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { AppError, ValidationError } from '@/core/errors'
import { ERROR_CODES, HTTP_STATUS } from '@/core/constants'
import { getClientIp, uploadLimiter } from '@/lib/rate-limit'
import { importService } from '@/services/import.service'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // some browsers/OS send this for xlsx
])

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  // Rate limit by client IP (not user — an attacker could spoof session, but
  // rate-limiting by user would block legitimate retries).
  const ip = getClientIp(req.headers)
  const rl = uploadLimiter.check(`import:${ip}`)
  if (!rl.allowed) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      'Terlalu banyak upload. Coba lagi beberapa saat.',
      HTTP_STATUS.TOO_MANY_REQUESTS,
    )
  }

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new ValidationError('Content-Type harus multipart/form-data.')
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('Field "file" wajib diisi dengan file Excel.')
  }

  if (file.size === 0) throw new ValidationError('File kosong.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `Ukuran file melebihi batas (${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    )
  }

  const mime = file.type || ''
  const isXlsxName = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
  if (mime && !ALLOWED_MIME.has(mime) && !isXlsxName) {
    throw new ValidationError(`Tipe file tidak didukung: ${mime}.`)
  }

  const buf = new Uint8Array(await file.arrayBuffer())
  return importService.previewExcel({ buffer: buf, name: file.name }, actor)
})
