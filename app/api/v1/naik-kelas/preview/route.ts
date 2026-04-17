import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ValidationError } from '@/core/errors'
import { naikKelasService } from '@/services/naik-kelas.service'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

export const POST = apiHandler(async (req: NextRequest) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw new ValidationError('Content-Type harus multipart/form-data.')
  }

  const form = await req.formData()
  const file = form.get('file')
  const tahunAjaranId = form.get('tahunAjaranId')

  if (!(file instanceof File)) {
    throw new ValidationError('Field "file" wajib diisi dengan file Excel.')
  }
  if (!tahunAjaranId || typeof tahunAjaranId !== 'string' || !tahunAjaranId.trim()) {
    throw new ValidationError('Field "tahunAjaranId" wajib diisi.')
  }

  if (file.size === 0) throw new ValidationError('File kosong.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `Ukuran file melebihi batas (${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    )
  }

  const isXlsx =
    file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
  const mime = file.type || ''
  const allowedMime = new Set([
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ])
  if (mime && !allowedMime.has(mime) && !isXlsx) {
    throw new ValidationError(`Tipe file tidak didukung: ${mime}.`)
  }

  const buf = Buffer.from(await file.arrayBuffer())
  return naikKelasService.preview(buf, file.name, tahunAjaranId.trim())
})
